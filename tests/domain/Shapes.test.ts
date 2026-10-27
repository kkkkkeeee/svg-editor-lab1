import assert from "node:assert/strict";
import test from "node:test";
import { Shape, type ShapeStyle } from "../../src/domain/Shape.js";
import { Rect } from "../../src/domain/shapes/Rect.js";
import { Circle } from "../../src/domain/shapes/Circle.js";
import { Ellipse } from "../../src/domain/shapes/Ellipse.js";
import { Line } from "../../src/domain/shapes/Line.js";
import { Text } from "../../src/domain/shapes/Text.js";

interface Case {
  name: string;
  values: number[];
  initial: Record<string, number>;
  moved: Record<string, number>;
  scaled: Record<string, number>;
  sizes: string[];
  create: (values: number[], style?: ShapeStyle, id?: string) => Shape;
}

const cases: Case[] = [
  {
    name: "rect", values: [-2, 4, 6, 8], sizes: ["width", "height"],
    initial: { x: -2, y: 4, width: 6, height: 8 },
    moved: { x: -0.5, y: 1, width: 6, height: 8 },
    scaled: { x: -1, y: 2, width: 3, height: 4 },
    create: (v, s, id = "r1") => new Rect(id, v[0], v[1], v[2], v[3], s),
  },
  {
    name: "circle", values: [-2, 4, 6], sizes: ["r"],
    initial: { cx: -2, cy: 4, r: 6 },
    moved: { cx: -0.5, cy: 1, r: 6 },
    scaled: { cx: -1, cy: 2, r: 3 },
    create: (v, s, id = "c1") => new Circle(id, v[0], v[1], v[2], s),
  },
  {
    name: "ellipse", values: [-2, 4, 6, 8], sizes: ["rx", "ry"],
    initial: { cx: -2, cy: 4, rx: 6, ry: 8 },
    moved: { cx: -0.5, cy: 1, rx: 6, ry: 8 },
    scaled: { cx: -1, cy: 2, rx: 3, ry: 4 },
    create: (v, s, id = "e1") => new Ellipse(id, v[0], v[1], v[2], v[3], s),
  },
  {
    name: "line", values: [-2, 4, 6, 8], sizes: [],
    initial: { x1: -2, y1: 4, x2: 6, y2: 8 },
    moved: { x1: -0.5, y1: 1, x2: 7.5, y2: 5 },
    scaled: { x1: -1, y1: 2, x2: 3, y2: 4 },
    create: (v, s, id = "l1") => new Line(id, v[0], v[1], v[2], v[3], s),
  },
  {
    name: "text", values: [-2, 4], sizes: [],
    initial: { x: -2, y: 4 },
    moved: { x: -0.5, y: 1 },
    scaled: { x: -1, y: 2 },
    create: (v, s, id = "t1") => new Text(id, v[0], v[1], "开始 & <结束>", s),
  },
];

