import { describe, expect, setSystemTime, test } from "bun:test"
import { AdvisoryPlanSuggestion } from "@opencode-ai/core/advisory-plan-suggestion"
import { Assignment } from "@opencode-ai/core/assignment"
import {
  AssignmentCapabilitySettlementTable,
  AssignmentDispositionTable,
  AssignmentEffectTable,
  AssignmentNoChangeSealTable,
  AssignmentRevisionTable,
} from "@opencode-ai/core/assignment/sql"
import { Artifact } from "@opencode-ai/core/artifact"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Course } from "@opencode-ai/core/course"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { insertPhysicalReceipt } from "@opencode-ai/core/learning-command/physical"
import { LearningContext } from "@opencode-ai/core/learning-context"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { ModelV2 } from "@opencode-ai/core/model"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Representation } from "@opencode-ai/core/representation"
import { PDFTextProfile } from "@opencode-ai/core/representation/pdf-text-profile"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { MessageTable, PartTable, SessionTable } from "@opencode-ai/core/session/sql"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { eq, sql } from "drizzle-orm"
import { Cause, Effect, Layer } from "effect"
import { mkdir, writeFile } from "node:fs/promises"
import path from "path"
import { admitModelWithLearningContext } from "./fixture/model-admission"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import {
  applyAdvisoryPlanSuggestionInvocation,
  seedAdvisoryPlanSuggestionInvocation,
} from "./fixture/advisory-plan-suggestion"

const database = Database.layerFromPath(":memory:").pipe(Layer.orDie)
const it = testEffect(
  LayerNode.compile(LayerNode.group([Artifact.node, Course.node, Database.node]), [[Database.node, database]]),
)
const windowsTest = process.platform === "win32" ? test : test.skip
const model = { modelID: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }

