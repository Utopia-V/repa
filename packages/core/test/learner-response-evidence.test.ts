import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { sql } from "drizzle-orm"
import { Cause, Effect, Exit, Layer, ManagedRuntime } from "effect"
import { Artifact } from "@opencode-ai/core/artifact"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Course } from "@opencode-ai/core/course"
import { CourseSchema } from "@opencode-ai/core/course/schema"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { LearningContext } from "@opencode-ai/core/learning-context"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { LearnerResponseEvidence } from "@opencode-ai/core/learner-response-evidence"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { Occurrence } from "@opencode-ai/core/learning-command/occurrence"
import { LearnerAdmission } from "@opencode-ai/core/learning-command/occurrence-schema"
import { MaterialMap } from "@opencode-ai/core/material-map"
import { ProjectV2 } from "@opencode-ai/core/project"
import { Representation } from "@opencode-ai/core/representation"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { admitModelWithLearningContext } from "./fixture/model-admission"

const windowsTest = process.platform === "win32" ? test : test.skip

function appLayer(filename: string) {
  return LayerNode.compile(
    LayerNode.group([
      MaterialMap.node,
      MaterialMap.currentUseReaderNode,
      MaterialMap.tutorCurrentUseReaderNode,
      Course.node,
      Representation.node,
      Representation.currentUseReaderNode,
      Representation.tutorCurrentUseReaderNode,
      Artifact.node,
      ContentRoot.node,
      Database.node,
    ]),
    [[Database.node, Database.layerFromPath(filename).pipe(Layer.orDie)]],
  )
}

type Fixture = Awaited<ReturnType<typeof prepareFixture>>
type LearnerTurn = Awaited<ReturnType<typeof admitLearnerTurn>>
type EvidenceInvocation = Awaited<ReturnType<typeof prepareEvidenceInvocation>>

async function prepareFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "repa-learner-evidence-"))
  const filename = path.join(directory, "learner-home.db")
  const materialsDirectory = path.join(directory, "materials")
  const source = path.join(materialsDirectory, "source.txt")
  const bytes = new TextEncoder().encode("A semaphore limits concurrent access to a shared resource.\n")
  await mkdir(materialsDirectory)
  await writeFile(source, bytes)
  const runtime = ManagedRuntime.make(appLayer(filename))
  const roots = await runtime.runPromise(ContentRoot.Service)
  const artifacts = await runtime.runPromise(Artifact.Service)
  const courses = await runtime.runPromise(Course.Service)
  const maps = await runtime.runPromise(MaterialMap.Service)
  const current = await runtime.runPromise(MaterialMap.CurrentUseReader)
  const database = await runtime.runPromise(Database.Service)
  await runtime.runPromise(
    database.db.run(sql`
      INSERT OR IGNORE INTO project (id, worktree, time_created, time_updated, sandboxes)
      VALUES (${ProjectV2.ID.global}, '/', 1, 1, '[]')
    `),
  )
  const proposal = await runtime.runPromise(roots.propose(materialsDirectory))
  const root = await runtime.runPromise(
    roots.approve({
      proposal,
      approval: ContentRoot.LearnerApproval.contentRoot(proposal, "Gate 19 evidence fixture"),
    }),
  )
  const read = await runtime.runPromise(
    roots.read({ contentRootID: root.id, relativePath: "source.txt", maxBytes: 1024 * 1024 }),
  )
  if (read.observation.result !== "present") throw new Error("Expected exact fixture bytes")
  const artifact = await runtime.runPromise(
    artifacts.admit({
      location: Artifact.CanonicalLocation.trusted(read.observation.descriptor.canonicalPath),
      observation: {
        result: "present",
        fingerprint: read.observation.fingerprint,
        mediaType: read.observation.mediaType,
        observer: Artifact.Observer.trusted(
          `content-root:${read.authorization.contentRootID}:${read.authorization.bindingID}:${read.authorization.grantEpisodeID}`,
          read.authorization.grantVersion,
        ),
        timeObserved: read.observation.timeObserved,
      },
      authority: Artifact.Admission.learnerInstruction("Gate 19 source admission", 1),
    }),
  )
  if (!artifact.source.currentRevisionID || !artifact.source.revisionAttribution) {
    throw new Error("Expected one exact Artifact Revision")
  }
  const revision = await runtime.runPromise(
    artifacts.getRevision(artifact.id, artifact.source.currentRevisionID, artifact.source.revisionAttribution),
  )
  return { directory, runtime, database, roots, courses, maps, current, root, artifact, revision, bytes }
}

async function closeFixture(fixture: Fixture) {
  await fixture.runtime.dispose()
  await rm(fixture.directory, { recursive: true, force: true })
}

function learnerEvidenceState(fixture: Fixture) {
  return fixture.runtime.runPromise(
    fixture.database.db.get<Record<string, number>>(sql`
      SELECT
        (SELECT count(*) FROM learner_response_evidence_disposition) AS dispositions,
        (SELECT count(*) FROM learner_response_evidence_capability_issue) AS capabilityIssues,
        (SELECT count(*) FROM learner_response_evidence_capability_settlement) AS capabilitySettlements,
        (SELECT count(*) FROM learner_response_evidence_record) AS records,
        (SELECT count(*) FROM learner_response_evidence_revision) AS revisions,
        (SELECT count(*) FROM learner_response_evidence_commit_seal) AS seals,
        (SELECT count(*) FROM turn_model_source_retention) AS sourceRetentions,
        (SELECT sequence FROM learning_shared_frontier WHERE singleton = 1) AS frontierSequence,
        (SELECT time_committed FROM learning_shared_frontier WHERE singleton = 1) AS frontierTime
    `),
  )
}

