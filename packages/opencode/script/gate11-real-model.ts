import { Artifact } from "@opencode-ai/core/artifact"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { LearnerAdmission, Occurrence } from "@opencode-ai/core/learning-command"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Representation } from "@opencode-ai/core/representation"
import { ModelRenditionProfile } from "@opencode-ai/core/representation/model-rendition-profile"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { Deferred, Effect } from "effect"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { AppRuntime } from "../src/effect/app-runtime"
import { EventV2Bridge } from "../src/event-v2-bridge"
import { InstanceRef } from "../src/effect/instance-ref"
import { InstanceStore } from "../src/project/instance-store"
import { RepresentationConversion } from "../src/representation/conversion"
import { MessageID, PartID, SessionID } from "../src/session/schema"
import { SessionRunState } from "../src/session/run-state"
import { Session } from "../src/session/session"
import { SessionTurnEvents } from "../src/session/turn-events"
import { pngFixture } from "../test/fixture/png"

if (process.env.REPA_GATE11_REAL_MODEL_APPROVED !== "1") {
  throw new Error("Set REPA_GATE11_REAL_MODEL_APPROVED=1 only after explicit maintainer authorization")
}
if (!process.env.REPA_CONFIG_CONTENT || !process.env.REPA_DB) {
  throw new Error("The real-model evidence run requires isolated REPA_CONFIG_CONTENT and REPA_DB")
}

const directory = await mkdtemp(path.join(tmpdir(), "repa-gate11-real-model-"))
const sourceDirectory = path.join(directory, "source")
const sourcePath = path.join(sourceDirectory, "gate11-fixture.png")
await mkdir(sourceDirectory)
await writeFile(sourcePath, pngFixture())

