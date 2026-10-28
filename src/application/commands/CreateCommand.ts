import { ShapeFactory } from "../../domain/ShapeFactory.js";
import type { SvgDocument } from "../../domain/SvgDocument.js";
import type { EditCommand } from "./EditCommand.js";

export class CreateCommand implements EditCommand {
  private readonly params: readonly string[];

  public constructor(
    private readonly type: string,
    private readonly id: string,
    params: readonly string[],
    private readonly parentId: string | null = null,
  ) {
    this.params = Object.freeze([...params]);
  }

  public execute(document: SvgDocument): string {
    const shape = new ShapeFactory().createFromTokens(this.type, this.id, this.params);
    document.add(shape, this.parentId);
    return `${shape.describe().type}#${shape.id} created`
      + (this.parentId === null ? "" : ` in g#${this.parentId}`);
  }
}