describe("LearnerResponseEvidence", () => {
  test("keeps the command vocabulary closed and leaves uncertain interpretations at zero write", () => {
    const target = {
      mapID: MaterialMap.createMapID(),
      selectorID: MaterialMap.createSelectorID(),
      courseID: CourseSchema.createCourseID(),
      viewID: CourseSchema.createViewID(),
      revisionID: CourseSchema.createRevisionID(),
      itemID: CourseSchema.createItemID(),
    }
    const conditionAssistantMessageID = SessionV1.MessageID.ascending()
    const alignmentID = MaterialMap.createAlignmentID()
    const valid = {
      operation: "create",
      relation: "supports",
      exposure: "learner_response_before_tutor_disclosure",
      conditionAssistantMessageID,
      target,
      alignmentID,
    } satisfies LearnerResponseEvidence.Command
    expect(LearnerResponseEvidence.canonicalizeCommand(valid)).toEqual({ schemaVersion: 1, ...valid })

    for (const invalid of [
      { ...valid, relation: "inconclusive" },
      { ...valid, relation: "not_established" },
      { ...valid, basis: "learner_report" },
      { ...valid, disposition: "active" },
      { ...valid, criterion: "supports only the first clause" },
      { ...valid, subjectOccurrenceID: "occ_historical_or_assistant_source" },
      { ...valid, subjectAssistantMessageID: SessionV1.MessageID.ascending() },
      { ...valid, subjectToolPartID: SessionV1.PartID.ascending() },
      {
        operation: "revise_from_learner_report",
        recordID: LearnerResponseEvidence.createRecordID(),
        expectedVersion: 0,
        relation: "supports",
        exposure: "learner_response_before_tutor_disclosure",
        basisSourceOccurrenceID: "occ_caller_selected_report",
      },
      { operation: "retract", recordID: LearnerResponseEvidence.createRecordID(), expectedVersion: 0, relation: "supports" },
    ]) {
      expect(() =>
        LearnerResponseEvidence.canonicalizeCommand(invalid as unknown as LearnerResponseEvidence.Command),
      ).toThrow(LearnerResponseEvidence.InvalidCommandError)
    }
  })

  windowsTest("uses causal source order when timestamps tie and rejects same-response-Turn condition sources", async () => {
    const fixture = await prepareFixture()
    try {
      const mapInput = artifactMapInput(fixture)
      const map = await fixture.runtime.runPromise(fixture.maps.createMap(mapInput))
      const selectorID = mapInput.proposal.outline[1]!.selectors[0]!.id
      const course = await createCourseEndpoint(fixture)
      const alignment = await fixture.runtime.runPromise(
        fixture.maps.createAlignment(alignmentInput(map.id, selectorID, course.endpoint, mapInput.access)),
      )
      const command = (conditionAssistantMessageID: SessionV1.MessageID) =>
        ({
          operation: "create",
          relation: "supports",
          exposure: "tutor_disclosure_before_learner_response",
          conditionAssistantMessageID,
          target: {
            mapID: map.id,
            selectorID,
            courseID: course.endpoint.courseID,
            viewID: course.endpoint.viewID,
            revisionID: course.endpoint.revisionID,
            itemID: course.endpoint.itemID,
          },
          alignmentID: alignment.id,
        }) satisfies LearnerResponseEvidence.Command
      const rejectCondition = async (
        invocation: EvidenceInvocation,
        conditionAssistantMessageID: SessionV1.MessageID,
        time: number,
        order: number,
      ) => {
        expect(await reserveEvidence(fixture, invocation, command(conditionAssistantMessageID), time, order)).toMatchObject({
          type: "settled",
          settlement: { outcome: "error", code: "source_unavailable" },
        })
      }
      const base = Date.now() + 1_000

      const equalitySessionID = SessionSchema.ID.create()
      const equalityConditionTurn = await admitLearnerTurn(fixture, {
        sessionID: equalitySessionID,
        createSession: true,
        text: "State the exact semaphore proposition.",
        time: base,
        limits: { model: 1, tool: 0 },
      })
      const equalityCondition = await completeTeachingModel(fixture, equalityConditionTurn, base + 1)
      const equalityResponse = await admitLearnerTurn(fixture, {
        sessionID: equalitySessionID,
        text: "The response admitted at the exact condition settlement time still follows that earlier causal source.",
        time: base + 3,
        limits: { model: 1, tool: 1 },
      })
      const equalityInvocation = await prepareEvidenceInvocation(fixture, equalityResponse, base + 5)
      const equalTimeOrder = await fixture.runtime.runPromise(
        fixture.database.db.get<{
          conditionTime: number
          subjectTime: number
          conditionCauseOrder: number
          subjectOrder: number
        }>(sql`
            SELECT operation.time_settled AS conditionTime, occurrence.time_admitted AS subjectTime,
                   condition_cause.source_order AS conditionCauseOrder, occurrence.source_order AS subjectOrder
            FROM turn_model_operation AS operation
            JOIN learning_admitted_occurrence AS condition_cause
              ON condition_cause.id = operation.causal_occurrence_id
            JOIN learning_admitted_occurrence AS occurrence ON occurrence.id = ${equalityResponse.occurrenceID}
            WHERE operation.assistant_message_id = ${equalityCondition}
        `),
      )
      expect(equalTimeOrder).toMatchObject({ conditionTime: base + 3, subjectTime: base + 3 })
      expect(equalTimeOrder!.conditionCauseOrder).toBeLessThan(equalTimeOrder!.subjectOrder)
      const equalTimeCandidate = await reserveEvidence(
        fixture,
        equalityInvocation,
        command(equalityCondition),
        base + 10,
        1,
      )
      expect(equalTimeCandidate).toMatchObject({ type: "admitted" })
      if (equalTimeCandidate.type !== "admitted") throw new Error("Expected equal-time prior-source admission")
      expect(equalTimeCandidate.candidate.materialized.condition.timeSettled).toBe(base + 3)
      const equalTimeApplied = await settleReservedEvidence(
        fixture,
        equalityInvocation,
        {
          targetProof: await fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) =>
              MaterialMap.prepareEvidenceTargetProof(tx, {
                alignmentID: alignment.id,
                mapID: map.id,
                selectorID,
                course: course.endpoint,
              }),
            ),
          ),
          currentUse: (
            await fixture.runtime.runPromise(
              fixture.current.resolveSelector({
                mapID: map.id,
                selectorID,
                access: mapInput.access,
                budgets: materialBudgets(),
              }),
            )
          ).receipt,
        },
        base + 11,
        2,
      )
      expect(equalTimeApplied).toMatchObject({ settlement: { outcome: "applied", version: 0 } })

      const sameTurnSessionID = SessionSchema.ID.create()
      const sameTurnResponse = await admitLearnerTurn(fixture, {
        sessionID: sameTurnSessionID,
        createSession: true,
        text: "A later Assistant operation in this response Turn cannot become a prior disclosure.",
        time: base + 20,
        limits: { model: 1, tool: 1 },
      })
      const sameTurnInvocation = await prepareEvidenceInvocation(fixture, sameTurnResponse, base + 21)
      const sameTurnOrder = await fixture.runtime.runPromise(
        fixture.database.db.get<{ conditionCauseOrder: number; subjectOrder: number }>(sql`
            SELECT condition_cause.source_order AS conditionCauseOrder, subject.source_order AS subjectOrder
            FROM turn_model_operation AS operation
            JOIN learning_admitted_occurrence AS condition_cause
              ON condition_cause.id = operation.causal_occurrence_id
            JOIN learning_admitted_occurrence AS subject ON subject.id = ${sameTurnResponse.occurrenceID}
            WHERE operation.assistant_message_id = ${sameTurnInvocation.envelope.assistantMessageID}
        `),
      )
      expect(sameTurnOrder?.conditionCauseOrder).toBe(sameTurnOrder?.subjectOrder)
      const beforeSameTurn = await learnerEvidenceState(fixture)
      await rejectCondition(sameTurnInvocation, sameTurnInvocation.envelope.assistantMessageID, base + 30, 2)
      expect(await learnerEvidenceState(fixture)).toEqual(beforeSameTurn)

      const crossSessionResponse = await admitLearnerTurn(fixture, {
        sessionID: SessionSchema.ID.create(),
        createSession: true,
        text: "A condition from another LearnerHome Session is not my prior elicitation.",
        time: base + 40,
        limits: { model: 1, tool: 1 },
      })
      const crossSessionInvocation = await prepareEvidenceInvocation(fixture, crossSessionResponse, base + 41)
      const beforeCrossSession = await learnerEvidenceState(fixture)
      await rejectCondition(crossSessionInvocation, equalityCondition, base + 50, 3)
      expect(await learnerEvidenceState(fixture)).toEqual(beforeCrossSession)

      const fabricatedResponse = await admitLearnerTurn(fixture, {
        sessionID: SessionSchema.ID.create(),
        createSession: true,
        text: "A fabricated Assistant locator cannot become evidence provenance.",
        time: base + 60,
        limits: { model: 1, tool: 1 },
      })
      const fabricatedInvocation = await prepareEvidenceInvocation(fixture, fabricatedResponse, base + 61)
      const beforeFabricated = await learnerEvidenceState(fixture)
      await rejectCondition(fabricatedInvocation, SessionV1.MessageID.ascending(), base + 70, 4)
      expect(await learnerEvidenceState(fixture)).toEqual(beforeFabricated)

      const failedSessionID = SessionSchema.ID.create()
      const failedConditionTurn = await admitLearnerTurn(fixture, {
        sessionID: failedSessionID,
        createSession: true,
        text: "This model operation will fail before it can become a condition source.",
        time: base + 80,
        limits: { model: 1, tool: 0 },
      })
      const failedCondition = await failTeachingModel(fixture, failedConditionTurn, base + 81)
      const failedResponse = await admitLearnerTurn(fixture, {
        sessionID: failedSessionID,
        text: "A failed Assistant operation is not a completed prior condition.",
        time: base + 90,
        limits: { model: 1, tool: 1 },
      })
      const failedInvocation = await prepareEvidenceInvocation(fixture, failedResponse, base + 91)
      const beforeFailed = await learnerEvidenceState(fixture)
      await rejectCondition(failedInvocation, failedCondition, base + 100, 5)
      expect(await learnerEvidenceState(fixture)).toEqual(beforeFailed)
    } finally {
      await closeFixture(fixture)
    }
  })

  windowsTest("rejects valid-enum cross-record and cross-assessment effects at the SQL authority", async () => {
    const fixture = await prepareFixture()
    try {
      const mapInput = artifactMapInput(fixture)
      const map = await fixture.runtime.runPromise(fixture.maps.createMap(mapInput))
      const selectorID = mapInput.proposal.outline[1]!.selectors[0]!.id
      const course = await createCourseEndpoint(fixture)
      const alignment = await fixture.runtime.runPromise(
        fixture.maps.createAlignment(alignmentInput(map.id, selectorID, course.endpoint, mapInput.access)),
      )
      const base = Date.now() + 1_000
      const sessionID = SessionSchema.ID.create()
      const conditionTurn = await admitLearnerTurn(fixture, {
        sessionID,
        createSession: true,
        text: "State the exact semaphore proposition.",
        time: base,
        limits: { model: 1, tool: 0 },
      })
      const conditionAssistantMessageID = await completeTeachingModel(fixture, conditionTurn, base + 1)
      const createRecord = async (label: string, time: number) => {
        const turn = await admitLearnerTurn(fixture, {
          sessionID,
          text: `${label}: a semaphore bounds simultaneous entrants.`,
          time,
          limits: { model: 1, tool: 1 },
        })
        const invocation = await prepareEvidenceInvocation(fixture, turn, time + 1)
        const targetProof = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            MaterialMap.prepareEvidenceTargetProof(tx, {
              alignmentID: alignment.id,
              mapID: map.id,
              selectorID,
              course: course.endpoint,
            }),
          ),
        )
        const currentUse = await fixture.runtime.runPromise(
          fixture.current.resolveSelector({
            mapID: map.id,
            selectorID,
            access: mapInput.access,
            budgets: materialBudgets(),
          }),
        )
        const result = await commitEvidence(
          fixture,
          invocation,
          {
            operation: "create",
            relation: "supports",
            exposure: "tutor_disclosure_before_learner_response",
            conditionAssistantMessageID,
            target: {
              mapID: map.id,
              selectorID,
              courseID: course.endpoint.courseID,
              viewID: course.endpoint.viewID,
              revisionID: course.endpoint.revisionID,
              itemID: course.endpoint.itemID,
            },
            alignmentID: alignment.id,
          },
          { targetProof, currentUse: currentUse.receipt },
          time + 5,
          time - base,
        )
        if (result.type !== "settled" || result.settlement.outcome !== "applied") {
          throw new Error(`Expected ${label} record: ${JSON.stringify(result)}`)
        }
        await finishEvidenceTurn(fixture, turn, invocation, time + 7)
        return result.settlement
      }
      const recordA = await createRecord("record A", base + 10)
      const recordB = await createRecord("record B", base + 30)

      const retractTurn = await admitLearnerTurn(fixture, {
        sessionID: SessionSchema.ID.create(),
        createSession: true,
        text: "Retract record A only.",
        time: base + 50,
        limits: { model: 1, tool: 1 },
      })
      const retractInvocation = await prepareEvidenceInvocation(fixture, retractTurn, base + 51)
      const retract = await reserveEvidence(
        fixture,
        retractInvocation,
        { operation: "retract", recordID: recordA.recordID, expectedVersion: 0 },
        base + 55,
        50,
      )
      if (retract.type !== "admitted") throw new Error("Expected an admitted record-A retraction")
      const beforeCrossRecord = await learnerEvidenceState(fixture)
      const crossRecord = await attemptForgedEffect(
        fixture,
        retractInvocation,
        retract.candidate,
        recordB,
        { relation: recordB.relation, exposure: recordB.exposure },
        base + 56,
        51,
      )
      expect(Exit.isFailure(crossRecord)).toBeTrue()
      if (Exit.isFailure(crossRecord)) {
        expect(Cause.pretty(crossRecord.cause)).toContain("learner_response_evidence_revision_invalid_v19")
      }
      expect(await learnerEvidenceState(fixture)).toEqual(beforeCrossRecord)

      const revisionTurn = await admitLearnerTurn(fixture, {
        sessionID: SessionSchema.ID.create(),
        createSession: true,
        text: "Revise record A to the command's exact assessment only.",
        time: base + 70,
        limits: { model: 1, tool: 1 },
      })
      const revisionInvocation = await prepareEvidenceInvocation(fixture, revisionTurn, base + 71)
      const revision = await reserveEvidence(
        fixture,
        revisionInvocation,
        {
          operation: "revise_from_tutor_interpretation",
          recordID: recordA.recordID,
          expectedVersion: 0,
          relation: "supports",
          exposure: "tutor_disclosure_before_learner_response",
        },
        base + 75,
        70,
      )
      if (revision.type !== "admitted") throw new Error("Expected an admitted record-A Tutor revision")
      const beforeCrossAssessment = await learnerEvidenceState(fixture)
      const crossAssessment = await attemptForgedEffect(
        fixture,
        revisionInvocation,
        revision.candidate,
        recordA,
        { relation: "does_not_support", exposure: "tutor_disclosure_before_learner_response" },
        base + 76,
        71,
      )
      expect(Exit.isFailure(crossAssessment)).toBeTrue()
      if (Exit.isFailure(crossAssessment)) {
        expect(Cause.pretty(crossAssessment.cause)).toContain("learner_response_evidence_revision_invalid_v19")
      }
      expect(await learnerEvidenceState(fixture)).toEqual(beforeCrossAssessment)
    } finally {
      await closeFixture(fixture)
    }
  })

  windowsTest("keeps every learner-evidence table and the shared frontier unchanged across ordinary teaching", async () => {
    const fixture = await prepareFixture()
    try {
      const before = await learnerEvidenceState(fixture)
      const base = Date.now() + 1_000
      const sessionID = SessionSchema.ID.create()
      const explanation = await admitLearnerTurn(fixture, {
        sessionID,
        createSession: true,
        text: "Explain the semaphore example without assessing me.",
        time: base,
        limits: { model: 1, tool: 0 },
      })
      await completeTeachingModel(fixture, explanation, base + 1)

      const read = await fixture.runtime.runPromise(
        fixture.roots.read({
          contentRootID: fixture.root.id,
          relativePath: "source.txt",
          maxBytes: 1024,
        }),
      )
      expect(read.observation.result).toBe("present")

      const question = await admitLearnerTurn(fixture, {
        sessionID,
        text: "Does the bound count waiting tasks too?",
        time: base + 10,
        limits: { model: 1, tool: 0 },
      })
      await completeTeachingModel(fixture, question, base + 11)

      const adaptation = await admitLearnerTurn(fixture, {
        sessionID,
        text: "I am still confusing permits with queued waiters; adapt the explanation.",
        time: base + 20,
        limits: { model: 1, tool: 0 },
      })
      await completeTeachingModel(fixture, adaptation, base + 21)

      const toolTurn = await admitLearnerTurn(fixture, {
        sessionID,
        text: "Read the local source and continue; do not write learner evidence.",
        time: base + 30,
        limits: { model: 1, tool: 1 },
      })
      await completeOrdinaryTool(fixture, toolTurn, base + 31)
      expect(await learnerEvidenceState(fixture)).toEqual(before)
    } finally {
      await closeFixture(fixture)
    }
  })

  windowsTest(
    "preserves exact deleted sources and changes automatic pressure only through legal correction heads",
    async () => {
      const fixture = await prepareFixture()
      try {
        const mapInput = artifactMapInput(fixture)
        const map = await fixture.runtime.runPromise(fixture.maps.createMap(mapInput))
        const selectorID = mapInput.proposal.outline[1]!.selectors[0]!.id
        const course = await createCourseEndpoint(fixture)
        const alignment = await fixture.runtime.runPromise(
          fixture.maps.createAlignment(alignmentInput(map.id, selectorID, course.endpoint, mapInput.access)),
        )
        const duplicateAlignment = await fixture.runtime.runPromise(
          fixture.maps.createAlignment(alignmentInput(map.id, selectorID, course.endpoint, mapInput.access)),
        )
        const base = Date.now() + 1_000

        const sessionID = SessionSchema.ID.create()
        const conditionTurn = await admitLearnerTurn(fixture, {
          sessionID,
          createSession: true,
          text: "Can you explain semaphore bounds?",
          time: base,
          limits: { model: 1, tool: 0 },
        })
        const conditionAssistantMessageID = await completeTeachingModel(fixture, conditionTurn, base + 1)
        const responseTurn = await admitLearnerTurn(fixture, {
          sessionID,
          text: "A semaphore limits how many tasks can enter a protected region at once.",
          time: base + 10,
          limits: { model: 3, tool: 3 },
        })
        const creation = await prepareEvidenceInvocation(fixture, responseTurn, base + 11)
        const creationProof = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            MaterialMap.prepareEvidenceTargetProof(tx, {
              alignmentID: alignment.id,
              mapID: map.id,
              selectorID,
              course: course.endpoint,
            }),
          ),
        )
        const creationMaterial = await fixture.runtime.runPromise(
          fixture.current.resolveSelector({
            mapID: map.id,
            selectorID,
            access: mapInput.access,
            budgets: materialBudgets(),
          }),
        )
        const createCommand = {
          operation: "create",
          relation: "supports",
          exposure: "tutor_disclosure_before_learner_response",
          conditionAssistantMessageID,
          target: {
            mapID: map.id,
            selectorID,
            courseID: course.endpoint.courseID,
            viewID: course.endpoint.viewID,
            revisionID: course.endpoint.revisionID,
            itemID: course.endpoint.itemID,
          },
          alignmentID: alignment.id,
        } satisfies LearnerResponseEvidence.Command
        const created = await commitEvidence(
          fixture,
          creation,
          createCommand,
          { targetProof: creationProof, currentUse: creationMaterial.receipt },
          base + 15,
          1,
        )
        expect(created).toMatchObject({
          type: "settled",
          settlement: {
            outcome: "applied",
            version: 0,
            basis: "tutor_interpretation",
            disposition: "active",
          },
        })
        if (created.type !== "settled" || created.settlement.outcome !== "applied") {
          throw new Error("Expected learner-evidence creation")
        }
        const recordID = created.settlement.recordID
        const creationRevisionID = created.settlement.revisionID
        expect(
          await fixture.runtime.runPromise(
            fixture.database.db.get<{
              owner: string
              ownerReferenceID: string
              sourceTurnID: string
              sourceAssistantMessageID: string
              sourceTimeSettled: number
            }>(sql`
              SELECT owner, owner_reference_id AS ownerReferenceID,
                     source_turn_id AS sourceTurnID,
                     source_assistant_message_id AS sourceAssistantMessageID,
                     source_time_settled AS sourceTimeSettled
              FROM turn_model_source_retention
              WHERE owner = 'learner_response_evidence' AND owner_reference_id = ${recordID}
            `),
          ),
        ).toEqual({
          owner: "learner_response_evidence",
          ownerReferenceID: recordID,
          sourceTurnID: conditionTurn.turnID,
          sourceAssistantMessageID: conditionAssistantMessageID,
          sourceTimeSettled: base + 3,
        })
        expect(
          await fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) =>
              LearnerResponseEvidence.reserve(tx, {
                envelope: creation.envelope,
                command: createCommand,
                settlement: { time: base + 16, order: 2 },
              }),
            ),
          ),
        ).toMatchObject({ type: "replay", settlement: { outcome: "applied", revisionID: creationRevisionID } })
        await finishEvidenceTurn(fixture, responseTurn, creation, base + 16, false)

        const duplicate = await prepareEvidenceInvocation(fixture, responseTurn, base + 17)
        const duplicateResult = await commitEvidence(
          fixture,
          duplicate,
          { ...createCommand, alignmentID: duplicateAlignment.id },
          undefined,
          base + 21,
          2,
        )
        expect(duplicateResult).toMatchObject({
          type: "settled",
          settlement: { outcome: "already_applied", recordID, revisionID: creationRevisionID, version: 0 },
        })
        await finishEvidenceTurn(fixture, responseTurn, duplicate, base + 22, false)

        const conflict = await prepareEvidenceInvocation(fixture, responseTurn, base + 23)
        const conflictResult = await commitEvidence(
          fixture,
          conflict,
          { ...createCommand, relation: "does_not_support" },
          undefined,
          base + 27,
          3,
        )
        expect(conflictResult).toMatchObject({
          type: "settled",
          settlement: { outcome: "error", code: "semantic_conflict" },
        })
        await finishEvidenceTurn(fixture, responseTurn, conflict, base + 28)

        for (const invalid of [
          fixture.database.db.run(
            sql`UPDATE learner_response_evidence_revision SET basis = 'learner_report' WHERE id = ${creationRevisionID}`,
          ),
          fixture.database.db.run(
            sql`UPDATE learner_response_evidence_revision SET relation = 'inconclusive' WHERE id = ${creationRevisionID}`,
          ),
          fixture.database.db.run(
            sql`UPDATE learner_response_evidence_record SET condition_assistant_message_id = 'msg_tampered' WHERE id = ${recordID}`,
          ),
          fixture.database.db.run(
            sql`DELETE FROM learner_response_evidence_commit_seal WHERE revision_id = ${creationRevisionID}`,
          ),
        ]) {
          expect(Exit.isFailure(await fixture.runtime.runPromise(invalid.pipe(Effect.exit)))).toBeTrue()
        }

        const sourceRetractionTurn = await admitLearnerTurn(fixture, {
          sessionID,
          text: "Retract the current assessment while we inspect it.",
          time: base + 30,
          limits: { model: 1, tool: 1 },
        })
        const sourceRetraction = await prepareEvidenceInvocation(fixture, sourceRetractionTurn, base + 31)
        const sourceRetracted = await commitEvidence(
          fixture,
          sourceRetraction,
          { operation: "retract", recordID, expectedVersion: 0 },
          undefined,
          base + 35,
          4,
        )
        expect(sourceRetracted).toMatchObject({
          type: "settled",
          settlement: {
            outcome: "applied",
            version: 1,
            relation: "supports",
            basis: "tutor_interpretation",
            disposition: "retracted",
          },
        })
        await finishEvidenceTurn(fixture, sourceRetractionTurn, sourceRetraction, base + 37)

        const tutorReactivationTurn = await admitLearnerTurn(fixture, {
          sessionID,
          text: "Re-evaluate the same still-readable response against the same exact selector.",
          time: base + 40,
          limits: { model: 1, tool: 1 },
        })
        const tutorReactivation = await prepareEvidenceInvocation(fixture, tutorReactivationTurn, base + 41)
        const tutorReactivated = await commitEvidence(
          fixture,
          tutorReactivation,
          {
            operation: "revise_from_tutor_interpretation",
            recordID,
            expectedVersion: 1,
            relation: "does_not_support",
            exposure: "tutor_disclosure_before_learner_response",
          },
          undefined,
          base + 45,
          6,
        )
        expect(tutorReactivated).toMatchObject({
          type: "settled",
          settlement: {
            outcome: "applied",
            version: 2,
            relation: "does_not_support",
            basis: "tutor_interpretation",
            disposition: "active",
          },
        })
        await finishEvidenceTurn(fixture, tutorReactivationTurn, tutorReactivation, base + 47)

        const beforeReadableOwnerRead = await learnerEvidenceState(fixture)
        const readable = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            LearnerResponseEvidence.read(tx, { type: "record", recordID }),
          ),
        )
        expect(readable.items).toHaveLength(1)
        expect(readable.items[0]).toMatchObject({
          availability: {
            subject: { state: "available" },
            condition: { state: "available" },
            basis: { state: "available" },
          },
        })
        expect(await learnerEvidenceState(fixture)).toEqual(beforeReadableOwnerRead)
        expect(
          await fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) =>
              LearnerResponseEvidence.listContextRequirements(tx, { endpoints: [course.endpoint] }),
            ),
          ),
        ).toEqual([])

        const sourceReadableAdmissionSeal = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) => LearningFrontier.read(tx)),
        )
        await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            TurnLifecycle.deleteSessionTree(tx, {
              rootSessionID: sessionID,
              sessionIDs: [sessionID],
              timeDeleted: base + 50,
            }),
          ),
        )
        const sourceDeletedAdmissionSeal = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) => LearningFrontier.read(tx)),
        )
        expect(sourceDeletedAdmissionSeal).toEqual({
          sequence: sourceReadableAdmissionSeal.sequence + 1,
          time: base + 50,
        })
        const deleted = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            LearnerResponseEvidence.read(tx, { type: "record", recordID }),
          ),
        )
        expect(deleted.items[0]).toMatchObject({
          record: {
            id: recordID,
            current: { relation: "does_not_support", basis: "tutor_interpretation", disposition: "active" },
          },
          availability: {
            subject: { state: "source_unavailable", reason: "source_deleted" },
            condition: { state: "source_unavailable", reason: "source_deleted" },
            basis: { state: "source_unavailable", reason: "source_deleted" },
          },
        })
        expect(
          await fixture.runtime.runPromise(
            fixture.database.db.all(sql`
              SELECT
                (SELECT count(*) FROM message WHERE session_id = ${sessionID}) AS messages,
                (SELECT count(*) FROM part WHERE session_id = ${sessionID}) AS parts,
                (SELECT count(*) FROM turn WHERE session_id = ${sessionID}) AS turns,
                (SELECT count(*) FROM turn_unavailable_source WHERE session_id = ${sessionID}) AS unavailableTurns,
                (SELECT count(*) FROM turn_unavailable_model WHERE assistant_message_id = ${conditionAssistantMessageID}) AS unavailableConditions
            `),
          ),
        ).toEqual([{ messages: 0, parts: 0, turns: 0, unavailableTurns: 4, unavailableConditions: 1 }])
        expect(
          await fixture.runtime.runPromise(
            fixture.database.db.get<{
              owner: string
              ownerReferenceID: string
              unavailableAssistantMessageID: string
              sourceTimeSettled: number
            }>(sql`
              SELECT retention.owner, retention.owner_reference_id AS ownerReferenceID,
                     unavailable.assistant_message_id AS unavailableAssistantMessageID,
                     retention.source_time_settled AS sourceTimeSettled
              FROM turn_model_source_retention AS retention
              JOIN turn_unavailable_model AS unavailable
                ON unavailable.assistant_message_id = retention.source_assistant_message_id
              WHERE retention.owner = 'learner_response_evidence'
                AND retention.owner_reference_id = ${recordID}
            `),
          ),
        ).toEqual({
          owner: "learner_response_evidence",
          ownerReferenceID: recordID,
          unavailableAssistantMessageID: conditionAssistantMessageID,
          sourceTimeSettled: base + 3,
        })

        const requirements = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            LearnerResponseEvidence.listContextRequirements(tx, { endpoints: [course.endpoint] }),
          ),
        )
        expect(requirements).toEqual([{ mapID: map.id, selectorID }])
        const contextMaterial = await fixture.runtime.runPromise(
          fixture.current.resolveSelector({
            mapID: map.id,
            selectorID,
            access: mapInput.access,
            budgets: materialBudgets(),
          }),
        )
        const projected = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            LearnerResponseEvidence.projectLearningContext(tx, {
              endpoints: [course.endpoint],
              materials: [
                {
                  mapID: map.id,
                  selectorID,
                  state: "available",
                  receipt: contextMaterial.receipt,
                  byteLength: contextMaterial.bytes.byteLength,
                },
              ],
              lazyReadAvailable: true,
            }),
          ),
        )
        expect(projected).toMatchObject({
          countAtCut: 1,
          entries: [
            {
              semantic: {
                assessmentScope: "entire_exact_selector",
                relation: "does_not_support",
                basis: "tutor_interpretation",
                sourceAvailability: {
                  subject: "source_deleted",
                  condition: "source_deleted",
                  basis: "source_deleted",
                },
                nonImplications: [
                  "mastery",
                  "understanding",
                  "retention",
                  "correctness_beyond_this_selector_bound_occurrence",
                  "required_next_action",
                ],
              },
            },
          ],
        })
        expect(
          await fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) =>
              LearnerResponseEvidence.projectLearningContext(tx, {
                endpoints: [course.endpoint],
                materials: [{ mapID: map.id, selectorID, state: "unavailable" }],
                lazyReadAvailable: true,
              }),
            ),
          ),
        ).toEqual({ countAtCut: 0, entries: [] })
        const contextOperationAssistantMessageID = SessionV1.MessageID.ascending()
        const contextFrontier = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) => LearningFrontier.read(tx)),
        )
        const learningCut = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            LearningContext.prepareCut(tx, {
              operation: {
                sessionID: SessionSchema.ID.create(),
                turnID: Turn.ID.create(),
                inputID: Turn.InputID.create(),
                assistantMessageID: contextOperationAssistantMessageID,
                ordinal: 0,
              },
              retainedSteering: {
                assistantMessageID: contextOperationAssistantMessageID,
                cutAsOf: base + 51,
                throughSharedFrontier: contextFrontier,
                fingerprint: fingerprint("gate19-context-retained"),
              } as unknown as Parameters<typeof LearningContext.prepareCut>[1]["retainedSteering"],
              capabilityBasis: {
                ...LearningContext.unavailableCapabilityBasis(),
                policyFingerprint: fingerprint("gate19-automatic-context-enabled"),
                effectiveAutomaticContext: true,
              },
              learnerResponseEvidenceMaterials: [
                {
                  mapID: map.id,
                  selectorID,
                  state: "available",
                  receipt: contextMaterial.receipt,
                  byteLength: contextMaterial.bytes.byteLength,
                },
              ],
            }),
          ),
        )
        const evidenceSection = learningCut.cut.sections.find(
          (section) => section.owner === "learner_response_evidence",
        )
        expect(evidenceSection).toMatchObject({ coverage: "complete", countAtCut: 1 })
        expect(evidenceSection?.entries).toHaveLength(1)
        expect(learningCut.renderedBlock).toContain("learner_response_evidence")
        expect(learningCut.renderedBlock).toContain("correctness_beyond_this_selector_bound_occurrence")
        expect(learningCut.renderedBlock).not.toContain(new TextDecoder().decode(fixture.bytes))
        expect(learningCut.renderedBlock).not.toContain(
          "A semaphore limits how many tasks can enter a protected region at once.",
        )
        const durableProjection = JSON.stringify(
          await fixture.runtime.runPromise(
            fixture.database.db.all(sql`
              SELECT canonical_command, materialized_candidate FROM learner_response_evidence_disposition
              UNION ALL
              SELECT relation, exposure FROM learner_response_evidence_revision
            `),
          ),
        )
        expect(durableProjection).not.toContain(new TextDecoder().decode(fixture.bytes))
        expect(durableProjection).not.toContain(
          "A semaphore limits how many tasks can enter a protected region at once.",
        )

        const unavailableTutorSessionID = SessionSchema.ID.create()
        const unavailableTutorTurn = await admitLearnerTurn(fixture, {
          sessionID: unavailableTutorSessionID,
          createSession: true,
          text: "Try to reinterpret the deleted original response as Tutor observation.",
          time: base + 60,
          limits: { model: 1, tool: 1 },
        })
        const unavailableTutor = await prepareEvidenceInvocation(fixture, unavailableTutorTurn, base + 61)
        const unavailableTutorResult = await commitEvidence(
          fixture,
          unavailableTutor,
          {
            operation: "revise_from_tutor_interpretation",
            recordID,
            expectedVersion: 2,
            relation: "supports",
            exposure: "tutor_disclosure_before_learner_response",
          },
          undefined,
          base + 65,
          8,
        )
        expect(unavailableTutorResult).toMatchObject({
          type: "settled",
          settlement: { outcome: "error", code: "source_unavailable" },
        })
        await finishEvidenceTurn(fixture, unavailableTutorTurn, unavailableTutor, base + 67)
        expect(
          await fixture.runtime.runPromise(
            fixture.database.db.get<{ count: number }>(sql`
              SELECT count(*) AS count FROM learner_response_evidence_revision WHERE record_id = ${recordID}
            `),
          ),
        ).toEqual({ count: 3 })

        const correctionSessionID = SessionSchema.ID.create()
        const correctionTurn = await admitLearnerTurn(fixture, {
          sessionID: correctionSessionID,
          createSession: true,
          text: "Correction: for this exact selector, my answer does support the stated concurrency bound.",
          time: base + 70,
          limits: { model: 1, tool: 1 },
        })
        const correction = await prepareEvidenceInvocation(fixture, correctionTurn, base + 71)
        const staleCorrectionSessionID = SessionSchema.ID.create()
        const staleCorrectionTurn = await admitLearnerTurn(fixture, {
          sessionID: staleCorrectionSessionID,
          createSession: true,
          text: "A competing correction claims the response still does not support the exact selector.",
          time: base + 72,
          limits: { model: 1, tool: 1 },
        })
        const staleCorrection = await prepareEvidenceInvocation(fixture, staleCorrectionTurn, base + 73)
        const correctionCommand = {
          operation: "revise_from_learner_report",
          recordID,
          expectedVersion: 2,
          relation: "supports",
          exposure: "tutor_disclosure_before_learner_response",
        } satisfies LearnerResponseEvidence.Command
        const staleCorrectionCommand = {
          ...correctionCommand,
          relation: "does_not_support" as const,
        }
        expect(await reserveEvidence(fixture, correction, correctionCommand, base + 75, 9)).toMatchObject({
          type: "admitted",
        })
        expect(
          await reserveEvidence(fixture, staleCorrection, staleCorrectionCommand, base + 76, 10),
        ).toMatchObject({ type: "admitted" })
        const corrected = await settleReservedEvidence(fixture, correction, undefined, base + 77, 11)
        expect(corrected).toMatchObject({
          type: "settled",
          settlement: {
            outcome: "applied",
            version: 3,
            relation: "supports",
            basis: "learner_report",
            disposition: "active",
          },
        })
        if (corrected.type !== "settled" || corrected.settlement.outcome !== "applied") {
          throw new Error("Expected learner-report correction")
        }
        const staleCorrectionResult = await settleReservedEvidence(
          fixture,
          staleCorrection,
          undefined,
          base + 78,
          12,
        )
        expect(staleCorrectionResult).toMatchObject({
          type: "settled",
          settlement: {
            outcome: "error",
            code: "stale",
            detail: { recordID, version: 3 },
          },
        })
        await finishEvidenceTurn(fixture, correctionTurn, correction, base + 79)
        await finishEvidenceTurn(fixture, staleCorrectionTurn, staleCorrection, base + 80)
        expect(
          await fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) =>
              LearnerResponseEvidence.listContextRequirements(tx, { endpoints: [course.endpoint] }),
            ),
          ),
        ).toEqual([])

        await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            TurnLifecycle.deleteSessionTree(tx, {
              rootSessionID: correctionSessionID,
              sessionIDs: [correctionSessionID],
              timeDeleted: base + 85,
            }),
          ),
        )
        expect(
          await fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) =>
              LearnerResponseEvidence.listContextRequirements(tx, { endpoints: [course.endpoint] }),
            ),
          ),
        ).toEqual([{ mapID: map.id, selectorID }])
        await fixture.runtime.runPromise(
          fixture.maps.withdrawAlignment({
            alignmentID: alignment.id,
            expectedVersion: 0,
            reason: "Gate 19 current-target ablation",
          }),
        )
        expect(
          await fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) =>
              LearnerResponseEvidence.listContextRequirements(tx, { endpoints: [course.endpoint] }),
            ),
          ),
        ).toEqual([])
        const withdrawnRead = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            LearnerResponseEvidence.read(tx, { type: "record", recordID }),
          ),
        )
        expect(withdrawnRead.items[0]).toMatchObject({ targetRelation: { alignment: "withdrawn" } })
        await fixture.runtime.runPromise(
          fixture.maps.restoreAlignment({ alignmentID: alignment.id, expectedVersion: 1 }),
        )
        expect(
          await fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) =>
              LearnerResponseEvidence.listContextRequirements(tx, { endpoints: [course.endpoint] }),
            ),
          ),
        ).toEqual([{ mapID: map.id, selectorID }])
        const beforeHistoryReads = await learnerEvidenceState(fixture)
        const history = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            LearnerResponseEvidence.read(tx, { type: "history", recordID }),
          ),
        )
        expect(history.items).toMatchObject([
          { version: 0, basis: "tutor_interpretation", operation: "create" },
          { version: 1, basis: "tutor_interpretation", operation: "retract", disposition: "retracted" },
          {
            version: 2,
            basis: "tutor_interpretation",
            operation: "revise_from_tutor_interpretation",
            disposition: "active",
          },
          { version: 3, basis: "learner_report", operation: "revise_from_learner_report" },
        ])
        const firstHistoryPage = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            LearnerResponseEvidence.read(tx, { type: "history", recordID }, { limit: 2 }),
          ),
        )
        expect(firstHistoryPage).toMatchObject({ countAtRead: 4, truncated: true })
        expect(firstHistoryPage.items).toMatchObject([{ version: 0 }, { version: 1 }])
        if (!firstHistoryPage.cursor) throw new Error("Expected exact history cursor")
        const secondHistoryPage = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            LearnerResponseEvidence.read(
              tx,
              { type: "history", recordID },
              { limit: 2, cursor: firstHistoryPage.cursor! },
            ),
          ),
        )
        expect(secondHistoryPage).toMatchObject({ countAtRead: 4, truncated: false })
        expect(secondHistoryPage.items).toMatchObject([{ version: 2 }, { version: 3 }])
        expect(
          Exit.isFailure(
            await fixture.runtime.runPromise(
              fixture.database.db
                .transaction((tx) =>
                  LearnerResponseEvidence.read(
                    tx,
                    { type: "selector", mapID: map.id, selectorID },
                    { cursor: firstHistoryPage.cursor! },
                  ),
                )
                .pipe(Effect.exit),
            ),
          ),
        ).toBeTrue()
        expect(await learnerEvidenceState(fixture)).toEqual(beforeHistoryReads)
        expect(
          Exit.isFailure(
            await fixture.runtime.runPromise(
              fixture.database.db
                .transaction((tx) =>
                  LearnerResponseEvidence.read(tx, { type: "history", recordID }, { limit: 65 }),
                )
                .pipe(Effect.exit),
            ),
          ),
        ).toBeTrue()

        const retractionSessionID = SessionSchema.ID.create()
        const retractionTurn = await admitLearnerTurn(fixture, {
          sessionID: retractionSessionID,
          createSession: true,
          text: "Please retract that learner report.",
          time: base + 90,
          limits: { model: 1, tool: 1 },
        })
        const retraction = await prepareEvidenceInvocation(fixture, retractionTurn, base + 91)
        const retracted = await commitEvidence(
          fixture,
          retraction,
          {
            operation: "retract",
            recordID,
            expectedVersion: 3,
          },
          undefined,
          base + 95,
          13,
        )
        expect(retracted).toMatchObject({
          type: "settled",
          settlement: {
            outcome: "applied",
            version: 4,
            relation: "supports",
            basis: "learner_report",
            disposition: "retracted",
          },
        })
        await finishEvidenceTurn(fixture, retractionTurn, retraction, base + 97)
        expect(
          await fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) =>
              LearnerResponseEvidence.listContextRequirements(tx, { endpoints: [course.endpoint] }),
            ),
          ),
        ).toEqual([])

        const learnerReactivationSessionID = SessionSchema.ID.create()
        const learnerReactivationTurn = await admitLearnerTurn(fixture, {
          sessionID: learnerReactivationSessionID,
          createSession: true,
          text: "My corrected report is that the response still omits the release rule.",
          time: base + 100,
          limits: { model: 1, tool: 1 },
        })
        const learnerReactivation = await prepareEvidenceInvocation(fixture, learnerReactivationTurn, base + 101)
        const learnerReactivated = await commitEvidence(
          fixture,
          learnerReactivation,
          {
            operation: "revise_from_learner_report",
            recordID,
            expectedVersion: 4,
            relation: "does_not_support",
            exposure: "tutor_disclosure_before_learner_response",
          },
          undefined,
          base + 105,
          15,
        )
        expect(learnerReactivated).toMatchObject({
          type: "settled",
          settlement: {
            outcome: "applied",
            version: 5,
            relation: "does_not_support",
            basis: "learner_report",
            disposition: "active",
          },
        })
        await finishEvidenceTurn(fixture, learnerReactivationTurn, learnerReactivation, base + 107)
        expect(
          await fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) =>
              LearnerResponseEvidence.listContextRequirements(tx, { endpoints: [course.endpoint] }),
            ),
          ),
        ).toEqual([])
        await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            TurnLifecycle.deleteSessionTree(tx, {
              rootSessionID: learnerReactivationSessionID,
              sessionIDs: [learnerReactivationSessionID],
              timeDeleted: base + 110,
            }),
          ),
        )
        expect(
          await fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) =>
              LearnerResponseEvidence.listContextRequirements(tx, { endpoints: [course.endpoint] }),
            ),
          ),
        ).toEqual([{ mapID: map.id, selectorID }])
        const finalHistory = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            LearnerResponseEvidence.read(tx, { type: "history", recordID }),
          ),
        )
        expect(finalHistory.items.slice(-2)).toMatchObject([
          { version: 4, operation: "retract", basis: "learner_report", disposition: "retracted" },
          {
            version: 5,
            operation: "revise_from_learner_report",
            basis: "learner_report",
            disposition: "active",
          },
        ])
        const superseding = await fixture.runtime.runPromise(
          fixture.courses.createView({
            courseID: course.endpoint.courseID,
            name: "Superseding route with a duplicate title",
            expectedCourseVersion: 0,
            authorship: Course.Authorship.learnerAuthored(),
            revision: { items: [{ key: "duplicate", title: "Explain semaphore concurrency bounds" }] },
          }),
        )
        await fixture.runtime.runPromise(
          fixture.courses.select({
            courseID: course.endpoint.courseID,
            revisionID: superseding.revision.id,
            expectedCourseVersion: 0,
            expectedSelectionRevisionID: course.endpoint.revisionID,
            expectedSelectionVersion: 1,
            expectedViewVersion: 0,
            expectedRevisionVersion: 0,
          }),
        )
        await fixture.runtime.runPromise(
          fixture.courses.withdrawRevision({
            courseID: course.endpoint.courseID,
            viewID: course.endpoint.viewID,
            revisionID: course.endpoint.revisionID,
            expectedCourseVersion: 0,
            expectedViewVersion: 0,
            expectedRevisionVersion: 0,
            expectedSelectionRevisionID: superseding.revision.id,
            expectedSelectionVersion: 2,
            selection: { type: "unchanged" },
          }),
        )
        expect(
          await fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) =>
              LearnerResponseEvidence.listContextRequirements(tx, { endpoints: [course.endpoint] }),
            ),
          ),
        ).toEqual([])
        const superseded = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) => LearnerResponseEvidence.read(tx, { type: "record", recordID })),
        )
        expect(superseded.items[0]).toMatchObject({
          record: {
            target: {
              courseID: course.endpoint.courseID,
              viewID: course.endpoint.viewID,
              revisionID: course.endpoint.revisionID,
              itemID: course.endpoint.itemID,
            },
          },
          targetRelation: { course: "unavailable" },
        })
      } finally {
        await closeFixture(fixture)
      }
    },
  )

  windowsTest(
    "keeps automatic context and owner reads truthful at zero, one, eight, nine, and more than sixty-four heads",
    async () => {
      const fixture = await prepareFixture()
      try {
        const mapInput = artifactMapInput(fixture)
        const map = await fixture.runtime.runPromise(fixture.maps.createMap(mapInput))
        const selectorID = mapInput.proposal.outline[1]!.selectors[0]!.id
        const course = await createCourseEndpoints(fixture, 4)
        const alignments: { readonly id: MaterialMap.AlignmentID }[] = []
        for (const endpoint of course.endpoints) {
          alignments.push(
            await fixture.runtime.runPromise(
              fixture.maps.createAlignment(alignmentInput(map.id, selectorID, endpoint, mapInput.access)),
            ),
          )
        }
        const records: LearnerResponseEvidence.RecordID[] = []
        const base = Date.now() + 1_000
        const sessionID = SessionSchema.ID.create()
        const conditionTurn = await admitLearnerTurn(fixture, {
          sessionID,
          createSession: true,
          text: "Elicit the exact selector response shared by the scale fixture",
          time: base,
          limits: { model: 1, tool: 0 },
        })
        const conditionAssistantMessageID = await completeTeachingModel(fixture, conditionTurn, base + 1)

        for (let index = 0; index < 65; index++) {
          const time = base + 10 + index * 100
          const endpointIndex = index === 0 ? 0 : index < 8 ? 1 : index === 8 ? 2 : 3
          const endpoint = course.endpoints[endpointIndex]!
          const responseTurn = await admitLearnerTurn(fixture, {
            sessionID,
            text: `Learner response ${index} is source-linked but not a mastery claim.`,
            time,
            limits: { model: 1, tool: 1 },
          })
          const invocation = await prepareEvidenceInvocation(fixture, responseTurn, time + 1)
          const targetProof = await fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) =>
              MaterialMap.prepareEvidenceTargetProof(tx, {
                alignmentID: alignments[endpointIndex]!.id,
                mapID: map.id,
                selectorID,
                course: endpoint,
              }),
            ),
          )
          const currentMaterial = await fixture.runtime.runPromise(
            fixture.current.resolveSelector({
              mapID: map.id,
              selectorID,
              access: mapInput.access,
              budgets: materialBudgets(),
            }),
          )
          const result = await commitEvidence(
            fixture,
            invocation,
            {
              operation: "create",
              relation: index % 2 === 0 ? "supports" : "does_not_support",
              exposure: "tutor_disclosure_before_learner_response",
              conditionAssistantMessageID,
              target: {
                mapID: map.id,
                selectorID,
                courseID: endpoint.courseID,
                viewID: endpoint.viewID,
                revisionID: endpoint.revisionID,
                itemID: endpoint.itemID,
              },
              alignmentID: alignments[endpointIndex]!.id,
            },
            { targetProof, currentUse: currentMaterial.receipt },
            time + 5,
            index * 2 + 1,
          )
          if (result.type !== "settled" || result.settlement.outcome !== "applied") {
            throw new Error(`Expected Gate 19 scale record ${index}: ${JSON.stringify(result)}`)
          }
          records.push(result.settlement.recordID)
          await finishEvidenceTurn(fixture, responseTurn, invocation, time + 8)
        }

        const material = await fixture.runtime.runPromise(
          fixture.current.resolveSelector({
            mapID: map.id,
            selectorID,
            access: mapInput.access,
            budgets: materialBudgets(),
          }),
        )
        const materialResolution = {
          mapID: map.id,
          selectorID,
          state: "available" as const,
          receipt: material.receipt,
          byteLength: material.bytes.byteLength,
        }

        const project = (endpointCount: number) =>
          fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) =>
              LearnerResponseEvidence.projectLearningContext(tx, {
                endpoints: course.endpoints.slice(0, endpointCount),
                materials: [materialResolution],
                lazyReadAvailable: true,
              }),
            ),
          )
        expect(await project(4)).toEqual({ countAtCut: 0, entries: [] })

        await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            TurnLifecycle.deleteSessionTree(tx, {
              rootSessionID: sessionID,
              sessionIDs: [sessionID],
              timeDeleted: base + 6_700,
            }),
          ),
        )
        expect(await project(1)).toMatchObject({ countAtCut: 1, entries: [{ locator: { recordID: records[0] } }] })
        const eight = await project(2)
        expect(eight.countAtCut).toBe(8)
        expect(eight.entries.map((entry) => entry.locator.recordID)).toEqual(records.slice(0, 8))
        const nine = await project(3)
        expect(nine.countAtCut).toBe(9)
        expect(nine.entries).toHaveLength(8)
        expect(nine.entries.map((entry) => entry.locator.recordID)).toEqual(records.slice(0, 8))
        const sixtyFive = await project(4)
        expect(sixtyFive.countAtCut).toBe(65)
        expect(sixtyFive.entries).toHaveLength(8)
        expect(sixtyFive.entries.map((entry) => entry.locator.recordID)).toEqual(records.slice(0, 8))

        const operationAssistantMessageID = SessionV1.MessageID.ascending()
        const frontier = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) => LearningFrontier.read(tx)),
        )
        const cut = await fixture.runtime.runPromise(
          fixture.database.db.transaction((tx) =>
            LearningContext.prepareCut(tx, {
              operation: {
                sessionID: SessionSchema.ID.create(),
                turnID: Turn.ID.create(),
                inputID: Turn.InputID.create(),
                assistantMessageID: operationAssistantMessageID,
                ordinal: 0,
              },
              retainedSteering: {
                assistantMessageID: operationAssistantMessageID,
                cutAsOf: base + 8_000,
                throughSharedFrontier: frontier,
                fingerprint: fingerprint("gate19-scale-retained"),
              } as unknown as Parameters<typeof LearningContext.prepareCut>[1]["retainedSteering"],
              capabilityBasis: {
                ...LearningContext.unavailableCapabilityBasis(),
                policyFingerprint: fingerprint("gate19-scale-automatic-context"),
                effectiveAutomaticContext: true,
              },
              learnerResponseEvidenceMaterials: [materialResolution],
            }),
          ),
        )
        const section = cut.cut.sections.find((item) => item.owner === "learner_response_evidence")
        expect(section).toMatchObject({
          coverage: "truncated",
          countAtCut: 65,
          omission: {
            type: "exact",
            omitted: 64,
            reasons: [
              { reason: "candidate_limit", omitted: 57 },
              { reason: "gate18_byte_budget", omitted: 7 },
            ],
          },
        })
        expect(section?.entries).toHaveLength(1)
        expect(cut.renderedBlock).not.toContain("Learner response 0")
        expect(cut.renderedBlock).not.toContain(new TextDecoder().decode(fixture.bytes))

        const beforeOwnerPages = await learnerEvidenceState(fixture)
        const readIDs: LearnerResponseEvidence.RecordID[] = []
        let cursor: string | undefined
        do {
          const page = await fixture.runtime.runPromise(
            fixture.database.db.transaction((tx) =>
              LearnerResponseEvidence.read(
                tx,
                { type: "selector", mapID: map.id, selectorID },
                { limit: 64, ...(cursor ? { cursor } : {}) },
              ),
            ),
          )
          expect(page.countAtRead).toBe(65)
          expect(page.items.length).toBeLessThanOrEqual(64)
          expect(page.canonicalBytes).toBeLessThanOrEqual(LearnerResponseEvidence.MAX_READ_BYTES)
          readIDs.push(...page.items.flatMap((item) => ("record" in item ? [item.record.id] : [])))
          cursor = page.cursor ?? undefined
        } while (cursor)
        expect(readIDs).toEqual(records)
        expect(new Set(readIDs).size).toBe(65)
        expect(await learnerEvidenceState(fixture)).toEqual(beforeOwnerPages)
      } finally {
        await closeFixture(fixture)
      }
    },
    120_000,
  )
})