describe.serial("Assignment", () => {
  it.effect("keeps advisory Assignment timing and head currentness separate from immutable advice", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-01-01T09:00:00Z")
      const sourceText = "The amortized-analysis worksheet is due on January 3."
      const assignment = yield* seedAgentInvocation(
        db,
        "advisory_assignment_source",
        createCommand(sourceText, snapshot("Complete the amortized-analysis worksheet", "Connect it to worked examples")),
        sourceText,
        time,
      )
      const assignmentApplied = yield* applyInvocation(db, assignment, time + 2)
      if (assignmentApplied.type !== "settled" || assignmentApplied.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected the exact Assignment source")
      }
      const assignmentChange = assignmentApplied.settlement.changes[0]!
      const ref = {
        type: "assignment_revision" as const,
        assignmentID: assignmentChange.assignmentID,
        revisionID: assignmentChange.committedRevision.revisionID,
        version: assignmentChange.committedRevision.version,
      }
      const suggestion = yield* seedAdvisoryPlanSuggestionInvocation(
        db,
        "assignment_reference",
        {
          cause: {
            type: "proactive_tutor_proposal",
            rationale: "Preserve one deadline-aware teaching suggestion without changing Assignment truth.",
          },
          intents: [
            {
              operation: "create",
              operationOrdinal: 0,
              createOrdinal: 0,
              snapshot: {
                learnerVisibleScope: "Amortized-analysis worksheet learning approach",
                retrievalScope: {
                  type: "anchored",
                  anchors: [
                    {
                      stableOwnerKey: { type: "assignment", assignmentID: assignmentChange.assignmentID },
                      exactBoundRef: ref,
                    },
                  ],
                },
                purpose: "Keep the near-term explanation aligned with an exact obligation and clock relation.",
                directorySummary: "Use one worked accounting example before the worksheet.",
                body: "Explain one accounting-method example, then let the learner attempt the analogous worksheet step.",
                exactBasisRefs: [ref],
                assumptionsAndUncertainty: "The deadline is exact; this advice does not imply completion or mastery.",
              },
            },
          ],
        },
        "Keep the Assignment-related teaching approach available.",
        time + 10,
      )
      const applied = yield* applyAdvisoryPlanSuggestionInvocation(db, suggestion, time + 12)
      if (applied.type !== "settled" || applied.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected the Assignment-backed suggestion")
      }
      const result = applied.settlement.intentResults[0]
      if (!result || result.outcome !== "changed") {
        return yield* Effect.die("Expected one Assignment-backed advisory revision")
      }
      const before = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, result.suggestionID, time + 20),
      )
      expect(before).toMatchObject({
        retrievalAnchorRelations: [
          {
            exactBoundRef: ref,
            relation: { state: "current", current: { dueRelationAtCut: { relation: "before", overdue: false } } },
          },
        ],
        basisDependencies: [
          { ref, state: "current", current: { dueRelationAtCut: { relation: "before", overdue: false } } },
        ],
      })
      const overdue = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, result.suggestionID, Date.parse("2037-01-04T09:00:00Z")),
      )
      expect(overdue).toMatchObject({
        retrievalAnchorRelations: [
          { exactBoundRef: ref, relation: { state: "current", current: { dueRelationAtCut: { overdue: true } } } },
        ],
      })

      const current = yield* currentAssignment(db, assignmentChange.assignmentID, Date.parse("2037-01-04T09:00:00Z"))
      const correctionText = "Correction: the worksheet also asks for a potential-method comparison."
      const correction = yield* seedAgentInvocation(
        db,
        "advisory_assignment_correction",
        {
          cause: learnerReport(correctionText),
          intents: [
            {
              type: "revise",
              assignmentID: assignmentChange.assignmentID,
              expectedHead: expectedHead(current),
              snapshot: snapshot(
                "Complete the amortized-analysis worksheet and potential-method comparison",
                "Connect both methods to worked examples",
              ),
              sourceAction: { type: "rebind_current_source_to_cause" },
              relationAction: { type: "preserve" },
              rationale: "Preserve the corrected obligation without rewriting the advisory revision.",
            },
          ],
        },
        correctionText,
        Date.parse("2037-01-04T10:00:00Z"),
      )
      const corrected = yield* applyInvocation(db, correction, Date.parse("2037-01-04T10:00:02Z"))
      if (corrected.type !== "settled" || corrected.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected the later Assignment head")
      }
      const successor = corrected.settlement.changes[0]!
      const after = yield* db.transaction((tx) =>
        AdvisoryPlanSuggestion.readCurrent(tx, result.suggestionID, Date.parse("2037-01-04T10:00:10Z")),
      )
      expect(after).toMatchObject({
        retrievalAnchorRelations: [
          {
            exactBoundRef: ref,
            relation: { state: "changed", current: { revisionID: successor.committedRevision.revisionID } },
          },
        ],
        basisDependencies: [
          { ref, state: "changed", current: { revisionID: successor.committedRevision.revisionID } },
        ],
      })
      expect(after?.revision).toEqual(before?.revision)
    }),
  )

  it.effect("keeps immutable obligation meaning while clock and source availability change only read-time projections", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-01-01T09:00:00Z")
      const source = "The operating-systems analysis is due on January 3."
      const invocation = yield* seedAgentInvocation(
        db,
        "projection",
        createCommand(source, snapshot("Analyze the semaphore safety boundary", "Connect the proof to the course model")),
        source,
        time,
      )
      const result = yield* applyInvocation(db, invocation, time + 2)
      expect(result).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied", assignmentKind: "change_set", changes: [{ operation: "create" }] },
      })
      if (
        result.type !== "settled" ||
        result.settlement.outcome !== "applied" ||
        !("changes" in result.settlement)
      ) {
        return yield* Effect.die("Expected an applied Assignment creation")
      }
      const settlement = result.settlement as Assignment.AppliedSettlement
      const assignmentID = settlement.changes[0]!.assignmentID
      const before = yield* db.transaction((tx) => Assignment.readCurrent(tx, assignmentID, time + 3))
      const exactBefore = yield* db.transaction((tx) =>
        Assignment.readExactRevision(tx, assignmentID, settlement.changes[0]!.committedRevision.revisionID),
      )
      yield* db.transaction((tx) =>
        LearningCommand.Occurrence.markSourceUnavailable(tx, {
          occurrenceID: invocation.envelope.occurrenceID,
          timeDeleted: time + 4,
        }),
      )
      const beforeDeletionAtHistoricalCut = yield* db.transaction((tx) =>
        Assignment.readCurrent(tx, assignmentID, time + 3),
      )
      const after = yield* db.transaction((tx) =>
        Assignment.readCurrent(tx, assignmentID, Date.parse("2037-01-05T09:00:00Z")),
      )
      const exactAfter = yield* db.transaction((tx) =>
        Assignment.readExactRevision(tx, assignmentID, settlement.changes[0]!.committedRevision.revisionID),
      )

      expect(before).toMatchObject({
        assignmentRevisionRef: { assignmentID, version: 1 },
        dueRelationAtCut: { type: "local_date", relation: "before", overdue: false },
        sourceStatusAtCut: { sourceOwner: "learner_occurrence", ownerRecordedState: { state: "available" } },
        revision: { disposition: "open" },
      })
      expect(beforeDeletionAtHistoricalCut).toMatchObject({
        sourceStatusAtCut: {
          sourceOwner: "learner_occurrence",
          ownerRecordedState: { state: "available" },
          exactOwnerDependency: {
            owner: "learner_occurrence",
            occurrenceID: invocation.envelope.occurrenceID,
            state: "available",
            timeAdmitted: time,
            tombstoneTime: null,
          },
          asOf: time + 3,
        },
      })
      expect(after).toMatchObject({
        assignmentRevisionRef: before?.assignmentRevisionRef,
        dueRelationAtCut: { type: "local_date", relation: "after", overdue: true },
        sourceStatusAtCut: {
          sourceOwner: "learner_occurrence",
          ownerRecordedState: { state: "source_unavailable" },
        },
        revision: { disposition: "open" },
      })
      expect(exactAfter).toEqual(exactBefore)
      expect(after?.assignmentOwnerCut).toEqual(before?.assignmentOwnerCut)
    }),
  )

  it.effect("keeps deadline kinds, comparators, expiry, and clock-only projection distinct", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-06-01T12:00:00Z")
      const source = "These are the exact deadline meanings for six learning obligations."
      const instant = (comparator: "inclusive" | "exclusive") => ({
        type: "instant" as const,
        sourceExpression: "2037-06-01T12:00:00+00:00",
        localDateTime: "2037-06-01T12:00:00",
        comparator,
        timeZone: { type: "fixed_offset" as const, offsetMinutes: 0 },
      })
      const localDate = (comparator: "inclusive" | "exclusive") => ({
        type: "local_date" as const,
        civilDate: "2037-06-01",
        comparator,
        timeZone: { type: "fixed_offset" as const, offsetMinutes: 0 },
      })
      const snapshots = [
        { ...snapshot("Unresolved deadline", "Keep unknown distinct"), dueBasis: { type: "unresolved" as const } },
        {
          ...snapshot("Explicitly no deadline", "Expiry is a separate source fact"),
          dueBasis: { type: "explicitly_no_deadline" as const },
          expiryBoundary: instant("exclusive"),
        },
        { ...snapshot("Inclusive local date", "Read local-date relation"), dueBasis: localDate("inclusive") },
        { ...snapshot("Exclusive local date", "Read local-date relation"), dueBasis: localDate("exclusive") },
        { ...snapshot("Inclusive instant", "Read exact-instant relation"), dueBasis: instant("inclusive") },
        { ...snapshot("Exclusive instant", "Read exact-instant relation"), dueBasis: instant("exclusive") },
      ]
      const invocation = yield* seedAgentInvocation(
        db,
        "temporal_matrix",
        {
          cause: learnerReport(source),
          intents: snapshots.map((value, index) => ({ type: "create" as const, createOrdinal: index, snapshot: value })),
        },
        source,
        time - 100,
      )
      const result = yield* applyInvocation(db, invocation, time - 98)
      if (result.type !== "settled" || result.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected the temporal Assignment matrix to apply")
      }
      const ids = result.settlement.changes.toSorted((left, right) => left.ordinal - right.ordinal)
      const projections = yield* Effect.forEach(ids, (change) =>
        db.transaction((tx) => Assignment.readCurrent(tx, change.assignmentID, time)),
      )
      expect(projections[0]).toMatchObject({
        dueRelationAtCut: { type: "unresolved" },
        expiryRelationAtCut: { type: "none" },
      })
      expect(projections[1]).toMatchObject({
        dueRelationAtCut: { type: "explicitly_no_deadline" },
        expiryRelationAtCut: { type: "instant", relation: "at", expired: true },
      })
      expect(projections[2]).toMatchObject({
        dueRelationAtCut: { type: "local_date", relation: "on", overdue: false },
      })
      expect(projections[3]).toMatchObject({
        dueRelationAtCut: { type: "local_date", relation: "on", overdue: true },
      })
      expect(projections[4]).toMatchObject({
        dueRelationAtCut: { type: "instant", relation: "at", overdue: false },
      })
      expect(projections[5]).toMatchObject({
        dueRelationAtCut: { type: "instant", relation: "at", overdue: true },
      })

      const counts = yield* db.get(sql`
        SELECT
          (SELECT count(*) FROM assignment_revision) AS revisions,
          (SELECT count(*) FROM assignment_effect) AS effects,
          (SELECT count(*) FROM assignment_commit_seal) AS seals
      `)
      const exact = yield* db.transaction((tx) =>
        Assignment.readExactRevision(tx, ids[4]!.assignmentID, ids[4]!.committedRevision.revisionID),
      )
      const before = yield* db.transaction((tx) => Assignment.readCurrent(tx, ids[4]!.assignmentID, time - 1))
      const after = yield* db.transaction((tx) => Assignment.readCurrent(tx, ids[4]!.assignmentID, time + 1))
      expect(before?.dueRelationAtCut).toEqual({ type: "instant", relation: "before", overdue: false })
      expect(after?.dueRelationAtCut).toEqual({ type: "instant", relation: "after", overdue: true })
      expect(
        yield* db.transaction((tx) =>
          Assignment.readExactRevision(tx, ids[4]!.assignmentID, ids[4]!.committedRevision.revisionID),
        ),
      ).toEqual(exact)
      expect(
        yield* db.get(sql`
          SELECT
            (SELECT count(*) FROM assignment_revision) AS revisions,
            (SELECT count(*) FROM assignment_effect) AS effects,
            (SELECT count(*) FROM assignment_commit_seal) AS seals
        `),
      ).toEqual(counts)
    }),
  )

  it.effect("rejects invalid civil dates at the Assignment revision trigger", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-06-02T09:00:00Z")
      const created = yield* createOne(db, "invalid_civil_date_trigger", time)
      const row = yield* db
        .select()
        .from(AssignmentRevisionTable)
        .where(eq(AssignmentRevisionTable.assignment_id, created.assignmentID))
        .get()
      if (!row) return yield* Effect.die("Expected a persisted Assignment revision fixture")
      yield* db.run(sql.raw("DROP TRIGGER assignment_revision_sealed_effect_closed"))
      const invalid = {
        type: "local_date" as const,
        civilDate: "2037-99-99",
        comparator: "inclusive" as const,
        resolvedZone: { type: "fixed_offset" as const, offsetMinutes: 0 },
      }
      const dueRejected = yield* Effect.exit(
        db
          .insert(AssignmentRevisionTable)
          .values({
            ...row,
            id: Assignment.createRevisionID(),
            version: row.version + 1,
            predecessor_revision_id: row.id,
            operation_ordinal: 100,
            snapshot: { ...row.snapshot, dueBasis: invalid },
            due_basis: invalid,
          })
          .run(),
      )
      expect(dueRejected._tag).toBe("Failure")
      if (dueRejected._tag === "Failure") {
        expect(Cause.pretty(dueRejected.cause)).toContain("Assignment due basis is not a closed temporal arm")
      }

      const expiryRejected = yield* Effect.exit(
        db
          .insert(AssignmentRevisionTable)
          .values({
            ...row,
            id: Assignment.createRevisionID(),
            version: row.version + 1,
            predecessor_revision_id: row.id,
            operation_ordinal: 101,
            snapshot: { ...row.snapshot, expiryBoundary: invalid },
            expiry_boundary: invalid,
          })
          .run(),
      )
      expect(expiryRejected._tag).toBe("Failure")
      if (expiryRejected._tag === "Failure") {
        expect(Cause.pretty(expiryRejected.cause)).toContain("Assignment expiry boundary is not a closed temporal arm")
      }
      expect(yield* db.select().from(AssignmentRevisionTable).all()).toHaveLength(1)
    }),
  )

  it.effect("corrects a maximum completed snapshot directly to cancelled with exact replay and bounded failure", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-02-01T09:00:00Z")
      const creationSource = maximumText(
        "My course requires this maximum-bound proof obligation. ",
        Assignment.MAX_EXCERPT_BYTES,
        "s",
      )
      const creation = yield* seedAgentInvocation(
        db,
        "terminal_create",
        createCommand(creationSource, maximumSnapshot("terminal")),
        creationSource,
        time,
      )
      const created = yield* applyInvocation(db, creation, time + 2)
      if (created.type !== "settled" || created.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected the maximum Assignment fixture to apply")
      }
      const assignmentID = created.settlement.changes[0]!.assignmentID
      const completedHead = yield* currentAssignment(db, assignmentID, time + 10)
      const completionSource = maximumText(
        "I explicitly report that I completed this course obligation. ",
        Assignment.MAX_EXCERPT_BYTES,
        "c",
      )
      const completion = yield* seedAgentInvocation(
        db,
        "terminal_complete",
        {
          cause: learnerReport(completionSource),
          intents: [
            {
              type: "complete",
              assignmentID,
              expectedHead: expectedHead(completedHead),
              sourceAction: { type: "rebind_current_source_to_cause" },
              relationAction: { type: "preserve" },
              rationale: maximumText(
                "The learner explicitly reported completion. ",
                Assignment.MAX_RATIONALE_BYTES,
                "r",
              ),
            },
          ],
        },
        completionSource,
        time + 20,
      )
      const completed = yield* applyInvocation(db, completion, time + 22)
      expect(completed).toMatchObject({ type: "settled", settlement: { outcome: "applied" } })

      const cancelledHead = yield* currentAssignment(db, assignmentID, time + 30)
      expect(cancelledHead.current.disposition).toBe("completed")
      expect(cancelledHead.current.snapshot).toEqual(
        expect.objectContaining({
          obligationSummary: maximumSnapshot("terminal").obligationSummary,
          learningContext: maximumSnapshot("terminal").learningContext,
        }),
      )
      const correctionSource = maximumText(
        "Correction: it was not completed; the instructor cancelled it. ",
        Assignment.MAX_EXCERPT_BYTES,
        "x",
      )
      const correction = yield* seedAgentInvocation(
        db,
        "terminal_correct",
        {
          cause: learnerReport(correctionSource),
          intents: [
            {
              type: "correct",
              assignmentID,
              expectedHead: expectedHead(cancelledHead),
              finalDisposition: "cancelled",
              sourceAction: { type: "rebind_current_source_to_cause" },
              relationAction: { type: "preserve" },
              rationale: maximumText(
                "Correct the terminal disposition from the learner's explicit report. ",
                Assignment.MAX_RATIONALE_BYTES,
                "q",
              ),
            },
          ],
        },
        correctionSource,
        time + 40,
      )
      const beforeCorrection = yield* assignmentDomainCounts(db)
      const corrected = yield* applyInvocation(db, correction, time + 42)
      expect(corrected).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied", changes: [{ operation: "correct", assignmentID }] },
      })
      expect(yield* assignmentDomainCounts(db)).toEqual({
        assignments: beforeCorrection.assignments,
        revisions: beforeCorrection.revisions + 1,
        effects: beforeCorrection.effects + 1,
        seals: beforeCorrection.seals + 1,
        receipts: beforeCorrection.receipts + 1,
      })
      const history = yield* db.transaction((tx) =>
        Assignment.read(tx, { type: "history", assignmentID }, { asOf: time + 50 }),
      )
      expect(
        history.items.map((item) => ("disposition" in item ? item.disposition : "unexpected")),
      ).toEqual(["open", "completed", "cancelled"])
      expect((yield* currentAssignment(db, assignmentID, time + 50)).current.disposition).toBe("cancelled")

      const completionReplay = yield* db.transaction((tx) =>
        Assignment.reserve(tx, { ...completion, settlement: { time: time + 60, order: 9 } }),
      )
      expect(completionReplay).toEqual({ type: "replay", settlement: completed.settlement })

      const overBoundSource = "Correct this cancelled Assignment only if the replacement snapshot is valid."
      const overBound = yield* seedAgentInvocation(
        db,
        "terminal_correct_over_bound",
        {
          cause: learnerReport(overBoundSource),
          intents: [
            {
              type: "correct",
              assignmentID,
              expectedHead: expectedHead(yield* currentAssignment(db, assignmentID, time + 70)),
              snapshot: {
                ...maximumSnapshot("over-bound"),
                obligationSummary: "s".repeat(Assignment.MAX_SUMMARY_BYTES + 1),
              },
              finalDisposition: "cancelled",
              sourceAction: { type: "rebind_current_source_to_cause" },
              relationAction: { type: "preserve" },
              rationale: "This one-byte-over snapshot must create no Assignment effect.",
            },
          ],
        },
        overBoundSource,
        time + 80,
      )
      const beforeOverBound = yield* assignmentDomainCounts(db)
      const rejected = yield* Effect.flip(
        db.transaction((tx) =>
          Assignment.reserve(tx, { ...overBound, settlement: { time: time + 82, order: 1 } }),
        ),
      )
      expect(rejected).toMatchObject({ reason: "validation_error" })
      expect(yield* assignmentDomainCounts(db)).toEqual(beforeOverBound)
    }),
  )

  it.effect("corrects a superseded Assignment while preserving the exact replacement relation and target history", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-03-01T09:00:00Z")
      const created = yield* createOne(db, "replacement_create", time)
      const predecessor = yield* currentAssignment(db, created.assignmentID, time + 10)
      const replacementSource = "The revised brief replaces the earlier analysis with a memory-model comparison."
      const replacement = yield* seedAgentInvocation(
        db,
        "replacement_apply",
        {
          cause: learnerReport(replacementSource),
          intents: [
            {
              type: "replace",
              assignmentID: created.assignmentID,
              expectedHead: expectedHead(predecessor),
              sourceAction: { type: "rebind_current_source_to_cause" },
              rationale: "The new brief is a distinct replacement obligation.",
              successor: {
                type: "create",
                createOrdinal: 1,
                snapshot: snapshot("Compare the memory models", "Explain the replacement brief"),
              },
            },
          ],
        },
        replacementSource,
        time + 20,
      )
      const replaced = yield* applyInvocation(db, replacement, time + 22)
      if (replaced.type !== "settled" || replaced.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected an applied Assignment replacement")
      }
      const predecessorAfterReplace = yield* currentAssignment(db, created.assignmentID, time + 30)
      const successorID = predecessorAfterReplace.current.supersessionTarget?.assignmentID
      if (!successorID) return yield* Effect.die("Expected an exact replacement target")
      const successorBefore = yield* currentAssignment(db, successorID, time + 30)
      const correctionSource = "Correction: the old brief's due wording was inaccurate, but it is still replaced by the new brief."
      const correction = yield* seedAgentInvocation(
        db,
        "replacement_correct",
        {
          cause: learnerReport(correctionSource),
          intents: [
            {
              type: "correct",
              assignmentID: created.assignmentID,
              expectedHead: expectedHead(predecessorAfterReplace),
              snapshot: snapshot("Analyze the corrected semaphore boundary", "Keep the corrected historical brief"),
              finalDisposition: "superseded",
              sourceAction: { type: "rebind_current_source_to_cause" },
              relationAction: { type: "preserve" },
              rationale: "Correct predecessor meaning without changing its valid replacement relation.",
            },
          ],
        },
        correctionSource,
        time + 40,
      )
      const corrected = yield* applyInvocation(db, correction, time + 42)
      expect(corrected).toMatchObject({ type: "settled", settlement: { outcome: "applied" } })
      const predecessorAfterCorrection = yield* currentAssignment(db, created.assignmentID, time + 50)
      const successorAfter = yield* currentAssignment(db, successorID, time + 50)
      expect(predecessorAfterCorrection.current).toMatchObject({
        version: 3,
        disposition: "superseded",
        supersessionTarget: predecessorAfterReplace.current.supersessionTarget,
        snapshot: { obligationSummary: "Analyze the corrected semaphore boundary" },
      })
      expect(successorAfter).toEqual(successorBefore)
    }),
  )

  it.effect("retargets and clears only the current supersession edge and rejects duplicate current incoming edges", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-03-10T09:00:00Z")
      const origin = yield* createOne(db, "graph_origin", time)
      const firstTarget = yield* createOne(db, "graph_first_target", time + 100)
      const secondTarget = yield* createOne(db, "graph_second_target", time + 200)
      const originV1 = yield* currentAssignment(db, origin.assignmentID, time + 300)
      const firstTargetHead = yield* currentAssignment(db, firstTarget.assignmentID, time + 300)
      const secondTargetHead = yield* currentAssignment(db, secondTarget.assignmentID, time + 300)

      const setSource = "Correction: the first exact Assignment replaces the original obligation."
      const set = yield* seedAgentInvocation(
        db,
        "graph_set",
        {
          cause: learnerReport(setSource),
          intents: [
            {
              type: "correct",
              assignmentID: origin.assignmentID,
              expectedHead: expectedHead(originV1),
              finalDisposition: "superseded",
              sourceAction: { type: "preserve_predecessor_source" },
              relationAction: {
                type: "set_or_retarget",
                target: Assignment.revisionReference(firstTargetHead.current),
              },
              rationale: "Set one exact current replacement without mutating its target.",
            },
          ],
        },
        setSource,
        time + 310,
      )
      expect(yield* applyInvocation(db, set, time + 312)).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied" },
      })
      const originV2 = yield* currentAssignment(db, origin.assignmentID, time + 320)
      expect(originV2.current).toMatchObject({
        version: 2,
        disposition: "superseded",
        supersessionTarget: Assignment.revisionReference(firstTargetHead.current),
      })

      const retargetSource = "Correction: the second exact Assignment, not the first, is the valid replacement."
      const retarget = yield* seedAgentInvocation(
        db,
        "graph_retarget",
        {
          cause: learnerReport(retargetSource),
          intents: [
            {
              type: "correct",
              assignmentID: origin.assignmentID,
              expectedHead: expectedHead(originV2),
              finalDisposition: "superseded",
              sourceAction: { type: "preserve_predecessor_source" },
              relationAction: {
                type: "set_or_retarget",
                target: Assignment.revisionReference(secondTargetHead.current),
              },
              rationale: "Retarget the current edge while preserving both target Assignments.",
            },
          ],
        },
        retargetSource,
        time + 330,
      )
      expect(yield* applyInvocation(db, retarget, time + 332)).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied" },
      })
      const originV3 = yield* currentAssignment(db, origin.assignmentID, time + 340)
      expect(originV3.current).toMatchObject({
        version: 3,
        disposition: "superseded",
        supersessionTarget: Assignment.revisionReference(secondTargetHead.current),
      })
      expect(yield* currentAssignment(db, firstTarget.assignmentID, time + 340)).toEqual(firstTargetHead)
      expect(yield* currentAssignment(db, secondTarget.assignmentID, time + 340)).toEqual(secondTargetHead)

      const clearSource = "Correction: the original obligation remains open and has no replacement."
      const clear = yield* seedAgentInvocation(
        db,
        "graph_clear",
        {
          cause: learnerReport(clearSource),
          intents: [
            {
              type: "correct",
              assignmentID: origin.assignmentID,
              expectedHead: expectedHead(originV3),
              finalDisposition: "open",
              sourceAction: { type: "preserve_predecessor_source" },
              relationAction: { type: "clear", finalDisposition: "open" },
              rationale: "Clear only the current edge without deleting immutable relation history.",
            },
          ],
        },
        clearSource,
        time + 350,
      )
      expect(yield* applyInvocation(db, clear, time + 352)).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied" },
      })
      const originV4 = yield* currentAssignment(db, origin.assignmentID, time + 360)
      expect(originV4.current).toMatchObject({ version: 4, disposition: "open" })
      expect(originV4.current.supersessionTarget).toBeUndefined()
      const history = yield* db.transaction((tx) =>
        Assignment.read(tx, { type: "history", assignmentID: origin.assignmentID }, { asOf: time + 360 }),
      )
      expect(history.items.map((item) => ("supersessionTarget" in item ? item.supersessionTarget : undefined))).toEqual([
        undefined,
        Assignment.revisionReference(firstTargetHead.current),
        Assignment.revisionReference(secondTargetHead.current),
        undefined,
      ])

      const left = yield* createOne(db, "graph_duplicate_left", time + 400)
      const right = yield* createOne(db, "graph_duplicate_right", time + 500)
      const target = yield* createOne(db, "graph_duplicate_target", time + 600)
      const leftHead = yield* currentAssignment(db, left.assignmentID, time + 700)
      const rightHead = yield* currentAssignment(db, right.assignmentID, time + 700)
      const targetHead = yield* currentAssignment(db, target.assignmentID, time + 700)
      const beforeInvalid = yield* db.get(sql`
        SELECT
          (SELECT count(*) FROM assignment_effect) AS effects,
          (SELECT count(*) FROM assignment_revision) AS revisions,
          (SELECT count(*) FROM assignment_commit_seal) AS seals
      `)
      const invalidSource = "This mistaken interpretation gives one target two current predecessors."
      const invalid = yield* seedAgentInvocation(
        db,
        "graph_duplicate_incoming",
        {
          cause: learnerReport(invalidSource),
          intents: [leftHead, rightHead].map((head) => ({
            type: "correct" as const,
            assignmentID: head.current.assignmentID,
            expectedHead: expectedHead(head),
            finalDisposition: "superseded" as const,
            sourceAction: { type: "preserve_predecessor_source" as const },
            relationAction: {
              type: "set_or_retarget" as const,
              target: Assignment.revisionReference(targetHead.current),
            },
            rationale: "This invalid batch must settle no Assignment revision.",
          })),
        },
        invalidSource,
        time + 710,
      )
      expect(yield* applyInvocation(db, invalid, time + 712)).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "validation_error" },
      })
      expect(
        yield* db.get(sql`
          SELECT
            (SELECT count(*) FROM assignment_effect) AS effects,
            (SELECT count(*) FROM assignment_revision) AS revisions,
            (SELECT count(*) FROM assignment_commit_seal) AS seals
        `),
      ).toEqual(beforeInvalid)
      expect((yield* currentAssignment(db, left.assignmentID, time + 720)).current.version).toBe(1)
      expect((yield* currentAssignment(db, right.assignmentID, time + 720)).current.version).toBe(1)
    }),
  )

  it.effect("keeps learner direction local while allowing an exact owner-read correction to replace an obligation", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-03-20T09:00:00Z")
      const created = yield* createOne(db, "direction_boundary_origin", time)
      const open = yield* currentAssignment(db, created.assignmentID, time + 10)
      const directionText = "Hide this from my current learning view."

      const invalidCommands: Assignment.ChangeSetCommand[] = [
        {
          cause: { type: "interpreted_learner_direction", excerpt: learnerReport(directionText).excerpt },
          intents: [
            {
              type: "revise",
              assignmentID: created.assignmentID,
              expectedHead: expectedHead(open),
              snapshot: snapshot("Rewrite this obligation from a direction", "This would invent Assignment truth"),
              sourceAction: { type: "preserve_predecessor_source" },
              relationAction: { type: "preserve" },
              rationale: "A pure direction cannot rewrite source-bearing obligation meaning.",
            },
          ],
        },
        {
          cause: { type: "interpreted_learner_direction", excerpt: learnerReport(directionText).excerpt },
          intents: [
            {
              type: "replace",
              assignmentID: created.assignmentID,
              expectedHead: expectedHead(open),
              sourceAction: { type: "preserve_predecessor_source" },
              rationale: "A pure direction cannot create a replacement obligation.",
              successor: {
                type: "create",
                createOrdinal: 1,
                snapshot: snapshot("Invented replacement", "This successor has no obligation source"),
              },
            },
          ],
        },
      ]
      const beforeInvalid = yield* assignmentDomainCounts(db)
      yield* Effect.forEach(
        invalidCommands,
        (command, index) =>
          seedAgentInvocation(
            db,
            `direction_boundary_invalid_${index}`,
            command,
            directionText,
            time + 20 + index * 10,
          ).pipe(
            Effect.flatMap((invocation) => applyInvocation(db, invocation, time + 22 + index * 10)),
            Effect.tap((result) =>
              Effect.sync(() =>
                expect(result).toMatchObject({
                  type: "settled",
                  settlement: { outcome: "error", code: "validation_error" },
                }),
              ),
            ),
          ),
        { discard: true },
      )
      expect(yield* assignmentDomainCounts(db)).toEqual(beforeInvalid)

      const dismiss = yield* seedAgentInvocation(
        db,
        "direction_boundary_dismiss",
        {
          cause: { type: "interpreted_learner_direction", excerpt: learnerReport(directionText).excerpt },
          intents: [
            {
              type: "dismiss",
              assignmentID: created.assignmentID,
              expectedHead: expectedHead(open),
              sourceAction: { type: "preserve_predecessor_source" },
              relationAction: { type: "preserve" },
              rationale: "Apply only the learner's local visibility direction.",
            },
          ],
        },
        directionText,
        time + 50,
      )
      expect(yield* applyInvocation(db, dismiss, time + 52)).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied" },
      })
      const dismissed = yield* currentAssignment(db, created.assignmentID, time + 60)
      expect(dismissed.current).toMatchObject({ disposition: "dismissed", version: 2 })

      const reactivateText = "Show that same obligation again."
      const reactivate = yield* seedAgentInvocation(
        db,
        "direction_boundary_reactivate",
        {
          cause: { type: "interpreted_learner_direction", excerpt: learnerReport(reactivateText).excerpt },
          intents: [
            {
              type: "correct",
              assignmentID: created.assignmentID,
              expectedHead: expectedHead(dismissed),
              finalDisposition: "open",
              sourceAction: { type: "preserve_predecessor_source" },
              relationAction: { type: "preserve" },
              rationale: "Reverse only the prior local dismissal.",
            },
          ],
        },
        reactivateText,
        time + 70,
      )
      expect(yield* applyInvocation(db, reactivate, time + 72)).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied" },
      })
      const reactivated = yield* currentAssignment(db, created.assignmentID, time + 80)
      expect(reactivated.current).toMatchObject({ disposition: "open", version: 3 })
      expect(reactivated.current.snapshot).toEqual(open.current.snapshot)
      expect(reactivated.current.effectiveSourceBasisAtCommit).toEqual(open.current.effectiveSourceBasisAtCommit)

      const correction = yield* seedAgentInvocation(
        db,
        "direction_boundary_agent_correction",
        {
          cause: {
            type: "agent_correction",
            rationale: "Correct the earlier interpretation using the exact current Assignment owner read.",
            ownerReads: [Assignment.ownerReadReference(reactivated)],
          },
          intents: [
            {
              type: "replace",
              assignmentID: created.assignmentID,
              expectedHead: expectedHead(reactivated),
              sourceAction: { type: "preserve_predecessor_source" },
              rationale: "The source-backed obligation was misread as one record rather than a replacement.",
              successor: {
                type: "create",
                createOrdinal: 1,
                snapshot: snapshot("Analyze the corrected replacement", "Teach from the preserved exact source"),
              },
            },
          ],
        },
        "Continue correcting the exact source-backed interpretation.",
        time + 90,
      )
      const corrected = yield* applyInvocation(db, correction, time + 92)
      if (corrected.type !== "settled" || corrected.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected the exact owner-read correction to replace the Assignment")
      }
      const result = corrected.settlement.intentResults[0]
      if (result?.outcome !== "changed" || result.operation !== "replace" || !result.successorAssignmentID) {
        return yield* Effect.die("Expected the correction to return its generated successor")
      }
      expect(corrected).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "applied",
          intentResults: [{ outcome: "changed", operation: "replace", successorAssignmentID: result.successorAssignmentID }],
        },
      })
      const predecessorAfterCorrection = yield* currentAssignment(db, created.assignmentID, time + 100)
      const successorAfterCorrection = yield* currentAssignment(db, result.successorAssignmentID, time + 100)
      expect(predecessorAfterCorrection.current).toMatchObject({
        disposition: "superseded",
        supersessionTarget: Assignment.revisionReference(successorAfterCorrection.current),
      })
      expect(successorAfterCorrection.current).toMatchObject({ disposition: "open", version: 1 })
      expect(successorAfterCorrection.current.creationSourceBasis).toEqual(reactivated.current.effectiveSourceBasisAtCommit)
      expect(successorAfterCorrection.current.effectiveSourceBasisAtCommit).toEqual(
        reactivated.current.effectiveSourceBasisAtCommit,
      )
    }),
  )

  it.effect("replays an exact physical settlement after source loss without consulting current source state", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-04-01T09:00:00Z")
      const source = "This obligation remains open."
      const invocation = yield* seedAgentInvocation(
        db,
        "physical_replay",
        createCommand(source, snapshot("Trace the lock-free proof", "Work through the invariants")),
        source,
        time,
      )
      const applied = yield* applyInvocation(db, invocation, time + 2)
      if (applied.type !== "settled") return yield* Effect.die("Expected a settled Assignment fixture")
      yield* db.transaction((tx) =>
        LearningCommand.Occurrence.markSourceUnavailable(tx, {
          occurrenceID: invocation.envelope.occurrenceID,
          timeDeleted: time + 10,
        }),
      )
      const replay = yield* db.transaction((tx) =>
        Assignment.reserve(tx, { ...invocation, settlement: { time: time + 20, order: 99 } }),
      )
      expect(replay).toEqual({ type: "replay", settlement: applied.settlement })
      const context = yield* db.transaction((tx) => Assignment.listOpenForContext(tx, { asOf: time + 30 }))
      expect(context).toMatchObject({ countAtCut: 1, candidates: [{ projection: { revision: { disposition: "open" } } }] })
    }),
  )

  it.effect("keeps exact Artifact revision truth separate from active-source drift and revalidates before commit", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const artifacts = yield* Artifact.Service
      const time = Date.parse("2037-04-10T09:00:00Z")
      const observer = Artifact.Observer.trusted("assignment-artifact-source", 1)
      const artifactText = "Semaphore proof"
      const fingerprint = {
        algorithm: "sha256",
        digest: new Bun.CryptoHasher("sha256").update(artifactText).digest("hex"),
        byteLength: new TextEncoder().encode(artifactText).byteLength,
      } as const
      const present = (observedAt: number) => ({
        result: "present" as const,
        fingerprint,
        mediaType: "application/pdf",
        observer,
        timeObserved: observedAt,
      })
      const artifact = yield* artifacts.admit({
        location: Artifact.CanonicalLocation.trusted(path.resolve("assignment-source", "semaphore.pdf")),
        observation: present(time),
        authority: Artifact.Admission.learnerInstruction("assignment-artifact-source", 1),
      })
      const revisionID = artifact.source.currentRevisionID
      const attribution = artifact.source.revisionAttribution
      if (!revisionID || !attribution) return yield* Effect.die("Expected an admitted Artifact revision")
      const command = {
        cause: {
          type: "interpreted_source_observation" as const,
          source: {
            type: "artifact_revision" as const,
            artifactID: artifact.id,
            revisionID,
            attribution,
            selector: { locator: "page:1" },
          },
        },
        intents: [
          {
            type: "create" as const,
            createOrdinal: 0,
            snapshot: snapshot("Analyze the Artifact's semaphore proof", "Explain the cited proof before practice"),
          },
        ],
      }
      const invocation = yield* seedAgentInvocation(
        db,
        "artifact_source_create",
        command,
        "Use the admitted source to help with this learning obligation.",
        time + 10,
      )
      const applied = yield* applyInvocation(db, invocation, time + 12)
      if (applied.type !== "settled" || applied.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected a source-observation Assignment")
      }
      const settlement = applied.settlement as Assignment.AppliedSettlement
      const assignmentID = settlement.changes[0]!.assignmentID
      const exactBefore = yield* db.transaction((tx) =>
        Assignment.readExactRevision(tx, assignmentID, settlement.changes[0]!.committedRevision.revisionID),
      )
      const before = yield* db.transaction((tx) => Assignment.readCurrent(tx, assignmentID, time + 20))
      expect(before).toMatchObject({
        revision: {
          effectiveSourceBasisAtCommit: {
            type: "artifact_revision",
            artifactID: artifact.id,
            revisionID,
            selector: { locator: "page:1" },
          },
        },
        sourceStatusAtCut: {
          sourceOwner: "artifact",
          ownerRecordedState: {
            activeSource: { availability: "available" },
            exactRevision: { state: "resolvable", id: revisionID },
          },
          exactOwnerDependency: {
            owner: "artifact",
            artifactID: artifact.id,
            revisionID,
            attribution,
            activeSource: { availability: "available" },
            exactRevision: { state: "resolvable", id: revisionID },
          },
        },
      })

      const directionText = "Stop surfacing this locally; that does not change the external source."
      const currentBeforeDirection = yield* currentAssignment(db, assignmentID, time + 20)
      const direction = yield* seedAgentInvocation(
        db,
        "artifact_source_direction_rebind",
        {
          cause: { type: "interpreted_learner_direction", excerpt: learnerReport(directionText).excerpt },
          intents: [
            {
              type: "dismiss",
              assignmentID,
              expectedHead: expectedHead(currentBeforeDirection),
              sourceAction: { type: "rebind_current_source_to_cause" },
              relationAction: { type: "preserve" },
              rationale: "Apply the learner's local-use direction without claiming an external source change.",
            },
          ],
        },
        directionText,
        time + 21,
      )
      expect(yield* applyInvocation(db, direction, time + 23)).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "validation_error" },
      })
      expect((yield* currentAssignment(db, assignmentID, time + 24)).current).toMatchObject({
        version: 1,
        disposition: "open",
        effectiveSourceBasisAtCommit: { type: "artifact_revision", revisionID },
      })

      const sameLocatorWithExcerpt = {
        ...command,
        cause: {
          ...command.cause,
          source: {
            ...command.cause.source,
            selector: {
              locator: "page:1",
              excerpt: {
                text: artifactText,
                startByte: 0,
                endByte: new TextEncoder().encode(artifactText).byteLength,
              },
            },
          },
        },
      }
      const conflictingExcerpt = yield* seedAgentInvocation(
        db,
        "artifact_source_same_locator_changed_excerpt",
        sameLocatorWithExcerpt,
        "The same exact source locator cannot acquire a different settled payload.",
        time + 25,
      )
      expect(yield* applyInvocation(db, conflictingExcerpt, time + 27)).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "semantic_conflict" },
      })
      expect(yield* db.get(sql`SELECT count(*) AS count FROM assignment_effect`)).toEqual({ count: 1 })
      expect(yield* db.get(sql`SELECT count(*) AS count FROM assignment_revision`)).toEqual({ count: 1 })

      const missing = yield* db.transaction((tx) =>
        Effect.gen(function* () {
          const result = yield* artifacts.observeInTransaction(tx, {
            expected: Artifact.expectedSource(artifact),
            observation: { result: "missing", observer, timeObserved: time + 30 },
            time: time + 30,
          })
          yield* LearningFrontier.advance(tx, { time: time + 30 })
          return result
        }),
      )
      const historicalAfterDrift = yield* db.transaction((tx) => Assignment.readCurrent(tx, assignmentID, time + 20))
      const after = yield* db.transaction((tx) => Assignment.readCurrent(tx, assignmentID, time + 31))
      const exactAfter = yield* db.transaction((tx) =>
        Assignment.readExactRevision(tx, assignmentID, settlement.changes[0]!.committedRevision.revisionID),
      )
      expect(after).toMatchObject({
        revision: { disposition: "open" },
        sourceStatusAtCut: {
          sourceOwner: "artifact",
          ownerRecordedState: {
            activeSource: { availability: "missing" },
            exactRevision: { state: "resolvable", id: revisionID },
          },
        },
      })
      expect(historicalAfterDrift).toMatchObject({
        sourceStatusAtCut: {
          sourceOwner: "artifact",
          ownerRecordedState: {
            activeSource: { state: "changed_after_as_of", latestTimeUpdated: time + 30 },
            exactRevision: { state: "resolvable", id: revisionID },
          },
          exactOwnerDependency: {
            activeSource: { state: "changed_after_as_of", latestTimeUpdated: time + 30 },
            exactRevision: { state: "resolvable", id: revisionID },
          },
          asOf: time + 20,
        },
      })
      expect(exactAfter).toEqual(exactBefore)

      const duplicate = yield* seedAgentInvocation(
        db,
        "artifact_source_duplicate",
        command,
        "The active source is now missing, but replay must use the exact committed semantic address.",
        time + 40,
      )
      expect(yield* applyInvocation(db, duplicate, time + 42)).toMatchObject({
        type: "settled",
        settlement: { outcome: "already_applied", effectID: settlement.effectID },
      })

      const restored = yield* db.transaction((tx) =>
        Effect.gen(function* () {
          const result = yield* artifacts.observeInTransaction(tx, {
            expected: Artifact.expectedSource(missing.artifact),
            observation: present(time + 50),
            time: time + 50,
          })
          yield* LearningFrontier.advance(tx, { time: time + 50 })
          return result
        }),
      )
      const driftingCommand = {
        ...command,
        cause: {
          ...command.cause,
          source: { ...command.cause.source, selector: { locator: "page:2" } },
        },
      }
      const drifting = yield* seedAgentInvocation(
        db,
        "artifact_source_drift_before_settle",
        driftingCommand,
        "Prepare this second exact source locator, then observe source drift before commit.",
        time + 60,
      )
      const reserved = yield* db.transaction((tx) =>
        Assignment.reserve(tx, { ...drifting, settlement: { time: time + 62, order: 1 } }),
      )
      expect(reserved.type).toBe("admitted")
      yield* db.transaction((tx) =>
        Assignment.settlePolicy(tx, {
          partID: drifting.envelope.partID,
          outcome: "policy_allow",
          policyBasis: { source: "assignment-test", rule: "allow" },
          time: time + 63,
          order: 2,
        }),
      )
      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          yield* artifacts.observeInTransaction(tx, {
            expected: Artifact.expectedSource(restored.artifact),
            observation: { result: "missing", observer, timeObserved: time + 64 },
            time: time + 64,
          })
          yield* LearningFrontier.advance(tx, { time: time + 64 })
        }),
      )
      expect(
        yield* db.transaction((tx) =>
          Assignment.settle(tx, {
            partID: drifting.envelope.partID,
            settlement: { time: time + 65, order: 3 },
          }),
        ),
      ).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "source_unavailable" },
      })
      expect(yield* db.get(sql`SELECT count(*) AS count FROM assignment_effect`)).toEqual({ count: 1 })
      expect(yield* db.get(sql`SELECT count(*) AS count FROM assignment_revision`)).toEqual({ count: 1 })
    }),
  )

  it.effect("resolves source-relative civil time only from the effective Assignment source", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const artifacts = yield* Artifact.Service
      const time = Date.parse("2037-04-11T09:00:00Z")
      const source = yield* admitArtifactRevision(artifacts, "source-zone", time)
      const artifactCause = {
        type: "interpreted_source_observation" as const,
        source: {
          type: "artifact_revision" as const,
          artifactID: source.artifact.id,
          revisionID: source.revisionID,
          attribution: source.attribution,
          selector: { locator: "page:zone" },
        },
      }
      const sourceRelativeSnapshot = {
        ...snapshot("Analyze the source-zone boundary", "Keep temporal provenance exact"),
        dueBasis: {
          type: "instant" as const,
          sourceExpression: "due at five in the source zone",
          localDateTime: "2037-05-01T17:00:00",
          comparator: "inclusive" as const,
          timeZone: { type: "source" as const },
        },
      }
      const unavailable = yield* seedAgentInvocation(
        db,
        "artifact_source_zone_unavailable",
        { cause: artifactCause, intents: [{ type: "create", createOrdinal: 0, snapshot: sourceRelativeSnapshot }] },
        "Use the Artifact's own deadline zone.",
        time + 10,
        "Asia/Shanghai",
      )
      expect(yield* applyInvocation(db, unavailable, time + 12)).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "source_unavailable" },
      })

      const explicit = yield* seedAgentInvocation(
        db,
        "artifact_source_zone_explicit",
        {
          cause: artifactCause,
          intents: [
            {
              type: "create",
              createOrdinal: 0,
              snapshot: {
                ...sourceRelativeSnapshot,
                dueBasis: { ...sourceRelativeSnapshot.dueBasis, timeZone: { type: "fixed_offset", offsetMinutes: 480 } },
              },
            },
          ],
        },
        "Use the Artifact deadline with an explicit trusted offset.",
        time + 20,
        "America/New_York",
      )
      const artifactApplied = yield* applyInvocation(db, explicit, time + 22)
      if (artifactApplied.type !== "settled" || artifactApplied.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected explicit Artifact time-zone admission")
      }
      const artifactID = artifactApplied.settlement.changes[0]!.assignmentID
      const artifactHead = yield* currentAssignment(db, artifactID, time + 30)
      expect(artifactHead.current.snapshot.dueBasis).toMatchObject({
        type: "instant",
        normalizedInstant: Date.parse("2037-05-01T09:00:00Z"),
        utcOffsetMinutes: 480,
        resolvedZone: { type: "fixed_offset", offsetMinutes: 480 },
      })
      const artifactCorrection = yield* seedAgentInvocation(
        db,
        "artifact_source_zone_agent_correction",
        {
          cause: {
            type: "agent_correction",
            rationale: "Try to correct the deadline without inventing a zone absent from the Artifact source.",
            ownerReads: [Assignment.ownerReadReference(artifactHead)],
          },
          intents: [
            {
              type: "revise",
              assignmentID: artifactID,
              expectedHead: expectedHead(artifactHead),
              snapshot: sourceRelativeSnapshot,
              sourceAction: { type: "preserve_predecessor_source" },
              relationAction: { type: "preserve" },
              rationale: "The issuing Turn zone cannot become Artifact provenance.",
            },
          ],
        },
        "Correct the exact current Assignment.",
        time + 40,
        "Asia/Shanghai",
      )
      expect(yield* applyInvocation(db, artifactCorrection, time + 42)).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "source_unavailable" },
      })
      expect((yield* currentAssignment(db, artifactID, time + 50)).current.version).toBe(1)

      const learnerText = "The source-relative deadline is May 1 at five in my current course zone."
      const learner = yield* seedAgentInvocation(
        db,
        "learner_source_zone_create",
        createCommand(learnerText, sourceRelativeSnapshot),
        learnerText,
        time + 60,
        "Asia/Shanghai",
      )
      const learnerApplied = yield* applyInvocation(db, learner, time + 62)
      if (learnerApplied.type !== "settled" || learnerApplied.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected learner source-zone Assignment")
      }
      const learnerID = learnerApplied.settlement.changes[0]!.assignmentID
      const learnerHead = yield* currentAssignment(db, learnerID, time + 70)
      expect(learnerHead.current.snapshot.dueBasis).toMatchObject({
        type: "instant",
        normalizedInstant: Date.parse("2037-05-01T09:00:00Z"),
        utcOffsetMinutes: 480,
        resolvedZone: { type: "iana", name: "Asia/Shanghai" },
      })

      const preserved = yield* seedAgentInvocation(
        db,
        "learner_source_zone_preserved",
        {
          cause: {
            type: "agent_correction",
            rationale: "Correct wording while retaining the exact learner source temporal context.",
            ownerReads: [Assignment.ownerReadReference(learnerHead)],
          },
          intents: [
            {
              type: "revise",
              assignmentID: learnerID,
              expectedHead: expectedHead(learnerHead),
              snapshot: {
                ...sourceRelativeSnapshot,
                obligationSummary: "Analyze the corrected source-zone boundary",
              },
              sourceAction: { type: "preserve_predecessor_source" },
              relationAction: { type: "preserve" },
              rationale: "The later issuing Turn zone is not the original Assignment source zone.",
            },
          ],
        },
        "Correct the exact current Assignment.",
        time + 80,
        "America/New_York",
      )
      expect(yield* applyInvocation(db, preserved, time + 82)).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied" },
      })
      expect((yield* currentAssignment(db, learnerID, time + 90)).current.snapshot.dueBasis).toMatchObject({
        normalizedInstant: Date.parse("2037-05-01T09:00:00Z"),
        utcOffsetMinutes: 480,
        resolvedZone: { type: "iana", name: "Asia/Shanghai" },
      })
    }),
  )

  it.effect("carries withdrawn Course scope through correction while revalidating newly introduced Course IDs", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const time = Date.parse("2037-04-12T09:00:00Z")
      const course = yield* courses.createCourse({ title: "Operating Systems" })
      const courseSnapshot = {
        ...snapshot("Analyze the Course-scoped obligation", "Connect the work to Operating Systems"),
        scope: { type: "courses" as const, courseIDs: [course.id] },
      }
      const source = "The Operating Systems problem set is a substantial existing obligation."
      const created = yield* seedAgentInvocation(
        db,
        "withdrawn_scope_create",
        createCommand(source, courseSnapshot),
        source,
        time,
      )
      const applied = yield* applyInvocation(db, created, time + 2)
      if (applied.type !== "settled" || applied.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected Course-scoped Assignment creation")
      }
      const assignmentID = applied.settlement.changes[0]!.assignmentID
      const open = yield* currentAssignment(db, assignmentID, time + 10)
      yield* courses.withdrawCourse({
        courseID: course.id,
        expectedCourseVersion: 0,
        expectedSelectionVersion: 0,
      })
      const correctionSource = "Correction: keep the same Course scope but fix the obligation wording."
      const correction = yield* seedAgentInvocation(
        db,
        "withdrawn_scope_correction",
        {
          cause: learnerReport(correctionSource),
          intents: [
            {
              type: "revise",
              assignmentID,
              expectedHead: expectedHead(open),
              snapshot: { ...courseSnapshot, obligationSummary: "Analyze the corrected Course-scoped obligation" },
              sourceAction: { type: "rebind_current_source_to_cause" },
              relationAction: { type: "preserve" },
              rationale: "Correct meaning without letting Course currentness control Assignment revision authority.",
            },
          ],
        },
        correctionSource,
        time + 20,
      )
      expect(yield* applyInvocation(db, correction, time + 22)).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied" },
      })
      const corrected = yield* currentAssignment(db, assignmentID, time + 30)
      expect(corrected.current).toMatchObject({ version: 2, snapshot: { scope: courseSnapshot.scope } })
      expect(
        (yield* db.transaction((tx) => Assignment.readCurrent(tx, assignmentID, time + 30)))
          ?.scopeCurrentRelationsAtCut,
      ).toEqual([{ courseID: course.id, status: "course_withdrawn", version: 1 }])

      const carriedCourse = yield* courses.createCourse({ title: "Databases" })
      const carriedSnapshot = {
        ...snapshot("Analyze the database obligation", "Connect the work to Databases"),
        scope: { type: "courses" as const, courseIDs: [carriedCourse.id] },
      }
      const carriedCreated = yield* seedAgentInvocation(
        db,
        "withdrawn_scope_race_create",
        createCommand("The database brief is an existing obligation.", carriedSnapshot),
        "The database brief is an existing obligation.",
        time + 40,
      )
      const carriedApplied = yield* applyInvocation(db, carriedCreated, time + 42)
      if (carriedApplied.type !== "settled" || carriedApplied.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected carried-scope Assignment creation")
      }
      const carriedID = carriedApplied.settlement.changes[0]!.assignmentID
      const carriedHead = yield* currentAssignment(db, carriedID, time + 50)
      const carriedCorrection = yield* seedAgentInvocation(
        db,
        "withdrawn_scope_race_correction",
        {
          cause: learnerReport("Correct the wording while retaining the exact Course scope."),
          intents: [
            {
              type: "revise",
              assignmentID: carriedID,
              expectedHead: expectedHead(carriedHead),
              snapshot: { ...carriedSnapshot, obligationSummary: "Analyze the corrected database obligation" },
              sourceAction: { type: "preserve_predecessor_source" },
              relationAction: { type: "preserve" },
              rationale: "The unchanged exact scope remains carryable after admission.",
            },
          ],
        },
        "Correct the wording while retaining the exact Course scope.",
        time + 60,
      )
      expect(
        yield* db.transaction((tx) =>
          Assignment.reserve(tx, { ...carriedCorrection, settlement: { time: time + 62, order: 1 } }),
        ),
      ).toMatchObject({ type: "admitted" })
      yield* db.transaction((tx) =>
        Assignment.settlePolicy(tx, {
          partID: carriedCorrection.envelope.partID,
          outcome: "policy_allow",
          policyBasis: { source: "assignment-test", rule: "allow" },
          time: time + 63,
          order: 2,
        }),
      )
      yield* courses.withdrawCourse({
        courseID: carriedCourse.id,
        expectedCourseVersion: 0,
        expectedSelectionVersion: 0,
      })
      expect(
        yield* db.transaction((tx) =>
          Assignment.settle(tx, {
            partID: carriedCorrection.envelope.partID,
            settlement: { time: time + 64, order: 3 },
          }),
        ),
      ).toMatchObject({ type: "settled", settlement: { outcome: "applied" } })

      const baseCourse = yield* courses.createCourse({ title: "Algorithms" })
      const addedCourse = yield* courses.createCourse({ title: "Discrete Mathematics" })
      const baseSnapshot = {
        ...snapshot("Analyze the algorithm obligation", "Connect it to Algorithms"),
        scope: { type: "courses" as const, courseIDs: [baseCourse.id] },
      }
      const baseCreated = yield* seedAgentInvocation(
        db,
        "new_scope_race_create",
        createCommand("The algorithm brief is an existing obligation.", baseSnapshot),
        "The algorithm brief is an existing obligation.",
        time + 70,
      )
      const baseApplied = yield* applyInvocation(db, baseCreated, time + 72)
      if (baseApplied.type !== "settled" || baseApplied.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected base Course-scope Assignment")
      }
      const baseID = baseApplied.settlement.changes[0]!.assignmentID
      const baseHead = yield* currentAssignment(db, baseID, time + 80)
      const widening = yield* seedAgentInvocation(
        db,
        "new_scope_race_correction",
        {
          cause: learnerReport("Correction: the obligation also belongs to Discrete Mathematics."),
          intents: [
            {
              type: "revise",
              assignmentID: baseID,
              expectedHead: expectedHead(baseHead),
              snapshot: {
                ...baseSnapshot,
                scope: { type: "courses", courseIDs: [baseCourse.id, addedCourse.id] },
              },
              sourceAction: { type: "rebind_current_source_to_cause" },
              relationAction: { type: "preserve" },
              rationale: "A newly introduced Course must remain available through final settlement.",
            },
          ],
        },
        "Correction: the obligation also belongs to Discrete Mathematics.",
        time + 90,
      )
      expect(
        yield* db.transaction((tx) =>
          Assignment.reserve(tx, { ...widening, settlement: { time: time + 92, order: 1 } }),
        ),
      ).toMatchObject({ type: "admitted" })
      yield* db.transaction((tx) =>
        Assignment.settlePolicy(tx, {
          partID: widening.envelope.partID,
          outcome: "policy_allow",
          policyBasis: { source: "assignment-test", rule: "allow" },
          time: time + 93,
          order: 2,
        }),
      )
      yield* courses.withdrawCourse({
        courseID: addedCourse.id,
        expectedCourseVersion: 0,
        expectedSelectionVersion: 0,
      })
      expect(
        yield* db.transaction((tx) =>
          Assignment.settle(tx, { partID: widening.envelope.partID, settlement: { time: time + 94, order: 3 } }),
        ),
      ).toMatchObject({ type: "settled", settlement: { outcome: "error", code: "source_unavailable" } })
      expect((yield* currentAssignment(db, baseID, time + 100)).current.version).toBe(1)
    }),
  )

  windowsTest(
    "projects Representation availability, current-use eligibility, and continued-use grants without rewriting Assignment truth",
    async () => {
      await using temporary = await tmpdir()
      const materials = path.join(temporary.path, "materials")
      await mkdir(materials)
      await writeFile(path.join(materials, "source.pdf"), "source revision one")
      const layer = LayerNode.compile(
        LayerNode.group([Representation.node, Artifact.node, ContentRoot.node, Database.node]),
        [[Database.node, Database.layerFromPath(path.join(temporary.path, "learner-home.db")).pipe(Layer.orDie)]],
      )

      await Effect.runPromise(
        Effect.gen(function* () {
          const roots = yield* ContentRoot.Service
          const artifacts = yield* Artifact.Service
          const representations = yield* Representation.Service
          const db = (yield* Database.Service).db
          yield* Effect.addFinalizer(() => Effect.sync(() => setSystemTime()))
          const proposal = yield* roots.propose(materials)
          const root = yield* roots.approve({
            proposal,
            approval: ContentRoot.LearnerApproval.contentRoot(proposal, "Gate 20A Representation source fixture"),
          })
          const read = yield* roots.read({
            contentRootID: root.id,
            relativePath: "source.pdf",
            maxBytes: 1024 * 1024,
          })
          if (read.observation.result !== "present") return yield* Effect.die("Expected Representation source bytes")
          const observer = Artifact.Observer.trusted(
            `content-root:${read.authorization.contentRootID}:${read.authorization.bindingID}:${read.authorization.grantEpisodeID}`,
            read.authorization.grantVersion,
          )
          const artifact = yield* artifacts.admit({
            location: Artifact.CanonicalLocation.trusted(read.observation.descriptor.canonicalPath),
            observation: {
              result: "present",
              fingerprint: read.observation.fingerprint,
              mediaType: read.observation.mediaType,
              observer,
              timeObserved: read.observation.timeObserved,
            },
            authority: Artifact.Admission.learnerInstruction("Gate 20A Representation source admission", 1),
          })
          const sourceRevisionID = artifact.source.currentRevisionID
          const attribution = artifact.source.revisionAttribution
          const mediaType = artifact.source.descriptor?.mediaType
          if (!sourceRevisionID || !attribution || !mediaType) {
            return yield* Effect.die("Expected an admitted Artifact source Revision")
          }
          const sourceRevision = yield* artifacts.getRevision(artifact.id, sourceRevisionID, attribution)
          const encoded = PDFTextProfile.encode([
            { page: 1, items: [{ text: "Readable semaphore proof", lineBreakAfter: true }] },
          ])
          if (!encoded.ok) return yield* Effect.die(encoded.error)
          const representation = yield* representations.accept({
            effectiveArtifactID: artifact.id,
            sourceRevisionID: sourceRevision.id,
            attribution: sourceRevision.attribution,
            recipe: Representation.localPDFRecipe,
            authority: Representation.ConversionAuthority.deterministic(
              "gate20a-assignment-representation-source",
              "learner requested readable access to the exact source",
            ),
            candidateRevisionID: Representation.createRevisionID(),
            sourceProof: {
              ordinary: {
                effectiveArtifactID: artifact.id,
                dispositionVersion: artifact.dispositionVersion,
                currentRevisionID: sourceRevision.id,
                attribution: sourceRevision.attribution,
                lineageVersion: artifact.lineageVersion,
                fingerprint: sourceRevision.fingerprint,
                mediaType,
              },
              sourceVersion: artifact.source.sourceVersion,
              authorization: read.authorization,
              relativePath: "source.pdf",
              descriptor: read.observation.descriptor,
              timeObserved: read.observation.timeObserved,
            },
            candidate: {
              kind: "local_pdf",
              runIdentity: "gate20a-assignment-representation-source-run",
              provenance: Representation.localPDFRecipe,
              input: sourceRevision.fingerprint,
              bytes: encoded.value.bytes,
              diagnostics: [],
              usage: {
                kind: "local_pdf",
                pageCount: 1,
                textItemCount: 1,
                operatorCount: 0,
                imagePaintOperations: 0,
                signalPageCount: 0,
                profileByteLength: encoded.value.bytes.byteLength,
              },
            },
            timeAccepted: read.observation.timeObserved + 1,
          })
          const admission = yield* db.transaction((tx) =>
            Representation.prepareCurrentUseProof(tx, representation.id),
          )
          const time = Date.parse("2037-04-10T09:00:00Z")
          const earlier = yield* createOne(db, "representation_cursor_first", time - 100)
          const command = {
            cause: {
              type: "interpreted_source_observation" as const,
              source: {
                type: "representation_revision" as const,
                representationRevisionID: representation.id,
                selector: { locator: "pdf-page:1" },
              },
            },
            intents: [
              {
                type: "create" as const,
                createOrdinal: 0,
                snapshot: snapshot(
                  "Analyze the semaphore proof",
                  "Use the exact readable source in explanation and guided work",
                ),
              },
            ],
          } satisfies Assignment.ChangeSetCommand
          const invocation = yield* seedAgentInvocation(
            db,
            "representation_source",
            command,
            "Use this exact readable source for the learning obligation.",
            time,
          )
          const applied = yield* applyInvocation(db, invocation, time + 2)
          if (
            applied.type !== "settled" ||
            applied.settlement.outcome !== "applied" ||
            !("changes" in applied.settlement)
          ) {
            return yield* Effect.die("Expected a Representation-backed Assignment")
          }
          const settlement = applied.settlement as Assignment.AppliedSettlement
          const assignmentID = settlement.changes[0]!.assignmentID
          const revisionID = settlement.changes[0]!.committedRevision.revisionID
          const before = yield* db.transaction((tx) => Assignment.readCurrent(tx, assignmentID, time + 10))
          const exactBefore = yield* db.transaction((tx) => Assignment.readExactRevision(tx, assignmentID, revisionID))
          if (!before || !exactBefore || exactBefore.creationSourceBasis.type !== "representation_revision") {
            return yield* Effect.die("Expected the exact Representation-backed Assignment revision")
          }

          expect(exactBefore.creationSourceBasis).toMatchObject({
            type: "representation_revision",
            representationRevisionID: representation.id,
            selector: { locator: "pdf-page:1" },
            admission: admission.receipt,
          })
          expect(exactBefore.effectiveSourceBasisAtCommit).toEqual(exactBefore.creationSourceBasis)
          expect(exactBefore.sourceAdmissionBasisAtCommit).toMatchObject({
            type: "representation_revision",
            basis: { representationRevisionID: representation.id, admission: admission.receipt },
          })
          expect(exactBefore.creationSourceBasis.selector.locatorDigest).toMatch(/^[0-9a-f]{64}$/)
          expect(before.sourceStatusAtCut).toMatchObject({
            sourceOwner: "representation",
            exactSourceLocator: { representationRevisionID: representation.id },
            ownerRecordedState: {
              representation: { availability: { version: 1, disposition: "available" } },
              currentUse: { status: "eligible" },
              currentArtifact: { currentRevisionID: sourceRevision.id },
            },
            exactOwnerDependency: {
              owner: "representation",
              representationRevisionID: representation.id,
              availability: { version: 1, disposition: "available" },
              currentUse: { status: "eligible" },
              currentArtifact: { currentRevisionID: sourceRevision.id },
              continuedUseGrant: null,
            },
            asOf: time + 10,
          })
          const firstPage = yield* db.transaction((tx) =>
            Assignment.read(tx, { type: "discover", disposition: "open" }, { asOf: time + 10, limit: 1 }),
          )
          expect(firstPage.items[0]).toMatchObject({
            assignmentRevisionRef: { assignmentID: earlier.assignmentID },
          })
          if (!firstPage.nextCursor) return yield* Effect.die("Expected a cursor before the Representation candidate")

          const secondBytes = new TextEncoder().encode("source revision two")
          const driftTime = time + 20
          const changed = yield* db.transaction((tx) =>
            Effect.gen(function* () {
              const result = yield* artifacts.observeInTransaction(tx, {
                expected: Artifact.expectedSource(artifact),
                observation: {
                  result: "present",
                  fingerprint: {
                    algorithm: "sha256",
                    digest: new Bun.CryptoHasher("sha256").update(secondBytes).digest("hex"),
                    byteLength: secondBytes.byteLength,
                  },
                  mediaType: "application/pdf",
                  observer,
                  timeObserved: driftTime,
                },
                time: driftTime,
              })
              yield* LearningFrontier.advance(tx, { time: driftTime })
              return result
            }),
          )
          const secondRevisionID = changed.artifact.source.currentRevisionID
          const secondAttribution = changed.artifact.source.revisionAttribution
          if (!secondRevisionID || !secondAttribution) return yield* Effect.die("Expected Artifact source Revision two")
          const afterDrift = yield* db.transaction((tx) => Assignment.readCurrent(tx, assignmentID, driftTime + 1))
          if (!afterDrift) return yield* Effect.die("Expected the Assignment after Artifact drift")
          expect(afterDrift.sourceStatusAtCut).toMatchObject({
            ownerRecordedState: {
              representation: { availability: { version: 1, disposition: "available" } },
              currentUse: { status: "stale", cause: "grant_required" },
              currentArtifact: { currentRevisionID: secondRevisionID },
            },
            exactOwnerDependency: {
              availability: { version: 1, disposition: "available" },
              currentUse: { status: "stale", cause: "grant_required" },
              currentArtifact: { currentRevisionID: secondRevisionID },
              continuedUseGrant: null,
            },
          })

          const grantTime = time + 30
          const grant = yield* representations.authorizeContinuedUse({
            representationRevisionID: representation.id,
            expectedArtifact: {
              effectiveArtifactID: changed.artifact.id,
              dispositionVersion: changed.artifact.dispositionVersion,
              currentRevisionID: secondRevisionID,
              attribution: secondAttribution,
              lineageVersion: changed.artifact.lineageVersion,
            },
            authority: Representation.LearnerAuthority.deterministic(
              "gate20a-assignment-representation-continued-use",
              "learner retained the exact old readable Representation",
            ),
            timeAuthorized: grantTime,
          })
          const afterGrant = yield* db.transaction((tx) => Assignment.readCurrent(tx, assignmentID, grantTime + 1))
          if (!afterGrant) return yield* Effect.die("Expected the Assignment after continued-use grant")
          expect(afterGrant.sourceStatusAtCut).toMatchObject({
            ownerRecordedState: {
              representation: { availability: { version: 1, disposition: "available" } },
              currentUse: { status: "eligible" },
              currentArtifact: { currentRevisionID: secondRevisionID },
              activeContinuedUseGrant: {
                id: grant.id,
                version: grant.version,
                currentSourceRevisionID: secondRevisionID,
              },
            },
            exactOwnerDependency: {
              availability: { version: 1, disposition: "available" },
              currentUse: { status: "eligible" },
              currentArtifact: { currentRevisionID: secondRevisionID },
              continuedUseGrant: {
                id: grant.id,
                version: grant.version,
                disposition: "active",
                currentSourceRevisionID: secondRevisionID,
                currentLineageVersion: changed.artifact.lineageVersion,
              },
            },
          })
          const historicalAfterGrant = yield* Effect.flip(
            db.transaction((tx) => Assignment.readCurrent(tx, assignmentID, time + 10)),
          )
          expect(historicalAfterGrant).toMatchObject({ reason: "stale" })
          expect(JSON.stringify(historicalAfterGrant)).not.toContain(secondRevisionID)
          expect(JSON.stringify(historicalAfterGrant)).not.toContain(grant.id)
          const stalePage = yield* Effect.flip(
            db.transaction((tx) =>
              Assignment.read(
                tx,
                { type: "discover", disposition: "open" },
                { asOf: grantTime + 100, limit: 1, cursor: firstPage.nextCursor },
              ),
            ),
          )
          expect(stalePage).toMatchObject({ reason: "stale" })
          expect(JSON.stringify(stalePage)).not.toContain(secondRevisionID)
          expect(JSON.stringify(stalePage)).not.toContain(grant.id)
          const equalTimePage = yield* db.transaction((tx) =>
            Assignment.read(
              tx,
              { type: "discover", disposition: "open" },
              { asOf: grantTime + 10, limit: 1 },
            ),
          )
          if (!equalTimePage.nextCursor) {
            return yield* Effect.die("Expected a cursor before the equal-time missing-source transition")
          }
          const missingTime = grantTime + 10
          setSystemTime(new Date(missingTime))
          yield* artifacts.withdraw({
            artifactID: changed.artifact.id,
            expectedDispositionVersion: changed.artifact.dispositionVersion,
          })
          const historicalAfterMissing = yield* Effect.flip(
            db.transaction((tx) => Assignment.readCurrent(tx, assignmentID, time + 10)),
          )
          expect(historicalAfterMissing).toMatchObject({ reason: "stale" })
          expect(JSON.stringify(historicalAfterMissing)).not.toContain("artifact_ineligible")
          const staleMissingPage = yield* Effect.flip(
            db.transaction((tx) =>
              Assignment.read(
                tx,
                { type: "discover", disposition: "open" },
                { asOf: missingTime + 100, limit: 1, cursor: firstPage.nextCursor },
              ),
            ),
          )
          expect(staleMissingPage).toMatchObject({ reason: "stale" })
          expect(JSON.stringify(staleMissingPage)).not.toContain("artifact_ineligible")
          const equalTimeStale = yield* Effect.flip(
            db.transaction((tx) =>
              Assignment.read(
                tx,
                { type: "discover", disposition: "open" },
                { asOf: missingTime + 100, limit: 1, cursor: equalTimePage.nextCursor },
              ),
            ),
          )
          expect(equalTimeStale).toMatchObject({ reason: "stale" })
          const freshAfterMissing = yield* db.transaction((tx) =>
            Assignment.readCurrent(tx, assignmentID, missingTime + 1),
          )
          expect(freshAfterMissing).toMatchObject({
            sourceStatusAtCut: {
              ownerRecordedState: {
                representation: { availability: { version: 1, disposition: "available" } },
                currentUse: { status: "stale", cause: "artifact_ineligible" },
              },
              exactOwnerDependency: {
                currentUse: { status: "stale", cause: "artifact_ineligible" },
                currentArtifact: null,
              },
            },
          })
          const exactAfter = yield* db.transaction((tx) => Assignment.readExactRevision(tx, assignmentID, revisionID))
          if (!exactAfter) return yield* Effect.die("Expected the exact Assignment revision after source changes")
          expect(exactAfter).toEqual(exactBefore)
          expect(afterDrift.assignmentRevisionRef).toEqual(before.assignmentRevisionRef)
          expect(afterGrant.assignmentRevisionRef).toEqual(before.assignmentRevisionRef)
          expect(afterDrift.assignmentOwnerCut).toEqual(before.assignmentOwnerCut)
          expect(afterGrant.assignmentOwnerCut).toEqual(before.assignmentOwnerCut)
          expect(yield* db.get(sql`SELECT count(*) AS count FROM assignment_effect`)).toEqual({ count: 2 })
          expect(yield* db.get(sql`SELECT count(*) AS count FROM assignment_revision`)).toEqual({ count: 2 })
        }).pipe(Effect.provide(layer), Effect.scoped),
      )
    },
  )

  it.effect("deletes transcript state without deleting or blocking an applied Assignment", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-04-15T09:00:00Z")
      const created = yield* createOne(db, "session_delete", time)
      const before = yield* currentAssignment(db, created.assignmentID, time + 10)
      const exactBefore = yield* db.transaction((tx) =>
        Assignment.readExactRevision(tx, created.assignmentID, before.current.id),
      )

      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          yield* TurnLifecycle.settleTool(tx, {
            turnID: created.invocation.envelope.turnID,
            partID: created.invocation.envelope.partID,
            state: "completed",
            time: time + 20,
          })
          yield* TurnLifecycle.settle(tx, {
            turnID: created.invocation.envelope.turnID,
            outcome: "completed",
            reason: "normal",
            time: time + 21,
          })
          yield* TurnLifecycle.deleteSessionTree(tx, {
            rootSessionID: created.invocation.envelope.sessionID,
            sessionIDs: [created.invocation.envelope.sessionID],
            timeDeleted: time + 22,
          })
        }),
      )

      expect(
        yield* db.get<{ count: number }>(sql`
          SELECT count(*) AS count FROM session WHERE id = ${created.invocation.envelope.sessionID}
        `),
      ).toEqual({ count: 0 })
      expect(
        yield* db.get<{ count: number }>(sql`
          SELECT count(*) AS count FROM turn_model_operation
          WHERE assistant_message_id = ${created.invocation.envelope.assistantMessageID}
        `),
      ).toEqual({ count: 0 })
      expect(
        yield* db.get<{ invocations: number; receipts: number; tombstones: number }>(sql`
          SELECT
            (SELECT count(*) FROM learning_command_invocation
              WHERE part_id = ${created.invocation.envelope.partID}) AS invocations,
            (SELECT count(*) FROM learning_command_receipt
              WHERE invocation_part_id = ${created.invocation.envelope.partID}) AS receipts,
            (SELECT count(*) FROM learning_occurrence_tombstone
              WHERE occurrence_id = ${created.invocation.envelope.occurrenceID}) AS tombstones
        `),
      ).toEqual({ invocations: 1, receipts: 1, tombstones: 1 })

      const exactAfter = yield* db.transaction((tx) =>
        Assignment.readExactRevision(tx, created.assignmentID, before.current.id),
      )
      const currentAfter = yield* db.transaction((tx) =>
        Assignment.readCurrent(tx, created.assignmentID, time + 30),
      )
      expect(exactAfter).toEqual(exactBefore)
      expect(currentAfter).toMatchObject({
        revision: { disposition: "open" },
        sourceStatusAtCut: { ownerRecordedState: { state: "source_unavailable" } },
      })
      expect(yield* db.all(sql.raw("PRAGMA foreign_key_check"))).toEqual([])
    }),
  )

  it.effect("seals the exact Assignment revision set and makes supporting capability evidence immutable", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-04-20T09:00:00Z")
      const source = "The concurrency analysis remains an open obligation."
      const invocation = yield* seedAgentInvocation(
        db,
        "seal_closure",
        createCommand(source, snapshot("Analyze the concurrency proof", "Connect the invariant to the course")),
        source,
        time,
      )
      const reserved = yield* db.transaction((tx) =>
        Assignment.reserve(tx, { ...invocation, settlement: { time: time + 2, order: 1 } }),
      )
      if (reserved.type !== "admitted") return yield* Effect.die("Expected an admitted Assignment candidate")
      const requestID = PermissionV1.ID.ascending()
      yield* db.transaction((tx) =>
        Assignment.issueCapabilityPrompt(tx, {
          partID: invocation.envelope.partID,
          requestID,
          policyBasis: { source: "assignment-test", rule: "ask" },
          shownScope: { assignmentIDs: reserved.candidate.materialized.map((item) => item.assignmentID) },
          time: time + 3,
          order: 2,
        }),
      )
      yield* db.transaction((tx) =>
        Assignment.settlePrompt(tx, {
          partID: invocation.envelope.partID,
          requestID,
          outcome: "prompted_allow",
          reply: { requestID, reply: "allow" },
          time: time + 4,
          order: 3,
        }),
      )
      const applied = yield* db.transaction((tx) =>
        Assignment.settle(tx, { partID: invocation.envelope.partID, settlement: { time: time + 5, order: 4 } }),
      )
      if (applied.type !== "settled" || applied.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected a sealed Assignment effect")
      }
      const revision = yield* db
        .select()
        .from(AssignmentRevisionTable)
        .where(eq(AssignmentRevisionTable.effect_id, applied.settlement.effectID))
        .get()
      if (!revision) return yield* Effect.die("Expected the sealed Assignment revision")

      const injectedRevision = yield* Effect.exit(
        db
          .insert(AssignmentRevisionTable)
          .values({
            ...revision,
            id: Assignment.createRevisionID(),
            version: revision.version + 1,
            predecessor_revision_id: revision.id,
            operation_ordinal: revision.operation_ordinal + 2,
          })
          .run(),
      )
      expect(injectedRevision._tag).toBe("Failure")
      if (injectedRevision._tag === "Failure") {
        expect(Cause.pretty(injectedRevision.cause)).toContain("sealed effect cannot receive another revision")
      }

      yield* db.run(sql`
        INSERT INTO course (id, title, state_version, withdrawal_reason, time_created, time_updated)
        VALUES ('course_assignment_seal', 'Assignment seal fixture', 0, NULL, ${time}, ${time})
      `)
      const attacks = [
        {
          statement: sql`
            INSERT INTO assignment_revision_scope (revision_id, ordinal, course_id)
            VALUES (${revision.id}, 0, 'course_assignment_seal')
          `,
          message: "sealed revision cannot receive another scope row",
        },
        {
          statement: sql`
            UPDATE assignment_disposition SET time_disposed = time_disposed
            WHERE invocation_part_id = ${invocation.envelope.partID}
          `,
          message: "Assignment disposition evidence is immutable",
        },
        {
          statement: sql`
            DELETE FROM assignment_disposition WHERE invocation_part_id = ${invocation.envelope.partID}
          `,
          message: "Assignment disposition evidence cannot be deleted",
        },
        {
          statement: sql`
            UPDATE assignment_capability_issue SET issue_order = issue_order
            WHERE invocation_part_id = ${invocation.envelope.partID}
          `,
          message: "Assignment capability issue is immutable",
        },
        {
          statement: sql`
            DELETE FROM assignment_capability_issue WHERE invocation_part_id = ${invocation.envelope.partID}
          `,
          message: "Assignment capability issue cannot be deleted",
        },
        {
          statement: sql`
            UPDATE assignment_capability_settlement SET settlement_order = settlement_order
            WHERE invocation_part_id = ${invocation.envelope.partID}
          `,
          message: "Assignment capability settlement is immutable",
        },
        {
          statement: sql`
            DELETE FROM assignment_capability_settlement WHERE invocation_part_id = ${invocation.envelope.partID}
          `,
          message: "Assignment capability settlement cannot be deleted",
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

      const policyInvocation = yield* seedAgentInvocation(
        db,
        "seal_late_issue",
        createCommand("A second obligation.", snapshot("Analyze a second proof", "Use the same course model")),
        "A second obligation.",
        time + 100,
      )
      const policyApplied = yield* applyInvocation(db, policyInvocation, time + 102)
      expect(policyApplied).toMatchObject({ type: "settled", settlement: { outcome: "applied" } })
      const lateIssue = yield* Effect.exit(
        db.run(sql`
          INSERT INTO assignment_capability_issue (
            invocation_part_id, permission_request_id, agent_action_fingerprint,
            policy_basis, policy_fingerprint, shown_scope, shown_scope_fingerprint,
            time_issued, issue_order
          )
          SELECT invocation_part_id, 'permission_assignment_late', agent_action_fingerprint,
            '{}', ${"a".repeat(64)}, '{}', ${"b".repeat(64)}, ${time + 110}, 9
          FROM assignment_disposition
          WHERE invocation_part_id = ${policyInvocation.envelope.partID}
        `),
      )
      expect(lateIssue._tag).toBe("Failure")
      if (lateIssue._tag === "Failure") {
        expect(Cause.pretty(lateIssue.cause)).toContain("sealed invocation cannot receive a late capability issue")
      }
      expect(yield* db.all(sql.raw("PRAGMA foreign_key_check"))).toEqual([])
    }),
  )

  it.effect("retains one exact result per intent when a change set mixes changed and no-change revisions", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-04-25T09:00:00Z")
      const unchanged = yield* createOne(db, "mixed_unchanged", time)
      const changed = yield* createOne(db, "mixed_changed", time + 100)
      const unchangedHead = yield* currentAssignment(db, unchanged.assignmentID, time + 200)
      const changedHead = yield* currentAssignment(db, changed.assignmentID, time + 200)
      const source = "Keep the first obligation as written, and correct the second obligation's wording."
      const invocation = yield* seedAgentInvocation(
        db,
        "mixed_results",
        {
          cause: learnerReport(source),
          intents: [
            {
              type: "revise",
              assignmentID: unchanged.assignmentID,
              expectedHead: expectedHead(unchangedHead),
              sourceAction: { type: "preserve_predecessor_source" },
              relationAction: { type: "preserve" },
              rationale: "The first record already has the intended meaning.",
            },
            {
              type: "revise",
              assignmentID: changed.assignmentID,
              expectedHead: expectedHead(changedHead),
              snapshot: snapshot("Analyze the corrected concurrency proof", "Use the corrected course model"),
              sourceAction: { type: "preserve_predecessor_source" },
              relationAction: { type: "preserve" },
              rationale: "Correct the second record while preserving its exact source.",
            },
          ],
        },
        source,
        time + 300,
      )
      const result = yield* applyInvocation(db, invocation, time + 302)
      if (result.type !== "settled" || result.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected an applied mixed Assignment change set")
      }

      expect(result.settlement.changes).toHaveLength(1)
      expect(result.settlement.changes[0]).toMatchObject({
        ordinal: 1,
        assignmentID: changed.assignmentID,
        committedRevision: { version: 2 },
      })
      expect(result.settlement.intentResults).toEqual([
        {
          outcome: "no_change",
          ordinal: 0,
          operation: "revise",
          assignmentID: unchanged.assignmentID,
          currentRevision: Assignment.revisionReference(unchangedHead.current),
        },
        {
          outcome: "changed",
          ordinal: 1,
          operation: "revise",
          assignmentID: changed.assignmentID,
          previousRevision: Assignment.revisionReference(changedHead.current),
          committedRevision: result.settlement.changes[0]!.committedRevision,
        },
      ])
      expect((yield* currentAssignment(db, unchanged.assignmentID, time + 400)).current.version).toBe(1)
      expect((yield* currentAssignment(db, changed.assignmentID, time + 400)).current.version).toBe(2)
      expect(
        yield* db.get<{ results: string }>(sql`
          SELECT results FROM assignment_effect WHERE id = ${result.settlement.effectID}
        `),
      ).toEqual({
        results: JSON.stringify([
          {
            outcome: "no_change",
            ordinal: 0,
            operation: "revise",
            assignmentID: unchanged.assignmentID,
            currentRevisionID: unchangedHead.current.id,
            currentRevisionVersion: 1,
          },
          {
            outcome: "changed",
            ordinal: 1,
            operation: "revise",
            assignmentID: changed.assignmentID,
            revisionID: result.settlement.changes[0]!.committedRevision.revisionID,
          },
        ]),
      })
      const replay = yield* db.transaction((tx) =>
        Assignment.reserve(tx, { ...invocation, settlement: { time: time + 500, order: 9 } }),
      )
      expect(replay).toEqual({ type: "replay", settlement: result.settlement })
    }),
  )

  it.effect("rejects an all-no-change settlement when its exact head became stale after admission", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-04-26T09:00:00Z")
      const created = yield* createOne(db, "no_change_stale_origin", time)
      const admittedHead = yield* currentAssignment(db, created.assignmentID, time + 10)
      const noChangeSource = "Keep the recorded semaphore obligation exactly as it is."
      const noChange = yield* seedAgentInvocation(
        db,
        "no_change_stale_candidate",
        {
          cause: learnerReport(noChangeSource),
          intents: [
            {
              type: "revise",
              assignmentID: created.assignmentID,
              expectedHead: expectedHead(admittedHead),
              sourceAction: { type: "preserve_predecessor_source" },
              relationAction: { type: "preserve" },
              rationale: "The exact current snapshot already matches the learner report.",
            },
          ],
        },
        noChangeSource,
        time + 20,
      )
      const reserved = yield* db.transaction((tx) =>
        Assignment.reserve(tx, { ...noChange, settlement: { time: time + 22, order: 1 } }),
      )
      if (reserved.type !== "admitted" || reserved.candidate.materialized[0]?.outcome !== "no_change") {
        return yield* Effect.die("Expected an admitted all-no-change Assignment candidate")
      }
      yield* db.transaction((tx) =>
        Assignment.settlePolicy(tx, {
          partID: noChange.envelope.partID,
          outcome: "policy_allow",
          policyBasis: { source: "assignment-test", rule: "allow" },
          time: time + 23,
          order: 2,
        }),
      )

      const correctionSource = "Correct the obligation to analyze the semaphore safety proof."
      const correction = yield* seedAgentInvocation(
        db,
        "no_change_stale_correction",
        {
          cause: learnerReport(correctionSource),
          intents: [
            {
              type: "revise",
              assignmentID: created.assignmentID,
              expectedHead: expectedHead(admittedHead),
              snapshot: snapshot("Analyze the semaphore safety proof", "Use the corrected Course model"),
              sourceAction: { type: "rebind_current_source_to_cause" },
              relationAction: { type: "preserve" },
              rationale: "The learner corrected the exact obligation wording.",
            },
          ],
        },
        correctionSource,
        time + 30,
      )
      const corrected = yield* applyInvocation(db, correction, time + 32)
      expect(corrected).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied", changes: [{ assignmentID: created.assignmentID }] },
      })

      const stale = yield* db.transaction((tx) =>
        Assignment.settle(tx, {
          partID: noChange.envelope.partID,
          settlement: { time: time + 40, order: 3 },
        }),
      )
      expect(stale).toMatchObject({ type: "settled", settlement: { outcome: "error", code: "stale" } })
      expect((yield* currentAssignment(db, created.assignmentID, time + 50)).current.version).toBe(2)
      expect(yield* db.select().from(AssignmentEffectTable).all()).toHaveLength(2)
    }),
  )

  it.effect("seals an all-no-change semantic address across later model operations without creating an Assignment effect", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-04-27T09:00:00Z")
      const created = yield* createOne(db, "no_change_address_origin", time)
      const head = yield* currentAssignment(db, created.assignmentID, time + 10)
      const source = "Keep this exact Assignment unchanged."
      const command = {
        cause: learnerReport(source),
        intents: [
          {
            type: "revise" as const,
            assignmentID: created.assignmentID,
            expectedHead: expectedHead(head),
            sourceAction: { type: "preserve_predecessor_source" as const },
            relationAction: { type: "preserve" as const },
            rationale: "The exact current Assignment already expresses the source truth.",
          },
        ],
      } satisfies Assignment.ChangeSetCommand
      const first = yield* seedAgentInvocation(db, "no_change_address_first", command, source, time + 20)
      const racing = yield* seedFollowupAgentInvocation(db, first, "no_change_address_racing", command, time + 21)
      const racingReservation = yield* db.transaction((tx) =>
        Assignment.reserve(tx, { ...racing, settlement: { time: time + 22, order: 1 } }),
      )
      expect(racingReservation.type).toBe("admitted")
      const before = yield* assignmentDomainCounts(db)
      const frontierBefore = yield* db.transaction((tx) => LearningFrontier.read(tx))
      const firstResult = yield* applyInvocation(db, first, time + 24)
      expect(firstResult).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "no_change",
          intentResults: [{ outcome: "no_change", assignmentID: created.assignmentID }],
        },
      })
      const seal = yield* db.select().from(AssignmentNoChangeSealTable).get()
      if (!seal) return yield* Effect.die("Expected one durable Assignment no-change seal")
      expect(yield* assignmentDomainCounts(db)).toEqual({
        ...before,
        receipts: before.receipts + 1,
      })
      expect(seal).toMatchObject({
        invocation_part_id: first.envelope.partID,
        invocation_status: "no_change",
        cause_type: "interpreted_learner_report",
      })
      expect(
        yield* db.transaction((tx) =>
          Assignment.reserve(tx, { ...first, settlement: { time: time + 30, order: 99 } }),
        ),
      ).toEqual({ type: "replay", settlement: firstResult.settlement })

      const raced = yield* db.transaction((tx) =>
        Assignment.recover(tx, {
          partID: racing.envelope.partID,
          settlement: { time: time + 35, order: 2 },
        }),
      )
      expect(raced).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "already_applied",
          existingOutcome: "no_change",
          receiptID: seal.receipt_id,
          changes: [],
        },
      })
      expect(
        yield* db
          .select({ disposition: AssignmentDispositionTable.disposition })
          .from(AssignmentDispositionTable)
          .where(eq(AssignmentDispositionTable.invocation_part_id, racing.envelope.partID))
          .get(),
      ).toEqual({ disposition: "candidate_v1" })
      if (raced.type !== "settled") return yield* Effect.die("Expected the no-change race to terminalize")
      expect(
        yield* db.transaction((tx) =>
          Assignment.recover(tx, {
            partID: racing.envelope.partID,
            settlement: { time: time + 36, order: 99 },
          }),
        ),
      ).toEqual({ type: "replay", settlement: raced.settlement })

      const duplicate = yield* seedFollowupAgentInvocation(db, first, "no_change_address_duplicate", command, time + 40)
      const duplicateResult = yield* applyInvocation(db, duplicate, time + 42)
      expect(duplicateResult).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "already_applied",
          existingOutcome: "no_change",
          receiptID: seal.receipt_id,
          changes: [],
          intentResults: [{ outcome: "no_change", assignmentID: created.assignmentID }],
        },
      })
      expect(duplicateResult).not.toHaveProperty("settlement.effectID")

      const conflict = yield* seedFollowupAgentInvocation(
        db,
        first,
        "no_change_address_conflict",
        {
          cause: learnerReport(source),
          intents: [
            {
              type: "complete",
              assignmentID: created.assignmentID,
              expectedHead: expectedHead(head),
              sourceAction: { type: "preserve_predecessor_source" },
              relationAction: { type: "preserve" },
              rationale: "This changed payload must not reuse the already-sealed semantic slot.",
            },
            {
              type: "create",
              createOrdinal: 0,
              snapshot: snapshot(
                "A later model operation must not create another obligation",
                "The original learner occurrence did not report this obligation",
              ),
            },
          ],
        },
        time + 50,
      )
      expect(yield* applyInvocation(db, conflict, time + 52)).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "semantic_conflict", detail: { existingOutcome: "no_change" } },
      })
      expect(yield* db.select().from(AssignmentNoChangeSealTable).all()).toHaveLength(1)
      expect(yield* db.select().from(AssignmentEffectTable).all()).toHaveLength(before.effects)
      expect(yield* db.select().from(AssignmentRevisionTable).all()).toHaveLength(before.revisions)
      expect(yield* assignmentDomainCounts(db)).toEqual({ ...before, receipts: before.receipts + 1 })
      expect(yield* db.transaction((tx) => LearningFrontier.read(tx))).toEqual(frontierBefore)
      expect(yield* db.all(sql.raw("PRAGMA foreign_key_check"))).toEqual([])
    }),
  )

  it.effect("rejects incomplete and duplicate-ordinal Assignment no-change seals", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-04-27T10:30:00Z")
      const left = yield* createOne(db, "no_change_trigger_left", time)
      const right = yield* createOne(db, "no_change_trigger_right", time + 10)
      const leftHead = yield* currentAssignment(db, left.assignmentID, time + 20)
      const rightHead = yield* currentAssignment(db, right.assignmentID, time + 20)

      const assertRejected = (input: {
        key: string
        command: Assignment.ChangeSetCommand
        results: readonly unknown[]
        admittedAt: number
      }) =>
        Effect.gen(function* () {
          const invocation = yield* seedAgentInvocation(
            db,
            input.key,
            input.command,
            "Keep the exact recorded Assignments unchanged.",
            input.admittedAt,
          )
          const reserved = yield* db.transaction((tx) =>
            Assignment.reserve(tx, { ...invocation, settlement: { time: input.admittedAt + 2, order: 1 } }),
          )
          if (reserved.type !== "admitted") return yield* Effect.die("Expected an admitted no-change candidate")
          yield* db.transaction((tx) =>
            Assignment.settlePolicy(tx, {
              partID: invocation.envelope.partID,
              outcome: "policy_allow",
              policyBasis: { source: "assignment-test", rule: "allow" },
              time: input.admittedAt + 3,
              order: 2,
            }),
          )
          const rejected = yield* Effect.exit(
            db.transaction((tx) =>
              Effect.gen(function* () {
                const receiptID = yield* insertPhysicalReceipt(tx, invocation.envelope, {
                  time: input.admittedAt + 4,
                  order: 3,
                })
                yield* tx
                  .insert(AssignmentNoChangeSealTable)
                  .values({
                    semantic_address_fingerprint: reserved.candidate.semanticAddressFingerprint,
                    cause_type: reserved.candidate.canonicalCommand.cause.type,
                    occurrence_id: invocation.envelope.occurrenceID,
                    source_revision_id: null,
                    source_locator_digest: null,
                    model_operation_id: invocation.envelope.assistantMessageID,
                    semantic_slot: "assignment_change_set",
                    command_fingerprint: reserved.candidate.commandFingerprint,
                    canonical_command: reserved.candidate.canonicalCommand,
                    invocation_part_id: invocation.envelope.partID,
                    invocation_status: "no_change",
                    receipt_id: receiptID,
                    results: input.results as never,
                    time_committed: input.admittedAt + 4,
                    commit_order: 3,
                  })
                  .run()
                  .pipe(Effect.orDie)
              }),
            ),
          )
          expect(rejected._tag).toBe("Failure")
          if (rejected._tag === "Failure") {
            expect(Cause.pretty(rejected.cause)).toContain("Assignment no-change seal is not atomically settled")
          }
        })

      yield* assertRejected({
        key: "no_change_trigger_missing_fields",
        command: {
          cause: learnerReport("Keep the exact recorded Assignments unchanged."),
          intents: [
            {
              type: "revise",
              assignmentID: left.assignmentID,
              expectedHead: expectedHead(leftHead),
              sourceAction: { type: "preserve_predecessor_source" },
              relationAction: { type: "preserve" },
              rationale: "No semantic value changes.",
            },
          ],
        },
        results: [{}],
        admittedAt: time + 30,
      })
      const duplicateOrdinal = {
        outcome: "no_change" as const,
        ordinal: 0,
        operation: "revise" as const,
        assignmentID: left.assignmentID,
        currentRevision: Assignment.revisionReference(leftHead.current),
      }
      yield* assertRejected({
        key: "no_change_trigger_duplicate_ordinal",
        command: {
          cause: learnerReport("Keep the exact recorded Assignments unchanged."),
          intents: [
            {
              type: "revise",
              assignmentID: left.assignmentID,
              expectedHead: expectedHead(leftHead),
              sourceAction: { type: "preserve_predecessor_source" },
              relationAction: { type: "preserve" },
              rationale: "The first Assignment remains unchanged.",
            },
            {
              type: "revise",
              assignmentID: right.assignmentID,
              expectedHead: expectedHead(rightHead),
              sourceAction: { type: "preserve_predecessor_source" },
              relationAction: { type: "preserve" },
              rationale: "The second Assignment remains unchanged.",
            },
          ],
        },
        results: [duplicateOrdinal, duplicateOrdinal],
        admittedAt: time + 40,
      })
      expect(yield* db.select().from(AssignmentNoChangeSealTable).all()).toHaveLength(0)
      expect(yield* db.all(sql.raw("PRAGMA foreign_key_check"))).toEqual([])
    }),
  )

  it.effect("terminalizes pre-admitted exact-source race losers and recovery against the winning effect", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const artifacts = yield* Artifact.Service
      const time = Date.parse("2037-04-27T12:00:00Z")
      const source = yield* admitArtifactRevision(artifacts, "source-race", time)
      const command = {
        cause: {
          type: "interpreted_source_observation" as const,
          source: {
            type: "artifact_revision" as const,
            artifactID: source.artifact.id,
            revisionID: source.revisionID,
            attribution: source.attribution,
            selector: { locator: "page:1" },
          },
        },
        intents: [
          {
            type: "create" as const,
            createOrdinal: 0,
            snapshot: snapshot("Analyze the exact source race", "Explain the source before guided work"),
          },
        ],
      } satisfies Assignment.ChangeSetCommand
      const winner = yield* seedAgentInvocation(db, "source_race_winner", command, "Use the exact source.", time + 10)
      const loser = yield* seedAgentInvocation(db, "source_race_loser", command, "Use the exact source.", time + 20)
      const recovery = yield* seedAgentInvocation(db, "source_race_recovery", command, "Use the exact source.", time + 30)
      const changed = yield* seedAgentInvocation(
        db,
        "source_race_changed",
        {
          ...command,
          intents: [
            {
              ...command.intents[0],
              snapshot: snapshot("Analyze a conflicting source interpretation", "This must not reuse the source slot"),
            },
          ],
        },
        "Use the exact source differently.",
        time + 40,
      )
      const candidates = [winner, loser, recovery, changed]
      yield* Effect.forEach(
        candidates,
        (invocation, index) =>
          db.transaction((tx) =>
            Assignment.reserve(tx, {
              ...invocation,
              settlement: { time: time + 50 + index, order: 1 },
            }),
          ).pipe(
            Effect.tap((reserved) => Effect.sync(() => expect(reserved.type).toBe("admitted"))),
          ),
        { discard: true },
      )
      yield* db.transaction((tx) =>
        Assignment.settlePolicy(tx, {
          partID: winner.envelope.partID,
          outcome: "policy_allow",
          policyBasis: { source: "assignment-test", rule: "allow" },
          time: time + 60,
          order: 2,
        }),
      )
      const won = yield* db.transaction((tx) =>
        Assignment.settle(tx, { partID: winner.envelope.partID, settlement: { time: time + 70, order: 3 } }),
      )
      if (won.type !== "settled" || won.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected the exact-source race winner to apply")
      }
      const lost = yield* db.transaction((tx) =>
        Assignment.settle(tx, { partID: loser.envelope.partID, settlement: { time: time + 71, order: 3 } }),
      )
      expect(lost).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "already_applied",
          existingOutcome: "applied",
          effectID: won.settlement.effectID,
          receiptID: won.settlement.receiptID,
        },
      })
      expect(
        yield* db
          .select()
          .from(AssignmentCapabilitySettlementTable)
          .where(eq(AssignmentCapabilitySettlementTable.invocation_part_id, loser.envelope.partID))
          .get(),
      ).toBeUndefined()
      const recovered = yield* db.transaction((tx) =>
        Assignment.recover(tx, {
          partID: recovery.envelope.partID,
          settlement: { time: time + 72, order: 3 },
        }),
      )
      expect(recovered).toMatchObject({
        type: "settled",
        settlement: { outcome: "already_applied", effectID: won.settlement.effectID },
      })
      if (recovered.type !== "settled") return yield* Effect.die("Expected recovery to terminalize the exact loser")
      expect(
        yield* db.transaction((tx) =>
          Assignment.recover(tx, {
            partID: recovery.envelope.partID,
            settlement: { time: time + 74, order: 99 },
          }),
        ),
      ).toEqual({ type: "replay", settlement: recovered.settlement })
      expect(
        yield* db.transaction((tx) =>
          Assignment.recover(tx, { partID: changed.envelope.partID, settlement: { time: time + 73, order: 3 } }),
        ),
      ).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "semantic_conflict", detail: { existingOutcome: "applied" } },
      })
      expect(
        yield* db
          .select({ disposition: AssignmentDispositionTable.disposition })
          .from(AssignmentDispositionTable)
          .where(eq(AssignmentDispositionTable.invocation_part_id, loser.envelope.partID))
          .get(),
      ).toEqual({ disposition: "candidate_v1" })
      expect(yield* db.select().from(AssignmentEffectTable).all()).toHaveLength(1)
      expect(yield* db.select().from(AssignmentRevisionTable).all()).toHaveLength(1)
      expect(
        yield* db.transaction((tx) =>
          Assignment.reserve(tx, { ...loser, settlement: { time: time + 80, order: 99 } }),
        ),
      ).toEqual({ type: "replay", settlement: lost.settlement })
      expect(yield* db.all(sql.raw("PRAGMA foreign_key_check"))).toEqual([])
    }),
  )

  it.effect("resumes discovery across unrelated frontier changes and rejects a changed upcoming source dependency", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-04-28T09:00:00Z")
      const created = yield* Effect.forEach([0, 1, 2], (index) =>
        createOne(db, `cursor_${index}`, time + index * 100),
      )
      const query = { type: "discover", disposition: "open" } as const
      const first = yield* db.transaction((tx) => Assignment.read(tx, query, { asOf: time + 1_000, limit: 1 }))
      if (!first.nextCursor) return yield* Effect.die("Expected a bounded Assignment discovery cursor")

      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          const consumed = yield* LearningFrontier.read(tx)
          yield* LearningFrontier.advance(tx, { time: time + 1_100, consumed: [consumed] })
        }),
      )
      const second = yield* db.transaction((tx) =>
        Assignment.read(tx, query, { asOf: time + 9_999, limit: 1, cursor: first.nextCursor }),
      )
      expect(second.ownerCut).toEqual(first.ownerCut)
      expect(second.asOf).toBe(first.asOf)
      expect(second.items).toHaveLength(1)
      expect(second.items[0]).toMatchObject({ assignmentRevisionRef: { assignmentID: created[1]!.assignmentID } })

      const edited = JSON.parse(Buffer.from(first.nextCursor, "base64url").toString("utf8"))
      edited.dependencies = []
      const tampered = yield* Effect.flip(
        db.transaction((tx) =>
          Assignment.read(tx, query, {
            asOf: time + 9_999,
            limit: 1,
            cursor: Buffer.from(JSON.stringify(edited)).toString("base64url"),
          }),
        ),
      )
      expect(tampered).toMatchObject({ reason: "validation_error" })

      yield* db.transaction((tx) =>
        LearningCommand.Occurrence.markSourceUnavailable(tx, {
          occurrenceID: created[1]!.invocation.envelope.occurrenceID,
          timeDeleted: time + 900,
        }),
      )
      const stale = yield* Effect.flip(
        db.transaction((tx) =>
          Assignment.read(tx, query, { asOf: time + 9_999, limit: 1, cursor: first.nextCursor }),
        ),
      )
      expect(stale).toMatchObject({ reason: "stale" })
    }),
  )

  it.effect("projects an exact historical revision and byte-fits history with exact omission", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-04-29T09:00:00Z")
      const created = yield* createOne(db, "history_projection", time)
      const original = yield* currentAssignment(db, created.assignmentID, time + 10)

      yield* Effect.forEach(
        Array.from({ length: 9 }, (_, index) => index + 1),
        (index) =>
          Effect.gen(function* () {
            const current = yield* currentAssignment(db, created.assignmentID, time + index * 100)
            const source = `Correct the exact history wording at step ${index}.`
            const invocation = yield* seedAgentInvocation(
              db,
              `history_projection_${index}`,
              {
                cause: learnerReport(source),
                intents: [
                  {
                    type: "revise",
                    assignmentID: created.assignmentID,
                    expectedHead: expectedHead(current),
                    snapshot: snapshot(`Analyze proof revision ${index}`, `Use model revision ${index}`),
                    sourceAction: { type: "preserve_predecessor_source" },
                    relationAction: { type: "preserve" },
                    rationale: "Keep the immutable history while correcting current wording.",
                  },
                ],
              },
              source,
              time + index * 100 + 10,
            )
            expect(yield* applyInvocation(db, invocation, time + index * 100 + 12)).toMatchObject({
              type: "settled",
              settlement: { outcome: "applied" },
            })
          }),
        { discard: true },
      )

      const historical = yield* db.transaction((tx) =>
        Assignment.read(
          tx,
          {
            type: "projection",
            assignmentID: created.assignmentID,
            revisionID: original.current.id,
            asOf: time + 2_000,
          },
          { asOf: time + 2_000 },
        ),
      )
      expect(historical.items[0]).toMatchObject({
        assignmentRevisionRef: Assignment.revisionReference(original.current),
        currentHeadRelation: "superseded_by_revision",
        currentHeadRevisionRef: { assignmentID: created.assignmentID, version: 10 },
        revision: { id: original.current.id, version: 1 },
      })

      const first = yield* db.transaction((tx) =>
        Assignment.read(tx, { type: "history", assignmentID: created.assignmentID }, { asOf: time + 2_000, limit: 1 }),
      )
      expect(first).toMatchObject({ countAtCut: 10, returnedCount: 1, omittedCount: 9, truncated: true })
      const two = yield* db.transaction((tx) =>
        Assignment.read(tx, { type: "history", assignmentID: created.assignmentID }, { asOf: time + 2_000, limit: 2 }),
      )
      expect(two).toMatchObject({ countAtCut: 10, returnedCount: 2, omittedCount: 8, truncated: true })
      const byteFit = yield* db.transaction((tx) =>
        Assignment.read(
          tx,
          { type: "history", assignmentID: created.assignmentID },
          { asOf: time + 2_000, limit: 10, byteLimit: first.canonicalBytes },
        ),
      )
      expect(byteFit).toMatchObject({ countAtCut: 10, returnedCount: 1, omittedCount: 9, truncated: true })
      expect(byteFit.canonicalBytes).toBeLessThanOrEqual(first.canonicalBytes)
    }),
  )

  it.effect("projects one complete open Assignment as learning pressure without selecting a task or inferring activity", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-05-01T09:00:00Z")
      const created = yield* createOne(db, "context_sole", time)
      const prepared = yield* prepareLearningContext(db, created.invocation, time + 10)
      const section = prepared.cut.sections.find((item) => item.owner === "assignment")

      expect(section).toMatchObject({
        coverage: "complete",
        countAtCut: 1,
        omission: { type: "none" },
        mode: "sole_candidate_pressure",
        entries: [
          {
            kind: "assignment",
            locator: {
              assignmentID: created.assignmentID,
              version: 1,
              lazyReadAvailable: true,
              sourceStatusAtCut: { ownerRecordedState: { state: "available" } },
            },
            semantic: {
              state: "value",
              value: {
                assignmentRevisionRef: { assignmentID: created.assignmentID, version: 1 },
                obligationSummary: "Analyze the semaphore boundary",
                learningContext: "Use the Course model",
                disposition: "open",
                currentHeadRelation: "current",
              },
            },
          },
        ],
      })
      expect(prepared.renderedBlock).toContain("assignment: sole_candidate_pressure")
      expect(prepared.renderedBlock).toContain("not the current/default task, a priority, a plan, a commitment, activity")
      expect(prepared.renderedBlock).toContain("Time, silence, absence, and elapsed due periods imply no activity")
      expect(
        LearningContext.decodeStored(
          prepared.canonicalCut,
          prepared.renderedBlock,
          created.invocation.envelope.assistantMessageID,
        ),
      ).toEqual(prepared.cut)
    }),
  )

  it.effect("keeps a maximum legal sole Assignment complete inside the automatic semantic ceiling", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-05-15T09:00:00Z")
      const source = "L".repeat(Assignment.MAX_EXCERPT_BYTES)
      const invocation = yield* seedAgentInvocation(
        db,
        "context_maximum",
        createCommand(source, {
          obligationSummary: "S".repeat(Assignment.MAX_SUMMARY_BYTES),
          learningContext: "C".repeat(Assignment.MAX_LEARNING_CONTEXT_BYTES),
          scope: { type: "learner_home" },
          dueBasis: {
            type: "instant",
            sourceExpression: `due ${"d".repeat(252)}`,
            localDateTime: "2037-05-20T17:00:00",
            comparator: "inclusive",
            timeZone: { type: "fixed_offset", offsetMinutes: 0 },
          },
          expiryBoundary: {
            type: "instant",
            sourceExpression: `expires ${"e".repeat(248)}`,
            localDateTime: "2037-05-21T17:00:00",
            comparator: "exclusive",
            timeZone: { type: "fixed_offset", offsetMinutes: 0 },
          },
        }),
        source,
        time,
      )
      const result = yield* applyInvocation(db, invocation, time + 2)
      if (result.type !== "settled" || result.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected a maximum legal Assignment creation")
      }
      const assignmentID = result.settlement.changes[0]!.assignmentID
      const projection = yield* db.transaction((tx) => Assignment.readCurrent(tx, assignmentID, time + 3))
      if (!projection) return yield* Effect.die("Expected the maximum Assignment projection")
      expect(Assignment.semanticValueBytes(projection)).toBeLessThanOrEqual(Assignment.MAX_SEMANTIC_VALUE_BYTES)

      const prepared = yield* prepareLearningContext(db, invocation, time + 4)
      const section = prepared.cut.sections.find((item) => item.owner === "assignment")
      expect(section).toMatchObject({
        coverage: "complete",
        countAtCut: 1,
        mode: "sole_candidate_pressure",
        entries: [{ semantic: { state: "value" } }],
      })
      expect(new TextEncoder().encode(prepared.canonicalCut).byteLength).toBeLessThanOrEqual(
        LearningContext.hardLimits.canonicalBytes,
      )
      expect(new TextEncoder().encode(prepared.renderedBlock).byteLength).toBeLessThanOrEqual(
        LearningContext.hardLimits.renderedBytes,
      )
    }),
  )

  it.effect("keeps two-candidate pressure truthful when Gate 18 byte fit leaves one visible candidate", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-05-16T09:00:00Z")
      const created = yield* Effect.forEach([0, 1] as const, (index) =>
        Effect.gen(function* () {
          const source = maximumText(
            `My course requires maximum byte-fit obligation ${index}. `,
            Assignment.MAX_EXCERPT_BYTES,
            index === 0 ? "a" : "b",
          )
          const invocation = yield* seedAgentInvocation(
            db,
            `context_two_to_one_${index}`,
            createCommand(source, maximumSnapshot(`byte fit ${index}`)),
            source,
            time + index * 100,
          )
          const result = yield* applyInvocation(db, invocation, time + index * 100 + 2)
          if (result.type !== "settled" || result.settlement.outcome !== "applied") {
            return yield* Effect.die("Expected a maximum byte-fit Assignment fixture")
          }
          return { invocation, assignmentID: result.settlement.changes[0]!.assignmentID }
        }),
      )
      const prepared = yield* prepareLearningContext(db, created[1]!.invocation, time + 500, 110)
      const section = prepared.cut.sections.find((item) => item.owner === "assignment")
      if (!section || section.owner !== "assignment" || section.coverage === "not_authorized") {
        return yield* Effect.die("Expected an authorized Assignment byte-fit section")
      }
      expect(section).toMatchObject({
        countAtCut: 2,
        mode: "multiple_candidate_pressure",
        coverage: "truncated",
        omission: {
          type: "exact",
          omitted: 1,
          reasons: [{ reason: "gate18_byte_budget", omitted: 1 }],
        },
      })
      expect(section.entries).toHaveLength(1)
      expect(section.entries[0]!.locator.assignmentID).toBe(created[0]!.assignmentID)
      expect(prepared.renderedBlock).toContain("assignment: multiple_candidate_pressure; exactOpenCount=2")
      expect(prepared.cut.budget.canonicalBytes).toBeLessThanOrEqual(LearningContext.hardLimits.canonicalBytes)
      expect(prepared.cut.budget.renderedBytes).toBeLessThanOrEqual(LearningContext.hardLimits.renderedBytes)
    }),
  )

  it.effect("commits the maximum mixed sixteen-intent lifecycle and graph change set atomically", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-05-03T09:00:00Z")
      const sources = yield* Effect.forEach(Array.from({ length: Assignment.MAX_INTENTS }, (_, index) => index), (index) =>
        createOne(db, `maximum_mixed_source_${index}`, time + index * 100),
      )
      const targets = yield* Effect.forEach(Array.from({ length: 6 }, (_, index) => index), (index) =>
        createOne(db, `maximum_mixed_target_${index}`, time + 2_000 + index * 100),
      )

      const completionHead = yield* currentAssignment(db, sources[0]!.assignmentID, time + 3_000)
      const completionSource = "I explicitly completed the first maximum mixed-change fixture."
      const completion = yield* seedAgentInvocation(
        db,
        "maximum_mixed_complete",
        {
          cause: learnerReport(completionSource),
          intents: [
            {
              type: "complete",
              assignmentID: sources[0]!.assignmentID,
              expectedHead: expectedHead(completionHead),
              sourceAction: { type: "rebind_current_source_to_cause" },
              relationAction: { type: "preserve" },
              rationale: "Establish the terminal head that the maximum batch will correct directly.",
            },
          ],
        },
        completionSource,
        time + 3_000,
      )
      expect(yield* applyInvocation(db, completion, time + 3_002)).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied" },
      })

      yield* Effect.forEach(
        [1, 2, 3] as const,
        (sourceIndex) =>
          Effect.gen(function* () {
            const sourceHead = yield* currentAssignment(
              db,
              sources[sourceIndex]!.assignmentID,
              time + 3_100 + sourceIndex * 100,
            )
            const targetHead = yield* currentAssignment(
              db,
              targets[sourceIndex - 1]!.assignmentID,
              time + 3_100 + sourceIndex * 100,
            )
            const report = `The exact replacement fixture ${sourceIndex} supersedes its prior obligation.`
            const replacement = yield* seedAgentInvocation(
              db,
              `maximum_mixed_supersede_${sourceIndex}`,
              {
                cause: learnerReport(report),
                intents: [
                  {
                    type: "replace",
                    assignmentID: sources[sourceIndex]!.assignmentID,
                    expectedHead: expectedHead(sourceHead),
                    sourceAction: { type: "rebind_current_source_to_cause" },
                    rationale: "Establish a current exact edge for preserve, retarget, or clear.",
                    successor: {
                      type: "bind",
                      target: Assignment.revisionReference(targetHead.current),
                    },
                  },
                ],
              },
              report,
              time + 3_100 + sourceIndex * 100,
            )
            expect(yield* applyInvocation(db, replacement, time + 3_102 + sourceIndex * 100)).toMatchObject({
              type: "settled",
              settlement: { outcome: "applied" },
            })
          }),
        { discard: true },
      )

      const heads = yield* Effect.forEach(sources, (item) =>
        currentAssignment(db, item.assignmentID, time + 4_000),
      )
      const targetHeads = yield* Effect.forEach(targets, (item) =>
        currentAssignment(db, item.assignmentID, time + 4_000),
      )
      const source = maximumText(
        "These sixteen exact corrections belong to one maximum learner report. ",
        Assignment.MAX_EXCERPT_BYTES,
        "m",
      )
      const rationale = (label: string) =>
        maximumText(`${label}: `, Assignment.MAX_RATIONALE_BYTES, "r")
      const intents: Assignment.ChangeSetCommand["intents"] = [
        {
          type: "correct",
          assignmentID: sources[0]!.assignmentID,
          expectedHead: expectedHead(heads[0]!),
          snapshot: maximumSnapshot("terminal correction"),
          finalDisposition: "cancelled",
          sourceAction: { type: "rebind_current_source_to_cause" },
          relationAction: { type: "preserve" },
          rationale: rationale("Direct terminal correction"),
        },
        {
          type: "correct",
          assignmentID: sources[1]!.assignmentID,
          expectedHead: expectedHead(heads[1]!),
          snapshot: maximumSnapshot("preserve edge"),
          finalDisposition: "superseded",
          sourceAction: { type: "rebind_current_source_to_cause" },
          relationAction: { type: "preserve" },
          rationale: rationale("Preserve the exact current edge"),
        },
        {
          type: "correct",
          assignmentID: sources[2]!.assignmentID,
          expectedHead: expectedHead(heads[2]!),
          snapshot: maximumSnapshot("retarget edge"),
          finalDisposition: "superseded",
          sourceAction: { type: "rebind_current_source_to_cause" },
          relationAction: {
            type: "set_or_retarget",
            target: Assignment.revisionReference(targetHeads[3]!.current),
          },
          rationale: rationale("Retarget the exact current edge"),
        },
        {
          type: "correct",
          assignmentID: sources[3]!.assignmentID,
          expectedHead: expectedHead(heads[3]!),
          snapshot: maximumSnapshot("clear edge"),
          finalDisposition: "open",
          sourceAction: { type: "rebind_current_source_to_cause" },
          relationAction: { type: "clear", finalDisposition: "open" },
          rationale: rationale("Clear the exact current edge"),
        },
        {
          type: "correct",
          assignmentID: sources[4]!.assignmentID,
          expectedHead: expectedHead(heads[4]!),
          snapshot: maximumSnapshot("set edge"),
          finalDisposition: "superseded",
          sourceAction: { type: "rebind_current_source_to_cause" },
          relationAction: {
            type: "set_or_retarget",
            target: Assignment.revisionReference(targetHeads[4]!.current),
          },
          rationale: rationale("Set one exact current edge"),
        },
        {
          type: "replace",
          assignmentID: sources[5]!.assignmentID,
          expectedHead: expectedHead(heads[5]!),
          sourceAction: { type: "rebind_current_source_to_cause" },
          rationale: rationale("Create one exact successor"),
          successor: { type: "create", createOrdinal: 0, snapshot: maximumSnapshot("created successor") },
        },
        {
          type: "replace",
          assignmentID: sources[6]!.assignmentID,
          expectedHead: expectedHead(heads[6]!),
          sourceAction: { type: "rebind_current_source_to_cause" },
          rationale: rationale("Bind one exact successor"),
          successor: { type: "bind", target: Assignment.revisionReference(targetHeads[5]!.current) },
        },
        ...heads.slice(7).map((head, index) => ({
          type: "revise" as const,
          assignmentID: sources[index + 7]!.assignmentID,
          expectedHead: expectedHead(head),
          snapshot: maximumSnapshot(`revision ${index + 7}`),
          sourceAction: { type: "rebind_current_source_to_cause" as const },
          relationAction: { type: "preserve" as const },
          rationale: rationale(`Revise exact head ${index + 7}`),
        })),
      ]
      expect(intents).toHaveLength(Assignment.MAX_INTENTS)
      expect(new TextEncoder().encode(source).byteLength).toBe(Assignment.MAX_EXCERPT_BYTES)
      expect(
        intents.every(
          (intent) => "rationale" in intent && new TextEncoder().encode(intent.rationale).byteLength === Assignment.MAX_RATIONALE_BYTES,
        ),
      ).toBe(true)
      const beforeMaximum = yield* assignmentDomainCounts(db)
      const maximum = yield* seedAgentInvocation(
        db,
        "maximum_change_set",
        { cause: learnerReport(source), intents },
        source,
        time + 4_100,
      )
      const applied = yield* applyInvocation(db, maximum, time + 4_102)
      expect(applied).toMatchObject({
        type: "settled",
        settlement: { outcome: "applied", assignmentKind: "change_set" },
      })
      if (applied.type !== "settled" || applied.settlement.outcome !== "applied") {
        return yield* Effect.die("Expected the maximum Assignment change set to apply")
      }
      expect(applied.settlement.changes).toHaveLength(Assignment.MAX_INTENTS + 1)
      expect(applied.settlement.intentResults).toHaveLength(Assignment.MAX_INTENTS)
      const afterMaximum = yield* assignmentDomainCounts(db)
      expect(afterMaximum).toEqual({
        assignments: beforeMaximum.assignments + 1,
        revisions: beforeMaximum.revisions + 17,
        effects: beforeMaximum.effects + 1,
        seals: beforeMaximum.seals + 1,
        receipts: beforeMaximum.receipts + 1,
      })

      const finalHeads = yield* Effect.forEach(sources.slice(0, 7), (item) =>
        currentAssignment(db, item.assignmentID, time + 5_000),
      )
      expect(finalHeads[0]!.current.disposition).toBe("cancelled")
      expect(finalHeads[1]!.current.supersessionTarget).toEqual(
        Assignment.revisionReference(targetHeads[0]!.current),
      )
      expect(finalHeads[2]!.current.supersessionTarget).toEqual(
        Assignment.revisionReference(targetHeads[3]!.current),
      )
      expect(finalHeads[3]!.current).toMatchObject({ disposition: "open" })
      expect(finalHeads[3]!.current.supersessionTarget).toBeUndefined()
      expect(finalHeads[4]!.current.supersessionTarget).toEqual(
        Assignment.revisionReference(targetHeads[4]!.current),
      )
      expect(finalHeads[5]!.current).toMatchObject({
        disposition: "superseded",
        supersessionTarget: { version: 1 },
      })
      expect(targets.map((item) => item.assignmentID)).not.toContain(
        finalHeads[5]!.current.supersessionTarget!.assignmentID,
      )
      expect(finalHeads[6]!.current.supersessionTarget).toEqual(
        Assignment.revisionReference(targetHeads[5]!.current),
      )
      expect(
        (yield* db.transaction((tx) => Assignment.readExactRevision(tx, sources[2]!.assignmentID, heads[2]!.current.id)))
          ?.supersessionTarget,
      ).toEqual(Assignment.revisionReference(targetHeads[1]!.current))

      const replay = yield* db.transaction((tx) =>
        Assignment.reserve(tx, { ...maximum, settlement: { time: time + 5_100, order: 9 } }),
      )
      expect(replay).toEqual({ type: "replay", settlement: applied.settlement })

      const tooManySource = "This command incorrectly contains seventeen Assignment intents."
      const tooMany = {
        cause: learnerReport(tooManySource),
        intents: Array.from({ length: Assignment.MAX_INTENTS + 1 }, (_, index) => ({
          type: "create" as const,
          createOrdinal: index,
          snapshot: snapshot(`Analyze excess invariant ${index}`, `Use excess model ${index}`),
        })),
      }
      expect(
        yield* Effect.flip(
          Effect.try({
            try: () => Assignment.canonicalizeCommand(tooMany),
            catch: (error) => error,
          }),
        ),
      ).toMatchObject({ reason: "validation_error" })

      const overSummarySource = "This otherwise valid command exceeds one semantic field by one byte."
      const overSummary = createCommand(overSummarySource, {
        ...snapshot("placeholder", "Keep the learning meaning exact"),
        obligationSummary: "s".repeat(Assignment.MAX_SUMMARY_BYTES + 1),
      })
      expect(
        yield* Effect.flip(
          Effect.try({
            try: () => Assignment.canonicalizeCommand(overSummary),
            catch: (error) => error,
          }),
        ),
      ).toMatchObject({ reason: "validation_error" })
      expect(yield* assignmentDomainCounts(db)).toEqual(afterMaximum)
    }),
  )

  it.effect("keeps nine open Assignments as bounded multiple pressure with exact omission and no promoted winner", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const time = Date.parse("2037-06-01T09:00:00Z")
      const created = yield* Effect.forEach(Array.from({ length: 9 }, (_, index) => index), (index) =>
        createOne(db, `context_multiple_${index}`, time + index * 100),
      )
      const prepared = yield* prepareLearningContext(db, created.at(-1)!.invocation, time + 2_000)
      const section = prepared.cut.sections.find((item) => item.owner === "assignment")
      if (!section || section.owner !== "assignment" || section.coverage === "not_authorized") {
        return yield* Effect.die("Expected an authorized Assignment context section")
      }

      expect(section.countAtCut).toBe(9)
      expect(section.mode).toBe("multiple_candidate_pressure")
      expect(section.coverage).toBe("truncated")
      expect(section.entries.length).toBeGreaterThan(0)
      expect(section.entries.length).toBeLessThanOrEqual(8)
      expect(section.entries.map((entry) => entry.locator.assignmentID)).toEqual(
        created.slice(0, section.entries.length).map((item) => item.assignmentID),
      )
      expect(section.omission).toMatchObject({ type: "exact", omitted: 9 - section.entries.length })
      if (section.omission.type !== "exact") return yield* Effect.die("Expected exact Assignment omission")
      expect(section.omission.reasons[0]).toEqual({ reason: "candidate_limit", omitted: 1 })
      expect(section.omission.reasons.reduce((total, reason) => total + reason.omitted, 0)).toBe(
        section.omission.omitted,
      )
      expect(prepared.renderedBlock).toContain("assignment: multiple_candidate_pressure; exactOpenCount=9")
      expect(prepared.renderedBlock).toContain("Candidate order is deterministic audit/pagination order, never priority")
      expect(prepared.renderedBlock).toContain("No retained row is a program-selected winner")
      expect(
        LearningContext.decodeStored(
          prepared.canonicalCut,
          prepared.renderedBlock,
          created.at(-1)!.invocation.envelope.assistantMessageID,
        ),
      ).toEqual(prepared.cut)
    }),
  )
})

