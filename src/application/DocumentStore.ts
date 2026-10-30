import type { SvgDocument } from "../domain/SvgDocument.js";

export interface DocumentReadResult {
  readonly document: SvgDocument;
  readonly warnings: readonly string[];
}

/** 正常返回表示完整操作成功；失败抛错，不修改调用者文档。 */
export interface DocumentStore {
  read(path: string): DocumentReadResult;
  save(document: SvgDocument, path: string): void;
}
