import { describe, expect, setSystemTime } from "bun:test"
import { Course } from "@opencode-ai/core/course"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import { LearnerStateJudgment } from "@opencode-ai/core/learner-state-judgment"
import {
  LearnerStateJudgmentEffectTable,
  LearnerStateJudgmentNoChangeSealTable,
  LearnerStateJudgmentRevisionTable,
  LearnerStateJudgmentTable,
} from "@opencode-ai/core/learner-state-judgment/sql"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearningContext } from "@opencode-ai/core/learning-context"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { MaterialMap } from "@opencode-ai/core/material-map"
import { ModelV2 } from "@opencode-ai/core/model"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { MessageTable, PartTable, SessionTable } from "@opencode-ai/core/session/sql"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { TurnLearningContext } from "@opencode-ai/core/turn/learning-context"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { sql } from "drizzle-orm"
import { Cause, Effect, Layer } from "effect"
import { admitModelWithLearningContext } from "./fixture/model-admission"
import { testEffect } from "./lib/effect"

const database = Database.layerFromPath(":memory:").pipe(Layer.orDie)
const it = testEffect(LayerNode.compile(LayerNode.group([Course.node, Database.node]), [[Database.node, database]]))
const model = { modelID: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }

describe.serial("LearnerStateJudgment", () => {
  it.effect("keeps exact Goal and material anchors readable in the Context directory cursor", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const projection = yield* db.transaction((tx) =>
        LearnerStateJudgment.listEligibleForContext(tx, {
          asOf: Date.parse("2038-01-01T08:00:00Z"),
          eligibleAnchors: [
            {
              type: "goal_revision",
              goalID: LearnerGoal.createGoalID(),
              revisionID: LearnerGoal.createRevisionID(),
              version: 1,
            },
            {
              type: "material_selector",
              mapID: MaterialMap.createMapID(),
              selectorID: MaterialMap.createSelectorID(),
            },
          ],
        }),
      )
      expect(LearnerStateJudgment.inspectDirectoryCursor(projection.directoryCursor)).toMatchObject({
        ownerCut: projection.ownerCut,
        asOf: projection.asOf,
        eligibleAnchorCount: 2,
        eligibleAnchorsFingerprint: projection.eligibleAnchorsFingerprint,
      })
    }),
  )

  it.effect("keeps the maximum directory anchor frontier compact and exactly inspectable", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const projection = yield* db.transaction((tx) =>
        LearnerStateJudgment.listEligibleForContext(tx, {
          asOf: Date.parse("2038-01-01T08:30:00Z"),
          eligibleAnchors: Array.from({ length: LearnerStateJudgment.MAX_DIRECTORY_ANCHORS }, () => ({
            type: "material_selector" as const,
            mapID: MaterialMap.createMapID(),
            selectorID: MaterialMap.createSelectorID(),
          })),
        }),
      )
      expect(projection.eligibleAnchorCount).toBe(LearnerStateJudgment.MAX_DIRECTORY_ANCHORS)
      expect(projection.directoryCursor.length).toBeLessThan(5_000)
      expect(LearnerStateJudgment.inspectDirectoryCursor(projection.directoryCursor)).toMatchObject({
        ownerCut: projection.ownerCut,
        asOf: projection.asOf,
        eligibleAnchorCount: LearnerStateJudgment.MAX_DIRECTORY_ANCHORS,
        eligibleAnchorsFingerprint: projection.eligibleAnchorsFingerprint,
      })
      expect(
        LearnerStateJudgment.inspectDirectoryCursor(
          `${projection.directoryCursor.slice(0, -1)}${projection.directoryCursor.endsWith("A") ? "B" : "A"}`,
        ),
      ).toBeUndefined()
    }),
  )

  it.effect("keeps fuzzy learner state source-bearing, correctable, and distinct from mastery", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-01-01T09:00:00Z")
      const firstText = "I understand the definition, but applying the invariant is still shaky."
      const first = yield* seedAgentInvocation(
        db,
        "first",
        createCommand(firstText, snapshot("Application remains uncertain")),
        firstText,
        time,
      )
      const applied = yield* applyInvocation(db, first, time + 2)
      expect(applied).toMatchObject({ type: "settled", settlement: { outcome: "applied", version: 1 } })
      if (applied.type !== "settled" || !isAppliedLearnerStateSettlement(applied.settlement)) {
        return yield* Effect.die("Expected the learner-state judgment to apply")
      }
      const appliedRevision = applied.settlement

      const current = yield* db.transaction((tx) =>
        LearnerStateJudgment.readCurrent(tx, appliedRevision.judgmentID, time + 10),
      )
      if (!current) return yield* Effect.die("Expected a current learner-state projection")
      expect(current).toMatchObject({
        judgmentRevisionRef: {
          judgmentID: appliedRevision.judgmentID,
          revisionID: appliedRevision.revisionID,
          version: 1,
        },
        currentRelation: "current",
        revision: {
          disposition: "active",
          snapshot: {
            subject: { label: "Semaphore safety invariant", scope: { type: "learner_home" } },
            judgmentBody: "Application remains uncertain",
            basisScope: "whole_judgment",
            exactBasis: [],
          },
          authorAndCause: { type: "interpreted_learner_report" },
        },
      })
      const regressedClockRead = yield* db.transaction((tx) =>
        LearnerStateJudgment.readCurrent(tx, appliedRevision.judgmentID, time - 1_000),
      )
      expect(regressedClockRead?.asOf).toBe(regressedClockRead?.ownerCut.frontierTime)

      const correctionText = "Correction: I am also unsure what the invariant means."
      const corrected = yield* seedAgentInvocation(
        db,
        "correction",
        {
          operation: "revise",
          judgmentID: current.judgmentRevisionRef.judgmentID,
          expectedHead: expectedHead(current),
          cause: learnerCorrection(correctionText),
          snapshot: snapshot("Definition and application both remain uncertain"),
          rationale: "Keep later teaching aligned with the learner's correction.",
        },
        correctionText,
        time + 20,
      )
      const revised = yield* applyInvocation(db, corrected, time + 22)
      expect(revised).toMatchObject({ type: "settled", settlement: { outcome: "applied", version: 2 } })
      const after = yield* db.transaction((tx) =>
        LearnerStateJudgment.readCurrent(tx, current.judgmentRevisionRef.judgmentID, time + 30),
      )
      expect(after).toMatchObject({
        revision: {
          version: 2,
          snapshot: { judgmentBody: "Definition and application both remain uncertain" },
          authorAndCause: { type: "learner_correction" },
        },
      })
      expect(
        yield* db.transaction((tx) =>
          LearnerStateJudgment.readExactRevision(
            tx,
            current.judgmentRevisionRef.judgmentID,
            current.judgmentRevisionRef.revisionID,
          ),
        ),
      ).toEqual(current.revision)
    }),
  )

  it.effect("closes a no-change semantic address and preserves physical replay truth", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-01-02T09:00:00Z")
      const text = "I still need application-focused help with the semaphore invariant."
      const created = yield* seedAgentInvocation(
        db,
        "no_change_create",
        createCommand(text, snapshot("Needs application practice")),
        text,
        time,
      )
      const applied = yield* applyInvocation(db, created, time + 2)
      if (applied.type !== "settled" || !isAppliedLearnerStateSettlement(applied.settlement)) {
        return yield* Effect.die("Expected a learner-state fixture")
      }
      const appliedRevision = applied.settlement
      const current = yield* db.transaction((tx) =>
        LearnerStateJudgment.readCurrent(tx, appliedRevision.judgmentID, time + 10),
      )
      if (!current) return yield* Effect.die("Expected a current learner-state fixture")
      const correction = "Nothing changed; keep the same learner-state judgment."
      const command = {
        operation: "revise" as const,
        judgmentID: current.judgmentRevisionRef.judgmentID,
        expectedHead: expectedHead(current),
        cause: learnerCorrection(correction),
        snapshot: snapshot("Needs application practice"),
        rationale: "This exact correction is intentionally a no-effect update.",
      }
      const first = yield* seedAgentInvocation(db, "no_change_first", command, correction, time + 20)
      const racing = yield* seedFollowupAgentInvocation(db, first, "no_change_racing", command, time + 21)
      expect(
        yield* db.transaction((tx) =>
          LearnerStateJudgment.reserve(tx, {
            ...racing,
            settlement: { time: time + 21, order: 1 },
          }),
        ),
      ).toMatchObject({ type: "admitted" })
      const settled = yield* applyInvocation(db, first, time + 22)
      expect(settled).toMatchObject({
        type: "settled",
        settlement: { outcome: "no_change", existingOutcome: "materialized_no_change" },
      })

      const recoveredRacing = yield* db.transaction((tx) =>
        LearnerStateJudgment.recover(tx, {
          partID: racing.envelope.partID,
          settlement: { time: time + 27, order: 4 },
        }),
      )
      expect(recoveredRacing).toMatchObject({
        type: "settled",
        settlement: { outcome: "no_change", existingOutcome: "same_no_change" },
      })
      if (recoveredRacing.type !== "settled") return yield* Effect.die("Expected no-change race recovery")
      expect(
        yield* db.transaction((tx) =>
          LearnerStateJudgment.recover(tx, {
            partID: racing.envelope.partID,
            settlement: { time: time + 28, order: 5 },
          }),
        ),
      ).toEqual({ type: "replay", settlement: recoveredRacing.settlement })

      const duplicate = yield* seedFollowupAgentInvocation(db, first, "no_change_duplicate", command, time + 30)
      expect(yield* applyInvocation(db, duplicate, time + 32)).toMatchObject({
        type: "settled",
        settlement: { outcome: "no_change", existingOutcome: "same_no_change" },
      })
      const changed = yield* seedFollowupAgentInvocation(
        db,
        first,
        "no_change_conflict",
        { ...command, snapshot: snapshot("A changed payload cannot reuse the closed semantic address") },
        time + 40,
      )
      expect(yield* applyInvocation(db, changed, time + 42)).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "semantic_conflict" },
      })
      expect(yield* db.select().from(LearnerStateJudgmentRevisionTable).all()).toHaveLength(1)
      expect(yield* db.select().from(LearnerStateJudgmentNoChangeSealTable).all()).toHaveLength(1)
    }),
  )

  it.effect("seals changed and no-change proof while preserving it across Session deletion", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-01-02T11:00:00Z")
      const source = "I still need application-focused help with the semaphore invariant."
      const created = yield* seedAgentInvocation(
        db,
        "sealed_session_create",
        createCommand(source, snapshot("Needs application-focused teaching")),
        source,
        time,
      )
      const applied = yield* applyInvocation(db, created, time + 2)
      if (applied.type !== "settled" || !isAppliedLearnerStateSettlement(applied.settlement)) {
        return yield* Effect.die("Expected a sealed learner-state revision")
      }
      const settlement = applied.settlement
      const current = yield* db.transaction((tx) =>
        LearnerStateJudgment.readCurrent(tx, settlement.judgmentID, time + 10),
      )
      if (!current) return yield* Effect.die("Expected a current learner-state revision")
      const correction = "That remains the right approximation; keep it unchanged."
      const noChange = yield* seedAgentInvocation(
        db,
        "sealed_session_no_change",
        {
          operation: "revise",
          judgmentID: settlement.judgmentID,
          expectedHead: expectedHead(current),
          cause: learnerCorrection(correction),
          snapshot: snapshot("Needs application-focused teaching"),
          rationale: "Exercise a truthful no-change settlement.",
        },
        correction,
        time + 20,
      )
      expect(yield* applyInvocation(db, noChange, time + 22)).toMatchObject({
        type: "settled",
        settlement: { outcome: "no_change", existingOutcome: "materialized_no_change" },
      })

      const attacks = [
        {
          statement: sql`DELETE FROM learner_state_judgment_disposition
            WHERE invocation_part_id = ${created.envelope.partID}`,
          message: "Sealed learner-state disposition cannot be deleted",
        },
        {
          statement: sql`DELETE FROM learner_state_judgment_capability_settlement
            WHERE invocation_part_id = ${created.envelope.partID}`,
          message: "Sealed learner-state capability settlement cannot be deleted",
        },
        {
          statement: sql`DELETE FROM learner_state_judgment_disposition
            WHERE invocation_part_id = ${noChange.envelope.partID}`,
          message: "Sealed learner-state disposition cannot be deleted",
        },
        {
          statement: sql`DELETE FROM learner_state_judgment_capability_settlement
            WHERE invocation_part_id = ${noChange.envelope.partID}`,
          message: "Sealed learner-state capability settlement cannot be deleted",
        },
      ]
      yield* Effect.forEach(
        attacks,
        (attack) =>
          Effect.gen(function* () {
            const rejected = yield* Effect.exit(db.run(attack.statement))
            expect(rejected._tag).toBe("Failure")
            if (rejected._tag === "Failure") expect(Cause.pretty(rejected.cause)).toContain(attack.message)
          }),
        { discard: true },
      )

      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          yield* TurnLifecycle.settleTool(tx, {
            turnID: created.envelope.turnID,
            partID: created.envelope.partID,
            state: "completed",
            time: time + 30,
          })
          yield* TurnLifecycle.settleTool(tx, {
            turnID: noChange.envelope.turnID,
            partID: noChange.envelope.partID,
            state: "completed",
            time: time + 31,
          })
          yield* TurnLifecycle.settle(tx, {
            turnID: created.envelope.turnID,
            outcome: "completed",
            reason: "normal",
            time: time + 32,
          })
          yield* TurnLifecycle.deleteSessionTree(tx, {
            rootSessionID: created.envelope.sessionID,
            sessionIDs: [created.envelope.sessionID],
            timeDeleted: time + 33,
          })
          yield* TurnLifecycle.settleTool(tx, {
            turnID: noChange.envelope.turnID,
            partID: noChange.envelope.partID,
            state: "completed",
            time: time + 34,
          })
          yield* TurnLifecycle.settle(tx, {
            turnID: noChange.envelope.turnID,
            outcome: "completed",
            reason: "normal",
            time: time + 35,
          })
          yield* TurnLifecycle.deleteSessionTree(tx, {
            rootSessionID: noChange.envelope.sessionID,
            sessionIDs: [noChange.envelope.sessionID],
            timeDeleted: time + 36,
          })
        }),
      )

      expect(
        yield* db.get<{ count: number }>(sql`
          SELECT count(*) AS count FROM session
          WHERE id IN (${created.envelope.sessionID}, ${noChange.envelope.sessionID})
        `),
      ).toEqual({ count: 0 })
      expect(
        yield* db.get<{
          changedInvocations: number
          changedReceipts: number
          changedDispositions: number
          changedCapabilities: number
          effects: number
          revisions: number
          commitSeals: number
          noChangeInvocations: number
          noChangeReceipts: number
          noChangeDispositions: number
          noChangeCapabilities: number
          noChangeSeals: number
        }>(sql`
          SELECT
            (SELECT count(*) FROM learning_command_invocation
              WHERE part_id = ${created.envelope.partID}) AS changedInvocations,
            (SELECT count(*) FROM learning_command_receipt
              WHERE invocation_part_id = ${created.envelope.partID}) AS changedReceipts,
            (SELECT count(*) FROM learner_state_judgment_disposition
              WHERE invocation_part_id = ${created.envelope.partID}) AS changedDispositions,
            (SELECT count(*) FROM learner_state_judgment_capability_settlement
              WHERE invocation_part_id = ${created.envelope.partID}) AS changedCapabilities,
            (SELECT count(*) FROM learner_state_judgment_effect
              WHERE invocation_part_id = ${created.envelope.partID}) AS effects,
            (SELECT count(*) FROM learner_state_judgment_revision
              WHERE judgment_id = ${settlement.judgmentID}) AS revisions,
            (SELECT count(*) FROM learner_state_judgment_commit_seal
              WHERE invocation_part_id = ${created.envelope.partID}) AS commitSeals,
            (SELECT count(*) FROM learning_command_invocation
              WHERE part_id = ${noChange.envelope.partID}) AS noChangeInvocations,
            (SELECT count(*) FROM learning_command_receipt
              WHERE invocation_part_id = ${noChange.envelope.partID}) AS noChangeReceipts,
            (SELECT count(*) FROM learner_state_judgment_disposition
              WHERE invocation_part_id = ${noChange.envelope.partID}) AS noChangeDispositions,
            (SELECT count(*) FROM learner_state_judgment_capability_settlement
              WHERE invocation_part_id = ${noChange.envelope.partID}) AS noChangeCapabilities,
            (SELECT count(*) FROM learner_state_judgment_no_change_seal
              WHERE invocation_part_id = ${noChange.envelope.partID}) AS noChangeSeals
        `),
      ).toEqual({
        changedInvocations: 1,
        changedReceipts: 1,
        changedDispositions: 1,
        changedCapabilities: 1,
        effects: 1,
        revisions: 1,
        commitSeals: 1,
        noChangeInvocations: 1,
        noChangeReceipts: 1,
        noChangeDispositions: 1,
        noChangeCapabilities: 1,
        noChangeSeals: 1,
      })
      expect(
        yield* db.transaction((tx) =>
          LearnerStateJudgment.readExactRevision(tx, settlement.judgmentID, settlement.revisionID),
        ),
      ).toEqual(current.revision)
      expect(yield* db.all(sql.raw("PRAGMA foreign_key_check"))).toEqual([])
    }),
  )

  it.effect("deletes no-effect learner-state command evidence with its Session", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-01-02T13:00:00Z")
      const source = "Do not retain this proposed learner-state judgment."
      const invocation = yield* seedAgentInvocation(
        db,
        "denied_session_cleanup",
        createCommand(source, snapshot("This denied candidate must not become durable truth")),
        source,
        time,
      )
      const reserved = yield* db.transaction((tx) =>
        LearnerStateJudgment.reserve(tx, { ...invocation, settlement: { time: time + 2, order: 1 } }),
      )
      if (reserved.type !== "admitted") return yield* Effect.die("Expected an admitted learner-state candidate")
      yield* db.transaction((tx) =>
        LearnerStateJudgment.settlePolicy(tx, {
          partID: invocation.envelope.partID,
          outcome: "policy_deny",
          policyBasis: { source: "learner-state-test", rule: "deny" },
          time: time + 3,
          order: 2,
        }),
      )
      expect(
        yield* db.transaction((tx) =>
          LearnerStateJudgment.settle(tx, {
            partID: invocation.envelope.partID,
            settlement: { time: time + 4, order: 3 },
          }),
        ),
      ).toMatchObject({ type: "settled", settlement: { outcome: "error", code: "permission_rejected" } })

      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          yield* TurnLifecycle.settleTool(tx, {
            turnID: invocation.envelope.turnID,
            partID: invocation.envelope.partID,
            state: "completed",
            time: time + 5,
          })
          yield* TurnLifecycle.settle(tx, {
            turnID: invocation.envelope.turnID,
            outcome: "completed",
            reason: "normal",
            time: time + 6,
          })
          yield* TurnLifecycle.deleteSessionTree(tx, {
            rootSessionID: invocation.envelope.sessionID,
            sessionIDs: [invocation.envelope.sessionID],
            timeDeleted: time + 7,
          })
        }),
      )
      expect(
        yield* db.get<{
          sessions: number
          invocations: number
          receipts: number
          dispositions: number
          capabilities: number
          effects: number
          noChangeSeals: number
        }>(sql`
          SELECT
            (SELECT count(*) FROM session WHERE id = ${invocation.envelope.sessionID}) AS sessions,
            (SELECT count(*) FROM learning_command_invocation
              WHERE part_id = ${invocation.envelope.partID}) AS invocations,
            (SELECT count(*) FROM learning_command_receipt
              WHERE invocation_part_id = ${invocation.envelope.partID}) AS receipts,
            (SELECT count(*) FROM learner_state_judgment_disposition
              WHERE invocation_part_id = ${invocation.envelope.partID}) AS dispositions,
            (SELECT count(*) FROM learner_state_judgment_capability_settlement
              WHERE invocation_part_id = ${invocation.envelope.partID}) AS capabilities,
            (SELECT count(*) FROM learner_state_judgment_effect
              WHERE invocation_part_id = ${invocation.envelope.partID}) AS effects,
            (SELECT count(*) FROM learner_state_judgment_no_change_seal
              WHERE invocation_part_id = ${invocation.envelope.partID}) AS noChangeSeals
        `),
      ).toEqual({
        sessions: 0,
        invocations: 0,
        receipts: 0,
        dispositions: 0,
        capabilities: 0,
        effects: 0,
        noChangeSeals: 0,
      })
      expect(yield* db.all(sql.raw("PRAGMA foreign_key_check"))).toEqual([])
    }),
  )

  it.effect("recovers an admitted command without blind mutation", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-01-03T09:00:00Z")
      const text = "I can name the theorem but cannot yet use it."
      const invocation = yield* seedAgentInvocation(
        db,
        "recovery",
        createCommand(text, snapshot("Cannot yet apply the theorem")),
        text,
        time,
      )
      const reserved = yield* db.transaction((tx) =>
        LearnerStateJudgment.reserve(tx, { ...invocation, settlement: { time: time + 2, order: 1 } }),
      )
      expect(reserved.type).toBe("admitted")
      yield* db.transaction((tx) =>
        LearnerStateJudgment.settlePolicy(tx, {
          partID: invocation.envelope.partID,
          outcome: "policy_allow",
          policyBasis: { source: "test", rule: "allow" },
          time: time + 3,
          order: 2,
        }),
      )
      const recovered = yield* db.transaction((tx) =>
        LearnerStateJudgment.recover(tx, {
          partID: invocation.envelope.partID,
          settlement: { time: time + 4, order: 3 },
        }),
      )
      expect(recovered).toMatchObject({ type: "settled", settlement: { outcome: "error", code: "interrupted" } })
      expect(yield* db.select().from(LearnerStateJudgmentTable).all()).toHaveLength(0)
      expect(yield* db.select().from(LearnerStateJudgmentEffectTable).all()).toHaveLength(0)
      expect(
        yield* db.transaction((tx) =>
          LearnerStateJudgment.recover(tx, {
            partID: invocation.envelope.partID,
            settlement: { time: time + 9, order: 9 },
          }),
        ),
      ).toEqual({ type: "replay", settlement: recovered.settlement })
    }),
  )

  it.effect("terminalizes pre-admitted semantic race losers against one exact winner", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-01-03T12:00:00Z")
      const source = "I can state the invariant, but I still cannot apply it."
      const command = createCommand(source, snapshot("Invariant application remains uncertain"))
      const winner = yield* seedAgentInvocation(db, "semantic_race_winner", command, source, time)
      const loser = yield* seedFollowupAgentInvocation(db, winner, "semantic_race_loser", command, time + 10)
      const recovery = yield* seedFollowupAgentInvocation(db, winner, "semantic_race_recovery", command, time + 20)
      const changed = yield* seedFollowupAgentInvocation(
        db,
        winner,
        "semantic_race_conflict",
        createCommand(source, snapshot("A changed payload cannot reuse the learner occurrence slot")),
        time + 30,
      )
      for (const [index, invocation] of [winner, loser, recovery, changed].entries()) {
        const reserved = yield* db.transaction((tx) =>
          LearnerStateJudgment.reserve(tx, {
            ...invocation,
            settlement: { time: time + 40 + index, order: index + 1 },
          }),
        )
        expect(reserved).toMatchObject({ type: "admitted" })
      }
      yield* db.transaction((tx) =>
        LearnerStateJudgment.settlePolicy(tx, {
          partID: winner.envelope.partID,
          outcome: "policy_allow",
          policyBasis: { source: "learner-state-test", rule: "allow" },
          time: time + 50,
          order: 5,
        }),
      )
      const won = yield* db.transaction((tx) =>
        LearnerStateJudgment.settle(tx, {
          partID: winner.envelope.partID,
          settlement: { time: time + 51, order: 6 },
        }),
      )
      if (won.type !== "settled" || !isAppliedLearnerStateSettlement(won.settlement)) {
        return yield* Effect.die("Expected one exact semantic winner")
      }

      expect(
        yield* db.transaction((tx) =>
          LearnerStateJudgment.settle(tx, {
            partID: loser.envelope.partID,
            settlement: { time: time + 52, order: 7 },
          }),
        ),
      ).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "already_applied",
          existingOutcome: "applied",
          effectID: won.settlement.effectID,
          revisionID: won.settlement.revisionID,
        },
      })
      const recovered = yield* db.transaction((tx) =>
        LearnerStateJudgment.recover(tx, {
          partID: recovery.envelope.partID,
          settlement: { time: time + 53, order: 8 },
        }),
      )
      expect(recovered).toMatchObject({
        type: "settled",
        settlement: { outcome: "already_applied", existingOutcome: "applied" },
      })
      if (recovered.type !== "settled") return yield* Effect.die("Expected recovery to terminalize the loser")
      expect(
        yield* db.transaction((tx) =>
          LearnerStateJudgment.recover(tx, {
            partID: recovery.envelope.partID,
            settlement: { time: time + 60, order: 9 },
          }),
        ),
      ).toEqual({ type: "replay", settlement: recovered.settlement })
      expect(
        yield* db.transaction((tx) =>
          LearnerStateJudgment.settle(tx, {
            partID: changed.envelope.partID,
            settlement: { time: time + 54, order: 9 },
          }),
        ),
      ).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "semantic_conflict", detail: { existingOutcome: "applied" } },
      })
      expect(yield* db.select().from(LearnerStateJudgmentEffectTable).all()).toHaveLength(1)
      expect(yield* db.select().from(LearnerStateJudgmentRevisionTable).all()).toHaveLength(1)
      expect(yield* db.select().from(LearnerStateJudgmentNoChangeSealTable).all()).toHaveLength(0)
    }),
  )

  it.effect("byte-fits stable discovery without an empty terminal page", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-01-04T09:00:00Z")
      yield* Effect.forEach(
        [0, 1, 2],
        (index) =>
          Effect.gen(function* () {
            const text = `Learner-state fixture ${index}`
            const invocation = yield* seedAgentInvocation(
              db,
              `page_${index}`,
              createCommand(text, snapshot(`Current fuzzy state ${index}`)),
              text,
              time + index * 100,
            )
            expect(yield* applyInvocation(db, invocation, time + index * 100 + 2)).toMatchObject({
              type: "settled",
              settlement: { outcome: "applied" },
            })
          }),
        { discard: true },
      )
      const first = yield* db.transaction((tx) =>
        LearnerStateJudgment.read(tx, { type: "discover", disposition: "active" }, { limit: 2 }),
      )
      expect(first).toMatchObject({ countAtCut: 3, returnedCount: 2, omittedCount: 1, truncated: true })
      if (!first.nextCursor) return yield* Effect.die("Expected a learner-state discovery cursor")
      const second = yield* db.transaction((tx) =>
        LearnerStateJudgment.read(
          tx,
          { type: "discover", disposition: "active" },
          { limit: 2, cursor: first.nextCursor },
        ),
      )
      expect(second).toMatchObject({ countAtCut: 3, returnedCount: 1, omittedCount: 0, truncated: false })
      expect(second.nextCursor).toBeUndefined()
    }),
  )

  it.effect("admits maximum bounded prose while keeping the automatic Context entry compact", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-01-04T12:00:00Z")
      const source = "Retain this deliberately maximum-sized but still fallible learner-state value."
      const maximumSnapshot = {
        subject: {
          label: "s".repeat(LearnerStateJudgment.MAX_SUBJECT_LABEL_BYTES),
          scope: { type: "learner_home" as const },
        },
        judgmentBody: "b".repeat(LearnerStateJudgment.MAX_JUDGMENT_BODY_BYTES),
        exactBasisRefs: [],
        uncertaintyAndLimits: "u".repeat(LearnerStateJudgment.MAX_UNCERTAINTY_BYTES),
        basisScope: "whole_judgment" as const,
      }
      const command = createCommand(source, maximumSnapshot)
      expect(() => LearnerStateJudgment.canonicalizeCommand(command)).not.toThrow()
      expect(() =>
        LearnerStateJudgment.canonicalizeCommand({
          ...command,
          snapshot: {
            ...maximumSnapshot,
            judgmentBody: `${maximumSnapshot.judgmentBody}x`,
          },
        }),
      ).toThrow(LearnerStateJudgment.InvalidCommandError)

      const invocation = yield* seedAgentInvocation(db, "maximum_prose", command, source, time)
      expect(yield* applyInvocation(db, invocation, time + 2)).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied" },
      })
      const prepared = yield* prepareLearningContext(db, invocation, time + 10)
      const section = prepared.cut.sections.find((item) => item.owner === "learner_state_judgment")
      if (!section || section.owner !== "learner_state_judgment" || section.coverage === "not_authorized") {
        return yield* Effect.die("Expected a bounded learner-state Context section")
      }
      const entry = section.entries[0]
      if (!entry || entry.kind !== "learner_state_judgment") {
        return yield* Effect.die("Expected a compact learner-state Context entry")
      }
      const semantic = entry.semantic
      expect(semantic).toMatchObject({ state: "value" })
      if (!semantic || semantic.state !== "value") {
        return yield* Effect.die("Expected the maximum compact entry to fit")
      }
      expect(LearningContext.utf8Bytes(LearningContext.canonicalJson(semantic.value))).toBeLessThanOrEqual(
        LearningContext.MAX_ENTRY_BYTES,
      )
      expect(JSON.stringify(entry)).not.toContain(maximumSnapshot.judgmentBody)
    }),
  )

  it.effect("projects only a bounded learner-state index and keeps detail lazy", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-01-05T09:00:00Z")
      const text = "I can follow the worked example but cannot transfer it to a new case."
      const invocation = yield* seedAgentInvocation(
        db,
        "context",
        createCommand(text, snapshot("Worked-example transfer remains uncertain")),
        text,
        time,
      )
      expect(yield* applyInvocation(db, invocation, time + 2)).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied" },
      })
      const prepared = yield* prepareLearningContext(db, invocation, time + 10)
      const section = prepared.cut.sections.find((item) => item.owner === "learner_state_judgment")
      expect(section).toMatchObject({
        coverage: "complete",
        countAtCut: 1,
        omission: { type: "none" },
        entries: [
          {
            kind: "learner_state_judgment",
            semantic: {
              state: "value",
              value: {
                subjectLabel: "Semaphore safety invariant",
                basisScope: "whole_judgment",
                detail: "judgment_body_basis_and_history_require_exact_lazy_read",
              },
            },
            locator: { lazyReadAvailable: true },
          },
        ],
      })
      expect(JSON.stringify(section)).not.toContain("Worked-example transfer remains uncertain")
      expect(prepared.renderedBlock).toContain("learner_state_judgment")
      expect(prepared.renderedBlock).toContain("fallible")
      expect(
        LearningContext.decodeStored(
          prepared.canonicalCut,
          prepared.renderedBlock,
          invocation.envelope.assistantMessageID,
        ),
      ).toEqual(prepared.cut)
    }),
  )

  it.effect("binds an omitted learner-state directory to its exact cut and excludes later heads", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-01-06T09:00:00Z")
      const invocations = yield* Effect.forEach(
        Array.from({ length: LearnerStateJudgment.MAX_CONTEXT_ENTRIES + 1 }, (_, index) => index),
        (index) =>
          Effect.gen(function* () {
            const text = `Learner-state directory fixture ${index}`
            const invocation = yield* seedAgentInvocation(
              db,
              `directory_${index}`,
              createCommand(text, snapshot(`Directory judgment ${index}`)),
              text,
              time + index * 10,
            )
            expect(yield* applyInvocation(db, invocation, time + index * 10 + 2)).toMatchObject({
              type: "settled",
              settlement: { outcome: "applied" },
            })
            return invocation
          }),
      )
      const prepared = yield* prepareLearningContext(db, invocations[0]!, time + 100)
      const section = prepared.cut.sections.find((item) => item.owner === "learner_state_judgment")
      if (!section || section.owner !== "learner_state_judgment" || section.coverage === "not_authorized") {
        return yield* Effect.die("Expected an authorized learner-state directory")
      }
      expect(section).toMatchObject({
        countAtCut: LearnerStateJudgment.MAX_CONTEXT_ENTRIES + 1,
        coverage: "truncated",
        omission: { type: "exact", omitted: 1, reasons: [{ reason: "candidate_limit", omitted: 1 }] },
      })
      expect(section.entries).toHaveLength(LearnerStateJudgment.MAX_CONTEXT_ENTRIES)
      const directoryCursor = section.directoryCursor
      if (!directoryCursor) return yield* Effect.die("Expected a populated learner-state directory cursor")
      expect(LearnerStateJudgment.inspectDirectoryCursor(directoryCursor)).toMatchObject({
        ownerCut: section.learnerStateJudgmentOwnerCut,
        asOf: section.asOf,
      })
      const pinned = yield* db.transaction((tx) =>
        LearnerStateJudgment.read(
          tx,
          { type: "discover", disposition: "active", directoryCursor },
          { limit: LearnerStateJudgment.MAX_READ_ITEMS },
        ),
      )
      expect(pinned).toMatchObject({
        ownerCut: section.learnerStateJudgmentOwnerCut,
        asOf: section.asOf,
        countAtCut: LearnerStateJudgment.MAX_CONTEXT_ENTRIES + 1,
        returnedCount: LearnerStateJudgment.MAX_CONTEXT_ENTRIES + 1,
        omittedCount: 0,
        truncated: false,
      })

      const laterText = "A later learner-state head must not enter the already-admitted directory."
      const later = yield* seedAgentInvocation(
        db,
        "directory_later",
        createCommand(laterText, snapshot("Later judgment outside the pinned cut")),
        laterText,
        time + 200,
      )
      expect(yield* applyInvocation(db, later, time + 202)).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied" },
      })
      const before = yield* db.get<{ count: number }>(sql`SELECT total_changes() AS count`)
      const stale = yield* db
        .transaction((tx) =>
          LearnerStateJudgment.read(
            tx,
            { type: "discover", disposition: "active", directoryCursor },
            { limit: LearnerStateJudgment.MAX_READ_ITEMS },
          ),
        )
        .pipe(Effect.flip)
      expect(stale).toMatchObject({
        _tag: "LearnerStateJudgment.InvalidCommandError",
        reason: "stale",
      })
      expect(JSON.stringify(stale)).not.toContain("Later judgment outside the pinned cut")
      expect(yield* db.get<{ count: number }>(sql`SELECT total_changes() AS count`)).toEqual(before)
    }),
  )

  it.effect("withholds learner-state identity and count when only its read capability is absent", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-01-07T09:00:00Z")
      const text = "This state exists but must not leak without its owner read capability."
      const invocation = yield* seedAgentInvocation(
        db,
        "context_withheld",
        createCommand(text, snapshot("Withheld learner-state detail")),
        text,
        time,
      )
      expect(yield* applyInvocation(db, invocation, time + 2)).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied" },
      })
      const prepared = yield* prepareLearningContext(db, invocation, time + 10, false)
      const section = prepared.cut.sections.find((item) => item.owner === "learner_state_judgment")
      expect(section).toEqual({
        owner: "learner_state_judgment",
        scope: "active_heads_intersecting_context_anchors_or_learner_home_wide",
        selectionBasis: "learner_state_judgment_read_capability_withheld",
        coverage: "not_authorized",
        countAtCut: "unknown",
        omission: { type: "unknown", reason: "learner_state_judgment_read_capability_withheld" },
        entries: [],
      })
      expect(prepared.renderedBlock).toContain(
        "learnerStateJudgment: owner index withheld because its exact lazy-read capability is absent; identity and count are unknown.",
      )
      expect(prepared.renderedBlock).not.toContain("Withheld learner-state detail")
    }),
  )

  it.effect("keeps an admitted v5 cut exact after correction while a fresh cut sees the successor", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-01-08T09:00:00Z")
      const text = "I can state the invariant, but application remains uncertain."
      const created = yield* seedAgentInvocation(
        db,
        "old_cut_create",
        createCommand(text, snapshot("Application remains uncertain")),
        text,
        time,
      )
      const applied = yield* applyInvocation(db, created, time + 2)
      if (applied.type !== "settled" || !isAppliedLearnerStateSettlement(applied.settlement)) {
        return yield* Effect.die("Expected the old-cut learner-state fixture to apply")
      }
      const appliedRevision = applied.settlement
      const current = yield* db.transaction((tx) =>
        LearnerStateJudgment.readCurrent(tx, appliedRevision.judgmentID, time + 10),
      )
      if (!current) return yield* Effect.die("Expected a current old-cut learner-state fixture")
      const correctionText = "Correction: the invariant definition itself is also uncertain."
      const correction = yield* seedAgentInvocation(
        db,
        "old_cut_correction",
        {
          operation: "revise",
          judgmentID: current.judgmentRevisionRef.judgmentID,
          expectedHead: expectedHead(current),
          cause: learnerCorrection(correctionText),
          snapshot: snapshot("Definition and application both remain uncertain"),
          rationale: "Keep the durable teaching context aligned with the learner correction.",
        },
        correctionText,
        time + 20,
        learningContextBasis(),
      )
      const admitted = yield* db.transaction((tx) =>
        LearningContext.readCut(tx, correction.envelope.assistantMessageID),
      )
      if (admitted.type !== "available") return yield* Effect.die("Expected a stored admitted v5 cut")
      const admittedSection = admitted.cut.sections.find((item) => item.owner === "learner_state_judgment")
      if (
        !admittedSection ||
        admittedSection.owner !== "learner_state_judgment" ||
        admittedSection.coverage === "not_authorized"
      ) {
        return yield* Effect.die("Expected an authorized admitted learner-state section")
      }
      expect(admittedSection?.entries[0]?.locator).toMatchObject({
        revisionID: current.judgmentRevisionRef.revisionID,
        version: 1,
      })
      expect(
        yield* db.transaction((tx) =>
          LearnerStateJudgment.read(tx, {
            type: "current",
            judgmentID: current.judgmentRevisionRef.judgmentID,
            asOf: time + 21,
            directoryCursor: admittedSection.directoryCursor,
          }),
        ),
      ).toMatchObject({ items: [{ revision: { id: current.judgmentRevisionRef.revisionID, version: 1 } }] })

      expect(yield* applyInvocation(db, correction, time + 22)).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied", version: 2 },
      })
      expect(
        yield* db.transaction((tx) => LearningContext.readCut(tx, correction.envelope.assistantMessageID)),
      ).toEqual(admitted)
      expect(
        yield* db
          .transaction((tx) =>
            LearnerStateJudgment.read(tx, {
              type: "current",
              judgmentID: current.judgmentRevisionRef.judgmentID,
              asOf: time + 30,
              directoryCursor: admittedSection.directoryCursor,
            }),
          )
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "LearnerStateJudgment.InvalidCommandError", reason: "stale" })

      const fresh = yield* prepareLearningContext(db, correction, time + 30)
      const freshSection = fresh.cut.sections.find((item) => item.owner === "learner_state_judgment")
      expect(freshSection?.entries[0]?.locator.version).toBe(2)
      expect(freshSection?.entries[0]?.locator.revisionID).not.toBe(current.judgmentRevisionRef.revisionID)
    }),
  )

  it.effect("keeps exact owner observations fallible and reports fresh Course dependency drift", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const time = Date.parse("2038-01-09T09:00:00Z")
      setSystemTime(new Date(time))
      yield* Effect.addFinalizer(() => Effect.sync(() => setSystemTime()))
      const course = yield* courses.createCourse({ title: "Operating systems" })
      const published = yield* courses.createView({
        courseID: course.id,
        name: "Concurrency",
        expectedCourseVersion: 0,
        authorship: Course.Authorship.learnerAuthored(),
        revision: { items: [{ key: "semaphore-invariant", title: "Semaphore safety invariant" }] },
      })
      yield* courses.select({
        courseID: course.id,
        revisionID: published.revision.id,
        expectedCourseVersion: 0,
        expectedSelectionVersion: 0,
        expectedViewVersion: 0,
        expectedRevisionVersion: 0,
      })
      const items = yield* courses.listRevisionItems(course.id, published.view.id, published.revision.id)
      const endpoint = {
        courseID: course.id,
        viewID: published.view.id,
        revisionID: published.revision.id,
        itemID: items.items[0]!.itemID,
      }
      const ref = { type: "course_membership" as const, endpoint }
      const input = {
        operation: "create" as const,
        cause: {
          type: "exact_owner_observation" as const,
          rationale: "Retain a fallible teaching judgment from this exact Course observation.",
        },
        snapshot: {
          subject: { label: "Semaphore invariant application", scope: { type: "anchored" as const, anchors: [ref] } },
          judgmentBody: "Application of the semaphore invariant remains uncertain.",
          exactBasisRefs: [ref],
          uncertaintyAndLimits: "This is a fallible Tutor interpretation, not mastery certification.",
          basisScope: "whole_judgment" as const,
        },
      }
      const invocation = yield* seedAgentInvocation(
        db,
        "exact_owner_observation",
        input,
        "Use the exact Course observation for later teaching.",
        time + 100,
        learningContextBasis(),
      )
      const applied = yield* applyInvocation(db, invocation, time + 102)
      if (applied.type !== "settled" || !isAppliedLearnerStateSettlement(applied.settlement)) {
        return yield* Effect.die("Expected exact owner observation to apply")
      }
      const appliedRevision = applied.settlement
      const before = yield* db.transaction((tx) =>
        LearnerStateJudgment.readCurrent(tx, appliedRevision.judgmentID, time + 110),
      )
      expect(before).toMatchObject({
        revision: {
          authorAndCause: { type: "exact_owner_observation", source: { type: "model_operation" } },
          snapshot: { basisScope: "whole_judgment" },
        },
        anchorDependencies: [{ state: "current" }],
        basisDependencies: [{ state: "current" }],
      })

      setSystemTime(new Date(time + 200))
      yield* courses.correctCourse({
        courseID: course.id,
        title: "Operating systems and concurrency",
        expectedCourseVersion: 0,
      })
      const after = yield* db.transaction((tx) =>
        LearnerStateJudgment.readCurrent(tx, appliedRevision.judgmentID, time + 210),
      )
      expect(after).toMatchObject({
        revision: { id: before?.revision.id, snapshot: { judgmentBody: before?.revision.snapshot.judgmentBody } },
        anchorDependencies: [{ state: "changed" }],
        basisDependencies: [{ state: "changed" }],
      })
      expect(after?.revision).toEqual(before?.revision)
    }),
  )

  it.effect("binds Tutor judgment to an exact Interaction and survives source-Session deletion", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-01-10T09:00:00Z")
      const sourceText = "I can repeat the invariant, but I cannot use it in a boundary case."
      const source = yield* seedAgentInvocation(
        db,
        "model_judgment_source",
        createCommand(sourceText, snapshot("Boundary-case application remains uncertain")),
        sourceText,
        time,
      )
      expect(yield* applyInvocation(db, source, time + 2)).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied" },
      })
      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          yield* TurnLifecycle.settleTool(tx, {
            turnID: source.envelope.turnID,
            partID: source.envelope.partID,
            state: "completed",
            time: time + 5,
          })
          yield* TurnLifecycle.settle(tx, {
            turnID: source.envelope.turnID,
            outcome: "completed",
            reason: "normal",
            time: time + 6,
          })
        }),
      )
      const projected = yield* db.transaction((tx) =>
        TurnLearningContext.projectLearningContext(tx, {
          currentSessionID: SessionSchema.ID.create(),
          limit: 4,
        }),
      )
      const interaction = projected.entries.find((entry) => entry.locator.turnID === source.envelope.turnID)
      if (!interaction || interaction.locator.status !== "available") {
        return yield* Effect.die("Expected an exact source Interaction locator")
      }
      const interactionRef = { type: "interaction" as const, locator: interaction.locator }
      const input = {
        operation: "create" as const,
        cause: {
          type: "tutor_model_judgment" as const,
          rationale: "The exact learner Interaction supports a fallible application-focused judgment.",
        },
        snapshot: {
          ...snapshot("Application remains uncertain despite being able to state the invariant"),
          exactBasisRefs: [interactionRef],
        },
      }
      const invocation = yield* seedAgentInvocation(
        db,
        "model_judgment",
        input,
        "Use the prior response only as a cited basis, not a mastery certificate.",
        time + 20,
        learningContextBasis(),
      )
      const applied = yield* applyInvocation(db, invocation, time + 22)
      if (applied.type !== "settled" || !isAppliedLearnerStateSettlement(applied.settlement)) {
        return yield* Effect.die("Expected Tutor model judgment to apply")
      }
      const appliedRevision = applied.settlement
      const before = yield* db.transaction((tx) =>
        LearnerStateJudgment.readCurrent(tx, appliedRevision.judgmentID, time + 30),
      )
      expect(before).toMatchObject({
        revision: {
          authorAndCause: { type: "tutor_model_judgment", source: { type: "model_operation" } },
          snapshot: { exactBasis: [{ ref: { type: "interaction" } }], basisScope: "whole_judgment" },
        },
        basisDependencies: [{ state: "current" }],
      })

      yield* db.transaction((tx) =>
        TurnLifecycle.deleteSessionTree(tx, {
          rootSessionID: source.envelope.sessionID,
          sessionIDs: [source.envelope.sessionID],
          timeDeleted: time + 40,
        }),
      )
      const after = yield* db.transaction((tx) =>
        LearnerStateJudgment.readCurrent(tx, appliedRevision.judgmentID, time + 50),
      )
      expect(after).toMatchObject({ basisDependencies: [{ state: "source_unavailable" }] })
      expect(after?.revision).toEqual(before?.revision)
      expect(
        yield* db.transaction((tx) =>
          LearnerStateJudgment.readExactRevision(tx, appliedRevision.judgmentID, appliedRevision.revisionID),
        ),
      ).toEqual(before?.revision)
    }),
  )

  it.effect("keeps applied duplicate, conflict, retire, restore, and stale-head truth distinct", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-01-11T09:00:00Z")
      const text = "I still need help applying the invariant."
      const create = createCommand(text, snapshot("Application remains uncertain"))
      const created = yield* seedAgentInvocation(db, "lifecycle_create", create, text, time)
      const applied = yield* applyInvocation(db, created, time + 2)
      if (applied.type !== "settled" || !isAppliedLearnerStateSettlement(applied.settlement)) {
        return yield* Effect.die("Expected lifecycle fixture to apply")
      }
      const appliedRevision = applied.settlement

      const duplicate = yield* seedFollowupAgentInvocation(db, created, "lifecycle_duplicate", create, time + 10)
      expect(yield* applyInvocation(db, duplicate, time + 12)).toMatchObject({
        type: "settled",
        settlement: { outcome: "already_applied", existingOutcome: "applied", revisionID: appliedRevision.revisionID },
      })
      const conflict = yield* seedFollowupAgentInvocation(
        db,
        created,
        "lifecycle_conflict",
        createCommand(text, snapshot("A changed payload cannot reuse the applied semantic address")),
        time + 20,
      )
      expect(yield* applyInvocation(db, conflict, time + 22)).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "semantic_conflict" },
      })

      const beforeRetire = yield* db.transaction((tx) =>
        LearnerStateJudgment.readCurrent(tx, appliedRevision.judgmentID, time + 30),
      )
      if (!beforeRetire) return yield* Effect.die("Expected active lifecycle fixture")
      const retireText = "Do not offer this learner-state memory as current for now."
      const retire = yield* seedAgentInvocation(
        db,
        "lifecycle_retire",
        {
          operation: "retire",
          judgmentID: appliedRevision.judgmentID,
          expectedHead: expectedHead(beforeRetire),
          cause: learnerCorrection(retireText),
          rationale: "Retire only this memory; do not infer forgetting or mastery.",
        },
        retireText,
        time + 40,
      )
      expect(yield* applyInvocation(db, retire, time + 42)).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied", operation: "retire", disposition: "retired", version: 2 },
      })
      const retired = yield* db.transaction((tx) =>
        LearnerStateJudgment.readCurrent(tx, appliedRevision.judgmentID, time + 50),
      )
      if (!retired) return yield* Effect.die("Expected retired lifecycle fixture")
      expect(retired.revision).toMatchObject({ disposition: "retired", snapshot: beforeRetire.revision.snapshot })

      const restoreText = "Use that learner-state memory again; its wording is still the best current approximation."
      const restore = yield* seedAgentInvocation(
        db,
        "lifecycle_restore",
        {
          operation: "restore",
          judgmentID: appliedRevision.judgmentID,
          expectedHead: expectedHead(retired),
          cause: learnerCorrection(restoreText),
          rationale: "Restore the unchanged fallible memory without asserting learning progress.",
        },
        restoreText,
        time + 60,
      )
      expect(yield* applyInvocation(db, restore, time + 62)).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied", operation: "restore", disposition: "active", version: 3 },
      })

      const staleText = "This correction was based on the obsolete pre-retirement head."
      const stale = yield* seedAgentInvocation(
        db,
        "lifecycle_stale",
        {
          operation: "revise",
          judgmentID: appliedRevision.judgmentID,
          expectedHead: expectedHead(beforeRetire),
          cause: learnerCorrection(staleText),
          snapshot: snapshot("Obsolete correction must not replace the restored head"),
          rationale: "Exercise exact-head compare-and-swap.",
        },
        staleText,
        time + 70,
      )
      expect(yield* applyInvocation(db, stale, time + 72)).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "stale" },
      })
      expect(
        yield* db.transaction((tx) =>
          LearnerStateJudgment.read(tx, { type: "history", judgmentID: appliedRevision.judgmentID }),
        ),
      ).toMatchObject({ returnedCount: 3, items: [{ version: 1 }, { version: 2 }, { version: 3 }] })
      expect(yield* db.select().from(LearnerStateJudgmentTable).all()).toHaveLength(1)
      expect(yield* db.select().from(LearnerStateJudgmentRevisionTable).all()).toHaveLength(3)
    }),
  )
})

