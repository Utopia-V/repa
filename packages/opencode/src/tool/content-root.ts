import { ContentRoot } from "@opencode-ai/core/content-root"
import { waitForAbort } from "@opencode-ai/core/process"
import { PositiveInt } from "@opencode-ai/core/schema"
import { Effect, Schema } from "effect"
import { Tool } from "./tool"

export const CONTENT_ROOT_TOOL_IDS = [
  "content_roots",
  "content_inventory",
  "content_search",
  "content_read",
  "content_write",
] as const

const Budgets = Schema.Struct({
  maxDepth: Schema.optional(PositiveInt),
  maxEntries: Schema.optional(PositiveInt),
  maxDirectories: Schema.optional(PositiveInt),
  maxFiles: Schema.optional(PositiveInt),
  maxDurationMs: Schema.optional(PositiveInt),
  maxPathBytes: Schema.optional(PositiveInt),
  maxReturnedBytes: Schema.optional(PositiveInt),
  maxFileBytes: Schema.optional(PositiveInt),
})

const RootsParameters = Schema.Struct({})
const InventoryParameters = Schema.Struct({
  contentRootID: ContentRoot.ContentRootID,
  scope: Schema.optional(Schema.String),
  budgets: Schema.optional(Budgets),
})
const SearchParameters = Schema.Struct({
  contentRootID: ContentRoot.ContentRootID,
  query: Schema.String,
  scope: Schema.optional(Schema.String),
  budgets: Schema.optional(Budgets),
  maxMatches: Schema.optional(PositiveInt),
  maxContextBytes: Schema.optional(PositiveInt),
})
const ReadParameters = Schema.Struct({
  contentRootID: ContentRoot.ContentRootID,
  relativePath: Schema.String,
  maxBytes: Schema.optional(PositiveInt),
})
const WriteParameters = Schema.Union([
  Schema.Struct({
    mutationGrantID: ContentRoot.MutationGrantID,
    expectedVersion: PositiveInt,
    relativePath: Schema.String,
    content: Schema.String,
  }),
  Schema.Struct({
    filePath: Schema.String,
    content: Schema.String,
  }),
])

export const ContentRootsTool = Tool.define<
  typeof RootsParameters,
  Record<string, unknown>,
  ContentRoot.Service
>(
  "content_roots",
  Effect.gen(function* () {
    const roots = yield* ContentRoot.Service
    return {
      description:
        "List durable ContentRoots and their current exact path/object verification state. A root grants bounded observation only, never file mutation, Shell, network, connectors, or Artifact admission.",
      parameters: RootsParameters,
      execute: (_input, context) =>
        abortable(roots.list(), context.abort).pipe(
          Effect.map((items) => ({
            title: "ContentRoots",
            metadata: { count: items.length },
            output: JSON.stringify(items, null, 2),
          })),
          Effect.orDie,
        ),
    }
  }),
)

export const ContentInventoryTool = Tool.define<
  typeof InventoryParameters,
  Record<string, unknown>,
  ContentRoot.Service
>(
  "content_inventory",
  Effect.gen(function* () {
    const roots = yield* ContentRoot.Service
    return {
      description:
        "Return one deterministic bounded metadata manifest under an active ContentRoot. The manifest is ephemeral and does not import Artifacts or widen to other roots.",
      parameters: InventoryParameters,
      execute: (input: Schema.Schema.Type<typeof InventoryParameters>, context) =>
        abortable(roots.inventory(input), context.abort).pipe(
          Effect.map((result) => ({
            title: `Inventory ${result.contentRootID}`,
            metadata: {
              contentRootID: result.contentRootID,
              bindingID: result.bindingID,
              grantVersion: result.grantVersion,
              truncated: result.truncated,
            },
            output: JSON.stringify(result, null, 2),
          })),
          Effect.orDie,
        ),
    }
  }),
)

export const ContentSearchTool = Tool.define<typeof SearchParameters, Record<string, unknown>, ContentRoot.Service>(
  "content_search",
  Effect.gen(function* () {
    const roots = yield* ContentRoot.Service
    return {
      description:
        "Search exact text bytes through one active ContentRoot with explicit inventory, match, context, time, and byte limits. It never searches all roots implicitly or admits an Artifact.",
      parameters: SearchParameters,
      execute: (input: Schema.Schema.Type<typeof SearchParameters>, context) =>
        abortable(roots.search(input), context.abort).pipe(
          Effect.map((result) => ({
            title: `Search ${result.inventory.contentRootID}`,
            metadata: {
              contentRootID: result.inventory.contentRootID,
              bindingID: result.inventory.bindingID,
              grantVersion: result.inventory.grantVersion,
              matches: result.matches.length,
              truncated: result.truncated,
            },
            output: JSON.stringify(result, null, 2),
          })),
          Effect.orDie,
        ),
    }
  }),
)

