import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Slug } from "@opencode-ai/core/util/slug"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import path from "path"
import { Decimal } from "decimal.js"
import type { ProviderMetadata, Usage } from "@opencode-ai/llm"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2Bridge } from "@/event-v2-bridge"
import { EventV2 } from "@opencode-ai/core/event"
import { EventSequenceTable } from "@opencode-ai/core/event/sql"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { TurnChildLineageTable } from "@opencode-ai/core/turn/sql"
import { Turn } from "@opencode-ai/schema/turn"
import { locationServiceMapLayer } from "@opencode-ai/core/location-services"

import { NotFoundError } from "@/storage/storage"
import { eq } from "drizzle-orm"
import { asc } from "drizzle-orm"
import { and } from "drizzle-orm"
import { gte } from "drizzle-orm"
import { isNull } from "drizzle-orm"
import { desc } from "drizzle-orm"
import { like } from "drizzle-orm"
import { sql } from "drizzle-orm"
import { inArray } from "drizzle-orm"
import { lt } from "drizzle-orm"
import { or } from "drizzle-orm"
import type { SQL } from "drizzle-orm"
import {
  MessageTable,
  PartTable,
  SessionHistoricalMessagePresentationTable,
  SessionHistoricalPartPresentationTable,
  SessionTable,
} from "@opencode-ai/core/session/sql"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { MessageV2 } from "./message-v2"
import type { InstanceContext } from "../project/instance-context"
import { InstanceState } from "@/effect/instance-state"
import { Snapshot } from "@/snapshot"
import { ProjectV2 } from "@opencode-ai/core/project"
import { WorkspaceV2 } from "@opencode-ai/core/workspace"
import { BusyError, SessionID, MessageID, PartID } from "./schema"

import type { Provider } from "@/provider/provider"
import { Global } from "@opencode-ai/core/global"
import { Effect, Layer, Option, Context, Schema, Types } from "effect"
import { NonNegativeInt, optional } from "@opencode-ai/core/schema"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { SessionMessage } from "@opencode-ai/schema/session-message"
import { KeyedMutex } from "@opencode-ai/core/effect/keyed-mutex"
import {
  HistoricalPresentationConflictError,
  InvalidCausalSourceError,
  LearnerAdmission,
  SettledPartImmutableError,
  assertAssistantDeletable,
  assertPartDeletable,
  exactSettlement,
  lookupPhysicalInvocationByPart,
  Occurrence,
  removeNoEffectInvocationsForAssistant,
  removeOccurrencePresentation,
} from "@opencode-ai/core/learning-command"
import {
  HistoricalLearningToolPresentationTable,
  LearnerOccurrencePresentationTable,
} from "@opencode-ai/core/learning-command/occurrence.sql"
import { isDeepStrictEqual } from "node:util"
import { SessionRunState } from "./run-state"
import { SessionTurnEvents } from "./turn-events"

const parentTitlePrefix = "New session - "
const childTitlePrefix = "Child session - "

export function isDefaultTitle(title: string) {
  return new RegExp(
    `^(${parentTitlePrefix}|${childTitlePrefix})\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$`,
  ).test(title)
}

type SessionRow = typeof SessionTable.$inferSelect

export function fromRow(row: SessionRow): Info {
  const summary =
    row.summary_additions !== null || row.summary_deletions !== null || row.summary_files !== null
      ? {
          additions: row.summary_additions ?? 0,
          deletions: row.summary_deletions ?? 0,
          files: row.summary_files ?? 0,
          diffs: row.summary_diffs ?? undefined,
        }
      : undefined
  const share = row.share_url ? { url: row.share_url } : undefined
  const revert = row.revert
    ? {
        messageID: MessageID.make(row.revert.messageID),
        partID: row.revert.partID ? PartID.make(row.revert.partID) : undefined,
        snapshot: row.revert.snapshot,
        diff: row.revert.diff,
      }
    : undefined
  return {
    id: row.id,
    slug: row.slug,
    projectID: row.project_id,
    workspaceID: row.workspace_id ?? undefined,
    directory: row.directory,
    path: row.path ?? undefined,
    parentID: row.parent_id ?? undefined,
    title: row.title,
    agent: row.agent ?? undefined,
    model: row.model
      ? {
          id: ModelV2.ID.make(row.model.id),
          providerID: ProviderV2.ID.make(row.model.providerID),
          variant: row.model.variant,
        }
      : undefined,
    version: row.version,
    summary,
    cost: row.cost,
    tokens: {
      input: row.tokens_input,
      output: row.tokens_output,
      reasoning: row.tokens_reasoning,
      cache: {
        read: row.tokens_cache_read,
        write: row.tokens_cache_write,
      },
    },
    share,
    metadata: row.metadata ?? undefined,
    revert,
    permission: row.permission ? [...row.permission] : undefined,
    time: {
      created: row.time_created,
      updated: row.time_updated,
      compacting: row.time_compacting ?? undefined,
      archived: row.time_archived ?? undefined,
    },
  }
}

export function toRow(info: Info) {
  return {
    id: info.id,
    project_id: info.projectID,
    workspace_id: info.workspaceID,
    parent_id: info.parentID,
    slug: info.slug,
    directory: info.directory,
    path: info.path,
    title: info.title,
    agent: info.agent,
    model: info.model,
    version: info.version,
    share_url: info.share?.url,
    summary_additions: info.summary?.additions,
    summary_deletions: info.summary?.deletions,
    summary_files: info.summary?.files,
    summary_diffs: info.summary?.diffs,
    metadata: info.metadata,
    cost: info.cost ?? 0,
    tokens_input: (info.tokens ?? EmptyTokens).input,
    tokens_output: (info.tokens ?? EmptyTokens).output,
    tokens_reasoning: (info.tokens ?? EmptyTokens).reasoning,
    tokens_cache_read: (info.tokens ?? EmptyTokens).cache.read,
    tokens_cache_write: (info.tokens ?? EmptyTokens).cache.write,
    revert: info.revert
      ? {
          messageID: SessionMessage.ID.make(info.revert.messageID),
          partID: info.revert.partID,
          snapshot: info.revert.snapshot,
          diff: info.revert.diff,
        }
      : null,
    permission: info.permission,
    time_created: info.time.created,
    time_updated: info.time.updated,
    time_compacting: info.time.compacting,
    time_archived: info.time.archived,
  }
}