function snapshot(judgmentBody: string): LearnerStateJudgment.SemanticSnapshotIntent {
  return {
    subject: { label: "Semaphore safety invariant", scope: { type: "learner_home" } },
    judgmentBody,
    exactBasisRefs: [],
    uncertaintyAndLimits: "Fallible and open to learner correction.",
    basisScope: "whole_judgment",
  }
}

function isAppliedLearnerStateSettlement(
  settlement: LearningCommand.PhysicalSettlement,
): settlement is LearnerStateJudgment.AppliedSettlement {
  return (
    settlement.outcome === "applied" &&
    "learnerStateJudgmentKind" in settlement &&
    settlement.learnerStateJudgmentKind === "revision" &&
    "judgmentID" in settlement
  )
}

function createCommand(
  text: string,
  value: LearnerStateJudgment.SemanticSnapshotIntent,
): Extract<LearnerStateJudgment.Command, { operation: "create" }> {
  return { operation: "create", cause: learnerReport(text), snapshot: value }
}

function learnerReport(text: string) {
  return { type: "interpreted_learner_report" as const, excerpt: excerpt(text) }
}

function learnerCorrection(text: string) {
  return { type: "learner_correction" as const, excerpt: excerpt(text) }
}

function excerpt(text: string) {
  return { text, startByte: 0, endByte: new TextEncoder().encode(text).byteLength }
}

