import { describe, expect, test } from "bun:test"
import { Artifact } from "@opencode-ai/core/artifact"
import { createArtifactID, createRevisionID } from "@opencode-ai/core/artifact/schema"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { ContentRootNTFS } from "@opencode-ai/core/content-root/ntfs"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { LearningCommand, Occurrence } from "@opencode-ai/core/learning-command"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "@opencode-ai/core/learning-command/sql"
import { ModelV2 } from "@opencode-ai/core/model"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Representation } from "@opencode-ai/core/representation"
import { learningCommandStatements } from "@opencode-ai/core/representation/learning-command-constraint-v12"
import { representationFailureCodesV12 } from "@opencode-ai/core/representation/learning-command-failure-code-v12"
import { isRepresentationSettlement } from "@opencode-ai/core/representation/learning-command-settlement"
import { PDFTextProfile } from "@opencode-ai/core/representation/pdf-text-profile"
import { RepresentationSchema } from "@opencode-ai/core/representation/schema"
import {
  RepresentationCommandCommitSealTable,
  RepresentationEffectTable,
  RepresentationRevisionTable,
} from "@opencode-ai/core/representation/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { MessageTable, PartTable, SessionTable } from "@opencode-ai/core/session/sql"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { eq, sql } from "drizzle-orm"
import { Effect, Exit, Layer, ManagedRuntime } from "effect"
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import path from "path"

const model = { modelID: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }

function acceptRepresentationFailureCode(_code: LearningCommand.RepresentationFailureCode) {}

acceptRepresentationFailureCode("producer_unavailable")
// @ts-expect-error Temporal context is owned by Retained Steering and Learner Goal, not Representation.
acceptRepresentationFailureCode("temporal_context_unavailable")
// @ts-expect-error Capacity exhaustion is owned by Retained Steering and Learner Goal, not Representation.
acceptRepresentationFailureCode("capacity_exceeded")

