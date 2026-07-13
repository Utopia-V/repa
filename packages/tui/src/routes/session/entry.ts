export type SessionEntryInfo = {
  directory: string
}

export type SessionDirectoryAccess =
  | { status: "pending" }
  | { status: "ready" }
  | { status: "unavailable"; error: unknown }

export function canShowSessionPrompt(input: {
  child: boolean
  access: SessionDirectoryAccess
  permissions: number
  questions: number
}) {
  return !input.child && input.access.status === "ready" && input.permissions === 0 && input.questions === 0
}

type SessionEntryResult =
  | { status: "stale" }
  | { status: "missing" }
  | { status: "ready"; session: SessionEntryInfo; directoryError?: unknown }

export async function enterSession(input: {
  sessionID: string
  activeDirectory: string
  signal: AbortSignal
  load: (sessionID: string, signal: AbortSignal) => Promise<SessionEntryInfo | undefined>
  selectDirectory: (directory: string, signal: AbortSignal) => Promise<boolean>
  currentDirectory: () => string
  reconnect: (directory: string) => void
  hydrateTranscript: (sessionID: string) => Promise<void>
  setDirectoryAccess: (access: SessionDirectoryAccess) => void
}): Promise<SessionEntryResult> {
  input.setDirectoryAccess({ status: "pending" })
  const session = await input.load(input.sessionID, input.signal)
  if (input.signal.aborted) return { status: "stale" }
  if (!session) return { status: "missing" }

  let directoryReady = session.directory === input.activeDirectory
  let directoryError: unknown
  if (!directoryReady) {
    try {
      directoryReady = await input.selectDirectory(session.directory, input.signal)
    } catch (error) {
      // The durable transcript remains readable even when its local material
      // directory is temporarily unavailable.
      directoryError = error
    }
  }
  if (input.signal.aborted) return { status: "stale" }

  const directoryAvailable = directoryReady || input.currentDirectory() === session.directory
  if (!directoryAvailable && !directoryError) {
    directoryError = new Error(`Local material directory was not activated: ${session.directory}`)
  }
  if (directoryAvailable) {
    input.reconnect(session.directory)
  }
  await input.hydrateTranscript(input.sessionID)
  if (input.signal.aborted) return { status: "stale" }
  input.setDirectoryAccess(
    directoryError ? { status: "unavailable", error: directoryError } : { status: "ready" },
  )
  return { status: "ready", session, directoryError }
}
