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
} from "@opencode-ai/sdk/v2"
import { createStore, produce, reconcile } from "solid-js/store"
import { useProject } from "./project"
import { useEvent } from "./event"
import { useSDK } from "./sdk"
import { useTuiStartup } from "./runtime"
import { createSimpleContext } from "./helper"
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
      capabilities: {
        experimentalBackgroundSubagents: boolean
      }
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
      capabilities: {
        experimentalBackgroundSubagents: false,
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
      session_diff: {},
      todo: {},
      message: {},
      part: {},
      lsp: [],
      mcp: {},
      mcp_resource: {},
      formatter: [],
      vcs: undefined,
    })

    const event = useEvent()
    const project = useProject()
    const sdk = useSDK()

    const fullSyncedSessions = new Set<string>()
    const syncingSessions = new Map<string, Promise<void>>()
    const hydratingSessions = new Map<string, { messages: Set<string>; parts: Set<string> }>()
    const touchMessage = (sessionID: string, messageID: string) => {
      hydratingSessions.get(sessionID)?.messages.add(messageID)
    }
    const touchPart = (sessionID: string, partID: string) => {
      hydratingSessions.get(sessionID)?.parts.add(partID)
    }

    function sessionListQuery(instancePath = project.data.instance.path): { scope?: "project"; path?: string } {
      if (!kv.get("session_directory_filter_enabled", true)) return { scope: "project" }
      if (!instancePath.worktree || !instancePath.directory) return { scope: "project" }
      return {
        path: path
          .relative(path.resolve(instancePath.worktree), instancePath.directory)
          .replaceAll("\\", "/"),
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
          if (permission.mode === "auto") {
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

        case "todo.updated":
          setStore("todo", event.properties.sessionID, event.properties.todos)
          break

        case "session.diff":
          setStore("session_diff", event.properties.sessionID, event.properties.diff)
          break

        case "session.deleted": {
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
      const capabilitiesPromise = sdk.client.experimental.capabilities
        .get({ directory }, blockingRequest)
        .then((x) => x.data)
        .catch(() => undefined)
      const agentsPromise = sdk.client.app.agents({ directory }, blockingRequest)
      const configPromise = sdk.client.config.get({ directory }, blockingRequest)

      try {
        const [providersResult, providerListResult, capabilities, agentsResult, configResult, projectSnapshot, sessions] =
          await Promise.all([
            providersPromise,
            providerListPromise,
            capabilitiesPromise,
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
          setStore("capabilities", "experimentalBackgroundSubagents", capabilities?.backgroundSubagents === true)
          setStore("agent", reconcile(agentsResult.data ?? []))
          setStore("config", reconcile(configResult.data))
          setStore("session", reconcile(sessions ?? []))
          setStore("command", reconcile([]))
          setStore("lsp", reconcile([]))
          setStore("mcp", reconcile({}))
          setStore("mcp_resource", reconcile({}))
          setStore("formatter", reconcile([]))
          setStore("session_status", reconcile({}))
          setStore("provider_auth", reconcile({}))
          setStore("vcs", undefined)
          setStore("cache_directory", directory)
          setStore("status", "partial")
        })
        if (!committed) return false

        // Once this directory is published, caller cancellation no longer owns
        // its background hydration. A later bootstrap generation supersedes it.
        void Promise.all([
          args.continue ? Promise.resolve(undefined) : listSessions(directory, undefined, projectSnapshot.path),
          sdk.client.command.list({ directory }, backgroundRequest),
          sdk.client.lsp.status({ directory }, backgroundRequest),
          sdk.client.mcp.status({ directory }, backgroundRequest),
          sdk.client.experimental.resource.list({ directory }, backgroundRequest),
          sdk.client.formatter.status({ directory }, backgroundRequest),
          sdk.client.session.status({ directory }, backgroundRequest),
          sdk.client.provider.auth({ directory }, backgroundRequest),
          sdk.client.vcs.get({ directory }, backgroundRequest),
        ])
          .then(
            ([backgroundSessions, commands, lsp, mcp, resources, formatter, statuses, auth, vcs]) => {
              if (!current()) return
              batch(() => {
                if (backgroundSessions !== undefined) setStore("session", reconcile(backgroundSessions))
                setStore("command", reconcile(commands.data ?? []))
                setStore("lsp", reconcile(lsp.data ?? []))
                setStore("mcp", reconcile(mcp.data ?? {}))
                setStore("mcp_resource", reconcile(resources.data ?? {}))
                setStore("formatter", reconcile(formatter.data ?? []))
                setStore("session_status", reconcile(statuses.data ?? {}))
                setStore("provider_auth", reconcile(auth.data ?? {}))
                setStore("vcs", reconcile(vcs.data))
                setStore("status", "complete")
              })
            },
          )
          .catch((error) => {
            if (!current()) return
            console.error("tui background hydration failed", error)
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
        async sync(sessionID: string) {
          if (fullSyncedSessions.has(sessionID)) return
          const syncing = syncingSessions.get(sessionID)
          if (syncing) return syncing
          const tracker = { messages: new Set<string>(), parts: new Set<string>() }
          hydratingSessions.set(sessionID, tracker)
          const task = (async () => {
            const [session, messages, todo, diff] = await Promise.all([
              sdk.client.session.get({ sessionID }, { throwOnError: true }),
              sdk.client.session.messages({ sessionID, limit: 100 }),
              sdk.client.session.todo({ sessionID }),
              sdk.client.session.diff({ sessionID }),
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
              }),
            )
            fullSyncedSessions.add(sessionID)
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
