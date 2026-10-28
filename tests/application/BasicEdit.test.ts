import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EditorSession } from "../../src/application/EditorSession.js";
import { CommandDispatcher } from "../../src/application/CommandDispatcher.js";
import { CommandParser } from "../../src/cli/CommandParser.js";
import { MoveCommand } from "../../src/application/commands/MoveCommand.js";
import { ScaleCommand } from "../../src/application/commands/ScaleCommand.js";
import { SetCommand } from "../../src/application/commands/SetCommand.js";

function setup() {
  const session = new EditorSession();
  const dispatcher = new CommandDispatcher(session);
  const parser = new CommandParser();
  const run = (line: string) => dispatcher.dispatch(parser.parse(line)!);
  run("init");
  const attrs = (id: string) => session.snapshot().find(id)!.describe().attributes;
  return { session, run, attrs };
}

const leaves = [
  { type: "rect", params: "1 2 3 4", moved: { x: -1.5, y: 2.25, width: 3, height: 4 }, scaled: { x: .5, y: 1, width: 1.5, height: 2 }, keys: ["x", "y", "width", "height"] },
  { type: "circle", params: "1 2 3", moved: { cx: -1.5, cy: 2.25, r: 3 }, scaled: { cx: .5, cy: 1, r: 1.5 }, keys: ["cx", "cy", "r"] },
  { type: "ellipse", params: "1 2 3 4", moved: { cx: -1.5, cy: 2.25, rx: 3, ry: 4 }, scaled: { cx: .5, cy: 1, rx: 1.5, ry: 2 }, keys: ["cx", "cy", "rx", "ry"] },
  { type: "line", params: "1 2 3 4", moved: { x1: -1.5, y1: 2.25, x2: .5, y2: 4.25 }, scaled: { x1: .5, y1: 1, x2: 1.5, y2: 2 }, keys: ["x1", "y1", "x2", "y2"] },
  { type: "text", params: '1 2 "original"', moved: { x: -1.5, y: 2.25 }, scaled: { x: .5, y: 1 }, keys: ["x", "y"] },
];

for (const leaf of leaves) {
  test(`M4-A ${leaf.type}: 负数/浮点移动、缩放与完整历史`, () => {
    const { session, run, attrs } = setup();
    run(`create ${leaf.type} s ${leaf.params}`);
    const before = session.describe();
    run("move s -2.5 .25");
    assert.deepEqual(attrs("s"), leaf.moved);
    const moved = session.describe();
    run("undo"); assert.deepEqual(session.describe(), before);
    run("redo"); assert.deepEqual(session.describe(), moved);
    run("undo"); run("scale s 5e-1");
    assert.deepEqual(attrs("s"), leaf.scaled);
    const scaled = session.describe();
    run("undo"); assert.deepEqual(session.describe(), before);
    run("redo"); assert.deepEqual(session.describe(), scaled);
  });

  test(`M4-A ${leaf.type}: 全部几何和公共样式白名单`, () => {
    const { session, run, attrs } = setup();
    run(`create ${leaf.type} s ${leaf.params}`);
    for (const key of leaf.keys) {
      const before = session.describe();
      run(`set s ${key} 12.5`);
      assert.equal(attrs("s")[key], 12.5);
      assert.equal(typeof attrs("s")[key], "number");
      const after = session.describe();
      run("undo"); assert.deepEqual(session.describe(), before);
      run("redo"); assert.deepEqual(session.describe(), after);
    }
    run('set s fill "  red  "'); run("set s stroke #ffffff"); run("set s stroke-width 2.5");
    assert.equal(attrs("s").fill, "  red  ");
    assert.equal(attrs("s").stroke, "#ffffff");
    assert.equal(attrs("s")["stroke-width"], 2.5);
    const before = session.describe();
    for (const attr of ["id", "transform", "font-size", "label", "__proto__", "constructor", "w"]) {
      assert.throws(() => run(`set s ${attr} 10`), { message: `unknown attribute: ${attr}` });
      assert.deepEqual(session.describe(), before);
    }
  });
}

test("M4-A Group: 嵌套与所有叶子多态移动/缩放，保持顺序和样式", () => {
  const { session, run, attrs } = setup();
  run("create g outer"); run("create g inner in outer");
  for (const leaf of leaves) run(`create ${leaf.type} ${leaf.type} ${leaf.params} in inner`);
  run("set outer fill blue"); run("set inner stroke black"); run("set outer stroke-width 3");
  run("set rect fill red");
  const before = session.describe();
  run("move outer -2.5 .25");
  for (const leaf of leaves) assert.deepEqual(attrs(leaf.type), { ...leaf.moved, ...(leaf.type === "rect" ? { fill: "red" } : {}) });
  run("undo"); assert.deepEqual(session.describe(), before);
  run("scale outer .5");
  for (const leaf of leaves) assert.deepEqual(attrs(leaf.type), { ...leaf.scaled, ...(leaf.type === "rect" ? { fill: "red" } : {}) });
  assert.deepEqual(attrs("outer"), { fill: "blue", "stroke-width": 3 });
  assert.deepEqual(attrs("inner"), { stroke: "black" });
  assert.deepEqual(session.snapshot().find("inner")!.children.map(child => child.id), leaves.map(leaf => leaf.type));
  const after = session.describe();
  run("undo"); assert.deepEqual(session.describe(), before);
  run("redo"); assert.deepEqual(session.describe(), after);
  for (const attr of ["width", "x", "text"]) assert.throws(() => run(`set outer ${attr} invalid`), { message: `unknown attribute: ${attr}` });
});

