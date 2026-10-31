import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { SvgCodec } from "../../src/infrastructure/SvgCodec.js";
import { SvgFileStore } from "../../src/infrastructure/SvgFileStore.js";
import { EditorSession } from "../../src/application/EditorSession.js";
import { CommandDispatcher } from "../../src/application/CommandDispatcher.js";
import { CommandParser } from "../../src/cli/CommandParser.js";

const codec = new SvgCodec();
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${body}</svg>`;
const text = (content: string) => svg(`<text id="t" x="1" y="2">${content}</text>`);
const invalid: [string, string][] = [
  ["M8-A 裸 &", text("a & b")],
  ["属性裸 &", svg('<text id="t" x="1" y="2" fill="a & b">ok</text>')],
  ["M8-A 普通文本 CDATA 结束符", text("a ]]> b")],
  ["未知实体", text("&missing;")],
  ["零字符引用", text("&#0;")],
  ["代理项引用", text("&#xD800;")],
  ["越界字符引用", text("&#x110000;")],
  ["错误数字引用", text("&#xZZ;")],
  ["缺分号", text("&amp")],
  ["未完成 XML", svg("<g>").slice(0, -6)],
  ["错误嵌套", svg("<g><g></svg></g>")],
  ["DTD 实体声明", '<!DOCTYPE svg [<!ENTITY custom "abc">]>' + text("&custom;")],
  ["外部 DTD", '<!DOCTYPE svg SYSTEM "file:///never-read.dtd">' + svg("")],
  ["未知元素", svg("<path/>")],
  ["未知属性", svg('<g opacity="0.5"/>')],
  ["未知命名空间", svg('<g xmlns="urn:unknown"/>')],
];
for (const [name, xml] of invalid) {
  test(`M8-B 严格拒绝 ${name}`, () => assert.throws(() => codec.deserialize(xml)));
}

for (const [name, content, expected] of [
  ["预定义实体", "中文 &amp; &lt; &gt; &quot; &apos;", "中文 & < > \" '"],
  ["数字引用", "&#38; &#60; &#x3E; &#x1F600;", "& < > 😀"],
  ["合法 CDATA", "<![CDATA[中文 & <tag>]]> &amp; <![CDATA[]]]]><![CDATA[>]]>", "中文 & <tag> & ]]>"],
] as const) {
  test(`M8-B 保留 ${name}并可再次读回`, () => {
    const document = codec.deserialize(text(content)).document;
    assert.equal(document.find("t")!.describe().text, expected);
    assert.deepEqual(codec.deserialize(codec.serialize(document)).document.describe(), document.describe());
  });
}

for (const [name, badXml] of invalid.slice(0, 3)) {
  test(`M8-B ${name}读取失败保留完整文档、路径、redo及 IO 禁用`, t => {
    const directory = fs.mkdtempSync(join(tmpdir(), "svg-strict-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const good = join(directory, "old.svg"), bad = join(directory, "bad.svg");
    fs.writeFileSync(bad, badXml, "utf8");
    const session = new EditorSession(new SvgFileStore());
    const dispatcher = new CommandDispatcher(session), parser = new CommandParser();
    const run = (line: string) => dispatcher.dispatch(parser.parse(line)!);
    for (const line of ["init", "create g outer", "create g inner in outer",
      'create text label 1 2 "中文 & <保留>" in inner', "create rect r 3 4 5 6 red in inner"]) run(line);
    session.save(good);
    run("move outer 10 20"); const moved = session.describe(); run("undo");
    const before = session.describe();
    assert.throws(() => session.read(bad), { message: `cannot read file: ${bad}` });
    assert.deepEqual(session.describe(), before);
    run("redo"); assert.deepEqual(session.describe(), moved);
    run("undo"); assert.deepEqual(session.describe(), before);
    session.save(); // 可观察地证明仍写旧默认路径，而非坏输入路径。
    assert.deepEqual(codec.deserialize(fs.readFileSync(good, "utf8")).document.describe(), before);
    assert.equal(fs.readFileSync(bad, "utf8"), badXml);
    assert.throws(() => session.read(bad), /cannot read file/);
    for (const command of ["undo", "redo"]) assert.throws(() => run(command), { message: "undo not allowed after io command" });
    assert.deepEqual(session.describe(), before);
  });
}

test("M8-B CLI 拒绝两个审计反例后继续执行且不发布自动 ID 警告", t => {
  const directory = fs.mkdtempSync(join(tmpdir(), "svg-strict-cli-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const input = ["init", "create rect old 1 2 3 4", "move old 10 20", "undo"];
  for (const [index, content] of ["a & b", "a ]]> b"].entries()) {
    const path = join(directory, `${index}.svg`);
    fs.writeFileSync(path, text(content).replace(' id="t"', ""));
    input.push(`read "${path.replaceAll("\\", "/")}"`);
  }
  input.push("show old", "redo", "show old");
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/main.ts"], {
    encoding: "utf8", timeout: 15000, input: input.join("\n"),
  });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
  assert.equal((result.stdout.match(/error: cannot read file:/g) ?? []).length, 2);
  assert.doesNotMatch(result.stdout, /warning:|no such shape|undo not allowed/);
  assert.match(result.stdout, /x=1 y=2 width=3 height=4/);
  assert.match(result.stdout, /x=11 y=22 width=3 height=4/);
  assert.match(result.stdout, /redone: rect#old moved by/);
});