function createOne(db: Database.Interface["db"], suffix: string, time: number) {
  return Effect.gen(function* () {
    const source = `Assignment source ${suffix}`
    const invocation = yield* seedAgentInvocation(
      db,
      suffix,
      createCommand(source, snapshot("Analyze the semaphore boundary", "Use the Course model")),
      source,
      time,
    )
    const result = yield* applyInvocation(db, invocation, time + 2)
    if (
      result.type !== "settled" ||
      result.settlement.outcome !== "applied" ||
      !("changes" in result.settlement)
    ) {
      return yield* Effect.die("Expected an applied Assignment fixture")
    }
    const settlement = result.settlement as Assignment.AppliedSettlement
    return { assignmentID: settlement.changes[0]!.assignmentID, invocation, result }
  })
}

function applyInvocation(db: Database.Interface["db"], invocation: Assignment.Invocation, time: number) {
  return Effect.gen(function* () {
    const reserved = yield* db.transaction((tx) =>
      Assignment.reserve(tx, { ...invocation, settlement: { time, order: 1 } }),
    )
    if (reserved.type !== "admitted") return reserved
    yield* db.transaction((tx) =>
      Assignment.settlePolicy(tx, {
        partID: invocation.envelope.partID,
        outcome: "policy_allow",
        policyBasis: { source: "assignment-test", rule: "allow" },
        time: time + 1,
        order: 2,
      }),
    )
    return yield* db.transaction((tx) =>
      Assignment.settle(tx, {
        partID: invocation.envelope.partID,
        settlement: { time: time + 2, order: 3 },
      }),
    )
  })
}

