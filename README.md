# Repa

Repa 是一个独立、本地优先的学习 Agent 应用。用户可以选择任意本地目录作为学习空间，让一般 Agent 使用普通文件、通用工具和可安装能力参与开放的长期学习。Repa 将 Pi 作为内部 SDK，复用它的模型与 provider、Agent loop、Session、通用工具和扩展运行时。

当前实现完成了第一条可运行细线：用户可以通过最小 TUI 与 Pi 支持的 provider 流式对话，正常关闭后恢复同一个 Pi Session，并在明确信任后加载兼容的 Pi Package、Extension、Skill 和 prompt。Pi 通用工具与学习语境的内部注入 Extension 尚未进入当前实现。

## 产品模型

学习空间的内容和目录结构由用户和 Agent 自由组织。Repa 可以默认在 `.repa/` 中保存与该空间关联的 Session、配置和可重建缓存；空间位置与推荐布局可由用户调整。

学习语境是一份持续注入、可由用户和 Agent 增删改查的数据。Repa 内部 Extension 在每次 Agent run 开始前取得其当前视图。Markdown 是最简单的实验候选，也可以继续评估更适合局部编辑和前端共用的数据结构。Pi Session JSONL 保存实际交流，Agent 在当前工作需要过去细节时自行搜索。

材料处理、规划、知识整理和可视化等能力通过 Pi Package、Extension、Skill 或 prompt 加入。Repa 可以发布官方扩展，也可以加载兼容的 Pi 社区扩展。

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

默认情况下，Repa 不加载 Pi Package、Extension、Skill 或 prompt。只有显式加入 `--trust-extensions` 后，才会读取 Pi 的全局资源和学习空间中的项目资源：

```powershell
npm start -- C:\Learning\my-space --trust-extensions
```

Package 和 Extension 中的代码以 Repa 宿主进程的完整权限运行，Skill 也可以向模型提供任意指令；这不是沙箱。TUI 会在每次启用这些资源时显示这一信任含义。安装第三方 Package 前应先审查其来源和代码。

当前细线关闭了 Pi 默认的 `read`、`write`、`edit`、`bash` 等工具，只保留用于读取已启用 Skill 资源的兼容 `read`。后续主体实现将直接启用 Pi 的通用文件、搜索和执行工具，学习空间作为它们的工作目录。

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

稳定领域语义以 [CONTEXT.md](CONTEXT.md) 为准，已接受的工程取舍见 [架构决策记录](docs/adr/)；Pi 嵌入边界由 [将 Pi 作为 Repa 的内部 Agent SDK](docs/adr/0001-embed-pi-through-node-sdk.md) 持有。

当前产品模型见 GitHub Issue [#5](https://github.com/Utopia-V/repa/issues/5)；[#6](https://github.com/Utopia-V/repa/issues/6) 负责接入可编辑学习语境并启用 Pi 通用工具。[#7](https://github.com/Utopia-V/repa/issues/7)、[#8](https://github.com/Utopia-V/repa/issues/8) 和 [#9](https://github.com/Utopia-V/repa/issues/9) 分别记录可视化、规划与知识整理的扩展想法。[#3](https://github.com/Utopia-V/repa/issues/3) 是已退役的早期规格；[#4](https://github.com/Utopia-V/repa/issues/4) 描述当前已经跑通的对话细线。
