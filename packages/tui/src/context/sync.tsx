import type {
  Message,
  Agent,
  Provider,
  Session,
  Part,
  Config,
  Todo,
  Command,
  PermissionRequest,
  QuestionRequest,
  LspStatus,
  McpStatus,
  McpResource,
  FormatterStatus,
  SessionStatus,
  ProviderListResponse,
  ProviderAuthMethod,
  VcsInfo,
  SnapshotFileDiff,
  TurnInfo,
  Event,
} from "@opencode-ai/sdk/v2"
import { createStore, produce, reconcile } from "solid-js/store"
import { useProject } from "./project"
import { useEvent } from "./event"
import { useSDK } from "./sdk"
import { useTuiStartup } from "./runtime"
import { createSimpleContext } from "./helper"
import { canAutoApprove } from "../util/semantic-presentation"
import { useExit } from "./exit"
import { useArgs } from "./args"
import { batch, onCleanup, onMount } from "solid-js"
import path from "path"
import { useKV } from "./kv"
import { usePermission } from "./permission"

function search<T>(items: T[], target: string, key: (item: T) => string) {
  let left = 0
  let right = items.length - 1
  while (left <= right) {
    const middle = Math.floor((left + right) / 2)
    const value = key(items[middle])
    if (value === target) return { found: true, index: middle }
    if (value < target) left = middle + 1
    else right = middle - 1
  }
  return { found: false, index: left }
}

export type FutureAttentionFinalization = Extract<Event, { type: "future_attention.finalized" }>["properties"]

