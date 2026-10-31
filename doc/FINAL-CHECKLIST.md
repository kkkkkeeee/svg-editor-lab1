# 最终提交前核验与建议清单

2026-10-31。所有路径相对仓库根。未暂存、提交、推送或创建标签。

类型检查、构建、246项测试（0失败/0跳过）、git diff --check通过；独立黑盒覆盖19命令、5常规场景和2拒绝回归；.NET交叉验证通过。F-01失败read的文档、路径、实际redo及IO禁用保持；合法实体/CDATA正常。无已知阻塞技术问题，既有SVG子集及资源限制仍适用。

README测试入口修正为14，当前进度与克隆步骤同步。三个正式Markdown的全部21个相对链接存在，以下A+B包含全部目标；B虽为可选证据，但若保留现有报告链接，建议一起提交，否则应先改为明确的本机证据文字，不能留下断链。原M8-A失败记录保留。

## A 应提交

- `src/infrastructure/SvgCodec.ts`
- `tests/infrastructure/StrictXml.test.ts`
- `package.json`
- `package-lock.json`
- `doc/README.md`
- `doc/M8-A-AUDIT.md`
- `doc/M8-B-REPORT.md`
- `doc/architecture-actual.puml`
- `doc/architecture-actual.svg`
- `doc/architecture-actual.png`
- `doc/patterns-actual.puml`
- `doc/patterns-actual.svg`
- `doc/patterns-actual.png`
- `doc/FINAL-CHECKLIST.md`

## B 可选，推荐本次纳入以保持报告链接完整

- `doc/M8-A-blackbox.mjs`
- `doc/M8-B-crosscheck.ps1`
- `doc/M8-A-evidence/results.json`
- `doc/M8-A-evidence/xml-validation.txt`
- `doc/M8-A-evidence/source-inventory.json`
- `doc/M8-A-evidence/preview.svg`
- `doc/M8-A-evidence/structure.svg`
- `doc/M8-A-evidence/roundtrip.svg`
- `doc/M8-A-evidence/architecture.puml`
- `doc/M8-A-evidence/architecture.svg`
- `doc/M8-A-evidence/architecture.png`
- `doc/M8-B-evidence/results.json`
- `doc/M8-B-evidence/xml-validation.txt`

以上为少量可复现脚本和文档引用的精简证据，不包含整目录。PNG保留是为了README/审计报告已有下载链接闭合。

## C 当前未跟踪但不提交

- `doc/M1-M5A-AUDIT.md`
- `doc/M1-M5A-blackbox.mjs`
- `doc/M8-A-evidence/bare-ampersand.svg`
- `doc/M8-A-evidence/cdata-close.svg`
- `doc/M8-A-evidence/copy.svg`
- `doc/M8-A-evidence/invalid.svg`
- `doc/M8-A-evidence/unnamed.svg`
- `doc/M8-B-evidence/bare-ampersand-old.svg`
- `doc/M8-B-evidence/bare-ampersand.svg`
- `doc/M8-B-evidence/bare-text.svg`
- `doc/M8-B-evidence/cdata-close-old.svg`
- `doc/M8-B-evidence/cdata-close.svg`
- `doc/M8-B-evidence/cdata.svg`
- `doc/M8-B-evidence/close-text.svg`
- `doc/M8-B-evidence/copy.svg`
- `doc/M8-B-evidence/invalid.svg`
- `doc/M8-B-evidence/numeric.svg`
- `doc/M8-B-evidence/overflow-reference.svg`
- `doc/M8-B-evidence/predefined.svg`
- `doc/M8-B-evidence/preview-readback.svg`
- `doc/M8-B-evidence/preview.svg`
- `doc/M8-B-evidence/roundtrip.svg`
- `doc/M8-B-evidence/structure.svg`
- `doc/M8-B-evidence/surrogate-reference.svg`
- `doc/M8-B-evidence/unknown-entity.svg`
- `doc/M8-B-evidence/unnamed.svg`
- `doc/M8-B-evidence/zero-reference.svg`
- `svg-editor-audit.zip`

另不提交已忽略的node_modules/、dist/、.npm-cache/（含PlantUML jar、独立安装副本和日志）、*.log。三个指定保护文件SHA-256与M8-A记录一致，未修改、删除或暂存。

## Git状态与提交建议

已跟踪修改为doc/README.md、package.json、package-lock.json、src/infrastructure/SvgCodec.ts，其余以上文件未跟踪（本清单亦新增）。暂存区为空，原223项测试文件无修改。7条历史提交保留。本地master、upstream及实时远程master均为0dc8a0646ead8e34ee11a62841127757819679cf。

建议第八次提交信息：

`fix: enforce strict XML validation and finalize Phase 1 documentation`

后续只能按审核后的显式文件列表暂存，不使用git add .。全新克隆安装步骤不依赖本机缓存或审计工具；本轮修复需提交推送后才出现在远程克隆中。此前隔离工作副本npm ci及246项测试已通过，本轮再次通过完整验证。最终提交/推送/final标签及截止时间仍待单独授权确认。
