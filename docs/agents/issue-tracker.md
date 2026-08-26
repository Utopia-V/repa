# Issue tracker：GitHub

本仓库的 Issue 与规格存放在 `Utopia-V/repa` 的 GitHub Issues 中。所有操作使用已认证的 `gh` CLI。

当前 checkout 配置 `Utopia-V/repa` 为 remote 后，`gh` 可以自动识别仓库；否则显式传入 `--repo Utopia-V/repa`。

## 约定

- **创建 Issue**：`gh issue create --repo Utopia-V/repa --title "..." --body "..."`。多行正文使用当前 shell 支持的多行输入方式或正文文件。
- **读取 Issue**：`gh issue view <number> --repo Utopia-V/repa --comments`；需要时用 `jq` 筛选评论，并同时读取标签。
- **列出 Issue**：`gh issue list --repo Utopia-V/repa --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，按任务添加适当的 `--label` 和 `--state` 过滤条件。
- **评论 Issue**：`gh issue comment <number> --repo Utopia-V/repa --body "..."`
- **增删标签**：`gh issue edit <number> --repo Utopia-V/repa --add-label "..."` 或 `--remove-label "..."`
- **关闭 Issue**：`gh issue close <number> --repo Utopia-V/repa --comment "..."`

## 将 Pull Request 作为 triage 入口

**PRs as a request surface: no.** 如果本仓库以后把外部 Pull Request 视为功能请求，将 `no` 改为 `yes`；`/triage` 会读取这个标记。

标记为 `yes` 后，Pull Request 使用与 Issue 相同的标签和状态，并采用对应的 `gh pr` 命令：

- **读取 Pull Request**：`gh pr view <number> --repo Utopia-V/repa --comments`，并用 `gh pr diff <number> --repo Utopia-V/repa` 查看 diff。
- **列出待 triage 的外部 Pull Request**：运行 `gh pr list --repo Utopia-V/repa --state open --json number,title,body,labels,author,authorAssociation,comments`，只保留 `authorAssociation` 为 `CONTRIBUTOR`、`FIRST_TIME_CONTRIBUTOR` 或 `NONE` 的项目，排除 `OWNER`、`MEMBER` 和 `COLLABORATOR`。
- **评论、添加标签或关闭**：使用 `gh pr comment`、`gh pr edit --add-label` 或 `--remove-label`，以及 `gh pr close`。

GitHub 的 Issue 与 Pull Request 共用编号空间，因此 `#42` 可能指向任一类型。先运行 `gh pr view 42 --repo Utopia-V/repa`，失败后再运行 `gh issue view 42 --repo Utopia-V/repa`。

## Skill 要求“发布到 issue tracker”时

在 `Utopia-V/repa` 创建 GitHub Issue。

## Skill 要求“读取相关 ticket”时

运行 `gh issue view <number> --repo Utopia-V/repa --comments`。

## Wayfinder 操作

供 `/wayfinder` 使用。一个 map 对应一个 GitHub Issue，其子 Issue 作为 ticket。

- **Map**：使用带有 `wayfinder:map` 标签的单个 Issue，正文包含 `Notes`、`Decisions-so-far` 和 `Fog`。使用 `gh issue create --repo Utopia-V/repa --label wayfinder:map` 创建。
- **子 Ticket**：通过 sub-issues endpoint 调用 `gh api`，把子 Issue 关联到 map。GitHub 未启用 sub-issue 时，在 map 正文的任务列表中加入子项，并在子 Issue 正文顶部写入 `Part of #<map>`。标签使用 `wayfinder:<type>`，其中类型为 `research`、`prototype`、`grilling` 或 `task`。认领后把 ticket 分配给当前开发者。
- **阻塞关系**：以 GitHub 原生 issue dependencies 作为界面中可见的记录。使用 `gh api --method POST repos/Utopia-V/repa/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>` 添加阻塞边；`<blocker-db-id>` 是通过 `gh api repos/Utopia-V/repa/issues/<number> --jq .id` 取得的数据库数字 ID，不是 Issue 编号或 `node_id`。GitHub 通过 `issue_dependencies_summary.blocked_by` 返回尚未关闭的 blocker。依赖功能不可用时，在子 Issue 正文顶部使用 `Blocked by: #<number>, #<number>`。所有 blocker 关闭后，ticket 才解除阻塞。
- **Frontier 查询**：列出 map 中尚未关闭的子 Issue，排除存在未关闭 blocker 或已经有 assignee 的项目，按 map 中的顺序选择第一个剩余项目。
- **认领**：`gh issue edit <number> --repo Utopia-V/repa --add-assignee @me`；这是当前 session 的第一次写操作。
- **完成**：在子 Issue 中评论答案并关闭，然后在 map 的 `Decisions-so-far` 中追加上下文指针。
