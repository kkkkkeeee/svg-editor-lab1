import { SvgDocument, type DocumentDescription } from "../domain/SvgDocument.js";
import { CommandHistory } from "./CommandHistory.js";
import { DocumentFormatter } from "./DocumentFormatter.js";
import type { EditCommand } from "./commands/EditCommand.js";

export class EditorSession {
  #document: SvgDocument | undefined;
  readonly #history = new CommandHistory();

  public get hasDocument(): boolean { return this.#document !== undefined; }

  public init(width = 800, height = 600): DocumentDescription {
    const candidate = new SvgDocument(width, height);
    this.#document = candidate;
    this.#history.resetAfterIo();
    return candidate.describe();
  }

  public describe(): DocumentDescription {
    return this.requireDocument().describe();
  }

  public snapshot(): SvgDocument { return this.requireDocument().clone(); }

  public execute(command: EditCommand): string {
    const result = this.#history.execute(command, this.requireDocument());
    this.#document = result.document;
    return result.message;
  }

  public undo(): string {
    this.requireDocument();
    const result = this.#history.undo();
    this.#document = result.document;
    return result.message;
  }

  public redo(): string {
    this.requireDocument();
    const result = this.#history.redo();
    this.#document = result.document;
    return result.message;
  }

  public tree(id?: string): string {
    return new DocumentFormatter().tree(this.describe(), id);
  }

  public show(id: string): string {
    const document = this.requireDocument();
    const shape = document.find(id);
    if (!shape) throw new Error(`no such shape: ${id}`);
    return new DocumentFormatter().show(shape.describe(), document.getParentId(id));
  }

  private requireDocument(): SvgDocument {
    if (!this.#document) throw new Error("no document. use 'init' or 'read' first");
    return this.#document;
  }
}
