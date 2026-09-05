# Repa

Repa 是一个独立、本地优先的学习 Agent 应用。用户在自己选择的文件系统空间中与一般 Agent 交互，使用普通文件、通用工具和可安装能力开展开放的长期学习。

## 概念

**学习 Agent（Learning Agent）**：以学习为使用场景的一般 Agent 软件。它保留一般 Agent 的对话、搜索、文件编辑、代码执行和工具使用方式。

**学习空间（Learning Space）**：用户选择并拥有的本地目录。目录可以容纳任意材料、笔记和 Agent 产物，其组织方式由用户、Agent 和实际学习共同形成。

**学习语境（Learning Context）**：与学习空间关联、持续提供给 Agent 的可编辑数据。用户和 Agent 可以按照当前学习创建、读取、修改、删除和重组其内容；具体表示不预设学习领域结构。

**会话历史（Session History）**：Pi Session JSONL 中实际发生的消息、工具调用及其结果。Agent 可以在当前工作需要过去细节时，使用普通搜索与读取工具查找相关片段。

**扩展能力（Extension Capability）**：通过 Pi Package、Extension、Skill 或 prompt 加入 Repa 的能力。材料处理、规划、知识整理和可视化都可以由社区或 Repa 官方扩展提供。

**Pi SDK**：Repa 的内部 Agent SDK。Pi 提供模型与 provider、Agent loop、Session、compaction、通用工具和扩展运行时；Repa 拥有学习空间、学习语境、Application interface、配置与前端的产品语义。

## 关系

- Repa 以用户选择的学习空间作为 Agent 的工作目录，并直接使用 Pi 提供的通用文件、搜索和执行工具。
- Repa 内部 Extension 在每次 Agent run 开始前取得学习语境的当前视图，并将它加入模型上下文。
- 学习语境提供当前工作背景，Session 保存实际交流历史，学习空间保存材料与产物。Agent 根据当前请求决定读取、搜索和修改哪些内容。
- 学习能力通过 Pi 的 Package、Extension、Skill 和 prompt 组合。Repa 可以提供官方扩展，同时保持对兼容 Pi 生态的复用。
- 前端通过 Repa Application interface 使用 Agent 能力；Pi 的 SDK 对象和生命周期集中在 Repa 内部适配层。

## 不变量

- 学习活动保持一般 Agent 的开放交互方式，内容和方向可以持续扩展与改变。
- 学习材料、笔记和知识工件以学习空间中的实际文件为准。
- 学习语境的持久表示支持用户与 Agent 持续编辑和重组；每次 Agent run 取得反映当前内容的注入视图。
- Pi 是 Repa 的内部实现依赖；Repa 的公开产品接口、配置和空间语义由 Repa 定义。