function getForkedTitle(title: string): string {
  const match = title.match(/^(.+) \(fork #(\d+)\)$/)
  if (match) {
    const base = match[1]
    const num = parseInt(match[2], 10)
    return `${base} (fork #${num + 1})`
  }
  return `${title} (fork #1)`
}

function sessionPath(worktree: string, cwd: string) {
  return path.relative(path.resolve(worktree), cwd).replaceAll("\\", "/")
}

const Summary = Schema.Struct({
  additions: Schema.Finite,
  deletions: Schema.Finite,
  files: Schema.Finite,
  diffs: optional(Schema.Array(Snapshot.FileDiff)),
})

const Tokens = Schema.Struct({
  input: Schema.Finite,
  output: Schema.Finite,
  reasoning: Schema.Finite,
  cache: Schema.Struct({
    read: Schema.Finite,
    write: Schema.Finite,
  }),
})

const EmptyTokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }

const Share = Schema.Struct({
  url: Schema.String,
})

// Legacy HTTP accepted negative values here. Keep archive timestamps permissive
// while excluding non-finite values that cannot round-trip through JSON.
export const ArchivedTimestamp = Schema.Finite

const Time = Schema.Struct({
  created: NonNegativeInt,
  updated: NonNegativeInt,
  compacting: optional(NonNegativeInt),
  archived: optional(ArchivedTimestamp),
})

const Revert = Schema.Struct({
  messageID: MessageID,
  partID: optional(PartID),
  snapshot: optional(Schema.String),
  diff: optional(Schema.String),
})

const Model = Schema.Struct({
  id: ModelV2.ID,
  providerID: ProviderV2.ID,
  variant: optional(Schema.String),
})

export const Metadata = Schema.Record(Schema.String, Schema.Any)

export const Info = Schema.Struct({
  id: SessionID,
  slug: Schema.String,
  projectID: ProjectV2.ID,
  workspaceID: optional(WorkspaceV2.ID),
  directory: Schema.String,
  path: optional(Schema.String),
  parentID: optional(SessionID),
  summary: optional(Summary),
  cost: optional(Schema.Finite),
  tokens: optional(Tokens),
  share: optional(Share),
  title: Schema.String,
  agent: optional(Schema.String),
  model: optional(Model),
  version: Schema.String,
  metadata: optional(Metadata),
  time: Time,
  permission: optional(PermissionV1.Ruleset),
  revert: optional(Revert),
}).annotate({ identifier: "Session" })
export type Info = Types.DeepMutable<Schema.Schema.Type<typeof Info>>

export const ProjectInfo = Schema.Struct({
  id: ProjectV2.ID,
  name: optional(Schema.String),
  worktree: Schema.String,
}).annotate({ identifier: "ProjectSummary" })
export type ProjectInfo = Types.DeepMutable<Schema.Schema.Type<typeof ProjectInfo>>

export const GlobalInfo = Schema.Struct({
  ...Info.fields,
  project: Schema.NullOr(ProjectInfo),
}).annotate({ identifier: "GlobalSession" })
export type GlobalInfo = Types.DeepMutable<Schema.Schema.Type<typeof GlobalInfo>>

export const GetInput = SessionID
export const ChildrenInput = SessionID
export const RemoveInput = SessionID
export const SetTitleInput = Schema.Struct({ sessionID: SessionID, title: Schema.String })
export const SetArchivedInput = Schema.Struct({
  sessionID: SessionID,
  time: Schema.optional(ArchivedTimestamp),
})
export const SetMetadataInput = Schema.Struct({
  sessionID: SessionID,
  metadata: Metadata,
})
export const SetPermissionInput = Schema.Struct({
  sessionID: SessionID,
  permission: PermissionV1.Ruleset,
})
export const SetRevertInput = Schema.Struct({
  sessionID: SessionID,
  revert: Schema.optional(Revert),
  summary: Schema.optional(Summary),
})
export const MessagesInput = Schema.Struct({
  sessionID: SessionID,
  limit: Schema.optional(NonNegativeInt),
})
export type ListInput = {
  directory?: string
  scope?: "project"
  path?: string
  workspaceID?: WorkspaceV2.ID
  roots?: boolean
  start?: number
  search?: string
  limit?: number
}

export type GlobalListInput = {
  directory?: string
  roots?: boolean
  start?: number
  cursor?: number
  search?: string
  limit?: number
  archived?: boolean
}

export const Event = {
  Created: SessionV1.Event.Created,
  Updated: SessionV1.Event.Updated,
  Deleted: SessionV1.Event.Deleted,
  Diff: SessionV1.Event.Diff,
  Error: SessionV1.Event.Error,
}

export function plan(input: { slug: string; time: { created: number } }, instance: InstanceContext) {
  const base = instance.project.vcs
    ? path.join(instance.worktree, ".repa", "plans")
    : path.join(Global.Path.data, "plans")
  return path.join(base, [input.time.created, input.slug].join("-") + ".md")
}

export const getUsage = (input: { model: Provider.Model; usage: Usage; metadata?: ProviderMetadata }) => {
  const safe = (value: number) => {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, value)
  }
  const inputTokens = safe(input.usage.inputTokens ?? 0)
  const outputTokens = safe(input.usage.outputTokens ?? 0)
  const reasoningTokens = safe(input.usage.reasoningTokens ?? 0)

  const cacheReadInputTokens = safe(input.usage.cacheReadInputTokens ?? 0)
  const cacheWriteInputTokens = safe(
    Number(
      input.usage.cacheWriteInputTokens ??
        input.metadata?.["anthropic"]?.["cacheCreationInputTokens"] ??
        // google-vertex-anthropic returns metadata under "vertex" key
        // (AnthropicMessagesLanguageModel custom provider key from 'vertex.anthropic.messages')
        input.metadata?.["vertex"]?.["cacheCreationInputTokens"] ??
        // @ts-expect-error
        input.metadata?.["bedrock"]?.["usage"]?.["cacheWriteInputTokens"] ??
        // @ts-expect-error
        input.metadata?.["venice"]?.["usage"]?.["cacheCreationInputTokens"] ??
        0,
    ),
  )

  // AI SDK v6 normalized inputTokens to include cached tokens across all providers
  // (including Anthropic/Bedrock which previously excluded them). Always subtract cache
  // tokens to get the non-cached input count for separate cost calculation.
  const adjustedInputTokens = safe(inputTokens - cacheReadInputTokens - cacheWriteInputTokens)

  const total = input.usage.totalTokens

  const tokens = {
    total,
    input: adjustedInputTokens,
    output: safe(outputTokens - reasoningTokens),
    reasoning: reasoningTokens,
    cache: {
      write: cacheWriteInputTokens,
      read: cacheReadInputTokens,
    },
  }

  const contextTokens = inputTokens
  const costInfo =
    input.model.cost?.tiers
      ?.filter((item) => item.tier.type === "context" && contextTokens > item.tier.size)
      .sort((a, b) => b.tier.size - a.tier.size)[0] ??
    (input.model.cost?.experimentalOver200K && contextTokens > 200_000
      ? input.model.cost.experimentalOver200K
      : input.model.cost)
  const totalNanoAiu = input.metadata?.["copilot"]?.["totalNanoAiu"]
  return {
    cost:
      typeof totalNanoAiu === "number" && Number.isFinite(totalNanoAiu) && totalNanoAiu >= 0
        ? new Decimal(totalNanoAiu).div(100_000_000_000).toNumber()
        : safe(
            new Decimal(0)
              .add(new Decimal(tokens.input).mul(costInfo?.input ?? 0).div(1_000_000))
              .add(new Decimal(tokens.output).mul(costInfo?.output ?? 0).div(1_000_000))
              .add(new Decimal(tokens.cache.read).mul(costInfo?.cache?.read ?? 0).div(1_000_000))
              .add(new Decimal(tokens.cache.write).mul(costInfo?.cache?.write ?? 0).div(1_000_000))
              // TODO: update models.dev to have better pricing model, for now:
              // charge reasoning tokens at the same rate as output tokens
              .add(new Decimal(tokens.reasoning).mul(costInfo?.output ?? 0).div(1_000_000))
              .toNumber(),
          ),
    tokens,
  }
}

export { BusyError } from "./schema"

export type NotFound = NotFoundError

