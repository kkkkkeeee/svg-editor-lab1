import type { SvgDocument } from "../../domain/SvgDocument.js";
import type { EditCommand } from "./EditCommand.js";

export class BackCommand implements EditCommand {
  public constructor(private readonly id: string) {}

  public execute(document: SvgDocument): string {
    document.reparent(this.id, document.getParentId(this.id), 0);
    return `${document.find(this.id)!.describe().type}#${this.id} sent to back`;
  }
}
