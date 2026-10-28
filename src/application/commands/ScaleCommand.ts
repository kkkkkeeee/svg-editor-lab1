import type { SvgDocument } from "../../domain/SvgDocument.js";
import type { EditCommand } from "./EditCommand.js";

export class ScaleCommand implements EditCommand {
  public constructor(private readonly id: string, private readonly factor: number) {}

  public execute(document: SvgDocument): string {
    document.scale(this.id, this.factor);
    return `${document.find(this.id)!.describe().type}#${this.id} scaled by ${this.factor}`;
  }
}
