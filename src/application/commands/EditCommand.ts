import type { SvgDocument } from "../../domain/SvgDocument.js";

/** 编辑对象只修改执行入口提供的候选文档；历史事务由 CommandHistory 负责。 */
export interface EditCommand {
  execute(document: SvgDocument): string;
}
