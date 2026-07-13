import { batch, onCleanup } from "solid-js"
import type { Path } from "@opencode-ai/sdk/v2"
import { createStore, reconcile } from "solid-js/store"
import { createSimpleContext } from "./helper"
import { useSDK } from "./sdk"

export const { use: useProject, provider: ProjectProvider } = createSimpleContext({
  name: "Project",
  init: () => {
    const sdk = useSDK()

    const defaultPath = {
      home: "",
      state: "",
      config: "",
      worktree: "",
      directory: sdk.directory ?? process.cwd(),
    } satisfies Path

    const [store, setStore] = createStore({
      project: {
        id: undefined as string | undefined,
        worktree: undefined as string | undefined,
        mainDir: undefined as string | undefined,
      },
      instance: {
        path: defaultPath,
      },
    })

    let syncGeneration = 0
    onCleanup(() => {
      syncGeneration += 1
    })

    type Snapshot = {
      generation: number
      signal?: AbortSignal
      path: Path
      project: {
        id: string
        worktree: string
        mainDir?: string
      }
    }

    async function prepare(
      directory = store.instance.path.directory,
      options: { signal?: AbortSignal } = {},
    ): Promise<Snapshot | undefined> {
      const generation = ++syncGeneration
      const location = { directory }
      const request = { throwOnError: true as const, signal: options.signal }
      const [instancePath, project] = await Promise.all([
        sdk.client.path.get(location, request),
        sdk.client.project.current(location, request),
      ])
      if (!instancePath.data || !project.data) throw new Error(`Failed to resolve local project at ${directory}`)
      const directories = await sdk.client.project.directories(
        { projectID: project.data.id, ...location },
        request,
      )
      if (!directories.data) throw new Error(`Failed to resolve project directories at ${directory}`)
      if (generation !== syncGeneration || options.signal?.aborted) return
      return {
        generation,
        signal: options.signal,
        path: instancePath.data,
        project: {
          id: project.data.id,
          worktree: project.data.worktree,
          mainDir: directories.data.findLast((item) => item.strategy === undefined)?.directory,
        },
      }
    }

    function commit(snapshot: Snapshot | undefined) {
      if (!snapshot || snapshot.generation !== syncGeneration || snapshot.signal?.aborted) return false
      batch(() => {
        setStore("instance", "path", reconcile(snapshot.path))
        setStore("project", "id", snapshot.project.id)
        setStore("project", "worktree", snapshot.project.worktree)
        setStore("project", "mainDir", snapshot.project.mainDir)
      })
      return true
    }

    async function sync(directory = store.instance.path.directory, options: { signal?: AbortSignal } = {}) {
      return commit(await prepare(directory, options))
    }

    return {
      data: store,
      project() {
        return store.project.id
      },
      instance: {
        path() {
          return store.instance.path
        },
        directory() {
          return store.instance.path.directory
        },
      },
      prepare,
      commit,
      sync,
    }
  },
})