export interface Interface {
  readonly list: (input?: ListInput) => Effect.Effect<Info[]>
  readonly listGlobal: (input?: GlobalListInput) => Effect.Effect<GlobalInfo[]>
  readonly prepareRootStart: (
    tx: EventV2.Transaction,
    input: {
      targetSessionID: SessionID
      turnID: Turn.ID
      session?: NewSessionInput
      fork?: ForkStartBasis
    },
  ) => Effect.Effect<RootStartPlan, NotFound | BusyError | Turn.Error>
  readonly prepareChildStart: (input: ChildStartInput) => Effect.Effect<TurnLifecycle.Admitted, NotFound | Turn.Error>
  readonly touch: (sessionID: SessionID) => Effect.Effect<void, BusyError>
  readonly get: (id: SessionID) => Effect.Effect<Info, NotFound>
  readonly setTitle: (input: { sessionID: SessionID; title: string }) => Effect.Effect<void, BusyError>
  readonly setTitleIfDefault: (input: { sessionID: SessionID; title: string }) => Effect.Effect<boolean, BusyError>
  readonly setArchived: (input: { sessionID: SessionID; time?: number }) => Effect.Effect<void, BusyError>
  readonly setMetadata: (input: typeof SetMetadataInput.Type) => Effect.Effect<void, BusyError>
  readonly setAgentModel: (input: {
    sessionID: SessionID
    agent: string
    model: NonNullable<Info["model"]>
    time: number
  }) => Effect.Effect<void, BusyError>
  readonly setPermission: (input: {
    sessionID: SessionID
    permission: PermissionV1.Ruleset
  }) => Effect.Effect<void, BusyError>
  readonly setRevert: (input: {
    sessionID: SessionID
    revert: Info["revert"]
    summary: Info["summary"]
  }) => Effect.Effect<void, BusyError>
  readonly clearRevert: (sessionID: SessionID) => Effect.Effect<void, BusyError>
  readonly setSummary: (input: { sessionID: SessionID; summary: Info["summary"] }) => Effect.Effect<void, BusyError>
  readonly setShare: (input: { sessionID: SessionID; share: Info["share"] }) => Effect.Effect<void, BusyError>
  readonly setWorkspace: (input: {
    sessionID: SessionID
    workspaceID: Info["workspaceID"]
  }) => Effect.Effect<void, BusyError>
  readonly diff: (sessionID: SessionID) => Effect.Effect<Snapshot.FileDiff[]>
  readonly messages: (input: { sessionID: SessionID; limit?: number }) => Effect.Effect<SessionV1.WithParts[], NotFound>
  readonly children: (parentID: SessionID) => Effect.Effect<Info[]>
  readonly remove: (sessionID: SessionID) => Effect.Effect<void, NotFound | BusyError | Turn.SessionTreeBusyError>
  readonly updateMessage: <T extends SessionV1.Info>(msg: T) => Effect.Effect<T>
  readonly finalizeMessage: (input: {
    info: SessionV1.Assistant
    parts: readonly SessionV1.Part[]
  }) => Effect.Effect<SessionV1.WithParts>
  readonly updateMessageWithParts: (input: {
    info: SessionV1.Info
    parts: readonly SessionV1.Part[]
    admission?: "interactive"
    occurrenceSource?: {
      messageID: MessageID
      provenance: "compaction_replay" | "fork_clone"
      required?: boolean
    }
    historicalSources?: readonly {
      partID: PartID
      sourceSessionID: SessionID
      sourceAssistantMessageID: MessageID
      sourcePartID: PartID
    }[]
  }) => Effect.Effect<SessionV1.WithParts>
  readonly removeMessage: (input: { sessionID: SessionID; messageID: MessageID }) => Effect.Effect<MessageID, BusyError>
  readonly removePart: (input: {
    sessionID: SessionID
    messageID: MessageID
    partID: PartID
  }) => Effect.Effect<PartID, BusyError>
  readonly removeTranscript: (input: {
    sessionID: SessionID
    messageIDs: readonly MessageID[]
    parts: readonly { messageID: MessageID; partID: PartID }[]
    clearRevert?: { timeUpdated: number }
  }) => Effect.Effect<void, BusyError>
  readonly getPart: (input: {
    sessionID: SessionID
    messageID: MessageID
    partID: PartID
  }) => Effect.Effect<SessionV1.Part | undefined>
  readonly updatePart: <T extends SessionV1.Part>(part: T) => Effect.Effect<T>
  readonly updatePartDelta: (input: {
    sessionID: SessionID
    messageID: MessageID
    partID: PartID
    field: string
    delta: string
  }) => Effect.Effect<void>
  /** Finds the first message matching the predicate, searching newest-first. */
  readonly findMessage: (
    sessionID: SessionID,
    predicate: (msg: SessionV1.WithParts) => boolean,
  ) => Effect.Effect<Option.Option<SessionV1.WithParts>, NotFound>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Session") {}

export const use = serviceUse(Service)

export type NewSessionInput = {
  title?: string
  agent?: string
  model?: Schema.Schema.Type<typeof Model>
  parentID?: SessionID
  workspaceID?: WorkspaceV2.ID
  metadata?: typeof Metadata.Type
  permission?: PermissionV1.Ruleset
}

export type ForkStartBasis = {
  sourceSessionID: SessionID
  sourceEventSequence: number
  cutoffMessageID?: MessageID
}

export type RootStartPlan = {
  readonly session: Info
  readonly events: readonly EventV2.PreparedEvent<EventV2.Definition>[]
}

export type ChildStartInput = {
  readonly childSessionID: SessionID
  readonly childTurnID: Turn.ID
  readonly childInputID: Turn.InputID
  readonly parentSessionID: SessionID
  readonly parentTurnID: Turn.ID
  readonly parentTaskPartID: PartID
  readonly parentModelMessageID: MessageID
  readonly delegatedCapability: Record<string, unknown>
  readonly depthLimit: number
  readonly limits: Turn.Limits
  readonly envelope: Record<string, unknown>
  readonly policyBasis: Record<string, unknown>
  readonly timeAdmitted: number
  readonly session: Omit<NewSessionInput, "parentID">
  readonly message: SessionV1.WithParts
}

function childAdmission(input: ChildStartInput): TurnLifecycle.DelegatedAdmission {
  return {
    kind: "delegated_task",
    turnID: input.childTurnID,
    sessionID: input.childSessionID,
    inputID: input.childInputID,
    messageID: input.message.info.id,
    limits: input.limits,
    envelope: input.envelope,
    policyBasis: input.policyBasis,
    delegatedCapability: input.delegatedCapability,
    parentTurnID: input.parentTurnID,
    parentTaskPartID: input.parentTaskPartID,
    parentModelMessageID: input.parentModelMessageID,
    depthLimit: input.depthLimit,
    timeAdmitted: input.timeAdmitted,
  }
}

export type Patch = Omit<Partial<Info>, "time" | "share" | "summary" | "revert" | "permission"> & {
  time?: Partial<Info["time"]>
  share?: Partial<NonNullable<Info["share"]>> | null
  summary?: Info["summary"] | null
  revert?: Info["revert"] | null
  permission?: Info["permission"] | null
}

const layer: Layer.Layer<
  Service,
  never,
  RuntimeFlags.Service | Database.Service | EventV2Bridge.Service | SessionRunState.Service
> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    const runState = yield* SessionRunState.Service
    const flags = yield* RuntimeFlags.Service
    const patchLocks = KeyedMutex.makeUnsafe<SessionID>()

    const prepareNext = Effect.fn("Session.prepareNext")(function* (
      input: NewSessionInput & {
        id?: SessionID
        directory: string
        path?: string
      },
    ) {
      const ctx = yield* InstanceState.context
      return {
        id: SessionID.descending(input.id),
        slug: Slug.create(),
        version: InstallationVersion,
        projectID: ctx.project.id,
        directory: input.directory,
        path: input.path,
        workspaceID: input.workspaceID,
        parentID: input.parentID,
        title: input.title ?? (input.parentID ? childTitlePrefix : parentTitlePrefix) + new Date().toISOString(),
        agent: input.agent,
        model: input.model,
        metadata: input.metadata,
        permission: input.permission ? [...input.permission] : undefined,
        cost: 0,
        tokens: EmptyTokens,
        time: {
          created: Date.now(),
          updated: Date.now(),
        },
      } satisfies Info
    })

    const get = Effect.fn("Session.get")(function* (id: SessionID) {
      const row = yield* db.select().from(SessionTable).where(eq(SessionTable.id, id)).get().pipe(Effect.orDie)
      if (!row) return yield* Effect.fail(new NotFoundError({ message: `Session not found: ${id}` }))
      return fromRow(row)
    })

    const list = Effect.fn("Session.list")(function* (input?: ListInput) {
      const ctx = yield* InstanceState.context
      return yield* listByProject(db, {
        projectID: ctx.project.id,
        experimentalWorkspaces: flags.experimentalWorkspaces,
        ...input,
      })
    })

    const listGlobal = Effect.fn("Session.listGlobal")(function* (input?: GlobalListInput) {
      const conditions: SQL[] = []
      if (input?.directory) conditions.push(eq(SessionTable.directory, input.directory))
      if (input?.roots) conditions.push(isNull(SessionTable.parent_id))
      if (input?.start) conditions.push(gte(SessionTable.time_updated, input.start))
      if (input?.cursor) conditions.push(lt(SessionTable.time_updated, input.cursor))
      if (input?.search) conditions.push(like(SessionTable.title, `%${input.search}%`))
      if (!input?.archived) conditions.push(isNull(SessionTable.time_archived))

      const query =
        conditions.length > 0
          ? db
              .select()
              .from(SessionTable)
              .where(and(...conditions))
          : db.select().from(SessionTable)
      const rows = yield* query
        .orderBy(desc(SessionTable.time_updated), desc(SessionTable.id))
        .limit(input?.limit ?? 100)
        .all()
        .pipe(Effect.orDie)
      const ids = [...new Set(rows.map((row) => row.project_id))]
      const projects = new Map<string, ProjectInfo>()
      if (ids.length > 0) {
        const items = yield* db
          .select({ id: ProjectTable.id, name: ProjectTable.name, worktree: ProjectTable.worktree })
          .from(ProjectTable)
          .where(inArray(ProjectTable.id, ids))
          .all()
          .pipe(Effect.orDie)
        for (const item of items) {
          projects.set(item.id, {
            id: item.id,
            name: item.name ?? undefined,
            worktree: item.worktree,
          })
        }
      }
      return rows.map((row) => ({ ...fromRow(row), project: projects.get(row.project_id) ?? null }))
    })

    const children = Effect.fn("Session.children")(function* (parentID: SessionID) {
      const rows = yield* db
        .select()
        .from(SessionTable)
        .where(and(eq(SessionTable.parent_id, parentID)))
        .all()
        .pipe(Effect.orDie)
      return rows.map(fromRow)
    })

    const removalTree = Effect.fn("Session.removalTree")(function* (sessionID: SessionID) {
      const root = yield* get(sessionID)
      const rows = yield* db.select().from(SessionTable).all().pipe(Effect.orDie)
      const selected = new Map<SessionID, { readonly info: Info; readonly depth: number }>([
        [root.id, { info: root, depth: 0 }],
      ])
      let changed = true
      while (changed) {
        const size = selected.size
        rows.forEach((row) => {
          if (!row.parent_id || selected.has(row.id)) return
          const parent = selected.get(row.parent_id)
          if (parent) selected.set(row.id, { info: fromRow(row), depth: parent.depth + 1 })
        })
        changed = selected.size !== size
      }
      return [...selected.values()].sort(
        (left, right) => right.depth - left.depth || left.info.id.localeCompare(right.info.id),
      )
    })

    const remove: Interface["remove"] = Effect.fn("Session.remove")(function* (sessionID) {
      const tree = yield* removalTree(sessionID)
      const sessionIDs = tree.map((entry) => entry.info.id)
      const deletion = Effect.forEach(sessionIDs, runState.assertNotBusy, { discard: true }).pipe(
        Effect.andThen(
          runState.closeMany(sessionIDs, (markCommitted) =>
            events.removeMany(
              sessionIDs,
              (tx) =>
                TurnLifecycle.deleteSessionTree(tx, {
                  rootSessionID: sessionID,
                  sessionIDs,
                  timeDeleted: Date.now(),
                }),
              tree.map((entry) => ({
                definition: SessionV1.Event.Deleted,
                data: { sessionID: entry.info.id, info: entry.info },
              })),
              {
                onCommitted: markCommitted.pipe(Effect.andThen(runState.discard(sessionIDs))),
                continueVisibilityOnInterrupt: true,
              },
            ),
          ),
        ),
      )
      yield* deletion.pipe(
        Effect.catchTag("SessionBusyError", (error) =>
          db
            .transaction((tx) =>
              Effect.gen(function* () {
                const activeTurnIDs = yield* TurnLifecycle.activeIDs(tx, sessionIDs)
                if (activeTurnIDs.length > 0) {
                  return yield* new Turn.SessionTreeBusyError({ sessionID, activeTurnIDs })
                }
                return yield* error
              }),
            )
            .pipe(Effect.catchTag("SqlError", (cause) => Effect.die(cause))),
        ),
        Effect.catchTag("SessionTreeChangedError", () => Effect.fail(new BusyError({ sessionID }))),
        Effect.catchTag("TurnIntegrityError", (error) => Effect.die(error)),
      )
    })