function currentAssignment(db: Database.Interface["db"], assignmentID: Assignment.AssignmentID, asOf: number) {
  return Effect.gen(function* () {
    const page = yield* db.transaction((tx) => Assignment.read(tx, { type: "current", assignmentID }, { asOf }))
    const current = page.items[0]
    if (!current || !("current" in current)) return yield* Effect.die(`Expected current Assignment ${assignmentID}`)
    return current
  })
}

function expectedHead(assignment: Parameters<typeof Assignment.ownerReadReference>[0]) {
  const reference = Assignment.ownerReadReference(assignment)
  return {
    revisionID: reference.revisionID,
    version: reference.version,
    ownerCutFingerprint: reference.ownerCutFingerprint,
  }
}

function createCommand(
  source: string,
  value: Extract<Assignment.ChangeSetCommand["intents"][number], { type: "create" }>["snapshot"],
): Assignment.ChangeSetCommand {
  return { cause: learnerReport(source), intents: [{ type: "create", createOrdinal: 0, snapshot: value }] }
}

function learnerReport(text: string) {
  return {
    type: "interpreted_learner_report" as const,
    excerpt: { text, startByte: 0, endByte: new TextEncoder().encode(text).byteLength },
  }
}

function snapshot(obligationSummary: string, learningContext: string) {
  return {
    obligationSummary,
    learningContext,
    scope: { type: "learner_home" as const },
    dueBasis: {
      type: "local_date" as const,
      civilDate: "2037-01-03",
      comparator: "inclusive" as const,
      timeZone: { type: "fixed_offset" as const, offsetMinutes: 0 },
    },
  }
}

