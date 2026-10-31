# M8-A 独立综合审计

审计日期：2026-10-30（Asia/Shanghai）。审计基线：`0dc8a0646ead8e34ee11a62841127757819679cf`，master。审计者：AI 编程助手；视觉验证由用户在 VS Code SVG Preview 中完成。

## 1. 结论与证据边界

**可以进入 M8-B 的修复和交付整理，但当前版本不应直接作为最终交付版本。** 发现一项阻塞最终交付的问题：非法 XML 的裸 `&` 和普通文本中的 `]]>` 被 read 接受，导致旧文档被替换、redo 被清空。必须先修复严格 XML 校验并增加回归测试。此次不修改生产代码、现有测试、配置或 Git 历史。

三个证据维度分别判定，不能互相推导：

- **A 自动化测试：通过。** 原工作区和独立干净安装副本均为 223 通过、0 失败、0 跳过。原有测试遗漏了本次反例。
- **B 编译后 CLI：部分满足。** 19 条命令的 5 个正常/预期错误场景通过；另两个非法 XML 场景确认不符合严格拒绝要求。CLI 进程均正常退出不代表输入业务语义正确。
- **C 源码架构：通过本轮检查。** 32 个 TypeScript 源文件、29 个类，一类一文件；Command/Composite 实质成立，未发现四层反向依赖。但架构正确不能证明 XML 库拒绝所有坏输入。

依据为课程原件 `D:/learning/读研/1.1/高级软件开发/phase_cli_1.md` 全文、当前 README、全部 src 源码、现有测试及配置。课程第 2 节失败不改变状态和第 3 节 SVG 读取为最终依据；M7 用户进一步明确要求拒绝非法 XML。README 的“严格解析”等文字不是正确性证明。以前 M7 验收未发现缺陷的记录保留为历史，本报告以新反例补充修正结论。

证据文件：

- [独立黑盒脚本](M8-A-blackbox.mjs)：只启动 dist/main.js，不导入领域、会话或命令类。
- [完整输入、stdout、stderr、退出码](M8-A-evidence/results.json)：覆盖清单、正常场景及反例分别记录。
- [.NET XML 交叉验证](M8-A-evidence/xml-validation.txt)：避免只用生产所用的同一解析库证明 XML 合法性。
- [源文件、类与 import 清单](M8-A-evidence/source-inventory.json)。
- [CLI 生成的预览 SVG](M8-A-evidence/preview.svg)、[结构结果](M8-A-evidence/structure.svg)、[往返结果](M8-A-evidence/roundtrip.svg)。
- [原 PlantUML](M8-A-evidence/architecture.puml)、[实际 SVG 渲染](M8-A-evidence/architecture.svg)、[PNG 渲染](M8-A-evidence/architecture.png)。

这些是独立审计材料，不是新增业务功能或自动化测试计数；未来是否提交由用户决定。

## 2. 需求追踪矩阵

表内业务模块路径位于 src/，测试文件位于 tests/；方法名定位实际源码。A/B/C 含义见上节。课程明确要求记为“原文”，细节选择记为“约定”。“满足”限于所列证据，不声称穷尽所有输入。

