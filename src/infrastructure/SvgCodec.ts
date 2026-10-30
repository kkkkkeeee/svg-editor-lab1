import { DOMParser, type Element, type Node } from "@xmldom/xmldom";
import { ShapeFactory } from "../domain/ShapeFactory.js";
import type { Shape } from "../domain/Shape.js";
import { SvgDocument } from "../domain/SvgDocument.js";
import type { ShapeDescription } from "../domain/Shape.js";

export interface SvgImportResult {
  readonly document: SvgDocument;
  readonly warnings: readonly string[];
}

/** SVG 子集与领域对象互转；不管理文件、会话或历史。 */
export class SvgCodec {
  public serialize(document: SvgDocument): string {
    const description = document.describe();
    const { width, height } = description;
    const body = description.children.map(child => this.element(child, 1));
    return ['<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      ...body, "</svg>", ""].join("\n");
  }

  public deserialize(xml: string): SvgImportResult {
    this.escape(xml); // 也检查解析器可能宽容接受的 XML 1.0 非法原始字符。
    const parsed = new DOMParser({ onError: (level, message) => {
      throw new Error(`invalid XML: ${level}: ${message}`);
    } }).parseFromString(xml, "application/xml");
    const root = parsed.documentElement;
    if (!root || root.tagName !== "svg" || root.namespaceURI !== "http://www.w3.org/2000/svg") {
      throw new Error("expected SVG root and namespace");
    }
    for (const node of Array.from(parsed.childNodes)) {
      if (node === root || node.nodeType === 8 || (node.nodeType === 3 && !node.nodeValue?.trim())) continue;
      if (node.nodeType === 7 && node.nodeName === "xml" &&
        /^version=["']1\.0["'](?:\s+encoding=["']UTF-8["'])?(?:\s+standalone=["'](?:yes|no)["'])?$/i.test(node.nodeValue ?? "")) continue;
      throw new Error("unsupported XML declaration, processing instruction or DTD");
    }
    const rootAttributes = this.attributes(root);
    for (const name of Object.keys(rootAttributes)) {
      if (!["width", "height", "viewBox"].includes(name)) throw new Error(`unsupported SVG root attribute: ${name}`);
    }
    const width = this.number(rootAttributes.width ?? "", "width");
    const height = this.number(rootAttributes.height ?? "", "height");
    const document = new SvgDocument(width, height);
    if (rootAttributes.viewBox !== undefined) {
      if (/(?:^\s*,|,\s*,|,\s*$)/.test(rootAttributes.viewBox)) throw new Error("invalid viewBox separators");
      const parts = rootAttributes.viewBox.trim().split(/[\s,]+/).map(value => this.number(value, "viewBox"));
      if (parts.length !== 4 || parts[0] !== 0 || parts[1] !== 0 || parts[2] !== width || parts[3] !== height) {
        throw new Error("unsupported viewBox: expected 0 0 width height");
      }
    }
    const ids = new Set<string>();
    for (const element of Array.from(root.getElementsByTagName("*"))) {
      if (element.hasAttribute("id")) {
        const id = element.getAttribute("id")!;
        if (ids.has(id)) throw new Error(`id already exists: ${id}`);
        ids.add(id);
      }
    }
    const warnings: string[] = [];
    const counters = new Map<string, number>();
    for (const element of this.elementChildren(root)) {
      document.add(this.restore(element, ids, counters, warnings));
    }
    return { document, warnings: Object.freeze(warnings) };
  }

  private restore(element: Element, ids: Set<string>, counters: Map<string, number>, warnings: string[]): Shape {
    if (element.namespaceURI !== "http://www.w3.org/2000/svg" || element.prefix) {
      throw new Error("unsupported element namespace or prefix");
    }
    const attributes = this.attributes(element);
    const type = element.tagName;
    let id = attributes.id;
    delete attributes.id;
    if (id === undefined) {
      let next = counters.get(type) ?? 0;
      do { id = `${type}${++next}`; } while (ids.has(id));
      counters.set(type, next); ids.add(id);
      warnings.push(`warning: assigned id ${id} to unnamed <${type}>`);
    }
    // 唯一允许丢弃的元数据：课程定义 box 降级为普通 g，不还原插件语义。
    if (type === "g" && attributes["data-kind"] === "box") delete attributes["data-kind"];
    let text = "";
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === 3 || node.nodeType === 4) text += node.nodeValue ?? "";
    }
    this.escape(text);
    const shape = new ShapeFactory().createFromAttributes(type, id, attributes, text);
    const children = this.elementChildren(element, shape.describe().text !== undefined);
    if (!shape.isContainer) {
      if (children.length) throw new Error(`unexpected child element: ${type}`);
      return shape;
    }
    return shape.withChildren(children.map(child => this.restore(child, ids, counters, warnings)));
  }

  private attributes(element: Element): Record<string, string> {
    const result: Record<string, string> = Object.create(null);
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name === "xmlns" && attribute.value === "http://www.w3.org/2000/svg") continue;
      if (attribute.namespaceURI || attribute.prefix) throw new Error(`unsupported namespaced attribute: ${attribute.name}`);
      this.escape(attribute.value);
      result[attribute.name] = attribute.value;
    }
    return result;
  }

  private elementChildren(parent: Node, allowText = false): Element[] {
    const children: Element[] = [];
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === 1) children.push(node as Element);
      else if (node.nodeType === 8) continue;
      else if ((node.nodeType === 3 || node.nodeType === 4) && (allowText || !node.nodeValue?.trim())) continue;
      else throw new Error("unsupported SVG child content");
    }
    return children;
  }

  private number(value: string, name: string): number {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value))) {
      throw new Error(`invalid SVG number: ${name}`);
    }
    return Number(value);
  }

  private element(shape: ShapeDescription, depth: number): string {
    // 白名单防止未来自定义描述把元素名当作 XML 注入；不是类型行为分派。
    if (!["rect", "circle", "ellipse", "line", "text", "g"].includes(shape.type)) {
      throw new Error("unsupported SVG element");
    }
    const attributes = Object.entries(shape.attributes).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    const encoded = attributes.map(([name, value]) => {
      if (!["x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2",
        "fill", "stroke", "stroke-width"].includes(name)) throw new Error("unsupported SVG attribute");
      return `${name}="${this.escape(String(value))}"`;
    });
    const indent = "  ".repeat(depth);
    const opening = `${indent}<${shape.type} id="${this.escape(shape.id)}"${encoded.length ? " " + encoded.join(" ") : ""}`;
    if (shape.text !== undefined) {
      return `${opening}>${this.escape(shape.text)}</${shape.type}>`;
    }
    if (shape.children?.length) {
      return [opening + ">", ...shape.children.map(child => this.element(child, depth + 1)),
        `${indent}</${shape.type}>`].join("\n");
    }
    return opening + "/>";
  }

  private escape(value: string): string {
    // XML 1.0 Char：按码点遍历，因此合法代理对保留，孤立代理项拒绝。
    for (const character of value) {
      const point = character.codePointAt(0)!;
      if (!(point === 0x9 || point === 0xa || point === 0xd ||
        (point >= 0x20 && point <= 0xd7ff) || (point >= 0xe000 && point <= 0xfffd) ||
        (point >= 0x10000 && point <= 0x10ffff))) {
        throw new Error(`invalid XML 1.0 character: U+${point.toString(16).toUpperCase().padStart(4, "0")}`);
      }
    }
    // 两个上下文均安全；字符引用避免属性空白和 CR 在解析时被归一化。
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
      .replace(/\t/g, "&#9;").replace(/\n/g, "&#10;").replace(/\r/g, "&#13;");
  }
}
