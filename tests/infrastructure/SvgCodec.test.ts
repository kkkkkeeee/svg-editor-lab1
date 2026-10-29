import assert from "node:assert/strict";
import test from "node:test";
import { DOMParser, type Element } from "@xmldom/xmldom";
import { SvgCodec } from "../../src/infrastructure/SvgCodec.js";
import { SvgDocument } from "../../src/domain/SvgDocument.js";
import { ShapeFactory } from "../../src/domain/ShapeFactory.js";
import { Group } from "../../src/domain/shapes/Group.js";
import { Text } from "../../src/domain/shapes/Text.js";
import { Rect } from "../../src/domain/shapes/Rect.js";
import { EditorSession } from "../../src/application/EditorSession.js";
import { CreateCommand } from "../../src/application/commands/CreateCommand.js";
import { FrontCommand } from "../../src/application/commands/FrontCommand.js";
import { BackCommand } from "../../src/application/commands/BackCommand.js";

const codec = new SvgCodec();
function parse(xml: string) {
  return new DOMParser({ onError: (level, message) => { throw new Error(`${level}: ${message}`); } })
    .parseFromString(xml, "application/xml");
}
function elements(parent: Element): Element[] {
  return Array.from(parent.childNodes).filter(node => node.nodeType === 1) as Element[];
}

test("M6-A 空文档：声明、默认根、确定格式及 XML 解析", () => {
  const xml = codec.serialize(new SvgDocument());
  assert.equal(xml, '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">\n</svg>\n');
  const doc = parse(xml); const root = doc.documentElement!;
  assert.equal(root.localName, "svg"); assert.equal(root.namespaceURI, "http://www.w3.org/2000/svg");
  assert.deepEqual(elements(root), []);
});

test("M6-A 自定义浮点画布和指数几何值不截断", () => {
  const doc = new SvgDocument(321.25, 123.5);
  doc.add(new Rect("r", -0.125, 1e-7, 1.23456789012345, 1e21));
  const root = parse(codec.serialize(doc)).documentElement!;
  assert.equal(root.getAttribute("width"), "321.25"); assert.equal(root.getAttribute("height"), "123.5");
  assert.equal(root.getAttribute("viewBox"), "0 0 321.25 123.5");
  const rect = elements(root)[0];
  for (const [key, value] of Object.entries({x: -0.125, y: 1e-7, width: 1.23456789012345, height: 1e21})) {
    assert.equal(Number(rect.getAttribute(key)), value);
  }
});

const examples: [string, (string | number)[], Record<string, string>][] = [
  ["rect", [1, 2, 3, 4], { x: "1", y: "2", width: "3", height: "4" }],
  ["circle", [1, 2, 3], { cx: "1", cy: "2", r: "3" }],
  ["ellipse", [1, 2, 3, 4], { cx: "1", cy: "2", rx: "3", ry: "4" }],
  ["line", [1, 2, 3, 4], { x1: "1", y1: "2", x2: "3", y2: "4" }],
  ["text", [1, 2, "中文 带空格"], { x: "1", y: "2" }],
  ["g", [], {}],
];
for (const [type, params, geometry] of examples) {
  test(`M6-A ${type} 标签/几何/缺省样式/公共样式`, () => {
    const doc = new SvgDocument(); doc.add(new ShapeFactory().create(type, "shape", params));
    let element = elements(parse(codec.serialize(doc)).documentElement!)[0];
    assert.equal(element.localName, type); assert.equal(element.namespaceURI, "http://www.w3.org/2000/svg");
    const attributes = Object.fromEntries(Array.from(element.attributes).map(attr => [attr.name, attr.value]));
    assert.deepEqual(attributes, { id: "shape", ...geometry });
    if (type === "text") assert.equal(element.textContent, "中文 带空格");
    doc.set("shape", "fill", "#ffffff"); doc.set("shape", "stroke", "none"); doc.set("shape", "stroke-width", 0.75);
    element = elements(parse(codec.serialize(doc)).documentElement!)[0];
    assert.equal(element.getAttribute("fill"), "#ffffff"); assert.equal(element.getAttribute("stroke"), "none");
    assert.equal(element.getAttribute("stroke-width"), "0.75");
    assert.equal(element.hasAttribute("text"), false); assert.equal(element.hasAttribute("type"), false);
  });
}

