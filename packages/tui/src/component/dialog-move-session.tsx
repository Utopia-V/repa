import { useTerminalDimensions } from "@opentui/solid"
import { TextAttributes } from "@opentui/core"
import { createMemo, createResource, createSignal, onMount, Show } from "solid-js"
import path from "path"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useSDK } from "../context/sdk"
import { useTheme } from "../context/theme"
import { useSync } from "../context/sync"
import { abbreviateHome } from "../runtime"
import { useTuiPaths } from "../context/runtime"
import { Locale } from "../util/locale"
import { errorMessage } from "../util/error"
import { useToast } from "../ui/toast"
import { useCommandShortcut } from "../keymap"
import { useProject } from "../context/project"
import { Spinner } from "./spinner"
import { DialogWorkspaceFileChanges } from "./dialog-workspace-file-changes"
import type { ProjectDirectories } from "@opencode-ai/sdk/v2"
import { useRoute } from "../context/route"

export type SessionStartLocationSelection =
  | { type: "directory"; directory: string; subdirectory: boolean }
  | { type: "new" }
type ProjectDirectory = ProjectDirectories[number]

type DialogSessionStartLocationProps = {
  projectID: string
  current?: SessionStartLocationSelection
  onSelect: (selection: SessionStartLocationSelection) => void
  onCurrentChange?: (selection: SessionStartLocationSelection) => void
  initialDirectories?: ProjectDirectory[]
  initialRemoving?: string
}

export async function removeProjectCopyAfterLeavingCurrent<T>(input: {
  current: boolean
  mainDirectory?: string
  activateMain: (directory: string) => Promise<void>
  remove: () => Promise<T>
}) {
  if (input.current) {
    if (!input.mainDirectory) throw new Error("Cannot delete the active project copy without a main directory")
    await input.activateMain(input.mainDirectory)
  }
  return input.remove()
}

