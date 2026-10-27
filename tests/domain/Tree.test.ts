import assert from "node:assert/strict";
import test from "node:test";
import { Shape } from "../../src/domain/Shape.js";
import { SvgDocument } from "../../src/domain/SvgDocument.js";
import { ShapeFactory } from "../../src/domain/ShapeFactory.js";
import { Group } from "../../src/domain/shapes/Group.js";
import { Rect } from "../../src/domain/shapes/Rect.js";
import { Circle } from "../../src/domain/shapes/Circle.js";
import { Ellipse } from "../../src/domain/shapes/Ellipse.js";
import { Line } from "../../src/domain/shapes/Line.js";
import { Text } from "../../src/domain/shapes/Text.js";

test("Group: 嵌套移动与缩放通过 Shape 接口作用于整棵子树", () => {
  const group: Shape = new Group("scene", [
    new Rect("r", 1, 2, 3, 4),
    new Group("nested", [new Line("l", -1, 2, 3, 4), new Text("t", 5, 6, "标题")]),
  ]);
  group.move(10, -2);
  group.scale(2);
  const children = group.describe().children!;
  assert.deepEqual(children.map(child => child.id), ["r", "nested"]);
  assert.deepEqual(children[0].attributes, { x: 22, y: 0, width: 6, height: 8 });
  assert.deepEqual(children[1].children![0].attributes, { x1: 18, y1: 0, x2: 26, y2: 4 });
  assert.deepEqual(children[1].children![1].attributes, { x: 30, y: 8 });
  assert.equal(children[1].children![1].text, "标题");
});

test("Group: 嵌套末尾节点移动溢出，前面节点及整树不变", () => {
  const group = new Group("g", [
    new Rect("first", 0, 0, 1, 1),
    new Group("inner", [new Circle("last", 0, Number.MAX_VALUE, 1)]),
  ], { fill: "red" });
  const before = group.describe();
  assert.throws(() => group.move(1, Number.MAX_VALUE), /finite number/);
  assert.deepEqual(group.describe(), before);
});

test("Group: 嵌套末尾节点缩放溢出，前面节点及整树不变", () => {
  const group = new Group("g", [
    new Text("first", 1, 1, "unchanged"),
    new Group("inner", [new Ellipse("last", 1, 1, 1, Number.MAX_VALUE)]),
  ]);
  const before = group.describe();
  assert.throws(() => group.scale(2), /finite number/);
  assert.deepEqual(group.describe(), before);
});

test("Group: 空容器也校验移动/缩放输入，样式不传播覆盖孩子", () => {
  const empty = new Group("empty");
  const before = empty.describe();
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.throws(() => empty.move(bad, 0));
    assert.throws(() => empty.move(0, bad));
  }
  for (const bad of [0, -1, NaN, Infinity]) assert.throws(() => empty.scale(bad));
  assert.deepEqual(empty.describe(), before);
  const group = new Group("g", [
    new Rect("r", 0, 0, 1, 1, { fill: "red" }),
    new Circle("c", 0, 0, 1),
  ]);
  group.set("fill", "blue");
  group.set("stroke", "black");
  group.set("stroke-width", 2);
  assert.deepEqual(group.describe().attributes, { fill: "blue", stroke: "black", "stroke-width": 2 });
  assert.equal(group.describe().children![0].attributes.fill, "red");
  assert.equal(Object.hasOwn(group.describe().children![1].attributes, "fill"), false);
  const styled = group.describe();
  for (const attr of ["x", "width", "text", "id", "transform"]) {
    assert.throws(() => group.set(attr, 1), /unknown attribute/);
  }
  assert.throws(() => group.set("stroke-width", -1));
  assert.deepEqual(group.describe(), styled);
});

test("Group: 构造与结构替换拒绝重复 id、自包含及重复使用同一孩子", () => {
  const leaf = new Rect("r", 1, 2, 3, 4);
  assert.throws(() => new Group("g", [leaf, leaf]), /id already exists: r/);
  assert.throws(() => new Group("r", [leaf]), /id already exists: r/);
  assert.throws(() => new Group("g", [
    new Group("a", [leaf]), new Group("b", [leaf]),
  ]), /id already exists: r/);
  const group = new Group("g", [leaf]);
  const before = group.describe();
  assert.throws(() => group.withChildren([group]), /id already exists: g/);
  assert.deepEqual(group.describe(), before);
  const ancestor = new Group("ancestor", [group]);
  assert.throws(() => group.withChildren([ancestor]), /id already exists: g/);
  assert.throws(() => leaf.withChildren([group]), /not a container/);
});

