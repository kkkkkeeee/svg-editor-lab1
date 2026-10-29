import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DOMParser } from "@xmldom/xmldom";
import { EditorSession } from "../../src/application/EditorSession.js";
import { CommandDispatcher } from "../../src/application/CommandDispatcher.js";
import { CommandParser } from "../../src/cli/CommandParser.js";
import type { DocumentStore } from "../../src/application/DocumentStore.js";
import { SvgFileStore } from "../../src/infrastructure/SvgFileStore.js";
import { SvgDocument } from "../../src/domain/SvgDocument.js";
import { Text } from "../../src/domain/shapes/Text.js";
import { MemoryDocumentStore } from "./MemoryDocumentStore.js";

function setup(store: DocumentStore) {
  const session = new EditorSession(store);
  const dispatcher = new CommandDispatcher(session); const parser = new CommandParser();
  const run = (line: string) => dispatcher.dispatch(parser.parse(line)!);
  return { session, run };
}
function parse(xml: string) {
  return new DOMParser({onError: (level, message) => { throw new Error(`${level}: ${message}`); }})
    .parseFromString(xml, "application/xml");
}
function directory(t: TestContext): string {
  const path = fs.mkdtempSync(join(tmpdir(), "svg-save-test-"));
  t.after(() => fs.rmSync(path, {recursive: true, force: true}));
  return path;
}

test("M6-B 内存存储：显式/默认路径、摘要数量、成功保存不改变文档", () => {
  const store = new MemoryDocumentStore(); const {session, run} = setup(store);
  run("init"); run("create g g"); run("create rect r 1 2 3 4 in g");
  const before = session.describe();
  assert.equal(run('save "first file.svg"'), "saved to first file.svg (2 elements)");
  assert.deepEqual(session.describe(), before);
  assert.deepEqual(store.documents.get("first file.svg")!.describe(), before);
  run("move r 1 2"); run("save"); assert.equal(store.documents.get("first file.svg")!.find("r")!.describe().attributes.x, 2);
  run("save second.svg"); run("move r 1 0"); run("save");
  assert.equal(store.documents.get("second.svg")!.find("r")!.describe().attributes.x, 3);
  assert.equal(store.documents.get("first file.svg")!.find("r")!.describe().attributes.x, 2);
});

test("M6-B 无文档/无默认路径/空路径/多参数错误；init 成功清路径，失败保留", () => {
  const store = new MemoryDocumentStore(); const {session, run} = setup(store);
  assert.throws(() => run("save x.svg"), {message: "no document. use 'init' or 'read' first"});
  run("init"); assert.throws(() => run("save"), {message: "no save path. specify a file path"});
  for (const line of ['save ""', 'save "   "', "save a b"]) assert.throws(() => run(line));
  assert.equal(store.documents.size, 0);
  run("create g g"); run("save a.svg"); assert.throws(() => run("init 0")); run("save");
  run("canvas 320 200"); run("save"); assert.equal(store.documents.get("a.svg")!.width, 320);
  run("init"); assert.throws(() => run("save"), /no save path/); assert.deepEqual(session.describe().children, []);
});

test("M6-B 保存后禁用、失败编辑不解禁、成功编辑建立新历史起点", () => {
  const {session, run} = setup(new MemoryDocumentStore());
  run("init"); run("create rect r 1 2 3 4"); run("move r 1 1"); run("undo"); run("save a.svg");
  const saved = session.describe();
  for (const action of ["undo", "redo"]) assert.throws(() => run(action), {message: "undo not allowed after io command"});
  assert.throws(() => run("move missing 1 1")); assert.throws(() => run("redo"), /undo not allowed after io command/);
  run("move r 4 5"); run("undo"); assert.deepEqual(session.describe(), saved);
  assert.throws(() => run("undo"), /nothing to undo/); run("redo"); run("save");
  assert.throws(() => run("redo"), /undo not allowed after io command/);
});

test("M6-B 失败存储保留文档/旧路径/redo，适配器无法污染会话", () => {
  const store = new MemoryDocumentStore(); const {session, run} = setup(store);
  run("init"); run("create rect r 1 2 3 4"); run("save old.svg");
  run("move r 10 20"); const after = session.describe(); run("undo"); const before = session.describe();
  store.fail = true;
  assert.throws(() => run("save new.svg"), {message: "cannot write file: new.svg"});
  assert.deepEqual(session.describe(), before); run("redo"); assert.deepEqual(session.describe(), after);
  run("undo"); store.fail = false; run("save");
  assert.equal(store.documents.has("new.svg"), false); assert.deepEqual(store.documents.get("old.svg")!.describe(), before);
  store.fail = true; assert.throws(() => run("save bad.svg"));
  assert.throws(() => run("undo"), /undo not allowed after io command/);
  assert.throws(() => run("redo"), /undo not allowed after io command/);
});