    function prepareMessageUpdate<T extends SessionV1.Info>(tx: EventV2.Transaction, msg: T) {
      return Effect.gen(function* () {
        const row = yield* tx.select().from(MessageTable).where(eq(MessageTable.id, msg.id)).get().pipe(Effect.orDie)
        if (row && row.session_id !== msg.sessionID) {
          return yield* Effect.die(new InvalidCausalSourceError({ reason: "wrong_session" }))
        }
        const presentation = yield* tx
          .select({ messageID: LearnerOccurrencePresentationTable.message_id })
          .from(LearnerOccurrencePresentationTable)
          .where(eq(LearnerOccurrencePresentationTable.message_id, msg.id))
          .get()
          .pipe(Effect.orDie)
        if (presentation) {
          yield* Occurrence.assertPresentationUnchanged(tx, {
            sessionID: msg.sessionID,
            messageID: msg.id,
          }).pipe(Effect.orDie)
          if (row && exactStored(row, msg)) return
          return yield* Effect.die(new InvalidCausalSourceError({ reason: "changed_presentation" }))
        }
        const historical = yield* tx
          .select({ messageID: SessionHistoricalMessagePresentationTable.message_id })
          .from(SessionHistoricalMessagePresentationTable)
          .where(eq(SessionHistoricalMessagePresentationTable.message_id, msg.id))
          .get()
          .pipe(Effect.orDie)
        if (historical) {
          if (row && exactStored(row, msg)) return
          return yield* Effect.die(new InvalidCausalSourceError({ reason: "changed_presentation" }))
        }
        return {
          definition: SessionV1.Event.MessageUpdated,
          data: { sessionID: msg.sessionID, info: msg },
        } satisfies EventV2.PreparedEvent<typeof SessionV1.Event.MessageUpdated>
      })
    }

    const updateMessageUnlocked = <T extends SessionV1.Info>(msg: T): Effect.Effect<T> =>
      events
        .transaction<T, EventV2.Definition>((tx) =>
          prepareMessageUpdate(tx, msg).pipe(Effect.map((event) => (event ? { result: msg, event } : { result: msg }))),
        )
        .pipe(
          Effect.map((result) => result.result),
          Effect.withSpan("Session.updateMessage"),
        )

    const updateMessage: Interface["updateMessage"] = (msg) =>
      runState.shared(msg.sessionID, updateMessageUnlocked(msg)).pipe(Effect.orDie)

    function preparePartUpdate<T extends SessionV1.Part>(tx: EventV2.Transaction, part: T, time: number) {
      return Effect.gen(function* () {
        const row = yield* tx.select().from(PartTable).where(eq(PartTable.id, part.id)).get().pipe(Effect.orDie)
        if (row && (row.session_id !== part.sessionID || row.message_id !== part.messageID)) {
          return yield* Effect.die(new SettledPartImmutableError({ partID: part.id }))
        }
        const exact = row ? exactStored(row, part) : false
        const invocation = yield* lookupPhysicalInvocationByPart(tx, part.id)
        if (invocation) {
          if (exact) return
          return yield* Effect.die(new SettledPartImmutableError({ partID: part.id }))
        }
        const presentation = yield* tx
          .select({ messageID: LearnerOccurrencePresentationTable.message_id })
          .from(LearnerOccurrencePresentationTable)
          .where(eq(LearnerOccurrencePresentationTable.message_id, part.messageID))
          .get()
          .pipe(Effect.orDie)
        if (presentation) {
          yield* Occurrence.assertPresentationUnchanged(tx, {
            sessionID: part.sessionID,
            messageID: part.messageID,
          }).pipe(Effect.orDie)
          if (exact) return
          return yield* Effect.die(new InvalidCausalSourceError({ reason: "changed_presentation" }))
        }
        const sessionHistorical = yield* tx
          .select({ partID: SessionHistoricalPartPresentationTable.part_id })
          .from(SessionHistoricalPartPresentationTable)
          .where(eq(SessionHistoricalPartPresentationTable.part_id, part.id))
          .get()
          .pipe(Effect.orDie)
        if (sessionHistorical) {
          if (exact) return
          return yield* Effect.die(new HistoricalPresentationConflictError({ partID: part.id }))
        }
        const historical = yield* tx
          .select({ partID: HistoricalLearningToolPresentationTable.part_id })
          .from(HistoricalLearningToolPresentationTable)
          .where(eq(HistoricalLearningToolPresentationTable.part_id, part.id))
          .get()
          .pipe(Effect.orDie)
        if (historical) {
          if (exact) return
          return yield* Effect.die(new HistoricalPresentationConflictError({ partID: part.id }))
        }
        return {
          definition: SessionV1.Event.PartUpdated,
          data: { sessionID: part.sessionID, part: structuredClone(part), time },
        } satisfies EventV2.PreparedEvent<typeof SessionV1.Event.PartUpdated>
      })
    }

    const updatePartUnlocked = <T extends SessionV1.Part>(part: T): Effect.Effect<T> =>
      events
        .transaction<T, EventV2.Definition>((tx) =>
          preparePartUpdate(tx, part, Date.now()).pipe(
            Effect.map((event) => (event ? { result: part, event } : { result: part })),
          ),
        )
        .pipe(
          Effect.map((result) => result.result),
          Effect.withSpan("Session.updatePart"),
        )

    const updatePart: Interface["updatePart"] = (part) =>
      runState.shared(part.sessionID, updatePartUnlocked(part)).pipe(Effect.orDie)

    const finalizeMessageUnlocked = Effect.fn("Session.finalizeMessageUnlocked")(function* (
      input: Parameters<Interface["finalizeMessage"]>[0],
    ) {
      if (
        new Set(input.parts.map((part) => part.id)).size !== input.parts.length ||
        input.parts.some((part) => part.sessionID !== input.info.sessionID || part.messageID !== input.info.id)
      ) {
        return yield* Effect.die(new InvalidCausalSourceError({ reason: "wrong_session" }))
      }
      const result = { info: input.info, parts: [...input.parts] } satisfies SessionV1.WithParts
      return yield* events
        .transaction<SessionV1.WithParts, EventV2.Definition>((tx) =>
          Effect.gen(function* () {
            const time = Date.now()
            const partEvents = (yield* Effect.forEach(input.parts, (part) => preparePartUpdate(tx, part, time))).filter(
              (event): event is NonNullable<typeof event> => event !== undefined,
            )
            const messageEvent = yield* prepareMessageUpdate(tx, input.info)
            const prepared: EventV2.PreparedEvent<EventV2.Definition>[] = [
              ...partEvents,
              ...(messageEvent ? [messageEvent] : []),
            ]
            if (prepared.length === 0) return { result }
            return { result, events: prepared }
          }),
        )
        .pipe(
          Effect.map((committed) => committed.result),
          Effect.withSpan("Session.finalizeMessage"),
        )
    })

    const finalizeMessage: Interface["finalizeMessage"] = (input) =>
      runState.shared(input.info.sessionID, finalizeMessageUnlocked(input)).pipe(Effect.orDie)

