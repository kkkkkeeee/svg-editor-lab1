import type { SvgDocument } from "../../domain/SvgDocument.js";
import type { EditCommand } from "./EditCommand.js";

export class AddToCommand implements EditCommand {
  public constructor(private readonly groupId: string, private readonly id: string) {}

  public execute(document: SvgDocument): string {
    document.reparent(this.id, this.groupId);
    return `${document.find(this.id)!.describe().type}#${this.id} moved into g#${this.groupId}`;
  }
}