export const {
  context: SyncContext,
  use: useSync,
  provider: SyncProvider,
} = createSimpleContext({
  name: "Sync",
  init: () => {
    const startup = useTuiStartup()
    const kv = useKV()
    const permission = usePermission()
    const [store, setStore] = createStore<{
      status: "loading" | "partial" | "complete"
      cache_directory?: string
      provider: Provider[]
      provider_default: Record<string, string>
      provider_next: ProviderListResponse
      provider_auth: Record<string, ProviderAuthMethod[]>
      agent: Agent[]
      command: Command[]
      permission: {
        [sessionID: string]: PermissionRequest[]
      }
      question: {
        [sessionID: string]: QuestionRequest[]
      }
      request_directory: Record<string, string>
      config: Config
      session: Session[]
      session_status: {
        [sessionID: string]: SessionStatus
      }
      active_turn: {
        [sessionID: string]: string | undefined
      }
      turn_terminal: {
        [sessionID: string]: TurnInfo | undefined
      }
      session_diff: {
        [sessionID: string]: SnapshotFileDiff[]
      }
      todo: {
        [sessionID: string]: Todo[]
      }
      message: {
        [sessionID: string]: Message[]
      }
      part: {
        [messageID: string]: Part[]
      }
      future_attention_finalization: {
        [sessionID: string]: FutureAttentionFinalization[]
      }
      lsp: LspStatus[]
      mcp: {
        [key: string]: McpStatus
      }
      mcp_resource: {
        [key: string]: McpResource
      }
      formatter: FormatterStatus[]
      vcs: VcsInfo | undefined
    }>({
      provider_next: {
        all: [],
        default: {},
        connected: [],
      },
      provider_auth: {},
      config: {},
      status: "loading",
      cache_directory: undefined,
      agent: [],
      permission: {},
      question: {},
      request_directory: {},
      command: [],
      provider: [],
      provider_default: {},
      session: [],
      session_status: {},
      active_turn: {},
      turn_terminal: {},
      session_diff: {},
      todo: {},
      message: {},
      part: {},
      future_attention_finalization: {},
      lsp: [],
      mcp: {},
      mcp_resource: {},
      formatter: [],
      vcs: undefined,
    })

    const event = useEvent()
    const project = useProject()
    const sdk = useSDK()

    const fullSyncedSessions = new Map<string, string>()
    const syncingSessions = new Map<string, Promise<void>>()
    const futureAttentionSyncGenerations = new Map<string, number>()
    const futureAttentionSyncs = new Map<string, Promise<void>>()
    const futureAttentionRecoveryGenerations = new Map<string, number>()
    const futureAttentionRecoveries = new Map<string, Promise<void>>()
    const hydratingSessions = new Map<string, { messages: Set<string>; parts: Set<string> }>()
    const activeTurnRevision = new Map<string, number>()
    const activeTurnHydration = new Map<string, Promise<string | undefined>>()
    let disposed = false

    function publishActiveTurn(sessionID: string, turnID?: string) {
      activeTurnRevision.set(sessionID, (activeTurnRevision.get(sessionID) ?? 0) + 1)
      setStore("active_turn", sessionID, turnID)
    }
    const touchMessage = (sessionID: string, messageID: string) => {
      hydratingSessions.get(sessionID)?.messages.add(messageID)
    }
    const touchPart = (sessionID: string, partID: string) => {
      hydratingSessions.get(sessionID)?.parts.add(partID)
    }

    function publishFutureAttentionFinalization(value: FutureAttentionFinalization) {
      const items = store.future_attention_finalization[value.sessionID]
      if (!items) {
        setStore("future_attention_finalization", value.sessionID, [value])
        return
      }
      const match = search(items, value.receipt.id, (item) => item.receipt.id)
      if (match.found) {
        setStore("future_attention_finalization", value.sessionID, match.index, reconcile(value))
        return
      }
      setStore(
        "future_attention_finalization",
        value.sessionID,
        produce((draft) => {
          draft.splice(match.index, 0, value)
        }),
      )
    }

    async function listFutureAttentionFinalizations(sessionID: string, directory: string) {
      const result: FutureAttentionFinalization[] = []
      let after = -1
      while (true) {
        const response = await sdk.client.session.futureAttentionFinalizations(
          {
            sessionID,
            directory,
            after: after.toString(),
            limit: "100",
          },
          { throwOnError: true },
        )
        const page = response.data
        if (!page) throw new Error(`FutureAttention finalization history was unavailable for ${sessionID}`)
        result.push(...page.events.map((item) => item.properties))
        if (!page.hasMore) return result
        const next = page.events.at(-1)?.sequence
        if (next === undefined || next <= after) {
          throw new Error(`FutureAttention finalization history did not advance for ${sessionID}`)
        }
        after = next
      }
    }

    function syncFutureAttentionFinalizations(sessionID: string, directory: string) {
      const key = `${directory}\0${sessionID}`
      futureAttentionSyncGenerations.set(key, (futureAttentionSyncGenerations.get(key) ?? 0) + 1)
      const current = futureAttentionSyncs.get(key)
      if (current) return current
      const task = (async () => {
        let completed = -1
        while (completed !== futureAttentionSyncGenerations.get(key)) {
          const generation = futureAttentionSyncGenerations.get(key)!
          for (const finalization of await listFutureAttentionFinalizations(sessionID, directory)) {
            publishFutureAttentionFinalization(finalization)
          }
          completed = generation
        }
      })().finally(() => {
        if (futureAttentionSyncs.get(key) === task) futureAttentionSyncs.delete(key)
      })
      futureAttentionSyncs.set(key, task)
      return task
    }

    function recoverFutureAttentionFinalizations(sessionID: string, directory: string) {
      const key = `${directory}\0${sessionID}`
      futureAttentionRecoveryGenerations.set(key, (futureAttentionRecoveryGenerations.get(key) ?? 0) + 1)
      const current = futureAttentionRecoveries.get(key)
      if (current) return current
      const task = (async () => {
        let completed = -1
        while (
          !disposed &&
          fullSyncedSessions.get(sessionID) === directory &&
          completed !== futureAttentionRecoveryGenerations.get(key)
        ) {
          const generation = futureAttentionRecoveryGenerations.get(key)!
          try {
            await syncFutureAttentionFinalizations(sessionID, directory)
            completed = generation
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 1_000))
          }
        }
      })().finally(() => {
        if (futureAttentionRecoveries.get(key) === task) futureAttentionRecoveries.delete(key)
      })
      futureAttentionRecoveries.set(key, task)
      return task
    }

    function sessionListQuery(instancePath = project.data.instance.path): { scope?: "project"; path?: string } {
      if (!kv.get("session_directory_filter_enabled", true)) return { scope: "project" }
      if (!instancePath.worktree || !instancePath.directory) return { scope: "project" }
      return {
        path: path.relative(path.resolve(instancePath.worktree), instancePath.directory).replaceAll("\\", "/"),
      }
    }

    function listSessions(
      directory = project.instance.directory(),
      signal?: AbortSignal,
      instancePath = project.data.instance.path,
    ) {
      return sdk.client.session
        .list(
          { directory, start: Date.now() - 30 * 24 * 60 * 60 * 1000, ...sessionListQuery(instancePath) },
          { throwOnError: true, signal },
        )
        .then((x) => (x.data ?? []).toSorted((a, b) => a.id.localeCompare(b.id)))
    }

    event.subscribe((event, { directory, project: eventProject }) => {
      const activeProject = project.project()
      if (eventProject !== undefined && activeProject !== undefined && eventProject !== activeProject) return
      switch (event.type) {
        case "server.connected":
          for (const [sessionID, directory] of fullSyncedSessions) {
            void recoverFutureAttentionFinalizations(sessionID, directory)
          }
          break
        case "server.instance.disposed":
          void bootstrap()
          break
        case "permission.replied": {
          setStore(
            "request_directory",
            produce((draft) => {
              delete draft[event.properties.requestID]
            }),
          )
          const requests = store.permission[event.properties.sessionID]
          if (!requests) break
          const match = search(requests, event.properties.requestID, (r) => r.id)
          if (!match.found) break
          setStore(
            "permission",
            event.properties.sessionID,
            produce((draft) => {
              draft.splice(match.index, 1)
            }),
          )
          break
        }

        case "permission.asked": {
          const request = event.properties
          if (permission.mode === "auto" && canAutoApprove(request)) {
            void sdk.client.permission.reply({
              requestID: request.id,
              reply: "once",
              directory,
            })
            break
          }
          setStore("request_directory", request.id, directory)
          const requests = store.permission[request.sessionID]
          if (!requests) {
            setStore("permission", request.sessionID, [request])
            break
          }
          const match = search(requests, request.id, (r) => r.id)
          if (match.found) {
            setStore("permission", request.sessionID, match.index, reconcile(request))
            break
          }
          setStore(
            "permission",
            request.sessionID,
            produce((draft) => {
              draft.splice(match.index, 0, request)
            }),
          )
          break
        }

        case "question.replied":
        case "question.rejected": {
          setStore(
            "request_directory",
            produce((draft) => {
              delete draft[event.properties.requestID]
            }),
          )
          const requests = store.question[event.properties.sessionID]
          if (!requests) break
          const match = search(requests, event.properties.requestID, (r) => r.id)
          if (!match.found) break
          setStore(
            "question",
            event.properties.sessionID,
            produce((draft) => {
              draft.splice(match.index, 1)
            }),
          )
          break
        }

        case "question.asked": {
          const request = event.properties
          setStore("request_directory", request.id, directory)
          const requests = store.question[request.sessionID]
          if (!requests) {
            setStore("question", request.sessionID, [request])
            break
          }
          const match = search(requests, request.id, (r) => r.id)
          if (match.found) {
            setStore("question", request.sessionID, match.index, reconcile(request))
            break
          }
          setStore(
            "question",
            request.sessionID,
            produce((draft) => {
              draft.splice(match.index, 0, request)
            }),
          )
          break
        }

        case "future_attention.finalized": {
          publishFutureAttentionFinalization(event.properties)
          break
        }

        case "todo.updated":
          setStore("todo", event.properties.sessionID, event.properties.todos)
          break

        case "session.diff":
          setStore("session_diff", event.properties.sessionID, event.properties.diff)
          break

        case "session.deleted": {
          fullSyncedSessions.delete(event.properties.info.id)
          publishActiveTurn(event.properties.info.id)
          const result = search(store.session, event.properties.info.id, (s) => s.id)
          if (result.found) {
            setStore(
              "session",
              produce((draft) => {
                draft.splice(result.index, 1)
              }),
            )
          }
          break
        }
        case "session.updated": {
          const result = search(store.session, event.properties.info.id, (s) => s.id)
          if (result.found) {
            setStore("session", result.index, reconcile(event.properties.info))
            break
          }
          setStore(
            "session",
            produce((draft) => {
              draft.splice(result.index, 0, event.properties.info)
            }),
          )
          break
        }

        case "session.next.moved": {
          const result = search(store.session, event.properties.sessionID, (s) => s.id)
          if (!result.found) break
          setStore(
            "session",
            result.index,
            produce((session) => {
              session.directory = event.properties.location.directory
              session.path = event.properties.subdirectory
              session.time.updated = event.properties.timestamp
            }),
          )
          break
        }

        case "session.status": {
          setStore("session_status", event.properties.sessionID, event.properties.status)
          if (event.properties.status.type === "idle") {
            activeTurnRevision.set(
              event.properties.sessionID,
              (activeTurnRevision.get(event.properties.sessionID) ?? 0) + 1,
            )
          }
          break
        }

        case "turn.started": {
          publishActiveTurn(event.properties.sessionID, event.properties.turnID)
          break
        }

        case "turn.terminal": {
          if (store.active_turn[event.properties.sessionID] === event.properties.turnID) {
            publishActiveTurn(event.properties.sessionID)
          }
          void sdk.client.session
            .getTurn({ sessionID: event.properties.sessionID, turnID: event.properties.turnID }, { throwOnError: true })
            .then((response) => {
              if (response.data) setStore("turn_terminal", event.properties.sessionID, response.data)
            })
            .catch(() => {})
          break
        }

        case "message.updated": {
          touchMessage(event.properties.info.sessionID, event.properties.info.id)
          const messages = store.message[event.properties.info.sessionID]
          if (!messages) {
            setStore("message", event.properties.info.sessionID, [event.properties.info])
            break
          }
          const result = search(messages, event.properties.info.id, (m) => m.id)
          if (result.found) {
            setStore("message", event.properties.info.sessionID, result.index, reconcile(event.properties.info))
            break
          }
          setStore(
            "message",
            event.properties.info.sessionID,
            produce((draft) => {
              draft.splice(result.index, 0, event.properties.info)
            }),
          )
          const updated = store.message[event.properties.info.sessionID]
          if (updated.length > 100) {
            const oldest = updated[0]
            batch(() => {
              setStore(
                "message",
                event.properties.info.sessionID,
                produce((draft) => {
                  draft.shift()
                }),
              )
              setStore(
                "part",
                produce((draft) => {
                  delete draft[oldest.id]
                }),
              )
            })
          }
          break
        }
        case "message.removed": {
          touchMessage(event.properties.sessionID, event.properties.messageID)
          const messages = store.message[event.properties.sessionID]
          const result = search(messages, event.properties.messageID, (m) => m.id)
          if (result.found) {
            setStore(
              "message",
              event.properties.sessionID,
              produce((draft) => {
                draft.splice(result.index, 1)
              }),
            )
          }
          break
        }
        case "message.part.updated": {
          touchPart(event.properties.part.sessionID, event.properties.part.id)
          const parts = store.part[event.properties.part.messageID]
          if (!parts) {
            setStore("part", event.properties.part.messageID, [event.properties.part])
            break
          }
          const result = search(parts, event.properties.part.id, (p) => p.id)
          if (result.found) {
            setStore("part", event.properties.part.messageID, result.index, reconcile(event.properties.part))
            break
          }
          setStore(
            "part",
            event.properties.part.messageID,
            produce((draft) => {
              draft.splice(result.index, 0, event.properties.part)
            }),
          )
          break
        }

        case "message.part.delta": {
          const parts = store.part[event.properties.messageID]
          if (!parts) break
          const result = search(parts, event.properties.partID, (p) => p.id)
          if (!result.found) break
          touchPart(event.properties.sessionID, event.properties.partID)
          setStore(
            "part",
            event.properties.messageID,
            produce((draft) => {
              const part = draft[result.index]
              const field = event.properties.field as keyof typeof part
              const existing = part[field] as string | undefined
              ;(part[field] as string) = (existing ?? "") + event.properties.delta
            }),
          )
          break
        }

        case "message.part.removed": {
          touchPart(event.properties.sessionID, event.properties.partID)
          const parts = store.part[event.properties.messageID]
          const result = search(parts, event.properties.partID, (p) => p.id)
          if (result.found) {
            setStore(
              "part",
              event.properties.messageID,
              produce((draft) => {
                draft.splice(result.index, 1)
              }),
            )
          }
          break
        }

        case "lsp.updated": {
          const activeDirectory = project.instance.directory()
          if (directory !== activeDirectory) break
          void sdk.client.lsp.status({ directory: activeDirectory }).then((response) => {
            if (project.instance.directory() !== activeDirectory) return
            setStore("lsp", response.data ?? [])
          })
          break
        }

        case "vcs.branch.updated": {
          if (directory === project.instance.directory()) {
            setStore("vcs", { branch: event.properties.branch })
          }
          break
        }
      }
    })

    const exit = useExit()
    const args = useArgs()

    let bootstrapGeneration = 0

    async function bootstrap(
      input: { fatal?: boolean; directory?: string; signal?: AbortSignal } = {},
    ): Promise<boolean> {
      const generation = ++bootstrapGeneration
      const fatal = input.fatal ?? true
      const directory = input.directory ?? project.instance.directory()
      const current = () => generation === bootstrapGeneration
      const pending = () => current() && !input.signal?.aborted
      const blockingRequest = { throwOnError: true as const, signal: input.signal }
      const backgroundRequest = { throwOnError: true as const }
      const projectPromise = project.prepare(directory, { signal: input.signal })
      const continuingSessionsPromise = args.continue
        ? projectPromise.then((snapshot) => {
            if (!snapshot || !pending()) return undefined
            return listSessions(directory, input.signal, snapshot.path)
          })
        : Promise.resolve(undefined)

      // blocking - include session.list when continuing a session
      const providersPromise = sdk.client.config.providers({ directory }, blockingRequest)
      const providerListPromise = sdk.client.provider.list({ directory }, blockingRequest)
      const agentsPromise = sdk.client.app.agents({ directory }, blockingRequest)
      const configPromise = sdk.client.config.get({ directory }, blockingRequest)

      try {
        const [providersResult, providerListResult, agentsResult, configResult, projectSnapshot, sessions] =
          await Promise.all([
            providersPromise,
            providerListPromise,
            agentsPromise,
            configPromise,
            projectPromise,
            continuingSessionsPromise,
          ])
        if (!projectSnapshot || !pending()) return false
        if (!providersResult.data || !providerListResult.data || !configResult.data) {
          throw new Error(`Failed to hydrate local configuration at ${directory}`)
        }

        let committed = false
        batch(() => {
          committed = project.commit(projectSnapshot)
          if (!committed) return
          setStore("provider", reconcile(providersResult.data.providers))
          setStore("provider_default", reconcile(providersResult.data.default))
          setStore("provider_next", reconcile(providerListResult.data))
          setStore("agent", reconcile(agentsResult.data ?? []))
          setStore("config", reconcile(configResult.data))
          setStore("session", reconcile(sessions ?? []))
          setStore("command", reconcile([]))
          setStore("lsp", reconcile([]))
          setStore("mcp", reconcile({}))
          setStore("mcp_resource", reconcile({}))
          setStore("formatter", reconcile([]))
          setStore("session_status", reconcile({}))
          setStore("active_turn", reconcile({}))
          setStore("turn_terminal", reconcile({}))
          setStore("provider_auth", reconcile({}))
          setStore("vcs", undefined)
          setStore("cache_directory", directory)
          setStore("status", "partial")
        })
        if (!committed) return false

        // Once this directory is published, caller cancellation no longer owns
        // its background hydration. A later bootstrap generation supersedes it.
        function hydrate<T>(name: string, request: Promise<T>, commit: (value: T) => void) {
          return request.then(
            (value) => {
              if (!current()) return false
              commit(value)
              return true
            },
            (error) => {
              if (current()) console.error(`tui background hydration failed: ${name}`, error)
              return false
            },
          )
        }

        void Promise.all([
          hydrate(
            "sessions",
            args.continue ? Promise.resolve(undefined) : listSessions(directory, undefined, projectSnapshot.path),
            (sessions) => {
              if (sessions !== undefined) setStore("session", reconcile(sessions))
            },
          ),
          hydrate("commands", sdk.client.command.list({ directory }, backgroundRequest), (response) =>
            setStore("command", reconcile(response.data ?? [])),
          ),
          hydrate("lsp", sdk.client.lsp.status({ directory }, backgroundRequest), (response) =>
            setStore("lsp", reconcile(response.data ?? [])),
          ),
          hydrate("mcp", sdk.client.mcp.status({ directory }, backgroundRequest), (response) =>
            setStore("mcp", reconcile(response.data ?? {})),
          ),
          hydrate(
            "mcp resources",
            sdk.client.experimental.resource.list({ directory }, backgroundRequest),
            (response) => setStore("mcp_resource", reconcile(response.data ?? {})),
          ),
          hydrate("formatters", sdk.client.formatter.status({ directory }, backgroundRequest), (response) =>
            setStore("formatter", reconcile(response.data ?? [])),
          ),
          hydrate("session status", sdk.client.session.status({ directory }, backgroundRequest), (response) =>
            setStore("session_status", reconcile(response.data ?? {})),
          ),
          hydrate("provider auth", sdk.client.provider.auth({ directory }, backgroundRequest), (response) =>
            setStore("provider_auth", reconcile(response.data ?? {})),
          ),
          hydrate("vcs", sdk.client.vcs.get({ directory }, backgroundRequest), (response) =>
            setStore("vcs", reconcile(response.data)),
          ),
        ]).then((hydrated) => {
          if (current() && hydrated.every(Boolean)) setStore("status", "complete")
        })
        return true
      } catch (error) {
        if (!pending()) return false
        console.error("tui bootstrap failed", {
          error: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : undefined,
          stack: error instanceof Error ? error.stack : undefined,
        })
        if (fatal) {
          exit(error)
          return false
        }
        throw error
      }
    }

    onMount(() => {
      void bootstrap()
    })
    onCleanup(() => {
      disposed = true
      bootstrapGeneration += 1
    })

    const result = {
      data: store,
      set: setStore,
      request: {
        directory(requestID: string) {
          return store.request_directory[requestID]
        },
      },
      get status() {
        return store.status
      },
      get ready() {
        if (startup.skipInitialLoading) return true
        return store.status !== "loading"
      },
      get path() {
        return project.instance.path()
      },
      session: {
        get(sessionID: string) {
          const match = search(store.session, sessionID, (s) => s.id)
          if (match.found) return store.session[match.index]
          return undefined
        },
        query() {
          return sessionListQuery()
        },
        async refresh() {
          const directory = project.instance.directory()
          const list = await listSessions(directory)
          if (project.instance.directory() !== directory) return
          setStore("session", reconcile(list))
        },
        status(sessionID: string) {
          const session = result.session.get(sessionID)
          if (!session) return "idle"
          if (session.time.compacting) return "compacting"
          const messages = store.message[sessionID] ?? []
          const last = messages.at(-1)
          if (!last) return "idle"
          if (last.role === "user") return "working"
          return last.time.completed ? "idle" : "working"
        },
        activeTurn(sessionID: string) {
          return store.active_turn[sessionID]
        },
        async hydrateActiveTurn(sessionID: string) {
          const known = store.active_turn[sessionID]
          if (known) return known
          const inflight = activeTurnHydration.get(sessionID)
          if (inflight) return inflight
          const revision = activeTurnRevision.get(sessionID) ?? 0
          const directory = project.instance.directory()
          const task = sdk.client.session
            .activeTurn({ sessionID }, { throwOnError: true })
            .then((response) => {
              if (project.instance.directory() !== directory) return store.active_turn[sessionID]
              if ((activeTurnRevision.get(sessionID) ?? 0) !== revision) return store.active_turn[sessionID]
              if (store.session_status[sessionID]?.type === "idle") return undefined
              const turnID = response.data?.id
              if (turnID) publishActiveTurn(sessionID, turnID)
              return turnID
            })
            .finally(() => {
              activeTurnHydration.delete(sessionID)
            })
          activeTurnHydration.set(sessionID, task)
          return task
        },
        async sync(sessionID: string) {
          const syncing = syncingSessions.get(sessionID)
          if (syncing) return syncing
          const directory = project.instance.directory()
          if (fullSyncedSessions.get(sessionID) === directory) return
          const tracker = { messages: new Set<string>(), parts: new Set<string>() }
          hydratingSessions.set(sessionID, tracker)
          const task = (async () => {
            const [session, messages, todo, diff, turns] = await Promise.all([
              sdk.client.session.get({ sessionID }, { throwOnError: true }),
              sdk.client.session.messages({ sessionID, limit: 100 }),
              sdk.client.session.todo({ sessionID }),
              sdk.client.session.diff({ sessionID }),
              sdk.client.session.turns({ sessionID }),
            ])
            setStore(
              produce((draft) => {
                const match = search(draft.session, sessionID, (s) => s.id)
                if (match.found) draft.session[match.index] = session.data!
                if (!match.found) draft.session.splice(match.index, 0, session.data!)
                draft.todo[sessionID] = todo.data ?? []
                const currentMessages = draft.message[sessionID] ?? []
                const infos = (messages.data ?? []).flatMap((message) => {
                  if (!tracker.messages.has(message.info.id)) return [message.info]
                  const current = currentMessages.find((item) => item.id === message.info.id)
                  return current ? [current] : []
                })
                infos.push(
                  ...currentMessages.filter(
                    (message) => tracker.messages.has(message.id) && !infos.some((item) => item.id === message.id),
                  ),
                )
                const removed = infos.slice(0, -100)
                const visible = infos.slice(-100)
                const visibleIDs = new Set(visible.map((message) => message.id))
                for (const message of messages.data ?? []) {
                  if (!visibleIDs.has(message.info.id)) {
                    delete draft.part[message.info.id]
                    continue
                  }
                  const currentParts = draft.part[message.info.id] ?? []
                  const parts = message.parts.flatMap((part) => {
                    const current = currentParts.find((item) => item.id === part.id)
                    if (tracker.parts.has(part.id)) return current ? [current] : []
                    if (
                      current &&
                      (part.type === "text" || part.type === "reasoning") &&
                      (current.type === "text" || current.type === "reasoning") &&
                      part.text.length === 0 &&
                      current.text.length > 0
                    ) {
                      return [current]
                    }
                    return [part]
                  })
                  parts.push(
                    ...currentParts.filter(
                      (part) => tracker.parts.has(part.id) && !parts.some((item) => item.id === part.id),
                    ),
                  )
                  draft.part[message.info.id] = parts
                }
                for (const message of removed) delete draft.part[message.id]
                draft.message[sessionID] = visible
                draft.session_diff[sessionID] = diff.data ?? []
                draft.turn_terminal[sessionID] = turns.data?.findLast((turn) => turn.terminal !== undefined)
              }),
            )
            fullSyncedSessions.set(sessionID, directory)
            try {
              await syncFutureAttentionFinalizations(sessionID, directory)
            } catch (error) {
              if (fullSyncedSessions.get(sessionID) === directory) fullSyncedSessions.delete(sessionID)
              throw error
            }
          })().finally(() => {
            syncingSessions.delete(sessionID)
            hydratingSessions.delete(sessionID)
          })
          syncingSessions.set(sessionID, task)
          return task
        },
      },
      bootstrap,
    }
    return result
  },
})