    const updateMessageWithPartsUnlocked = Effect.fn("Session.updateMessageWithPartsUnlocked")(function* (
      input: Parameters<Interface["updateMessageWithParts"]>[0],
    ) {
      if (input.admission && input.occurrenceSource) {
        return yield* Effect.die(new InvalidCausalSourceError({ reason: "wrong_occurrence" }))
      }
      if (input.parts.some((part) => part.sessionID !== input.info.sessionID || part.messageID !== input.info.id)) {
        return yield* Effect.die(new InvalidCausalSourceError({ reason: "wrong_session" }))
      }
      const time = Date.now()
      const committed = yield* events.transaction<SessionV1.WithParts, EventV2.Definition>((tx) =>
        Effect.gen(function* () {
          const storedMessage = yield* tx
            .select()
            .from(MessageTable)
            .where(eq(MessageTable.id, input.info.id))
            .get()
            .pipe(Effect.orDie)
          if (storedMessage && !exactStored(storedMessage, input.info)) {
            return yield* Effect.die(new InvalidCausalSourceError({ reason: "changed_presentation" }))
          }
          const storedParts = yield* Effect.forEach(input.parts, (part) =>
            tx.select().from(PartTable).where(eq(PartTable.id, part.id)).get().pipe(Effect.orDie),
          )
          const invocations = yield* Effect.forEach(input.parts, (part) => lookupPhysicalInvocationByPart(tx, part.id))
          if (invocations.some((invocation, index) => invocation && !storedParts[index])) {
            return yield* Effect.die(new SettledPartImmutableError({ partID: input.parts[0]?.id ?? "unknown" }))
          }
          if (storedParts.some((part, index) => part && !exactStored(part, input.parts[index]))) {
            return yield* Effect.die(new SettledPartImmutableError({ partID: input.parts[0]?.id ?? "unknown" }))
          }

          const recordProvenance = () =>
            Effect.gen(function* () {
              if (input.admission) {
                yield* Occurrence.admit(tx, {
                  admission: LearnerAdmission.interactive(),
                  sessionID: input.info.sessionID,
                  messageID: input.info.id,
                  timeAdmitted: time,
                }).pipe(Effect.orDie)
              }
              if (input.occurrenceSource) {
                yield* Occurrence.copyPresentation(tx, {
                  sourceMessageID: input.occurrenceSource.messageID,
                  sessionID: input.info.sessionID,
                  messageID: input.info.id,
                  provenance: input.occurrenceSource.provenance,
                }).pipe(
                  Effect.catchTag("LearningCommand.InvalidCausalSourceError", (error) =>
                    error.reason === "missing_presentation" && !input.occurrenceSource?.required
                      ? Effect.void
                      : Effect.fail(error),
                  ),
                  Effect.orDie,
                )
              }
              yield* Effect.forEach(
                input.historicalSources ?? [],
                (source) =>
                  Effect.gen(function* () {
                    const [invocation, settlement, historical] = yield* Effect.all([
                      lookupPhysicalInvocationByPart(tx, source.sourcePartID),
                      exactSettlement(tx, source.sourcePartID),
                      tx
                        .select()
                        .from(HistoricalLearningToolPresentationTable)
                        .where(eq(HistoricalLearningToolPresentationTable.part_id, source.sourcePartID))
                        .get()
                        .pipe(Effect.orDie),
                    ])
                    if (invocation && historical) {
                      return yield* new HistoricalPresentationConflictError({ partID: source.partID })
                    }
                    if (!settlement && !historical) return
                    if (
                      invocation &&
                      (invocation.session_id !== source.sourceSessionID ||
                        invocation.assistant_message_id !== source.sourceAssistantMessageID)
                    ) {
                      return yield* new HistoricalPresentationConflictError({ partID: source.partID })
                    }
                    if (
                      historical &&
                      (historical.session_id !== source.sourceSessionID ||
                        historical.assistant_message_id !== source.sourceAssistantMessageID)
                    ) {
                      return yield* new HistoricalPresentationConflictError({ partID: source.partID })
                    }
                    yield* Occurrence.recordHistoricalToolPresentation(tx, {
                      sessionID: input.info.sessionID,
                      assistantMessageID: input.info.id,
                      partID: source.partID,
                      sourceSessionID: historical?.source_session_id ?? source.sourceSessionID,
                      sourceAssistantMessageID:
                        historical?.source_assistant_message_id ?? source.sourceAssistantMessageID,
                      sourcePartID: historical?.source_part_id ?? source.sourcePartID,
                      timeCreated: time,
                    })
                  }).pipe(Effect.orDie),
                { discard: true },
              )
            })

          const message = {
            definition: SessionV1.Event.MessageUpdated,
            data: { sessionID: input.info.sessionID, info: input.info },
            ...(input.parts.length === 0 ? { options: { commit: () => recordProvenance() } } : {}),
          }
          const parts = input.parts.map((part, index) => ({
            definition: SessionV1.Event.PartUpdated,
            data: { sessionID: input.info.sessionID, part: structuredClone(part), time },
            ...(index === input.parts.length - 1 ? { options: { commit: () => recordProvenance() } } : {}),
          }))
          return { result: { info: input.info, parts: [...input.parts] }, events: [message, ...parts] }
        }),
      )
      return committed.result
    })

    const updateMessageWithParts: Interface["updateMessageWithParts"] = (input) =>
      runState.shared(input.info.sessionID, updateMessageWithPartsUnlocked(input)).pipe(Effect.orDie)

    const getPart: Interface["getPart"] = Effect.fn("Session.getPart")(function* (input) {
      const row = yield* db
        .select()
        .from(PartTable)
        .where(
          and(
            eq(PartTable.session_id, input.sessionID),
            eq(PartTable.message_id, input.messageID),
            eq(PartTable.id, input.partID),
          ),
        )
        .get()
        .pipe(Effect.orDie)
      if (!row) return
      return {
        ...row.data,
        id: row.id,
        sessionID: row.session_id,
        messageID: row.message_id,
      } as SessionV1.Part
    })