async function admitLearnerTurn(
  fixture: Fixture,
  input: {
    readonly sessionID: SessionSchema.ID
    readonly createSession?: boolean
    readonly text: string
    readonly time: number
    readonly limits: Turn.Limits
  },
) {
  const turnID = Turn.ID.create()
  const inputID = Turn.InputID.create()
  const messageID = SessionV1.MessageID.ascending()
  const partID = SessionV1.PartID.ascending()
  const occurrence = await fixture.runtime.runPromise(
    fixture.database.db.transaction((tx) =>
      Effect.gen(function* () {
        if (input.createSession) {
          yield* tx.run(sql`
            INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
            VALUES (
              ${input.sessionID}, ${ProjectV2.ID.global}, ${input.sessionID}, '/',
              'Learner evidence fixture', 'test', ${input.time}, ${input.time}
            )
          `)
        }
        yield* insertUserMessage(tx, input.sessionID, messageID, partID, input.time, input.text)
        const admitted = yield* Occurrence.admit(tx, {
          admission: LearnerAdmission.interactive({ timeZone: "UTC" }),
          sessionID: input.sessionID,
          messageID,
          timeAdmitted: input.time,
        })
        yield* TurnLifecycle.admit(tx, {
          kind: "learner",
          turnID,
          sessionID: input.sessionID,
          inputID,
          messageID,
          occurrenceID: admitted.id,
          limits: input.limits,
          envelope: { kind: "learner", text: input.text },
          policyBasis: { source: "gate19-test" },
          timeAdmitted: input.time,
        })
        return admitted
      }),
    ),
  )
  return { sessionID: input.sessionID, turnID, inputID, messageID, occurrenceID: occurrence.id }
}

