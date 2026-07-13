import { createMemo, createSignal } from "solid-js"
import { useLocal } from "../context/local"
import { useSync } from "../context/sync"
import { map, pipe, entries, sortBy } from "remeda"
import { DialogSelect, type DialogSelectRef, type DialogSelectOption } from "../ui/dialog-select"
import { useTheme } from "../context/theme"
import { TextAttributes } from "@opentui/core"
import { useSDK } from "../context/sdk"
import { useProject } from "../context/project"

function Status(props: { enabled: boolean; loading: boolean }) {
  const { theme } = useTheme()
  if (props.loading) {
    return <span style={{ fg: theme.textMuted }}>⋯ Loading</span>
  }
  if (props.enabled) {
    return <span style={{ fg: theme.success, attributes: TextAttributes.BOLD }}>✓ Enabled</span>
  }
  return <span style={{ fg: theme.textMuted }}>○ Disabled</span>
}

export async function toggleMcpInDirectory<T>(input: {
  name: string
  directory: string
  toggle: (name: string, directory: string) => Promise<unknown>
  status: (directory: string) => Promise<{ data?: T }>
  currentDirectory: () => string
  commit: (data: T) => void
}) {
  await input.toggle(input.name, input.directory)
  const status = await input.status(input.directory)
  if (input.currentDirectory() !== input.directory) return false
  if (status.data === undefined) throw new Error("Failed to refresh MCP status: no data returned")
  input.commit(status.data)
  return true
}

export function DialogMcp() {
  const local = useLocal()
  const sync = useSync()
  const sdk = useSDK()
  const project = useProject()
  const [, setRef] = createSignal<DialogSelectRef<unknown>>()
  const [loading, setLoading] = createSignal<string | null>(null)

  const options = createMemo(() => {
    // Track sync data and loading state to trigger re-render when they change
    const mcpData = sync.data.mcp
    const loadingMcp = loading()

    return pipe(
      mcpData ?? {},
      entries(),
      sortBy(([name]) => name),
      map(([name, status]) => ({
        value: name,
        title: name,
        description: status.status === "failed" ? "failed" : status.status,
        footer: <Status enabled={local.mcp.isEnabled(name)} loading={loadingMcp === name} />,
        category: undefined,
      })),
    )
  })

  const actions = createMemo(() => [
    {
      command: "dialog.mcp.toggle",
      title: "toggle",
      onTrigger: async (option: DialogSelectOption<string>) => {
        // Prevent toggling while an operation is already in progress
        if (loading() !== null) return

        setLoading(option.value)
        try {
          const directory = project.instance.directory()
          await toggleMcpInDirectory({
            name: option.value,
            directory,
            toggle: local.mcp.toggle,
            status: (target) => sdk.client.mcp.status({ directory: target }),
            currentDirectory: project.instance.directory,
            commit: (data) => sync.set("mcp", data),
          })
        } catch (error) {
          console.error("Failed to toggle MCP:", error)
        } finally {
          setLoading(null)
        }
      },
    },
  ])

  return (
    <DialogSelect
      ref={setRef}
      title="MCPs"
      options={options()}
      actions={actions()}
      onSelect={(_option) => {
        // Don't close on select, only on escape
      }}
    />
  )
}
