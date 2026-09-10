## 项目约束

- 项目自有文档使用简体中文。代码标识符、命令、协议字段、标签以及上游项目、包和接口的专有名称保持原文；必要时在首次出现处给出中文说明。第三方原始文档保持原貌。
- Issue 与需要跨任务继续消费的规格记录在 `Utopia-V/repa` 的 GitHub Issues 中，使用已认证的 `gh` CLI 操作。
- 本仓库只有一个领域 context。已接受且会改变未来解释的领域概念、关系和不变量进入根目录 `CONTEXT.md`；难以逆转、缺少上下文会令人意外且确有取舍的决定才进入 `docs/adr/`。两者都按真实内容惰性创建。

## 仓库地图

按当前任务需要深入，不要一次读完全部文档：

- [`CONTEXT.md`](CONTEXT.md) — 领域词汇（glossary）。输出中出现领域概念时先对齐这里的名称，勿用 `_Avoid_` 近义词。
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — 现状分层、允许的模块边表与依赖边界；改变 `src/` 结构或新增依赖前必读。
- [`docs/adr/`](docs/adr/) — 已接受的持久决定与目标设计；拟议工作与之冲突时明确指出，不要静默覆盖。
- [`docs/exec-plans/`](docs/exec-plans/README.md) — 执行计划（`active/` 进行中、`completed/` 归档）；跨多个任务或需要留下决策轨迹的工作先开计划。
- [`docs/research/`](docs/research/) — 调查与研究记录。
- 工程实践（分支 + PR agent 审查循环、本地强制脚本、golden principles）见 [ADR-0006](docs/adr/0006-adopt-repo-harness-practices.md)。