    const prepareRootStart: Interface["prepareRootStart"] = Effect.fn("Session.prepareRootStart")(
      function* (tx, input) {
        const existing = yield* tx
          .select()
          .from(SessionTable)
          .where(eq(SessionTable.id, input.targetSessionID))
          .get()
          .pipe(Effect.orDie)
        if (existing) return { session: fromRow(existing), events: [] }
        if (!input.session && !input.fork) {
          return yield* new NotFoundError({ message: `Session not found: ${input.targetSessionID}` })
        }
        if (input.fork && input.session?.parentID) {
          return yield* new Turn.AdmissionConflictError({ turnID: input.turnID })
        }

        const ctx = yield* InstanceState.context
        const workspaceID = yield* InstanceState.workspaceID
        const source = input.fork
          ? yield* tx
              .select()
              .from(SessionTable)
              .where(eq(SessionTable.id, input.fork.sourceSessionID))
              .get()
              .pipe(Effect.orDie)
          : undefined
        if (input.fork && (!source || source.project_id !== ctx.project.id)) {
          return yield* new NotFoundError({ message: `Session not found: ${input.fork.sourceSessionID}` })
        }
        if (input.fork && source) {
          const frontier = yield* tx
            .select({ sequence: EventSequenceTable.seq })
            .from(EventSequenceTable)
            .where(eq(EventSequenceTable.aggregate_id, input.fork.sourceSessionID))
            .get()
            .pipe(Effect.orDie)
          if (frontier?.sequence !== input.fork.sourceEventSequence) {
            return yield* new Turn.AdmissionConflictError({ turnID: input.turnID })
          }
          const active = yield* TurnLifecycle.active(tx, input.fork.sourceSessionID)
          if (active) return yield* new BusyError({ sessionID: input.fork.sourceSessionID })
        }

        const sourceInfo = source ? fromRow(source) : undefined
        const session = yield* prepareNext({
          id: input.targetSessionID,
          directory: ctx.directory,
          path: sessionPath(ctx.worktree, ctx.directory),
          title: input.session?.title ?? (sourceInfo ? getForkedTitle(sourceInfo.title) : undefined),
          agent: input.session?.agent,
          model: input.session?.model,
          parentID: input.session?.parentID,
          workspaceID: input.session?.workspaceID ?? sourceInfo?.workspaceID ?? workspaceID,
          metadata:
            input.session?.metadata ?? (sourceInfo?.metadata ? structuredClone(sourceInfo.metadata) : undefined),
          permission: input.session?.permission,
        })
        const prepared: EventV2.PreparedEvent<EventV2.Definition>[] = [
          {
            definition: SessionV1.Event.Created,
            data: { sessionID: session.id, info: session },
          },
        ]
        if (!input.fork || !sourceInfo) return { session, events: prepared }

        const messageRows = yield* tx
          .select()
          .from(MessageTable)
          .where(eq(MessageTable.session_id, input.fork.sourceSessionID))
          .orderBy(asc(MessageTable.time_created), asc(MessageTable.id))
          .all()
          .pipe(Effect.orDie)
        const cutoff = input.fork.cutoffMessageID
          ? messageRows.findIndex((message) => message.id === input.fork?.cutoffMessageID)
          : messageRows.length
        if (cutoff < 0) return yield* new Turn.AdmissionConflictError({ turnID: input.turnID })
        const selectedRows = messageRows.slice(0, cutoff)
        const selectedIDs = selectedRows.map((message) => message.id)
        const partRows =
          selectedIDs.length === 0
            ? []
            : yield* tx
                .select()
                .from(PartTable)
                .where(inArray(PartTable.message_id, selectedIDs))
                .orderBy(asc(PartTable.time_created), asc(PartTable.id))
                .all()
                .pipe(Effect.orDie)
        const sourceParts = new Map<MessageID, (typeof PartTable.$inferSelect)[]>()
        partRows.forEach((part) => {
          const current = sourceParts.get(part.message_id)
          if (current) current.push(part)
          else sourceParts.set(part.message_id, [part])
        })
        const occurrenceMessages =
          selectedIDs.length === 0
            ? new Set<MessageID>()
            : new Set(
                (yield* tx
                  .select({ messageID: LearnerOccurrencePresentationTable.message_id })
                  .from(LearnerOccurrencePresentationTable)
                  .where(inArray(LearnerOccurrencePresentationTable.message_id, selectedIDs))
                  .all()
                  .pipe(Effect.orDie)).map((row) => row.messageID),
              )
        const idMap = new Map<MessageID, MessageID>()
        for (const row of selectedRows) {
          const sourceMessage = {
            ...row.data,
            id: row.id,
            sessionID: row.session_id,
          } as SessionV1.Info
          const messageID = MessageID.ascending()
          idMap.set(sourceMessage.id, messageID)
          const parentID =
            sourceMessage.role === "assistant" && sourceMessage.parentID ? idMap.get(sourceMessage.parentID) : undefined
          const message: SessionV1.Info = {
            ...sourceMessage,
            sessionID: session.id,
            id: messageID,
            ...(parentID ? { parentID } : {}),
          }
          const sourceMessageParts = sourceParts.get(sourceMessage.id) ?? []
          const parts = sourceMessageParts.map((part) => {
            const cloned = {
              ...part.data,
              id: PartID.ascending(),
              messageID,
              sessionID: session.id,
            } as SessionV1.Part
            if (cloned.type === "compaction" && cloned.tail_start_id) {
              cloned.tail_start_id = idMap.get(cloned.tail_start_id)
            }
            return cloned
          })
          const recordProvenance = () =>
            Effect.gen(function* () {
              yield* tx
                .insert(SessionHistoricalMessagePresentationTable)
                .values({
                  message_id: messageID,
                  session_id: session.id,
                  source_session_id: sourceInfo.id,
                  source_message_id: sourceMessage.id,
                  source_event_sequence: input.fork!.sourceEventSequence,
                  time_created: session.time.created,
                })
                .run()
                .pipe(Effect.orDie)
              yield* Effect.forEach(
                sourceMessageParts,
                (sourcePart, index) => {
                  const part = parts[index]
                  if (!part) return Effect.void
                  return tx
                    .insert(SessionHistoricalPartPresentationTable)
                    .values({
                      part_id: part.id,
                      message_id: messageID,
                      session_id: session.id,
                      source_session_id: sourceInfo.id,
                      source_message_id: sourceMessage.id,
                      source_part_id: sourcePart.id,
                      time_created: session.time.created,
                    })
                    .run()
                    .pipe(Effect.orDie)
                },
                { discard: true },
              )
              if (sourceMessage.role === "user") {
                if (occurrenceMessages.has(sourceMessage.id)) {
                  yield* Occurrence.copyPresentation(tx, {
                    sourceMessageID: sourceMessage.id,
                    sessionID: session.id,
                    messageID,
                    provenance: "fork_clone",
                  })
                }
                yield* TurnLifecycle.copyHistoricalInputPresentation(tx, {
                  sessionID: session.id,
                  messageID,
                  sourceSessionID: sourceInfo.id,
                  sourceMessageID: sourceMessage.id,
                  timeCreated: session.time.created,
                })
              }
              if (sourceMessage.role === "assistant") {
                yield* TurnLifecycle.copyHistoricalModelPresentation(tx, {
                  sessionID: session.id,
                  assistantMessageID: messageID,
                  sourceSessionID: sourceInfo.id,
                  sourceAssistantMessageID: sourceMessage.id,
                  timeCreated: session.time.created,
                })
              }
              yield* Effect.forEach(
                sourceMessageParts,
                (sourcePart, index) => {
                  const part = parts[index]
                  if (!part || sourcePart.data.type !== "tool") return Effect.void
                  return Effect.gen(function* () {
                    const [invocation, settlement, historical] = yield* Effect.all([
                      lookupPhysicalInvocationByPart(tx, sourcePart.id),
                      exactSettlement(tx, sourcePart.id),
                      tx
                        .select()
                        .from(HistoricalLearningToolPresentationTable)
                        .where(eq(HistoricalLearningToolPresentationTable.part_id, sourcePart.id))
                        .get()
                        .pipe(Effect.orDie),
                    ])
                    if (invocation && historical) {
                      return yield* new HistoricalPresentationConflictError({ partID: part.id })
                    }
                    if (settlement || historical) {
                      yield* Occurrence.recordHistoricalToolPresentation(tx, {
                        sessionID: session.id,
                        assistantMessageID: messageID,
                        partID: part.id,
                        sourceSessionID: historical?.source_session_id ?? sourceInfo.id,
                        sourceAssistantMessageID: historical?.source_assistant_message_id ?? sourceMessage.id,
                        sourcePartID: historical?.source_part_id ?? sourcePart.id,
                        timeCreated: session.time.created,
                      })
                    }
                    yield* TurnLifecycle.copyHistoricalToolPresentation(tx, {
                      sessionID: session.id,
                      assistantMessageID: messageID,
                      partID: part.id,
                      sourceSessionID: sourceInfo.id,
                      sourcePartID: sourcePart.id,
                      timeCreated: session.time.created,
                    })
                  })
                },
                { discard: true },
              )
            }).pipe(Effect.orDie)
          prepared.push({
            definition: SessionV1.Event.MessageUpdated,
            data: { sessionID: session.id, info: message },
            ...(parts.length === 0 ? { options: { commit: recordProvenance } } : {}),
          })
          parts.forEach((part, index) => {
            prepared.push({
              definition: SessionV1.Event.PartUpdated,
              data: { sessionID: session.id, part, time: session.time.created },
              ...(index === parts.length - 1 ? { options: { commit: recordProvenance } } : {}),
            })
          })
        }
        return { session, events: prepared }
      },
    )

    const prepareChildStart: Interface["prepareChildStart"] = Effect.fn("Session.prepareChildStart")(function* (input) {
      if (
        input.message.info.role !== "user" ||
        input.message.info.sessionID !== input.childSessionID ||
        input.message.info.time.created !== input.timeAdmitted ||
        new Set(input.message.parts.map((part) => part.id)).size !== input.message.parts.length ||
        input.message.parts.some(
          (part) => part.sessionID !== input.childSessionID || part.messageID !== input.message.info.id,
        )
      ) {
        return yield* new Turn.IntegrityError({
          turnID: input.childTurnID,
          reason: "Delegated child presentation does not belong to the requested child Session and User Message",
        })
      }

      let admitted: TurnLifecycle.Admitted | undefined
      yield* events.transaction((tx) =>
        Effect.gen(function* () {
          const stored = yield* TurnLifecycle.lookup(tx, input.childTurnID)
          if (stored.type === "source_unavailable") {
            return yield* TurnLifecycle.sourceUnavailableError(stored)
          }
          if (stored.type === "available") {
            admitted = yield* TurnLifecycle.admit(tx, childAdmission(input))
            return { result: undefined }
          }

          const delegation = yield* TurnLifecycle.validateDelegation(tx, childAdmission(input))
          if (delegation.sessionID !== input.parentSessionID) {
            return yield* new Turn.SessionMismatchError({
              sessionID: input.parentSessionID,
              turnID: input.parentTurnID,
            })
          }
          const parentRow = yield* tx
            .select()
            .from(SessionTable)
            .where(eq(SessionTable.id, input.parentSessionID))
            .get()
            .pipe(Effect.orDie)
          if (!parentRow) {
            return yield* new NotFoundError({ message: `Session not found: ${input.parentSessionID}` })
          }

          const existing = yield* tx
            .select()
            .from(SessionTable)
            .where(eq(SessionTable.id, input.childSessionID))
            .get()
            .pipe(Effect.orDie)
          if (
            existing &&
            (existing.parent_id !== input.parentSessionID ||
              existing.project_id !== parentRow.project_id ||
              existing.directory !== parentRow.directory)
          ) {
            return yield* new Turn.AdmissionConflictError({ turnID: input.childTurnID })
          }
          if (existing) {
            const delegatedHistory = yield* tx
              .select({ id: TurnChildLineageTable.child_turn_id })
              .from(TurnChildLineageTable)
              .where(
                and(
                  eq(TurnChildLineageTable.child_session_id, input.childSessionID),
                  eq(TurnChildLineageTable.parent_session_id, input.parentSessionID),
                ),
              )
              .get()
              .pipe(Effect.orDie)
            if (!delegatedHistory) {
              return yield* new Turn.AdmissionConflictError({ turnID: input.childTurnID })
            }
            const active = yield* TurnLifecycle.active(tx, input.childSessionID)
            if (active) {
              return yield* new Turn.AlreadyRunningError({
                sessionID: input.childSessionID,
                activeTurnID: active.id,
              })
            }
          }

          const reusedPresentation = yield* tx
            .select({ id: MessageTable.id })
            .from(MessageTable)
            .where(eq(MessageTable.id, input.message.info.id))
            .get()
            .pipe(Effect.orDie)
          if (reusedPresentation) return yield* new Turn.AdmissionConflictError({ turnID: input.childTurnID })
          if (input.message.parts.length > 0) {
            const reusedPart = yield* tx
              .select({ id: PartTable.id })
              .from(PartTable)
              .where(
                inArray(
                  PartTable.id,
                  input.message.parts.map((part) => part.id),
                ),
              )
              .get()
              .pipe(Effect.orDie)
            if (reusedPart) return yield* new Turn.AdmissionConflictError({ turnID: input.childTurnID })
          }

          const current = existing ? fromRow(existing) : undefined
          const child = current
            ? {
                ...current,
                title: input.session.title ?? current.title,
                agent: input.session.agent ?? current.agent,
                model: input.session.model ?? current.model,
                metadata: input.session.metadata ?? current.metadata,
                permission: input.session.permission ? [...input.session.permission] : current.permission,
                time: { ...current.time, updated: Math.max(current.time.updated, input.timeAdmitted) },
              }
            : {
                ...(yield* prepareNext({
                  id: input.childSessionID,
                  directory: parentRow.directory,
                  path: parentRow.path ?? undefined,
                  parentID: input.parentSessionID,
                  title: input.session.title,
                  agent: input.session.agent,
                  model: input.session.model,
                  workspaceID: input.session.workspaceID ?? parentRow.workspace_id ?? undefined,
                  metadata: input.session.metadata,
                  permission: input.session.permission,
                })),
                time: { created: input.timeAdmitted, updated: input.timeAdmitted },
              }
          const sessionEvent: EventV2.PreparedEvent<EventV2.Definition> = current
            ? {
                definition: SessionV1.Event.Updated,
                data: { sessionID: child.id, info: child },
              }
            : {
                definition: SessionV1.Event.Created,
                data: { sessionID: child.id, info: child },
              }
          const commit = () =>
            TurnLifecycle.admit(tx, childAdmission(input)).pipe(
              Effect.tap((result) => Effect.sync(() => (admitted = result))),
              Effect.asVoid,
              Effect.orDie,
            )
          const messageEvents: EventV2.PreparedEvent<EventV2.Definition>[] = [
            {
              definition: SessionV1.Event.MessageUpdated,
              data: { sessionID: input.childSessionID, info: input.message.info },
              ...(input.message.parts.length === 0 ? { options: { commit } } : {}),
            },
            ...input.message.parts.map((part, index) => ({
              definition: SessionV1.Event.PartUpdated,
              data: { sessionID: input.childSessionID, part, time: input.timeAdmitted },
              ...(index === input.message.parts.length - 1 ? { options: { commit } } : {}),
            })),
          ]
          return {
            result: undefined,
            events: [
              sessionEvent,
              ...messageEvents,
              SessionTurnEvents.started(() => {
                if (!admitted) throw new Error(`Delegated child Turn admission did not commit: ${input.childTurnID}`)
                return admitted
              }),
            ],
          }
        }),
      )
      if (!admitted) return yield* Effect.die(`Child Turn ${input.childTurnID} committed without admission`)
      return admitted
    })

