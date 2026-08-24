# 当前的 Repa

本章按与文档同一 Git revision 的代码介绍当前系统。它回答“今天实际怎样运行”，便于共同建设者定位行为、阅读实现，并把新的观察带回前面的产品问题。

这份说明拥有当前实现事实，不拥有下一版架构。后续重构应先从 [Product constitution](../docs/foundation/00-product-origin.md#product-constitution) 和 [跨实现行为 oracle](learning-situations.md#四个跨实现行为-oracle) 推导需要保留的学习行为，再把本章和源码当作 behavior/problem evidence。候选新内核与当前实现、ADR 和 roadmap 的冲突集中记录在 [Gate 23 之后的重构方向](../docs/research/repa-post-gate-23-refactor-direction-2026-08-24.md)，不能从某个现有类型或测试的存在推导保留义务。

## 使用入口

Repa 是一个 TypeScript/Bun 项目，主要交互界面是终端 TUI。第一次运行源码前，先按照 [准备环境](development.md#准备环境) 为当前 worktree 设置独立的 LearnerHome 数据库；随后从仓库根目录启动：

```powershell
bun run dev
```

首次启动时，TUI 会在没有可用 provider 的情况下打开连接界面；之后也可以使用 `/connect` 选择或配置 provider。默认 Agent 名为 `repa`，它面向询问、教学、学习规划和真实工作。学习者直接用自然语言开始，不需要先创建内部记录。

CLI 还保留直接运行、附着本地服务和 ACP 等入口。它们连接同一套 Session、模型、工具和学习状态，适合脚本、集成与调试。日常产品体验仍从 TUI 展开。

## 一次互动怎样运行

主路径可以简化为：

```text
TUI 收到学习者输入
        ↓
Session 接纳输入并开始一个有限 Turn
        ↓
系统为当前模型采样准备最近对话、学习 Context、工具和权限
        ↓
模型解释、回答，或者调用材料与学习工具
        ↓
工具读取当前状态，或在 Core 中提交一次有约束的修改
        ↓
工具结果回到同一个 Turn，模型继续
        ↓
最终回答和 Turn 结果写入 Session，并呈现在终端
```

Turn 可以包含多次模型采样和工具调用。运行时负责取消、次数限制、provider failure、工具结果和终止状态。一个新的 Session 可以从长期学习信息开始，但不会自动把所有旧对话都放进模型上下文。

主要入口位于：

- [`packages/opencode/src/cli/cmd/tui.ts`](../packages/opencode/src/cli/cmd/tui.ts)：启动 TUI 和本地状态进程；
- [`packages/opencode/src/session/prompt.ts`](../packages/opencode/src/session/prompt.ts)：接纳输入并组织模型运行；
- [`packages/opencode/src/session/llm.ts`](../packages/opencode/src/session/llm.ts)：准备 provider、模型、工具、权限和 Context；
- [`packages/opencode/src/session/processor.ts`](../packages/opencode/src/session/processor.ts)：处理模型流和工具生命周期；
- [`packages/tui/src/`](../packages/tui/src/)：终端交互、Session 路由与语义结果呈现。

## 模型看到什么

Repa 的默认模型 contract 位于 [`packages/opencode/src/session/prompt/repa.txt`](../packages/opencode/src/session/prompt/repa.txt)。它告诉模型从学习者当前请求出发，并把解释、演示、练习、独立工作、回顾、规划和真实任务视为可以选择的动作。

每次交互采样前，Core 会形成一个 LearningContext cut。它是当时状态的有限观察，包含课程与材料、目标、未来关注点、作业、学习判断、建议、最近 Interaction 等摘要，也说明哪些内容被省略。需要详细内容时，模型调用读取工具。

Context 的核心实现位于：

- [`packages/core/src/learning-context.ts`](../packages/core/src/learning-context.ts)：Context 数据、容量和模型渲染；
- [`packages/core/src/turn/learning-context.ts`](../packages/core/src/turn/learning-context.ts)：把 Context 绑定到具体 Turn 和模型操作；
- [`packages/opencode/src/tool/learning-context-read.ts`](../packages/opencode/src/tool/learning-context-read.ts)：按需读取 Context 细节；
- `packages/opencode/src/tool/` 中的各类专用读取工具：读取课程、材料、目标、作业、学习判断和建议。

当前 Context 使用紧凑的结构化表示控制 token 消耗，并保留遗漏信息。模型能否稳定理解这种表示、工具目录是否足够自然、长对话中怎样保留主问题，仍是 [模型行为](model-behavior.md) 章节关注的重点。

## 模型怎样改变学习信息

默认 Agent 可以通过 typed tools 发起本地学习修改。模型提供它需要理解的语义内容，运行时补入实际 Session、Turn、工具调用、时间、权限和当前版本。Core 验证输入与合法变化，在 SQLite 事务中提交状态，并返回明确结果。

相关代码主要分布在：

- [`packages/opencode/src/tool/registry.ts`](../packages/opencode/src/tool/registry.ts)：模型可见工具的注册与过滤；
- `packages/opencode/src/tool/` 中的 `update-*`、读取和导航文件：模型可以选择的具体学习动作；
- [`packages/opencode/src/tool/learning-command.ts`](../packages/opencode/src/tool/learning-command.ts)：识别并准备这些学习命令的宿主边界；
- [`packages/opencode/src/learning-command/runtime.ts`](../packages/opencode/src/learning-command/runtime.ts)：工具调用与 Core command 的运行边界；
- [`packages/core/src/learning-command/`](../packages/core/src/learning-command/)：调用身份、事务、重放和结果；
- `packages/core/src/<learning-area>/`：各类学习信息自己的 schema、读取和修改规则；
- [`packages/core/src/semantic-presentation.ts`](../packages/core/src/semantic-presentation.ts) 与 TUI presentation：把提交结果呈现给学习者。

当前工具目录包含课程创建与修订、材料读取、学习导航、长期目标、未来关注点、作业、学习证据、学习判断和建议等能力。模型可以在自然对话中使用它们；程序负责让一次写入对应真实状态，并让后续采样看到提交后的版本。

## 当前学习信息

当前主线已经表达了几类学习内容：

- **Course 与 Course View**：课程身份、可修订的组织方式和当前使用的路线；
- **Artifact、ContentRoot 与 Representation**：来源、文件范围和模型可读取的表示；
- **Material Map 与导航**：材料内部结构、课程关系和当前位置；
- **Retained steering 与 Goal**：跨 Session 仍然有效的学习指示和目标；
- **LearnerResponseEvidence**：有明确来源和条件的学习表现；
- **FutureAttention**：以后值得回到的具体理由；
- **Assignment**：会影响后续教学或安排的真实学习义务；
- **LearnerStateJudgment**：学习者或 Tutor 对当前理解状况形成的可修正判断；
- **AdvisoryPlanSuggestion**：可以在后续对话中继续修改的学习建议；
- **Session、Turn 与 Interaction**：对话、有限模型工作和其中实际发生的互动。

这些结构提供了清楚的身份和来源，也使一次教学动作可能需要组合多个区域。怎样让组合后的行为保持自然，以及哪些结构会长期留下，仍需要 [学习情境](learning-situations.md)、[跨时间学习](learning-over-time.md) 和 [学习数据](learning-data.md) 中的研究来判断。

## 本地状态与恢复

一个 LearnerHome 使用本地 SQLite 保存机器状态。数据库启动时执行 Repa 自己的前向迁移；同一 LearnerHome 由一个状态进程负责修改。Session、消息、工具结果和学习 command 都保留可恢复的终止信息。

运行时支持取消、失败后的真实终态、有限工具循环、Session 继续和 compaction。对话在模型窗口允许时保持原样；接近限制时，较早内容会被压缩，同时保留最近原样尾部和持久 Session 历史。Context cut 记录某次采样实际看到的学习背景，长期学习信息仍由各自的存储负责。

数据库与迁移代码位于：

- [`packages/core/src/database/`](../packages/core/src/database/)；
- [`packages/core/src/database/migration/repa/`](../packages/core/src/database/migration/repa/)；
- [`packages/core/script/migration.ts`](../packages/core/script/migration.ts)。

数据边界的进一步讨论见 [学习信息与存储](learning-data.md)。

## 主要 package

| 路径                              | 当前职责                                                         |
| --------------------------------- | ---------------------------------------------------------------- |
| `packages/core`                   | 本地状态、学习信息、数据库、迁移、Session 基础和通用 Agent 机制  |
| `packages/opencode`               | Repa CLI、Session 编排、provider、模型循环、工具、权限和本地服务 |
| `packages/tui`                    | 终端界面、输入、Session 浏览、权限和语义结果呈现                 |
| `packages/protocol`               | 各交互入口共享的 typed protocol 与错误语义                       |
| `packages/server`                 | 本地 HTTP/事件处理与 Session 接口                                |
| `packages/client`                 | 从公开 API 生成的客户端代码                                      |
| `packages/sdk/js`                 | JavaScript SDK 和生成类型                                        |
| `packages/llm`、`packages/schema` | provider/model 边界和共享 schema                                 |

仓库还保留来自原始 Agent harness 的其他 package。判断一个目录是否参与当前产品时，应从实际入口和依赖关系出发。内部 package 名称仍可能带有 `opencode`，它们不改变 Repa 的产品身份。

## 当前要继续回答的问题

现有系统已经把长期学习信息接进普通 Agent 循环。接下来的工作要观察它们怎样共同影响 Tutor：

- 产品提示、Context 编码和工具参数结构能否顺着模型的后训练形状工作；
- 模型在长对话、材料读取和多项压力中能否保持学习主线；
- 时间、复习和近期建议能否形成长期有用的策略；
- 当前数据区分是否给后续教学带来足够价值；
- TUI 能否让学习者自然理解和修正 Repa 使用的信息；
- 一次真实学习过程怎样跨 Session 延续，并在新的反馈下改变后续动作。

这些问题会反过来改变 prompt、Context、工具和存储。当前代码为它们提供了可运行的研究对象。