test("M6-B 实际文件保存六类型/嵌套/绘制顺序/UTF-8 和重复覆盖", t => {
  const dir = directory(t); const file = join(dir, "中文 file.svg"); const {session, run} = setup(new SvgFileStore());
  run("init 640 260");
  for (const line of ["create g g", "create g nested in g", "create rect r 1 2 3 4 red in nested",
    "create circle c 5 6 7 in nested", "create ellipse e 1 2 3 4 in g", "create line l 1 2 3 4 black in g",
    'create text t 1 2 "中文 & <文本>" in g', "front r", "back l", "set g stroke-width 2"]) run(line);
  const before = session.describe(); assert.equal(session.save(file), `saved to ${file} (7 elements)`);
  const xml = fs.readFileSync(file, "utf8"); const parsed = parse(xml);
  for (const tag of ["rect", "circle", "ellipse", "line", "text"]) assert.equal(parsed.getElementsByTagName(tag).length, 1);
  assert.equal(parsed.getElementsByTagName("g").length, 2);
  const group = parsed.getElementsByTagName("g")[0];
  const elementIds = (node: typeof group) => Array.from(node.childNodes).filter(n => n.nodeType === 1).map(n => (n as typeof group).getAttribute("id"));
  assert.deepEqual(elementIds(group), ["l", "nested", "e", "t"]);
  assert.deepEqual(elementIds(parsed.getElementsByTagName("g")[1]), ["c", "r"]);
  assert.equal(parsed.getElementsByTagName("text")[0].textContent, "中文 & <文本>");
  assert.deepEqual(session.describe(), before); session.save(); assert.equal(fs.readFileSync(file,"utf8"), xml);
  run("move r 3 4"); session.save(); assert.equal(parse(fs.readFileSync(file,"utf8")).getElementsByTagName("rect")[0].getAttribute("x"), "4");
  assert.deepEqual(fs.readdirSync(dir), ["中文 file.svg"]);
});

test("M6-B 序列化失败：已有文件字节不变、没有临时文件、redo 保留", t => {
  const dir = directory(t); const target = join(dir, "old.svg"); fs.writeFileSync(target, "ORIGINAL", "utf8");
  const {session, run} = setup(new SvgFileStore()); run("init");
  run('create text t 1 2 "bad\u0001"'); run("move t 1 2"); const after = session.describe(); run("undo");
  const before = session.describe();
  assert.throws(() => session.save(target), {message: `cannot write file: ${target}`});
  assert.equal(fs.readFileSync(target, "utf8"), "ORIGINAL"); assert.deepEqual(fs.readdirSync(dir), ["old.svg"]);
  assert.deepEqual(session.describe(), before); run("redo"); assert.deepEqual(session.describe(), after);
  assert.throws(() => session.save(), /no save path/);
  const doc = new SvgDocument(); doc.add(new Text("t",1,2,"\u0000"));
  assert.throws(() => new SvgFileStore().save(doc, join(dir,"absent.svg")), /cannot write file/);
  assert.equal(fs.existsSync(join(dir,"absent.svg")), false);
});

test("M6-B 目录不存在/重命名目标为目录：失败不改状态并清理临时文件", t => {
  const dir = directory(t); const blocked = join(dir, "directory.svg"); fs.mkdirSync(blocked);
  const {session, run} = setup(new SvgFileStore()); run("init"); run("create g g"); run("move g 1 1");
  const after = session.describe(); run("undo"); const before = session.describe();
  for (const file of [join(dir,"missing","x.svg"), blocked]) {
    assert.throws(() => session.save(file), {message: `cannot write file: ${file}`});
    assert.deepEqual(session.describe(),before); run("redo"); assert.deepEqual(session.describe(),after); run("undo");
    assert.deepEqual(fs.readdirSync(dir), ["directory.svg"]);
  }
});

test("M6-B 覆盖现有文件遇到部分写入失败或 rename 失败保留旧文件", t => {
  const dir = directory(t); const target = join(dir,"old.svg"); fs.writeFileSync(target,"ORIGINAL");
  const {session, run} = setup(new SvgFileStore()); run("init"); run("create g g");
  session.save(target);
  const original = fs.readFileSync(target); run("create rect r 1 2 3 4"); const after = session.describe(); run("undo");
  const before = session.describe();
  const realWrite = fs.writeFileSync;
  const writeMock = t.mock.method(fs,"writeFileSync", (...args: Parameters<typeof fs.writeFileSync>) => {
    realWrite(args[0], "PARTIAL"); throw new Error("simulated disk full");
  });
  assert.throws(() => session.save(target), /cannot write file/); writeMock.mock.restore();
  assert.deepEqual(fs.readFileSync(target),original); assert.deepEqual(session.describe(),before);
  run("redo"); assert.deepEqual(session.describe(),after); run("undo");
  const renameMock = t.mock.method(fs,"renameSync", () => { throw new Error("simulated locked target"); });
  assert.throws(() => session.save(target), /cannot write file/); renameMock.mock.restore();
  assert.deepEqual(fs.readFileSync(target),original); assert.deepEqual(session.describe(),before);
  assert.deepEqual(fs.readdirSync(dir),["old.svg"]); run("redo"); assert.deepEqual(session.describe(),after);
});

test("M6-B CLI 多行保存、错误恢复、默认路径和磁盘 XML", t => {
  const dir = directory(t); const entry = fileURLToPath(new URL("../../src/main.ts",import.meta.url));
  const result = spawnSync(process.execPath,["--import","tsx",entry], {
    cwd: fileURLToPath(new URL("../../",import.meta.url)), encoding:"utf8",timeout:10000,
    input:["init",'create text t 20 40 "中文 & <保存>"',`save "${join(dir,"cli.svg").replace(/\\/g,"/")}"`,
      "undo","move missing 1 1","redo","move t 10 0","undo","save","save a b","show t"].join("\n"),
  });
  assert.ifError(result.error); assert.equal(result.status,0,result.stderr);
  assert.equal((result.stdout.match(/undo not allowed after io command/g) ?? []).length,2);
  assert.ok(result.stdout.includes("error: no such shape: missing"));
  assert.ok(result.stdout.includes("error: invalid arguments; usage: save [file.svg]"));
  assert.ok(result.stdout.includes("text#t  parent=svg"));
  const text = parse(fs.readFileSync(join(dir,"cli.svg"),"utf8")).getElementsByTagName("text")[0];
  assert.equal(text.textContent,"中文 & <保存>"); assert.equal(text.getAttribute("x"),"20");
});