for (const item of cases) {
  test(`${item.name}: 创建且不补默认样式`, () => {
    const shape = item.create(item.values);
    assert.ok(shape instanceof Shape);
    assert.equal(shape.describe().type, item.name);
    assert.deepEqual(shape.describe().attributes, item.initial);
    assert.equal(Object.hasOwn(shape.describe().attributes, "fill"), false);
    assert.equal(Object.hasOwn(shape.describe().attributes, "stroke"), false);
  });

  test(`${item.name}: 多态移动与缩放位置/尺寸，保持样式`, () => {
    const style = { fill: "red", stroke: "#123456", "stroke-width": 2 };
    const moved: Shape = item.create(item.values, style);
    moved.move(1.5, -3);
    assert.deepEqual(moved.describe().attributes, { ...item.moved, ...style });
    const scaled: Shape = item.create(item.values, style);
    scaled.scale(0.5);
    assert.deepEqual(scaled.describe().attributes, { ...item.scaled, ...style });
    scaled.scale(2);
    assert.deepEqual(scaled.describe().attributes, { ...item.initial, ...style });
  });

  test(`${item.name}: 每个几何白名单属性及公共样式可设置`, () => {
    const shape = item.create(item.values);
    for (const attribute of Object.keys(item.initial)) {
      shape.set(attribute, 1.25);
      assert.equal(shape.describe().attributes[attribute], 1.25);
    }
    shape.set("fill", "none");
    shape.set("stroke", "blue");
    shape.set("stroke-width", 0);
    assert.equal(shape.describe().attributes.fill, "none");
    assert.equal(shape.describe().attributes.stroke, "blue");
    assert.equal(shape.describe().attributes["stroke-width"], 0);
    for (const attribute of item.sizes) {
      shape.set(attribute, 0);
      assert.equal(shape.describe().attributes[attribute], 0);
    }
  });

  test(`${item.name}: 非法属性、数值、缩放均不修改状态`, () => {
    const shape = item.create(item.values, { fill: "red" });
    const before = shape.describe();
    const actions: (() => void)[] = [
      () => shape.set("id", "new"),
      () => shape.set("transform", "translate(1,2)"),
      () => shape.set("__proto__", 1),
      () => shape.set("font-size", 12),
      () => shape.set("stroke-width", -1),
      () => shape.set("fill", 3),
      () => shape.set("stroke", " "),
    ];
    for (const bad of [NaN, Infinity, -Infinity]) {
      actions.push(() => shape.move(bad, 1), () => shape.move(1, bad));
    }
    for (const bad of [0, -1, NaN, Infinity, -Infinity]) {
      actions.push(() => shape.scale(bad));
    }
    for (const attribute of [...Object.keys(item.initial), "stroke-width"]) {
      for (const bad of [NaN, Infinity, -Infinity, "", "12", "12px"]) {
        actions.push(() => shape.set(attribute, bad));
      }
    }
    for (const attribute of item.sizes) actions.push(() => shape.set(attribute, -1));
    for (const action of actions) {
      assert.throws(action);
      assert.deepEqual(shape.describe(), before);
    }
    assert.throws(() => shape.set("id", "new"), { message: "unknown attribute: id" });
    assert.throws(() => shape.scale(0), { message: "scale factor must be positive" });
  });

  test(`${item.name}: 构造时逐项拒绝非有限几何值和负尺寸`, () => {
    for (let index = 0; index < item.values.length; index++) {
      for (const bad of [NaN, Infinity, -Infinity]) {
        const values = [...item.values];
        values[index] = bad;
        assert.throws(() => item.create(values));
      }
    }
    for (const attribute of item.sizes) {
      const values = [...item.values];
      values[Object.keys(item.initial).indexOf(attribute)] = -1;
      assert.throws(() => item.create(values));
    }
    assert.doesNotThrow(() => item.create(item.values.map(() => 0)));
    for (const id of ["", " ", "a b", "a\nb"]) {
      assert.throws(() => item.create(item.values, {}, id));
    }
    assert.equal(item.create(item.values, {}, "中文-A").id, "中文-A");
    assert.throws(() => item.create(item.values, { "stroke-width": -1 }));
    assert.throws(() => item.create(item.values, { fill: "" }));
  });

  test(`${item.name}: 运算溢出不会留下部分坐标修改`, () => {
    const values = [...item.values];
    values[values.length - 1] = Number.MAX_VALUE;
    const shape = item.create(values);
    const before = shape.describe();
    assert.throws(() => shape.scale(2));
    assert.deepEqual(shape.describe(), before);
    const movingValues = [...item.values];
    movingValues[1] = Number.MAX_VALUE;
    const moving = item.create(movingValues);
    const movingBefore = moving.describe();
    assert.throws(() => moving.move(1, Number.MAX_VALUE));
    assert.deepEqual(moving.describe(), movingBefore);
  });

  test(`${item.name}: 描述为冻结副本，id 只读，构造样式无引用泄漏`, () => {
    const style = { fill: "red" };
    const shape = item.create(item.values, style);
    style.fill = "blue";
    const description = shape.describe();
    assert.equal(description.attributes.fill, "red");
    assert.ok(Object.isFrozen(description));
    assert.ok(Object.isFrozen(description.attributes));
    assert.throws(() => Object.assign(description.attributes, { fill: "green" }));
    assert.throws(() => Object.assign(shape, { id: "changed" }));
    assert.equal(shape.id, description.id);
    shape.move(1.5, -3);
    assert.deepEqual(description.attributes, { ...item.initial, fill: "red" });
  });
}

test("Text: 文本内容独立于 SVG 属性，支持中文、空串并拒绝数值", () => {
  const shape = new Text("t", 1, 2, "开始 & <结束>");
  shape.move(1, 2);
  shape.scale(2);
  assert.equal(shape.describe().text, "开始 & <结束>");
  assert.equal(Object.hasOwn(shape.describe().attributes, "text"), false);
  shape.set("text", "");
  assert.equal(shape.describe().text, "");
  shape.set("text", "My Diagram v2");
  const before = shape.describe();
  assert.throws(() => shape.set("text", 123));
  assert.deepEqual(shape.describe(), before);
});

test("各图形拒绝其他类型专属属性", () => {
  const wrongAttributes = ["r", "width", "x", "cx", "height"];
  cases.forEach((item, index) => {
    const shape = item.create(item.values);
    const before = shape.describe();
    assert.throws(() => shape.set(wrongAttributes[index], 1), /unknown attribute:/);
    if (item.name !== "text") assert.throws(() => shape.set("text", "hello"));
    assert.deepEqual(shape.describe(), before);
  });
});
