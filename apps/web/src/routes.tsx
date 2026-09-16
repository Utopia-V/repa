import { Navigate, type RouteObject } from "react-router";
import { WorkspaceLayout } from "@/layouts/workspace-layout";
import { workspaceSections } from "@/components/domain/sidebar-data";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <WorkspaceLayout />,
    children: [
      { index: true, element: <Navigate to="/sources" replace /> },
      { path: "chat", element: null },
      { path: "chat/:conversationId", element: null },
      ...workspaceSections.map(({ path }) => ({ path, element: null })),
      { path: "sources/:sourceId/knowledge-tree", element: null },
      { path: "settings", element: null },
      { path: "*", element: <p className="p-8">未找到页面。</p> },
    ],
  },
];
