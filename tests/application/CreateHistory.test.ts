import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EditorSession } from "../../src/application/EditorSession.js";
import { CommandDispatcher } from "../../src/application/CommandDispatcher.js";
import { CommandHistory } from "../../src/application/CommandHistory.js";
import { CreateCommand } from "../../src/application/commands/CreateCommand.js";
import { CommandParser } from "../../src/cli/CommandParser.js";
import { SvgDocument } from "../../src/domain/SvgDocument.js";
import { Rect } from "../../src/domain/shapes/Rect.js";
import { Circle } from "../../src/domain/shapes/Circle.js";
import { Ellipse } from "../../src/domain/shapes/Ellipse.js";
import { Line } from "../../src/domain/shapes/Line.js";
import { Text } from "../../src/domain/shapes/Text.js";
import { Group } from "../../src/domain/shapes/Group.js";

function setup() {
  const session = new EditorSession();
  const dispatcher = new CommandDispatcher(session);
  const parser = new CommandParser();
  return { session, run: (line: string) => dispatcher.dispatch(parser.parse(line)!) };
}

for (const [line, concrete, expected] of [
  ["create rect r 10 20 100 50 red", Rect, { x: 10, y: 20, width: 100, height: 50, fill: "red" }],
  ["create circle r 10 20 5", Circle, { cx: 10, cy: 20, r: 5 }],
  ["create ellipse r 10 20 5 8 #ffffff", Ellipse, { cx: 10, cy: 20, rx: 5, ry: 8, fill: "#ffffff" }],
  ["create line r 1 2 3 4 black", Line, { x1: 1, y1: 2, x2: 3, y2: 4, stroke: "black" }],
  ['create text r 20 40 "Hello 世界"', Text, { x: 20, y: 40 }],
  ["create g r", Group, {}],
] as const) {
  test(`创建、撤销重做保留类型与属性: ${line}`, () => {
    const { session, run } = setup();
    run("init");
    run(line);
    assert.ok(session.snapshot().find("r") instanceof concrete);
    assert.deepEqual(session.snapshot().find("r")!.describe().attributes, expected);
    const before = session.describe();
    run("undo");
    assert.deepEqual(session.describe().children, []);
    run("redo");
    assert.deepEqual(session.describe(), before);
    assert.ok(session.snapshot().find("r") instanceof concrete);
  });
}

test("in: 嵌套容器与六种类型均可指定父级且保持顺序", () => {
  const { session, run } = setup();
  run("init 400 200");
  run("create g scene");
  run("create g nested in scene");
  for (const line of [
    "create rect r 0 0 1 2 in nested", "create circle c 1 2 3 in nested",
    "create ellipse e 1 2 3 4 in nested", "create line l 1 2 3 4 in nested",
    'create text t 1 2 "中文 标签" in nested', "create g empty in nested",
  ]) run(line);
  assert.equal(session.snapshot().getParentId("nested"), "scene");
  assert.deepEqual(session.snapshot().find("nested")!.children.map(shape => shape.id),
    ["r", "c", "e", "l", "t", "empty"]);
  for (const id of ["r", "c", "e", "l", "t", "empty"]) {
    assert.equal(session.snapshot().getParentId(id), "nested");
  }
});

test("create: 缺省样式、空文本和数字文本不被误转换", () => {
  const { session, run } = setup();
  run("init");
  run("create line l 1 2 3 4");
  run("create rect r 1 2 3 4");
  run('create text t 1 2 ""');
  run('create text n 1 2 "123"');
  assert.equal(Object.hasOwn(session.snapshot().find("l")!.describe().attributes, "stroke"), false);
  assert.equal(Object.hasOwn(session.snapshot().find("r")!.describe().attributes, "fill"), false);
  assert.equal(session.snapshot().find("t")!.describe().text, "");
  assert.equal(session.snapshot().find("n")!.describe().text, "123");
});

test("create: 引号内的 in 不作为尾缀，id 也可以叫 in", () => {
  const { session, run } = setup();
  run("init");
  run("create g in");
  run('create text t 1 2 "in" in in');
  run('create text t2 1 2 "hello in world"');
  assert.equal(session.snapshot().find("t")!.describe().text, "in");
  assert.equal(session.snapshot().getParentId("t"), "in");
  assert.equal(session.snapshot().getParentId("t2"), null);
  const before = session.describe();
  assert.throws(() => run('create text invalid 1 2 "in" in'), /invalid parameters/);
  assert.deepEqual(session.describe(), before);
});