async function completeTeachingModel(fixture: Fixture, turn: LearnerTurn, time: number) {
  const assistantMessageID = await insertAssistantMessage(fixture, turn, time)
  await fixture.runtime.runPromise(
    fixture.database.db.transaction((tx) =>
      Effect.gen(function* () {
        yield* admitModelWithLearningContext(tx, {
          turnID: turn.turnID,
          sessionID: turn.sessionID,
          assistantMessageID,
          requestEnvelope: { prompt: "exact Tutor disclosure" },
          contextFingerprint: fingerprint("condition"),
          snapshotFrontier: yield* LearningFrontier.read(tx),
          timeAdmitted: time,
          learningContextBasis: LearningContext.unavailableCapabilityBasis(),
        })
        yield* TurnLifecycle.sealCandidateSet(tx, {
          turnID: turn.turnID,
          sessionID: turn.sessionID,
          assistantMessageID,
          candidates: [],
          timeSealed: time + 1,
        })
        yield* TurnLifecycle.settleModel(tx, {
          turnID: turn.turnID,
          assistantMessageID,
          state: "completed",
          time: time + 2,
        })
        yield* TurnLifecycle.settle(tx, {
          turnID: turn.turnID,
          outcome: "completed",
          reason: "normal",
          time: time + 3,
        })
      }),
    ),
  )
  return assistantMessageID
}

