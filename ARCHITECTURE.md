# 架构

本文是 repa 的架构地图（system of record）：记录现状分层、允许的模块边与依赖边界，并指向决定其演进方向的 ADR。领域词汇见 [`CONTEXT.md`](CONTEXT.md)；本文与代码不一致时，以代码为准并回到本文修复。`src/` 依赖方向由 `scripts/check-architecture.mjs` 按本文的模块边表机械化校验（随[执行计划](docs/exec-plans/active/2026-09-11-repo-harness.md)任务 2 落地）。

## 现状分层

当前实现是第一条可运行细线：最小 TUI 通过 Pi Node SDK 完成可恢复对话（[ADR-0001](docs/adr/0001-embed-pi-through-node-sdk.md)、[ADR-0002](docs/adr/0002-progressively-load-learning-context.md)）。

```text
cli.ts ──▶ application.ts ──▶ pi-host.ts ──▶ skill-read-tool.ts
                │                 │
                ▼                 ▼
            events.ts        Pi Node SDK
        （叶子工具类）      （运行时适配层独占）
```

- **`cli.ts`（界面层）** — 最小 TUI 与进程入口；只通过 `application.ts` 的公共 API 交互，不触碰 Pi SDK。
- **`application.ts`（应用层）** — 用例编排与错误语义（`RepaEvent`/`RepaErrorCode`）；把 Pi 的内部异常翻译为可显示、可恢复的产品事件。
- **`pi-host.ts`（运行时适配层）** — Pi SDK 的独占集成点：session 创建、恢复、模型选择、provider 配置。
- **`skill-read-tool.ts`（工具实现）** — 面向 skill 资源读取的自定义 tool；被 `pi-host.ts` 注册进 session。
- **`events.ts`** — `AsyncEventChannel<T>` 叶子工具类，无内部依赖；当前仅被 `application.ts` 导入。
- **`index.ts`** — 包的公共出口，只 re-export `application.ts` 的公共 API；外部消费者不得绕过它。

## 模块边表

`src/` 内部只允许下表中的导入边（→ 表示「可导入」）；Node 内置模块不计入方向规则。

| 模块 | 允许的内部边 | 允许的第三方依赖 |
|---|---|---|
| `cli.ts` | `application.ts` | 无 |
| `index.ts` | `application.ts`（仅 re-export） | 无 |
| `application.ts` | `events.ts`、`pi-host.ts` | `@earendil-works/pi-coding-agent`（仅 type） |
| `pi-host.ts` | `skill-read-tool.ts` | `@earendil-works/pi-coding-agent`、`@earendil-works/pi-ai`（仅 type） |
| `skill-read-tool.ts` | 无 | `@earendil-works/pi-coding-agent`（仅 type）、`typebox` |
| `events.ts` | 无 | 无 |

要点：

- 依赖方向只能沿 `cli → application → pi-host → skill-read-tool` 前进，禁止逆向或跨层。
- Pi SDK 集成独占于 `pi-host.ts`：值导入全部来自 `@earendil-works/pi-coding-agent`（`createAgentSession` 等），`@earendil-works/pi-ai` 仅 type 级（`Model`）；`application.ts` 与 `skill-read-tool.ts` 只允许 type 级引用，保持应用层可脱离 Pi 运行时测试。
- `events.ts` 是叶子：不导入任何内部模块；按边表当前只有 `application.ts` 导入它，其他 `src/` 模块要导入时须先在边表登记该边（边表是唯一规则来源）。

### 校验器规范（任务 2 实现时遵循）

- 规则范围：`src/**/*.ts`；`test/` 不受边表约束，其对 `pi-host.ts` 的直接导入（`REPA_BASE_PROMPT`、`PiModelOverride`）作为已登记例外记录在本文「测试边界」。
- 相对导入按 `.js` → `.ts` 的 specifier 映射解析；`src/` 外部已存在文件不计入方向规则。
- type-only 判定以 `import type` 语句与纯内联 `type` 限定符为准（值与 type 混排按值处理）；动态 `import()` 视为值导入；`仅 re-export` 边只允许 `export ... from`。
- Node 内置（`node:` 前缀）不计入方向规则。

## 测试边界

`test/application.test.ts` 使用真实 Pi Node SDK 与确定性 faux provider，配以 `test/fixtures/` 中的本地 package 夹具；不读开发者凭据、不访问网络、不产生付费调用。测试主要经 `application.ts` 的公共 API 驱动；另从 `pi-host.ts` 直接导入 `REPA_BASE_PROMPT` 与 `PiModelOverride`，这是当前唯一被测试消费的 pi-host 导出。

## 演进方向

以下 ADR 记录已接受的目标设计，本文随实现落地逐步吸收其结论：

- [ADR-0003](docs/adr/0003-share-file-based-content-operations.md) — 学习空间内容操作以共享的文件操作为基础。
- [ADR-0004](docs/adr/0004-connect-replaceable-frontends-through-application-protocol.md) — 通过公开应用协议（JSON-RPC over WebSocket）连接可替换前端；后端独占运行状态与会话历史，官方 TUI 与第三方前端同为协议客户端。
- [ADR-0005](docs/adr/0005-execute-display-content-with-host-permissions.md) — 展示内容在独立执行边界中运行，权限由前端宿主持有。

对现状的含义：`cli.ts` 是第一个、也是将被协议化替代的前端；`application.ts` 的用例与事件语义是未来应用协议的方法与事件来源；`pi-host.ts` 继续以进程内 SDK 方式嵌入 Pi（协议不改变 Pi 的嵌入方式）。