describe("Representation learning-command settlement", () => {
  test("keeps the frozen v12 failure vocabulary shared by validator and trigger", () => {
    expect(representationFailureCodesV12).toEqual([
      "semantic_conflict",
      "context_refresh_required",
      "permission_rejected",
      "permission_corrected",
      "cancelled",
      "interrupted",
      "source_unavailable",
      "ambiguous_content_root",
      "unsupported_source",
      "source_too_large",
      "producer_unavailable",
      "producer_failed",
      "producer_timeout",
      "invalid_producer_output",
      "publication_failed",
      "outcome_unknown",
      "stale",
      "inactive",
      "validation_error",
    ])
    expect(
      representationFailureCodesV12.every((code) =>
        isRepresentationSettlement({
          outcome: "error",
          code,
          settlementTime: 1,
          settlementOrder: 0,
        }),
      ),
    ).toBeTrue()
    expect(
      ["temporal_context_unavailable", "capacity_exceeded"].some((code) =>
        isRepresentationSettlement({
          outcome: "error",
          code,
          settlementTime: 1,
          settlementOrder: 0,
        }),
      ),
    ).toBeFalse()

    const trigger = learningCommandStatements.find((statement) =>
      statement.includes("representation_learning_command_no_effect_validate_v12"),
    )
    if (!trigger) throw new Error("The v12 Representation no-effect trigger is missing")
    const codeList = /json_extract\(NEW\.settlement, '\$\.code'\) IN \(\s*([\s\S]*?)\s*\), 0/.exec(trigger)?.[1]
    if (!codeList) throw new Error("The v12 Representation no-effect trigger has no failure-code list")
    expect(Array.from(codeList.matchAll(/'([^']+)'/g), (match) => match[1])).toEqual(
      [...representationFailureCodesV12],
    )
  })

  test("keeps semantic address separate from physical delivery and exact payload", () => {
    const occurrenceID = LearningCommand.createOccurrenceID()
    const effectiveArtifactID = createArtifactID()
    const first = invocation({
      occurrenceID,
      effectiveArtifactID,
      sourceRevisionID: createRevisionID(),
      producerKind: "local_pdf",
      suffix: "first",
    })
    const resampled = invocation({
      occurrenceID,
      effectiveArtifactID,
      sourceRevisionID: createRevisionID(),
      producerKind: "local_pdf",
      suffix: "resampled",
    })
    const otherProducer = { ...resampled, producerKind: "configured_model" as const }
    const otherOccurrence = {
      ...resampled,
      envelope: { ...resampled.envelope, occurrenceID: LearningCommand.createOccurrenceID() },
    }

    expect(LearningCommand.representationConversionOperationIdentity(first)).toBe(
      LearningCommand.representationConversionOperationIdentity(resampled),
    )
    expect(LearningCommand.representationConversionOperationIdentity(first)).not.toBe(
      LearningCommand.representationConversionOperationIdentity(otherProducer),
    )
    expect(LearningCommand.representationConversionOperationIdentity(first)).not.toBe(
      LearningCommand.representationConversionOperationIdentity(otherOccurrence),
    )
  })

  test("commits Representation effect, receipt, and physical settlement atomically with exact semantic replay", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "repa-representation-command-"))
    const sourceDirectory = path.join(directory, "source")
    const sourcePath = path.join(sourceDirectory, "lecture.pdf")
    const databasePath = path.join(directory, "repa.sqlite")
    await mkdir(sourceDirectory)
    await writeFile(sourcePath, new TextEncoder().encode("%PDF-1.7 exact source bytes"))
    const runtime = ManagedRuntime.make(appLayer(databasePath))
    try {
      await runtime.runPromise(
        Effect.gen(function* () {
          const database = yield* Database.Service
          const roots = yield* ContentRoot.Service
          const artifacts = yield* Artifact.Service
          const representations = yield* Representation.Service
          const proposal = yield* roots.propose(sourceDirectory)
          const root = yield* roots.approve({
            proposal,
            approval: ContentRoot.LearnerApproval.contentRoot(proposal, "Representation settlement evidence root"),
          })
          const read = yield* roots.read({
            contentRootID: root.id,
            relativePath: "lecture.pdf",
            maxBytes: 1024,
          })
          if (read.observation.result !== "present") return yield* Effect.die("Expected exact source bytes")
          const artifact = yield* artifacts.admit({
            location: Artifact.CanonicalLocation.trusted(sourcePath),
            observation: {
              result: "present",
              fingerprint: read.observation.fingerprint,
              mediaType: read.observation.mediaType,
              observer: Artifact.Observer.trusted("representation-settlement-test", 1),
              timeObserved: read.observation.timeObserved,
            },
            authority: Artifact.Admission.learnerInstruction("representation-settlement-test", 1),
          })
          const ordinary = yield* database.db.transaction((tx) =>
            Artifact.readOrdinaryUseRevisionSnapshot(tx, artifact.id),
          )
          const interaction = yield* seedInteraction(database.db, directory, ordinary, "initial")
          const recipe = RepresentationSchema.localPDFRecipe
          const profile = PDFTextProfile.encode([
            { page: 1, items: [{ text: "Exact readable page", lineBreakAfter: true }] },
          ])
          if (!profile.ok) return yield* Effect.die(`Could not create profile fixture: ${profile.error}`)
          const acceptance = acceptanceInput({
            invocation: interaction.invocation,
            ordinary,
            sourceVersion: artifact.source.sourceVersion,
            authorization: read.authorization,
            descriptor: read.observation.descriptor,
            relativePath: read.observation.relativePath,
            sourceObservedTime: read.observation.timeObserved,
            profileBytes: profile.value.bytes,
            recipe,
            timeAccepted: interaction.time + 10,
          })

          expect(
            yield* database.db.transaction((tx) =>
              LearningCommand.reserveRepresentationConversion(tx, interaction.invocation),
            ),
          ).toEqual({ type: "candidate" })
          expect(
            yield* database.db.transaction((tx) =>
              LearningCommand.decideRepresentationCandidate(tx, interaction.invocation),
            ),
          ).toEqual({ type: "candidate" })

          const applied = yield* Effect.scoped(
            Effect.gen(function* () {
              const prepared = yield* representations.prepareAcceptance(acceptance)
              if (prepared.type !== "candidate") return yield* Effect.die("Expected a new Representation candidate")
              const rolledBack = yield* database.db
                .transaction((tx) =>
                  Effect.gen(function* () {
                    const candidate = yield* LearningCommand.settleRepresentationCandidate(tx, {
                      ...interaction.invocation,
                      permission: { type: "allow" },
                      settlement: { time: interaction.time + 11, order: 1 },
                    })
                    if (candidate.type !== "candidate") return yield* Effect.die("Expected final candidate")
                    const representation = yield* prepared.commit(tx)
                    yield* LearningCommand.settleRepresentationSuccess(tx, {
                      ...interaction.invocation,
                      representationRevisionID: representation.id,
                      domainResult: "new",
                      settlement: { time: interaction.time + 11, order: 1 },
                    })
                    return yield* Effect.fail("inject rollback after complete settlement")
                  }),
                )
                .pipe(Effect.exit)
              expect(Exit.isFailure(rolledBack)).toBeTrue()
              expect(
                yield* database.db
                  .select({ id: RepresentationRevisionTable.id })
                  .from(RepresentationRevisionTable)
                  .where(eq(RepresentationRevisionTable.id, acceptance.candidateRevisionID))
                  .get(),
              ).toBeUndefined()
              expect(
                yield* database.db
                  .select({ id: LearningCommandReceiptTable.id })
                  .from(LearningCommandReceiptTable)
                  .where(eq(LearningCommandReceiptTable.invocation_part_id, interaction.invocation.envelope.partID))
                  .get(),
              ).toBeUndefined()
              expect(
                yield* database.db
                  .select({ status: LearningCommandInvocationTable.status })
                  .from(LearningCommandInvocationTable)
                  .where(eq(LearningCommandInvocationTable.part_id, interaction.invocation.envelope.partID))
                  .get(),
              ).toEqual({ status: "admitted" })

              return yield* database.db.transaction((tx) =>
                Effect.gen(function* () {
                  const candidate = yield* LearningCommand.settleRepresentationCandidate(tx, {
                    ...interaction.invocation,
                    permission: { type: "allow" },
                    settlement: { time: interaction.time + 12, order: 2 },
                  })
                  if (candidate.type !== "candidate") return yield* Effect.die("Expected retry candidate")
                  const representation = yield* prepared.commit(tx)
                  const settlement = yield* LearningCommand.settleRepresentationSuccess(tx, {
                    ...interaction.invocation,
                    representationRevisionID: representation.id,
                    domainResult: "new",
                    settlement: { time: interaction.time + 12, order: 2 },
                  })
                  return { representation, settlement }
                }),
              )
            }),
          )
          expect(applied.settlement).toMatchObject({
            type: "settled",
            settlement: {
              outcome: "applied",
              representationRevisionID: applied.representation.id,
              effectiveArtifactID: ordinary.effectiveArtifactID,
              sourceRevisionID: ordinary.currentRevisionID,
              producerKind: "local_pdf",
            },
          })
          const physical = yield* database.db
            .select()
            .from(LearningCommandInvocationTable)
            .where(eq(LearningCommandInvocationTable.part_id, interaction.invocation.envelope.partID))
            .get()
          expect(physical).toMatchObject({
            command_name: LearningCommand.REPRESENTATION_CONVERT_CAPABILITY,
            status: "applied",
            receipt_id: applied.settlement.type === "settled" ? applied.settlement.settlement.receiptID : undefined,
          })
          expect(
            yield* database.db
              .select({
                occurrenceID: LearningCommandReceiptTable.occurrence_id,
                effectID: RepresentationCommandCommitSealTable.effect_id,
              })
              .from(RepresentationCommandCommitSealTable)
              .innerJoin(
                LearningCommandReceiptTable,
                eq(LearningCommandReceiptTable.id, RepresentationCommandCommitSealTable.receipt_id),
              )
              .where(eq(RepresentationCommandCommitSealTable.effect_id, applied.representation.effectID))
              .get(),
          ).toMatchObject({
            occurrenceID: interaction.invocation.envelope.occurrenceID,
            effectID: applied.representation.effectID,
          })
          expect(
            yield* database.db.transaction((tx) =>
              LearningCommand.reserveRepresentationConversion(tx, interaction.invocation),
            ),
          ).toEqual({ type: "replay", settlement: applied.settlement.settlement })

          const terminalRewrite = yield* database.db
            .run(
              sql`UPDATE learning_command_invocation SET receipt_id = NULL WHERE part_id = ${interaction.invocation.envelope.partID}`,
            )
            .pipe(Effect.exit)
          expect(Exit.isFailure(terminalRewrite)).toBeTrue()
          expect(
            yield* database.db
              .select({ receiptID: LearningCommandInvocationTable.receipt_id })
              .from(LearningCommandInvocationTable)
              .where(eq(LearningCommandInvocationTable.part_id, interaction.invocation.envelope.partID))
              .get(),
          ).toEqual({
            receiptID: applied.settlement.type === "settled" ? applied.settlement.settlement.receiptID : null,
          })

          const duplicate = yield* seedAssistant(database.db, interaction, ordinary, "duplicate", "local_pdf")
          expect(LearningCommand.representationConversionOperationIdentity(duplicate.invocation)).toBe(
            LearningCommand.representationConversionOperationIdentity(interaction.invocation),
          )
          expect(
            yield* database.db.transaction((tx) =>
              LearningCommand.reserveRepresentationConversion(tx, duplicate.invocation),
            ),
          ).toEqual({ type: "candidate" })
          const duplicateAcceptance = acceptanceInput({
            invocation: duplicate.invocation,
            ordinary,
            sourceVersion: artifact.source.sourceVersion,
            authorization: read.authorization,
            descriptor: read.observation.descriptor,
            relativePath: read.observation.relativePath,
            sourceObservedTime: read.observation.timeObserved,
            profileBytes: profile.value.bytes,
            recipe,
            timeAccepted: interaction.time + 20,
          })
          const duplicateSettlement = yield* Effect.scoped(
            Effect.gen(function* () {
              const prepared = yield* representations.prepareAcceptance(duplicateAcceptance)
              if (prepared.type !== "already_accepted") {
                return yield* Effect.die("Expected exact Representation semantic replay")
              }
              return yield* database.db.transaction((tx) =>
                LearningCommand.settleRepresentationSuccess(tx, {
                  ...duplicate.invocation,
                  representationRevisionID: prepared.representation.id,
                  domainResult: "already_accepted",
                  settlement: { time: interaction.time + 21, order: 3 },
                }),
              )
            }),
          )
          expect(duplicateSettlement).toMatchObject({
            type: "settled",
            settlement: {
              outcome: "already_applied",
              receiptID: applied.settlement.type === "settled" ? applied.settlement.settlement.receiptID : undefined,
              effectID: applied.representation.effectID,
              representationRevisionID: applied.representation.id,
            },
          })
          expect(
            yield* database.db
              .select({ invocationPartID: LearningCommandReceiptTable.invocation_part_id })
              .from(RepresentationCommandCommitSealTable)
              .innerJoin(
                LearningCommandReceiptTable,
                eq(LearningCommandReceiptTable.id, RepresentationCommandCommitSealTable.receipt_id),
              )
              .where(eq(RepresentationCommandCommitSealTable.effect_id, applied.representation.effectID))
              .get(),
          ).toEqual({ invocationPartID: interaction.invocation.envelope.partID })

          const secondMutation = yield* seedAssistant(
            database.db,
            interaction,
            ordinary,
            "second-mutation",
            "configured_model",
            interaction.invocation.envelope.assistantMessageID,
          )
          yield* database.db.transaction((tx) =>
            LearningCommand.reserveRepresentationConversion(tx, secondMutation.invocation),
          )
          expect(
            yield* database.db.transaction((tx) =>
              LearningCommand.decideRepresentationCandidate(tx, secondMutation.invocation),
            ),
          ).toEqual({ type: "terminal", reason: "context_refresh_required" })

          const failed = yield* seedAssistant(database.db, interaction, ordinary, "failed", "configured_model")
          expect(
            yield* database.db.transaction((tx) =>
              LearningCommand.reserveRepresentationConversion(tx, failed.invocation),
            ),
          ).toEqual({ type: "candidate" })
          const foreignFailure = yield* database.db
            .transaction((tx) =>
              LearningCommand.settleRepresentationFailure(tx, {
                ...failed.invocation,
                code: "capacity_exceeded" as unknown as LearningCommand.RepresentationFailureCode,
                settlement: { time: interaction.time + 31, order: 4 },
              }),
            )
            .pipe(Effect.exit)
          expect(Exit.isFailure(foreignFailure)).toBeTrue()
          expect(
            yield* database.db
              .select({
                status: LearningCommandInvocationTable.status,
                settlement: LearningCommandInvocationTable.settlement,
              })
              .from(LearningCommandInvocationTable)
              .where(eq(LearningCommandInvocationTable.part_id, failed.invocation.envelope.partID))
              .get(),
          ).toEqual({ status: "admitted", settlement: null })
          const failedSettlement = yield* database.db.transaction((tx) =>
            LearningCommand.settleRepresentationFailure(tx, {
              ...failed.invocation,
              code: "producer_unavailable",
              settlement: { time: interaction.time + 31, order: 4 },
            }),
          )
          expect(failedSettlement).toEqual({
            type: "settled",
            settlement: {
              outcome: "error",
              code: "producer_unavailable",
              settlementTime: interaction.time + 31,
              settlementOrder: 4,
              detail: undefined,
            },
          })
          expect(
            yield* database.db
              .select({
                status: LearningCommandInvocationTable.status,
                receiptID: LearningCommandInvocationTable.receipt_id,
              })
              .from(LearningCommandInvocationTable)
              .where(eq(LearningCommandInvocationTable.part_id, failed.invocation.envelope.partID))
              .get(),
          ).toEqual({ status: "error", receiptID: null })
          expect(
            yield* database.db.transaction((tx) =>
              LearningCommand.reserveRepresentationConversion(tx, failed.invocation),
            ),
          ).toEqual({ type: "replay", settlement: failedSettlement.settlement })
        }),
      )
    } finally {
      await runtime.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })
})

