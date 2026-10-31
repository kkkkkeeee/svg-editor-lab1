# M8-B 修复与交付整理

日期：2026-10-30～31。基线：0dc8a0646ead8e34ee11a62841127757819679cf。修复与验证完成，等待人工审核；未暂存、提交、推送或创建标签。

## F-01 根因与修复

实际阅读 xmldom 0.9.12 的 sax.js/entityReplacer/appendText 和 DOMParser 配置发现：裸 & 未匹配实体替换规则，普通字符数据的 ]]> 也未报告错误。onError 一律抛错只能处理库已经报告的诊断；原 escape 只验证码点，不能验证 XML 语法。

仅修改 SvgCodec：deserialize 先调用私有 validateXml，使用 saxes 6.0.0 的命名空间感知 XML 1.0 解析，error 立即抛出，doctype 直接拒绝，全部完成后才进行原 DOM/领域转换。没有正则解析 XML，没有第二套模型，没有修改 EditorSession 或 CommandHistory。

新增运行依赖 saxes 6.0.0 和传递依赖 xmlchars 2.2.0，锁文件一致。saxes 的 non-validating 指不做 DTD/schema 有效性验证，仍进行良构性检查。本项目拒绝所有 DTD，不注册自定义实体或加载外部资源。代价是维护两个解析库和两次解析；比重写现有 DOM 转换更小，升级库时须重跑严格 XML 回归。

| 反例 | 修复前（M8-A证据） | 修复后 |
| --- | --- | --- |
| 普通文本 a & b | read成功，旧文档被替换，redo丢失 | cannot read file，旧图形及redo保留 |
| 普通文本 a ]]> b | 同上 | 同上 |

合法预定义实体、数字引用和 CDATA 正常保留；合法相邻 CDATA 可组合出文本 ]]>，并未简单禁用字符。SVG 子集白名单、自动 ID、六种类及历史边界保持原样。

## 测试与独立证据

新建 StrictXml.test.ts：16项非法输入、3项合法输入往返、3项读取原子性、1项CLI继续执行，共23项。原有223项测试文件和断言未修改。

原子性测试比较完整文档描述，实际 redo 恢复移动、undo 恢复原状，再无参数 save 验证旧路径；坏输入文件字节不变。保存后的失败 read 仍保持 IO 禁用，且不提前发布自动 ID 警告。

| 验证 | 实际结果 |
| --- | --- |
| typecheck / build | 退出0 |
| 完整自动化测试 | 246通过，0失败，0跳过 |
| 独立副本 npm ci / typecheck / build / test | 全通过，246项测试 |
| 修订后的 M8-A-blackbox.mjs | 全19命令、5常规场景、2拒绝回归通过 |
| M8-B-crosscheck.ps1 | 9项良构性判定.NET与Codec一致；4份CLI文件.NET接受 |
| PlantUML两图检查/渲染 | 通过，AI已查看PNG |

完整输入、输出和退出码见 [results.json](M8-B-evidence/results.json)，交叉验证见 [xml-validation.txt](M8-B-evidence/xml-validation.txt)。旧 M8-A-evidence 未覆盖；当前黑盒脚本改为“拒绝非法XML且保留旧状态”才通过，输出至 M8-B-evidence。

真实文件检查包含六类型、层级、顺序、中文、特殊字符、缺省样式，课程 other.svg 原测试继续通过。preview.svg 经 save/read/save 得到 preview-readback.svg，字节相同；本轮用户再次确认 SVG Preview “正常显示”。这属于用户视觉验证，不声称 AI 操作了 VS Code。

隔离副本位于忽略目录 .npm-cache/m8b-clean-20261030，复制本轮src/tests和工程配置，不复制依赖/构建产物。Windows、Node20.9/npm10.1，npm ci added9/audited10。首次安装遇沙箱DNS限制，授权后成功；首次测试因沙箱临时目录文件替换限制失败10项，授权环境全部通过，未修改断言或保存策略。

## F-02 与交付材料

README顶部更新实际状态，新增安装/全命令示例、实际架构及模式图、兼容范围和修复记录，保留历史计划及失败事实。architecture-actual.puml、patterns-actual.puml 已实际渲染SVG/PNG。初次图渲染因包名与组件别名冲突失败，修改图内别名后通过，没有业务重构。

| 材料 | 后续提交建议 |
| --- | --- |
| SvgCodec、StrictXml.test、package.json/lock | 必要修复文件 |
| README、M8-A-AUDIT、M8-B-REPORT、两份实际puml/svg | 建议作为正式文档 |
| M8-A-blackbox.mjs、M8-B-crosscheck.ps1 | 建议保留可复现脚本；从根目录执行，先build；后者需.NET |
| 两个evidence目录的results.json、xml-validation.txt | 可精选保留前后证据，含本机路径，不是运行依赖 |
| 反例SVG、副本、PNG、旧架构图、清单 | 辅助证据，按需精选，不盲目提交整个目录 |
| .npm-cache、node_modules、dist、PlantUML jar、日志和旧ZIP | 不提交；不删除用户文件 |

三个指定保护文件未改，SHA-256与M8-A记录一致：M1-M5A-AUDIT.md、M1-M5A-blackbox.mjs、svg-editor-audit.zip。构建/依赖/缓存被.gitignore排除。后续使用显式文件清单暂存，不自动纳入审计材料。

未发现剩余阻塞技术问题。已知限制仍包括同步IO、全量快照、深层递归资源消耗、终端控制字符防护、严格SVG子集。文件同目录临时替换不保证跨平台原子性、断电持久性、并发互斥或ACL/inode保留。审核、最终提交/推送、截止日期与final标签仍待单独处理，不能宣称最终交付完成。