test("create: 重复 id、未知类型和非法容器使用规定错误且不改状态", () => {
  const { session, run } = setup();
  run("init");
  run("create g g");
  run("create rect r 1 2 3 4 in g");
  const before = session.describe();
  for (const [line, message] of [
    ["create circle r 1 2 3", "id already exists: r"],
    ["create box b", "unknown shape type: box (is the plugin loaded?)"],
    ["create hexagon h", "unknown shape type: hexagon (is the plugin loaded?)"],
    ["create g child in missing", "no such container: missing"],
    ["create g child in r", "not a container: r"],
  ]) {
    assert.throws(() => run(line), { message });
    assert.deepEqual(session.describe(), before);
  }
});

test("create: 参数数量、数值与尺寸错误不改变文档", () => {
  const { session, run } = setup();
  run("init");
  const before = session.describe();
  for (const line of [
    "create", "create rect", "create rect r 1 2 3", "create g g extra",
    "create circle c 1 2 -3", "create circle c NaN 2 3", "create rect r 1e999 2 3 4",
    "create line l 0x10 2 3 4", 'create rect r "" 2 3 4', "create g g in",
    'create text t 1 2 "unterminated',
  ]) {
    assert.throws(() => run(line));
    assert.deepEqual(session.describe(), before);
  }
  run("create circle valid -1.5 2e1 3");
  assert.deepEqual(session.snapshot().find("valid")!.describe().attributes, { cx: -1.5, cy: 20, r: 3 });
});

test("tree/show: 全文档、子树、层级顺序、几何、文字和根父级", () => {
  const { run } = setup();
  run("init 400 200");
  run("create g scene");
  run("create rect r 10 20 100 50 red in scene");
  run("create g nested in scene");
  run('create text t 20 40 "Hello 世界" in nested');
  run("create circle c 1 2 3");
  assert.equal(run("tree"), [
    "svg (400x200)", "├── g#scene",
    "│   ├── rect#r  x=10 y=20 width=100 height=50 fill=red",
    "│   └── g#nested", '│       └── text#t  x=20 y=40 text="Hello 世界"',
    "└── circle#c  cx=1 cy=2 r=3",
  ].join("\n"));
  assert.equal(run("tree nested"), 'g#nested\n└── text#t  x=20 y=40 text="Hello 世界"');
  assert.equal(run("tree c"), "circle#c  cx=1 cy=2 r=3");
  assert.equal(run("show r"), "rect#r  parent=g#scene\n  x=10 y=20 width=100 height=50 fill=red");
  assert.equal(run("show c"), "circle#c  parent=svg\n  cx=1 cy=2 r=3");
  assert.throws(() => run("tree missing"), /no such shape: missing/);
  assert.throws(() => run("show missing"), /no such shape: missing/);
});

test("history: 多次创建逐步撤销与重做恢复嵌套和顺序", () => {
  const { session, run } = setup();
  run("init");
  const states = [session.describe()];
  for (const line of ["create g g", "create rect r 1 2 3 4 in g", "create circle c 1 2 3 in g"]) {
    run(line);
    states.push(session.describe());
  }
  for (let index = 2; index >= 0; index--) {
    run("undo");
    assert.deepEqual(session.describe(), states[index]);
  }
  assert.throws(() => run("undo"), /nothing to undo/);
  for (let index = 1; index <= 3; index++) {
    run("redo");
    assert.deepEqual(session.describe(), states[index]);
  }
  assert.throws(() => run("redo"), /nothing to redo/);
});

test("history: 新创建清空 redo，旧分支不会恢复", () => {
  const { session, run } = setup();
  run("init");
  run("create g a");
  run("create g b");
  run("undo");
  run("create g c");
  assert.throws(() => run("redo"), /nothing to redo/);
  assert.deepEqual(session.describe().children.map(shape => shape.id), ["a", "c"]);
});

test("history: 各类失败创建保留 redo，查询不影响历史", () => {
  const { session, run } = setup();
  run("init");
  run("create rect a 1 2 3 4");
  run("create g b");
  const both = session.describe();
  run("undo");
  const before = session.describe();
  for (const line of [
    "create g a", "create rect invalid 1 2 -3 4", "create box x",
    "create g x in missing", "create g x in a", "create rect",
  ]) assert.throws(() => run(line));
  run("help");
  run("tree");
  run("tree a");
  run("show a");
  assert.throws(() => run("show missing"));
  assert.deepEqual(session.describe(), before);
  run("redo");
  assert.deepEqual(session.describe(), both);
  run("undo");
  run("undo");
  assert.deepEqual(session.describe().children, []);
});

