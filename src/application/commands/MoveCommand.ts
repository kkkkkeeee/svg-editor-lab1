import type { SvgDocument } from "../../domain/SvgDocument.js";
import type { EditCommand } from "./EditCommand.js";

export class MoveCommand implements EditCommand {
  public constructor(private readonly id: string, private readonly dx: number, private readonly dy: number) {}

  public execute(document: SvgDocument): string {
    document.move(this.id, this.dx, this.dy);
    return `${document.find(this.id)!.describe().type}#${this.id} moved by (${this.dx},${this.dy})`;
  }
}
