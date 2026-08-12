import { describe, expect, test } from "bun:test"
import { Cause, Effect, Layer } from "effect"
import { Course } from "@opencode-ai/core/course"
import {
  CourseTable,
  CourseViewRevisionStateTable,
  CourseViewTable,
  CourseWorkingSelectionTable,
} from "@opencode-ai/core/course/sql"
import { supportedNames } from "@opencode-ai/core/civil-time"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { FutureAttention } from "@opencode-ai/core/future-attention"
import { FutureAttentionPresentation } from "@opencode-ai/core/future-attention-presentation"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearningContext } from "@opencode-ai/core/learning-context"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { ModelV2 } from "@opencode-ai/core/model"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { MessageTable, PartTable, SessionTable } from "@opencode-ai/core/session/sql"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { FutureAttentionEvent } from "@opencode-ai/schema/future-attention-event"
import { and, eq, sql } from "drizzle-orm"
import { admitModelWithLearningContext } from "./fixture/model-admission"
import { testEffect } from "./lib/effect"

const database = Database.layerFromPath(":memory:").pipe(Layer.orDie)
const it = testEffect(LayerNode.compile(LayerNode.group([Course.node, Database.node]), [[Database.node, database]]))
const eventIt = testEffect(
  LayerNode.compile(LayerNode.group([Course.node, Database.node, EventV2.node]), [[Database.node, database]]),
)
const model = { modelID: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }

test("presents a stale finalization without claiming the superseded concern remains open", () => {
  const presentation = FutureAttentionPresentation.finalization({
    outcome: "not_served",
    members: [{ outcome: "not_served", reason: "stale_head" }],
  })

  expect(presentation).toEqual({
    title: "Future attention not served",
    detail:
      "1 claim was not served (1: the claimed FutureAttention head changed before finalization). Check current FutureAttention state to see what remains open.",
  })
  expect(presentation.detail).not.toContain("retained follow-up remains open")
})