test("Group: 构造、children、withChildren 均不泄漏结构或图形引用", () => {
  const leaf = new Rect("r", 1, 2, 3, 4);
  const input: Shape[] = [leaf];
  const group = new Group("g", input);
  const before = group.describe();
  input.length = 0;
  leaf.move(100, 100);
  const children = group.children;
  children[0].move(100, 100);
  assert.throws(() => (children as Shape[]).push(new Group("other")));
  assert.deepEqual(group.describe(), before);
  const replacement = group.withChildren([new Circle("c", 0, 0, 1)]);
  assert.deepEqual(group.describe(), before);
  assert.deepEqual(replacement.children.map(child => child.id), ["c"]);
  assert.ok(Object.isFrozen(group.describe().children));
  assert.ok(Object.isFrozen(group.describe().children![0].attributes));
});

test("SvgDocument: 默认及指定尺寸、调整尺寸原子性", () => {
  const doc = new SvgDocument();
  assert.deepEqual(doc.describe(), { width: 800, height: 600, children: [] });
  doc.resize(400.5, 200);
  const before = doc.describe();
  for (const bad of [0, -1, NaN, Infinity, -Infinity]) {
    assert.throws(() => new SvgDocument(bad, 100));
    assert.throws(() => new SvgDocument(100, bad));
    assert.throws(() => doc.resize(100, bad));
    assert.throws(() => doc.resize(bad, 100));
    assert.deepEqual(doc.describe(), before);
  }
});

test("SvgDocument: 添加、查找、父级查询、删除整棵子树", () => {
  const doc = new SvgDocument();
  doc.add(new Group("g", [new Group("inner", [new Circle("c", 1, 2, 3)])]));
  doc.add(new Rect("r", 0, 0, 2, 2));
  assert.equal(doc.getParentId("g"), null);
  assert.equal(doc.getParentId("inner"), "g");
  assert.equal(doc.getParentId("c"), "inner");
  assert.ok(doc.find("c") instanceof Circle);
  assert.equal(doc.find("missing"), undefined);
  assert.throws(() => doc.getParentId("missing"), /no such shape/);
  const removed = doc.delete("inner");
  assert.ok(removed instanceof Group);
  assert.equal(doc.find("inner"), undefined);
  assert.equal(doc.find("c"), undefined);
  assert.deepEqual(doc.find("g")!.children, []);
  assert.ok(doc.find("r"));
  doc.add(removed, "g");
  assert.equal(doc.getParentId("c"), "inner");
  doc.delete("g");
  assert.deepEqual(doc.children.map(shape => shape.id), ["r"]);
});

test("SvgDocument: 全文档重复 id 拒绝，区分大小写", () => {
  const doc = new SvgDocument();
  doc.add(new Group("g", [new Circle("c", 0, 0, 1)]));
  doc.add(new Circle("C", 0, 0, 1));
  const before = doc.describe();
  for (const duplicate of [
    new Rect("c", 1, 2, 3, 4),
    new Group("another", [new Group("deep", [new Text("c", 0, 0, "重复")])]),
    new Group("g"),
  ]) {
    assert.throws(() => doc.add(duplicate), /id already exists/);
    assert.deepEqual(doc.describe(), before);
  }
  // 从已存在的父节点副本操作也不能绕过文档的 id 校验。
  assert.throws(() => doc.add(new Circle("C", 1, 1, 1), "g"), /id already exists/);
  assert.deepEqual(doc.describe(), before);
});

test("SvgDocument: 目标缺失或不是容器、插入位置非法均不污染状态", () => {
  const doc = new SvgDocument();
  doc.add(new Rect("r", 0, 0, 1, 1));
  doc.add(new Group("g"));
  const before = doc.describe();
  assert.throws(() => doc.add(new Group("x"), "missing"), /no such container/);
  assert.throws(() => doc.add(new Group("x"), "r"), /not a container/);
  for (const index of [-1, 0.5, 3, NaN, Infinity]) {
    assert.throws(() => doc.add(new Group("x"), null, index), /index/);
    assert.deepEqual(doc.describe(), before);
  }
  assert.throws(() => doc.delete("missing"), /no such shape/);
  assert.deepEqual(doc.describe(), before);
});