function maximumText(prefix: string, byteLimit: number, fill: string) {
  const remaining = byteLimit - new TextEncoder().encode(prefix).byteLength
  if (remaining < 0 || new TextEncoder().encode(fill).byteLength !== 1) {
    throw new Error("Maximum-bound Assignment fixture requires a fitting prefix and one-byte fill")
  }
  return `${prefix}${fill.repeat(remaining)}`
}

function maximumSnapshot(label: string) {
  return {
    obligationSummary: maximumText(`${label} summary: `, Assignment.MAX_SUMMARY_BYTES, "s"),
    learningContext: maximumText(`${label} learning context: `, Assignment.MAX_LEARNING_CONTEXT_BYTES, "c"),
    scope: { type: "learner_home" as const },
    dueBasis: {
      type: "instant" as const,
      sourceExpression: maximumText("due ", 256, "d"),
      localDateTime: "2037-05-20T17:00:00",
      comparator: "inclusive" as const,
      timeZone: { type: "fixed_offset" as const, offsetMinutes: 0 },
    },
    expiryBoundary: {
      type: "instant" as const,
      sourceExpression: maximumText("expires ", 256, "e"),
      localDateTime: "2037-05-21T17:00:00",
      comparator: "exclusive" as const,
      timeZone: { type: "fixed_offset" as const, offsetMinutes: 0 },
    },
  }
}

