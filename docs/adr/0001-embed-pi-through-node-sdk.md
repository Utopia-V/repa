# 将 Pi 作为 Repa 的内部 Agent SDK

Repa 通过 Pi 的公开 Node SDK 调用 `createAgentSession`、`ModelRuntime`、`SessionManager` 和 `DefaultResourceLoader`。Pi 在 Repa 内部提供模型与 provider、Agent loop、Session、streaming、retry、compaction、通用工具以及 Package、Extension、Skill 和 prompt 的运行能力。

Repa 拥有用户面对的学习空间、学习语境、Application interface、配置与前端。Pi 的类型和生命周期集中在内部适配层，Pi 保持为实现依赖。Repa 直接复用 Pi 的通用工具和扩展格式；社区与 Repa 官方能力都可以使用兼容的 Pi Package、Extension 和 Skill 交付。

相关复用边界与一手来源见 [Pi 生态对 Repa 的可复用性调查](../research/pi-ecosystem-compatibility.md)。
