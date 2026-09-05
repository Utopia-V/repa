# 通过内部 Extension 注入可编辑学习语境

每个学习空间都可以关联一份持续使用的学习语境。用户和 Agent 可以创建、读取、修改、删除和重组其内容。持久表示可以是 Markdown，也可以是支持稳定标识与局部编辑的更高层数据结构；这项决定留给接口设计与实验。

Repa 内部 Extension 在 `before_agent_start` 取得学习语境的当前注入视图，并将它加入本次 Agent run 的 system prompt。学习语境尚未创建时仍可正常开始对话；用户或 Agent 修改后，下一次请求取得新内容。Session JSONL 继续保存实际交流，Agent 在需要时使用 Pi 的通用搜索和读取工具查找历史。

Markdown 是第一个实验候选，因为 Pi 通用文件工具可以直接编辑。Pi 当前的 context file 只在 resource reload 时重读，所以该候选也由内部 Extension 在 Agent run 开始时动态读取。`context` event 保留给确有需要的消息视图变换。
