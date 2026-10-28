import type { SvgDocument } from "../../domain/SvgDocument.js";
import type { EditCommand } from "./EditCommand.js";

export class FrontCommand implements EditCommand {
  public constructor(private readonly id: string) {}

  public execute(document: SvgDocument): string {
    // SVG 后绘制的兄弟位于上层；省略 index 表示移除后追加到末尾。
    document.reparent(this.id, document.getParentId(this.id));
    return `${document.find(this.id)!.describe().type}#${this.id} brought to front`;
  }
}