| 课程条款/要求 | 实现位置 | 测试位置及代表测试 | 验证结果 | 风险/约定 |
| --- | --- | --- | --- | --- |
| §2/§6 提示符、欢迎语、逐行交互 | cli/ConsoleRenderer.welcome/prompt；CliApplication.run | EnvironmentCheck；Cli.test「管道一次输入多行…EOF」 | A/B/C 满足 | 本轮 EOF 真实进程通过；Ctrl+C 本轮仅既有模拟测试，历史 M3 有真实 TTY 证据 |
| §2 # 整行注释，不吞颜色 | cli/CommandParser.parse | Cli.test「空行、缩进注释及颜色参数」；黑盒 all-19 | A/B 满足 | 允许前导空白为约定；命令中 # 保留 |
| §2 双引号、中文/空格 | CommandParser.parse | Cli.test「双引号保留空格、中文和空参数」「引号内仅转义…」 | A/B 满足 | 转义双引号/反斜杠、拒绝粘连为项目约定 |
| §2 错误前缀、一行、继续接收 | ConsoleRenderer.error；CliApplication.run | Cli.test「拒绝未闭合…」；黑盒 wat/move 参数不足/未闭合引号 | A/B 满足 | error 消息 CR/LF 被折叠，普通成功文本未全面清理终端控制字符，见限制 |
| §3 `help` | application/CommandDispatcher.dispatch | Cli.test「全部 19 个命令均标注实现状态」 | A/B 满足 | 无文档也可 help，由启动提示支持 |
| §3 `init [w] [h]` 默认800×600 | Dispatcher.dimension；EditorSession.init | Cli.test 默认/指定/单宽/重复 init；CreateHistory「init 失败不丢弃…」 | A/B/C 满足 | 单参数只改宽、高600为约定；成功清路径 |
| §3 `canvas [w] [h]` | EditorSession.resizeCanvas；Dispatcher canvas 分支 | DeleteCanvas「默认查询不改变…」「修改保留整树…」 | A/B 满足 | 一个参数 usage 拒绝为已审核约定；查询不清历史 |
| §3/4.1 `create type id params [in id]` | CreateCommand.execute；ShapeFactory.construct；SvgDocument.add | CreateHistory 六类型/in/错误参数系列 | A/B/C 满足 | 未实现 box 按原文拒绝；in 目标校验归文档 |
| §4.1 六类几何和省略样式 | domain/shapes 六类；Shape.description/setStyle | Shapes.test「创建且不补默认样式」；SvgCodec 六类型测试 | A/B/C 满足 | 零尺寸合法、负尺寸拒绝；缺省 fill/stroke 不物化 |
| §3 `move id dx dy` | MoveCommand.execute；SvgDocument.move/edit；各类move | BasicEdit「负数/浮点移动…」「Group…」 | A/B 满足 | 增量摘要而非逐字复刻示例 moved to，不影响语义 |
| §3 `scale id factor` 全几何缩放 | ScaleCommand；各类scale；Group.scale | BasicEdit「后代溢出原子性及 redo」；黑盒 atomic | A/B/C 满足 | stroke-width 是样式不随几何缩放；非正数原文提示 |
| §3/4.1 `set id attr value` 白名单 | SetCommand.execute；Shape.set；各叶子setGeometry | Shapes/BasicEdit「全部几何和公共样式白名单」 | A/B/C 满足 | id/其他类型属性拒绝；g 样式继承不覆盖孩子 |
| §3 `delete id` 连同子树 | DeleteCommand.execute；SvgDocument.delete | DeleteCanvas「删除嵌套子树是单个单元…」 | A/B/C 满足 | 黑盒删除/undo/redo/undo 后子树保留 |
| §3 `group newGid ids…` | GroupCommand；SvgDocument.group/collectGroupMembers | GroupUngroup「同父…不相邻」「跨父…」「所有非法参数…」 | A/B/C 满足 | 原文只说相对顺序；采用原树遍历、同父最早位置/跨父根末尾 |
| §4.2 祖先和后代同时选中 | SvgDocument.collectGroupMembers | GroupUngroup 非法参数；黑盒 atomic | A/B 满足 | 精确错误 `cannot group a container into its own descendant: g` |
| §3 `ungroup gid` 原位提升 | UngroupCommand；SvgDocument.ungroup | GroupUngroup「原位提升…」「空嵌套组…」；黑盒 structure | A/B/C 满足 | 空组移除；移除继承样式会改变外观是已记录 SVG 语义 |
| §4.2 禁止根级 ungroup | SvgDocument.ungroup | GroupUngroup「错误精确匹配…」；黑盒 all-19 | A/B 满足 | 普通叶子 not a container；box 专属规则不适用 Phase1 |
| §3 `addto gid id` 末尾追加、循环拒绝 | AddToCommand；SvgDocument.reparent | HierarchyOrder「容器参数在前…」「结构错误/循环…」 | A/B/C 满足 | 同父追加也算成功编辑；循环错误采用项目既有语义 |
| §3 `front id`/`back id` 同级顺序 | FrontCommand/BackCommand；reparent | HierarchyOrder「根层/嵌套兄弟顺序」；SvgCodec「front/back…」 | A/B 满足 | front→末尾，back→开头；实际保存数组顺序检查通过 |
| §3/5 `tree [id]` | DocumentFormatter.tree/branches | CreateHistory「tree/show…」；黑盒多次 tree | A/B 满足 | 显示 width/height 全名，不用示例 w/h 缩写 |
| §3/5 `show id` 父级与属性 | EditorSession.show；DocumentFormatter.show | CreateHistory「tree/show…」；黑盒 show r | A/B 满足 | 根级 parent=svg，未进入历史 |
| §3/4.3 `undo`/`redo` | CommandHistory.execute/undo/redo | CreateHistory 快照独立/失败命令系列；混合历史测试 | A/B/C 满足正常输入 | 命令仅存稳定参数；完整快照隔离；F-01 是错误输入误判成功造成边界丢失 |
| §4.3 一编辑一历史、查询不入栈 | EditorSession.execute；CommandHistory | GroupUngroup 混合历史；DeleteCanvas 查询 | A/B/C 满足 | 无效果编辑仍入栈是项目约定 |
| §4.3 init/read/save/canvas 修改后禁用 | EditorSession 文档操作；resetAfterIo | CreateHistory/SaveIo/ReadIo/DeleteCanvas 边界测试 | A/B/C 正常操作满足 | 失败编辑不解禁；F-01 影响非法 read |
| §2 ID唯一、大小写敏感 | SvgDocument.commit/checkIds；Shape constructor | Tree「全文档重复 id 拒绝，区分大小写」 | A/B/C 满足 | id 非空且无空白，未完全验证任意 SVG/XML id 命名约束 |
| §2 缺 ID 标签+序号、warning | SvgCodec.deserialize/restore | SvgImport「先收集后续显式 ID…」；黑盒 auto-id | A/B/C 满足 | 全显式 ID 预扫描，深度优先顺序；空属性不是“缺失” |
| §3 `read file.svg`、§6 other.svg | SvgFileStore.read；SvgCodec.deserialize；EditorSession.read | ReadIo/SvgImport other.svg及往返 | **部分满足，F-01 阻塞** | 可靠处理已测子集，但坏 XML 并非全部拒绝 |
| §3 `save [file.svg]`、默认读入路径 | EditorSession.save；SvgFileStore.save；SvgCodec.serialize | SaveIo 显式/默认/失败覆盖；ReadIo 路径转换 | A/B/C 满足 | 成功显式save更新默认路径属约定；临时替换限制见§6 |
| §0 SVG 读写/嵌套/预览 | SvgCodec；真实 save 文件 | SvgCodec/SaveIo/ReadIo；黑盒 preview | A/B 满足支持子集 | 用户本轮确认 VS Code 正常显示；不能推导所有浏览器相同 |
| §2.1 OOP/一类一文件/多态 | Shape派生类、10个编辑命令、各层类 | Shapes/Tree；source-inventory.json | C 满足 | readonly 描述是传输结果，不替代领域行为 |
| §2.1 名字分派只两处 | Dispatcher.dispatch、Factory.construct | 全源码逐文件审查、import/AST清单 | C 满足 | codec tag白名单、text能力判断和box降级不是新类构造分派 |
| §1.2 架构/模式/依赖/取舍/AI过程 | doc/README.md §3～7及历史章节 | 本轮文档与PlantUML验证 | 部分需整理，F-02 | 内容齐备，计划态表述和当前进度滞后 |
| §1.1 分步 Git/远程/final | 7条提交及 origin/master | git log、实时 ls-remote | 分步推送满足；final待安排 | 不应本轮创建；截止日期未知，不宣称交付完成 |