    const patchUnlocked = (sessionID: SessionID, info: Patch) =>
      Effect.gen(function* () {
        const current = yield* get(sessionID)
        const next = {
          ...current,
          ...info,
          time: info.time ? { ...current.time, ...info.time } : current.time,
          share: info.share === null ? undefined : info.share ? { ...current.share, ...info.share } : current.share,
          summary: info.summary === null ? undefined : (info.summary ?? current.summary),
          revert: info.revert === null ? undefined : (info.revert ?? current.revert),
          permission: info.permission === null ? undefined : (info.permission ?? current.permission),
        } as Info
        yield* events.publish(SessionV1.Event.Updated, { sessionID, info: next })
      })

    const patch = (sessionID: SessionID, info: Patch) =>
      patchLocks.withLock(sessionID)(runState.shared(sessionID, patchUnlocked(sessionID, info).pipe(Effect.orDie)))

    const touch = Effect.fn("Session.touch")(function* (sessionID: SessionID) {
      yield* patch(sessionID, { time: { updated: Date.now() } })
    })

    const setTitle = Effect.fn("Session.setTitle")((input: { sessionID: SessionID; title: string }) =>
      patch(input.sessionID, { title: input.title }),
    )

    const setTitleIfDefault = Effect.fn("Session.setTitleIfDefault")((input: { sessionID: SessionID; title: string }) =>
      patchLocks.withLock(input.sessionID)(
        runState.shared(
          input.sessionID,
          Effect.gen(function* () {
            const current = yield* get(input.sessionID).pipe(Effect.orDie)
            if (!isDefaultTitle(current.title)) return false
            yield* patchUnlocked(input.sessionID, { title: input.title }).pipe(Effect.orDie)
            return true
          }),
        ),
      ),
    )

    const setArchived = Effect.fn("Session.setArchived")(function* (input: { sessionID: SessionID; time?: number }) {
      yield* patch(input.sessionID, { time: { archived: input.time } })
    })

    const setMetadata = Effect.fn("Session.setMetadata")(function* (input: typeof SetMetadataInput.Type) {
      yield* patch(input.sessionID, { metadata: input.metadata, time: { updated: Date.now() } })
    })

    const setAgentModel = Effect.fn("Session.setAgentModel")(function* (input: {
      sessionID: SessionID
      agent: string
      model: NonNullable<Info["model"]>
      time: number
    }) {
      yield* patch(input.sessionID, {
        agent: input.agent,
        model: input.model,
        time: { updated: input.time },
      })
    })

    const setPermission = Effect.fn("Session.setPermission")(function* (input: {
      sessionID: SessionID
      permission: PermissionV1.Ruleset
    }) {
      yield* patch(input.sessionID, { permission: [...input.permission], time: { updated: Date.now() } })
    })

    const setRevert = Effect.fn("Session.setRevert")(function* (input: {
      sessionID: SessionID
      revert: Info["revert"]
      summary: Info["summary"]
    }) {
      yield* patch(input.sessionID, {
        summary: input.summary,
        time: { updated: Date.now() },
        revert: input.revert,
      })
    })

    const clearRevert = Effect.fn("Session.clearRevert")(function* (sessionID: SessionID) {
      yield* patch(sessionID, { time: { updated: Date.now() }, revert: null })
    })

    const setSummary = Effect.fn("Session.setSummary")(function* (input: {
      sessionID: SessionID
      summary: Info["summary"]
    }) {
      yield* patch(input.sessionID, { time: { updated: Date.now() }, summary: input.summary })
    })

    const setShare = Effect.fn("Session.setShare")(function* (input: { sessionID: SessionID; share: Info["share"] }) {
      yield* patch(input.sessionID, { share: input.share ?? null, time: { updated: Date.now() } })
    })

    const setWorkspace = Effect.fn("Session.setWorkspace")(function* (input: {
      sessionID: SessionID
      workspaceID: Info["workspaceID"]
    }) {
      yield* patch(input.sessionID, { workspaceID: input.workspaceID, time: { updated: Date.now() } })
    })

    const diff = Effect.fn("Session.diff")(function* (sessionID: SessionID) {
      void sessionID
      return [] as Snapshot.FileDiff[]
    })

    const messages: Interface["messages"] = Effect.fn("Session.messages")(function* (input) {
      if (input.limit) {
        return (yield* MessageV2.page({ sessionID: input.sessionID, limit: input.limit }).pipe(
          Effect.provideService(Database.Service, database),
        )).items
      }

      const size = 50
      const result = [] as SessionV1.WithParts[]
      let before: string | undefined
      while (true) {
        const page = yield* MessageV2.page({ sessionID: input.sessionID, limit: size, before }).pipe(
          Effect.provideService(Database.Service, database),
        )
        if (page.items.length === 0) break
        for (let i = page.items.length - 1; i >= 0; i--) {
          const item = page.items[i]
          if (item) result.push(item)
        }
        if (!page.more || !page.cursor) break
        before = page.cursor
      }
      return result.reverse()
    })

