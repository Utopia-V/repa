import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import path from "path"
import { useTuiPaths } from "../../context/runtime"
import { errorMessage } from "../../util/error"
import { useDialog } from "../../ui/dialog"
import { useSDK } from "../../context/sdk"
import { useToast } from "../../ui/toast"
import { DialogSessionStartLocation } from "../dialog-move-session"
import { useHomeSessionDestination } from "../../routes/home/session-destination"
import { useProject } from "../../context/project"

type ProjectCopyCreationInput = {
  projectID: string
  location: { directory?: string }
  strategy: "git_worktree"
  directory: string
  name: string
}

export async function createGitWorktreeProjectCopy(input: {
  projectID: string
  context?: string
  sdkDirectory?: string
  worktreeRoot: string
  generateName: (input: { projectID: string; context?: string }) => Promise<{ data: { name: string } }>
  createCopy: (input: ProjectCopyCreationInput) => Promise<{ data?: { directory?: string } }>
  bootstrapDirectory: (directory: string) => Promise<unknown>
}) {
  const generated = await input.generateName({ projectID: input.projectID, context: input.context })
  const result = await input.createCopy({
    projectID: input.projectID,
    location: { directory: input.sdkDirectory },
    strategy: "git_worktree",
    directory: path.join(input.worktreeRoot, input.projectID.slice(0, 6)),
    name: generated.data.name,
  })
  const directory = result.data?.directory
  if (!directory) throw new Error("No project copy directory returned")
  await input.bootstrapDirectory(directory)
  return directory
}

export function usePromptStartLocation(input: { projectID: () => string | undefined }) {
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()
  const homeDestination = useHomeSessionDestination()
  const project = useProject()
  const paths = useTuiPaths()
  const [creating, setCreating] = createSignal(false)
  const [creatingDots, setCreatingDots] = createSignal(3)
  const [progress, setProgress] = createSignal<string>()

  async function create(context?: string) {
    const projectID = input.projectID()
    if (!projectID) return
    setCreating(true)
    setProgress("Creating copy")
    try {
      const directory = await createGitWorktreeProjectCopy({
        projectID,
        context,
        sdkDirectory: sdk.directory,
        worktreeRoot: paths.worktree,
        generateName: (input) =>
          sdk.client.experimental.projectCopy.generateName(input, { throwOnError: true }),
        createCopy: (input) => sdk.client.v2.projectCopy.create(input, { throwOnError: true }),
        // Bootstrap the returned local directory before creating its Session.
        bootstrapDirectory: (directory) => sdk.client.path.get({ directory }, { throwOnError: true }),
      })

      setProgress("Creating session")
      return directory
    } catch (err) {
      homeDestination?.clear()
      setProgress(undefined)
      setCreating(false)
      toast.show({ title: "Creating project copy failed", message: errorMessage(err), variant: "error" })
      return
    }
  }

  function open() {
    const projectID = input.projectID()
    if (!projectID) return
    dialog.replace(() => (
      <DialogSessionStartLocation
        projectID={projectID}
        current={
          homeDestination?.destination() ??
          {
            type: "directory",
            directory: project.instance.directory(),
            subdirectory: project.instance.directory() !== project.instance.path().worktree,
          }
        }
        onCurrentChange={(selection) => homeDestination?.setDestination(selection)}
        onSelect={(selection) => {
          homeDestination?.setDestination(selection)
          dialog.clear()
        }}
      />
    ))
  }

  const pending = createMemo(() => Boolean(homeDestination?.destination()))
  const pendingNew = createMemo(() => homeDestination?.destination()?.type === "new")

  async function getDirectory(context?: string) {
    const value = homeDestination?.destination()
    if (!value) return
    if (value.type === "directory") {
      return value.directory
    }
    return await create(context)
  }

  function startSubmit() {
    if (progress()) setProgress("Submitting prompt")
  }

  function finishSubmit() {
    homeDestination?.clear()
    setProgress(undefined)
    setCreating(false)
  }

  createEffect(() => {
    if (!creating()) {
      setCreatingDots(3)
      return
    }
    const timer = setInterval(() => setCreatingDots((dots) => (dots % 3) + 1), 1000)
    onCleanup(() => clearInterval(timer))
  })

  return {
    creating,
    creatingDots,
    finishSubmit,
    getDirectory,
    open,
    pending,
    pendingNew,
    progress,
    startSubmit,
  }
}