## 3. 全源码架构审计

读取全部 32 个 src 文件，AST 导出类名和 import；29 个类均各自与文件同名，其余为接口/入口。清单保存在 source-inventory.json。

| 范围 | 实际职责与检查结论 |
| --- | --- |
| cli 三类 | CommandParser 只分词；ConsoleRenderer 只输出；CliApplication 管理 readline/EOF/SIGINT 和错误捕获。无 domain/infrastructure/fs import |
| application | Dispatcher 集中命令名分派，10 个独立 EditCommand 执行业务，Session 管理当前文档与路径，History 管快照，Formatter 管只读显示，NumericArgument 管数字输入，DocumentStore 定义存储契约。没有直接 infrastructure/fs 依赖 |
| domain | Shape 封装 id/style，各叶子封装几何；Group 拥有复制后的孩子，递归多态操作；SvgDocument 拥有整树、统一结构修改和 ID 检查；ShapeFactory 唯一类型到类构造分派。没有反向依赖 |
| infrastructure | SvgCodec 转换 XML 与领域对象；SvgFileStore 负责磁盘，implements DocumentStore。只在完成读取后交付候选文档 |
| main | 创建存储、会话、分发、解析、显示、REPL，只有组装和启动，不承载编辑业务 |

Command 模式实质成立：Dispatcher 构造命令，Session.execute 调 History，History 在候选文档执行 `command.execute` 后才发布与记账。快照没有替代命令封装。命令只保存 id、数值、冻结参数集合，不保存旧 Shape。