describe.serial("FutureAttention", () => {
  it.effect("creates one exact concern and projects it only when due", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const endpoint = yield* createCourseEndpoint()
      const time = Date.parse("2036-08-07T01:00:00Z")
      const command = createCommand(endpoint, "Explain the semaphore bound later")
      const invocation = yield* seedAgentInvocation(db, "create", command, time)
      const reserved = yield* db.transaction((tx) =>
        FutureAttention.reserve(tx, { ...invocation, settlement: { time: time + 2, order: 1 } }),
      )
      expect(reserved).toMatchObject({ type: "admitted", candidate: { kind: "candidate_v1" } })
      yield* db.transaction((tx) =>
        FutureAttention.settlePolicy(tx, {
          partID: invocation.envelope.partID,
          outcome: "policy_allow",
          policyBasis: { source: "test", rule: "allow" },
          time: time + 3,
          order: 2,
        }),
      )
      const result = yield* db.transaction((tx) =>
        FutureAttention.settle(tx, {
          partID: invocation.envelope.partID,
          settlement: { time: time + 4, order: 3 },
        }),
      )
      expect(result).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "applied",
          futureAttentionKind: "change_set",
          schemaVersion: 1,
          changes: [{ operation: "create", outcome: "changed", disposition: "open", version: 0 }],
        },
      })
      if (result.type !== "settled" || result.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected one applied FutureAttention concern")
      }
      const concernID = result.settlement.changes[0]!.concernID
      const before = yield* db.transaction((tx) =>
        FutureAttention.listEligibleForContext(tx, { now: Date.parse("2036-08-07T01:59:59Z") }),
      )
      const due = yield* db.transaction((tx) =>
        FutureAttention.listEligibleForContext(tx, { now: Date.parse("2036-08-07T02:00:00Z") }),
      )
      const read = yield* db.transaction((tx) =>
        FutureAttention.read(tx, { type: "concern", concernID }, { now: time + 4 }),
      )

      expect(before).toMatchObject({ countAtCut: 0, entries: [], truncated: false })
      expect(due).toMatchObject({
        countAtCut: 1,
        truncated: false,
        order: "not_before_then_created_then_id_non_priority",
        entries: [
          {
            concern: {
              id: concernID,
              payload: {
                purpose: "Explain the semaphore bound later",
                source: {
                  type: "interpreted_learner_request",
                  excerpt: { text: "Future attention", source: { occurrenceID: invocation.envelope.occurrenceID } },
                },
                target: { endpoint, selection: { type: "explicit_exact" } },
                notBefore: {
                  instant: Date.parse("2036-08-07T02:00:00Z"),
                  resolvedZone: { type: "fixed_offset", offsetMinutes: 480 },
                },
              },
            },
            targetStatus: "target_current",
            eligible: true,
          },
        ],
      })
      expect(read).toMatchObject({ countAtCut: 1, returnedCount: 1, items: [{ concern: { id: concernID } }] })
    }),
  )

  it.effect("feeds a sole due concern into a complete protected context entry", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const endpoint = yield* createCourseEndpoint()
      const time = Date.parse("2036-08-07T01:00:00Z")
      const learnerSource = "m"
      const command = {
        operations: [
          {
            type: "create" as const,
            concern: {
              purpose: "p",
              source: {
                type: "interpreted_learner_request" as const,
                excerpt: { text: learnerSource, startByte: 0, endByte: 1 },
              },
              target: { endpoint, selection: { type: "explicit_exact" as const } },
              notBefore: {
                sourceExpression: "2036-08-07T01:00:00.001Z",
                localDateTime: "2036-08-07T01:00:00.001",
                timeZone: { type: "fixed_offset" as const, offsetMinutes: 0 },
              },
              serviceTiming: "after_creation" as const,
            },
          },
        ],
      }
      const invocation = yield* seedAgentInvocation(db, "context", command, time, { userText: learnerSource })
      const operation = {
        sessionID: invocation.envelope.sessionID,
        turnID: invocation.envelope.turnID,
        inputID: invocation.envelope.inputID,
        causalOccurrenceID: invocation.envelope.occurrenceID,
        assistantMessageID: invocation.envelope.assistantMessageID,
        ordinal: 0,
      }
      const frontierBefore = yield* db.transaction((tx) => LearningFrontier.read(tx))
      const beforePrepared = yield* db.transaction((tx) =>
        LearningContext.prepareCut(tx, {
          operation,
          retainedSteering: {
            assistantMessageID: invocation.envelope.assistantMessageID,
            cutAsOf: time + 1,
            throughSharedFrontier: frontierBefore,
            fingerprint: "0".repeat(64),
          } as unknown as Parameters<typeof LearningContext.prepareCut>[1]["retainedSteering"],
          capabilityBasis: learningContextBasis(),
        }),
      )
      expect(beforePrepared.cut.sections.find((item) => item.owner === "future_attention")).toMatchObject({
        coverage: "empty",
        countAtCut: 0,
        omission: { type: "none" },
        entries: [],
      })
      expect(beforePrepared.renderedBlock).toContain("FutureAttention: none eligible at this immutable cut.")
      expect(beforePrepared.renderedBlock).not.toContain("sole complete concern")
      expect(beforePrepared.cut.budget).toMatchObject({ canonicalBytes: 8_453, renderedBytes: 5_173 })
      const settled = yield* applyFutureInvocation(db, invocation, time + 2)
      if (settled.outcome !== "applied") return yield* Effect.die("Expected minimum FutureAttention concern")
      const concernID = (settled as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const minimum = yield* readConcernView(db, concernID, time + 5)
      const minimumSemanticBytes = FutureAttention.semanticValueBytes(minimum.concern.payload)
      const frontier = yield* db.transaction((tx) => LearningFrontier.read(tx))
      const prepared = yield* db.transaction((tx) =>
        LearningContext.prepareCut(tx, {
          operation,
          retainedSteering: {
            assistantMessageID: invocation.envelope.assistantMessageID,
            cutAsOf: time + 5,
            throughSharedFrontier: frontier,
            fingerprint: "a".repeat(64),
          } as unknown as Parameters<typeof LearningContext.prepareCut>[1]["retainedSteering"],
          capabilityBasis: learningContextBasis(),
        }),
      )
      const section = prepared.cut.sections.find((item) => item.owner === "future_attention")

      expect(section).toMatchObject({
        coverage: "complete",
        countAtCut: 1,
        omission: { type: "none" },
        entries: [
          {
            kind: "future_attention",
            semantic: {
              state: "value",
              value: { purpose: "p", sourceAvailability: "available" },
            },
          },
        ],
      })
      expect(prepared.renderedBlock).toContain(
        "FutureAttention: conditional default. An exact current learner request may override an overlapping present action; otherwise realize the sole complete concern naturally. Override alone neither serves nor mutates it.",
      )
      expect({
        minimumSemanticBytes,
        canonicalBytes: prepared.cut.budget.canonicalBytes,
        renderedBytes: prepared.cut.budget.renderedBytes,
      }).toEqual({
        minimumSemanticBytes: 785,
        canonicalBytes: 9_452,
        renderedBytes: 6_004,
      })
      expect(
        LearningContext.decodeStored(
          prepared.canonicalCut,
          prepared.renderedBlock,
          invocation.envelope.assistantMessageID,
        ),
      ).toEqual(prepared.cut)
    }),
  )

  it.effect("rejects exact-target selection without a current root learner interpretation", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const endpoint = yield* createCourseEndpoint()
      const time = Date.parse("2036-08-07T01:00:00Z")
      const command = createCommand(endpoint, "A Tutor-authored write cannot select an arbitrary exact endpoint")
      const invocation = yield* seedAgentInvocation(
        db,
        "exact-target-without-learner-source",
        {
          operations: [
            {
              ...command.operations[0],
              concern: { ...command.operations[0].concern, source: { type: "tutor_initiated" } },
            },
          ],
        },
        time,
      )
      const error = yield* Effect.flip(
        db.transaction((tx) =>
          FutureAttention.reserve(tx, { ...invocation, settlement: { time: time + 2, order: 1 } }),
        ),
      )
      expect(error).toMatchObject({ reason: "illegal_issuer" })
      expect(
        yield* db.get<{ count: number }>(
          sql`SELECT count(*) AS count FROM learning_command_invocation WHERE part_id = ${invocation.envelope.partID}`,
        ),
      ).toEqual({ count: 0 })
    }),
  )

  it.effect("projects source tombstones without retaining unrelated learner transcript text", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const endpoint = yield* createCourseEndpoint()
      const time = Date.parse("2036-08-07T01:00:00Z")
      const excerptText = "Please revisit semaphore fairness later"
      const unrelatedText = "Unrelated transcript detail that FutureAttention must not retain"
      const userText = `${excerptText}. ${unrelatedText}.`
      const base = createCommand(endpoint, "Revisit the requested semaphore fairness point")
      const command = {
        operations: [
          {
            ...base.operations[0],
            concern: {
              ...base.operations[0].concern,
              source: {
                type: "interpreted_learner_request" as const,
                excerpt: {
                  text: excerptText,
                  startByte: 0,
                  endByte: new TextEncoder().encode(excerptText).byteLength,
                },
              },
            },
          },
        ],
      } satisfies FutureAttention.ChangeSetCommand
      const invocation = yield* seedAgentInvocation(db, "source-tombstone", command, time, { userText })
      const settled = yield* applyFutureInvocation(db, invocation, time + 2)
      if (settled.outcome !== "applied") return yield* Effect.die("Expected source-linked concern")
      const concernID = (settled as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const before = yield* readConcernView(db, concernID, time + 5)
      expect(before).toMatchObject({
        sourceAvailability: { state: "available" },
        concern: {
          payload: {
            source: {
              type: "interpreted_learner_request",
              excerpt: { text: excerptText, source: { occurrenceID: invocation.envelope.occurrenceID } },
            },
          },
        },
      })
      const stored = yield* db.get<{ value: string }>(
        sql`SELECT CAST(source AS TEXT) || CAST(semantic_value AS TEXT) AS value
          FROM future_attention_concern
          WHERE id = ${concernID}`,
      )
      expect(stored?.value).toContain(excerptText)
      expect(stored?.value).not.toContain(unrelatedText)

      yield* db.transaction((tx) =>
        LearningCommand.removeOccurrencePresentation(tx, {
          messageID: invocation.envelope.parentUserMessageID,
          timeDeleted: time + 6,
        }),
      )
      const after = yield* readConcernView(db, concernID, Date.parse("2036-08-07T02:00:00Z"))
      const eligible = yield* db.transaction((tx) =>
        FutureAttention.listEligibleForContext(tx, { now: Date.parse("2036-08-07T02:00:00Z") }),
      )
      expect(after).toMatchObject({ sourceAvailability: { state: "source_unavailable", reason: "source_deleted" } })
      expect(eligible).toMatchObject({
        countAtCut: 1,
        entries: [{ concern: { id: concernID }, sourceAvailability: { state: "source_unavailable" } }],
      })
      expect(JSON.stringify(after)).not.toContain(unrelatedText)
    }),
  )

  it.effect("serves from a later complete learner occurrence and preserves served disposition through correction", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const endpoint = yield* createCourseEndpoint()
      const createdAt = Date.parse("2036-08-07T01:00:00Z")
      const created = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(db, "serve-create", createCommand(endpoint, "Explain this after ten"), createdAt),
        createdAt + 2,
      )
      if (created.outcome !== "applied") return yield* Effect.die("Expected created concern")
      const concernID = (created as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const serviceTime = Date.parse("2036-08-07T02:01:00Z")
      const serviceInvocation = yield* seedAgentInvocation(
        db,
        "serve-later",
        {
          operations: [
            {
              type: "serve",
              concernID,
              expectedVersion: 0,
              service: {
                source: { type: "learner_occurrence" },
                rationale: "The complete current learner response realizes the retained purpose.",
              },
            },
          ],
        },
        serviceTime,
      )
      const served = yield* applyFutureInvocation(db, serviceInvocation, serviceTime + 2)
      expect(served).toMatchObject({
        outcome: "applied",
        changes: [{ operation: "serve", concernID, version: 1, disposition: "served" }],
      })
      const servedView = yield* readConcernView(db, concernID, serviceTime + 3)
      expect(servedView.serviceReceipt).toMatchObject({ sourceAvailability: { state: "available" } })
      yield* db.transaction((tx) =>
        LearningCommand.removeOccurrencePresentation(tx, {
          messageID: serviceInvocation.envelope.parentUserMessageID,
          timeDeleted: serviceTime + 4,
        }),
      )
      const unavailableServedView = yield* readConcernView(db, concernID, serviceTime + 5)
      expect(unavailableServedView).toMatchObject({
        concern: { current: { disposition: "served" } },
        serviceReceipt: { sourceAvailability: { state: "source_unavailable", reason: "source_deleted" } },
      })
      const replacementTime = serviceTime + 10
      const replaced = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "carry-served",
          {
            operations: [
              {
                type: "replace",
                concernID,
                expectedVersion: unavailableServedView.concern.current.version,
                mutation: agentCorrection(unavailableServedView, "Correct the retained wording without reopening it."),
                successorSource: { type: "preserve_predecessor_source" },
                concern: replacementConcern(endpoint, "Explain the corrected semaphore bound"),
                successorDisposition: {
                  type: "carry_served",
                  rationale: "The prior complete service remains sufficient for the corrected wording.",
                },
              },
            ],
          },
          replacementTime,
        ),
        replacementTime + 2,
      )
      expect(replaced).toMatchObject({
        outcome: "applied",
        changes: [
          {
            operation: "replace",
            concernID,
            version: 2,
            disposition: "superseded",
            successorVersion: 1,
            successorDisposition: "served",
          },
        ],
      })
      if (replaced.outcome !== "applied") return yield* Effect.die("Expected served replacement")
      const replacement = (replaced as FutureAttention.AppliedSettlement).changes[0]!
      if (replacement.operation !== "replace") return yield* Effect.die("Expected replacement projection")
      const successorID = replacement.successorConcernID
      const successor = yield* readConcernView(db, successorID, replacementTime + 3)
      const eligible = yield* db.transaction((tx) =>
        FutureAttention.listEligibleForContext(tx, { now: replacementTime + 3 }),
      )
      expect(successor.concern.current.disposition).toBe("served")
      expect(successor.serviceReceipt?.source.type).toBe("learner_occurrence")
      expect(successor.serviceReceipt).toMatchObject({
        carriedFromServiceReceiptID: unavailableServedView.serviceReceipt?.id,
        sourceAvailability: { state: "source_unavailable", reason: "source_deleted" },
      })
      expect(eligible.countAtCut).toBe(0)
    }),
  )

  it.effect("keeps dismiss, reopen, and terminal-preserving replacement explicit", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const endpoint = yield* createCourseEndpoint()
      const time = Date.parse("2036-08-07T01:00:00Z")
      const created = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(db, "lifecycle-create", createCommand(endpoint, "Return to this later"), time),
        time + 2,
      )
      if (created.outcome !== "applied") return yield* Effect.die("Expected created concern")
      const concernID = (created as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const first = yield* readConcernView(db, concernID, time + 3)
      const dismissed = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "lifecycle-dismiss",
          {
            operations: [
              {
                type: "dismiss",
                concernID,
                expectedVersion: first.concern.current.version,
                mutation: agentCorrection(first, "The Tutor no longer needs this retained pressure."),
              },
            ],
          },
          time + 10,
        ),
        time + 12,
      )
      expect(dismissed).toMatchObject({ changes: [{ disposition: "dismissed", version: 1 }] })
      const dismissedView = yield* readConcernView(db, concernID, time + 13)
      const redundantInvocation = yield* seedAgentInvocation(
        db,
        "lifecycle-redundant-dismiss",
        {
          operations: [
            {
              type: "dismiss",
              concernID,
              expectedVersion: dismissedView.concern.current.version,
              mutation: agentCorrection(dismissedView, "The exact head is already dismissed."),
            },
          ],
        },
        time + 14,
      )
      const redundant = yield* applyFutureInvocation(db, redundantInvocation, time + 16)
      expect(redundant).toMatchObject({
        outcome: "no_change",
        changes: [{ operation: "dismiss", outcome: "no_effect", disposition: "dismissed", version: 1 }],
      })
      expect("receiptID" in redundant).toBeFalse()
      expect("effectID" in redundant).toBeFalse()
      const redundantReplay = yield* db.transaction((tx) =>
        FutureAttention.settle(tx, {
          partID: redundantInvocation.envelope.partID,
          settlement: { time: time + 17, order: 4 },
        }),
      )
      expect(redundantReplay).toEqual({ type: "replay", settlement: redundant })
      expect(
        yield* db.get<{ count: number }>(
          sql`SELECT count(*) AS count FROM learning_command_receipt WHERE invocation_part_id = ${redundantInvocation.envelope.partID}`,
        ),
      ).toEqual({ count: 0 })
      expect((yield* readConcernView(db, concernID, time + 17)).concern.current).toEqual(dismissedView.concern.current)
      const reopened = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "lifecycle-reopen",
          {
            operations: [
              {
                type: "reopen",
                concernID,
                expectedVersion: dismissedView.concern.current.version,
                mutation: agentCorrection(dismissedView, "New evidence makes the concern useful again."),
              },
            ],
          },
          time + 20,
        ),
        time + 22,
      )
      expect(reopened).toMatchObject({ changes: [{ disposition: "open", version: 2 }] })
      const reopenedView = yield* readConcernView(db, concernID, time + 23)
      yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "lifecycle-dismiss-again",
          {
            operations: [
              {
                type: "dismiss",
                concernID,
                expectedVersion: reopenedView.concern.current.version,
                mutation: agentCorrection(reopenedView, "The retained concern is now obsolete."),
              },
            ],
          },
          time + 30,
        ),
        time + 32,
      )
      const terminal = yield* readConcernView(db, concernID, time + 33)
      const replacement = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "carry-dismissed",
          {
            operations: [
              {
                type: "replace",
                concernID,
                expectedVersion: terminal.concern.current.version,
                mutation: agentCorrection(terminal, "Correct the exact target while preserving dismissal."),
                successorSource: { type: "preserve_predecessor_source" },
                concern: replacementConcern(endpoint, "Return to the corrected item later"),
                successorDisposition: {
                  type: "carry_dismissed",
                  rationale: "The terminal dismissal remains intentional after the correction.",
                },
              },
            ],
          },
          time + 40,
        ),
        time + 42,
      )
      expect(replacement).toMatchObject({
        changes: [{ disposition: "superseded", successorVersion: 1, successorDisposition: "dismissed" }],
      })
    }),
  )

  it.effect("atomically replaces and serves the generated successor from the exact current learner source", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const endpoint = yield* createCourseEndpoint()
      const createdAt = Date.parse("2036-08-07T01:00:00Z")
      const created = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "replace-immediate-create",
          createCommand(endpoint, "Explain A later"),
          createdAt,
        ),
        createdAt + 2,
      )
      if (created.outcome !== "applied") return yield* Effect.die("Expected predecessor concern")
      const predecessorID = (created as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const predecessor = yield* readConcernView(db, predecessorID, createdAt + 5)
      const sourceText = "Future attention replace-immediate-serve"
      const excerpt = { text: sourceText, startByte: 0, endByte: new TextEncoder().encode(sourceText).byteLength }
      const serviceTime = Date.parse("2036-08-07T02:01:00Z")
      const replaced = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "replace-immediate-serve",
          {
            operations: [
              {
                type: "replace",
                concernID: predecessorID,
                expectedVersion: predecessor.concern.current.version,
                mutation: { type: "interpreted_learner_direction", excerpt },
                successorSource: {
                  type: "rebind_current_source",
                  source: { type: "interpreted_learner_request", excerpt },
                },
                concern: replacementConcern(endpoint, "Explain corrected B now"),
                successorDisposition: {
                  type: "serve_complete_source",
                  service: {
                    source: { type: "learner_occurrence" },
                    rationale: "The exact current learner response both corrects the target and realizes corrected B.",
                  },
                },
              },
            ],
          },
          serviceTime,
        ),
        serviceTime + 2,
      )
      expect(replaced).toMatchObject({
        outcome: "applied",
        changes: [
          {
            operation: "replace",
            concernID: predecessorID,
            disposition: "superseded",
            successorVersion: 1,
            successorDisposition: "served",
          },
        ],
      })
      if (replaced.outcome !== "applied") return yield* Effect.die("Expected served corrected successor")
      const change = (replaced as FutureAttention.AppliedSettlement).changes[0]!
      if (change.operation !== "replace") return yield* Effect.die("Expected replacement projection")
      const successor = yield* readConcernView(db, change.successorConcernID, serviceTime + 5)
      expect(successor.concern.payload.source).toMatchObject({
        type: "interpreted_learner_request",
        excerpt: { text: sourceText, source: { occurrenceID: replaced.occurrenceID } },
      })
      expect(successor.concern.current).toMatchObject({ disposition: "served", kind: "served" })
      expect(successor.serviceReceipt).toMatchObject({ source: { type: "learner_occurrence" } })
      expect((yield* readConcernView(db, predecessorID, serviceTime + 5)).concern.successorConcernID).toBe(
        change.successorConcernID,
      )
    }),
  )

  it.effect("serializes stale races and leaves a rejected multi-operation set with no partial domain effect", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const endpoint = yield* createCourseEndpoint()
      const time = Date.parse("2036-08-07T01:00:00Z")
      const created = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(db, "race-create", createCommand(endpoint, "Resolve the race later"), time),
        time + 2,
      )
      if (created.outcome !== "applied") return yield* Effect.die("Expected race predecessor")
      const concernID = (created as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const original = yield* readConcernView(db, concernID, time + 5)
      const dismissInvocation = yield* seedAgentInvocation(
        db,
        "race-dismiss",
        {
          operations: [
            {
              type: "dismiss",
              concernID,
              expectedVersion: 0,
              mutation: agentCorrection(original, "The first exact head correction wins the race."),
            },
          ],
        },
        time + 10,
      )
      const replaceInvocation = yield* seedAgentInvocation(
        db,
        "race-replace",
        {
          operations: [
            {
              type: "replace",
              concernID,
              expectedVersion: 0,
              mutation: agentCorrection(original, "This competing correction must revalidate the exact old head."),
              successorSource: { type: "preserve_predecessor_source" },
              concern: replacementConcern(endpoint, "A losing successor must never appear"),
              successorDisposition: { type: "open" },
            },
          ],
        },
        time + 20,
      )
      for (const invocation of [dismissInvocation, replaceInvocation]) {
        const reserved = yield* db.transaction((tx) =>
          FutureAttention.reserve(tx, {
            ...invocation,
            settlement: { time: invocation.envelope.timeAdmitted + 1, order: 1 },
          }),
        )
        expect(reserved.type).toBe("admitted")
        yield* db.transaction((tx) =>
          FutureAttention.settlePolicy(tx, {
            partID: invocation.envelope.partID,
            outcome: "policy_allow",
            policyBasis: { source: "test" },
            time: invocation.envelope.timeAdmitted + 2,
            order: 2,
          }),
        )
      }
      const winner = yield* db.transaction((tx) =>
        FutureAttention.settle(tx, {
          partID: dismissInvocation.envelope.partID,
          settlement: { time: time + 30, order: 3 },
        }),
      )
      const loser = yield* db.transaction((tx) =>
        FutureAttention.settle(tx, {
          partID: replaceInvocation.envelope.partID,
          settlement: { time: time + 31, order: 3 },
        }),
      )
      expect(winner).toMatchObject({ settlement: { outcome: "applied", changes: [{ disposition: "dismissed" }] } })
      expect(loser).toMatchObject({ settlement: { outcome: "error", code: "stale" } })
      const afterRace = yield* db.transaction((tx) =>
        FutureAttention.read(tx, { type: "list" }, { now: time + 32, limit: 64 }),
      )
      expect(afterRace).toMatchObject({ countAtCut: 1, returnedCount: 1 })
      expect(afterRace.items[0]).toMatchObject({ concern: { id: concernID, current: { disposition: "dismissed" } } })

      const rejectedInvocation = yield* seedAgentInvocation(
        db,
        "atomic-invalid",
        {
          operations: [
            createCommand(endpoint, "This create must roll back with the stale member").operations[0],
            {
              type: "reopen",
              concernID,
              expectedVersion: 0,
              mutation: agentCorrection(original, "This stale member invalidates the whole change set."),
            },
          ],
        },
        time + 40,
      )
      const rejected = yield* Effect.flip(
        db.transaction((tx) =>
          FutureAttention.reserve(tx, { ...rejectedInvocation, settlement: { time: time + 42, order: 1 } }),
        ),
      )
      expect(rejected).toMatchObject({ reason: "stale" })
      const afterRejectedSet = yield* db.transaction((tx) =>
        FutureAttention.read(tx, { type: "list" }, { now: time + 45, limit: 64 }),
      )
      expect(afterRejectedSet).toMatchObject({ countAtCut: 1, returnedCount: 1 })
    }),
  )

  it.effect("serves from exact complete Assistant, tool, and child outcomes in one root change set", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const endpoint = yield* createCourseEndpoint()
      const createdAt = Date.parse("2036-08-07T01:00:00Z")
      const concernIDs = yield* Effect.forEach(["assistant", "tool", "child"] as const, (kind, index) =>
        Effect.gen(function* () {
          const created = yield* applyFutureInvocation(
            db,
            yield* seedAgentInvocation(
              db,
              `complete-${kind}-create`,
              createCommand(endpoint, `Serve from the exact complete ${kind} outcome`),
              createdAt + index * 10,
            ),
            createdAt + index * 10 + 2,
          )
          if (created.outcome !== "applied") return yield* Effect.die(`Expected ${kind} source concern`)
          return (created as FutureAttention.AppliedSettlement).changes[0]!.concernID
        }),
      )
      const suffix = "complete-source-union"
      const sourceIDs = completeServiceSourceIDs(suffix)
      const serviceTime = Date.parse("2036-08-07T02:01:00Z")
      const command = {
        operations: [
          {
            type: "serve" as const,
            concernID: concernIDs[0]!,
            expectedVersion: 0,
            service: {
              source: { type: "assistant_completion" as const, assistantMessageID: sourceIDs.assistantMessageID },
              rationale: "The exact earlier committed root Assistant presentation realizes this purpose.",
            },
          },
          {
            type: "serve" as const,
            concernID: concernIDs[1]!,
            expectedVersion: 0,
            service: {
              source: { type: "tool_result" as const, partID: sourceIDs.toolPartID },
              rationale: "The exact completed root tool result realizes this purpose.",
            },
          },
          {
            type: "serve" as const,
            concernID: concernIDs[2]!,
            expectedVersion: 0,
            service: {
              source: { type: "child_result" as const, parentTaskPartID: sourceIDs.taskPartID },
              rationale: "The exact complete child return, explicitly aligned by the root, realizes this purpose.",
            },
          },
        ],
      } satisfies FutureAttention.ChangeSetCommand
      const invocation = yield* seedAgentInvocation(db, suffix, command, serviceTime, {
        completeSources: {
          assistantText: "The committed root Assistant presentation contains the complete bounded explanation.",
          toolOutput: "The completed tool result contains the exact bounded source material.",
          childOutput: { answer: "The complete child return contains the requested bounded explanation." },
        },
      })
      const served = yield* applyFutureInvocation(db, invocation, serviceTime + 20)
      expect(served).toMatchObject({
        outcome: "applied",
        changes: [
          { operation: "serve", disposition: "served" },
          { operation: "serve", disposition: "served" },
          { operation: "serve", disposition: "served" },
        ],
      })
      const views = yield* Effect.forEach(concernIDs, (concernID) => readConcernView(db, concernID, serviceTime + 25))
      expect(views.map((view) => view.serviceReceipt?.source.type).sort()).toEqual([
        "assistant_completion",
        "child_result",
        "tool_result",
      ])
      expect(views.every((view) => view.concern.current.disposition === "served")).toBe(true)
    }),
  )

  it.effect("rejects empty and internal-control Tool Parts as service sources", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const endpoint = yield* createCourseEndpoint()
      const createdAt = Date.parse("2036-08-07T01:00:00Z")
      for (const [suffix, toolOutput, toolSourceUse] of [
        ["empty-tool-source", "   ", "learner_usable"],
        ["internal-tool-source", "Internal control bookkeeping only", "internal_control"],
      ] as const) {
        const created = yield* applyFutureInvocation(
          db,
          yield* seedAgentInvocation(
            db,
            `${suffix}-create`,
            createCommand(endpoint, `Do not serve from the ${suffix}`),
            createdAt,
          ),
          createdAt + 2,
        )
        if (created.outcome !== "applied") return yield* Effect.die(`Expected ${suffix} concern`)
        const concernID = (created as FutureAttention.AppliedSettlement).changes[0]!.concernID
        const sourceIDs = completeServiceSourceIDs(suffix)
        const invocation = yield* seedAgentInvocation(
          db,
          suffix,
          {
            operations: [
              {
                type: "serve",
                concernID,
                expectedVersion: 0,
                service: {
                  source: { type: "tool_result", partID: sourceIDs.toolPartID },
                  rationale: "Only nonempty learner-usable Tool output may realize this purpose.",
                },
              },
            ],
          },
          Date.parse("2036-08-07T02:01:00Z"),
          { completeSources: { toolOutput, toolSourceUse } },
        )
        const error = yield* Effect.flip(
          db.transaction((tx) =>
            FutureAttention.reserve(tx, {
              ...invocation,
              settlement: { time: invocation.envelope.timeAdmitted + 2, order: 1 },
            }),
          ),
        )
        expect(error).toMatchObject({ reason: "source_unavailable" })
        expect(
          (yield* readConcernView(db, concernID, invocation.envelope.timeAdmitted + 3)).concern.current,
        ).toMatchObject({ disposition: "open", version: 0 })
      }
    }),
  )

  it.effect("rejects an out-of-domain persisted Tool service-source classification", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const endpoint = yield* createCourseEndpoint()
      const invocation = yield* seedAgentInvocation(
        db,
        "invalid-tool-source-classification",
        createCommand(endpoint, "Keep the persisted Tool classification closed"),
        Date.parse("2036-08-07T01:00:00Z"),
      )
      const result = yield* Effect.exit(
        db.run(sql`
          UPDATE turn_tool_candidate
          SET future_attention_service_source = 'fabricated'
          WHERE part_id = ${invocation.envelope.partID}
        `),
      )

      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") {
        expect(Cause.pretty(result.cause)).toContain(
          "turn_tool_candidate FutureAttention service-source classification is invalid",
        )
      }
    }),
  )

  it.effect("requires the exact current learner occurrence as the learner-first service witness", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const endpoint = yield* createCourseEndpoint()
      const createdAt = Date.parse("2036-08-07T01:00:00Z")
      const orderedCommand = createCommand(endpoint, "Let the learner answer before the later explanation")
      const created = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "ordered-create",
          {
            operations: [
              {
                ...orderedCommand.operations[0],
                concern: {
                  ...orderedCommand.operations[0].concern,
                  interactionOrder: "learner_response_before_tutor_disclosure",
                },
              },
            ],
          },
          createdAt,
        ),
        createdAt + 2,
      )
      if (created.outcome !== "applied") return yield* Effect.die("Expected learner-first concern")
      const concernID = (created as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const assistantOrdered = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "ordered-assistant-create",
          {
            operations: [
              {
                ...orderedCommand.operations[0],
                concern: {
                  ...orderedCommand.operations[0].concern,
                  purpose: "Let the learner answer before the exact later Assistant explanation",
                  interactionOrder: "learner_response_before_tutor_disclosure",
                },
              },
            ],
          },
          createdAt + 10,
        ),
        createdAt + 12,
      )
      if (assistantOrdered.outcome !== "applied") return yield* Effect.die("Expected learner-first Assistant concern")
      const assistantConcernID = (assistantOrdered as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const firstServiceTime = Date.parse("2036-08-07T02:01:00Z")
      const withoutWitnessInvocation = yield* seedAgentInvocation(
        db,
        "ordered-no-witness",
        {
          operations: [
            {
              type: "serve",
              concernID,
              expectedVersion: 0,
              service: {
                source: { type: "learner_occurrence" },
                rationale: "This omits the required exact learner-response witness.",
              },
            },
          ],
        },
        firstServiceTime,
      )
      const withoutWitness = yield* applyFutureInvocation(db, withoutWitnessInvocation, firstServiceTime + 2)
      expect(withoutWitness).toMatchObject({ outcome: "error", code: "validation_error" })

      const wrongWitnessTime = firstServiceTime + 60_000
      const wrongWitness = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "ordered-wrong-witness",
          {
            operations: [
              {
                type: "serve",
                concernID,
                expectedVersion: 0,
                service: {
                  source: { type: "learner_occurrence" },
                  rationale: "A different learner occurrence cannot stand in for the current service occurrence.",
                  learnerResponseWitness: { occurrenceID: withoutWitnessInvocation.envelope.occurrenceID },
                },
              },
            ],
          },
          wrongWitnessTime,
        ),
        wrongWitnessTime + 2,
      )
      expect(wrongWitness).toMatchObject({ outcome: "error", code: "validation_error" })

      const crossSessionSuffix = "ordered-cross-session-assistant"
      const crossSessionIDs = completeServiceSourceIDs(crossSessionSuffix)
      const crossSessionInvocation = yield* seedAgentInvocation(
        db,
        crossSessionSuffix,
        {
          operations: [
            {
              type: "serve",
              concernID: assistantConcernID,
              expectedVersion: 0,
              service: {
                source: { type: "assistant_completion", assistantMessageID: crossSessionIDs.assistantMessageID },
                rationale: "An unrelated Session occurrence must not certify learner-first ordering.",
                learnerResponseWitness: { occurrenceID: withoutWitnessInvocation.envelope.occurrenceID },
              },
            },
          ],
        },
        wrongWitnessTime + 30_000,
        { completeSources: { assistantText: "A complete but differently witnessed Assistant explanation." } },
      )
      const crossSession = yield* applyFutureInvocation(db, crossSessionInvocation, wrongWitnessTime + 30_020)
      expect(crossSession).toMatchObject({ outcome: "error", code: "validation_error" })

      const alignedSuffix = "ordered-aligned-assistant"
      const alignedIDs = completeServiceSourceIDs(alignedSuffix)
      const alignedTime = wrongWitnessTime + 60_000
      const alignedInvocation = yield* seedAgentInvocation(
        db,
        alignedSuffix,
        (occurrenceID) => ({
          operations: [
            {
              type: "serve",
              concernID: assistantConcernID,
              expectedVersion: 0,
              service: {
                source: { type: "assistant_completion", assistantMessageID: alignedIDs.assistantMessageID },
                rationale: "The exact root learner input precedes this exact complete Assistant explanation.",
                learnerResponseWitness: { occurrenceID },
              },
            },
          ],
        }),
        alignedTime,
        { completeSources: { assistantText: "The exact same-lineage Assistant explanation." } },
      )
      expect(yield* applyFutureInvocation(db, alignedInvocation, alignedTime + 20)).toMatchObject({
        outcome: "applied",
        changes: [{ concernID: assistantConcernID, disposition: "served" }],
      })

      const correctTime = wrongWitnessTime + 60_000
      const correctInvocation = yield* seedAgentInvocation(
        db,
        "ordered-correct-witness",
        (occurrenceID) => ({
          operations: [
            {
              type: "serve",
              concernID,
              expectedVersion: 0,
              service: {
                source: { type: "learner_occurrence" },
                rationale:
                  "The exact current complete learner response precedes and itself realizes the learner-first purpose.",
                learnerResponseWitness: { occurrenceID },
              },
            },
          ],
        }),
        correctTime,
      )
      const correct = yield* applyFutureInvocation(db, correctInvocation, correctTime + 2)
      expect(correct).toMatchObject({ outcome: "applied", changes: [{ disposition: "served" }] })
      expect((yield* readConcernView(db, concernID, correctTime + 5)).serviceReceipt).toMatchObject({
        source: { type: "learner_occurrence", source: { occurrenceID: correctInvocation.envelope.occurrenceID } },
        learnerResponseWitness: { occurrenceID: correctInvocation.envelope.occurrenceID },
      })
    }),
  )

  eventIt.effect("finalizes only the exact completed Assistant and keeps physical replay immutable", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const events = yield* EventV2.Service
      const endpoint = yield* createCourseEndpoint()
      const createdAt = Date.parse("2036-08-07T01:00:00Z")
      const created = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "claim-create",
          createCommand(endpoint, "Explain the semaphore bound now"),
          createdAt,
        ),
        createdAt + 2,
      )
      if (created.outcome !== "applied") return yield* Effect.die("Expected created concern")
      const concernID = (created as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const claimTime = Date.parse("2036-08-07T02:01:00Z")
      const command = {
        operations: [
          {
            type: "serve" as const,
            concernID,
            expectedVersion: 0,
            service: {
              source: { type: "current_assistant_when_complete" as const },
              rationale: "The exact completed Assistant presentation explains the retained semaphore bound.",
            },
          },
        ],
      }
      const invocation = yield* seedAgentInvocation(db, "claim-serve", command, claimTime)
      const admission = yield* applyFutureInvocation(db, invocation, claimTime + 2)
      const appliedAdmission = admission as FutureAttention.AppliedSettlement
      if (admission.outcome !== "applied" || !appliedAdmission.claim) {
        return yield* Effect.die("Expected one pending completion-conditioned claim")
      }
      const claim = appliedAdmission.claim
      const admissionBytes = JSON.stringify(admission)
      const completedAt = claimTime + 20
      const textPartID = SessionV1.PartID.ascending("prt_future_attention_text_claim_serve")
      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          yield* TurnLifecycle.settleTool(tx, {
            turnID: invocation.envelope.turnID,
            partID: invocation.envelope.partID,
            state: "completed",
            time: completedAt - 1,
          })
          yield* tx
            .update(PartTable)
            .set({
              data: {
                type: "tool",
                tool: FutureAttention.UPDATE_CAPABILITY,
                callID: invocation.envelope.providerCallID,
                state: {
                  status: "completed",
                  input: command,
                  output: JSON.stringify(admission),
                  title: "Update future attention",
                  metadata: {},
                  time: { start: claimTime + 1, end: completedAt - 1 },
                },
              } as (typeof PartTable.$inferInsert)["data"],
              time_updated: completedAt - 1,
            })
            .where(eq(PartTable.id, invocation.envelope.partID))
            .run()
          yield* tx
            .insert(PartTable)
            .values({
              id: textPartID,
              session_id: invocation.envelope.sessionID,
              message_id: invocation.envelope.assistantMessageID,
              data: {
                type: "text",
                text: "A semaphore bounds concurrency by requiring each worker to acquire one of a fixed number of permits.",
                time: { start: claimTime + 1, end: completedAt },
              } as (typeof PartTable.$inferInsert)["data"],
              time_created: completedAt,
              time_updated: completedAt,
            })
            .run()
          yield* tx
            .update(MessageTable)
            .set({
              data: {
                ...assistantData(invocation.envelope.parentUserMessageID, claimTime + 1),
                time: { created: claimTime + 1, completed: completedAt },
              },
              time_updated: completedAt,
            })
            .where(eq(MessageTable.id, invocation.envelope.assistantMessageID))
            .run()
        }),
      )

      const completion = yield* db.transaction((tx) =>
        FutureAttention.observeClaimGroupCompletion(tx, {
          groupID: claim.groupID,
          completionOrder: 4,
          observationCut: "live_presentation_finalized",
        }),
      )
      if (!completion) return yield* Effect.die("Expected durable exact-Assistant completion facts")
      const completionFacts = completion as FutureAttention.CompletionFacts
      expect(completionFacts).toMatchObject({
        assistantMessageID: invocation.envelope.assistantMessageID,
        modelOperationID: invocation.envelope.assistantMessageID,
        invocationPartID: invocation.envelope.partID,
        modelOutcome: "completed",
        localToolPartsTerminal: true,
        presentationCommitted: true,
        presentationUnavailable: false,
        timeCompleted: completedAt,
      })
      expect(completionFacts.eligibleOutputBytes).toBeGreaterThan(0)
      expect(completionFacts.partManifestFingerprint).toHaveLength(64)
      expect(completionFacts.eligibleOutputFingerprint).toHaveLength(64)

      const finalized = yield* FutureAttention.finalizeClaimGroup(events, {
        groupID: claim.groupID,
        completion: completionFacts,
        settlement: { time: completedAt + 1, order: 5 },
      })
      const repeatedFinalization = yield* FutureAttention.finalizeClaimGroup(events, {
        groupID: claim.groupID,
        completion: completionFacts,
        settlement: { time: completedAt + 2, order: 6 },
      })
      expect(finalized).toMatchObject({
        groupID: claim.groupID,
        outcome: "served",
        members: [{ concernID, outcome: "served" }],
      })
      expect(repeatedFinalization).toEqual(finalized)
      const finalizationEvents = yield* db
        .select()
        .from(EventTable)
        .where(
          and(
            eq(EventTable.aggregate_id, invocation.envelope.sessionID),
            eq(EventTable.type, EventV2.versionedType(FutureAttentionEvent.Finalized.type, 1)),
          ),
        )
        .all()
      expect(finalizationEvents).toHaveLength(1)
      expect(finalizationEvents[0]?.data).toMatchObject({
        sessionID: invocation.envelope.sessionID,
        groupID: claim.groupID,
        receipt: { id: finalized.id, outcome: "served" },
      })

      const duplicateInvocation = yield* seedContinuationInvocation(
        db,
        "claim-serve-a2-duplicate",
        invocation,
        command,
        completedAt + 3,
      )
      const duplicate = yield* db.transaction((tx) =>
        FutureAttention.reserve(tx, { ...duplicateInvocation, settlement: { time: completedAt + 4, order: 7 } }),
      )
      expect(duplicate).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "already_applied",
          effectID: appliedAdmission.effectID,
          changes: appliedAdmission.changes,
          claim: { groupID: claim.groupID, claimState: "served", finalizationReceiptID: finalized.id },
        },
      })
      expect(duplicateInvocation.envelope.occurrenceID).toBe(invocation.envelope.occurrenceID)
      expect(duplicateInvocation.envelope.assistantMessageID).not.toBe(invocation.envelope.assistantMessageID)
      const conflictCommand = {
        operations: [
          {
            ...command.operations[0],
            service: {
              ...command.operations[0].service,
              rationale: "A changed A2 rationale is a changed semantic intent and cannot rebind the terminal group.",
            },
          },
        ],
      }
      const conflictInvocation = yield* seedContinuationInvocation(
        db,
        "claim-serve-a3-conflict",
        invocation,
        conflictCommand,
        completedAt + 5,
      )
      const conflict = yield* db.transaction((tx) =>
        FutureAttention.reserve(tx, { ...conflictInvocation, settlement: { time: completedAt + 6, order: 8 } }),
      )
      expect(conflict).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "error",
          code: "semantic_conflict",
          detail: { effectID: appliedAdmission.effectID, occurrenceID: invocation.envelope.occurrenceID },
        },
      })

      const replay = yield* db.transaction((tx) =>
        FutureAttention.reserve(tx, { ...invocation, settlement: { time: completedAt + 7, order: 9 } }),
      )
      expect(replay.type).toBe("replay")
      if (replay.type !== "replay") return yield* Effect.die("Expected exact physical replay")
      expect(JSON.stringify(replay.settlement)).toBe(admissionBytes)
      expect(replay.settlement).toMatchObject({
        claim: { groupID: claim.groupID, claimState: "pending", claimStateAtAdmission: "pending" },
      })

      const concern = yield* readConcernView(db, concernID, completedAt + 7)
      const group = yield* db.transaction((tx) =>
        FutureAttention.read(tx, { type: "claim_group", groupID: claim.groupID }, { now: completedAt + 7 }),
      )
      expect(concern.concern.current.disposition).toBe("served")
      expect(concern.claim).toMatchObject({ groupID: claim.groupID, claimState: "served" })
      expect(group.items[0]).toMatchObject({ receipt: { id: finalized.id, outcome: "served" } })

      const emptyCreated = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "claim-empty-create",
          createCommand(endpoint, "Remain open when the exact Assistant has no eligible output"),
          createdAt + 100,
        ),
        createdAt + 102,
      )
      if (emptyCreated.outcome !== "applied") return yield* Effect.die("Expected no-output concern")
      const emptyConcernID = (emptyCreated as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const emptyClaimTime = completedAt + 100
      const emptyCommand = {
        operations: [
          {
            type: "serve" as const,
            concernID: emptyConcernID,
            expectedVersion: 0,
            service: {
              source: { type: "current_assistant_when_complete" as const },
              rationale: "Only an eligible exact Assistant output could realize this retained purpose.",
            },
          },
        ],
      }
      const emptyInvocation = yield* seedAgentInvocation(db, "claim-empty", emptyCommand, emptyClaimTime)
      const emptyAdmission = yield* applyFutureInvocation(db, emptyInvocation, emptyClaimTime + 2)
      const emptyApplied = emptyAdmission as FutureAttention.AppliedSettlement
      if (emptyAdmission.outcome !== "applied" || !emptyApplied.claim) {
        return yield* Effect.die("Expected no-output pending claim")
      }
      const emptyClaim = emptyApplied.claim
      const emptyCompletedAt = emptyClaimTime + 20
      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          yield* TurnLifecycle.settleTool(tx, {
            turnID: emptyInvocation.envelope.turnID,
            partID: emptyInvocation.envelope.partID,
            state: "completed",
            time: emptyCompletedAt - 1,
          })
          yield* tx
            .update(PartTable)
            .set({
              data: {
                type: "tool",
                tool: FutureAttention.UPDATE_CAPABILITY,
                callID: emptyInvocation.envelope.providerCallID,
                state: {
                  status: "completed",
                  input: emptyCommand,
                  output: JSON.stringify(emptyAdmission),
                  title: "Update future attention",
                  metadata: {},
                  time: { start: emptyClaimTime + 1, end: emptyCompletedAt - 1 },
                },
              } as (typeof PartTable.$inferInsert)["data"],
              time_updated: emptyCompletedAt - 1,
            })
            .where(eq(PartTable.id, emptyInvocation.envelope.partID))
            .run()
          yield* tx
            .update(MessageTable)
            .set({
              data: {
                ...assistantData(emptyInvocation.envelope.parentUserMessageID, emptyClaimTime + 1),
                time: { created: emptyClaimTime + 1, completed: emptyCompletedAt },
              },
              time_updated: emptyCompletedAt,
            })
            .where(eq(MessageTable.id, emptyInvocation.envelope.assistantMessageID))
            .run()
        }),
      )
      const emptyCompletion = yield* db.transaction((tx) =>
        FutureAttention.observeClaimGroupCompletion(tx, {
          groupID: emptyClaim.groupID,
          completionOrder: 8,
          observationCut: "live_presentation_finalized",
        }),
      )
      if (!emptyCompletion) return yield* Effect.die("Expected no-output completion facts")
      expect(emptyCompletion).toMatchObject({
        assistantMessageID: emptyInvocation.envelope.assistantMessageID,
        presentationCommitted: true,
        localToolPartsTerminal: true,
        eligibleOutputBytes: 0,
      })
      const emptyFinalized = yield* FutureAttention.finalizeClaimGroup(events, {
        groupID: emptyClaim.groupID,
        completion: emptyCompletion as FutureAttention.CompletionFacts,
        settlement: { time: emptyCompletedAt + 1, order: 9 },
      })
      expect(emptyFinalized).toMatchObject({
        outcome: "not_served",
        members: [{ concernID: emptyConcernID, outcome: "not_served", reason: "no_eligible_output" }],
      })
      const emptyConcern = yield* readConcernView(db, emptyConcernID, emptyCompletedAt + 2)
      expect(emptyConcern).toMatchObject({
        concern: { current: { disposition: "open", version: 0 } },
        claim: { groupID: emptyClaim.groupID, claimState: "not_served", finalizationReceiptID: emptyFinalized.id },
      })
      const allFinalizationEvents = yield* db
        .select()
        .from(EventTable)
        .where(eq(EventTable.type, EventV2.versionedType(FutureAttentionEvent.Finalized.type, 1)))
        .all()
      expect(allFinalizationEvents).toHaveLength(2)
    }),
  )

  eventIt.effect("finalizes a pending claim from exact Turn tombstones after supported Session deletion", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const events = yield* EventV2.Service
      const endpoint = yield* createCourseEndpoint()
      const createdAt = Date.parse("2036-08-07T01:00:00Z")
      const created = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "deleted-claim-create",
          createCommand(endpoint, "Explain the retained deletion boundary later"),
          createdAt,
        ),
        createdAt + 2,
      )
      if (created.outcome !== "applied") return yield* Effect.die("Expected deletion-recovery concern")
      const concernID = (created as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const claimTime = createdAt + 100
      const command = {
        operations: [
          {
            type: "serve" as const,
            concernID,
            expectedVersion: 0,
            service: {
              source: { type: "current_assistant_when_complete" as const },
              rationale: "Only the exact claiming Assistant may serve this concern.",
            },
          },
        ],
      }
      const invocation = yield* seedAgentInvocation(db, "deleted-claim", command, claimTime)
      const admission = yield* applyFutureInvocation(db, invocation, claimTime + 2)
      const appliedAdmission = admission as FutureAttention.AppliedSettlement
      if (admission.outcome !== "applied" || !appliedAdmission.claim) {
        return yield* Effect.die("Expected one pending deletion-recovery claim")
      }
      const groupID = appliedAdmission.claim.groupID
      const interruptedAt = claimTime + 20
      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          yield* TurnLifecycle.settleTool(tx, {
            turnID: invocation.envelope.turnID,
            partID: invocation.envelope.partID,
            state: "completed",
            time: interruptedAt - 1,
          })
          yield* TurnLifecycle.settle(tx, {
            turnID: invocation.envelope.turnID,
            outcome: "interrupted",
            reason: "learner_interrupt",
            time: interruptedAt,
          })
          yield* TurnLifecycle.deleteSessionTree(tx, {
            rootSessionID: invocation.envelope.sessionID,
            sessionIDs: [invocation.envelope.sessionID],
            timeDeleted: interruptedAt + 1,
          })
        }),
      )

      expect(
        yield* db
          .select({ id: SessionTable.id })
          .from(SessionTable)
          .where(eq(SessionTable.id, invocation.envelope.sessionID))
          .get(),
      ).toBeUndefined()
      expect(yield* db.transaction((tx) => TurnLifecycle.lookup(tx, invocation.envelope.turnID))).toMatchObject({
        type: "source_unavailable",
        source: {
          turnID: invocation.envelope.turnID,
          sessionID: invocation.envelope.sessionID,
          outcome: "interrupted",
        },
        models: [
          {
            turnID: invocation.envelope.turnID,
            assistantMessageID: invocation.envelope.assistantMessageID,
            causalOccurrenceID: invocation.envelope.occurrenceID,
            state: "completed",
          },
        ],
        tools: [
          {
            turnID: invocation.envelope.turnID,
            assistantMessageID: invocation.envelope.assistantMessageID,
            partID: invocation.envelope.partID,
            callID: invocation.envelope.providerCallID,
          },
        ],
      })
      const invalidTombstone = yield* Effect.exit(
        db.run(sql`
          UPDATE turn_unavailable_model
          SET state = 'running', time_settled = ${interruptedAt}
          WHERE turn_id = ${invocation.envelope.turnID}
            AND assistant_message_id = ${invocation.envelope.assistantMessageID}
        `),
      )
      expect(invalidTombstone._tag).toBe("Failure")
      if (invalidTombstone._tag === "Failure") {
        expect(Cause.pretty(invalidTombstone.cause)).toContain("turn_unavailable_model terminal fields are invalid")
      }
      const completion = yield* db.transaction((tx) =>
        FutureAttention.observeClaimGroupCompletion(tx, {
          groupID,
          completionOrder: 4,
          observationCut: "startup_reconciled",
        }),
      )
      expect(completion).toMatchObject({
        sessionID: invocation.envelope.sessionID,
        turnID: invocation.envelope.turnID,
        occurrenceID: invocation.envelope.occurrenceID,
        assistantMessageID: invocation.envelope.assistantMessageID,
        modelOperationID: invocation.envelope.assistantMessageID,
        invocationPartID: invocation.envelope.partID,
        modelOutcome: "completed",
        localToolPartsTerminal: true,
        presentationCommitted: false,
        presentationUnavailable: true,
        eligibleOutputBytes: 0,
      })
      if (!completion) return yield* Effect.die("Expected completion facts from exact Turn tombstones")
      const receipt = yield* FutureAttention.finalizeClaimGroup(events, {
        groupID,
        completion,
        settlement: { time: interruptedAt + 2, order: 5 },
      })
      expect(receipt).toMatchObject({
        groupID,
        outcome: "not_served",
        members: [{ concernID, outcome: "not_served", reason: "presentation_unavailable" }],
      })
      expect(yield* db.transaction((tx) => FutureAttention.listPendingClaimGroups(tx))).toHaveLength(0)
      expect(yield* readConcernView(db, concernID, interruptedAt + 3)).toMatchObject({
        concern: { current: { disposition: "open", version: 0 } },
        claim: { groupID, claimState: "not_served", finalizationReceiptID: receipt.id },
      })
    }),
  )

  eventIt.effect("binds completion to a replacement-generated successor and preserves it open on non-service", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const events = yield* EventV2.Service
      const endpoint = yield* createCourseEndpoint()
      const createdAt = Date.parse("2036-08-07T01:00:00Z")
      const created = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(db, "nested-claim-create", createCommand(endpoint, "Explain A later"), createdAt),
        createdAt + 2,
      )
      if (created.outcome !== "applied") return yield* Effect.die("Expected nested-claim predecessor")
      const predecessorID = (created as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const predecessor = yield* readConcernView(db, predecessorID, createdAt + 5)
      const claimTime = Date.parse("2036-08-07T02:01:00Z")
      const command = {
        operations: [
          {
            type: "replace" as const,
            concernID: predecessorID,
            expectedVersion: predecessor.concern.current.version,
            mutation: agentCorrection(predecessor, "Correct A to B while retaining an exact completion claim."),
            successorSource: { type: "preserve_predecessor_source" as const },
            concern: replacementConcern(endpoint, "Explain corrected B now"),
            successorDisposition: {
              type: "serve_current_assistant_when_complete" as const,
              service: {
                rationale: "The exact full current Assistant presentation explains corrected B.",
              },
            },
          },
        ],
      } satisfies FutureAttention.ChangeSetCommand
      const invocation = yield* seedAgentInvocation(db, "nested-claim-serve", command, claimTime)
      const admission = yield* applyFutureInvocation(db, invocation, claimTime + 2)
      const appliedAdmission = admission as FutureAttention.AppliedSettlement
      if (admission.outcome !== "applied" || !appliedAdmission.claim) {
        return yield* Effect.die("Expected nested successor claim")
      }
      const claim = appliedAdmission.claim
      const change = (admission as FutureAttention.AppliedSettlement).changes[0]!
      if (change.operation !== "replace") return yield* Effect.die("Expected nested replacement")
      const successorID = change.successorConcernID
      expect(admission).toMatchObject({
        claim: { claimState: "pending", claimStateAtAdmission: "pending" },
        changes: [
          {
            concernID: predecessorID,
            disposition: "superseded",
            successorConcernID: successorID,
            successorVersion: 0,
            successorDisposition: "open",
          },
        ],
      })
      const completedAt = claimTime + 20
      yield* commitClaimingAssistant(db, "nested-claim-serve", invocation, command, admission, completedAt, {
        text: "Corrected B uses a semaphore permit bound, so at most the configured number of workers can enter.",
        structured: { type: "future_attention_trace", target: "B" },
      })
      const completion = yield* db.transaction((tx) =>
        FutureAttention.observeClaimGroupCompletion(tx, {
          groupID: claim.groupID,
          completionOrder: 4,
          observationCut: "live_presentation_finalized",
        }),
      )
      if (!completion) return yield* Effect.die("Expected nested successor completion")
      expect(completion).toMatchObject({
        observationCut: "live_presentation_finalized",
        assistantMessageID: invocation.envelope.assistantMessageID,
      })
      expect(typeof completion.finalStructuredOutputFingerprint).toBe("string")
      const receipt = yield* FutureAttention.finalizeClaimGroup(events, {
        groupID: claim.groupID,
        completion,
        settlement: { time: completedAt + 1, order: 5 },
      })
      expect(receipt).toMatchObject({
        outcome: "served",
        members: [{ concernID: successorID, outcome: "served" }],
      })
      expect((yield* readConcernView(db, predecessorID, completedAt + 2)).concern.current.disposition).toBe(
        "superseded",
      )
      expect((yield* readConcernView(db, successorID, completedAt + 2)).concern.current.disposition).toBe("served")

      const failedCreated = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "nested-empty-create",
          createCommand(endpoint, "Correct C later"),
          createdAt + 100,
        ),
        createdAt + 102,
      )
      if (failedCreated.outcome !== "applied") return yield* Effect.die("Expected non-service predecessor")
      const failedPredecessorID = (failedCreated as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const failedPredecessor = yield* readConcernView(db, failedPredecessorID, createdAt + 105)
      const failedCommand = {
        operations: [
          {
            type: "replace" as const,
            concernID: failedPredecessorID,
            expectedVersion: failedPredecessor.concern.current.version,
            mutation: agentCorrection(
              failedPredecessor,
              "Correct C to D even if the presentation supplies no service output.",
            ),
            successorSource: { type: "preserve_predecessor_source" as const },
            concern: replacementConcern(endpoint, "Explain corrected D now"),
            successorDisposition: {
              type: "serve_current_assistant_when_complete" as const,
              service: { rationale: "Only an eligible exact current presentation may explain corrected D." },
            },
          },
        ],
      } satisfies FutureAttention.ChangeSetCommand
      const failedInvocation = yield* seedAgentInvocation(db, "nested-empty-serve", failedCommand, claimTime + 100)
      const failedAdmission = yield* applyFutureInvocation(db, failedInvocation, claimTime + 102)
      const appliedFailedAdmission = failedAdmission as FutureAttention.AppliedSettlement
      if (failedAdmission.outcome !== "applied" || !appliedFailedAdmission.claim) {
        return yield* Effect.die("Expected non-service successor claim")
      }
      const failedClaim = appliedFailedAdmission.claim
      const failedChange = (failedAdmission as FutureAttention.AppliedSettlement).changes[0]!
      if (failedChange.operation !== "replace") return yield* Effect.die("Expected non-service replacement")
      yield* commitClaimingAssistant(
        db,
        "nested-empty-serve",
        failedInvocation,
        failedCommand,
        failedAdmission,
        claimTime + 120,
      )
      const failedCompletion = yield* db.transaction((tx) =>
        FutureAttention.observeClaimGroupCompletion(tx, {
          groupID: failedClaim.groupID,
          completionOrder: 6,
          observationCut: "live_presentation_finalized",
        }),
      )
      if (!failedCompletion) return yield* Effect.die("Expected terminal non-service facts")
      const failedReceipt = yield* FutureAttention.finalizeClaimGroup(events, {
        groupID: failedClaim.groupID,
        completion: failedCompletion,
        settlement: { time: claimTime + 121, order: 7 },
      })
      expect(failedReceipt).toMatchObject({
        outcome: "not_served",
        members: [{ concernID: failedChange.successorConcernID, outcome: "not_served", reason: "no_eligible_output" }],
      })
      expect((yield* readConcernView(db, failedPredecessorID, claimTime + 122)).concern.current.disposition).toBe(
        "superseded",
      )
      expect(
        (yield* readConcernView(db, failedChange.successorConcernID, claimTime + 122)).concern.current,
      ).toMatchObject({
        disposition: "open",
        version: 0,
      })
    }),
  )

  it.effect("keeps every admitted text field bounded and proves the maximum semantic value fits", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const endpoint = yield* createCourseEndpoint()
      const maximumInteger = Number.MAX_SAFE_INTEGER
      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          yield* tx
            .update(CourseTable)
            .set({ state_version: maximumInteger })
            .where(eq(CourseTable.id, endpoint.courseID))
            .run()
          yield* tx
            .update(CourseViewTable)
            .set({ state_version: maximumInteger })
            .where(eq(CourseViewTable.id, endpoint.viewID))
            .run()
          yield* tx
            .update(CourseViewRevisionStateTable)
            .set({ state_version: maximumInteger })
            .where(eq(CourseViewRevisionStateTable.revision_id, endpoint.revisionID))
            .run()
          yield* tx
            .update(CourseWorkingSelectionTable)
            .set({ version: maximumInteger })
            .where(eq(CourseWorkingSelectionTable.course_id, endpoint.courseID))
            .run()
        }),
      )
      const boundedCreates = Array.from(
        { length: FutureAttention.MAX_OPERATIONS },
        (_, index) => createCommand(endpoint, `Distinct retained purpose ${index}`).operations[0],
      )
      const ordered = FutureAttention.canonicalizeCommand({ operations: boundedCreates })
      const reversed = FutureAttention.canonicalizeCommand({ operations: [...boundedCreates].reverse() })
      expect(reversed).toEqual(ordered)
      expect(ordered.operations).toHaveLength(FutureAttention.MAX_OPERATIONS)
      expect(() => FutureAttention.canonicalizeCommand({ operations: [] })).toThrow(FutureAttention.InvalidCommandError)
      expect(() =>
        FutureAttention.canonicalizeCommand({
          operations: [...boundedCreates, createCommand(endpoint, "Ninth retained purpose").operations[0]],
        }),
      ).toThrow(FutureAttention.InvalidCommandError)
      expect(() =>
        FutureAttention.canonicalizeCommand({ operations: [boundedCreates[0]!, boundedCreates[0]!] }),
      ).toThrow(FutureAttention.InvalidCommandError)
      const longestZone = [...supportedNames()].sort(
        (left, right) => new TextEncoder().encode(right).byteLength - new TextEncoder().encode(left).byteLength,
      )[0]!
      const purpose = "p".repeat(FutureAttention.MAX_PURPOSE_BYTES)
      const excerpt = "e".repeat(FutureAttention.MAX_EXCERPT_BYTES)
      const command = {
        operations: [
          {
            type: "create" as const,
            concern: {
              purpose,
              source: {
                type: "interpreted_learner_request" as const,
                excerpt: { text: excerpt, startByte: 0, endByte: FutureAttention.MAX_EXCERPT_BYTES },
              },
              target: {
                endpoint,
                selection: {
                  type: "observed_working" as const,
                  revisionID: endpoint.revisionID,
                  version: maximumInteger,
                },
              },
              notBefore: {
                sourceExpression: "9999-12-31T23:59:59.999",
                localDateTime: "9999-12-31T23:59:59.999",
                timeZone: { type: "iana" as const, name: longestZone },
              },
              serviceTiming: "at_or_after_not_before" as const,
              interactionOrder: "learner_response_before_tutor_disclosure" as const,
            },
          },
        ],
      }
      expect(() => FutureAttention.canonicalizeCommand(command)).not.toThrow()
      const time = Date.parse("2036-08-07T01:00:00Z")
      const maximumInvocation = yield* seedAgentInvocation(db, "maximum-value", command, time, { userText: excerpt })
      const settled = yield* applyFutureInvocation(db, maximumInvocation, time + 2)
      if (settled.outcome !== "applied") return yield* Effect.die("Expected maximum valid concern")
      const concernID = (settled as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const view = yield* readConcernView(db, concernID, time + 5)
      const maximumPayload = view.concern.payload
      const unavailable = {
        state: "source_unavailable",
        reason: "source_deleted",
      } as const
      const maximumSemantic = FutureAttention.semanticValueFor(maximumPayload, unavailable)
      const semanticBytes = FutureAttention.semanticValueBytes(maximumPayload, unavailable)
      expect(longestZone).toBe("America/Argentina/ComodRivadavia")
      expect(Number.isSafeInteger(maximumInteger)).toBeTrue()
      expect(maximumPayload.target).toMatchObject({
        selection: { type: "observed_working", version: maximumInteger },
        receipt: {
          selection: { type: "observed_working", version: maximumInteger },
          courseVersion: maximumInteger,
          viewVersion: maximumInteger,
          revisionVersion: maximumInteger,
        },
      })
      expect(semanticBytes).toBe(1_877)
      expect(FutureAttention.MAX_SEMANTIC_VALUE_BYTES - semanticBytes).toBe(171)
      expect(LearningContext.boundedValue(LearningContext.toJsonValue(maximumSemantic))).toMatchObject({
        state: "value",
        value: { purpose, sourceAvailability: "source_unavailable" },
      })
      const noOrderBytes = FutureAttention.semanticValueBytes(
        { ...maximumPayload, interactionOrder: undefined },
        unavailable,
      )

      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          yield* TurnLifecycle.settleTool(tx, {
            turnID: maximumInvocation.envelope.turnID,
            partID: maximumInvocation.envelope.partID,
            state: "completed",
            time: time + 7,
          })
          yield* TurnLifecycle.settle(tx, {
            turnID: maximumInvocation.envelope.turnID,
            outcome: "completed",
            reason: "normal",
            time: time + 8,
          })
          yield* TurnLifecycle.deleteSessionTree(tx, {
            rootSessionID: maximumInvocation.envelope.sessionID,
            sessionIDs: [maximumInvocation.envelope.sessionID],
            timeDeleted: time + 9,
          })
        }),
      )
      expect((yield* readConcernView(db, concernID, maximumPayload.notBefore.instant)).sourceAvailability).toEqual(
        unavailable,
      )
      const contextInvocation = yield* seedAgentInvocation(
        db,
        "maximum-value-context",
        createCommand(endpoint, "Context admission for the maximum FutureAttention oracle"),
        maximumPayload.notBefore.instant,
      )

      const frontier = yield* db.transaction((tx) => LearningFrontier.read(tx))
      const prepared = yield* db.transaction((tx) =>
        LearningContext.prepareCut(tx, {
          operation: {
            sessionID: contextInvocation.envelope.sessionID,
            turnID: contextInvocation.envelope.turnID,
            inputID: contextInvocation.envelope.inputID,
            causalOccurrenceID: contextInvocation.envelope.occurrenceID,
            assistantMessageID: contextInvocation.envelope.assistantMessageID,
            ordinal: 0,
          },
          retainedSteering: {
            assistantMessageID: contextInvocation.envelope.assistantMessageID,
            cutAsOf: maximumPayload.notBefore.instant,
            throughSharedFrontier: frontier,
            fingerprint: "c".repeat(64),
          } as unknown as Parameters<typeof LearningContext.prepareCut>[1]["retainedSteering"],
          capabilityBasis: learningContextBasis(),
        }),
      )
      const section = prepared.cut.sections.find((item) => item.owner === "future_attention")
      expect(section).toMatchObject({
        coverage: "complete",
        countAtCut: 1,
        omission: { type: "none" },
        entries: [
          {
            locator: { lazyReadAvailable: true },
            semantic: {
              state: "value",
              value: maximumSemantic,
            },
          },
        ],
      })
      const semantic = section?.entries[0]?.semantic
      expect(semantic).toEqual({ state: "value", value: LearningContext.toJsonValue(maximumSemantic) })
      if (semantic?.state !== "value") return yield* Effect.die("Expected a complete maximum semantic value")
      expect(LearningContext.utf8Bytes(LearningContext.canonicalJson(semantic.value))).toBe(semanticBytes)
      expect(prepared.cut.budget.canonicalBytes).toBe(LearningContext.utf8Bytes(prepared.canonicalCut))
      expect(prepared.cut.budget.renderedBytes).toBe(LearningContext.utf8Bytes(prepared.renderedBlock))
      expect(prepared.cut.budget.canonicalBytes).toBeLessThanOrEqual(32_768)
      expect(prepared.cut.budget.renderedBytes).toBeLessThanOrEqual(16_384)
      expect({
        noOrderBytes,
        canonicalBytes: prepared.cut.budget.canonicalBytes,
        renderedBytes: prepared.cut.budget.renderedBytes,
      }).toEqual({
        noOrderBytes: 1_815,
        canonicalBytes: 11_114,
        renderedBytes: 7_517,
      })
      expect(prepared.canonicalCut).not.toContain(maximumPayload.notBefore.sourceExpression)
      const eagerDetail = LearningContext.canonicalJson(
        LearningContext.toJsonValue({
          ...(maximumSemantic as Readonly<Record<string, LearningContext.JsonValue>>),
          sourceExpression: maximumPayload.notBefore.sourceExpression,
          transitionHistory: [{ ...view.concern.current, rationale: "r".repeat(FutureAttention.MAX_RATIONALE_BYTES) }],
        }),
      )
      expect(LearningContext.utf8Bytes(eagerDetail) - semanticBytes).toBe(1_355)

      const oneOverPurpose = createCommand(endpoint, "p".repeat(FutureAttention.MAX_PURPOSE_BYTES + 1))
      expect(() => FutureAttention.canonicalizeCommand(oneOverPurpose)).toThrow(FutureAttention.InvalidCommandError)
      const temporalBase = createCommand(endpoint, "bounded temporal source")
      const maxTemporal = {
        operations: [
          {
            ...temporalBase.operations[0],
            concern: {
              ...temporalBase.operations[0].concern,
              notBefore: {
                ...temporalBase.operations[0].concern.notBefore,
                sourceExpression: "t".repeat(FutureAttention.MAX_TEMPORAL_EXPRESSION_BYTES),
              },
            },
          },
        ],
      } satisfies FutureAttention.ChangeSetCommand
      expect(() => FutureAttention.canonicalizeCommand(maxTemporal)).not.toThrow()
      expect(() =>
        FutureAttention.canonicalizeCommand({
          operations: [
            {
              ...maxTemporal.operations[0],
              concern: {
                ...maxTemporal.operations[0].concern,
                notBefore: {
                  ...maxTemporal.operations[0].concern.notBefore,
                  sourceExpression: "t".repeat(FutureAttention.MAX_TEMPORAL_EXPRESSION_BYTES + 1),
                },
              },
            },
          ],
        }),
      ).toThrow(FutureAttention.InvalidCommandError)
      const excerptBase = createCommand(endpoint, "bounded interpreted source")
      const maxExcerpt = {
        operations: [
          {
            ...excerptBase.operations[0],
            concern: {
              ...excerptBase.operations[0].concern,
              source: {
                type: "interpreted_learner_request" as const,
                excerpt: {
                  text: "e".repeat(FutureAttention.MAX_EXCERPT_BYTES),
                  startByte: 0,
                  endByte: FutureAttention.MAX_EXCERPT_BYTES,
                },
              },
            },
          },
        ],
      } satisfies FutureAttention.ChangeSetCommand
      expect(() => FutureAttention.canonicalizeCommand(maxExcerpt)).not.toThrow()
      expect(() =>
        FutureAttention.canonicalizeCommand({
          operations: [
            {
              ...maxExcerpt.operations[0],
              concern: {
                ...maxExcerpt.operations[0].concern,
                source: {
                  type: "interpreted_learner_request",
                  excerpt: {
                    text: "e".repeat(FutureAttention.MAX_EXCERPT_BYTES + 1),
                    startByte: 0,
                    endByte: FutureAttention.MAX_EXCERPT_BYTES + 1,
                  },
                },
              },
            },
          ],
        }),
      ).toThrow(FutureAttention.InvalidCommandError)
      const rationaleCommand = {
        operations: [
          {
            type: "serve" as const,
            concernID: FutureAttention.createConcernID(),
            expectedVersion: 0,
            service: {
              source: { type: "learner_occurrence" as const },
              rationale: "r".repeat(FutureAttention.MAX_RATIONALE_BYTES),
            },
          },
        ],
      }
      expect(() => FutureAttention.canonicalizeCommand(rationaleCommand)).not.toThrow()
      expect(() =>
        FutureAttention.canonicalizeCommand({
          operations: [rationaleCommand.operations[0], { ...rationaleCommand.operations[0], expectedVersion: 1 }],
        }),
      ).toThrow(FutureAttention.InvalidCommandError)
      expect(() =>
        FutureAttention.canonicalizeCommand({
          operations: [
            {
              type: "replace",
              concernID: rationaleCommand.operations[0].concernID,
              expectedVersion: 0,
              mutation: {
                type: "interpreted_learner_direction",
                excerpt: { text: "correct", startByte: 0, endByte: 7 },
              },
              successorSource: { type: "preserve_predecessor_source" },
              concern: replacementConcern(endpoint, "Missing disposition is illegal"),
            } as unknown as FutureAttention.Operation,
          ],
        }),
      ).toThrow(FutureAttention.InvalidCommandError)
      expect(() =>
        FutureAttention.canonicalizeCommand({
          operations: [
            {
              ...rationaleCommand.operations[0],
              service: { ...rationaleCommand.operations[0].service, rationale: "r".repeat(1_025) },
            },
          ],
        }),
      ).toThrow(FutureAttention.InvalidCommandError)
    }),
  )

  it.effect("keeps fixed-offset and IANA provenance distinct and enforces temporal service meaning", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const endpoint = yield* createCourseEndpoint()
      const time = Date.parse("2036-08-07T01:00:00Z")
      const fixed = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "time-fixed",
          createTimedCommand(endpoint, "Use an exact fixed offset", {
            sourceExpression: "2036-08-07T10:00:00+05:30",
            localDateTime: "2036-08-07T10:00:00",
            timeZone: { type: "fixed_offset", offsetMinutes: 330 },
          }),
          time,
          { timeZone: null },
        ),
        time + 2,
      )
      if (fixed.outcome !== "applied") return yield* Effect.die("Expected fixed-offset concern")
      const fixedView = yield* readConcernView(
        db,
        (fixed as FutureAttention.AppliedSettlement).changes[0]!.concernID,
        time + 5,
      )
      expect(fixedView.concern.payload.notBefore).toMatchObject({
        instant: Date.parse("2036-08-07T04:30:00Z"),
        utcOffsetMinutes: 330,
        resolvedZone: { type: "fixed_offset", offsetMinutes: 330 },
      })
      expect("releaseID" in fixedView.concern.payload.notBefore.resolvedZone).toBe(false)

      const contradictory = yield* seedAgentInvocation(
        db,
        "time-contradictory-expression",
        createTimedCommand(endpoint, "Reject contradictory exact temporal provenance", {
          sourceExpression: "2036-08-07T10:00:00+05:30",
          localDateTime: "2036-08-07T10:00:00",
          timeZone: { type: "fixed_offset", offsetMinutes: 0 },
        }),
        time,
      )
      const contradictoryError = yield* Effect.flip(
        db.transaction((tx) =>
          FutureAttention.reserve(tx, { ...contradictory, settlement: { time: time + 2, order: 1 } }),
        ),
      )
      expect(contradictoryError).toMatchObject({ reason: "validation_error" })
      expect(
        yield* db.get<{ count: number }>(
          sql`SELECT count(*) AS count FROM future_attention_change_set WHERE occurrence_id = ${contradictory.envelope.occurrenceID}`,
        ),
      ).toEqual({ count: 0 })

      for (const [suffix, sourceExpression] of [
        ["four-digit-fraction", "2036-08-07T10:00:00.0000+05:30"],
        ["unknown-offset", "2036-08-07T10:00:00-00:00"],
        ["unrepresentable-precision", "2036-08-07T10:00:00.0001+00:00"],
        ["underspecified-date", "2036-08-07"],
      ] as const) {
        const alternate = yield* seedAgentInvocation(
          db,
          `time-${suffix}`,
          createTimedCommand(endpoint, `Reject ${suffix} temporal provenance`, {
            sourceExpression,
            localDateTime: "2036-08-07T10:00:00",
            timeZone: { type: "fixed_offset", offsetMinutes: 0 },
          }),
          time,
        )
        const alternateError = yield* Effect.flip(
          db.transaction((tx) =>
            FutureAttention.reserve(tx, { ...alternate, settlement: { time: time + 2, order: 1 } }),
          ),
        )
        expect(alternateError).toMatchObject({ reason: "validation_error" })
        expect(
          yield* db.get<{ count: number }>(
            sql`SELECT count(*) AS count FROM future_attention_change_set WHERE occurrence_id = ${alternate.envelope.occurrenceID}`,
          ),
        ).toEqual({ count: 0 })
      }

      const alternateExact = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "time-lowercase-exact",
          createTimedCommand(endpoint, "Accept a representable lowercase exact temporal expression", {
            sourceExpression: "2036-08-07t10:00:00.0000z",
            localDateTime: "2036-08-07T10:00:00",
            timeZone: { type: "fixed_offset", offsetMinutes: 0 },
          }),
          time,
        ),
        time + 2,
      )
      expect(alternateExact).toMatchObject({ outcome: "applied" })

      const unavailableSource = yield* seedAgentInvocation(
        db,
        "time-source-unavailable",
        createTimedCommand(endpoint, "Require the unavailable source zone", {
          sourceExpression: "2036-08-07 10:00 source time",
          localDateTime: "2036-08-07T10:00:00",
          timeZone: { type: "source" },
        }),
        time,
        { timeZone: null },
      )
      const unavailableError = yield* Effect.flip(
        db.transaction((tx) =>
          FutureAttention.reserve(tx, { ...unavailableSource, settlement: { time: time + 2, order: 1 } }),
        ),
      )
      expect(unavailableError).toMatchObject({ reason: "validation_error" })

      const iana = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "time-iana",
          createTimedCommand(endpoint, "Retain exact IANA provenance", {
            sourceExpression: "2036-08-07 10:00 Asia/Kolkata",
            localDateTime: "2036-08-07T10:00:00",
            timeZone: { type: "iana", name: "Asia/Kolkata" },
          }),
          time,
          { timeZone: null },
        ),
        time + 2,
      )
      if (iana.outcome !== "applied") return yield* Effect.die("Expected IANA concern")
      const ianaView = yield* readConcernView(
        db,
        (iana as FutureAttention.AppliedSettlement).changes[0]!.concernID,
        time + 5,
      )
      expect(ianaView.concern.payload.notBefore).toMatchObject({
        instant: Date.parse("2036-08-07T04:30:00Z"),
        utcOffsetMinutes: 330,
        resolvedZone: { type: "iana", name: "Asia/Kolkata", releaseID: "iana-tzdb-2026c" },
      })

      const winter = Date.parse("2026-01-01T00:00:00Z")
      for (const [suffix, localDateTime] of [
        ["ambiguous", "2026-11-01T01:30:00"],
        ["nonexistent", "2026-03-08T02:30:00"],
      ] as const) {
        const invocation = yield* seedAgentInvocation(
          db,
          `time-${suffix}`,
          createTimedCommand(endpoint, `Reject ${suffix} civil time`, {
            sourceExpression: localDateTime,
            localDateTime,
            timeZone: { type: "iana", name: "America/New_York" },
          }),
          winter,
        )
        const error = yield* Effect.flip(
          db.transaction((tx) =>
            FutureAttention.reserve(tx, { ...invocation, settlement: { time: winter + 2, order: 1 } }),
          ),
        )
        expect(error).toMatchObject({ reason: "validation_error" })
      }

      const earlyCreate = yield* seedAgentInvocation(
        db,
        "time-create-too-early",
        createTimedCommand(endpoint, "Reject immediate same-turn future attention", {
          sourceExpression: "2036-08-07T09:00:00+08:00",
          localDateTime: "2036-08-07T09:00:00",
          timeZone: { type: "fixed_offset", offsetMinutes: 480 },
        }),
        time,
      )
      const earlyCreateError = yield* Effect.flip(
        db.transaction((tx) =>
          FutureAttention.reserve(tx, { ...earlyCreate, settlement: { time: time + 2, order: 1 } }),
        ),
      )
      expect(earlyCreateError).toMatchObject({ reason: "too_early" })

      const afterCreation = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "time-after-create",
          createTimedCommand(
            endpoint,
            "Allow explicit service before activation",
            {
              sourceExpression: "2036-08-08T10:00:00+08:00",
              localDateTime: "2036-08-08T10:00:00",
              timeZone: { type: "fixed_offset", offsetMinutes: 480 },
            },
            "after_creation",
          ),
          time,
        ),
        time + 2,
      )
      if (afterCreation.outcome !== "applied") return yield* Effect.die("Expected after-creation concern")
      const afterCreationID = (afterCreation as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const earlyServiceTime = time + 60_000
      const earlyService = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "time-after-create-serve",
          {
            operations: [
              {
                type: "serve",
                concernID: afterCreationID,
                expectedVersion: 0,
                service: {
                  source: { type: "learner_occurrence" },
                  rationale: "The later complete learner occurrence explicitly realizes the retained purpose.",
                },
              },
            ],
          },
          earlyServiceTime,
        ),
        earlyServiceTime + 2,
      )
      expect(earlyService).toMatchObject({ outcome: "applied", changes: [{ disposition: "served" }] })

      const delayed = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "time-delay-create",
          createTimedCommand(endpoint, "Require the delay to elapse", {
            sourceExpression: "2036-08-08T10:00:00+08:00",
            localDateTime: "2036-08-08T10:00:00",
            timeZone: { type: "fixed_offset", offsetMinutes: 480 },
          }),
          time,
        ),
        time + 2,
      )
      if (delayed.outcome !== "applied") return yield* Effect.die("Expected delayed concern")
      const delayedID = (delayed as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const rejectedService = yield* seedAgentInvocation(
        db,
        "time-delay-serve",
        {
          operations: [
            {
              type: "serve",
              concernID: delayedID,
              expectedVersion: 0,
              service: {
                source: { type: "learner_occurrence" },
                rationale: "This source is complete but occurs before the purpose-specific delay elapsed.",
              },
            },
          ],
        },
        earlyServiceTime,
      )
      const frontierBeforeRejectedService = yield* db.transaction((tx) => LearningFrontier.read(tx))
      const rejectedServiceResult = yield* db.transaction((tx) =>
        Effect.gen(function* () {
          const reserved = yield* FutureAttention.reserve(tx, {
            ...rejectedService,
            settlement: { time: earlyServiceTime + 2, order: 1 },
          })
          if (reserved.type !== "admitted") return yield* Effect.die("Expected early-service candidate admission")
          yield* FutureAttention.settlePolicy(tx, {
            partID: rejectedService.envelope.partID,
            outcome: "policy_allow",
            policyBasis: { source: "test" },
            time: earlyServiceTime + 3,
            order: 2,
          })
          return yield* FutureAttention.settle(tx, {
            partID: rejectedService.envelope.partID,
            settlement: { time: earlyServiceTime + 4, order: 3 },
          })
        }),
      )
      expect(rejectedServiceResult).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "validation_error", detail: { reason: "too_early" } },
      })
      expect(yield* db.transaction((tx) => LearningFrontier.read(tx))).toEqual(frontierBeforeRejectedService)
      expect(
        yield* db.get<{ changes: number; receipts: number; concerns: number }>(sql`
          SELECT
            (SELECT count(*) FROM future_attention_change_set
              WHERE occurrence_id = ${rejectedService.envelope.occurrenceID}) AS changes,
            (SELECT count(*) FROM learning_command_receipt
              WHERE invocation_part_id = ${rejectedService.envelope.partID}) AS receipts,
            (SELECT count(*) FROM future_attention_concern
              WHERE create_change_set_id IN (
                SELECT id FROM future_attention_change_set
                WHERE occurrence_id = ${rejectedService.envelope.occurrenceID}
              )) AS concerns
        `),
      ).toEqual({ changes: 0, receipts: 0, concerns: 0 })
      expect(
        yield* db.transaction((tx) =>
          FutureAttention.settle(tx, {
            partID: rejectedService.envelope.partID,
            settlement: { time: earlyServiceTime + 5, order: 4 },
          }),
        ),
      ).toEqual({ type: "replay", settlement: rejectedServiceResult.settlement })
    }),
  )

  it.effect("keeps exact target currentness separate from the working route and never retargets", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      yield* createCourseEndpoint()
      const course = yield* courses.createCourse({ title: "Non-default concurrency course" })
      const original = yield* courses.createView({
        courseID: course.id,
        name: "Original route",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: { items: [{ key: "semaphore", title: "Semaphore bounds" }] },
      })
      const selectedOriginal = yield* courses.select({
        courseID: course.id,
        revisionID: original.revision.id,
        expectedCourseVersion: 0,
        expectedSelectionVersion: 0,
        expectedViewVersion: 0,
        expectedRevisionVersion: 0,
      })
      const originalItems = yield* courses.listRevisionItems(course.id, original.view.id, original.revision.id)
      const originalItem = originalItems.items[0]
      if (!originalItem) return yield* Effect.die("Expected original membership")
      const endpoint = {
        courseID: course.id,
        viewID: original.view.id,
        revisionID: original.revision.id,
        itemID: originalItem.itemID,
      } satisfies Course.MembershipEndpoint
      const time = Date.parse("2036-08-07T01:00:00Z")
      const notBefore = {
        sourceExpression: "2036-08-07T10:00:00+08:00",
        localDateTime: "2036-08-07T10:00:00",
        timeZone: { type: "fixed_offset" as const, offsetMinutes: 480 },
      }
      const observed = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "target-observed",
          createTimedCommand(endpoint, "Follow the exact observed working selection", notBefore, "after_creation", {
            type: "observed_working",
            revisionID: endpoint.revisionID,
            version: selectedOriginal.version,
          }),
          time,
        ),
        time + 2,
      )
      const exact = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "target-exact",
          createTimedCommand(endpoint, "Keep the exact membership even after route change", notBefore),
          time,
        ),
        time + 2,
      )
      if (observed.outcome !== "applied" || exact.outcome !== "applied") {
        return yield* Effect.die("Expected both target-selection concerns")
      }
      const observedID = (observed as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const exactID = (exact as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const dueAt = Date.parse("2036-08-07T02:00:00Z")
      expect(
        (yield* db.transaction((tx) => FutureAttention.listEligibleForContext(tx, { now: dueAt }))).countAtCut,
      ).toBe(2)

      const alternate = yield* courses.createView({
        courseID: course.id,
        name: "Alternate route",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.tutorProposed(),
        revision: { items: [{ key: "locks", title: "Locking route" }] },
      })
      const selectedAlternate = yield* courses.select({
        courseID: course.id,
        revisionID: alternate.revision.id,
        expectedCourseVersion: 0,
        expectedSelectionRevisionID: original.revision.id,
        expectedSelectionVersion: selectedOriginal.version,
        expectedViewVersion: 0,
        expectedRevisionVersion: 0,
      })
      const observedAfterRouteChange = yield* readConcernView(db, observedID, dueAt)
      const exactAfterRouteChange = yield* readConcernView(db, exactID, dueAt)
      const routeChangedProjection = yield* db.transaction((tx) =>
        FutureAttention.listEligibleForContext(tx, { now: dueAt }),
      )
      expect(observedAfterRouteChange).toMatchObject({ targetStatus: "target_stale", eligible: false })
      expect(exactAfterRouteChange).toMatchObject({ targetStatus: "target_current", eligible: true })
      expect(routeChangedProjection).toMatchObject({
        countAtCut: 1,
        entries: [{ concern: { id: exactID, payload: { target: { endpoint } } } }],
      })

      yield* courses.withdrawRevision({
        courseID: course.id,
        viewID: original.view.id,
        revisionID: original.revision.id,
        expectedCourseVersion: 0,
        expectedViewVersion: 0,
        expectedRevisionVersion: 0,
        expectedSelectionRevisionID: alternate.revision.id,
        expectedSelectionVersion: selectedAlternate.version,
        selection: { type: "unchanged" },
      })
      const exactAfterWithdrawal = yield* readConcernView(db, exactID, dueAt)
      const withdrawnProjection = yield* db.transaction((tx) =>
        FutureAttention.listEligibleForContext(tx, { now: dueAt }),
      )
      expect(exactAfterWithdrawal).toMatchObject({ targetStatus: "target_missing", eligible: false })
      expect(exactAfterWithdrawal.concern.payload.target.endpoint).toEqual(endpoint)
      expect(withdrawnProjection).toMatchObject({ countAtCut: 0, entries: [] })
    }),
  )

  it.effect("paginates one immutable owner cut with exact count, omission, and byte bounds", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const endpoint = yield* createCourseEndpoint()
      const time = Date.parse("2036-08-07T01:00:00Z")
      const seeded = yield* Effect.forEach(
        Array.from({ length: 10 }, (_, index) => index),
        (index) =>
          Effect.gen(function* () {
            const invocation = yield* seedAgentInvocation(
              db,
              `read-${index.toString().padStart(2, "0")}`,
              createCommand(endpoint, `Bounded owner-read concern ${index.toString().padStart(2, "0")}`),
              time + index * 10,
            )
            const settled = yield* applyFutureInvocation(db, invocation, time + index * 10 + 2)
            if (settled.outcome !== "applied") return yield* Effect.die("Expected owner-read concern")
            return {
              concernID: (settled as FutureAttention.AppliedSettlement).changes[0]!.concernID,
              invocation,
            }
          }),
      )
      const concernIDs = seeded.map((item) => item.concernID)
      const dueAt = Date.parse("2036-08-07T02:00:00Z")
      const context = yield* db.transaction((tx) => FutureAttention.listEligibleForContext(tx, { now: dueAt }))
      expect(context).toMatchObject({ countAtCut: 10, omittedCount: 2, truncated: true })
      expect(context.entries).toHaveLength(FutureAttention.MAX_OPERATIONS)

      const frontier = yield* db.transaction((tx) => LearningFrontier.read(tx))
      const operation = seeded[0]!.invocation.envelope
      const prepared = yield* db.transaction((tx) =>
        LearningContext.prepareCut(tx, {
          operation: {
            sessionID: operation.sessionID,
            turnID: operation.turnID,
            inputID: operation.inputID,
            causalOccurrenceID: operation.occurrenceID,
            assistantMessageID: operation.assistantMessageID,
            ordinal: 0,
          },
          retainedSteering: {
            assistantMessageID: operation.assistantMessageID,
            cutAsOf: dueAt,
            throughSharedFrontier: frontier,
            fingerprint: "d".repeat(64),
          } as unknown as Parameters<typeof LearningContext.prepareCut>[1]["retainedSteering"],
          capabilityBasis: learningContextBasis(),
        }),
      )
      const section = prepared.cut.sections.find((item) => item.owner === "future_attention")
      expect(section).toMatchObject({
        coverage: "truncated",
        countAtCut: 10,
        omission: {
          type: "exact",
          omitted: 2,
          reasons: [{ reason: "candidate_limit", omitted: 2 }],
        },
      })
      expect(section?.entries).toHaveLength(FutureAttention.MAX_OPERATIONS)
      expect(section?.entries.map((entry) => entry.locator.concernID)).toEqual(
        context.entries.map((entry) => entry.concern.id),
      )
      expect(section?.entries.every((entry) => entry.locator.lazyReadAvailable === true)).toBeTrue()
      expect(prepared.renderedBlock).toContain("separate omission-honest owners compose and audit order never wins.")
      expect(prepared.renderedBlock).toContain(
        'FutureAttention: multiple unresolved; exactEligibleCount=10; omission={"omitted":2,"reasons":[{"omitted":2,"reason":"candidate_limit"}],"type":"exact"}.',
      )
      expect(prepared.renderedBlock).not.toContain("sole complete concern")
      expect(prepared.cut.budget.canonicalBytes).toBe(LearningContext.utf8Bytes(prepared.canonicalCut))
      expect(prepared.cut.budget.renderedBytes).toBe(LearningContext.utf8Bytes(prepared.renderedBlock))
      expect(prepared.cut.budget).toMatchObject({ canonicalBytes: 16_822, renderedBytes: 9_298 })

      const lazyConcern = yield* db.transaction((tx) =>
        FutureAttention.read(tx, { type: "concern", concernID: context.entries[0]!.concern.id }, { now: dueAt }),
      )
      expect(lazyConcern).toMatchObject({
        countAtCut: 1,
        returnedCount: 1,
        items: [{ concern: { payload: { purpose: "Bounded owner-read concern 00" } } }],
      })

      const query = { type: "list" as const, dispositions: ["open" as const] }
      const first = yield* db.transaction((tx) => FutureAttention.read(tx, query, { now: dueAt, limit: 3 }))
      expect(first).toMatchObject({ countAtCut: 10, returnedCount: 3, omittedCount: 7, truncated: true })
      expect(first.nextCursor).not.toBeNull()
      expect(first.canonicalBytes).toBeLessThanOrEqual(FutureAttention.MAX_READ_BYTES)

      const later = yield* applyFutureInvocation(
        db,
        yield* seedAgentInvocation(
          db,
          "read-after-cut",
          createCommand(endpoint, "Concern created after cursor cut"),
          time + 1_000,
        ),
        time + 1_002,
      )
      if (later.outcome !== "applied") return yield* Effect.die("Expected later concern")
      const laterID = (later as FutureAttention.AppliedSettlement).changes[0]!.concernID
      const second = yield* db.transaction((tx) =>
        FutureAttention.read(tx, query, { now: dueAt, limit: 3, cursor: first.nextCursor! }),
      )
      expect(second).toMatchObject({ countAtCut: 10, returnedCount: 3, omittedCount: 7, truncated: true })
      expect(second.ownerCut).toEqual(first.ownerCut)
      expect(second.items.some((item) => "concern" in item && item.concern.id === laterID)).toBe(false)
      expect(
        new Set([...first.items, ...second.items].flatMap((item) => ("concern" in item ? [item.concern.id] : []))).size,
      ).toBe(6)
      expect(concernIDs).toContain((first.items[0] as FutureAttention.ConcernView).concern.id)
      const fresh = yield* db.transaction((tx) => FutureAttention.read(tx, query, { now: dueAt, limit: 64 }))
      expect(fresh).toMatchObject({ countAtCut: 11, returnedCount: 11, truncated: false, nextCursor: null })

      const badCursor = yield* Effect.flip(
        db.transaction((tx) => FutureAttention.read(tx, query, { now: dueAt, cursor: "not-a-cursor" })),
      )
      expect(badCursor).toMatchObject({ reason: "validation_error" })
      const tinyBudget = yield* Effect.flip(
        db.transaction((tx) => FutureAttention.read(tx, query, { now: dueAt, byteLimit: 1 })),
      )
      expect(tinyBudget).toMatchObject({ reason: "capacity_exceeded" })
    }),
  )
})

