---
name: design-agent-systems
description: 设计或审阅由 Model、Harness 与 Environment 共同产生行为的 Agent 系统。用于 context、长期状态、工具权限、评测或经验学习的责任、数据流与恢复语义。
---

# Design Agent Systems

当产品确实依赖模型形成判断或动作时，区分三个行为 owner：Model 形成候选判断与动作；Harness 构造观察、调用工具并维护运行状态；Environment 拥有事实、副作用与成功条件。

把状态、权限、恢复和验证放在实际拥有其语义的层。Prompt 不能成为环境事实的 owner，工具 schema 不能自行授予信任，summary 与索引不能替代长期权威，局部 eval 也不能替代产品父结果。

按当前问题读取相关参考：

- Context、memory、RAG、compaction、cache、tool、Extension、MCP、权限或持久副作用：[context-and-tools.md](references/context-and-tools.md)。
- Eval、轨迹归因、长期沉淀、踩坑、自我改进、自我驱动或停止条件：[evaluation-and-learning.md](references/evaluation-and-learning.md)。
- 需要继续查阅 `ai-agent-book` 或核验外部依据：[reading-map.md](references/reading-map.md)。书稿用于发现问题，技术事实回到一手来源。

具体 module interface、seam 与 adapter 的形状由 `codebase-design` 处理。
