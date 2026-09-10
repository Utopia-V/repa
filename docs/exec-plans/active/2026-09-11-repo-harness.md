# Repo Harness 蓝图

- **状态**: active
- **开始**: 2026-09-11
- **来源**: [Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/)（OpenAI，2026-02-11）
- **决定记录**: [ADR-0006](../../adr/0006-adopt-repo-harness-practices.md)

## 目的

把 repa 的工程本身按 harness engineering 的核心实践运行：仓库知识库是 agent 可导航的 system of record，执行计划是一等工件，关键不变量由本地脚本机械化强制。范围采用与现有 additive schema（`CONTEXT.md`、`docs/adr/`、`docs/agents/`）整合的核心子集，全部内容由 agent 生成，交付走分支 + PR 的 agent 审查循环。

## 差距审计

对照文章核心实践逐项评估（2026-09-11）。**下表描述任务 0 实施前的基线状态**：

| 文章实践 | repa 现状 | 差距 | 对应任务 |
|---|---|---|---|
| `AGENTS.md` 作为目录（约 100 行），指向结构化 `docs/` 知识库，渐进披露 | `AGENTS.md` 仅 5 行（项目约束：文档语言、Issue 记录位置、单一领域 context 与惰性创建）；`CONTEXT.md` 领域词汇与 `docs/adr/` 0001–0005 已存在，但缺统一导航入口，无架构地图 | 架构地图文档缺失；`AGENTS.md` 未指向 `docs/` 各体系 | 任务 1（知识地图） |
| 执行计划作为一等工件，进仓库、带进度/决策日志 | 任务 0 实施前无 `docs/exec-plans/`；计划与规格记录在 GitHub Issues（见 `docs/agents/issue-tracker.md` 约定），仓库内无执行计划工件 | 仓库内计划工件与其约定缺失 | 任务 0（本计划即首个执行计划） |
| 机械化强制：文档结构/交叉链接校验、架构依赖方向校验、taste invariants | 无 CI、无任何 lint。`src/` 存在隐式分层 `cli → application → pi-host → skill-read-tool`（另有当前仅被 `application` 导入的 `events`），但无强制，回归无告警 | 本地校验脚本缺失 | 任务 2 |
| Golden principles 与周期性清理（garbage collection） | 无成文原则；一致性靠临时判断 | 原则未成文、可机械化条目未接入校验 | 任务 3 |
| Agent 审查循环：agent 自审 + 额外 agent 审查，迭代至通过；PR 短生命周期 | Issue 记录约定在 `AGENTS.md` 中，无 PR 审查循环的落地实践 | 审查循环未成文、未实践 | 任务 4 |

现状证据（2026-09-11，master 已并入本分支后核对）：`AGENTS.md` 5 行；`src/` 约 1.0k 行、`test/` 约 0.5k 行；仓库无 `.github/`、无 lint 脚本与 lint 依赖（`package.json` 脚本仅有 `build`/`check`/`start`/`test`）。

不在本次范围（后续增量）：GitHub Actions 远端 CI、agent legibility 基础设施（per-worktree 可启动实例、CDP 驱动 UI、日志/指标查询）。

## 任务分解