test("SvgDocument: 插入与同级/跨父级移动保持顺序", () => {
  const doc = new SvgDocument();
  doc.add(new Group("g", [new Group("a"), new Group("c")]));
  doc.add(new Group("b"), "g", 1);
  doc.add(new Group("h"));
  assert.deepEqual(doc.find("g")!.children.map(shape => shape.id), ["a", "b", "c"]);
  doc.reparent("a", "g", 2);
  assert.deepEqual(doc.find("g")!.children.map(shape => shape.id), ["b", "c", "a"]);
  doc.reparent("c", "h");
  assert.equal(doc.getParentId("c"), "h");
  assert.deepEqual(doc.find("g")!.children.map(shape => shape.id), ["b", "a"]);
  doc.reparent("h", null, 0);
  assert.deepEqual(doc.children.map(shape => shape.id), ["h", "g"]);
  doc.reparent("c", null, 1);
  assert.deepEqual(doc.children.map(shape => shape.id), ["h", "c", "g"]);
  assert.equal(doc.getParentId("c"), null);
});

test("SvgDocument: 自包含、祖先移入后代及后期索引失败均保持原树", () => {
  const doc = new SvgDocument();
  doc.add(new Group("a", [new Group("b", [new Group("c")])]));
  doc.add(new Rect("r", 1, 2, 3, 4));
  const before = doc.describe();
  const actions = [
    () => doc.reparent("a", "a"),
    () => doc.reparent("a", "c"),
    () => doc.reparent("b", "c"),
    () => doc.reparent("a", "r"),
    () => doc.reparent("r", "missing"),
    () => doc.reparent("missing", "a"),
    () => doc.reparent("r", "c", 10),
    () => doc.reparent("r", null, -1),
  ];
  for (const action of actions) {
    assert.throws(action);
    assert.deepEqual(doc.describe(), before);
  }
});

test("SvgDocument: 输入、查找、根节点查询、删除结果均为独立副本", () => {
  const source = new Rect("r", 1, 2, 3, 4);
  const doc = new SvgDocument();
  doc.add(source);
  const before = doc.describe();
  source.move(100, 100);
  doc.find("r")!.set("x", 999);
  const roots = doc.children;
  roots[0].move(100, 100);
  assert.throws(() => (roots as Shape[]).push(source));
  assert.deepEqual(doc.describe(), before);
  const removed = doc.delete("r");
  doc.add(removed);
  removed.move(200, 200);
  assert.deepEqual(doc.describe(), before);
  assert.ok(Object.isFrozen(doc.describe()));
  assert.ok(Object.isFrozen(doc.describe().children));
});

test("SvgDocument: 受控几何编辑及失败操作保持文档不变", () => {
  const doc = new SvgDocument();
  doc.add(new Group("g", [new Rect("r", 1, 2, 3, 4)]));
  doc.move("g", 2, 3);
  doc.scale("r", 2);
  doc.set("r", "fill", "red");
  assert.deepEqual(doc.find("r")!.describe().attributes,
    { x: 6, y: 10, width: 6, height: 8, fill: "red" });
  const before = doc.describe();
  for (const action of [
    () => doc.move("missing", 1, 1),
    () => doc.scale("g", 0),
    () => doc.set("r", "width", -1),
    () => doc.set("g", "x", 1),
    () => doc.move("g", Infinity, 0),
  ]) {
    assert.throws(action);
    assert.deepEqual(doc.describe(), before);
  }
});

test("SvgDocument: 文档内嵌套组失败不会改变其他兄弟", () => {
  const doc = new SvgDocument();
  doc.add(new Group("g", [
    new Circle("first", 1, 2, 3),
    new Group("nested", [new Line("last", 1, 2, 3, Number.MAX_VALUE)]),
  ]));
  const before = doc.describe();
  assert.throws(() => doc.scale("g", 2));
  assert.deepEqual(doc.describe(), before);
  assert.throws(() => doc.move("g", 1, Number.MAX_VALUE));
  assert.deepEqual(doc.describe(), before);
});

const cloneExamples: Shape[] = [
  new Rect("r", -1, 2, 0, 4, { fill: "red", "stroke-width": 0 }),
  new Circle("c", 1, 2, 3),
  new Ellipse("e", 1, 2, 3, 4, { stroke: "blue" }),
  new Line("l", 1, 2, 3, 4),
  new Text("t", 1, 2, "中文 & <文本>"),
  new Group("g", [new Group("nested", [new Rect("r2", 1, 2, 3, 4)])], { fill: "none" }),
];

