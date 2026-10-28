import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EditorSession } from "../../src/application/EditorSession.js";
import { CommandDispatcher } from "../../src/application/CommandDispatcher.js";
import { CommandParser } from "../../src/cli/CommandParser.js";
import { GroupCommand } from "../../src/application/commands/GroupCommand.js";
import { UngroupCommand } from "../../src/application/commands/UngroupCommand.js";
import { Group } from "../../src/domain/shapes/Group.js";
import { Rect } from "../../src/domain/shapes/Rect.js";
import { Text } from "../../src/domain/shapes/Text.js";

function setup(lines: string[] = []) {
  const session = new EditorSession();
  const dispatcher = new CommandDispatcher(session);
  const parser = new CommandParser();
  const run = (line: string) => dispatcher.dispatch(parser.parse(line)!);
  const ids = (parent?: string) => (parent ? session.snapshot().find(parent)!.children : session.snapshot().children).map(s => s.id);
  run("init");
  for (const line of lines) run(line);
  return { session, run, ids };
}

for (const nested of [false, true]) {
  for (const adjacent of [false, true]) {
    test(`M5-B 同父分组 ${nested ? "嵌套" : "根层"} ${adjacent ? "相邻" : "不相邻"}，逆序参数不改变文档顺序`, () => {
      const { session, run, ids } = setup(nested ? ["create g parent"] : []);
      for (const id of ["before", "a", "b", "c", "after"]) run(`create rect ${id} 1 2 3 4 red${nested ? " in parent" : ""}`);
      const before = session.describe();
      const second = adjacent ? "b" : "c";
      const descriptions = ["a", second].map(id => session.snapshot().find(id)!.describe());
      assert.equal(run(`group new ${second} a`), "g#new created with 2 children");
      assert.deepEqual(ids(nested ? "parent" : undefined), ["before", "new", adjacent ? "c" : "b", "after"]);
      assert.deepEqual(ids("new"), ["a", second]);
      assert.equal(session.snapshot().getParentId("new"), nested ? "parent" : null);
      assert.equal(session.snapshot().getParentId("a"), "new");
      assert.deepEqual(session.snapshot().find("new")!.describe().children, descriptions);
      assert.deepEqual(session.snapshot().find("new")!.describe().attributes, {});
      const after = session.describe();
      run("undo"); assert.deepEqual(session.describe(), before);
      run("redo"); assert.deepEqual(session.describe(), after);
    });
  }
}

test("M5-B 跨父按深度优先顺序收编，追加根末尾并保留嵌套子树", () => {
  const { session, run, ids } = setup(["create g p", "create g nested in p", 'create text t 2 3 "中文 文本" in nested',
    "set nested fill red", "create g q", "create rect r 1 2 3 4 blue in q", "create circle tail 1 2 3"]);
  const nested = session.snapshot().find("nested")!.describe();
  const rect = session.snapshot().find("r")!.describe();
  const before = session.describe();
  run("group collection r nested");
  assert.deepEqual(ids(), ["p", "q", "tail", "collection"]);
  assert.deepEqual(ids("p"), []); assert.deepEqual(ids("q"), []);
  assert.deepEqual(ids("collection"), ["nested", "r"]);
  assert.equal(session.snapshot().getParentId("collection"), null);
  assert.equal(session.snapshot().getParentId("nested"), "collection");
  assert.deepEqual(session.snapshot().find("nested")!.describe(), nested);
  assert.deepEqual(session.snapshot().find("r")!.describe(), rect);
  assert.deepEqual(session.snapshot().find("collection")!.describe().attributes, {});
  const after = session.describe();
  run("undo"); assert.deepEqual(session.describe(), before);
  run("redo"); assert.deepEqual(session.describe(), after);
  assert.ok(session.snapshot().find("nested") instanceof Group);
  assert.ok(session.snapshot().find("t") instanceof Text);
  run("move collection 1 1"); assert.equal(session.snapshot().find("t")!.describe().attributes.x, 3);
});

