# Golden principles

让代码库对未来 agent run 保持可读、一致的成文原则。人的品味经 PR review 进入，然后**一次性捕获、持续强制**：能机械化的条目接入 `scripts/`，其余交给周期性 doc-gardening（见文末清理流程）。原则与脚本不一致时，先改原则或先改代码，不要绕过校验。

## 原则

每条标注强制方式：【机械化】由 `npm run check` 强制；【判断性】由 review 与 doc-gardening 把关。

1. **文档与代码同源**【判断性；结构子项机械化】 — 语义与行为的文档同步靠 review 与巡检；结构规则由脚本强制：`check-architecture` 解析 [`ARCHITECTURE.md`](../ARCHITECTURE.md) 边表、`check-docs` 验证相对链接。
2. **分层方向不可逆行**【机械化】 — `src/` 只允许边表登记的模块边；新依赖先入册再使用。强制：`check-architecture`。
3. **仓库是唯一事实来源**【判断性；子项机械化】 — 决定进 [`docs/adr/`](adr/)，跨任务工作进 [`docs/exec-plans/`](exec-plans/README.md)，待办走 GitHub Issues（人工维持）；`src/` 内不写 TODO/FIXME 由 `check-architecture` 强制。
4. **文件保持小而单一职责**【判断性；子项机械化】 — 单文件 ≤ 600 行由 `check-architecture` 强制；职责是否单一靠 review 与巡检。文件是 agent 的认知单元，大小即可读性。
5. **共享工具优先于手写副本**【判断性】 — 通用能力进共享模块（如 `events.ts` 的 `AsyncEventChannel`），不复制变体；写新内部工具前先找已有实现。
6. **边界校验，不 YOLO 探数据**【判断性】 — 跨边界的数据用类型收敛（如 typebox），不依赖猜测的形状；现状锚点：`application.ts` 把 Pi 内部异常翻译为可恢复的产品事件，而不是泄漏给界面。
7. **词汇对齐 `CONTEXT.md`**【判断性】 — 使用 glossary 名称，不用 `_Avoid_` 近义词；新概念经领域建模入册，不在代码与文档里私造语言。
8. **小 PR、短生命周期**【流程】 — 每 PR 一个可审单元；agent 审查循环记录保留在 PR 内；合并需用户对具体 PR 明确授权（[ADR-0006](adr/0006-adopt-repo-harness-practices.md)）。

## 清理流程（doc-gardening）

**触发**：每个工程会话开始时运行 `npm run check`（机械层自动把关，违例即修）；每合并 5 个 PR 或每周一次，执行下述深度巡检。

**执行者**：当前会话的 agent（humans steer：人提出品味反馈，agent 编码为原则或校验）。

**清单位置**：即本节。产物：修复 PR（正文引用本文件）或 GitHub Issue；有活动执行计划时，巡检结果一行记入其「进度日志」。

**巡检清单**：

1. 运行 `npm run check`，修复全部违例。
2. 抽查 `ARCHITECTURE.md` 分层描述与 `src/` 实际语义的一致性（脚本管导入边，语义漂移靠人读）。
3. 扫描文档中的 `_Avoid_` 近义词、锚点与外链失联（相对链接目标文件的存在性已由脚本覆盖，此三项人工检查）。
4. 检查 `docs/exec-plans/active/` 是否有已完成未归档的计划。
5. 对照本原则清单逐条抽查新进代码（重点：5、6、7）。
6. 检查 GitHub Issues 的陈旧标签与已解决未关闭项。
7. 提交卫生：每次 commit 前核对 `git status --short` 与 `git show --stat`，只包含预期路径；禁止目录级 `git add`（本条由两次实际事故写入：未跟踪文件被误扫进提交）。