function admitArtifactRevision(artifacts: Artifact.Interface, suffix: string, time: number) {
  return Effect.gen(function* () {
    const text = `Assignment Artifact source ${suffix}`
    const observer = Artifact.Observer.trusted(`assignment-${suffix}`, 1)
    const artifact = yield* artifacts.admit({
      location: Artifact.CanonicalLocation.trusted(path.resolve("assignment-source", `${suffix}.pdf`)),
      observation: {
        result: "present",
        fingerprint: {
          algorithm: "sha256",
          digest: new Bun.CryptoHasher("sha256").update(text).digest("hex"),
          byteLength: new TextEncoder().encode(text).byteLength,
        },
        mediaType: "application/pdf",
        observer,
        timeObserved: time,
      },
      authority: Artifact.Admission.learnerInstruction(`assignment-${suffix}`, 1),
    })
    const revisionID = artifact.source.currentRevisionID
    const attribution = artifact.source.revisionAttribution
    if (!revisionID || !attribution) return yield* Effect.die("Expected an admitted Artifact revision")
    return { artifact, revisionID, attribution, observer }
  })
}

function assignmentDomainCounts(db: Database.Interface["db"]) {
  return db
    .get<{
      assignments: number
      revisions: number
      effects: number
      seals: number
      receipts: number
    }>(sql`
      SELECT
        (SELECT count(*) FROM assignment) AS assignments,
        (SELECT count(*) FROM assignment_revision) AS revisions,
        (SELECT count(*) FROM assignment_effect) AS effects,
        (SELECT count(*) FROM assignment_commit_seal) AS seals,
        (SELECT count(*) FROM learning_command_receipt) AS receipts
    `)
    .pipe(
      Effect.map((counts) => {
        if (!counts) throw new Error("Assignment domain count fixture returned no row")
        return counts
      }),
    )
}