function invocation(input: {
  occurrenceID: LearningCommand.OccurrenceID
  effectiveArtifactID: Artifact.ArtifactID
  sourceRevisionID: Artifact.RevisionID
  producerKind: "local_pdf" | "configured_model"
  suffix: string
}): LearningCommand.RepresentationConvertInvocation {
  return {
    envelope: {
      occurrenceID: input.occurrenceID,
      turnID: Turn.ID.create(),
      inputID: Turn.InputID.create(),
      sessionID: SessionSchema.ID.make(`ses_representation_${input.suffix}`),
      parentUserMessageID: SessionV1.MessageID.ascending(`msg_representation_user_${input.suffix}`),
      assistantMessageID: SessionV1.MessageID.ascending(`msg_representation_assistant_${input.suffix}`),
      partID: SessionV1.PartID.ascending(`prt_representation_${input.suffix}`),
      providerCallID: `call-${input.suffix}`,
      emissionOrdinal: 0,
      capabilityIdentity: LearningCommand.REPRESENTATION_CONVERT_CAPABILITY,
      capabilityVersion: LearningCommand.REPRESENTATION_CONVERT_VERSION,
      authorizationBasis: "learner_request",
      timeAdmitted: 1,
    },
    command: {
      effectiveArtifactID: input.effectiveArtifactID,
      sourceRevisionID: input.sourceRevisionID,
    },
    producerKind: input.producerKind,
  }
}