function expectedHead(projection: LearnerStateJudgment.ProjectionAtCut) {
  return {
    revisionID: projection.revision.id,
    version: projection.revision.version,
    ownerCutFingerprint: LearnerStateJudgment.headReferenceFingerprint({
      id: projection.judgmentRevisionRef.judgmentID,
      timeCreated: projection.revision.timeCommitted,
      current: projection.revision,
    }),
  }
}

function applyInvocation(db: Database.Interface["db"], invocation: LearnerStateJudgment.Invocation, time: number) {
  return Effect.gen(function* () {
    const reserved = yield* db.transaction((tx) =>
      LearnerStateJudgment.reserve(tx, { ...invocation, settlement: { time, order: 1 } }),
    )
    if (reserved.type !== "admitted") return reserved
    yield* db.transaction((tx) =>
      LearnerStateJudgment.settlePolicy(tx, {
        partID: invocation.envelope.partID,
        outcome: "policy_allow",
        policyBasis: { source: "learner-state-test", rule: "allow" },
        time: time + 1,
        order: 2,
      }),
    )
    return yield* db.transaction((tx) =>
      LearnerStateJudgment.settle(tx, {
        partID: invocation.envelope.partID,
        settlement: { time: time + 2, order: 3 },
      }),
    )
  })
}

