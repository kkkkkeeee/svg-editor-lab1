import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EditorSession } from "../../src/application/EditorSession.js";
import { CommandDispatcher } from "../../src/application/CommandDispatcher.js";
import { CommandParser } from "../../src/cli/CommandParser.js";
import { AddToCommand } from "../../src/application/commands/AddToCommand.js";
import { FrontCommand } from "../../src/application/commands/FrontCommand.js";
import { BackCommand } from "../../src/application/commands/BackCommand.js";

function setup() {
  const session = new EditorSession();
  const dispatcher = new CommandDispatcher(session);
  const parser = new CommandParser();
  const run = (line: string) => dispatcher.dispatch(parser.parse(line)!);
  const ids = (parent?: string) => (parent ? session.snapshot().find(parent)!.children : session.snapshot().children).map(s => s.id);
  run("init");
  return { session, run, ids };
}

test("M5-A addto 容器参数在前，跨父级追加且保持属性", () => {
  const { session, run, ids } = setup();
  for (const line of ["create g a", "create g b", "create rect r 1 2 3 4 red in a",
    "set r stroke-width 2", "create circle c 5 6 7 in b"]) run(line);
  const shape = session.snapshot().find("r")!.describe();
  const before = session.describe();
  assert.equal(run("addto b r"), "rect#r moved into g#b");
  assert.deepEqual(ids("a"), []); assert.deepEqual(ids("b"), ["c", "r"]);
  assert.equal(session.snapshot().getParentId("r"), "b");
  assert.deepEqual(session.snapshot().find("r")!.describe(), shape);
  const after = session.describe();
  run("undo"); assert.deepEqual(session.describe(), before);
  run("redo"); assert.deepEqual(session.describe(), after);
  assert.throws(() => run("create rect r 0 0 1 1"), /id already exists: r/);
});

test("M5-A 嵌套 Group 整棵移动，父级/子树/样式恢复", () => {
  const { session, run, ids } = setup();
  for (const line of ["create g source", "create g subtree in source", "create g inner in subtree",
    'create text t 1 2 "你好" in inner', "set subtree fill red", "create g destination",
    "create g nested in destination", "create line l 1 2 3 4 in nested"]) run(line);
  const subtree = session.snapshot().find("subtree")!.describe();
  const before = session.describe();
  run("addto nested subtree");
  assert.deepEqual(ids("source"), []); assert.deepEqual(ids("nested"), ["l", "subtree"]);
  assert.equal(session.snapshot().getParentId("subtree"), "nested");
  assert.deepEqual(session.snapshot().find("subtree")!.describe(), subtree);
  const after = session.describe();
  run("undo"); assert.deepEqual(session.describe(), before);
  run("redo"); assert.deepEqual(session.describe(), after);
  // 移到祖先合法，移动后只出现一次。
  run("addto destination subtree");
  assert.deepEqual(ids("nested"), ["l"]); assert.deepEqual(ids("destination"), ["nested", "subtree"]);
});

test("M5-A 同父 addto 移到末尾；根图形可移入容器", () => {
  const { run, ids } = setup();
  run("create g g");
  for (const id of ["a", "b", "c"]) run(`create rect ${id} 0 0 10 10 in g`);
  run("addto g a"); assert.deepEqual(ids("g"), ["b", "c", "a"]);
  run("create circle root 1 2 3"); run("addto g root");
  assert.deepEqual(ids(), ["g"]); assert.deepEqual(ids("g"), ["b", "c", "a", "root"]);
});

for (const nested of [false, true]) {
  test(`M5-A front/back ${nested ? "嵌套" : "根层"}兄弟顺序与子树不变`, () => {
    const { session, run, ids } = setup();
    if (nested) { run("create g outer"); run("create g parent in outer"); }
    const suffix = nested ? " in parent" : "";
    run(`create rect a 0 0 10 10 red${suffix}`);
    run(`create g b${suffix}`); run("create circle child 1 2 3 in b");
    run(`create rect c 0 0 10 10 blue${suffix}`);
    const parent = nested ? "parent" : undefined;
    const subtree = session.snapshot().find("b")!.describe();
    const before = session.describe();
    run("front b"); assert.deepEqual(ids(parent), ["a", "c", "b"]);
    assert.equal(session.snapshot().getParentId("b"), parent ?? null);
    assert.deepEqual(session.snapshot().find("b")!.describe(), subtree);
    const front = session.describe();
    run("back b"); assert.deepEqual(ids(parent), ["b", "a", "c"]);
    assert.deepEqual(session.snapshot().find("b")!.describe(), subtree);
    const back = session.describe();
    run("undo"); assert.deepEqual(session.describe(), front);
    run("undo"); assert.deepEqual(session.describe(), before);
    run("redo"); assert.deepEqual(session.describe(), front);
    run("redo"); assert.deepEqual(session.describe(), back);
    // 相互覆盖的矩形 a/c，front a 后 a 在 c 后绘制；back a 后先绘制。
    run("front a"); assert.equal(ids(parent).at(-1), "a");
    run("back a"); assert.equal(ids(parent)[0], "a");
    if (nested) { assert.deepEqual(ids(), ["outer"]); assert.deepEqual(ids("outer"), ["parent"]); }
  });
}