Composite 实质成立：Group extends Shape，共享 move/scale/set/clone；move/scale 对候选孩子递归多态调用，成功才替换。文档查询返回克隆，withChildren 不暴露内部可变数组。结构复杂度/重复克隆是明确取舍，不建议为“整洁”全局重构。

同一历史管理器覆盖所有编辑；init/read/save/canvas 成功后重置，读取/保存成功发布之前失败不会改会话。没有发现正常流程跨文档污染。F-01 的根因是错误 XML 被当成成功导入，而非 resetAfterIo 本身错误。

可接受的重复：数字语法在 Dispatcher.dimension、NumericArgument、Factory.numeric、Codec.number 存在少量重复，分别服务输入边界；Group/Document 都检查 ID 以维护各自不变量。暂不构成交付阻塞，不建议为了统一创建通用事务/插件框架。

## 4. 黑盒记录与文件证据

执行 `node doc/M8-A-blackbox.mjs`，直接使用 dist/main.js。当前脚本运行退出 0 意味着“正常场景符合断言且缺陷被成功复现”，**不表示非法 XML 验收通过**。完整输入/输出/各进程退出码在 results.json。

| 场景 | 关键输入与实际结果 | 判定 |
| --- | --- | --- |
| all-19-and-history | help 全19条；无文档tree错误；六类型/两层组；move/scale/set；排序/分组解散/删除多次undo-redo；重复id/循环/根组解散错误；save/read/canvas边界；未知命令/未闭合引号后show继续 | 通过 |
| 文件失败保留 | save成功→move→undo→read坏XML→show旧值→redo→无参数save；再move→undo→save目录失败→redo→save | 已被识别的错误读写通过；roundtrip r.x=41，y=60，width=200，缺省stroke保留 |
| 节点顺序 | 最终outer孩子 e/nested/l，nested孩子 r/t/c；copy.svg与roundtrip.svg逐字节一致 | 通过，包含实际文件结构断言 |
| auto-id | 后面有显式 rect1；前面无名 g/rect 输出 g1、rect2 警告；移动rect2后默认保存 | 通过，XML孩子rect2/rect1，rect2.x=5 |
| cross-parent-and-order | 跨父group gathered c r→tree→undo→tree→redo→tree；移入left再ungroup/undo/redo | 通过，比较完整tree输出；最终left孩子keep/r/c，right为空 |
| overflow-and-ancestor-rejection | 后代cx=1e308；move g 1e308 0 / scale g 2失败；group bad g huge失败；redo仍创建later | 通过，正常兄弟几何仍1/2/3/4，课程祖先错误精确匹配 |
| visual-preview | 真实CLI save生成六种类型/嵌套/中文和特殊字符SVG | .NET XML接受；2026-10-30用户回复“正常显示” |
| bare-ampersand | 普通文本`a & b`导入 | **缺陷复现：显示read成功、旧old不存在、redo被禁用** |
| cdata-close | 普通文本`a ]]> b`导入 | **同上**；两个反例.NET XML均明确拒绝 |

提示符和欢迎语实际存在；各子进程退出0、stderr为空，错误信息按项目约定在stdout。退出码0仅说明REPL按EOF结束。正常输出SVG经另一套.NET XML实现解析接受，中文/形状视觉反馈为用户观察，AI未声称直接操作VS Code。