test("M4-A text: 中文、空格、空文本、数字文本保持字符串", () => {
  const { session, run } = setup();
  run('create text t 1 2 "original"');
  for (const value of ["你好 世界", "", "123", "  #ffffff  "]) {
    const before = session.describe();
    run(`set t text "${value}"`);
    assert.equal(session.snapshot().find("t")!.describe().text, value);
    const after = session.describe();
    run("undo"); assert.deepEqual(session.describe(), before);
    run("redo"); assert.deepEqual(session.describe(), after);
  }
});

test("M4-A 非法数字/参数/属性/目标：不改变文档和已有 redo", () => {
  const { session, run } = setup();
  run("create rect r 1 2 3 4"); run("move r 1 2");
  const after = session.describe(); run("undo");
  const before = session.describe();
  const invalid = ["", "NaN", "Infinity", "-Infinity", "1e999", "0x10", "2px", " 2 "];
  const lines = invalid.flatMap(value => [
    `move r "${value}" 1`, `move r 1 "${value}"`, `scale r "${value}"`,
    `set r x "${value}"`, `set r stroke-width "${value}"`,
  ]);
  lines.push("scale r 0", "scale r -2", "set r width -1", "set r stroke-width -1",
    'set r fill ""', 'set r stroke " "', "set r cx 2", "set r text hi", "set r id new",
    "move missing 1 2", "scale missing 2", "set missing fill red",
    "move r 1", "move r 1 2 3", "scale r", "scale r 1 2", "set r fill", "set r fill red extra");
  for (const line of lines) {
    assert.throws(() => run(line), Error, line);
    assert.deepEqual(session.describe(), before, line);
    run("redo"); assert.deepEqual(session.describe(), after, line);
    run("undo");
  }
  assert.throws(() => run("scale r 0"), { message: "scale factor must be positive" });
  for (const line of ["move missing 1 2", "scale missing 2", "set missing fill red"]) {
    assert.throws(() => run(line), { message: "no such shape: missing" });
  }
});

for (const operation of ["move outer 1e308 0", "scale outer 2"]) {
  test(`M4-A 后代溢出原子性及 redo: ${operation}`, () => {
    const { session, run } = setup();
    run("create g outer"); run("create rect first 1 2 3 4 in outer");
    run("create g inner in outer"); run("create circle last 1e308 0 1 in inner");
    run("set first fill red"); const after = session.describe(); run("undo");
    const before = session.describe();
    assert.throws(() => run(operation), /finite/);
    assert.deepEqual(session.describe(), before);
    run("redo"); assert.deepEqual(session.describe(), after);
  });
}

test("M4-A 多次编辑逐步恢复，新编辑分别清空 redo", () => {
  const { session, run } = setup();
  run("create rect r 1 2 3 4");
  const states = [session.describe()];
  for (const line of ["move r -1 3", "scale r 2", "set r fill red"]) {
    run(line); states.push(session.describe());
  }
  for (let i = 2; i >= 0; i--) { run("undo"); assert.deepEqual(session.describe(), states[i]); }
  for (let i = 1; i <= 3; i++) { run("redo"); assert.deepEqual(session.describe(), states[i]); }
  for (const line of ["move r 1 1", "scale r .5", "set r stroke blue"]) {
    run("undo"); run(line);
    assert.throws(() => run("redo"), /nothing to redo/);
  }
});

test("M4-A 独立命令复用：恢复后按 id 编辑，数值 API 也拒绝非法值", () => {
  const { session, run, attrs } = setup();
  run("create rect r 1 2 3 4");
  const move = new MoveCommand("r", 1, 2);
  session.execute(move); run("undo"); session.execute(move);
  assert.equal(attrs("r").x, 2);
  session.execute(new ScaleCommand("r", 2));
  session.execute(new SetCommand("r", "width", "10"));
  assert.equal(attrs("r").width, 10);
  const before = session.describe();
  for (const command of [new MoveCommand("r", NaN, 0), new MoveCommand("r", 0, Infinity), new ScaleCommand("r", Infinity), new ScaleCommand("r", 0)]) {
    assert.throws(() => session.execute(command));
    assert.deepEqual(session.describe(), before);
  }
  run("init");
  assert.throws(() => session.execute(move), /no such shape/);
  assert.throws(() => run("undo"), /undo not allowed after io command/);
  run("create rect r 10 20 30 40"); session.execute(move);
  assert.equal(attrs("r").x, 11);
});

test("M4-A 真实 CLI 多行会话：三种编辑、错误恢复及历史", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/main.ts"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8", timeout: 10_000,
    input: ["init", "create g scene", "create rect r 10 20 100 50 red in scene",
      'create text t 20 40 "旧文本" in scene', "move scene -5 .5", "scale scene 2",
      'set t text "你好 World"', "set r stroke-width 2.5", "scale scene 0", "show r",
      "undo", "redo", "tree", "delete r", "help"].join("\n"),
  });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
  for (const expected of ["g#scene moved by (-5,0.5)", "g#scene scaled by 2",
    'text#t updated: text="你好 World"', "error: scale factor must be positive",
    "x=10 y=41 width=200 height=100 fill=red stroke-width=2.5",
    "undone: rect#r updated: stroke-width=2.5", "redone: rect#r updated: stroke-width=2.5",
    'x=30 y=81 text="你好 World"', "rect#r deleted"]) {
    assert.ok(result.stdout.includes(expected), result.stdout);
  }
  for (const name of ["move", "scale", "set"]) assert.ok(result.stdout.includes(`[已实现] ${name}`));
});
