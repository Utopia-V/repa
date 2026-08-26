# 领域文档

本文件规定工程 skills 在探索或修改代码库时如何使用本仓库的领域文档。

## 探索前读取

- 根目录存在 **`CONTEXT.md`** 时，读取其中的领域词汇。
- 从 **`docs/adr/`** 中读取与当前区域有关的 ADR。

任一位置不存在时静默继续。不要报告缺失，也不要为了补齐仓库结构而建议提前创建。

`/grill-with-docs`、`/improve-codebase-architecture` 等流程会调用 `/domain-modeling`；只有领域词汇或持久决定真正明确后，才由它按需创建或更新这些文档。

## 文件结构

本仓库采用 single-context 布局：

```text
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-example-decision.md
│       └── 0002-another-decision.md
└── src/
```

`CONTEXT.md` 和 `docs/adr/` 只有在出现真实内容后才需要存在。

## 使用 glossary 中的词汇

输出中出现领域概念时，例如 Issue 标题、重构提案、假设、interface 或测试名称，使用 `CONTEXT.md` 定义的名称，不要改用 glossary 明确列入 `_Avoid_` 的近义词。

所需概念不在 glossary 中时，先检查是否正在发明项目并未使用的语言。若确有缺口，交给 `/domain-modeling` 处理。

## 指出与 ADR 的冲突

拟议工作与现有 ADR 冲突时，明确指出冲突，不要静默覆盖已有决定：

> 这与 ADR-0007 冲突，但可能值得重新讨论，因为……
