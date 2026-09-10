# 采用 repo harness 实践运行仓库

repa 按 OpenAI《Harness engineering》的核心实践运行工程本身：`AGENTS.md` 作为目录指向结构化 `docs/` 知识库，执行计划作为一等工件存放在 `docs/exec-plans/`，关键不变量（文档结构、交叉链接、`src/` 依赖方向）由本地脚本机械化强制，golden principles 成文并周期性清理。范围为核心子集，与既有的 additive schema（`CONTEXT.md`、`docs/adr/`）整合而非替代；远端 CI 与 agent legibility 基础设施留作后续增量。工程内容全部由 agent 生成，交付走分支 + PR 的 agent 审查循环，合并需用户对具体 PR 明确授权。