function prepareLearningContext(
  db: Database.Interface["db"],
  invocation: Assignment.Invocation,
  asOf: number,
  providerDefinitionCount = 0,
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
        capabilityBasis: learningContextBasis(providerDefinitionCount),
      })
    }),
  )
}

function learningContextBasis(providerDefinitionCount = 0): LearningContext.CapabilityBasis {
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
    definitions: [
      ...LearningContext.LAZY_READ_CAPABILITY_IDS.map((id) => ({ id, value: { type: "function", name: id } })),
      ...Array.from({ length: providerDefinitionCount }, (_, index) => {
        const id = `assignment_context_pressure_${String(index).padStart(3, "0")}_${"x".repeat(64)}`
        return { id, value: { type: "function", name: id } }
      }),
    ],
  })
  return {
    catalogVersion: LearningContext.CAPABILITY_CATALOG_VERSION,
    policyFingerprint: "b".repeat(64),
    effectiveAutomaticContext: true,
    effectiveLazyReadCapabilities: [...LearningContext.LAZY_READ_CAPABILITY_IDS],
    effectiveProviderToolSurfaceBinding: providerSurface.binding,
  }
}

function seedAgentInvocation(
  db: Database.Interface["db"],
  suffix: string,
  command: Assignment.ChangeSetCommand,
  userText: string,
  time: number,
  timeZone = "UTC",
) {
  return Effect.gen(function* () {
    const sessionID = SessionSchema.ID.make(`ses_assignment_${suffix}`)
    const userMessageID = SessionV1.MessageID.ascending(`msg_assignment_user_${suffix}`)
    const userPartID = SessionV1.PartID.ascending(`prt_assignment_user_${suffix}`)
    const assistantMessageID = SessionV1.MessageID.ascending(`msg_assignment_assistant_${suffix}`)
    const partID = SessionV1.PartID.ascending(`prt_assignment_tool_${suffix}`)
    const callID = `call-assignment-${suffix}`
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
          admission: LearningCommand.LearnerAdmission.interactive({ timeZone }),
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
          policyBasis: { source: "assignment-test" },
          timeAdmitted: time,
        })
        return admitted
      }),
    )
    const invocationTime = time + 1
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
              tool: Assignment.UPDATE_CAPABILITY,
              callID,
              state: { status: "pending", input: command, raw: JSON.stringify(command) },
            } as (typeof PartTable.$inferInsert)["data"],
            time_created: invocationTime,
            time_updated: invocationTime,
          })
          .run()
        yield* admitModelWithLearningContext(tx, {
          turnID,
          sessionID,
          assistantMessageID,
          requestEnvelope: { command },
          contextFingerprint: new Bun.CryptoHasher("sha256").update(`assignment-context:${suffix}`).digest("hex"),
          snapshotFrontier: yield* LearningFrontier.read(tx),
          timeAdmitted: invocationTime,
        })
        yield* TurnLifecycle.sealCandidateSet(tx, {
          turnID,
          sessionID,
          assistantMessageID,
          candidates: [{ partID, callID, tool: Assignment.UPDATE_CAPABILITY, envelope: { command } }],
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
        capabilityIdentity: Assignment.UPDATE_CAPABILITY,
        capabilityVersion: Assignment.UPDATE_VERSION,
        authorizationBasis: "agent_action" as const,
        timeAdmitted: invocationTime,
      },
      command,
    } satisfies Assignment.Invocation
  }).pipe(Effect.orDie)
}