function seedAgentInvocation(
  db: Database.Interface["db"],
  suffix: string,
  command: LearnerStateJudgment.Command,
  userText: string,
  time: number,
  learningContextBasis?: LearningContext.CapabilityBasis,
) {
  return Effect.gen(function* () {
    const sessionID = SessionSchema.ID.make(`ses_lsj_${suffix}`)
    const userMessageID = SessionV1.MessageID.ascending(`msg_lsj_user_${suffix}`)
    const userPartID = SessionV1.PartID.ascending(`prt_lsj_user_${suffix}`)
    const assistantMessageID = SessionV1.MessageID.ascending(`msg_lsj_assistant_${suffix}`)
    const partID = SessionV1.PartID.ascending(`prt_lsj_tool_${suffix}`)
    const callID = `call-lsj-${suffix}`
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
        data: { type: "text", text: userText } as (typeof PartTable.$inferInsert)["data"],
        time_created: time,
        time_updated: time,
      })
      .run()
    const occurrence = yield* db.transaction((tx) =>
      Effect.gen(function* () {
        const admitted = yield* LearningCommand.Occurrence.admit(tx, {
          admission: LearningCommand.LearnerAdmission.interactive({ timeZone: "UTC" }),
          sessionID,
          messageID: userMessageID,
          timeAdmitted: time,
        })
        yield* TurnLifecycle.admit(tx, {
          kind: "learner",
          turnID,
          sessionID,
          inputID,
          messageID: userMessageID,
          occurrenceID: admitted.id,
          limits: { model: 4, tool: 4 },
          envelope: { command },
          policyBasis: { source: "learner-state-test" },
          timeAdmitted: time,
        })
        return admitted
      }),
    )
    return yield* seedModelInvocation(db, {
      suffix,
      command,
      occurrenceID: occurrence.id,
      turnID,
      inputID,
      sessionID,
      parentUserMessageID: userMessageID,
      time: time + 1,
      ...(learningContextBasis ? { learningContextBasis } : {}),
    })
  }).pipe(Effect.orDie)
}

