import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EditorSession } from "../../src/application/EditorSession.js";
import { CommandDispatcher } from "../../src/application/CommandDispatcher.js";
import { CommandParser } from "../../src/cli/CommandParser.js";
import { DeleteCommand } from "../../src/application/commands/DeleteCommand.js";
import { Group } from "../../src/domain/shapes/Group.js";
import { Rect } from "../../src/domain/shapes/Rect.js";

function setup() {
  const session = new EditorSession();
  const dispatcher = new CommandDispatcher(session);
  const parser = new CommandParser();
  const run = (line: string) => dispatcher.dispatch(parser.parse(line)!);
  run("init");
  return { session, run };
}

test("M4-B 删除叶子恢复根级兄弟顺序，连续 undo/redo", () => {
  const { session, run } = setup();
  for (const id of ["a", "b", "c"]) run(`create rect ${id} 1 2 3 4`);
  run("set b stroke-width 2");
  const before = session.describe();
  assert.equal(run("delete b"), "rect#b deleted");
  assert.deepEqual(session.describe().children.map(s => s.id), ["a", "c"]);
  const after = session.describe();
  for (let i = 0; i < 3; i++) {
    run("undo"); assert.deepEqual(session.describe(), before);
    assert.equal(session.snapshot().getParentId("b"), null);
    run("redo"); assert.deepEqual(session.describe(), after);
  }
});

test("M4-B 删除嵌套子树是单个单元，恢复父级/顺序/样式/实际类", () => {
  const { session, run } = setup();
  for (const line of ["create g outer", "create circle before 1 2 3 in outer", "create g target in outer",
    "create g inner in target", "create rect r 1 2 3 4 red in inner",
    'create text t 5 6 "你好 World" in target', "create ellipse after 1 2 3 4 in outer",
    "set target stroke blue", "set r stroke-width 2.5"]) run(line);
  const before = session.describe();
  assert.equal(run("delete target"), "g#target deleted");
  const after = session.describe();
  for (const id of ["target", "inner", "r", "t"]) assert.equal(session.snapshot().find(id), undefined);
  run("undo"); assert.deepEqual(session.describe(), before);
  const copy = session.snapshot();
  assert.equal(copy.getParentId("target"), "outer");
  assert.deepEqual(copy.find("outer")!.children.map(s => s.id), ["before", "target", "after"]);
  assert.ok(copy.find("target") instanceof Group); assert.ok(copy.find("r") instanceof Rect);
  copy.move("target", 10, 20);
  assert.equal(copy.find("r")!.describe().attributes.x, 11);
  assert.deepEqual(session.describe(), before);
  run("redo"); assert.deepEqual(session.describe(), after);
  run("undo"); run("move target 1 2");
  assert.equal(session.snapshot().find("r")!.describe().attributes.x, 2);
});

test("M4-B 失败删除及参数错误保留 redo，成功删除清空 redo", () => {
  const { session, run } = setup();
  run("create rect r 1 2 3 4"); run("move r 1 1");
  const moved = session.describe(); run("undo"); const before = session.describe();
  for (const line of ["delete missing", "delete", "delete r extra"]) {
    assert.throws(() => run(line), line === "delete missing" ? /no such shape: missing/ : /usage: delete/);
    assert.deepEqual(session.describe(), before);
    run("redo"); assert.deepEqual(session.describe(), moved); run("undo");
  }
  run("delete r"); assert.throws(() => run("redo"), /nothing to redo/);
});

test("M4-B 删除后复用 id，命令不缓存旧对象", () => {
  const { session, run } = setup();
  run("create g r"); run("create circle child 1 2 3 in r");
  const old = session.describe();
  const command = new DeleteCommand("r");
  session.execute(command);
  run("create rect r 10 20 30 40");
  assert.equal(session.execute(command), "rect#r deleted");
  run("undo"); assert.ok(session.snapshot().find("r") instanceof Rect);
  run("undo"); assert.equal(session.snapshot().find("r"), undefined);
  run("undo"); assert.deepEqual(session.describe(), old);
});

test("M4-B 五类编辑共享同一历史并可连续恢复", () => {
  const { session, run } = setup();
  const states = [session.describe()];
  for (const line of ["create rect r 1 2 3 4", "move r 1 2", "scale r 2", "set r fill blue", "delete r"]) {
    run(line); states.push(session.describe());
  }
  for (let i = 4; i >= 0; i--) { run("undo"); assert.deepEqual(session.describe(), states[i]); }
  for (let i = 1; i <= 5; i++) { run("redo"); assert.deepEqual(session.describe(), states[i]); }
});

test("M4-B canvas 默认查询不改变禁用、undo 或 redo", () => {
  const { session, run } = setup();
  assert.equal(run("canvas"), "canvas 800x600");
  assert.throws(() => run("undo"), /undo not allowed after io command/);
  run("create rect r 1 2 3 4"); const before = session.describe();
  run("canvas"); assert.deepEqual(session.describe(), before);
  run("undo"); run("canvas"); run("redo");
  assert.deepEqual(session.describe(), before);
});