## 5. 干净环境复现与 PlantUML

隔离方式：`git archive HEAD` 导出已提交文件，解压到 `.npm-cache/m8-clean-20261030`。未复制原 node_modules/dist/cache，也未删除原工作区任何依赖或审计材料。副本内 `.npmrc` 使用副本自己的 `.npm-cache`。

环境：Windows、PowerShell、Node v20.9.0、npm 10.1.0；TypeScript/tsx/@types/node/XML库版本由锁文件固定。此次不是另一操作系统或另一Node版本的验证。

| 命令 | 原工作区 | 独立副本 |
| --- | --- | --- |
| npm.cmd ci | 不执行，避免破坏原依赖 | 成功，added7/audited8，23秒，npm报告0 vulnerabilities |
| npm.cmd run typecheck | 退出0 | 退出0 |
| npm.cmd run build | 退出0 | 退出0 |
| npm.cmd test | 223通过/0失败/0跳过 | 223通过/0失败/0跳过 |
| git diff --check | 无空白错误 | 不适用：归档副本不含.git |

ci 和副本磁盘测试使用授权执行环境，避免此前沙箱对临时文件 rename 的限制。下载网络本轮成功；没有在本轮出现需要重试的网络失败。npm 的漏洞审计输出不能代替本报告的独立安全检查。package/lock一致，XML库是运行依赖；没有为了审计新增项目依赖。

PlantUML：从 README 提取原始源码，下载 Maven Central 的 PlantUML 1.2024.8 独立jar到忽略目录（不是项目依赖），使用本机 Java8：

```text
java -jar .npm-cache/m8-plantuml.jar -checkonly doc/M8-A-evidence/architecture.puml
java -jar .npm-cache/m8-plantuml.jar -tsvg doc/M8-A-evidence/architecture.puml
java -jar .npm-cache/m8-plantuml.jar -tpng doc/M8-A-evidence/architecture.puml
```

语法检查和渲染退出0；SVG8575字节、PNG23093字节。AI实际查看PNG，图完整可读，没有错误占位图。标题仍为 planned dependencies，README也明确说是计划。建议M8-B添加实际架构图：删去实际main没有的直接domain依赖，标明SvgFileStore实现DocumentStore、SvgCodec依赖domain；保留计划图或注明版本演进，而非改写历史。

## 6. 问题分级、复现与最小建议

### F-01：阻塞最终交付——非法 XML 静默接受并替换文档

证据等级：**代码及真实CLI已验证**，两个独立反例由.NET XML交叉拒绝。

位置：`src/infrastructure/SvgCodec.ts:23` deserialize 的DOMParser错误回调、`:68` restore；随后 `src/application/EditorSession.ts:41` 按成功结果发布。解析器对某些坏字符数据不触发onError，escape仅检查码点合法性，不能发现XML引用语法错误。现有测试和生产使用同一库，扩大了盲区。