function seedFollowupAgentInvocation(
  db: Database.Interface["db"],
  predecessor: LearnerStateJudgment.Invocation,
  suffix: string,
  command: LearnerStateJudgment.Command,
  time: number,
  learningContextBasis?: LearningContext.CapabilityBasis,
) {
  return seedModelInvocation(db, {
    suffix,
    command,
    occurrenceID: predecessor.envelope.occurrenceID,
    turnID: predecessor.envelope.turnID,
    inputID: predecessor.envelope.inputID,
    sessionID: predecessor.envelope.sessionID,
    parentUserMessageID: predecessor.envelope.parentUserMessageID,
    time,
    ...(learningContextBasis ? { learningContextBasis } : {}),
  })
}

function seedModelInvocation(
  db: Database.Interface["db"],
  input: Readonly<{
    suffix: string
    command: LearnerStateJudgment.Command
    occurrenceID: LearningCommand.OccurrenceID
    turnID: Turn.ID
    inputID: Turn.InputID
    sessionID: SessionSchema.ID
    parentUserMessageID: SessionV1.MessageID
    time: number
    learningContextBasis?: LearningContext.CapabilityBasis
  }>,
) {
  return Effect.gen(function* () {
    const assistantMessageID = SessionV1.MessageID.ascending(`msg_lsj_assistant_${input.suffix}`)
    const partID = SessionV1.PartID.ascending(`prt_lsj_tool_${input.suffix}`)
    const callID = `call-lsj-${input.suffix}`
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx
          .insert(MessageTable)
          .values({
            id: assistantMessageID,
            session_id: input.sessionID,
            data: assistantData(input.parentUserMessageID, input.time),
            time_created: input.time,
            time_updated: input.time,
          })
          .run()
        yield* tx
          .insert(PartTable)
          .values({
            id: partID,
            session_id: input.sessionID,
            message_id: assistantMessageID,
            data: {
              type: "tool",
              tool: LearnerStateJudgment.UPDATE_CAPABILITY,
              callID,
              state: { status: "pending", input: input.command, raw: JSON.stringify(input.command) },
            } as (typeof PartTable.$inferInsert)["data"],
            time_created: input.time,
            time_updated: input.time,
          })
          .run()
        yield* admitModelWithLearningContext(tx, {
          turnID: input.turnID,
          sessionID: input.sessionID,
          assistantMessageID,
          requestEnvelope: { command: input.command },
          contextFingerprint: new Bun.CryptoHasher("sha256").update(`lsj-context:${input.suffix}`).digest("hex"),
          snapshotFrontier: yield* LearningFrontier.read(tx),
          timeAdmitted: input.time,
          ...(input.learningContextBasis ? { learningContextBasis: input.learningContextBasis } : {}),
        })
        yield* TurnLifecycle.sealCandidateSet(tx, {
          turnID: input.turnID,
          sessionID: input.sessionID,
          assistantMessageID,
          candidates: [
            { partID, callID, tool: LearnerStateJudgment.UPDATE_CAPABILITY, envelope: { command: input.command } },
          ],
          timeSealed: input.time,
        })
        yield* TurnLifecycle.settleModel(tx, {
          turnID: input.turnID,
          assistantMessageID,
          state: "completed",
          time: input.time,
        })
        yield* TurnLifecycle.admitTool(tx, {
          turnID: input.turnID,
          sessionID: input.sessionID,
          assistantMessageID,
          partID,
          timeAdmitted: input.time,
        })
        yield* TurnLifecycle.consumeToolFrontier(tx, { partID, frontier: yield* LearningFrontier.read(tx) })
      }),
    )
    return {
      envelope: {
        occurrenceID: input.occurrenceID,
        turnID: input.turnID,
        inputID: input.inputID,
        sessionID: input.sessionID,
        parentUserMessageID: input.parentUserMessageID,
        assistantMessageID,
        partID,
        providerCallID: callID,
        emissionOrdinal: 0,
        capabilityIdentity: LearnerStateJudgment.UPDATE_CAPABILITY,
        capabilityVersion: LearnerStateJudgment.UPDATE_VERSION,
        authorizationBasis: "agent_action" as const,
        timeAdmitted: input.time,
      },
      command: input.command,
    } satisfies LearnerStateJudgment.Invocation
  })
}