test("M4-B canvas 修改保留整树、清空历史和 redo；新编辑不能跨越边界", () => {
  const { session, run } = setup();
  run("create g g"); run("create rect r 1 2 3 4 in g"); run("set g fill red");
  run("move g 10 20"); run("undo");
  const children = session.describe().children;
  assert.equal(run("canvas 320.5 2e2"), "canvas 320.5x200 resized");
  assert.equal(run("canvas"), "canvas 320.5x200");
  assert.deepEqual(session.describe().children, children);
  for (const cmd of ["undo", "redo"]) assert.throws(() => run(cmd), { message: "undo not allowed after io command" });
  for (const line of ["delete missing", "move r NaN 1", "scale r 0", "set r id new", "create rect r 1 2 3 4"]) {
    assert.throws(() => run(line));
    assert.throws(() => run("redo"), /undo not allowed after io command/);
  }
  const resized = session.describe(); run("delete g"); run("undo");
  assert.deepEqual(session.describe(), resized);
  assert.throws(() => run("undo"), /nothing to undo/);
  run("redo"); assert.deepEqual(session.describe().children, []);
  assert.throws(() => run("redo"), /nothing to redo/);
});

test("M4-B 非法尺寸/参数保留 redo 及完整状态", () => {
  const { session, run } = setup();
  run("create rect r 1 2 3 4"); run("move r 1 1");
  const after = session.describe(); run("undo"); const before = session.describe();
  const invalid = ["0", "-1", "Infinity", "NaN", "1e999", "0x10", '""', "bad"];
  for (const line of ["canvas 100", "canvas 1 2 3", ...invalid.flatMap(n => [`canvas ${n} 100`, `canvas 100 ${n}`])]) {
    assert.throws(() => run(line)); assert.deepEqual(session.describe(), before);
    run("redo"); assert.deepEqual(session.describe(), after); run("undo");
  }
  assert.throws(() => run("canvas 100"), { message: "invalid arguments; usage: canvas [w h]" });
  // 直接调用会话 API 也必须沿用领域校验，而非只依靠 CLI。
  for (const [w, h] of [[NaN, 1], [1, Infinity], [0, 1], [1, -2]]) {
    assert.throws(() => session.resizeCanvas(w, h), /finite positive/);
    assert.deepEqual(session.describe(), before);
  }
  run("redo"); assert.deepEqual(session.describe(), after);
});

test("M4-B 同尺寸修改仍触发 IO 边界，失败修改不解除禁用，init 规则不变", () => {
  const { session, run } = setup();
  run("create g g"); run("canvas 800 600");
  assert.throws(() => run("undo"), /undo not allowed after io command/);
  assert.throws(() => run("canvas 100"), /usage/);
  assert.throws(() => run("canvas 0 100"), /finite positive/);
  assert.throws(() => run("undo"), /undo not allowed after io command/);
  run("init 300"); assert.equal(run("canvas"), "canvas 300x600");
  assert.deepEqual(session.describe().children, []);
  assert.throws(() => run("redo"), /undo not allowed after io command/);
});

test("M4-B 无文档时 delete/canvas 和会话 resize 均拒绝", () => {
  const session = new EditorSession(); const dispatcher = new CommandDispatcher(session);
  for (const request of [{ name: "delete", args: ["r"] }, { name: "canvas", args: [] }, { name: "canvas", args: ["1", "2"] }]) {
    assert.throws(() => dispatcher.dispatch(request), { message: "no document. use 'init' or 'read' first" });
  }
  assert.throws(() => session.resizeCanvas(1, 2), /no document/);
});

test("M4-B 真实 REPL 删除/恢复/画布边界与错误后继续", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/main.ts"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8", timeout: 10_000,
    input: ["init", "canvas", "create g scene", "create rect r 1 2 3 4 in scene", "delete scene",
      "undo", "show r", "redo", "undo", "canvas 400 300", "undo", "delete missing", "redo",
      "canvas 100", "canvas", "delete r", "undo", "show r", "help", "save"].join("\n"),
  });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
  for (const text of ["canvas 800x600", "g#scene deleted", "undone: g#scene deleted", "redone: g#scene deleted",
    "rect#r  parent=g#scene", "canvas 400x300 resized", "error: undo not allowed after io command",
    "error: no such shape: missing", "error: invalid arguments; usage: canvas [w h]", "rect#r deleted",
    "undone: rect#r deleted", "[已实现] delete", "[已实现] canvas [w h]", "error: no save path. specify a file path"]) {
    assert.ok(result.stdout.includes(text), result.stdout);
  }
  assert.equal(result.stdout.split("error: undo not allowed after io command").length - 1, 2);
});
