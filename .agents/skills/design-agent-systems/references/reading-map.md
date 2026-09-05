# `ai-agent-book` 阅读入口

本参考用于按问题继续查阅 [`bojieli/ai-agent-book`](https://github.com/bojieli/ai-agent-book)，不作为 Agent 系统或具体项目的权威。2026-08-30 核对时，上游 `main` 为 [`a18a5f764589396d903d8faeaed205489a21bf4b`](https://github.com/bojieli/ai-agent-book/commit/a18a5f764589396d903d8faeaed205489a21bf4b)；使用下列内容前先检查上游是否已有纠错、章节重组或实验状态变化。

## 按问题查阅

| 章节 | 适合的问题 |
| --- | --- |
| [第 1 章：AI Agent 入门](https://github.com/bojieli/ai-agent-book/blob/a18a5f764589396d903d8faeaed205489a21bf4b/book/chapter1.md) | Model–Harness–Environment、观察/动作空间、ReAct、护栏和一般 Agent 概念 |
| [第 2 章：上下文工程](https://github.com/bojieli/ai-agent-book/blob/a18a5f764589396d903d8faeaed205489a21bf4b/book/chapter2.md) | Context 构造、KV/Prompt Cache、Skills、工具定义、状态呈现、压缩和隔离 |
| [第 3 章：用户记忆和知识库](https://github.com/bojieli/ai-agent-book/blob/a18a5f764589396d903d8faeaed205489a21bf4b/book/chapter3.md) | Memory、RAG、索引、文件组织、知识更新、隐私和按需检索 |
| [第 4 章：工具](https://github.com/bojieli/ai-agent-book/blob/a18a5f764589396d903d8faeaed205489a21bf4b/book/chapter4.md) | Tool contract、MCP、权限、发现、分层加载和工具分类 |
| [第 5 章：Coding Agent 与通用 Agent](https://github.com/bojieli/ai-agent-book/blob/a18a5f764589396d903d8faeaed205489a21bf4b/book/chapter5.md) | 搜索、编辑、代码作为适配器或思考工具、故障恢复和 Harness 差异 |
| [第 6 章：交互](https://github.com/bojieli/ai-agent-book/blob/a18a5f764589396d903d8faeaed205489a21bf4b/book/chapter6.md) | 异步事件、打断与恢复、语音、Computer Use 和其他动作空间 |
| [第 7 章：Agent 的评估](https://github.com/bojieli/ai-agent-book/blob/a18a5f764589396d903d8faeaed205489a21bf4b/book/chapter7.md) | 任务集、验证器、轨迹、失败归因、消融、成本和持续回归 |
| [第 8 章：模型后训练](https://github.com/bojieli/ai-agent-book/blob/a18a5f764589396d903d8faeaed205489a21bf4b/book/chapter8.md) | SFT、蒸馏、RL，以及轨迹何时能成为训练数据 |
| [第 9 章：Agent 的持续进化](https://github.com/bojieli/ai-agent-book/blob/a18a5f764589396d903d8faeaed205489a21bf4b/book/chapter9.md) | 从轨迹更新知识、指令、程序或参数，验证、回滚和证据/指令隔离 |
| [第 10 章：多 Agent 协作](https://github.com/bojieli/ai-agent-book/blob/a18a5f764589396d903d8faeaed205489a21bf4b/book/chapter10.md) | 分解、上下文共享与隔离、委托和协作评测 |

## 使用口径

1. 按当前问题读取相关小节，不把整本书注入 context。
2. 分开看正文解释、[`EXPERIMENT_STATUS.md`](https://github.com/bojieli/ai-agent-book/blob/a18a5f764589396d903d8faeaed205489a21bf4b/docs/EXPERIMENT_STATUS.md)保存的实验状态、提交纠错和外部一手事实。
3. 书中的具体数字、模型行为、API 规则、benchmark 结论和安全主张，在实际采用前回到官方文档、论文、规范、源码或可复现实验。
4. 阅读产生的认识先保留适用范围和竞争解释；只有当前项目的权威与证据接受后，才成为具体设计。

上游发生相关变化，或强反例改变这些入口的解释时更新本参考。某章的认识已被更具体且仍维护的一手参考完整吸收后，收缩重复内容。