try {
  const evidence = await AppRuntime.runPromise(
    InstanceStore.Service.use((store) =>
      store.load({ directory: process.cwd() }).pipe(
        Effect.flatMap((ctx) =>
          Effect.gen(function* () {
            const roots = yield* ContentRoot.Service
            const artifacts = yield* Artifact.Service
            const sessions = yield* Session.Service
            const runState = yield* SessionRunState.Service
            const events = yield* EventV2Bridge.Service
            const representations = yield* Representation.Service
            const currentReader = yield* Representation.CurrentUseReader
            const sessionID = SessionID.create()
            const turnID = Turn.ID.create()
            const inputID = Turn.InputID.create()
            const messageID = MessageID.ascending()
            const time = Date.now()
            const selectedModel = {
              providerID: ProviderV2.ID.make("initiating-message-not-inherited"),
              modelID: ModelV2.ID.make("initiating-message-not-inherited"),
              variant: "initiating-variant-not-inherited",
            }
            const user = {
              id: messageID,
              sessionID,
              role: "user" as const,
              time: { created: time },
              agent: "repa",
              model: selectedModel,
              system: "initiating-system-not-inherited",
            } satisfies SessionV1.User
            const part = {
              id: PartID.ascending(),
              messageID,
              sessionID,
              type: "text" as const,
              text: "Run the maintainer-authorized Gate 11 configured-model evidence operation.",
            } satisfies SessionV1.TextPart
            const envelope = {
              kind: "learner_root",
              source: "gate11_real_model_evidence",
              sessionID,
              turnID,
              inputID,
              messageID,
            }
            let admitted: TurnLifecycle.Admitted | undefined
            const admit = events
              .transaction((tx) =>
                Effect.gen(function* () {
                  const plan = yield* sessions.prepareRootStart(tx, {
                    targetSessionID: sessionID,
                    turnID,
                    session: {
                      title: "Gate 11 real configured-model evidence",
                      agent: user.agent,
                      model: {
                        id: selectedModel.modelID,
                        providerID: selectedModel.providerID,
                        variant: selectedModel.variant,
                      },
                    },
                  })
                  const commit = () =>
                    Effect.gen(function* () {
                      const occurrence = yield* Occurrence.admit(tx, {
                        admission: LearnerAdmission.interactive(),
                        sessionID,
                        messageID,
                        timeAdmitted: time,
                      })
                      admitted = yield* TurnLifecycle.admit(tx, {
                        kind: "learner",
                        turnID,
                        sessionID,
                        inputID,
                        messageID,
                        occurrenceID: occurrence.id,
                        limits: { model: 0, tool: 0 },
                        envelope,
                        policyBasis: { source: "gate11_real_model_evidence" },
                        timeAdmitted: time,
                      })
                    }).pipe(Effect.orDie)
                  return {
                    result: undefined,
                    events: [
                      ...plan.events,
                      { definition: SessionV1.Event.MessageUpdated, data: { sessionID, info: user } },
                      {
                        definition: SessionV1.Event.PartUpdated,
                        data: { sessionID, part, time },
                        options: { commit },
                      },
                      SessionTurnEvents.started(() => {
                        if (!admitted) throw new Error(`Gate 11 Turn ${turnID} did not admit before its event`)
                        return admitted
                      }),
                    ],
                  }
                }),
              )
              .pipe(
                Effect.flatMap(() =>
                  admitted ? Effect.succeed(admitted) : Effect.die(`Gate 11 Turn ${turnID} did not admit`),
                ),
              )
            const conversion = Effect.gen(function* () {
              const proposal = yield* roots.propose(sourceDirectory)
              const root = yield* roots.approve({
                proposal,
                approval: ContentRoot.LearnerApproval.contentRoot(proposal, "Gate 11 authorized real-model evidence"),
              })
              const read = yield* roots.read({
                contentRootID: root.id,
                relativePath: "gate11-fixture.png",
                maxBytes: 256 * 1024,
              })
              if (read.observation.result !== "present") return yield* Effect.die("The repository-owned PNG is missing")
              const artifact = yield* artifacts.admit({
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
                authority: Artifact.Admission.learnerInstruction("gate11-real-model-fixture", 1),
              })
              const sourceRevisionID = artifact.source.currentRevisionID
              if (!sourceRevisionID) return yield* Effect.die("The admitted image has no current Revision")
              const input = {
                effectiveArtifactID: artifact.id,
                sourceRevisionID,
                contentRootID: root.id,
                relativePath: "gate11-fixture.png",
                rootSelection: RepresentationConversion.RootSelection.artifactProvenance(),
                producer: { kind: "configured_model" as const, sessionID, messageID },
                authority: Representation.ConversionAuthority.deterministic(
                  "gate11-real-model-once",
                  "maintainer-authorized real configured-model evidence",
                ),
              }
              const converted = yield* RepresentationConversion.convert(input)
              const retried = yield* RepresentationConversion.convert(input)
              const accepted = converted.representation
              const current = yield* currentReader.readForCurrentUse({
                representationRevisionID: accepted.id,
                effectiveArtifactID: artifact.id,
                selection: { type: "whole" },
                budgets: { integrityScanBytes: 1024 * 1024, returnBytes: 1024 * 1024, records: 1 },
              })
              const decoded = ModelRenditionProfile.decode(current.content.bytes)
              if (!decoded.ok) {
                return yield* Effect.die(`The accepted configured-model profile is invalid: ${decoded.error}`)
              }
              if (retried.type !== "already_accepted" || retried.representation.id !== accepted.id) {
                return yield* Effect.die("The exact retry did not reuse the accepted Representation")
              }
              if ((yield* representations.listForArtifact({ effectiveArtifactID: artifact.id })).length !== 1) {
                return yield* Effect.die("The real-model evidence produced more than one Representation")
              }
              return {
                fixture: {
                  mediaType: read.observation.mediaType,
                  byteLength: read.observation.fingerprint.byteLength,
                  digest: read.observation.fingerprint.digest,
                },
                representation: {
                  id: accepted.id,
                  digest: accepted.output.digest,
                  byteLength: accepted.output.byteLength,
                  providerID: accepted.producer.providerID,
                  modelID: accepted.producer.modelID,
                  profileVariant: accepted.producer.profileVariant,
                  terminalStatus: accepted.terminalStatus,
                  usage: accepted.producer.usage,
                  uncertaintyClaims: decoded.value.document.uncertainty.length,
                  omissionClaims: decoded.value.document.omissions.length,
                },
                retry: retried.type,
                currentUse: current.admission.basis,
              }
            })
            const result = yield* Deferred.make<unknown>()
            yield* runState.startTurn({
              sessionID,
              turnID,
              envelopeFingerprint: TurnLifecycle.envelopeFingerprint(envelope),
              admit,
              work: conversion.pipe(
                Effect.tap((value) => Deferred.succeed(result, value)),
                Effect.as({ outcome: "completed" as const, reason: "normal" as const }),
              ),
            })
            const terminal = yield* runState.awaitTurn(sessionID, turnID)
            if (terminal.state !== "completed") {
              return yield* Effect.die(`Gate 11 evidence Turn terminated as ${terminal.state}`)
            }
            return yield* Deferred.await(result)
          }).pipe(Effect.scoped, Effect.provideService(InstanceRef, ctx), Effect.ensuring(store.dispose(ctx))),
        ),
      ),
    ),
  )
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  await import("../src/server/server").then(({ Server }) => Server.disposeDefault()).catch(() => {})
  await AppRuntime.dispose()
  await rm(directory, { recursive: true, force: true })
}