test("M5-B 单成员合法、ID 大小写敏感、命令复制成员参数且可复用", () => {
  const { session, run, ids } = setup(["create rect a 1 2 3 4"]);
  const input = ["a"];
  const command = new GroupCommand("A", input);
  input[0] = "missing";
  session.execute(command); assert.deepEqual(ids("A"), ["a"]);
  run("undo"); session.execute(command); assert.deepEqual(ids("A"), ["a"]);
  run("undo"); run("move a 2 3"); session.execute(command);
  assert.equal(session.snapshot().find("a")!.describe().attributes.x, 3);
  assert.throws(() => run("redo"), /nothing to redo/);
});

test("M5-B group 所有非法参数/祖先后代选择均保留完整文档及真实 redo", () => {
  const { session, run } = setup(["create g p", "create g inner in p", "create rect r 1 2 3 4 in inner", "move r 1 2"]);
  const after = session.describe(); run("undo"); const before = session.describe();
  const cases: [string, string][] = [
    ["group", "invalid arguments; usage: group <newGid> <id1> <id2>…"],
    ["group new", "invalid arguments; usage: group <newGid> <id1> <id2>…"],
    ['group "" r', "id must be non-empty and contain no whitespace"],
    ["group r inner", "id already exists: r"],
    ["group new r missing", "no such shape: missing"],
    ["group new r r", "duplicate group member: r"],
    ["group new r p", "cannot group a container into its own descendant: p"],
    ["group new p r", "cannot group a container into its own descendant: p"],
    ["group new inner p", "cannot group a container into its own descendant: p"],
  ];
  for (const [line, message] of cases) {
    assert.throws(() => run(line), { message }); assert.deepEqual(session.describe(), before);
    run("redo"); assert.deepEqual(session.describe(), after); run("undo");
  }
});

test("M5-B 领域 group/ungroup 直接调用也具备失败原子性", () => {
  const { session } = setup(["create g p", "create g inner in p", "create rect r 1 2 3 4 in inner"]);
  const document = session.snapshot(); const before = document.describe();
  for (const action of [() => document.group("new", []), () => document.group("new", ["r", "missing"]),
    () => document.group("new", ["r", "r"]), () => document.group("new", ["r", "p"]),
    () => document.ungroup("p"), () => document.ungroup("r"), () => document.ungroup("missing")]) {
    assert.throws(action); assert.deepEqual(document.describe(), before);
  }
  document.group("new", ["r"]); assert.equal(document.getParentId("new"), "inner");
  document.ungroup("new"); assert.deepEqual(document.describe(), before);
});

test("M5-B ungroup 原位提升，保留类型/文本/显式样式/嵌套顺序，继承样式不物化", () => {
  const { session, run, ids } = setup(["create g p", "set p fill blue", "create circle before 0 0 1 in p",
    "create g inner in p", "set inner fill red", "set inner stroke black", "create rect r 1 2 3 4 in inner",
    "create g nested in inner", 'create text t 5 6 "中文 文本" in nested', "set t fill green",
    "create line after 1 2 3 4 in p"]);
  const before = session.describe();
  const children = session.snapshot().find("inner")!.describe().children!;
  const command = new UngroupCommand("inner");
  assert.equal(session.execute(command), "g#inner ungrouped");
  assert.deepEqual(ids("p"), ["before", "r", "nested", "after"]);
  assert.equal(session.snapshot().find("inner"), undefined);
  for (const child of children) {
    assert.equal(session.snapshot().getParentId(child.id), "p");
    assert.deepEqual(session.snapshot().find(child.id)!.describe(), child);
  }
  assert.equal(session.snapshot().getParentId("t"), "nested");
  assert.equal(Object.hasOwn(session.snapshot().find("r")!.describe().attributes, "fill"), false);
  const after = session.describe();
  run("undo"); assert.deepEqual(session.describe(), before);
  run("redo"); assert.deepEqual(session.describe(), after);
  assert.ok(session.snapshot().find("r") instanceof Rect);
  assert.ok(session.snapshot().find("t") instanceof Text);
  run("undo"); session.execute(command); assert.deepEqual(session.describe(), after);
});

test("M5-B 空嵌套组解散只删除自身并可撤销", () => {
  const { session, run, ids } = setup(["create g p", "create g before in p", "create g empty in p", "create g after in p"]);
  const before = session.describe(); run("ungroup empty");
  assert.deepEqual(ids("p"), ["before", "after"]);
  const after = session.describe(); run("undo"); assert.deepEqual(session.describe(), before);
  run("redo"); assert.deepEqual(session.describe(), after);
});

