import type { SvgDocument } from "../../domain/SvgDocument.js";
import { NumericArgument } from "../NumericArgument.js";
import type { EditCommand } from "./EditCommand.js";

export class SetCommand implements EditCommand {
  public constructor(private readonly id: string, private readonly attribute: string, private readonly value: string) {}

  public execute(document: SvgDocument): string {
    const shape = document.find(this.id);
    if (!shape) throw new Error(`no such shape: ${this.id}`);
    const description = shape.describe();
    // 全部几何属性始终出现在描述中；stroke-width 可以缺省。
    // 只判断值类型，不按图形类型分派；最终合法性由图形自身决定。
    const numeric = this.attribute === "stroke-width"
      || typeof description.attributes[this.attribute] === "number";
    const value = numeric ? NumericArgument.parse(this.value, this.attribute) : this.value;
    document.set(this.id, this.attribute, value);
    return `${description.type}#${this.id} updated: ${this.attribute}=${JSON.stringify(value)}`;
  }
}