export function DialogSessionStartLocation(props: DialogSessionStartLocationProps) {
  const dialog = useDialog()
  const sdk = useSDK()
  const dimensions = useTerminalDimensions()
  const { theme } = useTheme()
  const sync = useSync()
  const projectContext = useProject()
  const route = useRoute()
  const toast = useToast()
  const paths = useTuiPaths()
  const [working, setWorking] = createSignal(Boolean(props.initialRemoving))
  const [toDelete, setToDelete] = createSignal<string>()
  const [removing, setRemoving] = createSignal(props.initialRemoving)
  const [replacementCurrent, setReplacementCurrent] = createSignal<string>()
  const [loadError, setLoadError] = createSignal<unknown>()
  const deleteHint = useCommandShortcut("dialog.session_start_location.delete")
  onMount(() => dialog.setSize("xlarge"))

  function reopen(initialRemoving?: string) {
    dialog.replace(() => (
      <DialogSessionStartLocation
        {...props}
        initialDirectories={directoryData()}
        initialRemoving={initialRemoving}
      />
    ))
  }

  // A failed current-checkout lookup only affects which row is highlighted, so
  // swallow it and let the directory list render without a current marker.
  const [loadedProject] = createResource(
    () => (projectContext.project() === props.projectID ? undefined : props.projectID),
    (projectID) =>
      sdk.client.project
        .current({ directory: projectContext.instance.directory() }, { throwOnError: true })
        .then((result) => (result.data?.id === projectID ? result.data.worktree : undefined))
        .catch(() => undefined),
  )
  const currentCheckout = createMemo(() => {
    if (projectContext.project() === props.projectID) return projectContext.instance.path().worktree
    return loadedProject()
  })

  const [directories, { refetch }] = createResource(
    () => (props.initialRemoving ? undefined : props.projectID),
    async (projectID, info): Promise<ProjectDirectory[] | undefined> => {
      try {
        await sdk.client.v2.projectCopy.refresh(
          { projectID, location: { directory: projectContext.instance.directory() } },
          { throwOnError: true },
        )
        const directories = await sdk.client.project.directories(
          { projectID, directory: projectContext.instance.directory() },
          { throwOnError: true },
        )
        setLoadError(undefined)
        return directories.data ?? []
      } catch (error) {
        setLoadError(error)
        // An initial load with no data surfaces the inline error view below. A
        // failed refresh intentionally stays quiet and keeps the already-shown
        // list interactive; reopening the dialog retries the load.
        return info.value
      }
    },
  )
  const directoryData = createMemo(() => directories() ?? props.initialDirectories)
  // Show the locked error view only when we have nothing to display. A refresh
  // that fails after the list rendered keeps the list and its actions.
  const showError = createMemo(() => Boolean(loadError()) && !directoryData())

  const currentDirectory = createMemo(
    () => replacementCurrent() ?? (props.current?.type === "directory" ? props.current.directory : currentCheckout()),
  )
  const currentRoot = createMemo<ProjectDirectory | undefined>(() => {
    if (showError()) return
    const directory = currentDirectory()
    if (!directory) return
    return (
      directoryData()
        ?.filter((root) => contains(root.directory, directory))
        .toSorted((a, b) => b.directory.length - a.directory.length)[0] ?? { directory }
    )
  })

  const options = createMemo<DialogSelectOption<SessionStartLocationSelection | undefined>[]>(() => {
    if (showError()) return []
    const data = directoryData()
    const current = currentRoot()?.directory
    if (directories.loading && !data && !current) return [{ title: "Loading project directories...", value: undefined }]
    const roots = [...(data ?? [])]
    if (current && !roots.some((item) => item.directory === current)) roots.unshift({ directory: current })
    roots.sort((a, b) => {
      if (a.directory === current) return -1
      if (b.directory === current) return 1
      if (Boolean(a.strategy) !== Boolean(b.strategy)) return a.strategy ? 1 : -1
      if (!a.strategy && !b.strategy) return a.directory.length - b.directory.length
      return 0
    })
    if (roots.length === 0) return [{ title: "No project directories found", value: undefined }]

    const subdirectories = sync.data.session
      .filter((session) => session.projectID === props.projectID && session.path && ![".", "/"].includes(session.path))
      .map((session) => session.directory)
      .filter((directory) => !roots.some((root) => root.directory === directory))
      .filter((directory, index, directories) => directories.indexOf(directory) === index)
      .map((location) => ({
        location,
        root: roots
          .filter((root) => {
            const relative = path.relative(root.directory, location)
            return relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)
          })
          .toSorted((a, b) => b.directory.length - a.directory.length)[0],
      }))
      .filter((item): item is { location: string; root: ProjectDirectory } => item.root !== undefined)

    const list = [...roots.map((root) => ({ location: root.directory, root })), ...subdirectories].toSorted((a, b) => {
      const root = roots.indexOf(a.root) - roots.indexOf(b.root)
      if (root !== 0) return root
      if (a.location === a.root.directory) return -1
      if (b.location === b.root.directory) return 1
      return a.location.localeCompare(b.location)
    })
    const titleWidth = Math.max(1, Math.min(116, dimensions().width - 2) - 12)

    return list.map((item) => {
      const title = abbreviateHome(item.location, paths.home)
      const suffix =
        item.location === item.root.directory ? undefined : path.sep + path.relative(item.root.directory, item.location)
      const visible = Locale.truncateLeft(title, titleWidth)
      const split = suffix ? Math.max(0, visible.length - suffix.length) : visible.length
      const deleting = toDelete() === item.location
      const isRemoving = removing() === item.location
      return {
        title,
        titleView: isRemoving ? (
          <span style={{ fg: theme.error }}>Deleting {item.location}</span>
        ) : deleting ? (
          <span style={{ fg: theme.text }}>Press {deleteHint()} again to confirm</span>
        ) : suffix ? (
          <>
            {visible.slice(0, split)}
            <span style={{ fg: theme.textMuted }}>{visible.slice(split)}</span>
          </>
        ) : undefined,
        bg: deleting ? theme.error : undefined,
        value: {
          type: "directory",
          directory: item.location,
          subdirectory: item.location !== item.root.directory,
        } as const,
        category: item.root.directory === current ? "Current" : "Other",
        titleWidth,
        truncateTitle: "left" as const,
      }
    })
  })

  const current = createMemo(() => {
    if (directories.loading || loadedProject.loading) return
    const replacement = replacementCurrent()
    if (replacement) return { type: "directory", directory: replacement, subdirectory: false } as const
    return props.current
  })

  async function activateMain(directory: string) {
    const activated = await sync.bootstrap({ fatal: false, directory })
    if (!activated) throw new Error(`Failed to activate the main directory at ${directory}`)
    setReplacementCurrent(directory)
    props.onCurrentChange?.({ type: "directory", directory, subdirectory: false })
    if (route.data.type === "session") {
      route.navigate({ type: "home" })
      dialog.clear()
    }
  }

  async function remove(option: DialogSelectOption<SessionStartLocationSelection | undefined>) {
    if (!option.value || option.value.type !== "directory" || option.value.subdirectory || removing()) return
    const data = directoryData()
    const selected = option.value
    const root = data?.find((item) => item.directory === selected.directory)
    if (!root?.strategy) return
    const deletingCurrent = selected.directory === currentRoot()?.directory
    if (toDelete() !== selected.directory) {
      setToDelete(selected.directory)
      return
    }
    setToDelete(undefined)
    setRemoving(selected.directory)
    setWorking(true)
    const result = await removeProjectCopyAfterLeavingCurrent({
      current: deletingCurrent,
      mainDirectory: projectContext.data.project.mainDir,
      activateMain,
      remove: () =>
        sdk.client.v2.projectCopy.remove({
          projectID: props.projectID,
          location: { directory: projectContext.instance.directory() },
          directory: selected.directory,
          force: false,
        }),
    })
      .catch((error) => ({ error }))
    if (result.error) {
      setRemoving(undefined)
      setWorking(false)
      if ("data" in result.error && result.error.data.forceRequired) {
        const status = await sdk.client.vcs.status({ directory: selected.directory }).catch(() => undefined)
        const choice = await DialogWorkspaceFileChanges.show(dialog, status?.data ?? [], {
          title: "Delete working copy?",
          message: "This working copy has file changes. Do you want to delete it anyway?",
        })
        if (choice !== "yes") {
          if (deletingCurrent) {
            dialog.clear()
            return
          }
          reopen()
          return
        }
        if (!deletingCurrent) reopen(selected.directory)
        const forced = await sdk.client.v2.projectCopy
          .remove({
            projectID: props.projectID,
            location: { directory: projectContext.instance.directory() },
            directory: selected.directory,
            force: true,
          })
          .catch((error) => ({ error }))
        if (forced.error) {
          toast.show({
            variant: "error",
            title: "Failed to delete project copy",
            message: errorMessage(forced.error),
          })
          if (deletingCurrent) {
            dialog.clear()
            return
          }
          reopen()
          return
        }
        setRemoving(undefined)
        setWorking(false)
        if (deletingCurrent) {
          dialog.clear()
          return
        }
        reopen()
        return
      }
      toast.show({
        variant: "error",
        title: "Failed to delete project copy",
        message: errorMessage(result.error),
      })
      return
    }
    setRemoving(undefined)
    setWorking(false)
    if (deletingCurrent) {
      dialog.clear()
      return
    }
    await refetch()
  }

  const fullHeight = createMemo(() =>
    Math.max(8, Math.min(16, dimensions().height - Math.floor(dimensions().height / 4) - 2)),
  )

  return (
    <box minHeight={showError() ? 5 : fullHeight()}>
      <DialogSelect
        title="Start session in another directory"
        titleView={
          <box flexDirection="row" gap={1}>
            <text fg={theme.text} attributes={TextAttributes.BOLD}>
              Start session in another directory
            </text>
            <Show when={working() || directories.loading || loadedProject.loading}>
              <Spinner />
            </Show>
          </box>
        }
        renderFilter={!showError()}
        options={options()}
        emptyView={
          showError() ? (
            <box paddingLeft={4} paddingRight={4}>
              <text fg={theme.error} attributes={TextAttributes.BOLD}>
                Could not load project directories
              </text>
              <text fg={theme.textMuted}>{errorMessage(loadError())}</text>
            </box>
          ) : undefined
        }
        locked={showError() || directories.loading || loadedProject.loading || Boolean(removing())}
        current={current()}
        onSelect={(option) => {
          if (option.value) props.onSelect(option.value)
        }}
        onMove={() => setToDelete(undefined)}
        actions={
          showError()
            ? []
            : [
                {
                  command: "dialog.session_start_location.new",
                  title: "new copy",
                  onTrigger: () => props.onSelect({ type: "new" }),
                },
                {
                  command: "dialog.session_start_location.delete",
                  title: "delete",
                  disabled: (option) => {
                    const value = option?.value
                    if (!value || value.type !== "directory" || value.subdirectory) return true
                    return !directoryData()?.find((item) => item.directory === value.directory)?.strategy
                  },
                  onTrigger: remove,
                },
                {
                  command: "dialog.session_start_location.refresh",
                  title: "refresh",
                  onTrigger: () => void refetch(),
                },
              ]
        }
      />
    </box>
  )
}

function contains(root: string, directory: string) {
  if (root === directory) return true
  const relative = path.relative(root, directory)
  return relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)
}
