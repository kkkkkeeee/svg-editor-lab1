import fs from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { DocumentStore } from "../application/DocumentStore.js";
import type { SvgDocument } from "../domain/SvgDocument.js";
import { SvgCodec } from "./SvgCodec.js";

/** 同目录临时文件完整写入并关闭后再替换目标，不先删除旧文件。 */
export class SvgFileStore implements DocumentStore {
  public constructor(private readonly codec = new SvgCodec()) {}

  public save(document: SvgDocument, path: string): void {
    let temporary: string | undefined;
    let descriptor: number | undefined;
    try {
      if (!path.trim()) throw new Error("empty path");
      const xml = this.codec.serialize(document);
      const target = resolve(path);
      const candidate = join(dirname(target), `.svg-editor-${randomUUID()}.tmp`);
      descriptor = fs.openSync(candidate, "wx");
      temporary = candidate; // 只清理本次成功独占创建的文件。
      fs.writeFileSync(descriptor, xml, "utf8");
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temporary, target);
      temporary = undefined;
    } catch (cause) {
      throw new Error(`cannot write file: ${path}`, { cause });
    } finally {
      // 清理失败不能把已经成功的保存误报为失败，也不能掩盖原始错误。
      if (descriptor !== undefined) {
        try { fs.closeSync(descriptor); } catch { /* 原始错误保留 */ }
      }
      if (temporary !== undefined) {
        try { fs.unlinkSync(temporary); } catch { /* 可能遗留本次临时文件，见 README */ }
      }
    }
  }
}
