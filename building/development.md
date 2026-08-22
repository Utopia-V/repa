# 在 Repa 中工作

这份指南帮助新的共同建设者启动项目、找到相关代码，并完成一次与产品问题相连的改动。具体目录里的 `AGENTS.md` 会补充局部维护规则；这里保留整条开发路径。

## 准备环境

Repa 使用 TypeScript 和 Bun。仓库根目录的 `package.json` 固定了 Bun 版本，目前为 `1.3.14`。

```powershell
bun --version
bun install
```

当前目录是本次 Agent 的工作目录，LearnerHome 数据库默认位于用户数据目录。源码分支启动时会检查并迁移它所连接的数据库，因此日常开发应先为当前 worktree 指定独立路径：

```powershell
$repaDevRoot = Join-Path $env:TEMP ("repa-dev-" + (Split-Path -Leaf (Get-Location)))
New-Item -ItemType Directory -Force -Path $repaDevRoot | Out-Null
$env:REPA_DB = Join-Path $repaDevRoot "repa.db"
```

可以先查看当前 shell 将要使用的数据库，再启动主要 TUI：

```powershell
bun run --cwd packages/opencode dev db path
bun run dev
```

TUI 没有可用 provider 时会打开连接界面。进入界面后可以使用 `/connect` 更换 provider，使用 `/models` 或 CLI 的 `repa models` 查看模型。开发时也可以通过 `--model provider/model` 选择模型。

准备让当前分支处理自己的长期学习数据时，可以在新的 shell 中使用默认数据库路径。手动测试迁移、导入和删除始终保留独立的 `REPA_DB`。package 测试会自行创建隔离环境。

也可以直接在 `packages/opencode` 中运行：

```powershell
cd packages/opencode
bun run dev
```

手动测试结束后先关闭 Repa，再处理对应的临时目录。

## 常用运行入口

```powershell
# 主要 TUI
bun run dev

# 直接发送一条消息
bun run --cwd packages/opencode dev run "请解释这个目录里的材料"

# 启动最小交互界面
bun run --cwd packages/opencode dev --mini

# 查看 CLI 帮助
bun run --cwd packages/opencode dev --help
```

正式构建后的 binary 名为 `repa`。源码开发时使用上面的 Bun 命令，能够确保运行当前 worktree 中的代码。

## 从学习行为进入代码

先用一句话说明要改变的学习行为。例如：“学习者在材料读取后追问时，Tutor 应继续回答原问题”比“调整 Context renderer”更能约束实现。随后沿着实际路径找到边界：

| 想处理的问题                         | 常见入口                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| 默认 Tutor 行为和模型规则            | `packages/opencode/src/session/prompt/repa.txt`、`packages/opencode/src/agent/`       |
| 每次采样看到的学习背景               | `packages/core/src/learning-context.ts`、`packages/core/src/turn/learning-context.ts` |
| Session、Turn、模型循环与恢复        | `packages/opencode/src/session/`、`packages/core/src/turn/`                           |
| 学习工具和权限                       | `packages/opencode/src/tool/`、`packages/opencode/src/learning-command/`              |
| 一种长期学习信息                     | `packages/core/src/<area>/` 及其 schema、SQL 和 command                               |
| 课程、材料和 readable representation | `packages/core/src/course.ts`、`artifact.ts`、`material-map.ts`、`representation.ts`  |
| TUI 交互和呈现                       | `packages/tui/src/`                                                                   |
| 本地 HTTP 或其他 carrier             | `packages/server`、`packages/protocol`                                                |
| 公开 API 与客户端                    | `packages/protocol`、`packages/client`、`packages/sdk/js`                             |
| 数据库 schema 和迁移                 | `packages/core/src/database/`、`packages/core/script/migration.ts`                    |

一个模型可见的学习能力通常会穿过几层：Core 保存含义与状态，opencode tool 暴露模型动作，LearningContext 提供发现入口，TUI 呈现结果。修改前先确认这些层是否都由同一个真实行为需要连接。

## 与 coding agent 协作

仓库根目录和关键源码目录中的 `AGENTS.md` 保存 coding agent 的执行约束。让 agent 从仓库上下文开始工作，并在任务中说明学习行为、代码范围和期望证据；agent 会按实际文件位置读取相应规则。共同建设者的产品理解和开发入口仍以 `building/` 为准。

