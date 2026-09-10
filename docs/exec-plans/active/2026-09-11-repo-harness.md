# Repo Harness 蓝图

- **状态**: active
- **开始**: 2026-09-11
- **来源**: [Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/)（OpenAI，2026-02-11）
- **决定记录**: [ADR-0004](../../adr/0004-adopt-repo-harness-practices.md)

## 目的

把 repa 的工程本身按 harness engineering 的核心实践运行：仓库知识库是 agent 可导航的 system of record，执行计划是一等工件，关键不变量由本地脚本机械化强制。范围采用与现有 additive schema（`CONTEXT.md`、`docs/adr/`、`docs/agents/`）整合的核心子集，全部内容由 agent 生成，交付走分支 + PR 的 agent 审查循环。

## 差距审计

对照文章核心实践逐项评估（2026-09-11）：

| 文章实践 | repa 现状 | 差距 | 对应任务 |
|---|---|---|---|
| `AGENTS.md` 作为目录（约 100 行），指向结构化 `docs/` 知识库，渐进披露 | `AGENTS.md` 仅 17 行（工具、范围、语言约定与 skill 指针）；`CONTEXT.md` 领域词汇与 `docs/adr/` 已存在，但缺统一导航入口，无架构地图 | 架构地图文档缺失；`AGENTS.md` 未指向 `docs/` 各体系 | 任务 1（知识地图） |
| 执行计划作为一等工件，进仓库、带进度/决策日志 | 无 `docs/exec-plans/`；计划散落在 GitHub Issues 与对话中，仓库内不可导航 | 仓库内计划工件与其约定缺失 | 任务 0（本计划即首个执行计划） |
| 机械化强制：文档结构/交叉链接校验、架构依赖方向校验、taste invariants | 无 CI、无任何 lint。`src/` 存在隐式分层 `cli → application → pi-host → skill-read-tool`（另有共享的 `events`），但无强制，回归无告警 | 本地校验脚本缺失 | 任务 2 |
| Golden principles 与周期性清理（garbage collection） | 无成文原则；一致性靠临时判断 | 原则未成文、可机械化条目未接入校验 | 任务 3 |
| Agent 审查循环：agent 自审 + 额外 agent 审查，迭代至通过；PR 短生命周期 | 有 issue tracker 与 triage 约定（`docs/agents/issue-tracker.md`、`docs/agents/triage-labels.md`），无 PR 审查循环的落地实践 | 审查循环未成文、未实践 | 任务 4 |

现状证据：`AGENTS.md` 17 行；`src/` 约 1.0k 行、`test/` 约 0.5k 行；仓库无 `.github/`、无 lint 依赖（`package.json` 仅 `check`/`test` 脚本）。

不在本次范围（后续增量）：GitHub Actions 远端 CI、agent legibility 基础设施（per-worktree 可启动实例、CDP 驱动 UI、日志/指标查询）。

## 任务分解

0. **差距审计与蓝图（本计划）** — 建立 `docs/exec-plans/` 结构与约定；完成差距审计；以 [ADR-0004](../../adr/0004-adopt-repo-harness-practices.md) 记录决定。完成标志：本计划经 PR 交付并得到用户确认。
1. **知识地图与 docs 体系整合** — `AGENTS.md` 保持目录形态（目标 100 行以内），补全指向：`CONTEXT.md`、`ARCHITECTURE.md`、`docs/adr/`、`docs/agents/`、`docs/exec-plans/`、`docs/research/`、golden principles；新增 `ARCHITECTURE.md` 记录现有分层与依赖方向。完成标志：所有指针指向存在的文件，交叉链接通过任务 2 的校验。
2. **本地机械化强制脚本** — `scripts/check-docs.mjs`（docs 结构与相对链接校验）与 `scripts/check-architecture.mjs`（`src/` 依赖方向 + 初版 taste invariants），以一条 npm script 跑通全部校验。完成标志：当前代码库通过；故意制造违例时失败，且错误信息包含可执行的修复指引。
3. **Golden principles 与清理流程** — `docs/golden-principles.md` 成文；可机械化条目接入校验脚本；定义周期性 doc-gardening 的触发方式与清单。完成标志：原则成文，可机械化条目有对应校验。
4. **审查循环收尾与复盘** — 全部 PR 经 agent 审查循环后由用户授权合并；本计划归档至 `completed/` 并补充最终状态；复盘（哪些实践有效、哪些待调整、远端 CI 后续计划）写入 `docs/research/`。

## 决策日志

- 2026-09-11 **范围取核心子集**。文章来自百万行代码库、7 名工程师；repa 约 1.5k 行，全套照搬（per-worktree 启动、observability legibility）当前没有对应规模的问题。用户确认。
- 2026-09-11 **机械化强制先落本地脚本，不建 GitHub Actions**。先保证本地可跑、规则可用，远端 CI 作为后续增量。用户确认。
- 2026-09-11 **交付走分支 + PR + agent 审查循环**，合并需用户对具体 PR 明确授权。用户确认。
- 2026-09-11 **采纳 no manually-written code**：harness 内容全部由 agent 生成；人的反馈经 PR review / issue 表达，由 agent 消化后落地。用户确认。
- 2026-09-11 **与 additive schema 整合而非替代**：`CONTEXT.md` 与 `docs/adr/` 保留为词汇与持久决定的 system of record；harness 文档（架构地图、golden principles、exec-plans）围绕它们组织并交叉链接，不复制其内容。

## 进度日志

- 2026-09-11 差距审计完成，蓝图成文，`docs/exec-plans/` 结构建立；任务 0 经 PR 交付。