function applyFutureInvocation(db: Database.Interface["db"], invocation: FutureAttention.Invocation, time: number) {
  return db.transaction((tx) =>
    Effect.gen(function* () {
      const reserved = yield* FutureAttention.reserve(tx, {
        ...invocation,
        settlement: { time, order: 1 },
      })
      if (reserved.type === "settled" || reserved.type === "replay") return reserved.settlement
      yield* FutureAttention.settlePolicy(tx, {
        partID: invocation.envelope.partID,
        outcome: "policy_allow",
        policyBasis: { source: "test", rule: "allow" },
        time: time + 1,
        order: 2,
      })
      const settled = yield* FutureAttention.settle(tx, {
        partID: invocation.envelope.partID,
        settlement: { time: time + 2, order: 3 },
      })
      return settled.settlement
    }),
  )
}

function readConcernView(db: Database.Interface["db"], concernID: FutureAttention.ConcernID, now: number) {
  return db.transaction((tx) =>
    Effect.gen(function* () {
      const page = yield* FutureAttention.read(tx, { type: "concern", concernID }, { now })
      const item = page.items[0]
      if (!item || !("concern" in item)) return yield* Effect.die(`Expected FutureAttention concern ${concernID}`)
      return item
    }),
  )
}

function agentCorrection(view: FutureAttention.ConcernView, rationale: string) {
  return {
    type: "agent_correction",
    rationale,
    ownerRead: {
      concernID: view.concern.id,
      expectedVersion: view.concern.current.version,
      headTransitionID: view.concern.current.id,
      cutFingerprint: view.ownerCut.fingerprint,
    },
  } as const
}

