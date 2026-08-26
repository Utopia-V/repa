# Pi 生态对 Repa 的可复用性调查

调查基准是 `earendil-works/pi` 的固定提交 [`8fa7eebd235355522c8104166b4f1f959b4e2f10`](https://github.com/earendil-works/pi/tree/8fa7eebd235355522c8104166b4f1f959b4e2f10)，下文的 GitHub 链接均固定到该提交。本记录为 Pi 嵌入决策和后续 integration prototype 提供事实依据；升级 Pi 固定版本时，应重新核对其中受影响的结论。

## 结论摘要

Pi 的可复用边界不是一个单一的“插件 API”。它有四层：资源（skill、prompt、theme）、运行时代码（extension）、可分发容器（package），以及可嵌入/可进程化的 Node agent runtime。对 Repa 最有价值的是 Node SDK + `DefaultResourceLoader` + AgentSession/Runtime + tool/provider/生命周期 extension；Rust 通过 `pi --mode rpc` 可以复用 Pi 进程内的 agent、模型、认证、工具和大部分非 TUI extension，但不能把 Node API 变成 Rust 原生库。

## 1. package、extension、plugin 以及生命周期

Pi 当前官方文档使用的概念是 **package** 和 **extension**；README 没有把 “plugin” 定义成另一个运行时实体。“plugin”若作为泛称，最接近 Pi package/extension；不能假设存在独立的 plugin manifest 或 plugin API。[packages.md](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/packages.md)；[extensions.md](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/extensions.md)。

* **Extension** 是 TypeScript 模块：导出接收 `ExtensionAPI` 的默认工厂，可注册 tool、command、shortcut、flag、provider，订阅 session/agent/model/tool/input 等事件，持久化自定义 session entry，并可使用 UI。自动发现位置是 `~/.pi/agent/extensions/` 与受信任项目的 `.pi/extensions/`，也可由 settings、`-e/--extension` 或 inline factory 提供。源码通过 jiti 加载，TypeScript 无需预编译。[extensions.md §Quick Start/Locations/Writing](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/extensions.md)。
* **Package** 是分发容器，可来自 npm、git（支持 tag/commit ref）、HTTP/SSH URL 或本地路径。它的 `package.json` 可在 `pi` 键中声明 `extensions`、`skills`、`prompts`、`themes`；没有 manifest 时按 `extensions/`、`skills/`、`prompts/`、`themes/` 约定目录发现。package 还可带普通 npm runtime dependencies、`video`/`image` gallery 元数据；因此一个 package 能同时携带代码、技能说明、可调用 prompt 模板和主题。[packages.md §Package Sources/Structure/Dependencies](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/packages.md)。
* 安装写入 global `~/.pi/agent/settings.json`，`pi install -l` 写入 project `.pi/settings.json`；npm 安装在相应 `npm/`，git checkout 在相应 `git/`。`pi -e` 是当前运行临时安装/加载。`pi list` 枚举，`pi remove` 删除 settings 项。`pi config` 以交互方式逐资源启用/禁用（可切 global/project scope）；manifest/package filter 还可按类型和 glob 缩小加载。[packages.md §Install and Manage/Filtering/Enable and Disable](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/packages.md)。
* 更新分为 Pi 自身和 package：`pi update --self`/`--self --force` 更新自身，`--extensions` 更新 packages，`--all` 两者都做，亦可指定一个 package。npm 未带版本通常随更新解析新版本；git ref 记录的是 pinned tag/commit，更新不会自动移动到新 ref，需重新 `pi install ...@new-ref`。项目 package 在启动时只有项目受信任后才会自动安装缺失项。[packages.md](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/packages.md)。
* global/project 同时出现同一 package 时项目项优先；项目项 `autoload:false` 是例外，可作为对 global 的 delta。源码实现了 `PackageManager`（resolve/install/installAndPersist/remove/update 等）及 `DefaultPackageManager`；可见 [package-manager.ts](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/src/core/package-manager.ts) 与 [resource-loader.ts](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/src/core/resource-loader.ts)。

## 2. Node SDK 直接嵌入

**可以复用，而且是最完整的集成面。** `createAgentSession()` 默认使用 `DefaultResourceLoader`；宿主也可传入自己的 loader。SDK 文档明确导出了 `DefaultResourceLoader`、`getAgentDir`、`DefaultPackageManager`，loader 可读取 extensions、skills、prompts、themes、context files，支持 additional paths、inline extension factories、各类 `no*` 开关和 override。[sdk.md §createAgentSession/ResourceLoader](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/sdk.md)；[index.ts](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/src/index.ts)。

可直接复用的能力包括：

* **Extension API**：`pi.on`、`registerTool`、`registerCommand`、`registerProvider`、`sendMessage`、session entry/label/name、tool allowlist、model/thinking 控制及 session/agent/model/tool/provider hooks。[extensions.md §ExtensionAPI/Events](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/extensions.md)。
* **Skills/prompts/themes**：loader 直接发现并交给 session；skill 采用 Agent Skills 的 `SKILL.md`，启动只把 name/description 放进 system prompt，模型按需读取全文；prompt 是 `/name` 展开的 Markdown，theme 是 JSON 色彩 token。宿主若不需要 TUI，仍可复用 skill/prompt，theme 通常只保留为数据或丢弃。[skills.md](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/skills.md)；[prompt-templates.md](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/prompt-templates.md)；[themes.md](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/themes.md)。
* **Provider extension**：extension 可注册/注销 provider，定义模型、API、streaming、OAuth/API-key 认证、请求/响应转换和 provider hooks；custom-provider 文档还支持覆盖已有 provider。[custom-provider.md](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/custom-provider.md)。
* **Agent/session**：`AgentSession` 管理 prompt、steer/follow-up、事件流、模型切换、compaction、abort；`AgentSessionRuntime` 负责 new/resume/switch/fork/clone/import，并在 runtime 替换后要求重新订阅 session 和重新 bind extensions。[sdk.md §AgentSession/Runtime](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/sdk.md)。

需要 Repa adapter 的地方是 settings/trust/session storage/默认 cwd 语义：`DefaultResourceLoader` 把 `cwd` 用于 `.pi` resources、祖先 `.agents/skills`、`AGENTS.md` 和 session directory，把 `agentDir` 用于 global resources；宿主可传自定义 cwd/agentDir、`SettingsManager.inMemory()`、`SessionManager.inMemory()`，但若想保留 package install/config/trust 体验，就要接入或替代这些 Pi 文件约定。[sdk.md §Directories/Settings](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/sdk.md)。

## 3. Rust 主程序 + `pi --mode rpc`

RPC 是独立 Node 子进程，不是 Rust crate。Rust 可以通过 stdin/stdout JSONL 驱动 Pi 的 agent/session/model/tools/extensions；RPC commands 覆盖 prompt/steer/follow-up/abort、state/messages、model/thinking、queue、compaction、retry、bash、session stats/export/switch/fork/clone/tree/commands，events 覆盖 streaming message、tool execution、agent/turn、queue、compaction、retry、extension errors。[rpc.md §Commands/Events](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/rpc.md)。

`--mode rpc` 启动路径仍创建正常 runtime，并将 CLI 解析出的 extension/skill/prompt/theme paths 和 extension factories 传入 resource loader；所以能运行内置/路径/package 解析出的 extension，前提是该扩展适合 rpc。README/源码的模式分支见 [main.ts](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/src/main.ts) 与 [rpc-mode.ts](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/src/modes/rpc/rpc-mode.ts)。

RPC extension UI 子协议：`select`、`confirm`、`input`、`editor` 是 stdout request + stdin response 的阻塞对话；`notify`、`setStatus`、`setWidget`、`setTitle`、`set_editor_text` 是 fire-and-forget。客户端可显示或忽略后者。`ctx.hasUI` 在 rpc 为 true，但 `ctx.mode` 是 `rpc`，不是 `tui`。[rpc.md §Extension UI Protocol](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/rpc.md)。

降级/无效项：`custom()` 返回 `undefined`；`setWorkingMessage/Indicator`、footer/header、editor component、tools expanded 是 no-op；`getEditorText()` 空字符串、`getToolsExpanded()` false；`pasteToEditor()` 退化为 setEditorText；theme 查询/切换不可用；widget 只支持 string[]，component factory 被忽略。故依赖真实 TUI component、键盘输入、editor state、footer/header/theme 控制的扩展需要 adapter 或在 rpc 下禁用。[rpc.md §Extension UI Protocol](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/rpc.md)。

## 4. 信任模型与常见隐含假设

Pi 明确警告 package/extension 以完整系统权限运行，skill 也能指示模型执行任意动作，安装前应审查源码。[packages.md](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/packages.md)；[security.md](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/security.md)。项目 `.pi` settings/resources/扩展只在项目 trust 通过后加载；非交互模式没有询问框，由 `defaultProjectTrust`、`--approve`/`--no-approve` 决定。[README.md §Project Trust](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/README.md)。

移植 extension 时常见隐含假设：

1. `ctx.cwd` 是当前项目 cwd，`ctx.agentDir`/settings/trust/session manager 是 Pi 的文件布局；扩展可能直接读取 cwd、`.pi`、session JSONL 或环境变量。
2. 默认存在 coding tools `read`, `bash`, Windows 下 `powershell`, `edit`, `write`, `grep`, `find`, `ls`；tool override 例子直接替换内置 tool，Repa 若工具名/输入输出不同须 adapter。[extensions.md §Overriding Built-in Tools](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/extensions.md)。
3. TUI 假设包括 `ctx.mode === "tui"`、可用 `ctx.ui.custom()`、component renderer、terminal keyboard/editor/footer/theme；rpc/print/json 会降级。
4. 生命周期有 session replacement、compaction、retry、streaming 等顺序和 abort signal；长驻进程应在 `session_start` 启动、`session_shutdown` 关闭，不能在可能不启动 session 的 extension factory 中盲目创建。[extensions.md §Long-lived resources](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/extensions.md)。

## 5. 兼容性分级

| 生态类别 | Node SDK 宿主 | Rust + RPC | Repa 不使用 Pi |
|---|---|---|---|
| skill（标准 `SKILL.md`） | **直接复用**，可由 loader 发现或显式注入 | **直接复用**，由 Pi 子进程加载；Repa 只消费行为 | **Adapter**：复用文件/解析和约定，重做注入/按需读取 |
| tool-only extension（不依赖 TUI） | **直接复用** | **直接复用**，工具调用和结果走 RPC events | **Adapter**：重写 ExtensionAPI/tool schema 到 Repa tool API |
| provider extension | **直接复用**，Node 侧认证/streaming/provider registry 均可接 | **直接复用**，由 Pi Node 进程持有 provider；Rust 只驱动模型 | **基本不可直接复用**，需重做 provider/auth/stream protocol |
| commands/dialogs | **直接复用**；SDK 中 command 仍可调用，但 UI 要宿主提供 | **部分复用/Adapter**：四类 dialog 有 subprotocol，需客户端应答 | **Adapter**：命令解析、交互、状态全重做 |
| custom TUI | **直接复用**，需嵌入/使用 Pi TUI 运行时 | **基本不可直接复用**；`custom()` 等降级 | **基本不可直接复用**，重做 UI |
| coding-tool override | **Adapter**：若 Repa 工具契约同构才可直连 | **Adapter**：Pi 内覆写后通过 RPC 暴露，不是 Rust 本地覆写 | **Adapter/重写** |
| session-internals（append entries/tree labels/runtime replacement） | **直接复用**，但宿主需遵守 Runtime 重绑语义 | **部分复用**：RPC 有 fork/tree/entries 等命令，不能任意使用 Node 对象 | **基本不可直接复用**，需映射到 Repa session model |
| theme | **直接复用**仅对 Pi TUI；非 TUI 仅可读取数据 | **基本不可用**：RPC `getAllThemes/getTheme/setTheme` 降级 | **基本不可直接复用** |

## 6. Pi 的核心工程收益（官方证据范围）

* `pi-ai`/provider 层提供多模型 provider、API key/OAuth、自定义 provider、模型目录和 streaming；README 的模型选项列出 provider/model/thinking，custom-provider 文档给出认证与流式 API。[README.md](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/README.md)；[custom-provider.md](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/custom-provider.md)。
* `pi-agent-core`/AgentSession 提供 agent loop：prompt、tool calls、steer/follow-up 队列、message/tool streaming、abort/cancellation、model/thinking state 和事件流。[sdk.md](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/sdk.md)。
* SessionManager 使用带 `id`/`parentId` 的 JSONL 树，可 resume、branch、fork、clone、navigate tree、标注；Runtime 管理会话替换。[sdk.md §Session Management](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/sdk.md)。
* AgentSession 内置 compaction 和 auto-retry，并以事件暴露 compaction/retry/summarization retry；这些不是 extension 才能拼出的外围约定。[sdk.md §Events](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/docs/sdk.md)。
* tools、extensions、skills、prompts、themes 是可配置资源；README 明确把工作流能力放到这些扩展面，核心保持最小。[README.md §Customization/Philosophy](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/README.md)。
* TUI、SDK、RPC 是三种消费边界：默认模式是交互 TUI；Node 宿主调用 SDK；非 Node 宿主用严格 LF-delimited JSONL RPC。[README.md §Programmatic Usage/Modes](https://github.com/earendil-works/pi/blob/8fa7eebd235355522c8104166b4f1f959b4e2f10/packages/coding-agent/README.md)。

## 7. 三种架构选择

1. **Node SDK 架构（复用最高）**：Repa 直接调用 `createAgentSession`/Runtime，注入自己的 cwd、settings、session manager、tools 或 loader；可保留 Node extension、provider、skills、prompts、Pi session/compaction/retry/streaming。代价是 Repa 接受 Node/TypeScript runtime 与 Pi 的生命周期和资源布局，或明确写 adapter。
2. **Rust + RPC 架构（复用中高）**：Repa 保持 Rust 主进程和自己的 UI/产品边界，Pi Node 子进程承载 agent/model/auth/tools/extensions/session。tool-only/provider/skill 复用度高；TUI custom、theme、editor/footer 只能降级；要实现可靠交互，Rust 必须实现 JSONL command/event 与 extension UI request/response。
3. **未来不使用 Pi（复用最低）**：只能把 `SKILL.md`、Markdown prompts、JSON themes、tool/provider 设计思想作为数据或规范迁移；所有 extension runtime、package manager、认证、agent loop、session tree、retry/compaction/streaming、TUI/RPC 都需重做。不存在官方承诺的跨宿主 ABI，因此“直接运行 Pi extension”不成立。

## 8. 关键限定

* 上述“可直接复用”指在 Pi Node runtime 中按官方 API 运行，不表示能把 TypeScript extension 编译成 Rust 原生插件。
* RPC 能加载并运行 extension/package 资源，是因为 Pi Node 进程仍执行 `DefaultResourceLoader`/package resolution；Rust 端仅是协议消费者。
* package/extension/skill 均是信任边界内的任意代码或任意模型指令；Repa 若把它们暴露给不受信项目，必须自行增加沙箱、审批或资源白名单。Pi 官方文档只提供 trust gating，不宣称 sandbox。