export const ContentReadTool = Tool.define<typeof ReadParameters, Record<string, unknown>, ContentRoot.Service>(
  "content_read",
  Effect.gen(function* () {
    const roots = yield* ContentRoot.Service
    return {
      description:
        "Read one authority-relative file through an active ContentRoot using a mutation-safe held-handle observation. Missing is reported only after two verified absence checks. This read does not admit or update an Artifact.",
      parameters: ReadParameters,
      execute: (input: Schema.Schema.Type<typeof ReadParameters>, context) =>
        abortable(roots.read(input), context.abort).pipe(
          Effect.map((result) => {
            const observation = result.observation
            if (observation.result === "missing") {
              return {
                title: input.relativePath,
                metadata: result,
                output: JSON.stringify(result, null, 2),
              }
            }
            const textual =
              observation.mediaType.startsWith("text/") || observation.mediaType === "application/json"
            return {
              title: observation.relativePath,
              metadata: {
                authorization: result.authorization,
                result: observation.result,
                relativePath: observation.relativePath,
                descriptor: observation.descriptor,
                fingerprint: observation.fingerprint,
                mediaType: observation.mediaType,
                timeObserved: observation.timeObserved,
              },
              output: textual
                ? new TextDecoder("utf-8").decode(observation.bytes)
                : JSON.stringify(
                    {
                      authorization: result.authorization,
                      result: observation.result,
                      relativePath: observation.relativePath,
                      fingerprint: observation.fingerprint,
                      mediaType: observation.mediaType,
                      note: "Exact bytes were verified but no readable representation is created in Gate 10.",
                    },
                    null,
                    2,
                  ),
            }
          }),
          Effect.orDie,
        ),
    }
  }),
)

export const ContentWriteTool = Tool.define<typeof WriteParameters, Record<string, unknown>, ContentRoot.Service>(
  "content_write",
  Effect.gen(function* () {
    const roots = yield* ContentRoot.Service
    return {
      description:
        "Create or replace one exact local file through Repa's mediated mutation boundary. A ContentRoot never authorizes this tool. Supply an active independently anchored mutation grant, or Repa will request a system-owned one-shot confirmation for the exact file invocation.",
      parameters: WriteParameters,
      execute: (input: Schema.Schema.Type<typeof WriteParameters>, context) =>
        Effect.gen(function* () {
          const bytes = new TextEncoder().encode(input.content)
          if ("mutationGrantID" in input) {
            const written = yield* admitMutation(
              roots.writeWithGrant({
                mutationGrantID: input.mutationGrantID,
                expectedVersion: input.expectedVersion,
                relativePath: input.relativePath,
                bytes,
              }),
              context.abort,
            )
            return {
              title: written.result.relativePath,
              metadata: {
                mutationGrantID: written.grant.id,
                mutationGrantVersion: written.grant.version,
                operation: written.result.operation,
                byteLength: written.result.byteLength,
              },
              output: `Mediated ${written.result.operation} completed under mutation grant ${written.grant.id}.`,
            }
          }

          const proposal = yield* abortable(roots.proposeFileMutation(input.filePath), context.abort)
          yield* abortable(
            context.ask({
              permission: "content_mutation",
              requirePrompt: true,
              patterns: [`${proposal.operation}:${proposal.anchor.canonicalPath}\\${proposal.relativePath}`],
              always: [],
              metadata: {
                onceOnly: true,
                operation: proposal.operation,
                anchorPath: proposal.anchor.canonicalPath,
                relativePath: proposal.relativePath,
                lifetime: "this physical tool invocation",
                rights: [proposal.operation],
                warning: "This allows one direct file change only. It does not allow Shell, network, or sibling paths.",
              },
            }),
            context.abort,
          )
          const result = yield* admitMutation(
            roots.writeOnce({
              proposal,
              approval: ContentRoot.OnceMutationApproval.systemConfirmation(
                proposal,
                `${context.sessionID}:${context.messageID}:${context.callID ?? "unknown"}`,
              ),
              bytes,
            }),
            context.abort,
          )
          return {
            title: result.relativePath,
            metadata: { onceOnly: true, operation: result.operation, byteLength: result.byteLength },
            output: `One-shot mediated ${result.operation} completed. No durable mutation grant was created.`,
          }
        }).pipe(Effect.orDie),
    }
  }),
)

export function assertExternalContentToolID(id: string, source: "custom" | "mcp") {
  if (!CONTENT_ROOT_TOOL_IDS.includes(id as (typeof CONTENT_ROOT_TOOL_IDS)[number])) return
  throw new Error(`${source} tool ID ${id} is reserved by Repa's ContentRoot authority`)
}

function abortable<A, E, R>(effect: Effect.Effect<A, E, R>, signal: AbortSignal) {
  if (signal.aborted) return waitForAbort(signal)
  return Effect.raceFirst(effect, waitForAbort(signal))
}

function admitMutation<A, E, R>(effect: Effect.Effect<A, E, R>, signal: AbortSignal): Effect.Effect<A, E | Error, R> {
  // This signal read is the mutation-admission linearization point. Before it,
  // cancellation wins. After it, the native write must settle truthfully because
  // Win32 WriteFile cannot be rolled back or reported cancelled while still running.
  if (signal.aborted) return waitForAbort(signal)
  return Effect.uninterruptible(effect)
}
