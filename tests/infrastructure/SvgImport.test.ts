import assert from "node:assert/strict";
import test from "node:test";
import { SvgCodec } from "../../src/infrastructure/SvgCodec.js";
import { ShapeFactory } from "../../src/domain/ShapeFactory.js";
import { SvgDocument } from "../../src/domain/SvgDocument.js";
import { Rect } from "../../src/domain/shapes/Rect.js";

const codec = new SvgCodec();
const svg = (body: string, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" ${extra}>${body}</svg>`;
const rect = (id = '') => `<rect ${id} x="0" y="0" width="10" height="20"/>`;

test("M7 课程 other.svg 七元素及自动 ID", () => {
  const result = codec.deserialize(svg(`<rect x="0" y="0" width="400" height="300" fill="#ffffff"/><text id="t1" x="10" y="290">imported</text>
    <circle id="c1" cx="50" cy="50" r="10"/><g id="g1"><rect id="r2" x="0" y="0" width="10" height="10"/>
    <circle id="c2" cx="5" cy="5" r="2"/></g><ellipse id="e1" cx="1" cy="2" rx="3" ry="4"/>`, 'viewBox="0 0 400 300"'));
  assert.deepEqual(result.warnings, ['warning: assigned id rect1 to unnamed <rect>']);
  assert.deepEqual(result.document.children.map(s => s.id), ['rect1','t1','c1','g1','e1']);
  assert.deepEqual(result.document.find('g1')!.children.map(s => s.id), ['r2','c2']);
  assert.equal(result.document.getParentId('c2'), 'g1');
  assert.ok(result.document.find('rect1') instanceof Rect);
});

test("M7 全六类型全部属性/浮点/多层组/缺省样式往返", () => {
  const doc = new SvgDocument(400.5,300.25); const factory = new ShapeFactory();
  doc.add(factory.create('g','outer')); doc.add(factory.create('g','inner'), 'outer');
  for (const [type, params] of [['rect',[-1.25,2,3,4]],['circle',[1,2,3]],['ellipse',[1,2,3,4]],['line',[1,2,3,4]],['text',[1,2,' 中文 & < > " 😀 \t\n\r ']]] as [string,(number|string)[]][]) {
    doc.add(factory.create(type,type,params),'inner');
    doc.set(type,'stroke-width',0.5); doc.set(type,'stroke','black');
  }
  doc.set('outer','fill','red'); doc.set('rect','fill','blue');
  doc.add(factory.create('text','empty',[0,0,'']));
  doc.reparent('rect','inner');
  const xml=codec.serialize(doc); const restored=codec.deserialize(xml).document;
  assert.deepEqual(restored.describe(),doc.describe());
  assert.equal(codec.serialize(restored),xml);
  assert.equal(Object.hasOwn(restored.find('circle')!.describe().attributes,'fill'),false);
  restored.move('inner',2,3); assert.notDeepEqual(restored.describe(),doc.describe());
});

test("M7 先收集后续显式 ID，序号确定且大小写敏感", () => {
  const {document,warnings}=codec.deserialize(svg(`<g>${rect()}${rect('id="rect1"')}${rect('id="Rect2"')}</g>${rect()}${rect('id="rect3"')}`));
  assert.deepEqual(warnings,['warning: assigned id g1 to unnamed <g>','warning: assigned id rect2 to unnamed <rect>','warning: assigned id rect4 to unnamed <rect>']);
  assert.ok(document.find('rect2')); assert.ok(document.find('Rect2'));
  assert.deepEqual(codec.deserialize(svg(rect())).warnings,['warning: assigned id rect1 to unnamed <rect>']);
});

test("M7 XML 实体/CDATA/注释/空文本及 box 普通组降级", () => {
  const {document}=codec.deserialize(svg('<g id="g" data-kind="box"><!--注释--><text id="t" x="0" y="0">中文 &amp; &#60;<![CDATA[>]]></text><text id="e" x="1" y="2"/></g>'));
  assert.equal(document.find('t')!.describe().text,'中文 & <>');
  assert.equal(document.find('e')!.describe().text,'');
  assert.equal(document.find('g')!.describe().type,'g');
  assert.doesNotMatch(codec.serialize(document),/data-kind/);
});

const invalid: [string,string][] = [
  ['viewBox 重复逗号',svg('','viewBox="0,,0,400,300"')],
  ['未知属性',svg(rect('opacity="0.5"'))], ['其他类型属性',svg(rect('r="2"'))],
  ['负 stroke-width',svg(rect('stroke-width="-1"'))],
  ['多根',svg('')+svg('')], ['根外文本','junk'+svg('')],
  ['重复 ID',svg(rect('id="x"')+rect('id="x"'))], ['空 ID',svg(rect('id=""'))],
  ['坏 XML','<svg><g></svg>'], ['重复属性',svg(rect('id="x" id="y"'))],
  ['根错误','<html/>'], ['命名空间错误','<svg width="1" height="2"/>'],
  ['非默认 viewBox',svg('','viewBox="1 0 400 300"')], ['零画布',svg('').replace('width="400"','width="0"')],
  ['单位',svg(rect().replace('width="10"','width="10px"'))], ['负尺寸',svg(rect().replace('width="10"','width="-1"'))],
  ['溢出',svg(rect().replace('x="0"','x="1e999"'))], ['缺几何',svg('<rect/>')],
  ['transform',svg('<g transform="translate(1,2)"/>')], ['CSS',svg('<g style="fill:red"/>')],
  ['font-size',svg('<text x="0" y="0" font-size="16">a</text>')], ['文本属性',svg('<text x="0" y="0" text="a"/>')],
  ['path',svg('<path d="M0 0"/>')], ['defs/use',svg('<defs/><use href="#x"/>')],
  ['叶子嵌套',svg(`<rect x="0" y="0" width="1" height="1">${rect()}</rect>`)],
  ['组内文本',svg('<g>lost text</g>')], ['text 内标签',svg('<text x="0" y="0"><tspan>x</tspan></text>')],
  ['DTD','<!DOCTYPE svg [<!ENTITY x "abc">]>'+svg('')], ['外部样式','<?xml-stylesheet href="x.css"?>'+svg('')],
  ['未知实体',svg('<text x="0" y="0">&unknown;</text>')],
  ['控制字符',svg('<text x="0" y="0">\u0001</text>')],
  ['非法字符实体',svg('<text x="0" y="0">&#1;</text>')],
  ['非 UTF8 声明','<?xml version="1.0" encoding="UTF-16"?>'+svg('')],
  ['foreign namespace',svg('<g xmlns="urn:foreign"/>')], ['根未知属性',svg('','style="color:red"')],
];
for(const [name,xml] of invalid) test(`M7 拒绝 ${name}`,()=>assert.throws(()=>codec.deserialize(xml)));