test("M6-A 多层组保持结构和样式继承缺省，不修改原文档", () => {
  const doc = new SvgDocument();
  doc.add(new Group("outer", [new Group("inner", [new Rect("r", 1, 2, 3, 4), new Text("t", 5, 6, "文本")]), new Group("empty")], {fill: "red"}));
  const before = doc.describe(); const xml = codec.serialize(doc);
  const outer = elements(parse(xml).documentElement!)[0];
  assert.equal(outer.getAttribute("fill"), "red");
  assert.deepEqual(elements(outer).map(e => e.getAttribute("id")), ["inner", "empty"]);
  const inner = elements(outer)[0]; assert.equal(inner.hasAttribute("fill"), false);
  assert.deepEqual(elements(inner).map(e => e.getAttribute("id")), ["r", "t"]);
  assert.equal(elements(inner)[0].hasAttribute("fill"), false);
  assert.equal(codec.serialize(doc), xml); assert.deepEqual(doc.describe(), before);
});

test("M6-A front/back 后序列化实际绘制顺序，查询不改变 redo", () => {
  const session = new EditorSession(); session.init();
  session.execute(new CreateCommand("g", "g", []));
  for (const id of ["a", "b", "c"]) session.execute(new CreateCommand("rect", id, ["1", "2", "3", "4"], "g"));
  session.execute(new FrontCommand("a")); session.execute(new BackCommand("c"));
  const ids = () => elements(elements(parse(codec.serialize(session.snapshot())).documentElement!)[0]).map(e => e.getAttribute("id"));
  assert.deepEqual(ids(), ["c", "b", "a"]);
  session.undo(); const before = session.describe(); assert.deepEqual(ids(), ["b", "c", "a"]);
  assert.deepEqual(session.describe(), before); session.redo(); assert.deepEqual(ids(), ["c", "b", "a"]);
});

test("M6-A 属性注入、文本注入、实体字面量与 ]]> 均解析回原值", () => {
  const id = 'r&<"\'>'; const style = 'red" onload="evil <&>\'\t\n\r';
  const content = '中文 😀 <script>bad</script> &amp; "\' ]]>\t\n\r  结束';
  const doc = new SvgDocument(); doc.add(new Rect(id, 1, 2, 3, 4, {fill: style}));
  doc.add(new Text("t", 1, 2, content));
  const xml = codec.serialize(doc); const parsed = parse(xml); const children = elements(parsed.documentElement!);
  assert.equal(children.length, 2); assert.equal(children[0].getAttribute("id"), id);
  assert.equal(children[0].getAttribute("fill"), style); assert.equal(children[0].hasAttribute("onload"), false);
  assert.equal(children[1].textContent, content); assert.deepEqual(elements(children[1]), []);
  assert.equal(parsed.getElementsByTagName("script").length, 0);
  assert.ok(xml.includes("&amp;amp;")); assert.ok(xml.includes("]]&gt;"));
  assert.equal(Buffer.from(xml, "utf8").toString("utf8"), xml);
});

test("M6-A 空文本和前后空格不会被漂亮打印改变", () => {
  const doc = new SvgDocument(); doc.add(new Text("empty", 1, 2, "")); doc.add(new Text("spaces", 1, 2, "  文本  "));
  const children = elements(parse(codec.serialize(doc)).documentElement!);
  assert.equal(children[0].textContent, ""); assert.equal(children[1].textContent, "  文本  ");
});

for (const field of ["id", "fill", "text"] as const) {
  test(`M6-A ${field} 非法 XML 控制符/孤立代理项拒绝且原文档不变`, () => {
    for (const invalid of ["\u0000", "\u0001", "\u000b", "\u001f", "\ufffe", "\uffff", "\ud800", "\udfff"]) {
      const doc = new SvgDocument();
      if (field === "id" && /\s/.test(invalid)) {
        // 空白 id 已由领域层更早拒绝，不能构造它来测试输出边界。
        assert.throws(() => new Text("id" + invalid, 1, 2, "valid"), /id must be non-empty and contain no whitespace/);
        assert.deepEqual(doc.describe().children, []);
        continue;
      }
      doc.add(new Text(field === "id" ? "id" + invalid : "t", 1, 2,
        field === "text" ? invalid : "valid", field === "fill" ? {fill: "red" + invalid} : {}));
      const before = doc.describe(); assert.throws(() => codec.serialize(doc), /invalid XML 1.0 character: U\+/);
      assert.deepEqual(doc.describe(), before);
    }
  });
}

test("M6-A 属性设置顺序不同仍产生确定的相同 XML", () => {
  const a = new SvgDocument(); a.add(new Rect("r", 1, 2, 3, 4)); const b = a.clone();
  a.set("r", "fill", "red"); a.set("r", "stroke", "black");
  b.set("r", "stroke", "black"); b.set("r", "fill", "red");
  assert.equal(codec.serialize(a), codec.serialize(b));
});

test("M6-A 独立解析器拒绝坏 XML（验证验收工具确实检查结构）", () => {
  assert.throws(() => parse('<svg><g></svg>'));
  assert.throws(() => parse('<svg a="1" a="2"/>'));
});
