import { SvgDocument, type DocumentDescription } from "../domain/SvgDocument.js";
import { CommandHistory } from "./CommandHistory.js";
import { DocumentFormatter } from "./DocumentFormatter.js";
import type { EditCommand } from "./commands/EditCommand.js";
import type { DocumentStore } from "./DocumentStore.js";
import type { ShapeDescription } from "../domain/Shape.js";

export class EditorSession {
  #document: SvgDocument | undefined;
  readonly #history = new CommandHistory();
  #defaultPath: string | undefined;

  public constructor(private readonly store?: DocumentStore) {}

  public get hasDocument(): boolean { return this.#document !== undefined; }

  public init(width = 800, height = 600): DocumentDescription {
    const candidate = new SvgDocument(width, height);
    this.#document = candidate;
    this.#defaultPath = undefined;
    this.#history.resetAfterIo();
    return candidate.describe();
  }

  public describe(): DocumentDescription {
    return this.requireDocument().describe();
  }

  public resizeCanvas(width: number, height: number): DocumentDescription {
    const candidate = this.requireDocument().clone();
    candidate.resize(width, height);
    const description = candidate.describe();
    // 验证及描述生成全部成功后才发布文档、清空历史。
    this.#document = candidate;
    this.#history.resetAfterIo();
    return description;
  }

  public snapshot(): SvgDocument { return this.requireDocument().clone(); }

  public save(path?: string): string {
    const document = this.requireDocument();
    const target = path ?? this.#defaultPath;
    if (target === undefined) throw new Error("no save path. specify a file path");
    if (!target.trim()) throw new Error(`cannot write file: ${target}`);
    const snapshot = document.clone();
    const count = this.countElements(snapshot.describe().children);
    const message = `saved to ${target} (${count} elements)`;
    try {
      if (!this.store) throw new Error("document store unavailable");
      this.store.save(snapshot, target);
    } catch (cause) {
      throw new Error(`cannot write file: ${target}`, { cause });
    }
    this.#defaultPath = target;
    this.#history.resetAfterIo();
    return message;
  }

  private countElements(nodes: readonly ShapeDescription[]): number {
    return nodes.reduce((count, node) => count + 1 + this.countElements(node.children ?? []), 0);
  }

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