function replacementConcern(endpoint: Course.MembershipEndpoint, purpose: string) {
  return {
    purpose,
    target: { endpoint, selection: { type: "explicit_exact" } },
    notBefore: {
      sourceExpression: "2036-08-07T10:00:00+08:00",
      localDateTime: "2036-08-07T10:00:00",
      timeZone: { type: "fixed_offset", offsetMinutes: 480 },
    },
    serviceTiming: "at_or_after_not_before",
  } as const
}

function createCommand(endpoint: Course.MembershipEndpoint, purpose: string) {
  return {
    operations: [
      {
        type: "create",
        concern: {
          purpose,
          source: {
            type: "interpreted_learner_request",
            excerpt: { text: "Future attention", startByte: 0, endByte: 16 },
          },
          target: { endpoint, selection: { type: "explicit_exact" } },
          notBefore: {
            sourceExpression: "2036-08-07T10:00:00+08:00",
            localDateTime: "2036-08-07T10:00:00",
            timeZone: { type: "fixed_offset", offsetMinutes: 480 },
          },
          serviceTiming: "at_or_after_not_before",
        },
      },
    ],
  } as const satisfies FutureAttention.ChangeSetCommand
}

function createTimedCommand(
  endpoint: Course.MembershipEndpoint,
  purpose: string,
  notBefore: FutureAttention.ConcernPayloadIntent["notBefore"],
  serviceTiming: FutureAttention.ConcernPayloadIntent["serviceTiming"] = "at_or_after_not_before",
  selection: Course.MembershipSelection = { type: "explicit_exact" },
) {
  return {
    operations: [
      {
        type: "create",
        concern: {
          purpose,
          source: {
            type: "interpreted_learner_request",
            excerpt: { text: "Future attention", startByte: 0, endByte: 16 },
          },
          target: { endpoint, selection },
          notBefore,
          serviceTiming,
        },
      },
    ],
  } as const satisfies FutureAttention.ChangeSetCommand
}

