import type { SvgDocument } from "../domain/SvgDocument.js";
import type { EditCommand } from "./commands/EditCommand.js";

interface HistoryEntry {
  readonly before: SvgDocument;
  readonly after: SvgDocument;
  readonly summary: string;
}

export interface EditResult {
  readonly document: SvgDocument;
  readonly message: string;
}

export class CommandHistory {
  #undo: HistoryEntry[] = [];
  #redo: HistoryEntry[] = [];
  #blocked = true;

  public resetAfterIo(): void {
    this.#undo = [];
    this.#redo = [];
    this.#blocked = true;
  }

  public execute(command: EditCommand, current: SvgDocument): EditResult {
    const before = current.clone();
    const candidate = current.clone();
    const summary = command.execute(candidate);
    const after = candidate.clone();
    const result = { document: after.clone(), message: summary };
    // 所有可能失败的命令/克隆完成后才改变历史，失败不清空 redo。
    this.#undo.push({ before, after, summary });
    this.#redo = [];
    this.#blocked = false;
    return result;
  }

  public undo(): EditResult {
    this.checkAllowed();
    const entry = this.#undo.at(-1);
    if (!entry) throw new Error("nothing to undo");
    const document = entry.before.clone();
    this.#redo.push(entry);
    this.#undo.pop();
    return { document, message: `undone: ${entry.summary}` };
  }

  public redo(): EditResult {
    this.checkAllowed();
    const entry = this.#redo.at(-1);
    if (!entry) throw new Error("nothing to redo");
    const document = entry.after.clone();
    this.#undo.push(entry);
    this.#redo.pop();
    return { document, message: `redone: ${entry.summary}` };
  }

  private checkAllowed(): void {
    if (this.#blocked) throw new Error("undo not allowed after io command");
  }
}