0. **差距审计与蓝图（本计划）** — 建立 `docs/exec-plans/` 结构与约定；完成差距审计；以 [ADR-0006](../../adr/0006-adopt-repo-harness-practices.md) 记录决定。完成标志：本计划经 PR 交付并得到用户确认。
1. **知识地图与 docs 体系整合** — `AGENTS.md` 保持目录形态（目标 100 行以内），补全指向：`CONTEXT.md`、`ARCHITECTURE.md`、`docs/adr/`、`docs/exec-plans/`、`docs/research/`、golden principles；新增 `ARCHITECTURE.md` 记录现有分层与依赖方向，并列出允许的模块边与特例（`index.ts` 公共出口、`events` 的定位、Node 内置与第三方依赖不计入方向规则）。完成标志：所有指针指向存在的文件，交叉链接通过任务 2 的校验。
2. **本地机械化强制脚本** — `scripts/check-docs.mjs`（docs 结构与相对链接校验）与 `scripts/check-architecture.mjs`（`src/` 依赖方向 + 初版 taste invariants），以一条 npm script 跑通全部校验。完成标志：当前代码库通过；故意制造违例时失败，且错误信息包含可执行的修复指引；校验规则与 `ARCHITECTURE.md` 的模块边表一致。
3. **Golden principles 与清理流程** — `docs/golden-principles.md` 成文；可机械化条目接入校验脚本；定义周期性 doc-gardening 的触发方式与清单。完成标志：原则成文，可机械化条目有对应校验；doc-gardening 的触发方式（频率或触发事件）、执行者、清单位置与产物在文档中可验证。
4. **审查循环收尾与复盘** — 全部 PR 经 agent 审查循环后由用户授权合并；本计划归档至 `completed/` 并补充最终状态；复盘（哪些实践有效、哪些待调整、远端 CI 后续计划）写入 `docs/research/`。完成标志：每个 PR 至少一次 agent 审查，审查与反馈解决记录保留在 PR 内（GitHub 评论可见）；用户授权以针对该 PR 的明确表态为准。

## 决策日志

- 2026-09-11 **范围取核心子集**。文章来自百万行代码库、7 名工程师；repa 约 1.5k 行，全套照搬（per-worktree 启动、observability legibility）当前没有对应规模的问题。用户确认。
- 2026-09-11 **机械化强制先落本地脚本，不建 GitHub Actions**。先保证本地可跑、规则可用，远端 CI 作为后续增量。用户确认。
- 2026-09-11 **交付走分支 + PR + agent 审查循环**，合并需用户对具体 PR 明确授权。用户确认。
- 2026-09-11 **采纳 no manually-written code**：harness 内容全部由 agent 生成；人的反馈经 PR review / issue 表达，由 agent 消化后落地。用户确认。
- 2026-09-11 **与 additive schema 整合而非替代**：`CONTEXT.md` 与 `docs/adr/` 保留为词汇与持久决定的 system of record；harness 文档（架构地图、golden principles、exec-plans）围绕它们组织并交叉链接，不复制其内容。

## 进度日志

- 2026-09-11 差距审计完成，蓝图成文，`docs/exec-plans/` 结构建立；任务 0 已开 PR #11，待用户确认蓝图与授权合并。
- 2026-09-11 agent 审查（codex，报告见 PR #11 评论）：8 条 finding 全部采纳并修复（死链接、基线标注、events 定位、任务 1-4 验证标志收紧）；9 项核对通过（基线事实、ADR 忠实度、语言与链接）。
- 2026-09-11 同步 master（`07c6fefb6`、`41df96c16`）：`.agents/skills` 收敛与产品/架构设计落地，`docs/agents/` 约定并入 5 行版 `AGENTS.md`；ADR-0004/0005（应用协议、宿主权限）已占用编号，本计划的采用决定重编为 ADR-0006；审计基线按新 master 刷新。任务 1 的 `ARCHITECTURE.md` 需反映应用协议的目标设计。
- 2026-09-11 任务 1 交付（PR #12，stacked on #11）：ARCHITECTURE.md（分层 + 边表 + 校验器规范，codex 审查 1 轮闭环）+ AGENTS.md 仓库地图（纯增量，16 行）。
- 2026-09-11 任务 2 交付（PR #13，stacked on #12）：check-architecture（TypeScript AST 解析边表 + taste invariants：行数上限、TODO 禁令）+ check-docs（链接/小节/ADR 编号），`npm run check` 一条命令；codex 两轮审查闭环，自测 12 案例。
- 2026-09-11 任务 3 交付（PR #14，stacked on #13）：golden principles 成文（3 条机械化接入脚本、4 条判断性），doc-gardening 触发/执行者/清单/产物成文。