test("history: init 禁用历史，失败编辑不解禁，成功编辑后允许撤销", () => {
  const { session, run } = setup();
  run("init");
  for (const action of ["undo", "redo"]) {
    assert.throws(() => run(action), { message: "undo not allowed after io command" });
  }
  assert.throws(() => run("create circle c 1 2 -3"));
  assert.throws(() => run("undo"), /undo not allowed after io command/);
  run("create g a");
  run("undo");
  assert.deepEqual(session.describe().children, []);
  run("init 200 100");
  assert.throws(() => run("redo"), /undo not allowed after io command/);
  run("create g new");
  run("undo");
  assert.deepEqual(session.describe(), { width: 200, height: 100, children: [] });
});

test("history: init 失败不丢弃已有 redo", () => {
  const { session, run } = setup();
  run("init");
  run("create g a");
  const before = session.describe();
  run("undo");
  assert.throws(() => run("init 0 1"));
  run("redo");
  assert.deepEqual(session.describe(), before);
});

test("Command: 参数复制且执行时使用当前文档，不缓存旧对象", () => {
  const session = new EditorSession();
  const params = ["1", "2", "3", "4"];
  const command = new CreateCommand("rect", "r", params);
  params[0] = "999";
  session.init();
  session.execute(command);
  assert.equal(session.snapshot().find("r")!.describe().attributes.x, 1);
  session.init(200, 100);
  session.execute(command);
  session.undo();
  session.redo();
  assert.equal(session.describe().width, 200);
  assert.equal(session.snapshot().find("r")!.describe().attributes.x, 1);
});

test("Command: 候选文档部分修改后抛错也不污染会话或 redo", () => {
  const session = new EditorSession();
  session.init();
  session.execute(new CreateCommand("g", "a", []));
  session.undo();
  const before = session.describe();
  assert.throws(() => session.execute({
    execute(document) {
      document.add(new Group("partial"));
      throw new Error("simulated failure after mutation");
    },
  }), /simulated failure/);
  assert.deepEqual(session.describe(), before);
  session.redo();
  assert.deepEqual(session.describe().children.map(shape => shape.id), ["a"]);
});

test("history: 记录/恢复快照独立，redo 不重复执行命令", () => {
  const history = new CommandHistory();
  const original = new SvgDocument();
  let retained: SvgDocument | undefined;
  let executions = 0;
  const result = history.execute({
    execute(document) {
      executions++;
      retained = document;
      document.add(new Rect("r", 1, 2, 3, 4));
      return "created";
    },
  }, original);
  retained!.move("r", 10, 10);
  result.document.move("r", 20, 20);
  assert.deepEqual(original.describe().children, []);
  history.undo().document.add(new Group("external"));
  const redone = history.redo().document;
  assert.equal(executions, 1);
  assert.ok(redone.find("r") instanceof Rect);
  assert.equal(redone.find("r")!.describe().attributes.x, 1);
  assert.equal(redone.find("external"), undefined);
  redone.move("r", 99, 99);
  history.undo();
  assert.equal(history.redo().document.find("r")!.describe().attributes.x, 1);
});

test("snapshot: 恢复后方法可用，修改返回副本不影响会话", () => {
  const { session, run } = setup();
  run("init");
  run("create g g");
  run("create rect r 1 2 3 4 in g");
  run("undo");
  run("redo");
  const copy = session.snapshot();
  assert.ok(copy.find("g") instanceof Group);
  assert.ok(copy.find("r") instanceof Rect);
  copy.move("g", 10, 20);
  assert.equal(copy.find("r")!.describe().attributes.x, 11);
  assert.equal(session.snapshot().find("r")!.describe().attributes.x, 1);
});

test("REPL: 真实进程多行创建、查询、撤销重做及错误恢复", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/main.ts"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    input: [
      "init 800 600", "create g scene", "create rect r1 10 20 100 50 red in scene",
      'create text title 20 40 "你好 World" in scene', "tree", "show r1",
      "undo", "redo", "create box invalid", "tree scene", "move r1 1 2",
    ].join("\n"),
    encoding: "utf8", timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  for (const text of ["canvas 800x600 created", "g#scene created", "rect#r1 created in g#scene",
    "parent=g#scene", 'text="你好 World"', "undone:", "redone:",
    "error: unknown shape type: box (is the plugin loaded?)", "rect#r1 moved by (1,2)"]) {
    assert.ok(result.stdout.includes(text), result.stdout);
  }
});
