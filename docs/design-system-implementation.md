# 设计系统实现说明

稳定规则见 [DESIGN.md](../DESIGN.md)，Web 开发约束见 [apps/web/AGENTS.md](../apps/web/AGENTS.md)。

`apps/web/src/globals.css` 持有统一主题与语义 token，`components/ui` 持有通用组件及交互状态，`components/domain` 组合业务展示。组件来源与本地适配见[通用组件说明](../apps/web/src/components/ui/README.md)。

当前已配置 Tailwind 的 Vite 集成与 `@/` 路径别名，准备好主题和组件；主应用接入将在后续提交完成。Desktop 尚未迁移。

验证入口为 `npm run check --workspace=@repa/web`、`npm run test --workspace=@repa/web` 与 `npm run build --workspace=@repa/web`；`test/design-system.test.tsx` 覆盖主题对比度、组件选择、按钮语义、进度值和弹窗焦点恢复。