function appLayer(filename: string) {
  return LayerNode.compile(LayerNode.group([Artifact.node, ContentRoot.node, Representation.node, Database.node]), [
    [Database.node, Database.layerFromPath(filename).pipe(Layer.orDie)],
  ])
}

function seedInteraction(
  database: Database.Interface["db"],
  directory: string,
  ordinary: Artifact.OrdinaryUseRevisionSnapshot,
  suffix: string,
) {
  return Effect.gen(function* () {
    const time = Date.now() + 1_000
    const sessionID = SessionSchema.ID.make(`ses_representation_${suffix}`)
    const userMessageID = SessionV1.MessageID.ascending(`msg_representation_user_${suffix}`)
    const userPartID = SessionV1.PartID.ascending(`prt_representation_user_${suffix}`)
    yield* database
      .insert(ProjectTable)
      .values({
        id: Project.ID.global,
        worktree: AbsolutePath.make(directory),
        sandboxes: [],
        time_created: time,
        time_updated: time,
      })
      .onConflictDoNothing()
      .run()
    yield* database
      .insert(SessionTable)
      .values({
        id: sessionID,
        project_id: Project.ID.global,
        slug: sessionID,
        directory,
        title: "representation settlement",
        version: "test",
        time_created: time,
        time_updated: time,
      })
      .run()
    yield* database
      .insert(MessageTable)
      .values({
        id: userMessageID,
        session_id: sessionID,
        data: userData(time),
        time_created: time,
        time_updated: time,
      })
      .run()
    yield* database
      .insert(PartTable)
      .values({
        id: userPartID,
        session_id: sessionID,
        message_id: userMessageID,
        data: textPartData("Keep this exact material readable for later study."),
        time_created: time,
        time_updated: time,
      })
      .run()
    const occurrence = yield* database.transaction((tx) =>
      Occurrence.admit(tx, {
        admission: LearningCommand.LearnerAdmission.interactive(),
        sessionID,
        messageID: userMessageID,
        timeAdmitted: time,
      }),
    )
    const context = { sessionID, userMessageID, occurrenceID: occurrence.id, time }
    return {
      ...context,
      ...(yield* seedAssistant(database, context, ordinary, suffix, "local_pdf")),
    }
  }).pipe(Effect.orDie)
}