function createCourseEndpoint() {
  return Effect.gen(function* () {
    const courses = yield* Course.Service
    const course = yield* courses.createCourse({ title: "Concurrency" })
    const view = yield* courses.createView({
      courseID: course.id,
      name: "Current view",
      expectedCourseVersion: 0,
      authorship: Course.Authorship.learnerAuthored(),
      revision: { items: [{ key: "semaphore", title: "Explain semaphore concurrency bounds" }] },
    })
    yield* courses.select({
      courseID: course.id,
      revisionID: view.revision.id,
      expectedCourseVersion: 0,
      expectedSelectionVersion: 0,
      expectedViewVersion: 0,
      expectedRevisionVersion: 0,
    })
    const items = yield* courses.listRevisionItems(course.id, view.view.id, view.revision.id)
    const item = items.items[0]
    if (!item) return yield* Effect.die("Expected one exact Course membership")
    return {
      courseID: course.id,
      viewID: view.view.id,
      revisionID: view.revision.id,
      itemID: item.itemID,
    } satisfies Course.MembershipEndpoint
  })
}

function seedAgentInvocation(
  db: Database.Interface["db"],
  suffix: string,
  command:
    | FutureAttention.ChangeSetCommand
    | ((occurrenceID: FutureAttention.Invocation["envelope"]["occurrenceID"]) => FutureAttention.ChangeSetCommand),
  time: number,
  options: Readonly<{
    timeZone?: string | null
    userText?: string
    completeSources?: Readonly<{
      assistantText?: string
      toolOutput?: string
      toolSourceUse?: "learner_usable" | "internal_control"
      childOutput?: unknown
    }>
  }> = {},
) {
  return Effect.gen(function* () {
    const sessionID = SessionSchema.ID.make(`ses_future_attention_${suffix}`)
    const userMessageID = SessionV1.MessageID.ascending(`msg_future_attention_user_${suffix}`)
    const userPartID = SessionV1.PartID.ascending(`prt_future_attention_user_${suffix}`)
    const assistantMessageID = SessionV1.MessageID.ascending(`msg_future_attention_assistant_${suffix}`)
    const partID = SessionV1.PartID.ascending(`prt_future_attention_tool_${suffix}`)
    const callID = `call-future-attention-${suffix}`
    const turnID = Turn.ID.create()
    const inputID = Turn.InputID.create()
    yield* db
      .insert(ProjectTable)
      .values({
        id: Project.ID.global,
        worktree: AbsolutePath.make("C:\\project"),
        sandboxes: [],
        time_created: time,
        time_updated: time,
      })
      .onConflictDoNothing()
      .run()
    yield* db
      .insert(SessionTable)
      .values({
        id: sessionID,
        project_id: Project.ID.global,
        slug: sessionID,
        directory: "C:\\project",
        title: suffix,
        version: "test",
        time_created: time,
        time_updated: time,
      })
      .run()
    yield* db
      .insert(MessageTable)
      .values({
        id: userMessageID,
        session_id: sessionID,
        data: userData(time),
        time_created: time,
        time_updated: time,
      })
      .run()
    yield* db
      .insert(PartTable)
      .values({
        id: userPartID,
        session_id: sessionID,
        message_id: userMessageID,
        data: {
          type: "text",
          text: options.userText ?? `Future attention ${suffix}`,
        } as (typeof PartTable.$inferInsert)["data"],
        time_created: time,
        time_updated: time,
      })
      .run()
    const admitted = yield* db.transaction((tx) =>
      Effect.gen(function* () {
        const occurrence = yield* LearningCommand.Occurrence.admit(tx, {
          admission: LearningCommand.LearnerAdmission.interactive({
            timeZone: options.timeZone === undefined ? "Asia/Shanghai" : options.timeZone,
          }),
          sessionID,
          messageID: userMessageID,
          timeAdmitted: time,
        })
        const resolvedCommand = typeof command === "function" ? command(occurrence.id) : command
        yield* TurnLifecycle.admit(tx, {
          kind: "learner",
          turnID,
          sessionID,
          inputID,
          messageID: userMessageID,
          occurrenceID: occurrence.id,
          limits: { model: 10, tool: 10 },
          envelope: { command: resolvedCommand },
          policyBasis: { source: "future-attention-test" },
          timeAdmitted: time,
        })
        return { occurrence, command: resolvedCommand }
      }),
    )
    const occurrence = admitted.occurrence
    const resolvedCommand = admitted.command
    if (options.completeSources) {
      yield* seedCompleteServiceSources(db, {
        suffix,
        turnID,
        inputID,
        occurrenceID: occurrence.id,
        sessionID,
        parentUserMessageID: userMessageID,
        time: time + 1,
        sources: options.completeSources,
      })
    }
    const invocationTime = options.completeSources ? time + 10 : time + 1
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx
          .insert(MessageTable)
          .values({
            id: assistantMessageID,
            session_id: sessionID,
            data: assistantData(userMessageID, invocationTime),
            time_created: invocationTime,
            time_updated: invocationTime,
          })
          .run()
        yield* tx
          .insert(PartTable)
          .values({
            id: partID,
            session_id: sessionID,
            message_id: assistantMessageID,
            data: {
              type: "tool",
              tool: FutureAttention.UPDATE_CAPABILITY,
              callID,
              state: { status: "pending", input: resolvedCommand, raw: JSON.stringify(resolvedCommand) },
            } as (typeof PartTable.$inferInsert)["data"],
            time_created: invocationTime,
            time_updated: invocationTime,
          })
          .run()
        yield* admitModelWithLearningContext(tx, {
          turnID,
          sessionID,
          assistantMessageID,
          requestEnvelope: { command: resolvedCommand },
          contextFingerprint: new Bun.CryptoHasher("sha256").update(`context:${suffix}`).digest("hex"),
          snapshotFrontier: yield* LearningFrontier.read(tx),
          timeAdmitted: invocationTime,
        })
        yield* TurnLifecycle.sealCandidateSet(tx, {
          turnID,
          sessionID,
          assistantMessageID,
          candidates: [
            { partID, callID, tool: FutureAttention.UPDATE_CAPABILITY, envelope: { command: resolvedCommand } },
          ],
          timeSealed: invocationTime,
        })
        yield* TurnLifecycle.settleModel(tx, {
          turnID,
          assistantMessageID,
          state: "completed",
          time: invocationTime,
        })
        yield* TurnLifecycle.admitTool(tx, {
          turnID,
          sessionID,
          assistantMessageID,
          partID,
          timeAdmitted: invocationTime,
        })
        yield* TurnLifecycle.consumeToolFrontier(tx, { partID, frontier: yield* LearningFrontier.read(tx) })
      }),
    )
    return {
      envelope: {
        occurrenceID: occurrence.id,
        turnID,
        inputID,
        sessionID,
        parentUserMessageID: userMessageID,
        assistantMessageID,
        partID,
        providerCallID: callID,
        emissionOrdinal: 0,
        capabilityIdentity: FutureAttention.UPDATE_CAPABILITY,
        capabilityVersion: FutureAttention.UPDATE_VERSION,
        authorizationBasis: "agent_action" as const,
        timeAdmitted: invocationTime,
      },
      command: resolvedCommand,
    } satisfies FutureAttention.Invocation
  }).pipe(Effect.orDie)
}

