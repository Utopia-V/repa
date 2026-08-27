# Repa

Repa 是一个独立、本地优先的学习 Agent 应用。当前实现完成了第一条可运行细线：学习者可以打开自己的本地学习者空间，通过最小 TUI 与 Pi 支持的 provider 流式对话，正常关闭后恢复同一个 Pi Session，并在明确授权后加载兼容的 Pi Package、Extension、skill 和 prompt。

当前版本只实现普通 Agent 对话路径；学习计划、学习者记忆、学习 Wiki、来源材料和历史搜索尚未进入生产实现。

## 环境与安装

需要 Node.js 22.19.0 或更高版本。依赖版本由 `package-lock.json` 固定。

```powershell
npm ci --ignore-scripts
npm run check
npm test
```

测试使用真实 Pi Node SDK、临时本地目录和 Pi 提供的确定性 faux provider，不读取开发者凭据、不访问网络，也不会产生付费模型调用。

## 配置 provider

Repa 复用 Pi 的 provider、模型与认证配置。最直接的配置方式是先运行仓库锁定版本的 Pi：

```powershell
npm exec -- pi
```

在 Pi 中使用 `/login` 配置认证，并使用 `/model` 选择默认模型。Pi 保存的全局配置位于其标准 agent 目录中；Repa 启动时读取同一配置。也可以按照相应 provider 的 Pi 说明通过环境变量提供 API key。

Repa 的最小 TUI 暂不提供登录或模型选择界面。如果没有可用模型，Application 会返回可显示、可恢复的 `configuration` 错误事件，而不会把 Pi 内部异常泄漏给 TUI。

## 启动 TUI

把第一个参数换成学习者希望长期持有的本地目录：

```powershell
npm start -- C:\Learning\my-space
```

Repa 会在目录不存在时创建它，并把 Pi Session 保存在 `<learner-space>/.repa/sessions/`。再次用同一路径启动时，默认恢复最近的 Session；要开始新的 Session，使用：

```powershell
npm start -- C:\Learning\my-space --new-session
```

TUI 支持两个本地命令：

- `/cancel`：取消正在进行的生成。
- `/exit`：正常关闭应用并保留 Session。

生成期间按 `Ctrl+C` 会取消生成；空闲时按 `Ctrl+C` 会正常关闭。

## Package 与 Extension 信任

默认情况下，Repa 不加载 Pi Package、Extension、skill 或 prompt。只有显式加入 `--trust-extensions` 后，才会读取 Pi 的全局资源和学习者空间中的项目资源：

```powershell
npm start -- C:\Learning\my-space --trust-extensions
```

Package 和 Extension 中的代码以 Repa 宿主进程的完整权限运行，skill 也可以向模型提供任意指令；这不是沙箱。TUI 会在每次启用这些资源时显示这一信任含义。安装第三方 Package 前应先审查其来源和代码。

Repa 关闭 Pi 默认的 `read`、`write`、`edit`、`bash` 等 coding tools，只提供一个同名兼容 `read`。这个 `read` 只能读取当前已启用 skill 自己目录中的文本资源，用于按需加载完整 `SKILL.md` 及其配套说明；它不会恢复任意文件访问或整套默认 coding tools。受信任的 tool-only Extension 仍可注册自己的工具。

## Application interface

TUI 和测试使用同一个 Repa Application command/event interface。调用方只需要打开学习者空间、消费事件并发送 `send`、`cancel` 或 `close` 命令，不需要了解 Pi 对象、provider payload 或 Session 文件布局。

```typescript
import { openRepa } from "./src/index.js";

const opened = await openRepa({ learnerSpace: "C:/Learning/my-space" });
if (!opened.ok) throw new Error(opened.error.message);

const eventsFinished = (async () => {
  for await (const event of opened.application.events) {
    if (event.type === "assistant_text_delta") process.stdout.write(event.delta);
  }
})();

await opened.application.command({ type: "send", text: "解释虚拟内存" });
await opened.application.command({ type: "close" });
await eventsFinished;
```

Application 将 Pi 的流式文本、工具状态、取消、compaction 和关闭映射为稳定领域事件。provider、Extension、compaction 或 Session 故障会成为带稳定类别和 `recoverable` 标记的错误事件。

## 构建

```powershell
npm run build
node dist/cli.js C:\Learning\my-space
```

架构与产品边界以 [CONTEXT.md](CONTEXT.md)、[通过 Node SDK 嵌入 Pi](docs/adr/0001-embed-pi-through-node-sdk.md) 和 GitHub Issue [#3](https://github.com/Utopia-V/repa/issues/3)、[#4](https://github.com/Utopia-V/repa/issues/4) 为准。