    const removeTranscriptUnlocked = Effect.fn("Session.removeTranscriptUnlocked")(function* (
      input: Parameters<Interface["removeTranscript"]>[0],
    ) {
      const current = input.clearRevert ? yield* get(input.sessionID).pipe(Effect.orDie) : undefined
      const sessionUpdate = current
        ? {
            ...current,
            revert: undefined,
            time: {
              ...current.time,
              updated: input.clearRevert?.timeUpdated ?? current.time.updated,
            },
          }
        : undefined
      const messageIDs = input.messageIDs
      const parts = input.parts
      yield* events.transaction<void, EventV2.Definition, BusyError>((tx) =>
        Effect.gen(function* () {
          const messages = yield* Effect.forEach(messageIDs, (messageID) =>
            tx.select().from(MessageTable).where(eq(MessageTable.id, messageID)).get().pipe(Effect.orDie),
          )
          const selectedMessages = messages.filter((message) => message !== undefined)
          if (selectedMessages.some((message) => message.session_id !== input.sessionID)) {
            return yield* Effect.die(new InvalidCausalSourceError({ reason: "wrong_session" }))
          }
          const selectedParts = yield* Effect.forEach(parts, (part) =>
            tx.select().from(PartTable).where(eq(PartTable.id, part.partID)).get().pipe(Effect.orDie),
          )
          if (
            selectedParts.some(
              (part, index) =>
                part && (part.session_id !== input.sessionID || part.message_id !== parts[index]?.messageID),
            )
          ) {
            return yield* Effect.die(new SettledPartImmutableError({ partID: parts[0]?.partID ?? "unknown" }))
          }

          yield* Effect.forEach(
            selectedMessages.filter((message) => message.data.role === "assistant"),
            (message) => assertAssistantDeletable(tx, message.id).pipe(Effect.orDie),
            { discard: true },
          )
          yield* Effect.forEach(
            selectedParts.filter((part) => part !== undefined),
            (part) => assertPartDeletable(tx, part.id).pipe(Effect.orDie),
            { discard: true },
          )
          const partMessageIDs = [...new Set(selectedParts.flatMap((part) => (part ? [part.message_id] : [])))]
          const linkedPartMessage = partMessageIDs.length
            ? yield* tx
                .select({ messageID: LearnerOccurrencePresentationTable.message_id })
                .from(LearnerOccurrencePresentationTable)
                .where(inArray(LearnerOccurrencePresentationTable.message_id, partMessageIDs))
                .get()
                .pipe(Effect.orDie)
            : undefined
          if (linkedPartMessage) {
            return yield* Effect.die(new InvalidCausalSourceError({ reason: "changed_presentation" }))
          }

          yield* TurnLifecycle.prepareTranscriptRemoval(tx, {
            sessionID: input.sessionID,
            messageIDs: selectedMessages.map((message) => message.id),
            partIDs: selectedParts.flatMap((part) => (part ? [part.id] : [])),
            timeRemoved: Date.now(),
          }).pipe(
            Effect.catch((error) =>
              error._tag === "SessionTreeBusyError"
                ? Effect.fail(new BusyError({ sessionID: input.sessionID }))
                : Effect.die(error),
            ),
          )

          yield* Effect.forEach(
            selectedMessages.filter((message) => message.data.role === "assistant"),
            (message) => removeNoEffectInvocationsForAssistant(tx, message.id).pipe(Effect.orDie),
            { discard: true },
          )
          yield* Effect.forEach(
            selectedMessages,
            (message) =>
              removeOccurrencePresentation(tx, { messageID: message.id, timeDeleted: Date.now() }).pipe(Effect.orDie),
            { discard: true },
          )

          const removed = new Set(selectedMessages.map((message) => message.id))
          const existingParts = new Set(selectedParts.flatMap((part) => (part ? [part.id] : [])))
          const prepared = [
            ...messageIDs
              .filter((messageID) => removed.has(messageID))
              .map((messageID) => ({
                definition: SessionV1.Event.MessageRemoved,
                data: { sessionID: input.sessionID, messageID },
              })),
            ...parts
              .filter((part) => existingParts.has(part.partID))
              .map((part) => ({
                definition: SessionV1.Event.PartRemoved,
                data: { sessionID: input.sessionID, messageID: part.messageID, partID: part.partID },
              })),
            ...(sessionUpdate
              ? [
                  {
                    definition: SessionV1.Event.Updated,
                    data: { sessionID: input.sessionID, info: sessionUpdate },
                  },
                ]
              : []),
          ]
          return { result: undefined, events: prepared }
        }),
      )
    })

    const removeTranscript: Interface["removeTranscript"] = Effect.fn("Session.removeTranscript")(function* (input) {
      yield* runState.idle(
        input.sessionID,
        Effect.gen(function* () {
          const messageIDs = [...new Set(input.messageIDs)]
          const removedMessages = new Set(messageIDs)
          const parts = input.parts.filter((part) => !removedMessages.has(part.messageID))
          const mutation = removeTranscriptUnlocked({ ...input, messageIDs, parts })
          yield* input.clearRevert ? patchLocks.withLock(input.sessionID)(mutation) : mutation
        }),
      )
    })

    const removeMessage = Effect.fn("Session.removeMessage")(function* (input: {
      sessionID: SessionID
      messageID: MessageID
    }) {
      yield* removeTranscript({ sessionID: input.sessionID, messageIDs: [input.messageID], parts: [] })
      return input.messageID
    })

    const removePart = Effect.fn("Session.removePart")(function* (input: {
      sessionID: SessionID
      messageID: MessageID
      partID: PartID
    }) {
      yield* removeTranscript({
        sessionID: input.sessionID,
        messageIDs: [],
        parts: [{ messageID: input.messageID, partID: input.partID }],
      })
      return input.partID
    })

    const updatePartDelta = Effect.fnUntraced(function* (input: {
      sessionID: SessionID
      messageID: MessageID
      partID: PartID
      field: string
      delta: string
    }) {
      yield* events.transaction((tx) =>
        Effect.gen(function* () {
          const protectedPart = yield* Effect.all([
            lookupPhysicalInvocationByPart(tx, input.partID).pipe(Effect.map(Boolean)),
            tx
              .select({ messageID: LearnerOccurrencePresentationTable.message_id })
              .from(LearnerOccurrencePresentationTable)
              .where(eq(LearnerOccurrencePresentationTable.message_id, input.messageID))
              .get()
              .pipe(Effect.orDie, Effect.map(Boolean)),
            tx
              .select({ partID: HistoricalLearningToolPresentationTable.part_id })
              .from(HistoricalLearningToolPresentationTable)
              .where(eq(HistoricalLearningToolPresentationTable.part_id, input.partID))
              .get()
              .pipe(Effect.orDie, Effect.map(Boolean)),
            tx
              .select({ partID: SessionHistoricalPartPresentationTable.part_id })
              .from(SessionHistoricalPartPresentationTable)
              .where(eq(SessionHistoricalPartPresentationTable.part_id, input.partID))
              .get()
              .pipe(Effect.orDie, Effect.map(Boolean)),
          ])
          if (protectedPart.some(Boolean)) {
            return yield* Effect.die(new SettledPartImmutableError({ partID: input.partID }))
          }
          return { result: undefined }
        }),
      )
      yield* events.publish(MessageV2.Event.PartDelta, input)
    })

    /** Finds the first message matching the predicate, searching newest-first. */
    const findMessage: Interface["findMessage"] = Effect.fn("Session.findMessage")(function* (sessionID, predicate) {
      const size = 50
      let before: string | undefined
      while (true) {
        const page = yield* MessageV2.page({ sessionID, limit: size, before }).pipe(
          Effect.provideService(Database.Service, database),
        )
        if (page.items.length === 0) break
        for (let i = page.items.length - 1; i >= 0; i--) {
          const item = page.items[i]
          if (item && predicate(item)) return Option.some(item)
        }
        if (!page.more || !page.cursor) break
        before = page.cursor
      }
      return Option.none<SessionV1.WithParts>()
    })

    return Service.of({
      list,
      listGlobal,
      prepareRootStart,
      prepareChildStart,
      touch,
      get,
      setTitle,
      setTitleIfDefault,
      setArchived,
      setMetadata,
      setAgentModel,
      setPermission,
      setRevert,
      clearRevert,
      setSummary,
      setShare,
      setWorkspace,
      diff,
      messages,
      children,
      remove,
      updateMessage,
      finalizeMessage,
      removeMessage,
      removePart,
      removeTranscript,
      updatePart,
      updateMessageWithParts,
      getPart,
      updatePartDelta,
      findMessage,
    })
  }),
)

function exactStored(
  row: { readonly id: string; readonly session_id: string; readonly message_id?: string; readonly data: unknown },
  value: unknown,
) {
  const data = typeof row.data === "object" && row.data !== null ? row.data : {}
  const stored = row.message_id
    ? { ...data, id: row.id, sessionID: row.session_id, messageID: row.message_id }
    : { ...data, id: row.id, sessionID: row.session_id }
  return isDeepStrictEqual(normalizeJson(stored), normalizeJson(value))
}

function normalizeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as unknown
}

function listByProject(
  db: Database.Interface["db"],
  input: ListInput & {
    projectID: ProjectV2.ID
    experimentalWorkspaces: boolean
  },
) {
  const conditions = [eq(SessionTable.project_id, input.projectID)]

  if (input.workspaceID) {
    conditions.push(eq(SessionTable.workspace_id, input.workspaceID))
  }
  if (input.path !== undefined) {
    if (input.path) {
      const conds = [
        eq(SessionTable.path, input.path),
        like(SessionTable.path, sql.param(`${input.path}/%`, SessionTable.path)),
      ]

      conditions.push(
        input.directory
          ? or(...conds, and(isNull(SessionTable.path), eq(SessionTable.directory, input.directory))!)!
          : or(...conds)!,
      )
    }
  } else if (input.scope !== "project") {
    if (input.directory) {
      conditions.push(eq(SessionTable.directory, input.directory))
    }
  }
  if (input.roots) {
    conditions.push(isNull(SessionTable.parent_id))
  }
  if (input.start) {
    conditions.push(gte(SessionTable.time_updated, input.start))
  }
  if (input.search) {
    conditions.push(like(SessionTable.title, `%${input.search}%`))
  }

  const limit = input.limit ?? 100

  return db
    .select()
    .from(SessionTable)
    .where(and(...conditions))
    .orderBy(desc(SessionTable.time_updated))
    .limit(limit)
    .all()
    .pipe(
      Effect.orDie,
      Effect.map((rows) => rows.map(fromRow)),
    )
}

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [RuntimeFlags.node, Database.node, EventV2Bridge.node, SessionRunState.node],
})

export * as Session from "./session"