function completeServiceSourceIDs(suffix: string) {
  return {
    assistantMessageID: SessionV1.MessageID.ascending(`msg_future_attention_source_assistant_${suffix}`),
    assistantTextPartID: SessionV1.PartID.ascending(`prt_future_attention_source_text_${suffix}`),
    toolPartID: SessionV1.PartID.ascending(`prt_future_attention_source_tool_${suffix}`),
    taskPartID: SessionV1.PartID.ascending(`prt_future_attention_source_task_${suffix}`),
  }
}

function seedCompleteServiceSources(
  db: Database.Interface["db"],
  input: Readonly<{
    suffix: string
    turnID: Turn.ID
    inputID: Turn.InputID
    occurrenceID: FutureAttention.Invocation["envelope"]["occurrenceID"]
    sessionID: SessionSchema.ID
    parentUserMessageID: SessionV1.MessageID
    time: number
    sources: Readonly<{
      assistantText?: string
      toolOutput?: string
      toolSourceUse?: "learner_usable" | "internal_control"
      childOutput?: unknown
    }>
  }>,
) {
  return Effect.gen(function* () {
    const ids = completeServiceSourceIDs(input.suffix)
    const toolCallID = `call-future-attention-source-tool-${input.suffix}`
    const taskCallID = `call-future-attention-source-task-${input.suffix}`
    const candidates = [
      ...(input.sources.toolOutput === undefined
        ? []
        : [
            {
              partID: ids.toolPartID,
              callID: toolCallID,
              tool: "read",
              envelope: { source: "fixture" },
              futureAttentionServiceSource: input.sources.toolSourceUse ?? "learner_usable",
            },
          ]),
      ...(input.sources.childOutput === undefined
        ? []
        : [{ partID: ids.taskPartID, callID: taskCallID, tool: "task", envelope: { source: "fixture" } }]),
    ]
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx
          .insert(MessageTable)
          .values({
            id: ids.assistantMessageID,
            session_id: input.sessionID,
            data: assistantData(input.parentUserMessageID, input.time),
            time_created: input.time,
            time_updated: input.time,
          })
          .run()
        if (input.sources.assistantText !== undefined) {
          yield* tx
            .insert(PartTable)
            .values({
              id: ids.assistantTextPartID,
              session_id: input.sessionID,
              message_id: ids.assistantMessageID,
              data: { type: "text", text: input.sources.assistantText } as (typeof PartTable.$inferInsert)["data"],
              time_created: input.time,
              time_updated: input.time,
            })
            .run()
        }
        if (input.sources.toolOutput !== undefined) {
          yield* tx
            .insert(PartTable)
            .values({
              id: ids.toolPartID,
              session_id: input.sessionID,
              message_id: ids.assistantMessageID,
              data: {
                type: "tool",
                tool: "read",
                callID: toolCallID,
                state: { status: "pending", input: { path: "fixture" }, raw: "{}" },
              } as (typeof PartTable.$inferInsert)["data"],
              time_created: input.time,
              time_updated: input.time,
            })
            .run()
        }
        if (input.sources.childOutput !== undefined) {
          yield* tx
            .insert(PartTable)
            .values({
              id: ids.taskPartID,
              session_id: input.sessionID,
              message_id: ids.assistantMessageID,
              data: {
                type: "tool",
                tool: "task",
                callID: taskCallID,
                state: { status: "pending", input: { prompt: "Return a bounded explanation" }, raw: "{}" },
              } as (typeof PartTable.$inferInsert)["data"],
              time_created: input.time,
              time_updated: input.time,
            })
            .run()
        }
        yield* admitModelWithLearningContext(tx, {
          turnID: input.turnID,
          sessionID: input.sessionID,
          assistantMessageID: ids.assistantMessageID,
          requestEnvelope: {
            inputID: input.inputID,
            occurrenceID: input.occurrenceID,
            sources: input.sources,
          },
          contextFingerprint: new Bun.CryptoHasher("sha256").update(`source-context:${input.suffix}`).digest("hex"),
          snapshotFrontier: yield* LearningFrontier.read(tx),
          timeAdmitted: input.time,
        })
        yield* TurnLifecycle.sealCandidateSet(tx, {
          turnID: input.turnID,
          sessionID: input.sessionID,
          assistantMessageID: ids.assistantMessageID,
          candidates,
          timeSealed: input.time + 1,
        })
        yield* TurnLifecycle.settleModel(tx, {
          turnID: input.turnID,
          assistantMessageID: ids.assistantMessageID,
          state: "completed",
          time: input.time + 2,
        })
        if (input.sources.toolOutput !== undefined) {
          yield* TurnLifecycle.admitTool(tx, {
            turnID: input.turnID,
            sessionID: input.sessionID,
            assistantMessageID: ids.assistantMessageID,
            partID: ids.toolPartID,
            timeAdmitted: input.time + 3,
          })
          yield* TurnLifecycle.consumeToolFrontier(tx, {
            partID: ids.toolPartID,
            frontier: yield* LearningFrontier.read(tx),
          })
          yield* TurnLifecycle.settleTool(tx, {
            turnID: input.turnID,
            partID: ids.toolPartID,
            state: "completed",
            time: input.time + 4,
          })
          yield* tx
            .update(PartTable)
            .set({
              data: {
                type: "tool",
                tool: "read",
                callID: toolCallID,
                state: {
                  status: "completed",
                  input: { path: "fixture" },
                  output: input.sources.toolOutput,
                  title: "Read fixture",
                  metadata: {},
                  time: { start: input.time + 3, end: input.time + 4 },
                },
              } as (typeof PartTable.$inferInsert)["data"],
              time_updated: input.time + 4,
            })
            .where(eq(PartTable.id, ids.toolPartID))
            .run()
        }
      }),
    )

    if (input.sources.childOutput !== undefined) {
      const childSessionID = SessionSchema.ID.make(`ses_future_attention_source_child_${input.suffix}`)
      const childTurnID = Turn.ID.create()
      const childInputID = Turn.InputID.create()
      const childMessageID = SessionV1.MessageID.ascending(`msg_future_attention_source_child_${input.suffix}`)
      const childPartID = SessionV1.PartID.ascending(`prt_future_attention_source_child_${input.suffix}`)
      const childAssistantMessageID = SessionV1.MessageID.ascending(
        `msg_future_attention_source_child_assistant_${input.suffix}`,
      )
      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          yield* TurnLifecycle.admitTool(tx, {
            turnID: input.turnID,
            sessionID: input.sessionID,
            assistantMessageID: ids.assistantMessageID,
            partID: ids.taskPartID,
            timeAdmitted: input.time + 3,
          })
          yield* TurnLifecycle.consumeToolFrontier(tx, {
            partID: ids.taskPartID,
            frontier: yield* LearningFrontier.read(tx),
          })
          yield* tx
            .insert(SessionTable)
            .values({
              id: childSessionID,
              project_id: Project.ID.global,
              parent_id: input.sessionID,
              slug: childSessionID,
              directory: "C:\\project",
              title: `child-${input.suffix}`,
              version: "test",
              time_created: input.time + 4,
              time_updated: input.time + 4,
            })
            .run()
          yield* tx
            .insert(MessageTable)
            .values({
              id: childMessageID,
              session_id: childSessionID,
              data: userData(input.time + 4),
              time_created: input.time + 4,
              time_updated: input.time + 4,
            })
            .run()
          yield* tx
            .insert(PartTable)
            .values({
              id: childPartID,
              session_id: childSessionID,
              message_id: childMessageID,
              data: {
                type: "text",
                text: "Return the requested complete source",
              } as (typeof PartTable.$inferInsert)["data"],
              time_created: input.time + 4,
              time_updated: input.time + 4,
            })
            .run()
          yield* TurnLifecycle.admit(tx, {
            kind: "delegated_task",
            turnID: childTurnID,
            sessionID: childSessionID,
            inputID: childInputID,
            messageID: childMessageID,
            limits: { model: 1, tool: 0 },
            envelope: { kind: "delegated_task", requestedOutput: "answer" },
            policyBasis: { source: "future-attention-test" },
            delegatedCapability: { tools: ["read"] },
            parentTurnID: input.turnID,
            parentTaskPartID: ids.taskPartID,
            parentModelMessageID: ids.assistantMessageID,
            depthLimit: 1,
            timeAdmitted: input.time + 4,
          })
          yield* tx
            .insert(MessageTable)
            .values({
              id: childAssistantMessageID,
              session_id: childSessionID,
              data: assistantData(childMessageID, input.time + 5),
              time_created: input.time + 5,
              time_updated: input.time + 5,
            })
            .run()
          yield* admitModelWithLearningContext(tx, {
            turnID: childTurnID,
            sessionID: childSessionID,
            assistantMessageID: childAssistantMessageID,
            requestEnvelope: { requestedOutput: "answer" },
            contextFingerprint: new Bun.CryptoHasher("sha256").update(`child-context:${input.suffix}`).digest("hex"),
            snapshotFrontier: yield* LearningFrontier.read(tx),
            timeAdmitted: input.time + 5,
          })
          yield* TurnLifecycle.sealCandidateSet(tx, {
            turnID: childTurnID,
            sessionID: childSessionID,
            assistantMessageID: childAssistantMessageID,
            candidates: [],
            timeSealed: input.time + 5,
          })
          yield* TurnLifecycle.settleModel(tx, {
            turnID: childTurnID,
            assistantMessageID: childAssistantMessageID,
            state: "completed",
            time: input.time + 5,
          })
          yield* tx
            .update(MessageTable)
            .set({
              data: {
                ...assistantData(childMessageID, input.time + 5),
                time: { created: input.time + 5, completed: input.time + 5 },
              },
              time_updated: input.time + 5,
            })
            .where(eq(MessageTable.id, childAssistantMessageID))
            .run()
          yield* TurnLifecycle.settle(tx, {
            turnID: childTurnID,
            outcome: "completed",
            reason: "normal",
            time: input.time + 6,
          })
          yield* TurnLifecycle.recordChildResult(tx, {
            parentTurnID: input.turnID,
            parentSessionID: input.sessionID,
            parentTaskPartID: ids.taskPartID,
            childTurnID,
            childSessionID,
            requestedOutput: { state: "complete", value: input.sources.childOutput },
            timeSettled: input.time + 7,
          })
          yield* TurnLifecycle.settleTool(tx, {
            turnID: input.turnID,
            partID: ids.taskPartID,
            state: "completed",
            time: input.time + 8,
          })
          yield* tx
            .update(PartTable)
            .set({
              data: {
                type: "tool",
                tool: "task",
                callID: taskCallID,
                state: {
                  status: "completed",
                  input: { prompt: "Return a bounded explanation" },
                  output: JSON.stringify(input.sources.childOutput),
                  title: "Completed child task",
                  metadata: {},
                  time: { start: input.time + 3, end: input.time + 8 },
                },
              } as (typeof PartTable.$inferInsert)["data"],
              time_updated: input.time + 8,
            })
            .where(eq(PartTable.id, ids.taskPartID))
            .run()
        }),
      )
    }

    yield* db
      .update(MessageTable)
      .set({
        data: {
          ...assistantData(input.parentUserMessageID, input.time),
          time: { created: input.time, completed: input.time + 8 },
        },
        time_updated: input.time + 8,
      })
      .where(eq(MessageTable.id, ids.assistantMessageID))
      .run()
  }).pipe(Effect.orDie)
}

