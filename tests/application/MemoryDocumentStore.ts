import type { DocumentStore } from "../../src/application/DocumentStore.js";
import type { SvgDocument } from "../../src/domain/SvgDocument.js";

/** 只用于应用层隔离测试，无 fs 或 infrastructure 依赖。 */
export class MemoryDocumentStore implements DocumentStore {
  public readonly documents = new Map<string, SvgDocument>();
  public fail = false;

  public save(document: SvgDocument, path: string): void {
    if (this.fail) {
      document.delete(document.children[0].id); // 即使坏适配器改了候选，也不能污染会话。
      throw new Error("simulated storage failure");
    }
    this.documents.set(path, document.clone());
  }
}