## 测试与类型检查

仓库根命令会拒绝运行全量测试。测试从实际受影响的 package 执行：

```powershell
cd packages/opencode
bun test test/session/prompt.test.ts
bun run typecheck
```

Core 和 TUI 同样在各自目录中运行：

```powershell
cd packages/core
bun test test/turn.test.ts
bun run typecheck

cd ../tui
bun test test/component/dialog-session-list.test.ts
bun run typecheck
```

选择测试时先确定它要区分什么。模型 prompt 的修改可能需要确定性 mock、真实 provider 观察或两者结合；数据库变化需要迁移、失败和恢复检查；纯文档变化主要检查内容、链接和 diff。全 package 或更广的 suite 适合依赖范围真的跨越这些边界时运行。

## 数据库迁移

Core schema 变化通过 Repa 前向迁移进入现有 LearnerHome。修改 schema 后在 `packages/core` 运行：

```powershell
cd packages/core
bun run migration
```

脚本会生成迁移、更新 registry 和当前 schema。四类输出位于：

- 新迁移：`packages/core/src/database/migration/repa/`；
- 迁移 registry：`packages/core/src/database/migration.gen.ts`；
- 当前 TypeScript schema：`packages/core/src/database/schema.gen.ts`；
- schema snapshot：`packages/core/schema.json`。

这些文件应与源 schema 一起检查。

数据库迁移既要覆盖新数据库，也要从真实历史 fixture 验证升级。一个修改若改变旧数据的含义，还需要说明恢复和修正路径。

## Protocol、Client 与 SDK 生成

修改公开 Protocol 或 Server HTTP API 后，从 `packages/client` 重新生成客户端：

```powershell
cd packages/client
bun run generate
```

生成目录由脚本维护，不直接编辑。JavaScript SDK 使用：

```powershell
cd packages/sdk/js
bun run script/build.ts
```

生成后检查 diff，确认变化来自预期的 schema 或 endpoint。协议层应保留 Session、错误和语义结果的实际含义，让不同交互入口继续使用同一套产品行为。

## 调试一次互动

遇到模型行为或状态问题时，可以从一条具体输入向下追踪：

1. TUI 或 `repa run` 怎样发送输入；
2. Session 是否接纳了正确的学习者消息和 Turn；
3. 当前采样使用了哪个 Agent、model、可用工具和 LearningContext cut；
4. 模型实际调用了哪些工具；
5. 工具结果是提交成功、没有变化还是失败；
6. 后续采样是否看到了新的状态；
7. 学习者可见的呈现是否与提交结果一致；
8. restart、continue 或 compaction 后行为是否保持。

`--print-logs` 和 `--log-level DEBUG` 可以输出运行日志：

```powershell
bun run --cwd packages/opencode dev --print-logs --log-level DEBUG
```

TUI 的 `/status` 与 `/debug` 提供当前连接和运行信息。需要保留模型行为证据时，记录输入、model、Context、工具序列和最终输出，同时清理凭据与个人材料。

## 研究模型行为

模型实验从 [学习情境](learning-situations.md) 中选择一个真实问题，并明确什么观察会改变设计。一个有用的比较通常包括：

- 同一上下文下两个 prompt 或工具形状；
- 同一场景在多个模型上的行为；
- 是否回应当前请求；
- 是否保留主问题并在读取后返回；
- 是否调用了必要工具；
- 是否把内部状态写进教学文字；
- 学习者是否认为下一步有帮助。

确定性测试负责工具身份、权限、状态和恢复。模型输出中的教学判断保留具体例子和差异，不用一个宽泛总分替代观察。

## 完成一项改动

完成时回到最初的学习行为，确认代码、测试和文档表达的是同一件事。一次交付至少应让下一位协作者知道：

- 学习者会看到什么变化；
- 当前代码由哪个边界负责；
- 方案依赖了哪些产品判断；
- 运行了哪些能够区分结果的检查；
- 哪些观察可能让我们以后重新设计它。

当改动改变了共同理解，更新 `building/` 中真正拥有这项内容的章节。具体实现状态仍由代码、测试和 Git 保持。
