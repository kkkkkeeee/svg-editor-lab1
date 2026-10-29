import type { SvgDocument } from "../domain/SvgDocument.js";
import type { ShapeDescription } from "../domain/Shape.js";

/** 只读取领域描述；返回 XML 字符串，不管理文件、会话或历史。 */
export class SvgCodec {
  public serialize(document: SvgDocument): string {
    const description = document.describe();
    const { width, height } = description;
    const body = description.children.map(child => this.element(child, 1));
    return ['<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      ...body, "</svg>", ""].join("\n");
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