async function failTeachingModel(fixture: Fixture, turn: LearnerTurn, time: number) {
  const assistantMessageID = await insertAssistantMessage(fixture, turn, time)
  await fixture.runtime.runPromise(
    fixture.database.db.transaction((tx) =>
      Effect.gen(function* () {
        yield* admitModelWithLearningContext(tx, {
          turnID: turn.turnID,
          sessionID: turn.sessionID,
          assistantMessageID,
          requestEnvelope: { prompt: "failed condition source" },
          contextFingerprint: fingerprint("failed-condition"),
          snapshotFrontier: yield* LearningFrontier.read(tx),
          timeAdmitted: time,
          learningContextBasis: LearningContext.unavailableCapabilityBasis(),
        })
        yield* TurnLifecycle.sealCandidateSet(tx, {
          turnID: turn.turnID,
          sessionID: turn.sessionID,
          assistantMessageID,
          candidates: [],
          timeSealed: time + 1,
        })
        yield* TurnLifecycle.settleModel(tx, {
          turnID: turn.turnID,
          assistantMessageID,
          state: "failed",
          time: time + 2,
        })
        yield* TurnLifecycle.settle(tx, {
          turnID: turn.turnID,
          outcome: "failed",
          reason: "provider_failure",
          time: time + 3,
        })
      }),
    ),
  )
  return assistantMessageID
}