function seedContinuationInvocation(
  db: Database.Interface["db"],
  suffix: string,
  original: FutureAttention.Invocation,
  command: FutureAttention.ChangeSetCommand,
  time: number,
) {
  return Effect.gen(function* () {
    const assistantMessageID = SessionV1.MessageID.ascending(`msg_future_attention_assistant_${suffix}`)
    const partID = SessionV1.PartID.ascending(`prt_future_attention_tool_${suffix}`)
    const callID = `call-future-attention-${suffix}`
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx
          .insert(MessageTable)
          .values({
            id: assistantMessageID,
            session_id: original.envelope.sessionID,
            data: assistantData(original.envelope.parentUserMessageID, time),
            time_created: time,
            time_updated: time,
          })
          .run()
        yield* tx
          .insert(PartTable)
          .values({
            id: partID,
            session_id: original.envelope.sessionID,
            message_id: assistantMessageID,
            data: {
              type: "tool",
              tool: FutureAttention.UPDATE_CAPABILITY,
              callID,
              state: { status: "pending", input: command, raw: JSON.stringify(command) },
            } as (typeof PartTable.$inferInsert)["data"],
            time_created: time,
            time_updated: time,
          })
          .run()
        const frontier = yield* LearningFrontier.read(tx)
        yield* admitModelWithLearningContext(tx, {
          turnID: original.envelope.turnID,
          sessionID: original.envelope.sessionID,
          assistantMessageID,
          requestEnvelope: { command },
          contextFingerprint: new Bun.CryptoHasher("sha256").update(`context:${suffix}`).digest("hex"),
          snapshotFrontier: frontier,
          timeAdmitted: time,
        })
        yield* TurnLifecycle.sealCandidateSet(tx, {
          turnID: original.envelope.turnID,
          sessionID: original.envelope.sessionID,
          assistantMessageID,
          candidates: [{ partID, callID, tool: FutureAttention.UPDATE_CAPABILITY, envelope: { command } }],
          timeSealed: time,
        })
        yield* TurnLifecycle.settleModel(tx, {
          turnID: original.envelope.turnID,
          assistantMessageID,
          state: "completed",
          time,
        })
        yield* TurnLifecycle.admitTool(tx, {
          turnID: original.envelope.turnID,
          sessionID: original.envelope.sessionID,
          assistantMessageID,
          partID,
          timeAdmitted: time,
        })
        yield* TurnLifecycle.consumeToolFrontier(tx, { partID, frontier: yield* LearningFrontier.read(tx) })
      }),
    )
    return {
      envelope: {
        ...original.envelope,
        assistantMessageID,
        partID,
        providerCallID: callID,
        emissionOrdinal: 0,
        timeAdmitted: time,
      },
      command,
    } satisfies FutureAttention.Invocation
  }).pipe(Effect.orDie)
}

