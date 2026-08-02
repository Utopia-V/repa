import type {
  AgentSideConnection,
  PermissionOption,
  RequestPermissionResponse,
  ToolCallContent,
  ToolCallLocation,
  ToolCallUpdate,
} from "@agentclientprotocol/sdk"
import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import type { Event, OpencodeClient } from "@opencode-ai/sdk/v2"
import { applyPatch } from "diff"
import { exists, readText } from "@/util/filesystem"
import type { ACPSession } from "./session"
import { pendingToolCall, toLocations, type ToolInput } from "./tool"
import { Effect } from "effect"

type PermissionEvent = Extract<Event, { type: "permission.asked" }>
type Reply = "once" | "always" | "reject" | "cancel"
type Connection = Partial<Pick<AgentSideConnection, "requestPermission" | "writeTextFile">>

const allowOnceOption = { optionId: "once", kind: "allow_once", name: "Allow once" } as const
const allowAlwaysOption = { optionId: "always", kind: "allow_always", name: "Always allow" } as const
const rejectOption = { optionId: "reject", kind: "reject_once", name: "Reject" } as const

export class Handler {
  private readonly queues = new Map<string, Promise<void>>()

  constructor(
    private readonly input: {
      sdk: OpencodeClient
      connection: Connection
      session: ACPSession.Interface
    },
  ) {}

  handle(event: PermissionEvent) {
    const permission = event.properties
    const previous = this.queues.get(permission.sessionID) ?? Promise.resolve()
    const next = previous
      .then(() => this.process(event))
      .catch(() => {})
      .finally(() => {
        if (this.queues.get(permission.sessionID) === next) {
          this.queues.delete(permission.sessionID)
        }
      })
    this.queues.set(permission.sessionID, next)
  }

  private async process(event: PermissionEvent) {
    const permission = event.properties
    const session = await Effect.runPromise(this.input.session.tryGet(permission.sessionID))
    if (!session) return
    const exactReply = PermissionV1.exactReplyRequired(permission)
    const constraint = permissionConstraint(permission)

    if (!this.input.connection.requestPermission) {
      if (!exactReply) await this.reply(permission.id, "reject", session.cwd)
      return
    }

    const result = await this.input.connection
      .requestPermission({
        sessionId: permission.sessionID,
        toolCall: await permissionToolCall({
          toolCallId: permission.tool?.callID ?? permission.id,
          toolName: permission.permission,
          request: permission,
        }),
        options: permissionOptions(permission),
      })
      .catch(async () => {
        if (!exactReply) await this.reply(permission.id, "reject", session.cwd)
        return undefined
      })

    if (!result) return

    const reply = selectedReply(result, exactReply, constraint)
    if (reply !== "once" && reply !== "always") {
      await this.reply(permission.id, reply, session.cwd)
      return
    }

    if (permission.permission === "edit") {
      await this.writeProposedEdit(session.id, permission.metadata).catch(() => {})
    }

    await this.reply(permission.id, reply, session.cwd)
  }

  private async reply(requestID: string, reply: Reply, directory: string) {
    await this.input.sdk.permission.reply({
      requestID,
      reply,
      directory,
    })
  }

  private async writeProposedEdit(sessionId: string, metadata: ToolInput) {
    const filepath = stringValue(metadata.filepath)
    const diff = stringValue(metadata.diff)
    if (!filepath || !diff || !this.input.connection.writeTextFile) return

    const content = (await exists(filepath)) ? await readText(filepath) : ""
    const next = applyPatch(content, diff)
    if (next === false) {
      return
    }

    void this.input.connection.writeTextFile({
      sessionId,
      path: filepath,
      content: next,
    })
  }
}

export async function permissionToolCall(input: {
  readonly toolCallId: string
  readonly toolName: string
  readonly request: PermissionEvent["properties"]
}): Promise<ToolCallUpdate> {
  const semantic = SemanticPresentation.readProposal(input.request)
  const requestInput =
    semantic.type === "valid"
      ? {
          capability: semantic.value.capability,
          approval: semantic.value.approval,
          summary: semantic.value.summary,
          facts: semantic.value.facts,
        }
      : semantic.type === "invalid"
        ? { scope: "unavailable", requiredAction: "reject" }
        : input.request.metadata
  const toolCall = pendingToolCall({
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    state: {
      input: requestInput,
      title:
        semantic.type === "valid"
          ? semantic.value.title
          : semantic.type === "invalid"
            ? "Permission scope unavailable"
            : permissionTitle(input.toolName, input.request.metadata),
    },
  })
  const content =
    semantic.type === "valid"
      ? [
          semanticContent([
            semantic.value.summary,
            ...semantic.value.facts.map((item) => `${item.label}: ${item.value}`),
          ]),
        ]
      : semantic.type === "invalid"
        ? [semanticContent(["Repa could not verify the exact consequential scope. Reject this request."])]
        : await permissionContent(input.toolName, input.request.metadata)
  return {
    ...toolCall,
    locations: semantic.type === "absent" ? permissionLocations(input.toolName, input.request.metadata) : [],
    ...(content.length ? { content } : {}),
  }
}