async function prepareEvidenceInvocation(fixture: Fixture, turn: LearnerTurn, time: number) {
  const assistantMessageID = await insertAssistantMessage(fixture, turn, time)
  const partID = SessionV1.PartID.ascending()
  const callID = `call-learner-evidence-${partID}`
  const envelope = { callID, tool: LearnerResponseEvidence.UPDATE_CAPABILITY, input: {} }
  await fixture.runtime.runPromise(
    fixture.database.db.transaction((tx) =>
      Effect.gen(function* () {
        yield* admitModelWithLearningContext(tx, {
          turnID: turn.turnID,
          sessionID: turn.sessionID,
          assistantMessageID,
          requestEnvelope: { prompt: "learner evidence operation" },
          contextFingerprint: fingerprint(`evidence:${partID}`),
          snapshotFrontier: yield* LearningFrontier.read(tx),
          timeAdmitted: time,
          learningContextBasis: LearningContext.unavailableCapabilityBasis(),
        })
        yield* tx.run(sql`
          INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
          VALUES (
            ${partID}, ${assistantMessageID}, ${turn.sessionID}, ${time + 1}, ${time + 1},
            ${JSON.stringify({
              type: "tool",
              callID,
              tool: LearnerResponseEvidence.UPDATE_CAPABILITY,
              state: { status: "pending", input: {}, raw: "" },
            })}
          )
        `)
        yield* TurnLifecycle.sealCandidateSet(tx, {
          turnID: turn.turnID,
          sessionID: turn.sessionID,
          assistantMessageID,
          candidates: [{ partID, callID, tool: LearnerResponseEvidence.UPDATE_CAPABILITY, envelope }],
          timeSealed: time + 1,
        })
        yield* TurnLifecycle.settleModel(tx, {
          turnID: turn.turnID,
          assistantMessageID,
          state: "completed",
          time: time + 2,
        })
        yield* TurnLifecycle.admitTool(tx, {
          turnID: turn.turnID,
          sessionID: turn.sessionID,
          assistantMessageID,
          partID,
          timeAdmitted: time + 3,
        })
      }),
    ),
  )
  return {
    partID,
    envelope: {
      occurrenceID: turn.occurrenceID,
      turnID: turn.turnID,
      inputID: turn.inputID,
      sessionID: turn.sessionID,
      parentUserMessageID: turn.messageID,
      assistantMessageID,
      partID,
      providerCallID: callID,
      emissionOrdinal: 0,
      capabilityIdentity: LearnerResponseEvidence.UPDATE_CAPABILITY,
      capabilityVersion: LearnerResponseEvidence.UPDATE_VERSION,
      authorizationBasis: "agent_action" as const,
      timeAdmitted: time + 3,
    },
  }
}