test("M5-B ungroup 错误精确匹配且保留 redo", () => {
  const { session, run } = setup(["create g root", "create rect r 1 2 3 4 in root", "move r 1 2"]);
  const after = session.describe(); run("undo"); const before = session.describe();
  for (const [line, message] of [
    ["ungroup root", "cannot ungroup top-level container: root"],
    ["ungroup r", "not a container: r"], ["ungroup missing", "no such shape: missing"],
    ["ungroup", "invalid arguments; usage: ungroup <gid>"],
    ["ungroup root r", "invalid arguments; usage: ungroup <gid>"],
  ]) {
    assert.throws(() => run(line), { message }); assert.deepEqual(session.describe(), before);
    run("redo"); assert.deepEqual(session.describe(), after); run("undo");
  }
});

test("M5-B group/ungroup 与归属/排序/删除/移动混合历史逐步恢复", () => {
  const { session, run } = setup(); const states = [session.describe()];
  for (const line of ["create g p", "create rect a 1 2 3 4 in p", "create circle b 4 5 6 in p",
    "group inner b a", "move inner 1 2", "create g q", "addto q inner", "create g tail in q",
    "front inner", "back inner", "ungroup inner", "group new b a", "delete new",
    "create text new 1 2 replacement"]) {
    run(line); states.push(session.describe());
  }
  for (let i = states.length - 2; i >= 0; i--) { run("undo"); assert.deepEqual(session.describe(), states[i]); }
  for (let i = 1; i < states.length; i++) { run("redo"); assert.deepEqual(session.describe(), states[i]); }
  run("undo"); run("undo"); // 恢复同名 Group，而非后来创建的 Text。
  assert.ok(session.snapshot().find("new") instanceof Group);
  run("move new 10 20"); assert.equal(session.snapshot().find("a")!.describe().attributes.x, 12);
  assert.throws(() => run("redo"), /nothing to redo/);
});

for (const command of ["group new a", "ungroup inner"]) {
  test(`M5-B 成功 ${command} 清空 redo 并在 IO 后恢复撤销能力`, () => {
    const { session, run } = setup(["create g p", "create g inner in p", "create rect a 1 2 3 4 in inner"]);
    run("move a 1 1"); run("undo"); run(command);
    assert.throws(() => run("redo"), /nothing to redo/); run("undo");
    run("canvas 123 456"); const before = session.describe();
    assert.throws(() => run("group bad inner a"), /cannot group/);
    assert.throws(() => run("ungroup p"), /cannot ungroup top-level/);
    assert.deepEqual(session.describe(), before);
    assert.throws(() => run("undo"), /undo not allowed after io command/);
    run(command); run("undo"); assert.deepEqual(session.describe(), before);
    assert.throws(() => run("undo"), /nothing to undo/);
  });
}

test("M5-B 真实 CLI 多行、两种闭环、课程错误及错误后继续", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/main.ts"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8", timeout: 10_000,
    input: ["init", "create g p", "create rect a 1 2 3 4 in p", 'create text t 5 6 "你好 世界" in p',
      "group inner t a", "tree", "undo", "redo", "group bad a inner", "ungroup p", "ungroup inner",
      "tree", "undo", "redo", "show a", "help"].join("\n"),
  });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, "");
  assert.ok(result.stdout.includes('└── g#inner\n        ├── rect#a  x=1 y=2 width=3 height=4\n        └── text#t  x=5 y=6 text="你好 世界"'));
  assert.ok(result.stdout.includes('├── rect#a  x=1 y=2 width=3 height=4\n    └── text#t  x=5 y=6 text="你好 世界"'));
  for (const text of ["undone: g#inner created with 2 children", "redone: g#inner created with 2 children",
    "error: cannot group a container into its own descendant: inner", "error: cannot ungroup top-level container: p",
    "undone: g#inner ungrouped", "redone: g#inner ungrouped", "rect#a  parent=g#p",
    "[已实现] group", "[已实现] ungroup"]) assert.ok(result.stdout.includes(text), text);
});
