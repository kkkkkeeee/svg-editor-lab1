import type { SvgDocument } from "../domain/SvgDocument.js";

/** 正常返回表示写入成功；失败必须抛错，不修改传入的文档。 */
export interface DocumentStore {
  save(document: SvgDocument, path: string): void;
}