function seedFollowupAgentInvocation(
  db: Database.Interface["db"],
  predecessor: Assignment.Invocation,
  suffix: string,
  command: Assignment.ChangeSetCommand,
  time: number,
) {
  return Effect.gen(function* () {
    const assistantMessageID = SessionV1.MessageID.ascending(`msg_assignment_assistant_${suffix}`)
    const partID = SessionV1.PartID.ascending(`prt_assignment_tool_${suffix}`)
    const callID = `call-assignment-${suffix}`
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx
          .insert(MessageTable)
          .values({
            id: assistantMessageID,
            session_id: predecessor.envelope.sessionID,
            data: assistantData(predecessor.envelope.parentUserMessageID, time),
            time_created: time,
            time_updated: time,
          })
          .run()
        yield* tx
          .insert(PartTable)
          .values({
            id: partID,
            session_id: predecessor.envelope.sessionID,
            message_id: assistantMessageID,
            data: {
              type: "tool",
              tool: Assignment.UPDATE_CAPABILITY,
              callID,
              state: { status: "pending", input: command, raw: JSON.stringify(command) },
            } as (typeof PartTable.$inferInsert)["data"],
            time_created: time,
            time_updated: time,
          })
          .run()
        yield* admitModelWithLearningContext(tx, {
          turnID: predecessor.envelope.turnID,
          sessionID: predecessor.envelope.sessionID,
          assistantMessageID,
          requestEnvelope: { command },
          contextFingerprint: new Bun.CryptoHasher("sha256").update(`assignment-context:${suffix}`).digest("hex"),
          snapshotFrontier: yield* LearningFrontier.read(tx),
          timeAdmitted: time,
        })
        yield* TurnLifecycle.sealCandidateSet(tx, {
          turnID: predecessor.envelope.turnID,
          sessionID: predecessor.envelope.sessionID,
          assistantMessageID,
          candidates: [{ partID, callID, tool: Assignment.UPDATE_CAPABILITY, envelope: { command } }],
          timeSealed: time,
        })
        yield* TurnLifecycle.settleModel(tx, {
          turnID: predecessor.envelope.turnID,
          assistantMessageID,
          state: "completed",
          time,
        })
        yield* TurnLifecycle.admitTool(tx, {
          turnID: predecessor.envelope.turnID,
          sessionID: predecessor.envelope.sessionID,
          assistantMessageID,
          partID,
          timeAdmitted: time,
        })
        yield* TurnLifecycle.consumeToolFrontier(tx, { partID, frontier: yield* LearningFrontier.read(tx) })
      }),
    )
    return {
      envelope: {
        occurrenceID: predecessor.envelope.occurrenceID,
        turnID: predecessor.envelope.turnID,
        inputID: predecessor.envelope.inputID,
        sessionID: predecessor.envelope.sessionID,
        parentUserMessageID: predecessor.envelope.parentUserMessageID,
        assistantMessageID,
        partID,
        providerCallID: callID,
        emissionOrdinal: 0,
        capabilityIdentity: Assignment.UPDATE_CAPABILITY,
        capabilityVersion: Assignment.UPDATE_VERSION,
        authorizationBasis: "agent_action" as const,
        timeAdmitted: time,
      },
      command,
    } satisfies Assignment.Invocation
  }).pipe(Effect.orDie)
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
