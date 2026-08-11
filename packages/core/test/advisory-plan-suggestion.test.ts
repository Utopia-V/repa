import { describe, expect, setSystemTime } from "bun:test"
import { AdvisoryPlanSuggestion } from "@opencode-ai/core/advisory-plan-suggestion"
import { Course } from "@opencode-ai/core/course"
import {
  AdvisoryPlanSuggestionCapabilitySettlementTable,
  AdvisoryPlanSuggestionEffectTable,
  AdvisoryPlanSuggestionNoChangeSealTable,
  AdvisoryPlanSuggestionRevisionTable,
  AdvisoryPlanSuggestionTable,
} from "@opencode-ai/core/advisory-plan-suggestion/sql"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
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
import { sql } from "drizzle-orm"
import { Cause, Effect, Layer } from "effect"
import { admitModelWithLearningContext } from "./fixture/model-admission"
import { testEffect } from "./lib/effect"

const database = Database.layerFromPath(":memory:").pipe(Layer.orDie)
const it = testEffect(LayerNode.compile(LayerNode.group([Course.node, Database.node]), [[Database.node, database]]))
const model = { modelID: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }

describe.serial("AdvisoryPlanSuggestion", () => {
  it.effect("commits one bounded change set and naturally revises only the suggestions that changed", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-02-01T09:00:00Z")
      const request = "Help me continue with examples first, then let me try one similar problem."
      const created = yield* seedAgentInvocation(
        db,
        "create_pair",
        {
          cause: { type: "responsive_tutor_proposal", excerpt: excerpt(request), rationale: "Preserve useful advice." },
          intents: [
            { operation: "create", operationOrdinal: 0, createOrdinal: 0, snapshot: snapshot("examples first") },
            { operation: "create", operationOrdinal: 1, createOrdinal: 1, snapshot: snapshot("guided attempt") },
          ],
        },
        request,
        time,
      )
      const first = yield* applyInvocation(db, created, time + 2)
      expect(first).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "applied",
          advisoryPlanSuggestionKind: "change_set",
          intentResults: [
            { outcome: "changed", operation: "create", operationOrdinal: 0, version: 1 },
            { outcome: "changed", operation: "create", operationOrdinal: 1, version: 1 },
          ],
        },
      })
      if (first.type !== "settled" || !isApplied(first.settlement)) {
        return yield* Effect.die("Expected the advisory change set to apply")
      }
      expect(new Set(first.settlement.intentResults.map((item) => item.suggestionID)).size).toBe(2)
      expect(yield* db.select().from(AdvisoryPlanSuggestionEffectTable).all()).toHaveLength(1)
      expect(yield* db.select().from(AdvisoryPlanSuggestionTable).all()).toHaveLength(2)
      expect(yield* db.select().from(AdvisoryPlanSuggestionRevisionTable).all()).toHaveLength(2)

      const current = yield* Effect.forEach(first.settlement.intentResults, (item) =>
        db.transaction((tx) => AdvisoryPlanSuggestion.readCurrent(tx, item.suggestionID, time + 20)),
      )
      if (!current[0] || !current[1]) return yield* Effect.die("Expected both current suggestions")
      const correction = "Keep the example-first advice, but remove the guided-attempt step for now."
      const revised = yield* seedAgentInvocation(
        db,
        "revise_pair",
        {
          cause: { type: "learner_revision", excerpt: excerpt(correction) },
          intents: [
            {
              operation: "revise",
              operationOrdinal: 0,
              suggestionID: current[0].suggestionRevisionRef.suggestionID,
              expectedHead: expectedHead(current[0]),
              snapshot: snapshotIntent(current[0].revision.snapshot),
              rationale: "The learner retained this advice unchanged.",
            },
            {
              operation: "revise",
              operationOrdinal: 1,
              suggestionID: current[1].suggestionRevisionRef.suggestionID,
              expectedHead: expectedHead(current[1]),
              snapshot: snapshot("independent pause"),
              rationale: "The learner asked to remove the guided step.",
            },
          ],
        },
        correction,
        time + 30,
      )
      const second = yield* applyInvocation(db, revised, time + 32)
      expect(second).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "applied",
          advisoryPlanSuggestionKind: "change_set",
          intentResults: [
            { outcome: "no_change", operationOrdinal: 0, version: 1 },
            { outcome: "changed", operationOrdinal: 1, version: 2 },
          ],
        },
      })
      expect(yield* db.select().from(AdvisoryPlanSuggestionEffectTable).all()).toHaveLength(2)
      expect(yield* db.select().from(AdvisoryPlanSuggestionRevisionTable).all()).toHaveLength(3)

      const appliedDuplicate = yield* seedFollowupAgentInvocation(
        db,
        revised,
        "applied_duplicate",
        revised.command,
        time + 40,
      )
      expect(yield* applyInvocation(db, appliedDuplicate, time + 41)).toMatchObject({
        type: "settled",
        settlement: { outcome: "already_applied", existingOutcome: "applied" },
      })
      const appliedConflictCommand: AdvisoryPlanSuggestion.Command = {
        ...revised.command,
        intents: revised.command.intents.map((intent, index) =>
          intent.operation === "revise" && index === 1
            ? { ...intent, rationale: "Changed content at the same semantic address must conflict." }
            : intent,
        ),
      }
      const appliedConflict = yield* seedFollowupAgentInvocation(
        db,
        revised,
        "applied_conflict",
        appliedConflictCommand,
        time + 45,
      )
      expect(yield* applyInvocation(db, appliedConflict, time + 46)).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "semantic_conflict", detail: { existingOutcome: "applied" } },
      })
      expect(yield* db.select().from(AdvisoryPlanSuggestionEffectTable).all()).toHaveLength(2)
      expect(yield* db.select().from(AdvisoryPlanSuggestionRevisionTable).all()).toHaveLength(3)

      const unchangedHeads = yield* Effect.forEach(first.settlement.intentResults, (item) =>
        db.transaction((tx) => AdvisoryPlanSuggestion.readCurrent(tx, item.suggestionID, time + 50)),
      )
      if (!unchangedHeads[0] || !unchangedHeads[1]) return yield* Effect.die("Expected both revised suggestions")
      const unchangedText = "That advice is still right; no planning change is needed."
      const unchanged = yield* seedAgentInvocation(
        db,
        "no_change_pair",
        {
          cause: { type: "learner_revision", excerpt: excerpt(unchangedText) },
          intents: [unchangedHeads[0], unchangedHeads[1]].map((head, operationOrdinal) => ({
            operation: "revise" as const,
            operationOrdinal,
            suggestionID: head.suggestionRevisionRef.suggestionID,
            expectedHead: expectedHead(head),
            snapshot: snapshotIntent(head.revision.snapshot),
            rationale: "The learner confirmed this exact advice remains useful.",
          })),
        },
        unchangedText,
        time + 60,
      )
      const third = yield* applyInvocation(db, unchanged, time + 62)
      if (third.type !== "settled") return yield* Effect.die("Expected materialized no-change settlement")
      expect(third).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "no_change",
          advisoryPlanSuggestionKind: "change_set",
          existingOutcome: "materialized_no_change",
          intentResults: [
            { outcome: "no_change", operationOrdinal: 0 },
            { outcome: "no_change", operationOrdinal: 1 },
          ],
        },
      })
      expect(yield* db.select().from(AdvisoryPlanSuggestionNoChangeSealTable).all()).toHaveLength(1)
      expect(yield* db.select().from(AdvisoryPlanSuggestionRevisionTable).all()).toHaveLength(3)

      const replay = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.reserve(tx, {
          ...unchanged,
          settlement: { time: time + 62, order: 1 },
        }),
      )
      expect(replay).toEqual({ type: "replay", settlement: third.settlement })

      const duplicate = yield* seedFollowupAgentInvocation(
        db,
        unchanged,
        "no_change_duplicate",
        unchanged.command,
        time + 70,
      )
      const duplicateResult = yield* applyInvocation(db, duplicate, time + 71)
      expect(duplicateResult).toMatchObject({
        type: "settled",
        settlement: { outcome: "no_change", existingOutcome: "same_no_change" },
      })

      const conflictCommand: AdvisoryPlanSuggestion.Command = {
        ...unchanged.command,
        intents: unchanged.command.intents.map((intent, index) =>
          intent.operation === "revise" && index === 0
            ? { ...intent, rationale: "A changed payload must conflict at the occupied semantic address." }
            : intent,
        ),
      }
      const conflicting = yield* seedFollowupAgentInvocation(
        db,
        unchanged,
        "no_change_conflict",
        conflictCommand,
        time + 80,
      )
      const conflict = yield* applyInvocation(db, conflicting, time + 81)
      expect(conflict).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "semantic_conflict", detail: { existingOutcome: "no_change" } },
      })
      expect(yield* db.select().from(AdvisoryPlanSuggestionNoChangeSealTable).all()).toHaveLength(1)
      expect(yield* db.select().from(AdvisoryPlanSuggestionRevisionTable).all()).toHaveLength(3)
    }),
  )

  it.effect("keeps an alternative bound to the exact historical suggestion revision", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-02-02T09:00:00Z")
      const targetText = "Give me a concise example-first approach."
      const target = yield* seedAgentInvocation(
        db,
        "alternative_target",
        {
          cause: {
            type: "responsive_tutor_proposal",
            excerpt: excerpt(targetText),
            rationale: "Store one correctable advisory option.",
          },
          intents: [{ operation: "create", operationOrdinal: 0, createOrdinal: 0, snapshot: snapshot("short example") }],
        },
        targetText,
        time,
      )
      const targetApplied = yield* applyInvocation(db, target, time + 2)
      if (targetApplied.type !== "settled" || !isApplied(targetApplied.settlement)) {
        return yield* Effect.die("Expected the alternative target")
      }
      const targetResult = targetApplied.settlement.intentResults[0]!
      const targetRevision = {
        suggestionID: targetResult.suggestionID,
        revisionID: targetResult.revisionID,
        version: targetResult.version,
      }
      const alternative = yield* seedAgentInvocation(
        db,
        "alternative_create",
        {
          cause: { type: "proactive_tutor_proposal", rationale: "Offer a different fuzzy learning approach." },
          intents: [
            {
              operation: "alternative",
              operationOrdinal: 0,
              createOrdinal: 0,
              alternativeToRevision: targetRevision,
              snapshot: snapshot("worked counterexample"),
            },
          ],
        },
        "What other approach could work?",
        time + 10,
      )
      const alternativeApplied = yield* applyInvocation(db, alternative, time + 12)
      expect(alternativeApplied).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied", intentResults: [{ alternativeToRevision: targetRevision }] },
      })
      if (alternativeApplied.type !== "settled" || !isApplied(alternativeApplied.settlement)) {
        return yield* Effect.die("Expected an exact alternative")
      }

      const targetCurrent = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, targetResult.suggestionID, time + 20),
      )
      if (!targetCurrent) return yield* Effect.die("Expected the target head")
      const targetCorrection = "Make the original approach more detailed."
      const targetRevised = yield* seedAgentInvocation(
        db,
        "alternative_target_revise",
        {
          cause: { type: "learner_revision", excerpt: excerpt(targetCorrection) },
          intents: [
            {
              operation: "revise",
              operationOrdinal: 0,
              suggestionID: targetCurrent.suggestionRevisionRef.suggestionID,
              expectedHead: expectedHead(targetCurrent),
              snapshot: snapshot("detailed example"),
              rationale: "The learner requested more detail.",
            },
          ],
        },
        targetCorrection,
        time + 30,
      )
      const targetRevisionTwo = yield* applyInvocation(db, targetRevised, time + 32)
      expect(targetRevisionTwo).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied", intentResults: [{ version: 2 }] },
      })

      const alternativeResult = alternativeApplied.settlement.intentResults[0]!
      const alternativeCurrent = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, alternativeResult.suggestionID, time + 40),
      )
      if (!alternativeCurrent) return yield* Effect.die("Expected the alternative head")
      expect(alternativeCurrent.revision.alternativeToRevision).toEqual(targetRevision)
      const alternativeCorrection = "Keep the alternative, but make its opening gentler."
      const alternativeRevised = yield* seedAgentInvocation(
        db,
        "alternative_revise",
        {
          cause: { type: "learner_revision", excerpt: excerpt(alternativeCorrection) },
          intents: [
            {
              operation: "revise",
              operationOrdinal: 0,
              suggestionID: alternativeCurrent.suggestionRevisionRef.suggestionID,
              expectedHead: expectedHead(alternativeCurrent),
              snapshot: snapshot("gentle worked counterexample"),
              rationale: "Revise the alternative without retargeting its historical meaning.",
            },
          ],
        },
        alternativeCorrection,
        time + 50,
      )
      const revisedAlternative = yield* applyInvocation(db, alternativeRevised, time + 52)
      expect(revisedAlternative).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied", intentResults: [{ version: 2, alternativeToRevision: targetRevision }] },
      })
      const finalAlternative = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, alternativeResult.suggestionID, time + 60),
      )
      expect(finalAlternative?.revision.alternativeToRevision).toEqual(targetRevision)
      expect(finalAlternative?.alternativeTarget?.headRelation).toBe("head_advanced")
    }),
  )

  it.effect("terminalizes pre-admitted learner-revision race losers against one exact winner", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-02-03T09:00:00Z")
      const request = "Keep the next session concrete and example-led."
      const created = yield* seedAgentInvocation(
        db,
        "race_seed",
        {
          cause: { type: "responsive_tutor_proposal", excerpt: excerpt(request), rationale: "Preserve useful advice." },
          intents: [{ operation: "create", operationOrdinal: 0, createOrdinal: 0, snapshot: snapshot("one worked example") }],
        },
        request,
        time,
      )
      const initial = yield* applyInvocation(db, created, time + 2)
      if (initial.type !== "settled" || !isApplied(initial.settlement)) {
        return yield* Effect.die("Expected the initial suggestion to apply")
      }
      const initialResult = initial.settlement.intentResults[0]
      if (!initialResult || initialResult.outcome !== "changed") {
        return yield* Effect.die("Expected one created suggestion")
      }
      const current = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, initialResult.suggestionID, time + 10),
      )
      if (!current) return yield* Effect.die("Expected the initial current suggestion")

      const correction = "Use two worked examples before I attempt the transfer problem."
      const command: AdvisoryPlanSuggestion.Command = {
        cause: { type: "learner_revision", excerpt: excerpt(correction) },
        intents: [
          {
            operation: "revise",
            operationOrdinal: 0,
            suggestionID: current.suggestionRevisionRef.suggestionID,
            expectedHead: expectedHead(current),
            snapshot: snapshot("two worked examples"),
            rationale: "The learner asked for another example before transfer.",
          },
        ],
      }
      const winner = yield* seedAgentInvocation(db, "race_winner", command, correction, time + 20)
      const loser = yield* seedFollowupAgentInvocation(db, winner, "race_loser", command, time + 21)
      const recovery = yield* seedFollowupAgentInvocation(db, winner, "race_recovery", command, time + 22)
      const changed = yield* seedFollowupAgentInvocation(
        db,
        winner,
        "race_conflict",
        {
          cause: command.cause,
          intents: [
            {
              operation: "revise",
              operationOrdinal: 0,
              suggestionID: current.suggestionRevisionRef.suggestionID,
              expectedHead: expectedHead(current),
              snapshot: snapshot("three worked examples"),
              rationale: "A changed payload cannot reuse the learner-revision slot.",
            },
          ],
        },
        time + 23,
      )
      for (const [index, invocation] of [winner, loser, recovery, changed].entries()) {
        expect(
          yield* db.transaction((tx) =>
            AdvisoryPlanSuggestion.reserve(tx, {
              ...invocation,
              settlement: { time: time + 30 + index, order: index + 1 },
            }),
          ),
        ).toMatchObject({ type: "admitted" })
      }

      yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.settlePolicy(tx, {
          partID: winner.envelope.partID,
          outcome: "policy_allow",
          policyBasis: { source: "advisory-test", rule: "allow" },
          time: time + 40,
          order: 5,
        }),
      )
      const won = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.settle(tx, {
          partID: winner.envelope.partID,
          settlement: { time: time + 41, order: 6 },
        }),
      )
      if (won.type !== "settled" || !isApplied(won.settlement)) {
        return yield* Effect.die("Expected one exact advisory winner")
      }
      expect(
        yield* db.transaction((tx) =>
          AdvisoryPlanSuggestion.settle(tx, {
            partID: loser.envelope.partID,
            settlement: { time: time + 42, order: 7 },
          }),
        ),
      ).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "already_applied",
          existingOutcome: "applied",
          effectID: won.settlement.effectID,
        },
      })
      const recovered = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.recover(tx, {
          partID: recovery.envelope.partID,
          settlement: { time: time + 43, order: 8 },
        }),
      )
      expect(recovered).toMatchObject({
        type: "settled",
        settlement: { outcome: "already_applied", existingOutcome: "applied" },
      })
      if (recovered.type !== "settled") return yield* Effect.die("Expected recovery to terminalize the loser")
      expect(
        yield* db.transaction((tx) =>
          AdvisoryPlanSuggestion.recover(tx, {
            partID: recovery.envelope.partID,
            settlement: { time: time + 50, order: 9 },
          }),
        ),
      ).toEqual({ type: "replay", settlement: recovered.settlement })
      expect(
        yield* db.transaction((tx) =>
          AdvisoryPlanSuggestion.settle(tx, {
            partID: changed.envelope.partID,
            settlement: { time: time + 44, order: 9 },
          }),
        ),
      ).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "semantic_conflict", detail: { existingOutcome: "applied" } },
      })
      expect(yield* db.select().from(AdvisoryPlanSuggestionEffectTable).all()).toHaveLength(2)
      expect(yield* db.select().from(AdvisoryPlanSuggestionRevisionTable).all()).toHaveLength(2)
      expect(yield* db.select().from(AdvisoryPlanSuggestionNoChangeSealTable).all()).toHaveLength(0)
      expect(yield* db.select().from(AdvisoryPlanSuggestionCapabilitySettlementTable).all()).toHaveLength(2)
    }),
  )

  it.effect("projects only revision-owned advisory directory meaning and withholds identity without read authority", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-02-04T09:00:00Z")
      const request = "Please keep the next session example-led without making it a rigid schedule."
      const invocation = yield* seedAgentInvocation(
        db,
        "context_projection",
        {
          cause: { type: "responsive_tutor_proposal", excerpt: excerpt(request), rationale: "Preserve useful advice." },
          intents: [{ operation: "create", operationOrdinal: 0, createOrdinal: 0, snapshot: snapshot("one exact example") }],
        },
        request,
        time,
      )
      const applied = yield* applyInvocation(db, invocation, time + 2)
      if (applied.type !== "settled" || !isApplied(applied.settlement)) {
        return yield* Effect.die("Expected the Context suggestion to apply")
      }
      const result = applied.settlement.intentResults[0]
      if (!result || result.outcome !== "changed") return yield* Effect.die("Expected one changed suggestion")
      const projection = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, result.suggestionID, time + 20),
      )
      if (!projection) return yield* Effect.die("Expected the current suggestion projection")

      const authorized = yield* prepareLearningContext(db, invocation, time + 20, true)
      const section = authorized.cut.sections.find((item) => item.owner === "advisory_plan_suggestion")
      const projected = section?.entries.find(
        (item) => item.kind === "advisory_plan_suggestion" && item.locator.suggestionID === result.suggestionID,
      )
      expect(section).toMatchObject({
        owner: "advisory_plan_suggestion",
        selectionBasis: "identity_creation_then_id_not_priority",
      })
      if (!section || section.coverage === "not_authorized") {
        return yield* Effect.die("Expected the authorized advisory directory")
      }
      expect(section?.directoryCursor).toBeString()
      expect(projected).toMatchObject({
        kind: "advisory_plan_suggestion",
        locator: {
          suggestionID: result.suggestionID,
          revisionID: result.revisionID,
          version: 1,
          lazyReadAvailable: true,
        },
        semantic: {
          state: "value",
          value: {
            directorySummary: projection.revision.snapshot.directorySummary,
            purpose: projection.revision.snapshot.purpose,
            learnerVisibleScope: projection.revision.snapshot.learnerVisibleScope,
          },
        },
      })
      expect(JSON.stringify(projected)).not.toContain(projection.revision.snapshot.body)

      const withheld = yield* prepareLearningContext(db, invocation, time + 20, false)
      expect(withheld.cut.sections.find((item) => item.owner === "advisory_plan_suggestion")).toEqual({
        owner: "advisory_plan_suggestion",
        scope: "active_heads_matching_context_owner_keys_or_bounded_learner_home_fallback",
        selectionBasis: "advisory_plan_suggestion_read_capability_withheld",
        coverage: "not_authorized",
        countAtCut: "unknown",
        omission: { type: "unknown", reason: "advisory_plan_suggestion_read_capability_withheld" },
        entries: [],
      })
    }),
  )

  it.effect("keeps an admitted v6 advisory cut exact after correction while a fresh cut sees the successor", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-02-04T11:00:00Z")
      const request = "Keep the next session example-led, with one guided attempt after the example."
      const created = yield* seedAgentInvocation(
        db,
        "old_cut_create",
        {
          cause: { type: "responsive_tutor_proposal", excerpt: excerpt(request), rationale: "Preserve useful advice." },
          intents: [{ operation: "create", operationOrdinal: 0, createOrdinal: 0, snapshot: snapshot("example first") }],
        },
        request,
        time,
      )
      const applied = yield* applyInvocation(db, created, time + 2)
      if (applied.type !== "settled" || !isApplied(applied.settlement)) {
        return yield* Effect.die("Expected the old-cut advisory fixture to apply")
      }
      const createdResult = applied.settlement.intentResults[0]
      if (!createdResult || createdResult.outcome !== "changed") return yield* Effect.die("Expected one suggestion")
      const current = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, createdResult.suggestionID, time + 10),
      )
      if (!current) return yield* Effect.die("Expected the current old-cut suggestion")

      const correctionText = "Correction: explain the definition before the example; keep the later outline provisional."
      const correctedSnapshot = snapshot("definition before example")
      const correction = yield* seedAgentInvocation(
        db,
        "old_cut_correction",
        {
          cause: { type: "learner_revision", excerpt: excerpt(correctionText) },
          intents: [
            {
              operation: "revise",
              operationOrdinal: 0,
              suggestionID: createdResult.suggestionID,
              expectedHead: expectedHead(current),
              snapshot: correctedSnapshot,
              rationale: "Keep future teaching aligned with the learner's natural correction.",
            },
          ],
        },
        correctionText,
        time + 20,
        learningContextBasis(true),
      )
      const admitted = yield* db.transaction((tx) =>
        LearningContext.readCut(tx, correction.envelope.assistantMessageID),
      )
      if (admitted.type !== "available") return yield* Effect.die("Expected a stored admitted v6 cut")
      const admittedSection = admitted.cut.sections.find((item) => item.owner === "advisory_plan_suggestion")
      if (
        !admittedSection ||
        admittedSection.owner !== "advisory_plan_suggestion" ||
        admittedSection.coverage === "not_authorized"
      ) {
        return yield* Effect.die("Expected an authorized admitted advisory section")
      }
      expect(admittedSection.entries[0]?.locator).toMatchObject({
        suggestionID: createdResult.suggestionID,
        revisionID: createdResult.revisionID,
        version: 1,
      })
      expect(JSON.stringify(admitted)).toContain(current.revision.snapshot.directorySummary)
      expect(JSON.stringify(admitted)).not.toContain(correctedSnapshot.directorySummary)
      expect(
        yield* db.transaction((tx) =>
          AdvisoryPlanSuggestion.read(tx, {
            type: "current",
            suggestionID: createdResult.suggestionID,
            asOf: admitted.cut.cutAsOf,
            directoryCursor: admittedSection.directoryCursor,
          }),
        ),
      ).toMatchObject({ items: [{ revision: { id: createdResult.revisionID, version: 1 } }] })

      expect(yield* applyInvocation(db, correction, time + 22)).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied", intentResults: [{ version: 2 }] },
      })
      expect(
        yield* db.transaction((tx) => LearningContext.readCut(tx, correction.envelope.assistantMessageID)),
      ).toEqual(admitted)
      expect(
        yield* db
          .transaction((tx) =>
            AdvisoryPlanSuggestion.read(tx, {
              type: "current",
              suggestionID: createdResult.suggestionID,
              asOf: admitted.cut.cutAsOf,
              directoryCursor: admittedSection.directoryCursor,
            }),
          )
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "AdvisoryPlanSuggestion.InvalidCommandError", reason: "stale" })

      const fresh = yield* prepareLearningContext(db, correction, time + 30, true)
      const freshSection = fresh.cut.sections.find((item) => item.owner === "advisory_plan_suggestion")
      expect(freshSection?.entries[0]?.locator).toMatchObject({ version: 2 })
      expect(freshSection?.entries[0]?.locator.revisionID).not.toBe(createdResult.revisionID)
      expect(JSON.stringify(fresh)).toContain(correctedSnapshot.directorySummary)
      expect(JSON.stringify(fresh)).not.toContain(current.revision.snapshot.directorySummary)
    }),
  )

  it.effect("keeps an exact Course retrieval anchor distinct from fresh Course drift", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const time = Date.parse("2038-02-04T12:00:00Z")
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
      const courseRef = { type: "course_membership" as const, endpoint }
      const suggestionSnapshot: AdvisoryPlanSuggestion.SemanticSnapshotIntent = {
        learnerVisibleScope: "Semaphore invariant learning approach",
        retrievalScope: {
          type: "anchored",
          anchors: [{ stableOwnerKey: { type: "course", courseID: course.id }, exactBoundRef: courseRef }],
        },
        purpose: "Keep one course-scoped learning suggestion available without making it Course truth.",
        directorySummary: "Use one semaphore counterexample before formal proof.",
        body: "Work through one concrete semaphore counterexample, then return to the exact invariant proof.",
        exactBasisRefs: [courseRef],
        assumptionsAndUncertainty: "The Course relation is exact; the suggested teaching move remains fallible.",
      }
      const invocation = yield* seedAgentInvocation(
        db,
        "course_anchor",
        {
          cause: {
            type: "proactive_tutor_proposal",
            rationale: "Offer a non-disruptive course-scoped learning suggestion from exact current context.",
          },
          intents: [{ operation: "create", operationOrdinal: 0, createOrdinal: 0, snapshot: suggestionSnapshot }],
        },
        "Continue with the semaphore invariant.",
        time + 100,
        learningContextBasis(true),
      )
      const applied = yield* applyInvocation(db, invocation, time + 102)
      if (applied.type !== "settled" || !isApplied(applied.settlement)) {
        return yield* Effect.die("Expected the Course-anchored suggestion to apply")
      }
      const result = applied.settlement.intentResults[0]!
      const before = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, result.suggestionID, time + 110),
      )
      expect(before).toMatchObject({
        revision: {
          authorAndCause: { type: "proactive_tutor_proposal", source: { type: "model_operation" } },
          snapshot: {
            retrievalScope: { type: "anchored", anchors: [{ stableOwnerKey: { type: "course" } }] },
            exactBasis: [{ ref: courseRef }],
          },
        },
        retrievalAnchorRelations: [{ exactBoundRef: courseRef, relation: { state: "current" } }],
        basisDependencies: [{ ref: courseRef, state: "current" }],
      })
      const directory = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.listEligibleForContext(tx, {
          asOf: time + 110,
          eligibleKeys: [{ type: "course", courseID: course.id }],
        }),
      )
      expect(directory.candidates).toHaveLength(1)

      setSystemTime(new Date(time + 200))
      yield* courses.select({
        courseID: course.id,
        expectedSelectionRevisionID: published.revision.id,
        expectedCourseVersion: 0,
        expectedSelectionVersion: 1,
      })
      const oldCut = yield* db
        .transaction((tx) =>
          AdvisoryPlanSuggestion.read(tx, {
            type: "current",
            suggestionID: result.suggestionID,
            asOf: directory.asOf,
            directoryCursor: directory.directoryCursor,
          }),
        )
        .pipe(Effect.flip)
      expect(oldCut).toMatchObject({ _tag: "AdvisoryPlanSuggestion.InvalidCommandError", reason: "stale" })

      const after = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, result.suggestionID, time + 210),
      )
      expect(after).toMatchObject({
        retrievalAnchorRelations: [
          {
            exactBoundRef: courseRef,
            relation: {
              state: "changed",
              current: { workingSelection: { status: "stale", cause: "working_selection_mismatch" } },
            },
          },
        ],
        basisDependencies: [
          {
            ref: courseRef,
            state: "changed",
            current: { workingSelection: { status: "stale", cause: "working_selection_mismatch" } },
          },
        ],
      })
      expect(after?.revision).toEqual(before?.revision)
      expect(
        yield* db.transaction((tx) =>
          AdvisoryPlanSuggestion.readExactRevision(tx, result.suggestionID, result.revisionID),
        ),
      ).toEqual(before?.revision)
      const context = yield* prepareLearningContext(db, invocation, time + 220, true)
      const contextEntry = context.cut.sections
        .find((section) => section.owner === "advisory_plan_suggestion")
        ?.entries.find((entry) => entry.locator.suggestionID === result.suggestionID)
      expect(contextEntry).toMatchObject({
        locator: {
          suggestionID: result.suggestionID,
          retrievalKeys: [{ type: "course", courseID: course.id }],
          retrievalBindings: [{ exactBoundRef: courseRef }],
        },
        semantic: { state: "value", value: { retrievalRelations: [{ ordinal: 0, state: "changed" }] } },
      })
    }),
  )

  it.effect("preserves sealed advice and no-change truth across Session deletion", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-02-04T13:00:00Z")
      const source = "Keep this examples-first advice available after this Session ends."
      const created = yield* seedAgentInvocation(
        db,
        "sealed_session_create",
        {
          cause: { type: "responsive_tutor_proposal", excerpt: excerpt(source), rationale: "Preserve useful advice." },
          intents: [{ operation: "create", operationOrdinal: 0, createOrdinal: 0, snapshot: snapshot("examples first") }],
        },
        source,
        time,
      )
      const applied = yield* applyInvocation(db, created, time + 2)
      if (applied.type !== "settled" || !isApplied(applied.settlement)) {
        return yield* Effect.die("Expected a sealed advisory revision")
      }
      const changed = applied.settlement.intentResults[0]
      if (!changed || changed.outcome !== "changed") return yield* Effect.die("Expected a changed suggestion")
      const current = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, changed.suggestionID, time + 10),
      )
      if (!current) return yield* Effect.die("Expected a current advisory revision")

      const correction = "That advice is still right; preserve it without inventing another revision."
      const noChange = yield* seedAgentInvocation(
        db,
        "sealed_session_no_change",
        {
          cause: { type: "learner_revision", excerpt: excerpt(correction) },
          intents: [
            {
              operation: "revise",
              operationOrdinal: 0,
              suggestionID: changed.suggestionID,
              expectedHead: expectedHead(current),
              snapshot: snapshot("examples first"),
              rationale: "Exercise a truthful no-change settlement.",
            },
          ],
        },
        correction,
        time + 20,
      )
      expect(yield* applyInvocation(db, noChange, time + 22)).toMatchObject({
        type: "settled",
        settlement: { outcome: "no_change", existingOutcome: "materialized_no_change" },
      })

      for (const attack of [
        {
          statement: sql`DELETE FROM advisory_plan_suggestion_disposition
            WHERE invocation_part_id = ${created.envelope.partID}`,
          message: "Sealed advisory-suggestion evidence cannot be deleted",
        },
        {
          statement: sql`DELETE FROM advisory_plan_suggestion_capability_settlement
            WHERE invocation_part_id = ${created.envelope.partID}`,
          message: "Sealed advisory-suggestion evidence cannot be deleted",
        },
        {
          statement: sql`DELETE FROM advisory_plan_suggestion_disposition
            WHERE invocation_part_id = ${noChange.envelope.partID}`,
          message: "Sealed advisory-suggestion evidence cannot be deleted",
        },
        {
          statement: sql`DELETE FROM advisory_plan_suggestion_capability_settlement
            WHERE invocation_part_id = ${noChange.envelope.partID}`,
          message: "Sealed advisory-suggestion evidence cannot be deleted",
        },
      ]) {
        const rejected = yield* Effect.exit(db.run(attack.statement))
        expect(rejected._tag).toBe("Failure")
        if (rejected._tag === "Failure") expect(Cause.pretty(rejected.cause)).toContain(attack.message)
      }

      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          for (const invocation of [created, noChange]) {
            yield* TurnLifecycle.settleTool(tx, {
              turnID: invocation.envelope.turnID,
              partID: invocation.envelope.partID,
              state: "completed",
              time: time + 30,
            })
            yield* TurnLifecycle.settle(tx, {
              turnID: invocation.envelope.turnID,
              outcome: "completed",
              reason: "normal",
              time: time + 31,
            })
            yield* TurnLifecycle.deleteSessionTree(tx, {
              rootSessionID: invocation.envelope.sessionID,
              sessionIDs: [invocation.envelope.sessionID],
              timeDeleted: time + 32,
            })
          }
        }),
      )

      expect(
        yield* db.get(sql`
          SELECT
            (SELECT count(*) FROM session
              WHERE id IN (${created.envelope.sessionID}, ${noChange.envelope.sessionID})) AS sessions,
            (SELECT count(*) FROM learning_command_invocation
              WHERE part_id IN (${created.envelope.partID}, ${noChange.envelope.partID})) AS invocations,
            (SELECT count(*) FROM learning_command_receipt
              WHERE invocation_part_id IN (${created.envelope.partID}, ${noChange.envelope.partID})) AS receipts,
            (SELECT count(*) FROM advisory_plan_suggestion_disposition
              WHERE invocation_part_id IN (${created.envelope.partID}, ${noChange.envelope.partID})) AS dispositions,
            (SELECT count(*) FROM advisory_plan_suggestion_capability_settlement
              WHERE invocation_part_id IN (${created.envelope.partID}, ${noChange.envelope.partID})) AS capabilities,
            (SELECT count(*) FROM advisory_plan_suggestion_effect
              WHERE invocation_part_id = ${created.envelope.partID}) AS effects,
            (SELECT count(*) FROM advisory_plan_suggestion_revision
              WHERE suggestion_id = ${changed.suggestionID}) AS revisions,
            (SELECT count(*) FROM advisory_plan_suggestion_commit_seal
              WHERE invocation_part_id = ${created.envelope.partID}) AS commitSeals,
            (SELECT count(*) FROM advisory_plan_suggestion_no_change_seal
              WHERE invocation_part_id = ${noChange.envelope.partID}) AS noChangeSeals
        `),
      ).toEqual({
        sessions: 0,
        invocations: 2,
        receipts: 2,
        dispositions: 2,
        capabilities: 2,
        effects: 1,
        revisions: 1,
        commitSeals: 1,
        noChangeSeals: 1,
      })
      expect(
        yield* db.transaction((tx) =>
          AdvisoryPlanSuggestion.readExactRevision(tx, changed.suggestionID, changed.revisionID),
        ),
      ).toEqual(current.revision)
      expect(yield* db.all(sql.raw("PRAGMA foreign_key_check"))).toEqual([])
    }),
  )

  it.effect("deletes denied advisory command evidence with its Session", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-02-04T15:00:00Z")
      const source = "Do not retain this proposed cross-Session advice."
      const invocation = yield* seedAgentInvocation(
        db,
        "denied_session_cleanup",
        {
          cause: { type: "responsive_tutor_proposal", excerpt: excerpt(source), rationale: "Test denial cleanup." },
          intents: [{ operation: "create", operationOrdinal: 0, createOrdinal: 0, snapshot: snapshot("denied advice") }],
        },
        source,
        time,
      )
      const reserved = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.reserve(tx, { ...invocation, settlement: { time: time + 2, order: 1 } }),
      )
      if (reserved.type !== "admitted") return yield* Effect.die("Expected an admitted advisory candidate")
      yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.settlePolicy(tx, {
          partID: invocation.envelope.partID,
          outcome: "policy_deny",
          policyBasis: { source: "advisory-test", rule: "deny" },
          time: time + 3,
          order: 2,
        }),
      )
      expect(
        yield* db.transaction((tx) =>
          AdvisoryPlanSuggestion.settle(tx, {
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
        yield* db.get(sql`
          SELECT
            (SELECT count(*) FROM session WHERE id = ${invocation.envelope.sessionID}) AS sessions,
            (SELECT count(*) FROM learning_command_invocation
              WHERE part_id = ${invocation.envelope.partID}) AS invocations,
            (SELECT count(*) FROM learning_command_receipt
              WHERE invocation_part_id = ${invocation.envelope.partID}) AS receipts,
            (SELECT count(*) FROM advisory_plan_suggestion_disposition
              WHERE invocation_part_id = ${invocation.envelope.partID}) AS dispositions,
            (SELECT count(*) FROM advisory_plan_suggestion_capability_settlement
              WHERE invocation_part_id = ${invocation.envelope.partID}) AS capabilities,
            (SELECT count(*) FROM advisory_plan_suggestion_effect) AS effects,
            (SELECT count(*) FROM advisory_plan_suggestion_no_change_seal) AS noChangeSeals
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

  it.effect("retires and restores advice while a Tutor revision keeps one exact historical basis", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-02-04T17:00:00Z")
      const request = "Keep this example-first suggestion available until I ask to pause it."
      const created = yield* seedAgentInvocation(
        db,
        "lifecycle_create",
        {
          cause: { type: "responsive_tutor_proposal", excerpt: excerpt(request), rationale: "Preserve useful advice." },
          intents: [{ operation: "create", operationOrdinal: 0, createOrdinal: 0, snapshot: snapshot("one example") }],
        },
        request,
        time,
      )
      const applied = yield* applyInvocation(db, created, time + 2)
      if (applied.type !== "settled" || !isApplied(applied.settlement)) {
        return yield* Effect.die("Expected the lifecycle suggestion to apply")
      }
      const first = applied.settlement.intentResults[0]
      if (!first || first.outcome !== "changed") return yield* Effect.die("Expected one created suggestion")
      const initial = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, first.suggestionID, time + 10),
      )
      if (!initial) return yield* Effect.die("Expected the initial suggestion head")

      const pause = "Pause that advice for now; this does not mean I rejected it or stopped learning."
      const retiredInvocation = yield* seedAgentInvocation(
        db,
        "lifecycle_retire",
        {
          cause: { type: "learner_revision", excerpt: excerpt(pause) },
          intents: [
            {
              operation: "retire",
              operationOrdinal: 0,
              suggestionID: first.suggestionID,
              expectedHead: expectedHead(initial),
              rationale: "The learner asked to stop surfacing this advice without asserting adherence or rejection.",
            },
          ],
        },
        pause,
        time + 20,
      )
      const retired = yield* applyInvocation(db, retiredInvocation, time + 22)
      expect(retired).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied", intentResults: [{ operation: "retire", version: 2, disposition: "retired" }] },
      })
      if (retired.type !== "settled" || !isApplied(retired.settlement)) {
        return yield* Effect.die("Expected the suggestion to retire")
      }
      const retiredResult = retired.settlement.intentResults[0]!
      const retiredHead = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, first.suggestionID, time + 30),
      )
      if (!retiredHead) return yield* Effect.die("Expected the retired suggestion head")
      expect(retiredHead.revision.snapshot).toEqual(initial.revision.snapshot)

      const retiredRef = {
        type: "advisory_plan_suggestion_revision" as const,
        suggestionID: first.suggestionID,
        revisionID: retiredResult.revisionID,
        version: retiredResult.version,
      }
      const restoredSnapshot = {
        ...snapshot("two examples before transfer"),
        exactBasisRefs: [retiredRef],
      }
      const restoredInvocation = yield* seedAgentInvocation(
        db,
        "lifecycle_restore",
        {
          cause: {
            type: "tutor_revision",
            rationale: "Restore and revise the advice from its exact retired revision after the learner resumed it.",
          },
          intents: [
            {
              operation: "restore",
              operationOrdinal: 0,
              suggestionID: first.suggestionID,
              expectedHead: expectedHead(retiredHead),
              snapshot: restoredSnapshot,
              rationale: "The Tutor keeps the historical basis explicit and the new advice fallible.",
            },
          ],
        },
        "Resume that suggestion, but use two examples before transfer.",
        time + 40,
      )
      const restored = yield* applyInvocation(db, restoredInvocation, time + 42)
      expect(restored).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied", intentResults: [{ operation: "restore", version: 3, disposition: "active" }] },
      })
      const current = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, first.suggestionID, time + 50),
      )
      expect(current).toMatchObject({
        revision: {
          version: 3,
          operation: "restore",
          disposition: "active",
          snapshot: { body: restoredSnapshot.body, exactBasis: [{ ref: retiredRef }] },
        },
        basisDependencies: [
          {
            ref: retiredRef,
            state: "changed",
            current: { revisionID: expect.any(String), version: 3 },
          },
        ],
      })
      expect(
        yield* db.transaction((tx) =>
          AdvisoryPlanSuggestion.readExactRevision(tx, first.suggestionID, retiredResult.revisionID),
        ),
      ).toMatchObject({ version: 2, operation: "retire", disposition: "retired", snapshot: initial.revision.snapshot })

      const historyQuery = { type: "history" as const, suggestionID: first.suggestionID }
      const historyOne = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.read(tx, historyQuery, { limit: 2 }),
      )
      expect(historyOne).toMatchObject({ countAtCut: 3, returnedCount: 2, omittedCount: 1, truncated: true })
      if (!historyOne.nextCursor) return yield* Effect.die("Expected a bounded advisory history cursor")
      const historyTwo = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.read(tx, historyQuery, { limit: 2, cursor: historyOne.nextCursor }),
      )
      expect(historyTwo).toMatchObject({
        countAtCut: 3,
        returnedCount: 1,
        omittedCount: 0,
        truncated: false,
        items: [{ version: 3 }],
      })
      expect(historyTwo.nextCursor).toBeUndefined()

      const staleRestore = yield* seedAgentInvocation(
        db,
        "lifecycle_stale_restore",
        {
          cause: { type: "learner_revision", excerpt: excerpt("Try to reuse the retired head after it advanced.") },
          intents: [
            {
              operation: "restore",
              operationOrdinal: 0,
              suggestionID: first.suggestionID,
              expectedHead: expectedHead(retiredHead),
              rationale: "This stale head must not retarget the current suggestion.",
            },
          ],
        },
        "Try to reuse the retired head after it advanced.",
        time + 60,
      )
      const stale = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.reserve(tx, { ...staleRestore, settlement: { time: time + 62, order: 1 } }),
      )
      expect(stale).toMatchObject({ type: "settled", settlement: { outcome: "error", code: "stale" } })
    }),
  )

  it.effect("bounds nine fallback suggestions and discovers only from the original directory cut", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-02-04T19:00:00Z")
      const created = yield* Effect.forEach(
        Array.from({ length: AdvisoryPlanSuggestion.MAX_CONTEXT_ENTRIES + 1 }, (_, index) => index),
        (index) =>
          Effect.gen(function* () {
            const text = `Keep fallback suggestion ${index + 1} available without treating row order as priority.`
            const invocation = yield* seedAgentInvocation(
              db,
              `fallback_${index}`,
              {
                cause: {
                  type: "responsive_tutor_proposal",
                  excerpt: excerpt(text),
                  rationale: "Exercise bounded fallback discovery without semantic ranking.",
                },
                intents: [
                  {
                    operation: "create",
                    operationOrdinal: 0,
                    createOrdinal: 0,
                    snapshot: snapshot(`fallback option ${index + 1}`),
                  },
                ],
              },
              text,
              time + index * 10,
            )
            const result = yield* applyInvocation(db, invocation, time + index * 10 + 2)
            if (result.type !== "settled" || !isApplied(result.settlement)) {
              return yield* Effect.die(`Expected fallback suggestion ${index + 1}`)
            }
            return result.settlement.intentResults[0]!.suggestionID
          }),
        { concurrency: 1 },
      )
      const directory = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.listEligibleForContext(tx, { asOf: time + 200, eligibleKeys: [] }),
      )
      expect(directory).toMatchObject({
        countAtCut: AdvisoryPlanSuggestion.MAX_CONTEXT_ENTRIES + 1,
        order: "identity_creation_then_suggestion_id_non_priority",
      })
      expect(directory.candidates).toHaveLength(AdvisoryPlanSuggestion.MAX_CONTEXT_ENTRIES)
      expect(directory.candidates.map((item) => item.suggestion.id)).toEqual(
        created.slice(0, AdvisoryPlanSuggestion.MAX_CONTEXT_ENTRIES),
      )
      expect(directory.candidates.every((item) => item.retrievalArm === "learner_home_fallback")).toBe(true)

      const query = { type: "discover" as const, directoryCursor: directory.directoryCursor }
      const pages: AdvisoryPlanSuggestion.ReadPage[] = []
      let cursor: string | undefined
      do {
        const page = yield* db.transaction((tx) =>
          AdvisoryPlanSuggestion.read(tx, query, { limit: 3, ...(cursor ? { cursor } : {}) }),
        )
        pages.push(page)
        cursor = page.nextCursor
      } while (cursor)
      expect(pages.map((page) => page.returnedCount)).toEqual([3, 3, 3])
      expect(pages.map((page) => page.omittedCount)).toEqual([6, 3, 0])
      expect(pages.at(-1)?.truncated).toBe(false)
      expect(
        pages.flatMap((page) =>
          page.items.map((item) => ("suggestionRevisionRef" in item ? item.suggestionRevisionRef.suggestionID : item.id)),
        ),
      ).toEqual(created)

      const laterText = "A later fallback suggestion must not silently enter an already-issued directory."
      const laterInvocation = yield* seedAgentInvocation(
        db,
        "fallback_later",
        {
          cause: {
            type: "responsive_tutor_proposal",
            excerpt: excerpt(laterText),
            rationale: "Advance the owner after the original directory cut.",
          },
          intents: [
            { operation: "create", operationOrdinal: 0, createOrdinal: 0, snapshot: snapshot("later option") },
          ],
        },
        laterText,
        time + 300,
      )
      expect(yield* applyInvocation(db, laterInvocation, time + 302)).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied" },
      })
      const stale = yield* db
        .transaction((tx) => AdvisoryPlanSuggestion.read(tx, query, { limit: 3 }))
        .pipe(Effect.flip)
      expect(stale).toMatchObject({ _tag: "AdvisoryPlanSuggestion.InvalidCommandError", reason: "stale" })
      expect(JSON.stringify(stale)).not.toContain("later option")

      const fresh = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.listEligibleForContext(tx, { asOf: time + 400, eligibleKeys: [] }),
      )
      expect(fresh.countAtCut).toBe(AdvisoryPlanSuggestion.MAX_CONTEXT_ENTRIES + 2)
      expect(fresh.candidates).toHaveLength(AdvisoryPlanSuggestion.MAX_CONTEXT_ENTRIES)
    }),
  )

  it.effect("keeps every maximum authored field exactly readable and rejects the first overflow byte atomically", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-02-05T09:00:00Z")
      const request = "r".repeat(AdvisoryPlanSuggestion.MAX_EXCERPT_BYTES)
      const maximum: AdvisoryPlanSuggestion.SemanticSnapshotIntent = {
        learnerVisibleScope: "s".repeat(AdvisoryPlanSuggestion.MAX_LEARNER_VISIBLE_SCOPE_BYTES),
        retrievalScope: { type: "learner_home_fallback", reason: "no_stable_owner_anchor" },
        purpose: "p".repeat(AdvisoryPlanSuggestion.MAX_PURPOSE_BYTES),
        directorySummary: "d".repeat(AdvisoryPlanSuggestion.MAX_DIRECTORY_SUMMARY_BYTES),
        body: "b".repeat(AdvisoryPlanSuggestion.MAX_BODY_BYTES),
        exactBasisRefs: [],
        assumptionsAndUncertainty: "u".repeat(AdvisoryPlanSuggestion.MAX_ASSUMPTIONS_BYTES),
      }
      const invocation = yield* seedAgentInvocation(
        db,
        "maximum_read",
        {
          cause: {
            type: "responsive_tutor_proposal",
            excerpt: excerpt(request),
            rationale: "q".repeat(AdvisoryPlanSuggestion.MAX_RATIONALE_BYTES),
          },
          intents: [{ operation: "create", operationOrdinal: 0, createOrdinal: 0, snapshot: maximum }],
        },
        request,
        time,
      )
      const applied = yield* applyInvocation(db, invocation, time + 2)
      if (applied.type !== "settled" || !isApplied(applied.settlement)) {
        return yield* Effect.die("Expected the maximum legal suggestion to apply")
      }
      const result = applied.settlement.intentResults[0]
      if (!result || result.outcome !== "changed") return yield* Effect.die("Expected one maximum revision")

      for (const query of [
        { type: "revision" as const, suggestionID: result.suggestionID, revisionID: result.revisionID },
        { type: "current" as const, suggestionID: result.suggestionID, asOf: time + 20 },
        { type: "discover" as const },
      ]) {
        const page = yield* db.transaction((tx) =>
          AdvisoryPlanSuggestion.read(tx, query, {
            limit: AdvisoryPlanSuggestion.MAX_READ_ITEMS,
            byteLimit: AdvisoryPlanSuggestion.MAX_READ_BYTES,
          }),
        )
        expect(page.canonicalBytes).toBeLessThanOrEqual(AdvisoryPlanSuggestion.MAX_READ_BYTES)
        expect(JSON.stringify(page.items)).toContain(result.suggestionID)
        expect(JSON.stringify(page.items)).toContain(maximum.body)
      }

      const alternativeAtSemanticCeiling = {
        ...maximum,
        directorySummary: "d".repeat(304),
      }
      const alternative = yield* seedAgentInvocation(
        db,
        "maximum_context_alternative",
        {
          cause: {
            type: "proactive_tutor_proposal",
            rationale: "Preserve one maximum compact alternative without exceeding the protected Context entry.",
          },
          intents: [
            {
              operation: "alternative",
              operationOrdinal: 0,
              createOrdinal: 0,
              alternativeToRevision: {
                suggestionID: result.suggestionID,
                revisionID: result.revisionID,
                version: result.version,
              },
              snapshot: alternativeAtSemanticCeiling,
            },
          ],
        },
        "Offer a bounded alternative to the current advice.",
        time + 30,
      )
      const alternativeApplied = yield* applyInvocation(db, alternative, time + 32)
      if (alternativeApplied.type !== "settled" || !isApplied(alternativeApplied.settlement)) {
        return yield* Effect.die("Expected the maximum compact alternative to apply")
      }
      const alternativeResult = alternativeApplied.settlement.intentResults[0]
      if (!alternativeResult || alternativeResult.outcome !== "changed") {
        return yield* Effect.die("Expected one maximum compact alternative revision")
      }
      const context = yield* prepareLearningContext(db, alternative, time + 40, true)
      const boundaryEntry = context.cut.sections
        .find((section) => section.owner === "advisory_plan_suggestion")
        ?.entries.find((entry) => entry.locator.suggestionID === alternativeResult.suggestionID)
      expect(boundaryEntry?.semantic).toMatchObject({ state: "value" })
      if (boundaryEntry?.semantic?.state !== "value") {
        return yield* Effect.die("Expected a complete compact advisory semantic value")
      }
      expect(new TextEncoder().encode(JSON.stringify(boundaryEntry.semantic.value)).byteLength).toBeLessThanOrEqual(
        AdvisoryPlanSuggestion.MAX_SEMANTIC_VALUE_BYTES,
      )

      const before = {
        effects: (yield* db.select().from(AdvisoryPlanSuggestionEffectTable).all()).length,
        suggestions: (yield* db.select().from(AdvisoryPlanSuggestionTable).all()).length,
        revisions: (yield* db.select().from(AdvisoryPlanSuggestionRevisionTable).all()).length,
      }
      const overContext = yield* seedAgentInvocation(
        db,
        "maximum_context_alternative_over",
        {
          cause: {
            type: "proactive_tutor_proposal",
            rationale: "This candidate is exactly one compact semantic byte over the protected Context limit.",
          },
          intents: [
            {
              operation: "alternative",
              operationOrdinal: 0,
              createOrdinal: 0,
              alternativeToRevision: {
                suggestionID: result.suggestionID,
                revisionID: result.revisionID,
                version: result.version,
              },
              snapshot: { ...alternativeAtSemanticCeiling, directorySummary: `${alternativeAtSemanticCeiling.directorySummary}x` },
            },
          ],
        },
        "Offer an alternative that exceeds the compact Context boundary.",
        time + 50,
      )
      expect(yield* applyInvocation(db, overContext, time + 52)).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "capacity_exceeded" },
      })
      expect(() =>
        AdvisoryPlanSuggestion.canonicalizeCommand({
          cause: {
            type: "responsive_tutor_proposal",
            excerpt: excerpt(request),
            rationale: "first byte over the body bound",
          },
          intents: [
            {
              operation: "create",
              operationOrdinal: 0,
              createOrdinal: 0,
              snapshot: { ...maximum, body: `${maximum.body}x` },
            },
          ],
        }),
      ).toThrow(AdvisoryPlanSuggestion.InvalidCommandError)
      expect({
        effects: (yield* db.select().from(AdvisoryPlanSuggestionEffectTable).all()).length,
        suggestions: (yield* db.select().from(AdvisoryPlanSuggestionTable).all()).length,
        revisions: (yield* db.select().from(AdvisoryPlanSuggestionRevisionTable).all()).length,
      }).toEqual(before)
    }),
  )

  it.effect("bounds a current prior-advisory basis before commit and keeps the admitted maximum Context-readable", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2038-02-05T13:00:00Z")
      const sourceText = "Keep this source suggestion available as exact fallible advice."
      const sourceInvocation = yield* seedAgentInvocation(
        db,
        "maximum_prior_advisory_source",
        {
          cause: {
            type: "responsive_tutor_proposal",
            excerpt: excerpt(sourceText),
            rationale: "Create the exact prior-advisory basis.",
          },
          intents: [{ operation: "create", operationOrdinal: 0, createOrdinal: 0, snapshot: snapshot("source") }],
        },
        sourceText,
        time,
      )
      const source = yield* applyInvocation(db, sourceInvocation, time + 2)
      if (source.type !== "settled" || !isApplied(source.settlement)) {
        return yield* Effect.die("Expected the prior-advisory basis to apply")
      }
      const sourceResult = source.settlement.intentResults[0]
      if (!sourceResult || sourceResult.outcome !== "changed") {
        return yield* Effect.die("Expected one prior-advisory revision")
      }
      const basisRef = {
        type: "advisory_plan_suggestion_revision" as const,
        suggestionID: sourceResult.suggestionID,
        revisionID: sourceResult.revisionID,
        version: sourceResult.version,
      }
      const boundarySnapshot: AdvisoryPlanSuggestion.SemanticSnapshotIntent = {
        learnerVisibleScope: "s".repeat(AdvisoryPlanSuggestion.MAX_LEARNER_VISIBLE_SCOPE_BYTES),
        retrievalScope: { type: "learner_home_fallback", reason: "no_stable_owner_anchor" },
        purpose: "p".repeat(AdvisoryPlanSuggestion.MAX_PURPOSE_BYTES),
        directorySummary: "d".repeat(488),
        body: "b".repeat(AdvisoryPlanSuggestion.MAX_BODY_BYTES),
        exactBasisRefs: [basisRef],
        assumptionsAndUncertainty: "u".repeat(AdvisoryPlanSuggestion.MAX_ASSUMPTIONS_BYTES),
      }
      const boundaryText = "Preserve advice whose exact basis is the prior suggestion revision."
      const boundaryInvocation = yield* seedAgentInvocation(
        db,
        "maximum_prior_advisory_boundary",
        {
          cause: {
            type: "responsive_tutor_proposal",
            excerpt: excerpt(boundaryText),
            rationale: "Exercise the complete prior-advisory compact relation envelope.",
          },
          intents: [
            { operation: "create", operationOrdinal: 0, createOrdinal: 0, snapshot: boundarySnapshot },
          ],
        },
        boundaryText,
        time + 10,
      )
      const boundary = yield* applyInvocation(db, boundaryInvocation, time + 12)
      if (boundary.type !== "settled" || !isApplied(boundary.settlement)) {
        return yield* Effect.die("Expected the prior-advisory compact boundary to apply")
      }
      const boundaryResult = boundary.settlement.intentResults[0]
      if (!boundaryResult || boundaryResult.outcome !== "changed") {
        return yield* Effect.die("Expected one boundary revision")
      }
      const context = yield* prepareLearningContext(db, boundaryInvocation, time + 20, true)
      const entry = context.cut.sections
        .find((section) => section.owner === "advisory_plan_suggestion")
        ?.entries.find((candidate) => candidate.locator.suggestionID === boundaryResult.suggestionID)
      if (entry?.semantic?.state !== "value") {
        return yield* Effect.die("Expected a complete current prior-advisory compact value")
      }
      expect(entry.semantic.value).toMatchObject({
        basisRelations: [
          {
            ordinal: 0,
            state: "current",
            currentRevision: { revisionID: sourceResult.revisionID, version: sourceResult.version },
          },
        ],
      })
      expect(new TextEncoder().encode(JSON.stringify(entry.semantic.value)).byteLength).toBeLessThanOrEqual(
        AdvisoryPlanSuggestion.MAX_SEMANTIC_VALUE_BYTES,
      )

      const overInvocation = yield* seedAgentInvocation(
        db,
        "maximum_prior_advisory_over",
        {
          cause: {
            type: "responsive_tutor_proposal",
            excerpt: excerpt(boundaryText),
            rationale: "Reject the first byte beyond the complete compact relation envelope.",
          },
          intents: [
            {
              operation: "create",
              operationOrdinal: 0,
              createOrdinal: 0,
              snapshot: { ...boundarySnapshot, directorySummary: `${boundarySnapshot.directorySummary}x` },
            },
          ],
        },
        boundaryText,
        time + 30,
      )
      const before = {
        effects: (yield* db.select().from(AdvisoryPlanSuggestionEffectTable).all()).length,
        suggestions: (yield* db.select().from(AdvisoryPlanSuggestionTable).all()).length,
        revisions: (yield* db.select().from(AdvisoryPlanSuggestionRevisionTable).all()).length,
        noChangeSeals: (yield* db.select().from(AdvisoryPlanSuggestionNoChangeSealTable).all()).length,
        frontier: yield* db.transaction((tx) => LearningFrontier.read(tx)),
      }
      expect(yield* applyInvocation(db, overInvocation, time + 32)).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "capacity_exceeded" },
      })
      expect({
        effects: (yield* db.select().from(AdvisoryPlanSuggestionEffectTable).all()).length,
        suggestions: (yield* db.select().from(AdvisoryPlanSuggestionTable).all()).length,
        revisions: (yield* db.select().from(AdvisoryPlanSuggestionRevisionTable).all()).length,
        noChangeSeals: (yield* db.select().from(AdvisoryPlanSuggestionNoChangeSealTable).all()).length,
        frontier: yield* db.transaction((tx) => LearningFrontier.read(tx)),
      }).toEqual(before)
    }),
  )
})

function snapshot(label: string): AdvisoryPlanSuggestion.SemanticSnapshotIntent {
  return {
    learnerVisibleScope: "Learning approach for the next few sessions",
    retrievalScope: { type: "learner_home_fallback", reason: "no_stable_owner_anchor" },
    purpose: "Help the learner continue without turning advice into a rigid schedule.",
    directorySummary: `Current advice: ${label}.`,
    body: `Use ${label}; keep the next step concrete and leave later steps provisional.`,
    exactBasisRefs: [],
    assumptionsAndUncertainty: "Fallible Tutor advice; revise naturally when it stops helping.",
  }
}

function snapshotIntent(value: AdvisoryPlanSuggestion.SemanticSnapshot): AdvisoryPlanSuggestion.SemanticSnapshotIntent {
  return {
    learnerVisibleScope: value.learnerVisibleScope,
    retrievalScope:
      value.retrievalScope.type === "learner_home_fallback"
        ? value.retrievalScope
        : {
            type: "anchored",
            anchors: value.retrievalScope.anchors.map((anchor) => ({
              stableOwnerKey: anchor.stableOwnerKey,
              exactBoundRef: anchor.exactBound.ref,
            })),
          },
    purpose: value.purpose,
    directorySummary: value.directorySummary,
    body: value.body,
    exactBasisRefs: value.exactBasis.map((basis) => basis.ref),
    ...(value.assumptionsAndUncertainty === undefined
      ? {}
      : { assumptionsAndUncertainty: value.assumptionsAndUncertainty }),
  }
}

function excerpt(text: string) {
  return { text, startByte: 0, endByte: new TextEncoder().encode(text).byteLength }
}

function expectedHead(projection: AdvisoryPlanSuggestion.ProjectionAtCut) {
  if (!projection.currentHead) throw new Error("Expected a current advisory suggestion head")
  return projection.currentHead
}

function isApplied(
  settlement: LearningCommand.PhysicalSettlement,
): settlement is AdvisoryPlanSuggestion.AppliedSettlement {
  return (
    settlement.outcome === "applied" &&
    "advisoryPlanSuggestionKind" in settlement &&
    settlement.advisoryPlanSuggestionKind === "change_set"
  )
}

function applyInvocation(db: Database.Interface["db"], invocation: AdvisoryPlanSuggestion.Invocation, time: number) {
  return Effect.gen(function* () {
    const reserved = yield* db.transaction((tx) =>
      AdvisoryPlanSuggestion.reserve(tx, { ...invocation, settlement: { time, order: 1 } }),
    )
    if (reserved.type !== "admitted") return reserved
    yield* db.transaction((tx) =>
      AdvisoryPlanSuggestion.settlePolicy(tx, {
        partID: invocation.envelope.partID,
        outcome: "policy_allow",
        policyBasis: { source: "advisory-test", rule: "allow" },
        time: time + 1,
        order: 2,
      }),
    )
    return yield* db.transaction((tx) =>
      AdvisoryPlanSuggestion.settle(tx, {
        partID: invocation.envelope.partID,
        settlement: { time: time + 2, order: 3 },
      }),
    )
  })
}

function seedAgentInvocation(
  db: Database.Interface["db"],
  suffix: string,
  command: AdvisoryPlanSuggestion.Command,
  userText: string,
  time: number,
  learningContextBasis?: LearningContext.CapabilityBasis,
) {
  return Effect.gen(function* () {
    const sessionID = SessionSchema.ID.make(`ses_aps_${suffix}`)
    const userMessageID = SessionV1.MessageID.ascending(`msg_aps_user_${suffix}`)
    const userPartID = SessionV1.PartID.ascending(`prt_aps_user_${suffix}`)
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
          policyBasis: { source: "advisory-test" },
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
      learningContextBasis,
    })
  }).pipe(Effect.orDie)
}

function seedFollowupAgentInvocation(
  db: Database.Interface["db"],
  predecessor: AdvisoryPlanSuggestion.Invocation,
  suffix: string,
  command: AdvisoryPlanSuggestion.Command,
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
    learningContextBasis,
  })
}

function seedModelInvocation(
  db: Database.Interface["db"],
  input: Readonly<{
    suffix: string
    command: AdvisoryPlanSuggestion.Command
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
    const assistantMessageID = SessionV1.MessageID.ascending(`msg_aps_assistant_${input.suffix}`)
    const partID = SessionV1.PartID.ascending(`prt_aps_tool_${input.suffix}`)
    const callID = `call-aps-${input.suffix}`
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
              tool: AdvisoryPlanSuggestion.UPDATE_CAPABILITY,
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
          contextFingerprint: new Bun.CryptoHasher("sha256").update(`aps-context:${input.suffix}`).digest("hex"),
          snapshotFrontier: yield* LearningFrontier.read(tx),
          timeAdmitted: input.time,
          ...(input.learningContextBasis ? { learningContextBasis: input.learningContextBasis } : {}),
        })
        yield* TurnLifecycle.sealCandidateSet(tx, {
          turnID: input.turnID,
          sessionID: input.sessionID,
          assistantMessageID,
          candidates: [
            {
              partID,
              callID,
              tool: AdvisoryPlanSuggestion.UPDATE_CAPABILITY,
              envelope: { command: input.command },
            },
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
        capabilityIdentity: AdvisoryPlanSuggestion.UPDATE_CAPABILITY,
        capabilityVersion: AdvisoryPlanSuggestion.UPDATE_VERSION,
        authorizationBasis: "agent_action" as const,
        timeAdmitted: input.time,
      },
      command: input.command,
    } satisfies AdvisoryPlanSuggestion.Invocation
  })
}

function prepareLearningContext(
  db: Database.Interface["db"],
  invocation: AdvisoryPlanSuggestion.Invocation,
  asOf: number,
  includeAdvisoryRead: boolean,
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
        capabilityBasis: learningContextBasis(includeAdvisoryRead),
      })
    }),
  )
}

function learningContextBasis(includeAdvisoryRead: boolean): LearningContext.CapabilityBasis {
  const lazy = LearningContext.LAZY_READ_CAPABILITY_IDS.filter(
    (id) => includeAdvisoryRead || id !== AdvisoryPlanSuggestion.READ_CAPABILITY,
  )
  const providerSurface = LearningContext.bindProviderToolSurface({
    route: {
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
    },
    toolChoice: { state: "absent" },
    definitions: lazy.map((id) => ({ id, value: { type: "function", name: id } })),
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
    id: SessionV1.MessageID.ascending("msg_aps_template_user"),
    sessionID: SessionSchema.ID.make("ses_aps_template"),
    role: "user",
    time: { created: time },
    agent: "repa",
    model,
  }
}

function assistantData(parentID: SessionV1.MessageID, time: number): SessionV1.Assistant {
  return {
    id: SessionV1.MessageID.ascending("msg_aps_template_assistant"),
    sessionID: SessionSchema.ID.make("ses_aps_template"),
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