function commitClaimingAssistant(
  db: Database.Interface["db"],
  suffix: string,
  invocation: FutureAttention.Invocation,
  command: FutureAttention.ChangeSetCommand,
  output: unknown,
  completedAt: number,
  presentation: Readonly<{ text?: string; structured?: unknown }> = {},
) {
  return db.transaction((tx) =>
    Effect.gen(function* () {
      yield* TurnLifecycle.settleTool(tx, {
        turnID: invocation.envelope.turnID,
        partID: invocation.envelope.partID,
        state: "completed",
        time: completedAt - 1,
      })
      yield* tx
        .update(PartTable)
        .set({
          data: {
            type: "tool",
            tool: FutureAttention.UPDATE_CAPABILITY,
            callID: invocation.envelope.providerCallID,
            state: {
              status: "completed",
              input: command,
              output: JSON.stringify(output),
              title: "Update future attention",
              metadata: {},
              time: { start: invocation.envelope.timeAdmitted, end: completedAt - 1 },
            },
          } as (typeof PartTable.$inferInsert)["data"],
          time_updated: completedAt - 1,
        })
        .where(eq(PartTable.id, invocation.envelope.partID))
        .run()
      if (presentation.text) {
        yield* tx
          .insert(PartTable)
          .values({
            id: SessionV1.PartID.ascending(`prt_future_attention_text_${suffix}`),
            session_id: invocation.envelope.sessionID,
            message_id: invocation.envelope.assistantMessageID,
            data: {
              type: "text",
              text: presentation.text,
              time: { start: invocation.envelope.timeAdmitted, end: completedAt },
            } as (typeof PartTable.$inferInsert)["data"],
            time_created: completedAt,
            time_updated: completedAt,
          })
          .run()
      }
      yield* tx
        .update(MessageTable)
        .set({
          data: {
            ...assistantData(invocation.envelope.parentUserMessageID, invocation.envelope.timeAdmitted),
            ...(presentation.structured === undefined ? {} : { structured: presentation.structured }),
            time: { created: invocation.envelope.timeAdmitted, completed: completedAt },
          },
          time_updated: completedAt,
        })
        .where(eq(MessageTable.id, invocation.envelope.assistantMessageID))
        .run()
    }),
  )
}

function learningContextBasis(): LearningContext.CapabilityBasis {
  const route = {
    runtime: "ai_sdk",
    provider: "test-provider",
    model: "test-model",
    protocol: "language-model-v3",
    compiler: {
      sourcePackage: "test-provider",
      sourceVersion: "1",
      projector: "test",
      projectorVersion: 1,
      promptFields: ["messages"],
      publicQuery: [],
      credentialQuery: [],
      bodyCredentials: [],
      compilerAuth: "api_key",
      terminalRoutes: [],
    },
    transport: {
      method: "POST",
      endpoint: { protocol: "https:", host: "provider.test", pathname: "/v1", query: [] },
    },
  } as const
  const providerSurface = LearningContext.bindProviderToolSurface({
    route,
    toolChoice: { state: "absent" },
    definitions: LearningContext.LAZY_READ_CAPABILITY_IDS.map((id) => ({ id, value: { type: "function", name: id } })),
  })
  return {
    catalogVersion: LearningContext.CAPABILITY_CATALOG_VERSION,
    policyFingerprint: "b".repeat(64),
    effectiveAutomaticContext: true,
    effectiveLazyReadCapabilities: [...LearningContext.LAZY_READ_CAPABILITY_IDS],
    effectiveProviderToolSurfaceBinding: providerSurface.binding,
  }
}

function userData(time: number): Omit<SessionV1.User, "id" | "sessionID"> {
  return { role: "user", time: { created: time }, agent: "repa", model }
}

function assistantData(parentID: SessionV1.MessageID, time: number): Omit<SessionV1.Assistant, "id" | "sessionID"> {
  return {
    role: "assistant",
    time: { created: time },
    parentID,
    modelID: model.modelID,
    providerID: model.providerID,
    mode: "repa",
    agent: "repa",
    path: { cwd: "C:\\project", root: "C:\\project" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }
}