function prepareLearningContext(
  db: Database.Interface["db"],
  invocation: LearnerStateJudgment.Invocation,
  asOf: number,
  includeLearnerStateRead = true,
) {
  return db.transaction((tx) =>
    Effect.gen(function* () {
      const throughSharedFrontier = yield* LearningFrontier.read(tx)
      return yield* LearningContext.prepareCut(tx, {
        operation: {
          sessionID: invocation.envelope.sessionID,
          turnID: invocation.envelope.turnID,
          inputID: invocation.envelope.inputID,
          causalOccurrenceID: invocation.envelope.occurrenceID,
          assistantMessageID: invocation.envelope.assistantMessageID,
          ordinal: 0,
        },
        retainedSteering: {
          assistantMessageID: invocation.envelope.assistantMessageID,
          cutAsOf: asOf,
          throughSharedFrontier,
          fingerprint: "a".repeat(64),
        } as unknown as Parameters<typeof LearningContext.prepareCut>[1]["retainedSteering"],
        capabilityBasis: learningContextBasis(includeLearnerStateRead),
      })
    }),
  )
}

function learningContextBasis(includeLearnerStateRead = true): LearningContext.CapabilityBasis {
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
    transport: { method: "POST", endpoint: { protocol: "https:", host: "provider.test", pathname: "/v1", query: [] } },
  } as const
  const lazy = LearningContext.LAZY_READ_CAPABILITY_IDS.filter(
    (id) => includeLearnerStateRead || id !== LearnerStateJudgment.READ_CAPABILITY,
  )
  const providerSurface = LearningContext.bindProviderToolSurface({
    route,
    toolChoice: { state: "absent" },
    definitions: lazy.map((id) => ({
      id,
      value: { type: "function", name: id },
    })),
  })
  return {
    catalogVersion: LearningContext.CAPABILITY_CATALOG_VERSION,
    policyFingerprint: "b".repeat(64),
    effectiveAutomaticContext: true,
    effectiveLazyReadCapabilities: [...lazy],
    effectiveProviderToolSurfaceBinding: providerSurface.binding,
  }
}

function userData(time: number): SessionV1.User {
  return {
    id: SessionV1.MessageID.ascending("msg_lsj_template_user"),
    sessionID: SessionSchema.ID.make("ses_lsj_template"),
    role: "user",
    time: { created: time },
    agent: "repa",
    model,
  }
}

function assistantData(parentID: SessionV1.MessageID, time: number): SessionV1.Assistant {
  return {
    id: SessionV1.MessageID.ascending("msg_lsj_template_assistant"),
    sessionID: SessionSchema.ID.make("ses_lsj_template"),
    role: "assistant",
    time: { created: time },
    parentID,
    agent: "repa",
    modelID: model.modelID,
    providerID: model.providerID,
    mode: "repa",
    path: { cwd: "C:\\project", root: "C:\\project" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }
}
