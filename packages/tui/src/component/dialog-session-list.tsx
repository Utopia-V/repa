import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"
import { useRoute } from "../context/route"
import { useSync } from "../context/sync"
import { createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js"
import path from "path"
import { Locale } from "../util/locale"
import { useProject } from "../context/project"
import { useTheme } from "../context/theme"
import { useSDK } from "../context/sdk"
import { useLocal } from "../context/local"
import { DialogSessionRename } from "./dialog-session-rename"
import { createDebouncedSignal } from "../util/signal"
import { useToast } from "../ui/toast"
import { Spinner } from "./spinner"
import { errorMessage } from "../util/error"
import { useCommandShortcut } from "../keymap"
import { useEvent } from "../context/event"
import type { SessionDeleteProposalResponse } from "@opencode-ai/sdk/v2"

type SessionDeletionCurrentResult = Extract<SessionDeleteProposalResponse, { type: string }>
type SessionDeletionProposal = Exclude<SessionDeleteProposalResponse, SessionDeletionCurrentResult>

type SessionListFilter = { scope?: "project"; path?: string }
type LocatedSessionList<T> = { directory: string; data?: T[] }

export const sessionDeletionModeOptions: {
  title: string
  value: "minimal_audit" | "full"
  description: string
}[] = [
  {
    title: "Delete bodies; keep minimal inspection lineage",
    value: "minimal_audit" as const,
    description: "Retains a body-free, non-causal audit until you purge it",
  },
  {
    title: "Delete bodies and inspection lineage",
    value: "full" as const,
    description: "Only the immutable deletion-control receipt remains",
  },
]

export function createSessionDeletionProposalView(proposal: {
  rootSessionID: string
  subtreeCount: number
  subtreeFingerprint: string
  mode: "minimal_audit" | "full"
  targets: readonly { sessionID: string; parentSessionID?: string | null }[]
}) {
  const mode =
    proposal.mode === "minimal_audit"
      ? "delete bodies; keep minimal inspection lineage"
      : "delete bodies and inspection lineage"
  return {
    title: `Confirm deletion of ${proposal.subtreeCount} Session${proposal.subtreeCount === 1 ? "" : "s"}`,
    mode,
    targets: proposal.targets.map((target) => ({
      title: target.sessionID,
      value: target.sessionID,
      description: target.sessionID === proposal.rootSessionID ? "root" : "descendant",
      details: [target.parentSessionID ? `parent ${target.parentSessionID}` : "no parent"],
    })),
    footer: [
      `Mode: ${mode}`,
      `Root: ${proposal.rootSessionID}`,
      `Scope fingerprint: ${proposal.subtreeFingerprint}`,
      "Local export files are outside this deletion and are not removed.",
    ],
  }
}

export function selectDialogSessionList<T>(input: {
  directory: string
  search?: LocatedSessionList<T>
  browse?: LocatedSessionList<T>
  fallback: { directory?: string; data: T[] }
}) {
  if (input.search?.directory === input.directory && input.search.data) return input.search.data
  if (input.browse?.directory === input.directory && input.browse.data) return input.browse.data
  if (input.fallback.directory === input.directory) return input.fallback.data
  return []
}

export function createDialogSessionListQuery(input: {
  directory: string
  search?: string
  filter: SessionListFilter
}) {
  const search = input.search?.trim()
  return {
    directory: input.directory,
    roots: true,
    limit: search ? 30 : 100,
    ...(search ? { search } : {}),
    ...input.filter,
  }
}

export function loadDialogSessionList<T>(input: {
  directory: string
  search?: string
  filter: SessionListFilter
  list: (query: ReturnType<typeof createDialogSessionListQuery>) => Promise<{ data?: T[] }>
}) {
  return input.list(createDialogSessionListQuery(input)).then(
    (result) => result.data,
    () => undefined,
  )
}

export function DialogSessionList() {
  const dialog = useDialog()
  const route = useRoute()
  const sync = useSync()
  const project = useProject()
  const { theme } = useTheme()
  const sdk = useSDK()
  const event = useEvent()
  const local = useLocal()
  const toast = useToast()
  const [deleted, setDeleted] = createSignal(new Set<string>())
  const [search, setSearch] = createDebouncedSignal("", 150)
  const quickSwitch1 = useCommandShortcut("session.quick_switch.1")
  const quickSwitch9 = useCommandShortcut("session.quick_switch.9")

  const [browseResults, { refetch: refetchBrowse }] = createResource(
    () => ({ directory: project.instance.directory(), filter: sync.session.query() }),
    async (input) => ({
      directory: input.directory,
      data: await loadDialogSessionList({
        ...input,
        list: (query) => sdk.client.session.list(query),
      }),
    }),
  )
  const [searchResults, { refetch }] = createResource(
    () => ({ directory: project.instance.directory(), query: search(), filter: sync.session.query() }),
    (input) => {
      if (!input.query) return undefined
      return loadDialogSessionList({
        directory: input.directory,
        search: input.query,
        filter: input.filter,
        list: (query) => sdk.client.session.list(query),
      }).then((data) => ({ directory: input.directory, data }))
    },
  )

  const currentSessionID = createMemo(() => (route.data.type === "session" ? route.data.sessionID : undefined))
  const sessions = createMemo(() => {
    const result = selectDialogSessionList({
      directory: project.instance.directory(),
      search: searchResults(),
      browse: browseResults(),
      fallback: { directory: sync.data.cache_directory, data: sync.data.session },
    })
    const synced = new Map(sync.data.session.map((session) => [session.id, session]))
    const ids = new Set(result.map((session) => session.id))
    const extra = [currentSessionID(), ...local.session.pinned()].flatMap((id) => {
      if (!id || ids.has(id)) return []
      const session = synced.get(id)
      if (session) ids.add(id)
      return session ? [session] : []
    })
    const query = search().trim().toLowerCase()
    return [...result.map((session) => synced.get(session.id) ?? session), ...extra]
      .filter((session) => !deleted().has(session.id))
      .filter((session) => !query || session.title.toLowerCase().includes(query))
  })

  onCleanup(
    event.on("session.deleted", (event) => {
      setDeleted((current) => new Set(current).add(event.properties.info.id))
    }),
  )

  function orderByRecency(sessionsList: NonNullable<ReturnType<typeof sessions>>) {
    return sessionsList
      .filter((x) => x.parentID === undefined)
      .toSorted((a, b) => b.time.updated - a.time.updated)
      .map((x) => x.id)
  }

  const browseOrder = createMemo(() => orderByRecency(sessions()))

  const quickSwitchHint = createMemo(() => {
    const first = quickSwitch1()
    const last = quickSwitch9()
    if (!first || !last) return undefined
    return quickSwitchRange(first, last)
  })
  const quickSwitchFooterHints = createMemo(() => {
    const hint = quickSwitchHint()
    return hint && local.session.slots().length > 0 ? [{ title: "switch", label: hint }] : []
  })

  const options = createMemo(() => {
    const today = new Date().toDateString()
    const sessionMap = new Map(
      sessions()
        .filter((x) => x.parentID === undefined)
        .map((x) => [x.id, x]),
    )

    const searchResult = searchResults()
    const order = searchResult ? orderByRecency(sessions()) : browseOrder()
    const current = currentSessionID()
    const displayOrder = current && sessionMap.has(current) && !order.includes(current) ? [...order, current] : order

    const pinned = local.session.pinned().filter((id) => sessionMap.has(id))
    const pinnedSet = new Set(pinned)
    const slotByID = new Map<string, number>(local.session.slots().map((id, i) => [id, i + 1]))

    function buildOption(id: string, category: string) {
      const x = sessionMap.get(id)
      if (!x) return undefined
      const directory = x.path
        ? x.directory.endsWith(x.path)
          ? x.directory.slice(0, -x.path.length).replace(/\/$/, "")
          : undefined
        : x.directory
      const footer =
        directory && directory !== project.data.project.mainDir ? Locale.truncate(path.basename(directory), 20) : ""

      const status = sync.data.session_status?.[x.id]
      const isWorking = status?.type === "busy" || status?.type === "retry"
      const slot = slotByID.get(x.id)
      const gutter = isWorking
        ? () => <Spinner />
        : slot !== undefined
          ? () => <text fg={theme.accent}>{slot}</text>
          : undefined
      return {
        title: x.title,
        value: x.id,
        category,
        footer,
        gutter,
      }
    }

    const remaining = displayOrder
      .filter((id) => !pinnedSet.has(id))
      .map((id) => {
        const x = sessionMap.get(id)
        if (!x) return undefined
        const label = new Date(x.time.updated).toDateString()
        return buildOption(id, label === today ? "Today" : label)
      })
      .filter((x) => x !== undefined)

    return [...pinned.map((id) => buildOption(id, "Pinned")).filter((x) => x !== undefined), ...remaining]
  })

  onMount(() => {
    dialog.setSize("large")
  })

  return (
    <DialogSelect
      title="Sessions"
      options={options()}
      skipFilter={true}
      preserveSelection={true}
      current={currentSessionID()}
      onFilter={setSearch}
      onSelect={(option) => {
        route.navigate({
          type: "session",
          sessionID: option.value,
        })
        dialog.clear()
      }}
      actions={[
        {
          command: "session.pin.toggle",
          title: "pin/unpin",
          onTrigger: (option: { value: string }) => {
            local.session.togglePin(option.value)
          },
        },
        {
          command: "session.delete",
          title: "delete",
          onTrigger: (option) => {
            dialog.replace(() => (
              <DialogSessionDelete
                sessionID={option.value}
                onDeleted={async () => {
                  await refetchBrowse()
                  if (search()) await refetch()
                }}
              />
            ))
          },
        },
        {
          command: "session.rename",
          title: "rename",
          onTrigger: async (option) => {
            dialog.replace(() => <DialogSessionRename session={option.value} />)
          },
        },
      ]}
      footerHints={quickSwitchFooterHints()}
    />
  )
}

function DialogSessionDelete(props: { sessionID: string; onDeleted: () => Promise<void> }) {
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()
  const [loading, setLoading] = createSignal(false)

  return (
    <DialogSelect
      title="Choose Session deletion behavior"
      renderFilter={false}
      locked={loading()}
      options={sessionDeletionModeOptions}
      onSelect={async (option) => {
        if (loading()) return
        setLoading(true)
        const result = await sdk.client.session
          .deleteProposal({
            sessionID: props.sessionID,
            mode: option.value,
          })
          .catch((error) => ({ error, data: undefined }))
        setLoading(false)
        if (result.error || !result.data) {
          toast.show({
            variant: "error",
            title: "Could not prepare Session deletion",
            message: errorMessage(result.error ?? "The server returned no deletion proposal"),
          })
          return
        }
        const prepared: SessionDeleteProposalResponse = result.data
        if ("type" in prepared) {
          toast.show({
            variant: prepared.type === "deletion_mode_conflict" ? "error" : "success",
            title:
              prepared.type === "deletion_mode_conflict"
                ? "Session was already deleted with another mode"
                : "Session deletion was already committed",
            message:
              prepared.type === "deletion_mode_conflict"
                ? `Original mode: ${prepared.settlement.mode}. Nothing was changed.`
                : `Deleted at ${prepared.settlement.deletionTime}. Minimal audit ${prepared.auditAvailable ? "is available" : "is not retained"}.`,
          })
          dialog.clear()
          return
        }
        dialog.replace(() => <DialogSessionDeleteProposal proposal={prepared} onDeleted={props.onDeleted} />)
      }}
    />
  )
}

function DialogSessionDeleteProposal(props: {
  proposal: SessionDeletionProposal
  onDeleted: () => Promise<void>
}) {
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()
  const [submitting, setSubmitting] = createSignal(false)
  const view = () => createSessionDeletionProposalView(props.proposal)

  return (
    <DialogSelect
      title={view().title}
      renderFilter={false}
      locked={submitting()}
      options={view().targets}
      footer={
        <box flexDirection="column">
          {view().footer.map((line) => (
            <text>{line}</text>
          ))}
        </box>
      }
      actions={[
        {
          command: "session.delete",
          title: "confirm delete",
          disabled: submitting(),
          onTrigger: async () => {
            if (submitting()) return
            setSubmitting(true)
            const result = await sdk.client.session
              .delete({
                sessionID: props.proposal.rootSessionID,
                ...props.proposal,
              })
              .catch((error) => ({ error, data: undefined }))
            if (result.error || !result.data) {
              setSubmitting(false)
              toast.show({
                variant: "error",
                title: "Session deletion was not committed",
                message: errorMessage(result.error ?? "The server returned no deletion settlement"),
              })
              return
            }

            const resultType = result.data.type
            const settlement = result.data.settlement
            toast.show({
              variant: resultType === "deletion_mode_conflict" ? "error" : "success",
              title:
                resultType === "applied"
                  ? "Session deletion committed"
                  : resultType === "deletion_mode_conflict"
                    ? "Session was already deleted with another mode"
                    : "Session deletion was already committed",
              message:
                resultType === "deletion_mode_conflict"
                  ? `Original mode: ${settlement.mode}. Nothing was changed.`
                  : `${settlement.subtreeCount} Session${settlement.subtreeCount === 1 ? "" : "s"} deleted. Minimal audit ${result.data.auditAvailable ? "is available" : "is not retained"}.`,
            })
            await props.onDeleted()
            dialog.clear()
          },
        },
      ]}
    />
  )
}

function quickSwitchRange(first: string, last: string) {
  const prefix = first.slice(0, -1)
  if (first.endsWith("1") && last === `${prefix}9`) return `${prefix}1-9`
  return `${first} through ${last}`
}