最小 bad.svg（把内容替换为 `a ]]> b` 可复现第二种）：

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text id="t" x="1" y="2">a & b</text></svg>
```

```text
init
create g old
move old 1 1
undo
read bad.svg
show old
redo
```

实际：`read bad.svg (1 elements)`；`error: no such shape: old`；`error: undo not allowed after io command`。预期：cannot read file，旧文档和redo保持。它不意味着所有正常read都污染历史，而是无效文档被错误认作有效。

M8-B最小建议：在Codec内使用真正严格的XML良构校验器/解析配置，在构造或发布前失败；若当前库无严格模式，评估小型严格XML解析器替换或前置验证。不能用正则重新实现XML树，也不能对原始XML全局禁止`&`或`]]>`（合法实体、CDATA边界应允许）。补充文本和属性中的裸&、非法引用、普通字符数据中的]]>，并验证合法&amp;、字符引用及CDATA仍可用；读取失败必须检查完整文档、默认路径和实际redo。不要重构历史管理器。

### F-02：建议修复——当前文档与实际状态不完全同步

证据等级：源码/文档对照已验证。README顶部仍停在M7待提交语气；部分设计章节仍说暂定/M1未实现；目录遗漏m6b-save-preview.svg。计划图有效，但不能充当精确实际依赖图（main没有直接import domain）。

M8-B建议：新增清晰当前状态/实际架构小节、补目录和运行示例、链接已渲染图、把旧计划与已实现约定区分。保留历史测试数量及失败过程，不删改旧事实。尤其要更正“任何非法XML都拒绝”的现状声明，待F-01修复后重新验证。

### F-03：已知限制及交付手续风险

- 导入只支持显式几何、无单位、六元素和匹配画布的viewBox；背景transform例子被拒绝。此为已审核约定，不误报为缺少整个read功能；如老师要求更广兼容，应先确认，不能默默扩展。
- 同步IO、递归复制、历史无容量上限；超大/极深文档资源消耗未做压力验证。不能宣称抗拒绝服务。
- 同目录临时文件避免先截断目标；已测试写入/rename失败保留旧文件。不保证断电持久性、跨平台原子性、并发互斥、ACL/inode或符号链接语义；崩溃可遗留临时文件。正常save覆盖目标是明确功能，不是擅自破坏。
- 文本、样式等输入未全面约束终端控制字符；本轮未验证终端逃逸利用。若面向不可信外部输入，可在输出边界转义，属于建议防护，非已证明严重漏洞。
- 未发现已跟踪凭据/私钥，但模式扫描不是秘密零泄露证明。只验证Windows/Node20.9；package未声明engines，建议交付文档明确已测试版本。
- final标签尚不存在、截止日期未知：按用户本轮限制不创建。这是最终交付前待办，不是M8-A必须执行的操作。

## 7. Git与文件安全

本轮开始只有三个旧未跟踪文件，已跟踪工作区干净；无暂存变更。master、本地origin/master及实时GitHub master均为0dc8a0646ead8e34ee11a62841127757819679cf。7条提交分别为82eca1b、6997b13、7607642、22d4fa6、cd5f287、1c9d586、0dc8a06，体现M1～M7渐进过程。

.gitignore排除node_modules/dist/.npm-cache/*.log；git ls-files未列出依赖、构建、缓存、ZIP、pem/key/env。源码、测试、示例、README、配置凭据模式扫描无匹配；未打印任何凭据。审计副本和PlantUML jar均在忽略目录，测试文件/反例在本轮独立证据目录，不应误当交付示例。

禁止触碰文件的SHA-256（与M6/M7记录一致）：

| 文件 | SHA-256 |
| --- | --- |
| doc/M1-M5A-AUDIT.md | 263C8D3FDDF4D65247CA46AEED0EDCDD063F9F1E541212B180AA794CA0F17DB6 |
| doc/M1-M5A-blackbox.mjs | 3A2E278D2C36B8F2B973F21DC1A610A213F5D39B5222D043CBD4C1AC4DDCFE5E |
| svg-editor-audit.zip | E38208AD90C15B9CCE62D4E8C5B07BD83967679D845ED527A815D3CDD1371014 |

本轮仅README追加审计记录，新建M8-A报告、黑盒脚本和证据；没有改src/tests/package，未git add/commit/push/tag。

## 8. M8-B进入条件与建议顺序

1. 优先修复F-01；用本报告反例补严格XML测试，确保拒绝后不丢旧状态/路径/redo，再跑全部回归和独立CLI。
2. 同步实际架构图、当前进度、导入范围及运行说明，保留历史；明确正常用例通过不等于任意XML输入安全。
3. 复核最终示例、干净安装与视觉证据，决定哪些审计材料进入仓库；坏XML样例必须标为测试反例，不能混入正常示例说明。
4. 用户审核后再安排最后提交、推送、截止日期和final标签。本报告不是最终交付完成证明。

结论：基础业务、模式与工程复现证据充分，允许进入有明确修复目标的M8-B；**F-01未修复前，不建议进入“无需修改、只打标签”的最终交付流程。**

## 9. 后续修复索引（2026-10-31）

上述历史结论不改写。M8-B修复及246项复验见 [M8-B-REPORT.md](M8-B-REPORT.md)。当前黑盒脚本已改为拒绝非法XML且保留旧状态才通过，写入M8-B-evidence；M8-A-evidence/results.json保留原始失败记录。最终提交及标签仍待人工审核。
