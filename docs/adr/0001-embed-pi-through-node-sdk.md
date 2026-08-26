# 通过 Node SDK 嵌入 Pi

Repa 通过 Pi 的公开 Node SDK 调用 `createAgentSession`，并使用 `DefaultResourceLoader`；它会替换面向 coding 的 prompt 与 tools，同时保留兼容的 Package 和 Extension runtime。这样可以直接使用 Pi 的 agent loop、providers、sessions、compaction、skills、prompts 和 tool-oriented extensions，不需要 fork Pi 或另建 Agent runtime；依赖 Pi 专属 TUI 或 coding-tool contract 的 extension 可能需要针对具体前端提供 adapter。

相关复用边界与一手来源见 [Pi 生态对 Repa 的可复用性调查](../research/pi-ecosystem-compatibility.md)。