for (const original of cloneExamples) {
  test(`clone: ${original.describe().type} 保留实际类、全部属性及双向独立性`, () => {
    const copy = original.clone();
    const before = original.describe();
    assert.equal(Object.getPrototypeOf(copy), Object.getPrototypeOf(original));
    assert.notEqual(copy, original);
    assert.deepEqual(copy.describe(), before);
    original.move(10, 20);
    original.set("stroke", "black");
    assert.deepEqual(copy.describe(), before);
    const originalAfter = original.describe();
    copy.scale(2);
    copy.set("fill", "green");
    assert.deepEqual(original.describe(), originalAfter);
  });
}

test("SvgDocument.clone: 深拷贝保留尺寸、嵌套顺序、缺省属性及图形行为", () => {
  const doc = new SvgDocument(320, 240);
  doc.add(new Group("g", [
    new Text("t", 1, 2, "hello"),
    new Group("inner", [new Rect("r", 3, 4, 5, 6, { fill: "red" })]),
  ], { stroke: "black" }));
  const copy = doc.clone();
  const before = doc.describe();
  assert.deepEqual(copy.describe(), before);
  assert.ok(copy.find("g") instanceof Group);
  assert.ok(copy.find("t") instanceof Text);
  assert.ok(copy.find("r") instanceof Rect);
  doc.set("t", "text", "changed");
  doc.move("g", 100, 100);
  doc.reparent("r", null);
  doc.resize(640, 480);
  assert.deepEqual(copy.describe(), before);
  const originalAfter = doc.describe();
  copy.scale("inner", 2);
  copy.delete("t");
  copy.add(new Circle("new", 0, 0, 1), "g");
  assert.deepEqual(doc.describe(), originalAfter);
});

test("ShapeFactory: 六种类型与可选样式，未知类型明确拒绝", () => {
  const factory = new ShapeFactory();
  assert.ok(factory.create("rect", "r", [1, 2, 3, 4]) instanceof Rect);
  assert.ok(factory.create("circle", "c", [1, 2, 3, "red"]) instanceof Circle);
  assert.ok(factory.create("ellipse", "e", [1, 2, 3, 4]) instanceof Ellipse);
  assert.ok(factory.create("line", "l", [1, 2, 3, 4]) instanceof Line);
  assert.ok(factory.create("text", "t", [1, 2, "开始"]) instanceof Text);
  assert.ok(factory.create("g", "g") instanceof Group);
  assert.equal(factory.create("line", "l", [1, 2, 3, 4, "blue"]).describe().attributes.stroke, "blue");
  assert.equal(factory.create("rect", "r", [1, 2, 3, 4, "red"]).describe().attributes.fill, "red");
  assert.equal(Object.hasOwn(factory.create("circle", "c", [1, 2, 3]).describe().attributes, "fill"), false);
  for (const type of ["box", "hexagon", "Rect", "__proto__"]) {
    assert.throws(() => factory.create(type, "x"), {
      message: `unknown shape type: ${type} (is the plugin loaded?)`,
    });
  }
});

test("ShapeFactory: 参数个数由工厂校验，非法数值/文本/样式仍由图形校验", () => {
  const factory = new ShapeFactory();
  for (const [type, params] of [
    ["rect", [1, 2, 3]], ["circle", [1, 2]], ["ellipse", [1, 2, 3]],
    ["line", [1, 2, 3]], ["text", [1, 2]], ["g", [1]],
    ["rect", [1, 2, 3, 4, "red", "extra"]],
  ] as const) {
    assert.throws(() => factory.create(type, "x", params), /invalid parameters/);
  }
  assert.throws(() => factory.create("rect", "r", [1, 2, -3, 4]), /non-negative/);
  assert.throws(() => factory.create("circle", "c", [1, 2, Infinity]), /finite number/);
  assert.throws(() => factory.create("ellipse", "e", [1, 2, "3", 4]), /finite number/);
  assert.throws(() => factory.create("line", "l", [1, 2, 3, 4, 123]), /non-empty string/);
  assert.throws(() => factory.create("text", "t", [1, 2, 3]), /text must be a string/);
  assert.throws(() => factory.create("g", ""), /id must/);
});