test("M5-A 结构错误/循环/参数错误保留文档及 redo", () => {
  const { session, run } = setup();
  run("create g g"); run("create g inner in g"); run("create rect r 1 2 3 4 in inner");
  run("move r 1 2"); const after = session.describe(); run("undo"); const before = session.describe();
  const cases: [string, string][] = [
    ["addto g missing", "no such shape: missing"], ["addto missing r", "no such container: missing"],
    ["addto r g", "not a container: r"],
    ["addto g g", "cannot move a container into itself or its descendant: g"],
    ["addto inner g", "cannot move a container into itself or its descendant: g"],
    ["front missing", "no such shape: missing"], ["back missing", "no such shape: missing"],
    ["addto g", "invalid arguments; usage: addto <gid> <id>"],
    ["addto g r extra", "invalid arguments; usage: addto <gid> <id>"],
    ["front", "invalid arguments; usage: front <id>"], ["back r extra", "invalid arguments; usage: back <id>"],
  ];
  for (const [line, message] of cases) {
    assert.throws(() => run(line), { message }); assert.deepEqual(session.describe(), before);
    run("redo"); assert.deepEqual(session.describe(), after); run("undo");
  }
});

for (const command of ["addto g r", "front r", "back r"]) {
  test(`M5-A 无效果成功编辑仍记录历史/清空 redo/解除禁用: ${command}`, () => {
    const { session, run } = setup();
    run("create g g"); run("create rect r 1 2 3 4 in g");
    run("move r 1 1"); run("undo"); const before = session.describe();
    run(command); assert.deepEqual(session.describe(), before);
    assert.throws(() => run("redo"), /nothing to redo/);
    run("undo"); assert.deepEqual(session.describe(), before);
    run("redo"); assert.deepEqual(session.describe(), before);
    run("canvas 400 300");
    assert.throws(() => run("front missing"), /no such shape/);
    assert.throws(() => run("undo"), /undo not allowed after io command/);
    run(command); run("undo"); assert.equal(session.describe().width, 400);
    assert.throws(() => run("undo"), /nothing to undo/);
  });
}

test("M5-A 混合创建/移动/删除/归属/排序历史完整恢复", () => {
  const { session, run } = setup();
  const states = [session.describe()];
  for (const line of ["create g g", "create rect a 1 2 3 4", "create circle b 1 2 3 in g",
    "move a 1 2", "addto g a", "front b", "back b", "delete g"]) {
    run(line); states.push(session.describe());
  }
  for (let i = states.length - 2; i >= 0; i--) { run("undo"); assert.deepEqual(session.describe(), states[i]); }
  for (let i = 1; i < states.length; i++) { run("redo"); assert.deepEqual(session.describe(), states[i]); }
});

test("M5-A 命令复用不缓存父级，恢复后仍有具体类行为", () => {
  const { session, run, ids } = setup();
  run("create g a"); run("create g b"); run("create rect r 1 2 3 4 in a");
  const front = new FrontCommand("r"); const back = new BackCommand("r"); const add = new AddToCommand("b", "r");
  session.execute(add); run("undo"); session.execute(add);
  run("create circle sibling 1 2 3 in b"); session.execute(front);
  assert.deepEqual(ids("b"), ["sibling", "r"]);
  session.execute(back); assert.deepEqual(ids("b"), ["r", "sibling"]);
  run("undo"); run("redo"); run("scale r 2");
  assert.equal(session.snapshot().find("r")!.describe().attributes.width, 6);
});

test("M5-A 真实 CLI 回放树结构、撤销重做与错误恢复", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/main.ts"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8", timeout: 10_000,
    input: ["init", "create g g", "create rect a 0 0 10 10 red", "create circle b 1 2 3 in g",
      "addto g a", "front b", "tree", "back b", "undo", "redo", "addto g g", "tree", "help"].join("\n"),
  });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("├── rect#a  x=0 y=0 width=10 height=10 fill=red\n    └── circle#b  cx=1 cy=2 r=3"));
  assert.ok(result.stdout.includes("├── circle#b  cx=1 cy=2 r=3\n    └── rect#a  x=0 y=0 width=10 height=10 fill=red"));
  assert.ok(result.stdout.includes("undone: circle#b sent to back"));
  assert.ok(result.stdout.includes("redone: circle#b sent to back"));
  assert.ok(result.stdout.includes("error: cannot move a container into itself or its descendant: g"));
  for (const name of ["addto", "front", "back"]) assert.ok(result.stdout.includes(`[已实现] ${name}`));
});
