import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: "*",
    element: (
      <main className="home-shell">
        <p className="eyebrow">Repa Web</p>
        <h1>Repa</h1>
        <p className="description">后端已连接，学习工作台将在这里展开。</p>
      </main>
    ),
  },
];
