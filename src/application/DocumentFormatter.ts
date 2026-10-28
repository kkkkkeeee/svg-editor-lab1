import type { DocumentDescription } from "../domain/SvgDocument.js";
import type { ShapeDescription } from "../domain/Shape.js";

/** 只读取描述，按属性顺序输出；不按图形类型名分派。 */
export class DocumentFormatter {
  public tree(document: DocumentDescription, id?: string): string {
    if (id !== undefined) {
      const shape = this.find(document.children, id);
      if (!shape) throw new Error(`no such shape: ${id}`);
      return [this.summary(shape), ...this.branches(shape.children ?? [], "")].join("\n");
    }
    return [`svg (${document.width}x${document.height})`,
      ...this.branches(document.children, "")].join("\n");
  }

  public show(shape: ShapeDescription, parentId: string | null): string {
    const details = this.attributes(shape);
    return `${shape.type}#${shape.id}  parent=${parentId === null ? "svg" : "g#" + parentId}`
      + (details ? "\n  " + details : "");
  }

  private attributes(shape: ShapeDescription): string {
    return [...Object.entries(shape.attributes).map(([key, value]) => `${key}=${value}`),
      ...(shape.text === undefined ? [] : [`text=${JSON.stringify(shape.text)}`])].join(" ");
  }

  private summary(shape: ShapeDescription): string {
    const details = this.attributes(shape);
    return `${shape.type}#${shape.id}` + (details ? "  " + details : "");
  }

  private branches(children: readonly ShapeDescription[], prefix: string): string[] {
    return children.flatMap((child, index) => {
      const last = index === children.length - 1;
      return [prefix + (last ? "└── " : "├── ") + this.summary(child),
        ...this.branches(child.children ?? [], prefix + (last ? "    " : "│   "))];
    });
  }

  private find(children: readonly ShapeDescription[], id: string): ShapeDescription | undefined {
    for (const child of children) {
      if (child.id === id) return child;
      const found = this.find(child.children ?? [], id);
      if (found) return found;
    }
    return undefined;
  }
}
