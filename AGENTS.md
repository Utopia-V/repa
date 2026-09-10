## 项目约束

- 项目自有文档使用简体中文。代码标识符、命令、协议字段、标签以及上游项目、包和接口的专有名称保持原文；必要时在首次出现处给出中文说明。第三方原始文档保持原貌。
- Issue 与需要跨任务继续消费的规格记录在 `Utopia-V/repa` 的 GitHub Issues 中，使用已认证的 `gh` CLI 操作。
- 本仓库只有一个领域 context。已接受且会改变未来解释的领域概念、关系和不变量进入根目录 `CONTEXT.md`；难以逆转、缺少上下文会令人意外且确有取舍的决定才进入 `docs/adr/`。两者都按真实内容惰性创建。
- 通用 Agent 的交互与运行行为按具体问题优先参考 Codex 的[公开应用协议](https://learn.chatgpt.com/docs/app-server)、[权限与安全](https://learn.chatgpt.com/docs/agent-approvals-security)、[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)，以及对应源码和相邻测试；结合 Repa 产品语义与 Pi 接入边界选择复用方式。影响设计的取舍及所依据版本记录在相应 ADR 中。