async function completeOrdinaryTool(fixture: Fixture, turn: LearnerTurn, time: number) {
  const assistantMessageID = await insertAssistantMessage(fixture, turn, time)
  const partID = SessionV1.PartID.ascending()
  const callID = `call-ordinary-read-${partID}`
  await fixture.runtime.runPromise(
    fixture.database.db.transaction((tx) =>
      Effect.gen(function* () {
        yield* admitModelWithLearningContext(tx, {
          turnID: turn.turnID,
          sessionID: turn.sessionID,
          assistantMessageID,
          requestEnvelope: { prompt: "ordinary source read" },
          contextFingerprint: fingerprint(`ordinary-read:${partID}`),
          snapshotFrontier: yield* LearningFrontier.read(tx),
          timeAdmitted: time,
          learningContextBasis: LearningContext.unavailableCapabilityBasis(),
        })
        yield* tx.run(sql`
          INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
          VALUES (
            ${partID}, ${assistantMessageID}, ${turn.sessionID}, ${time + 1}, ${time + 1},
            ${JSON.stringify({
              type: "tool",
              callID,
              tool: "read",
              state: {
                status: "completed",
                input: { filePath: "source.txt" },
                output: "Source read succeeded.",
                title: "source.txt",
                metadata: {},
                time: { start: time + 1, end: time + 2 },
              },
            })}
          )
        `)
        yield* TurnLifecycle.sealCandidateSet(tx, {
          turnID: turn.turnID,
          sessionID: turn.sessionID,
          assistantMessageID,
          candidates: [{ partID, callID, tool: "read", envelope: { filePath: "source.txt" } }],
          timeSealed: time + 1,
        })
        yield* TurnLifecycle.settleModel(tx, {
          turnID: turn.turnID,
          assistantMessageID,
          state: "completed",
          time: time + 2,
        })
        yield* TurnLifecycle.admitTool(tx, {
          turnID: turn.turnID,
          sessionID: turn.sessionID,
          assistantMessageID,
          partID,
          timeAdmitted: time + 3,
        })
        yield* TurnLifecycle.settleTool(tx, {
          turnID: turn.turnID,
          partID,
          state: "completed",
          time: time + 4,
        })
        yield* TurnLifecycle.settle(tx, {
          turnID: turn.turnID,
          outcome: "completed",
          reason: "normal",
          time: time + 5,
        })
      }),
    ),
  )
}

async function commitEvidence(
  fixture: Fixture,
  invocation: EvidenceInvocation,
  command: LearnerResponseEvidence.Command,
  proof: Readonly<{
    targetProof: MaterialMap.EvidenceTargetProof
    currentUse: MaterialMap.CurrentUseReceipt
  }> | undefined,
  time: number,
  order: number,
) {
  const reserved = await reserveEvidence(fixture, invocation, command, time, order)
  if (reserved.type !== "admitted") return reserved
  return settleReservedEvidence(fixture, invocation, proof, time + 1, order + 1)
}

async function reserveEvidence(
  fixture: Fixture,
  invocation: EvidenceInvocation,
  command: LearnerResponseEvidence.Command,
  time: number,
  order: number,
) {
  const reserved = await fixture.runtime.runPromise(
    fixture.database.db.transaction((tx) =>
      Effect.gen(function* () {
        yield* TurnLifecycle.consumeToolFrontier(tx, {
          partID: invocation.partID,
          frontier: yield* LearningFrontier.read(tx),
        })
        return yield* LearnerResponseEvidence.reserve(tx, {
          envelope: invocation.envelope,
          command,
          settlement: { time, order },
        })
      }),
    ),
  )
  if (reserved.type !== "admitted") return reserved
  await fixture.runtime.runPromise(
    fixture.database.db.transaction((tx) =>
      LearnerResponseEvidence.settlePolicy(tx, {
        partID: invocation.partID,
        outcome: "policy_allow",
        policyBasis: { source: "gate19-test" },
        time,
        order,
      }),
    ),
  )
  return reserved
}

async function settleReservedEvidence(
  fixture: Fixture,
  invocation: EvidenceInvocation,
  proof: Readonly<{
    targetProof: MaterialMap.EvidenceTargetProof
    currentUse: MaterialMap.CurrentUseReceipt
  }> | undefined,
  time: number,
  order: number,
) {
  return fixture.runtime.runPromise(
    fixture.database.db.transaction((tx) =>
      Effect.gen(function* () {
        yield* TurnLifecycle.consumeToolFrontier(tx, {
          partID: invocation.partID,
          frontier: yield* LearningFrontier.read(tx),
        })
        const result = yield* LearnerResponseEvidence.settle(tx, {
          partID: invocation.partID,
          settlement: { time, order },
          ...(proof ?? {}),
        })
        if (result.settlement.outcome === "applied") {
          yield* TurnLifecycle.recordToolResultingFrontier(tx, {
            partID: invocation.partID,
            frontier: yield* LearningFrontier.read(tx),
          })
        }
        return result
      }),
    ),
  )
}

