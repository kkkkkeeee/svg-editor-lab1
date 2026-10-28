import type { SvgDocument } from "../../domain/SvgDocument.js";
import type { EditCommand } from "./EditCommand.js";

export class GroupCommand implements EditCommand {
  readonly #memberIds: readonly string[];

  public constructor(private readonly newId: string, memberIds: readonly string[]) {
    this.#memberIds = Object.freeze([...memberIds]);
  }

  public execute(document: SvgDocument): string {
    document.group(this.newId, this.#memberIds);
    return `g#${this.newId} created with ${this.#memberIds.length} children`;
  }
}
