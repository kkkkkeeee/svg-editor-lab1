import type { SvgDocument } from "../../domain/SvgDocument.js";
import type { EditCommand } from "./EditCommand.js";

export class DeleteCommand implements EditCommand {
  public constructor(private readonly id: string) {}

  public execute(document: SvgDocument): string {
    const removed = document.delete(this.id);
    return `${removed.describe().type}#${this.id} deleted`;
  }
}