function seedAssistant(
  database: Database.Interface["db"],
  interaction: {
    readonly sessionID: SessionSchema.ID
    readonly userMessageID: SessionV1.MessageID
    readonly occurrenceID: LearningCommand.OccurrenceID
    readonly time: number
  },
  ordinary: Artifact.OrdinaryUseRevisionSnapshot,
  suffix: string,
  producerKind: "local_pdf" | "configured_model",
  existingAssistantMessageID?: SessionV1.MessageID,
) {
  return Effect.gen(function* () {
    const time = interaction.time + 1
    const assistantMessageID =
      existingAssistantMessageID ?? SessionV1.MessageID.ascending(`msg_representation_assistant_${suffix}`)
    const partID = SessionV1.PartID.ascending(`prt_representation_tool_${suffix}`)
    const providerCallID = `call-representation-${suffix}`
    if (!existingAssistantMessageID) {
      yield* database
        .insert(MessageTable)
        .values({
          id: assistantMessageID,
          session_id: interaction.sessionID,
          data: assistantData(interaction.userMessageID, time),
          time_created: time,
          time_updated: time,
        })
        .run()
    }
    const command = {
      effectiveArtifactID: ordinary.effectiveArtifactID,
      sourceRevisionID: ordinary.currentRevisionID,
    }
    yield* database
      .insert(PartTable)
      .values({
        id: partID,
        session_id: interaction.sessionID,
        message_id: assistantMessageID,
        data: toolPartData(command, providerCallID),
        time_created: time,
        time_updated: time,
      })
      .run()
    return {
      invocation: {
        envelope: {
          occurrenceID: interaction.occurrenceID,
          turnID: Turn.ID.create(),
          inputID: Turn.InputID.create(),
          sessionID: interaction.sessionID,
          parentUserMessageID: interaction.userMessageID,
          assistantMessageID,
          partID,
          providerCallID,
          emissionOrdinal: existingAssistantMessageID ? 1 : 0,
          capabilityIdentity: LearningCommand.REPRESENTATION_CONVERT_CAPABILITY,
          capabilityVersion: LearningCommand.REPRESENTATION_CONVERT_VERSION,
          authorizationBasis: "learner_request" as const,
          timeAdmitted: time,
        },
        command,
        producerKind,
      } satisfies LearningCommand.RepresentationConvertInvocation,
    }
  }).pipe(Effect.orDie)
}