export function permissionOptions(request: PermissionEvent["properties"]): PermissionOption[] {
  const constraint = permissionConstraint(request)
  if (constraint.rejectOnly) return [rejectOption]
  if (constraint.onceOnly) return [allowOnceOption, rejectOption]
  return [allowOnceOption, allowAlwaysOption, rejectOption]
}

function permissionConstraint(request: PermissionEvent["properties"]) {
  const semantic = SemanticPresentation.readProposal(request)
  if (semantic.type === "invalid") return { onceOnly: true, rejectOnly: true }
  if (
    PermissionV1.promptRequired(request) ||
    request.metadata.onceOnly === true ||
    (semantic.type === "valid" && semantic.value.approval === "once_only")
  ) {
    return { onceOnly: true, rejectOnly: false }
  }
  return { onceOnly: false, rejectOnly: false }
}

function semanticContent(lines: readonly string[]): ToolCallContent {
  return { type: "content", content: { type: "text", text: lines.join("\n") } }
}

function permissionTitle(toolName: string, input: ToolInput) {
  const tool = toolName.toLocaleLowerCase()
  switch (tool) {
    case "external_directory":
      return stringValue(input.description) ?? stringValue(input.command) ?? stringValue(input.parentDir)

    case "webfetch":
      return stringValue(input.url)

    case "websearch":
      return stringValue(input.query)

    case "grep":
    case "glob":
      return stringValue(input.pattern)

    case "read":
    case "edit":
    case "write":
      return editTitle(input)

    default:
      return undefined
  }
}

function editTitle(input: ToolInput) {
  const files = fileMetadata(input)
  if (files.length === 1) return files[0]?.relativePath ?? files[0]?.filePath
  if (files.length > 1) return `${files.length} files`
  return stringValue(input.filePath) ?? stringValue(input.filepath) ?? stringValue(input.path)
}

function permissionLocations(toolName: string, input: ToolInput): ToolCallLocation[] {
  const files = fileMetadata(input)
  if (files.length) {
    return Array.from(
      new Set(files.flatMap((file) => [file.filePath, file.movePath].filter((path): path is string => !!path))),
      (path) => ({ path }),
    )
  }
  return toLocations(toolName, input)
}

async function permissionContent(toolName: string, input: ToolInput): Promise<ToolCallContent[]> {
  if (toolName.toLocaleLowerCase() !== "edit") return []

  const files = fileMetadata(input)
  if (files.length) return diffContentForFiles(files)

  const filepath = stringValue(input.filepath) ?? stringValue(input.filePath)
  const diff = stringValue(input.diff)
  if (!filepath || !diff) return []
  const content = await diffContentForPatch(filepath, diff)
  return content ? [content] : []
}

async function diffContentForFiles(files: PermissionFileMetadata[]) {
  const content = await Promise.all(
    files.map(async (file) => {
      if (!file.patch) return []
      const content = await diffContentForPatch(file.filePath, file.patch, file.movePath)
      return content ? [content] : []
    }),
  )
  return content.flat()
}

async function diffContentForPatch(filepath: string, diff: string, displayPath = filepath) {
  const content = (await exists(filepath)) ? await readText(filepath) : ""
  const next = applyPatch(content, diff)
  if (next === false) return undefined
  return {
    type: "diff" as const,
    path: displayPath,
    oldText: content,
    newText: next,
  }
}

function selectedReply(
  result: RequestPermissionResponse,
  exactReply: boolean,
  constraint: { readonly onceOnly: boolean; readonly rejectOnly: boolean },
): Reply {
  if (result.outcome.outcome !== "selected") return exactReply ? "cancel" : "reject"
  if (result.outcome.optionId === "once") return constraint.rejectOnly ? (exactReply ? "cancel" : "reject") : "once"
  if (result.outcome.optionId === "always") {
    return constraint.onceOnly || constraint.rejectOnly ? (exactReply ? "cancel" : "reject") : "always"
  }
  if (result.outcome.optionId === "reject") return "reject"
  if (exactReply) return "cancel"
  return "reject"
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined
}

type PermissionFileMetadata = {
  readonly filePath: string
  readonly relativePath?: string
  readonly movePath?: string
  readonly patch?: string
}

function fileMetadata(input: ToolInput): PermissionFileMetadata[] {
  if (!Array.isArray(input.files)) return []
  return input.files.flatMap((file): PermissionFileMetadata[] => {
    if (!file || typeof file !== "object") return []
    const info = file as Record<string, unknown>
    const filePath = stringValue(info.filePath)
    if (!filePath) return []
    return [
      {
        filePath,
        relativePath: stringValue(info.relativePath),
        movePath: stringValue(info.movePath),
        patch: stringValue(info.patch),
      },
    ]
  })
}

export * as ACPPermission from "./permission"
