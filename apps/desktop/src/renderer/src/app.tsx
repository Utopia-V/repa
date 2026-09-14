import { useEffect, useMemo, useState } from "react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { RepaClient, type ClientConnection } from "repa/client";

import { routes } from "./routes";

type BootstrapState =
  | { status: "starting" }
  | { status: "failed"; message: string }
  | { status: "ready"; connected: boolean };

export type LoadConnection = () => Promise<ClientConnection>;

export function loadDesktopConnection(): Promise<ClientConnection> {
  return window.repaHost.getConnection();
}

export function App({
  loadConnection = loadDesktopConnection,
}: {
  loadConnection?: LoadConnection;
}) {
  const router = useMemo(() => createMemoryRouter(routes), []);
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
          <p className="eyebrow">Repa Desktop</p>
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