function acceptanceInput(input: {
  invocation: LearningCommand.RepresentationConvertInvocation
  ordinary: Artifact.OrdinaryUseRevisionSnapshot
  sourceVersion: number
  authorization: ContentRoot.ReadAuthorizationReceipt
  descriptor: ContentRootNTFS.Descriptor
  relativePath: string
  sourceObservedTime: number
  profileBytes: Uint8Array
  recipe: Representation.LocalPDFProvenance
  timeAccepted: number
}): Representation.AcceptanceInput {
  return {
    effectiveArtifactID: input.ordinary.effectiveArtifactID,
    sourceRevisionID: input.ordinary.currentRevisionID,
    attribution: input.ordinary.attribution,
    recipe: input.recipe,
    authority: Representation.ConversionAuthority.learningCommand({
      operationIdentity: LearningCommand.representationConversionOperationIdentity(input.invocation),
      authorizationBasis: input.invocation.envelope.authorizationBasis,
      occurrenceID: input.invocation.envelope.occurrenceID,
      invocationPartID: input.invocation.envelope.partID,
    }),
    candidateRevisionID: Representation.createRevisionID(),
    sourceProof: {
      ordinary: input.ordinary,
      sourceVersion: input.sourceVersion,
      authorization: input.authorization,
      relativePath: input.relativePath,
      descriptor: input.descriptor,
      timeObserved: input.sourceObservedTime,
    },
    candidate: {
      kind: "local_pdf",
      runIdentity: `pdf-run:${input.invocation.envelope.partID}`,
      provenance: input.recipe,
      input: input.ordinary.fingerprint,
      bytes: input.profileBytes,
      diagnostics: [],
      usage: {
        kind: "local_pdf",
        pageCount: 1,
        textItemCount: 1,
        operatorCount: 0,
        imagePaintOperations: 0,
        signalPageCount: 0,
        profileByteLength: input.profileBytes.byteLength,
      },
    },
    timeAccepted: input.timeAccepted,
  }
}

function userData(time: number): Omit<SessionV1.User, "id" | "sessionID"> {
  return {
    role: "user",
    time: { created: time },
    agent: "build",
    model,
  }
}

function assistantData(parentID: SessionV1.MessageID, time: number): Omit<SessionV1.Assistant, "id" | "sessionID"> {
  return {
    role: "assistant",
    time: { created: time },
    parentID,
    modelID: model.modelID,
    providerID: model.providerID,
    mode: "build",
    agent: "build",
    path: { cwd: "/project", root: "/project" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }
}

function textPartData(text: string): typeof PartTable.$inferInsert.data {
  return { type: "text", text } as typeof PartTable.$inferInsert.data
}

function toolPartData(command: LearningCommand.RepresentationConvertCommand, callID: string) {
  return {
    type: "tool",
    callID,
    tool: LearningCommand.REPRESENTATION_CONVERT_CAPABILITY,
    state: { status: "pending", input: command, raw: JSON.stringify(command) },
  } as typeof PartTable.$inferInsert.data
}