function attemptForgedEffect(
  fixture: Fixture,
  invocation: EvidenceInvocation,
  candidate: LearnerResponseEvidence.Candidate,
  forgedRecord: LearnerResponseEvidence.AppliedSettlement,
  assessment: Readonly<{
    relation: LearnerResponseEvidence.Relation
    exposure: LearnerResponseEvidence.Exposure
  }>,
  time: number,
  order: number,
) {
  return fixture.runtime.runPromise(
    fixture.database.db
      .transaction((tx) =>
        Effect.gen(function* () {
          const consumed = yield* LearningFrontier.read(tx)
          const frontier = yield* LearningFrontier.advance(tx, { time, consumed: [consumed] })
          const committedTime = frontier.time
          const revisionID = LearnerResponseEvidence.createRevisionID()
          const receiptID = LearningCommand.createReceiptID()
          const commandCause = candidate.materialized.commandCause
          const operation = candidate.canonicalCommand.operation
          const basis = operation === "revise_from_learner_report" ? "learner_report" : forgedRecord.basis
          const disposition = operation === "retract" ? "retracted" : "active"
          const basisSource = operation === "revise_from_learner_report" ? commandCause : forgedRecord.subject
          const settlement = {
            outcome: "applied",
            evidenceKind: "learner_response_evidence",
            schemaVersion: 1,
            receiptID,
            effectID: revisionID,
            recordID: forgedRecord.recordID,
            revisionID,
            version: forgedRecord.version + 1,
            subject: forgedRecord.subject,
            target: forgedRecord.target,
            operation,
            relation: assessment.relation,
            exposure: assessment.exposure,
            basis,
            disposition,
            frontierSequence: frontier.sequence,
            settlementTime: committedTime,
            settlementOrder: order,
          }
          yield* tx.run("PRAGMA defer_foreign_keys = ON")
          yield* tx.run(sql`
            INSERT INTO learning_command_receipt (
              id, occurrence_id, origin_session_id, origin_message_id, assistant_message_id,
              invocation_part_id, capability_identity, capability_version, authorization_basis,
              time_committed, commit_order
            ) VALUES (
              ${receiptID}, ${invocation.envelope.occurrenceID}, ${invocation.envelope.sessionID},
              ${invocation.envelope.parentUserMessageID}, ${invocation.envelope.assistantMessageID},
              ${invocation.partID}, ${invocation.envelope.capabilityIdentity},
              ${invocation.envelope.capabilityVersion}, ${invocation.envelope.authorizationBasis}, ${committedTime}, ${order}
            )
          `)
          yield* tx.run(sql`
            INSERT INTO learner_response_evidence_revision (
              id, commit_seal_id, record_id, version, predecessor_revision_id, operation,
              relation, exposure, basis, disposition,
              basis_occurrence_id, basis_source_order, basis_session_id, basis_message_id,
              basis_turn_id, basis_input_id, basis_time_admitted,
              command_cause_occurrence_id, command_cause_source_order, command_cause_session_id,
              command_cause_message_id, command_cause_turn_id, command_cause_input_id,
              command_cause_time_admitted, invocation_part_id, time_committed, commit_order,
              frontier_sequence, frontier_time
            ) VALUES (
              ${revisionID}, ${revisionID}, ${forgedRecord.recordID}, ${forgedRecord.version + 1},
              ${forgedRecord.revisionID}, ${operation}, ${assessment.relation}, ${assessment.exposure},
              ${basis}, ${disposition}, ${basisSource.occurrenceID}, ${basisSource.sourceOrder},
              ${basisSource.sessionID}, ${basisSource.messageID}, ${basisSource.turnID}, ${basisSource.inputID},
              ${basisSource.timeAdmitted}, ${commandCause.occurrenceID}, ${commandCause.sourceOrder},
              ${commandCause.sessionID}, ${commandCause.messageID}, ${commandCause.turnID}, ${commandCause.inputID},
              ${commandCause.timeAdmitted}, ${invocation.partID}, ${committedTime}, ${order},
              ${frontier.sequence}, ${frontier.time}
            )
          `)
          yield* tx.run(sql`
            UPDATE learner_response_evidence_record
            SET current_revision_id = ${revisionID}, current_version = ${forgedRecord.version + 1}
            WHERE id = ${forgedRecord.recordID}
              AND current_revision_id = ${forgedRecord.revisionID}
              AND current_version = ${forgedRecord.version}
          `)
          yield* tx.run(sql`
            INSERT INTO learner_response_evidence_commit_seal (revision_id, receipt_id, invocation_part_id)
            VALUES (${revisionID}, ${receiptID}, ${invocation.partID})
          `)
          yield* tx.run(sql`
            UPDATE learning_command_invocation
            SET status = 'applied', receipt_id = ${receiptID}, settlement = ${JSON.stringify(settlement)},
                time_settled = ${committedTime}, settlement_order = ${order}
            WHERE part_id = ${invocation.partID} AND status = 'admitted'
          `)
        }),
      )
      .pipe(Effect.exit),
  )
}

async function finishEvidenceTurn(
  fixture: Fixture,
  turn: LearnerTurn,
  invocation: EvidenceInvocation,
  time: number,
  terminal = true,
) {
  await fixture.runtime.runPromise(
    fixture.database.db.transaction((tx) =>
      Effect.gen(function* () {
        yield* TurnLifecycle.settleTool(tx, {
          turnID: turn.turnID,
          partID: invocation.partID,
          state: "completed",
          time,
        })
        if (terminal) {
          yield* TurnLifecycle.settle(tx, {
            turnID: turn.turnID,
            outcome: "completed",
            reason: "normal",
            time: time + 1,
          })
        }
      }),
    ),
  )
}

async function insertAssistantMessage(fixture: Fixture, turn: LearnerTurn, time: number) {
  const assistantMessageID = SessionV1.MessageID.ascending()
  await fixture.runtime.runPromise(
    fixture.database.db.run(sql`
      INSERT INTO message (id, session_id, time_created, time_updated, data)
      VALUES (
        ${assistantMessageID}, ${turn.sessionID}, ${time}, ${time},
        ${JSON.stringify({
          role: "assistant",
          time: { created: time },
          parentID: turn.messageID,
          modelID: "test-model",
          providerID: "test-provider",
          mode: "repa",
          agent: "repa",
          path: { cwd: "C:\\project", root: "C:\\project" },
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        })}
      )
    `),
  )
  return assistantMessageID
}

function insertUserMessage(
  tx: Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0],
  sessionID: SessionSchema.ID,
  messageID: SessionV1.MessageID,
  partID: SessionV1.PartID,
  time: number,
  text: string,
) {
  return Effect.gen(function* () {
    yield* tx.run(sql`
      INSERT INTO message (id, session_id, time_created, time_updated, data)
      VALUES (
        ${messageID}, ${sessionID}, ${time}, ${time},
        ${JSON.stringify({
          role: "user",
          time: { created: time },
          agent: "repa",
          model: { providerID: "test-provider", modelID: "test-model" },
        })}
      )
    `)
    yield* tx.run(sql`
      INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
      VALUES (${partID}, ${messageID}, ${sessionID}, ${time}, ${time}, ${JSON.stringify({ type: "text", text })})
    `)
  })
}

function artifactMapInput(fixture: Fixture): Parameters<MaterialMap.Interface["createMap"]>[0] {
  const rootNodeID = MaterialMap.createOutlineNodeID()
  return {
    mapID: MaterialMap.createMapID(),
    proposal: {
      target: {
        type: "artifact",
        effectiveArtifactID: fixture.artifact.id,
        revisionID: fixture.revision.id,
        attribution: fixture.revision.attribution,
      },
      outline: [
        {
          id: rootNodeID,
          title: "Semaphore criterion",
          preorderPosition: 0,
          depth: 0,
          selectors: [],
        },
        {
          id: MaterialMap.createOutlineNodeID(),
          parentNodeID: rootNodeID,
          title: "Exact immutable criterion bytes",
          preorderPosition: 1,
          depth: 1,
          selectors: [{ id: MaterialMap.createSelectorID(), position: 0, coordinate: { kind: "whole_target.v1" } }],
        },
      ],
    },
    authorship: MaterialMap.Authorship.trusted("Gate 19 exact selector", "repa.test.learner-evidence", 1),
    access: {
      type: "artifact",
      source: MaterialMap.MaterialTarget.ArtifactSourceSelection.inherited(fixture.root, "source.txt"),
    },
    budgets: materialBudgets(),
  }
}

function alignmentInput(
  mapID: MaterialMap.MapID,
  selectorID: MaterialMap.SelectorID,
  course: Course.MembershipEndpoint,
  access: MaterialMap.MaterialTarget.TargetAccess,
): Parameters<MaterialMap.Interface["createAlignment"]>[0] {
  return {
    alignmentID: MaterialMap.createAlignmentID(),
    proposal: {
      mapID,
      selectorID,
      course,
      selection: { type: "explicit_exact" },
      reason: "Neutral exact-endpoint provenance only",
    },
    authorship: MaterialMap.Authorship.trusted("Gate 19 neutral alignment", "repa.test.learner-evidence", 1),
    access,
    budgets: materialBudgets(),
  }
}

async function createCourseEndpoint(fixture: Fixture) {
  const course = await fixture.runtime.runPromise(fixture.courses.createCourse({ title: "Concurrency" }))
  const view = await fixture.runtime.runPromise(
    fixture.courses.createView({
      courseID: course.id,
      name: "Current view",
      expectedCourseVersion: 0,
      authorship: Course.Authorship.learnerAuthored(),
      revision: { items: [{ key: "semaphore", title: "Explain semaphore concurrency bounds" }] },
    }),
  )
  await fixture.runtime.runPromise(
    fixture.courses.select({
      courseID: course.id,
      revisionID: view.revision.id,
      expectedCourseVersion: 0,
      expectedSelectionVersion: 0,
      expectedViewVersion: 0,
      expectedRevisionVersion: 0,
    }),
  )
  const items = await fixture.runtime.runPromise(
    fixture.courses.listRevisionItems(course.id, view.view.id, view.revision.id),
  )
  const item = items.items[0]
  if (!item) throw new Error("Expected exact Course membership")
  return {
    endpoint: {
      courseID: course.id,
      viewID: view.view.id,
      revisionID: view.revision.id,
      itemID: item.itemID,
    },
  }
}

async function createCourseEndpoints(fixture: Fixture, count: number) {
  const course = await fixture.runtime.runPromise(fixture.courses.createCourse({ title: "Concurrency scale" }))
  const view = await fixture.runtime.runPromise(
    fixture.courses.createView({
      courseID: course.id,
      name: "Current scale view",
      expectedCourseVersion: 0,
      authorship: Course.Authorship.learnerAuthored(),
      revision: {
        items: Array.from({ length: count }, (_, index) => ({
          key: `semaphore-${index.toString().padStart(2, "0")}`,
          title: `Explain semaphore concurrency bound ${index}`,
        })),
      },
    }),
  )
  await fixture.runtime.runPromise(
    fixture.courses.select({
      courseID: course.id,
      revisionID: view.revision.id,
      expectedCourseVersion: 0,
      expectedSelectionVersion: 0,
      expectedViewVersion: 0,
      expectedRevisionVersion: 0,
    }),
  )
  const items = await fixture.runtime.runPromise(
    fixture.courses.listRevisionItems(course.id, view.view.id, view.revision.id, { limit: count }),
  )
  if (items.items.length !== count) throw new Error(`Expected ${count} exact Course memberships`)
  return {
    endpoints: items.items.map((item) => ({
      courseID: course.id,
      viewID: view.view.id,
      revisionID: view.revision.id,
      itemID: item.itemID,
    })),
  }
}

function materialBudgets(): MaterialMap.MaterialTarget.ReadBudgets {
  return {
    artifactBytes: 1024 * 1024,
    representation: { integrityScanBytes: 1024 * 1024, returnBytes: 1024 * 1024, records: 100 },
  }
}

function fingerprint(value: string) {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}
