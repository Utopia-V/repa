import { useEffect, useMemo, useState } from "react";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { RepaClient, type ClientConnection } from "repa/client";

import { routes } from "./routes";

type BootstrapState =
  | { status: "starting" }
  | { status: "failed"; message: string }
  | { status: "ready"; connected: boolean };

export type LoadConnection = () => Promise<ClientConnection>;

export async function loadWebConnection(): Promise<ClientConnection> {
  const response = await fetch("/__repa/connection", {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error(
      response.ok
        ? "Web 环境返回了无效的后端连接。"
        : "当前 Web 环境没有提供 Repa 后端连接。",
    );
  }
  if (!response.ok) {
    throw new Error(
      value &&
        typeof value === "object" &&
        "error" in value &&
        typeof value.error === "string"
        ? value.error
        : "当前 Web 环境没有提供 Repa 后端连接。",
    );
  }
  if (
    !value ||
    typeof value !== "object" ||
    !("url" in value) ||
    typeof value.url !== "string" ||
    !("token" in value) ||
    typeof value.token !== "string"
  ) {
    throw new Error("Web 开发服务器返回了无效的后端连接。");
  }
  return { url: value.url, token: value.token };
}

export function App({
  loadConnection = loadWebConnection,
}: {
  loadConnection?: LoadConnection;
}) {
  const router = useMemo(() => createBrowserRouter(routes), []);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<BootstrapState>({ status: "starting" });

  useEffect(() => {
    let active = true;
    let client: RepaClient | undefined;
    let removeListener: (() => void) | undefined;
    setState({ status: "starting" });

    void (async () => {
      try {
        const connection = await loadConnection();
        if (!active) return;
        client = await RepaClient.connect(connection);
        if (!active) {
          await client.close();
          return;
        }
        removeListener = client.onConnectionChange((connected) => {
          if (active) setState({ status: "ready", connected });
        });
        setState({ status: "ready", connected: true });
      } catch (error) {
        if (!active) return;
        setState({
          status: "failed",
          message: error instanceof Error ? error.message : "无法启动 Repa。",
        });
      }
    })();

    return () => {
      active = false;
      removeListener?.();
      void client?.close();
    };
  }, [attempt, loadConnection]);

  if (state.status !== "ready") {
    return (
      <main className="startup-shell">
        <section className="startup-card" aria-labelledby="startup-title">
          <p className="eyebrow">Repa Web</p>
          <h1 id="startup-title">
            {state.status === "starting" ? "正在准备 Repa" : "Repa 启动失败"}
          </h1>
          <p
            className="description"
            role={state.status === "failed" ? "alert" : "status"}
          >
            {state.status === "starting"
              ? "正在启动或连接本机学习后端…"
              : state.message}
          </p>
          {state.status === "failed" && (
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              重试
            </button>
          )}
        </section>
      </main>
    );
  }

  return (
    <>
      {!state.connected && (
        <div className="connection-banner" role="status">
          后端连接已中断，正在自动重连…
        </div>
      )}
      <RouterProvider router={router} />
    </>
  );
}
