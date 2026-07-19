import { useSync } from "../../context/sync"
import { createMemo, createResource, For, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useTuiConfig } from "../../config"
import { InstallationChannel, InstallationVersion } from "@opencode-ai/core/installation/version"
import { usePluginRuntime } from "../../plugin/runtime"
import { useSDK } from "../../context/sdk"

import { getScrollAcceleration } from "../../util/scroll"

export function Sidebar(props: { sessionID: string; overlay?: boolean }) {
  const pluginRuntime = usePluginRuntime()
  const sync = useSync()
  const sdk = useSDK()
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const session = createMemo(() => sync.session.get(props.sessionID))
  const revision = createMemo(() =>
    (sync.data.message[props.sessionID] ?? [])
      .map(
        (message) =>
          `${message.id}:${"completed" in message.time ? (message.time.completed ?? "") : ""}:${(
            sync.data.part[message.id] ?? []
          )
            .map((part) => `${part.id}:${"state" in part && part.state ? part.state.status : ""}`)
            .join(",")}`,
      )
      .join("|"),
  )
  const [turns] = createResource(
    () => ({ sessionID: props.sessionID, revision: revision() }),
    (input) => sdk.client.session.turns({ sessionID: input.sessionID }).then((response) => response.data ?? []),
  )
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))

  return (
    <Show when={session()}>
      <box
        backgroundColor={theme.backgroundPanel}
        width={42}
        height="100%"
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
        position={props.overlay ? "absolute" : "relative"}
      >
        <scrollbox
          flexGrow={1}
          scrollAcceleration={scrollAcceleration()}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          <box flexShrink={0} gap={1} paddingRight={1}>
            <pluginRuntime.Slot
              name="sidebar_title"
              mode="single_winner"
              session_id={props.sessionID}
              title={session()!.title}
            >
              <box paddingRight={1}>
                <text fg={theme.text}>
                  <b>{session()!.title}</b>
                </text>
                <Show when={InstallationChannel !== "latest"}>
                  <text fg={theme.textMuted}>{props.sessionID}</text>
                </Show>
              </box>
            </pluginRuntime.Slot>
            <Show when={(turns() ?? []).length > 0}>
              <box paddingRight={1} gap={1}>
                <text fg={theme.text}>
                  <b>Turns</b>
                </text>
                <For each={(turns() ?? []).slice(-5).toReversed()}>
                  {(turn) => (
                    <text fg={turn.state === "failed" || turn.state === "exhausted" ? theme.error : theme.textMuted}>
                      {turn.id.slice(-8)} · {turn.state} · M {turn.counters.model}/{turn.limits.model} · T{" "}
                      {turn.counters.tool}/{turn.limits.tool}
                    </text>
                  )}
                </For>
              </box>
            </Show>
            <pluginRuntime.Slot name="sidebar_content" session_id={props.sessionID} />
          </box>
        </scrollbox>

        <box flexShrink={0} gap={1} paddingTop={1}>
          <pluginRuntime.Slot name="sidebar_footer" mode="single_winner" session_id={props.sessionID}>
            <text fg={theme.textMuted}>
              <span style={{ fg: theme.success }}>•</span> <b>Open</b>
              <span style={{ fg: theme.text }}>
                <b>Code</b>
              </span>{" "}
              <span>{InstallationVersion}</span>
            </text>
          </pluginRuntime.Slot>
        </box>
      </box>
    </Show>
  )
}
