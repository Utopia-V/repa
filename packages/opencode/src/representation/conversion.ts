export * as RepresentationConversion from "./conversion"

import { Artifact } from "@opencode-ai/core/artifact"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { ContentRootNTFS } from "@opencode-ai/core/content-root/ntfs"
import { Database } from "@opencode-ai/core/database/database"
import { Representation } from "@opencode-ai/core/representation"
import { Effect, Schema } from "effect"

import { LocalPDFProducer } from "./pdf-producer"
import { RepresentationModel } from "@/session/representation-model"
import type { MessageID, SessionID } from "@/session/schema"

export type ProducerSelection =
  | { readonly kind: "local_pdf" }
  | {
      readonly kind: "configured_model"
      readonly sessionID: SessionID
      readonly messageID: MessageID
    }

export class RootSelection {
  private constructor(
    readonly type: "artifact_provenance" | "explicit_learner",
    readonly basis?: string,
  ) {}

  static artifactProvenance() {
    return new RootSelection("artifact_provenance")
  }

  static explicitLearner(basis: string) {
    return new RootSelection("explicit_learner", basis)
  }
}

export type Input = {
  readonly effectiveArtifactID: Artifact.ArtifactID
  readonly sourceRevisionID: Artifact.RevisionID
  readonly contentRootID: ContentRoot.ContentRootID
  readonly relativePath: string
  readonly rootSelection: RootSelection
  readonly producer: ProducerSelection
  readonly authority: Representation.ConversionAuthority
  readonly abort?: AbortSignal
}

export type Result =
  | { readonly type: "accepted"; readonly representation: Representation.RepresentationInfo }
  | { readonly type: "already_accepted"; readonly representation: Representation.RepresentationInfo }

export type PreparedResult =
  | { readonly type: "already_accepted"; readonly representation: Representation.RepresentationInfo }
  | {
      readonly type: "candidate"
      readonly acceptance: Extract<Representation.PreparedAcceptance, { type: "candidate" }>
    }

export const FailureCode = Schema.Literals([
  "invalid_intent",
  "source_ineligible",
  "source_unavailable",
  "stale_source",
  "ambiguous_content_root",
  "content_root_stale",
  "unsupported_media",
  "source_too_large",
  "cancelled",
  "input_mismatch",
  "producer_unavailable",
  "producer_failed",
  "producer_timeout",
  "invalid_producer_output",
])
export type FailureCode = typeof FailureCode.Type

export class Failure extends Schema.TaggedErrorClass<Failure>()("RepresentationConversion.Failure", {
  code: FailureCode,
}) {}

type ResolvedProducer =
  | {
      readonly kind: "local_pdf"
      readonly recipe: typeof LocalPDFProducer.recipe
      readonly run: (
        bytes: Uint8Array,
        signal: AbortSignal,
      ) => Effect.Effect<LocalPDFProducer.Result, Failure, import("@opencode-ai/core/process").AppProcess.Service>
    }
  | {
      readonly kind: "configured_model"
      readonly recipe: Representation.ConfiguredModelProvenance
      readonly run: (bytes: Uint8Array, signal: AbortSignal) => Effect.Effect<RepresentationModel.Candidate, Failure>
    }

type Envelope = {
  readonly expected: Artifact.ExpectedSource
  readonly sourceRevisionID: Artifact.RevisionID
  readonly attribution: Artifact.AttributionBasis
  readonly mediaType: string
  readonly activeLocation: string
  readonly relativePath: string
  readonly root: ContentRoot.RootInfo
  readonly authorization: ContentRoot.ReadAuthorizationReceipt
  readonly producer: ResolvedProducer
}

export function prepare(input: Input) {
  return Effect.gen(function* () {
    if (!(input.rootSelection instanceof RootSelection)) return yield* fail("invalid_intent")
    if (input.rootSelection.type === "explicit_learner" && !input.rootSelection.basis?.trim()) {
      return yield* fail("invalid_intent")
    }

    const artifacts = yield* Artifact.Service
    const roots = yield* ContentRoot.Service
    const representations = yield* Representation.Service
    const source = yield* artifacts.getArtifact(input.effectiveArtifactID)
    yield* requireOrdinaryUse(source)
    const sourceRevisionID = source.source.currentRevisionID
    const attribution = source.source.revisionAttribution
    const mediaType = source.source.descriptor?.mediaType
    const activeLocation = source.source.activeBinding?.location
    if (!sourceRevisionID || !attribution || !mediaType || !activeLocation) {
      return yield* fail("source_unavailable")
    }
    if (sourceRevisionID !== input.sourceRevisionID) return yield* fail("stale_source")

    const relativePath = yield* Effect.try({
      try: () => ContentRootNTFS.normalizeRelativePath(input.relativePath),
      catch: () => new Failure({ code: "invalid_intent" }),
    })
    const producer = yield* resolveProducer(input.producer, mediaType)
    const identity = {
      effectiveArtifactID: source.id,
      sourceRevisionID,
      attribution,
      recipe: producer.recipe,
      authority: input.authority,
    }
    const resolution = yield* representations.resolveConversion(identity)
    if (resolution.type === "already_accepted") {
      return { type: "already_accepted", representation: resolution.representation } satisfies Result
    }

    const root = yield* roots.get(input.contentRootID)
    const authorization = yield* requireActiveReceipt(root)
    yield* requireRootSelection({
      artifacts,
      source,
      rootSelection: input.rootSelection,
      authorization,
    })
    const envelope = {
      expected: Artifact.expectedSource(source),
      sourceRevisionID,
      attribution,
      mediaType,
      activeLocation,
      relativePath,
      root,
      authorization,
      producer,
    } satisfies Envelope

    const rootInvalidation = yield* roots.subscribeInvalidation(root.id)
    const abort = input.abort ? AbortSignal.any([input.abort, rootInvalidation]) : rootInvalidation
    yield* requireNotAborted(abort)
    const currentRoot = yield* roots.get(root.id)
    const currentAuthorization = yield* requireActiveReceipt(currentRoot)
    if (!sameReceipt(authorization, currentAuthorization)) return yield* fail("content_root_stale")

    const read = yield* roots.read({
      contentRootID: root.id,
      relativePath,
      maxBytes: producer.recipe.limits.inputBytes,
    })
    if (!sameReceipt(authorization, read.authorization)) return yield* fail("content_root_stale")
    yield* requireNotAborted(abort)

    const observer = Artifact.Observer.trusted(observerIdentity(read.authorization), read.authorization.grantVersion)
    if (read.observation.result === "missing") {
      yield* artifacts.observe({
        expected: envelope.expected,
        observation: { result: "missing", observer, timeObserved: read.observation.timeObserved },
      })
      return yield* fail("source_unavailable")
    }
    if (
      read.observation.relativePath !== relativePath ||
      read.observation.descriptor.canonicalPath !== envelope.activeLocation ||
      read.observation.mediaType !== envelope.mediaType
    ) {
      return yield* fail("stale_source")
    }

    const inputBytes = read.observation.bytes.slice()
    const observed = yield* artifacts.observe({
      expected: envelope.expected,
      observation: {
        result: "present",
        fingerprint: read.observation.fingerprint,
        mediaType: read.observation.mediaType,
        observer,
        timeObserved: read.observation.timeObserved,
      },
    })
    yield* requireOrdinaryUse(observed.artifact)
    if (
      observed.artifact.id !== envelope.expected.artifactID ||
      observed.artifact.dispositionVersion !== envelope.expected.dispositionVersion ||
      observed.artifact.lineageVersion !== envelope.expected.lineageVersion ||
      observed.artifact.source.currentRevisionID !== envelope.sourceRevisionID ||
      !sameAttribution(observed.artifact.source.revisionAttribution, envelope.attribution)
    ) {
      return yield* fail("stale_source")
    }
    const revision = yield* artifacts.getRevision(observed.artifact.id, envelope.sourceRevisionID, envelope.attribution)
    if (
      revision.fingerprint.algorithm !== read.observation.fingerprint.algorithm ||
      revision.fingerprint.digest !== read.observation.fingerprint.digest ||
      revision.fingerprint.byteLength !== read.observation.fingerprint.byteLength ||
      inputBytes.byteLength !== revision.fingerprint.byteLength
    ) {
      return yield* fail("input_mismatch")
    }

    const sourceProof = {
      ordinary: {
        effectiveArtifactID: revision.effectiveArtifactID,
        dispositionVersion: observed.artifact.dispositionVersion,
        currentRevisionID: envelope.sourceRevisionID,
        attribution: envelope.attribution,
        lineageVersion: observed.artifact.lineageVersion,
        fingerprint: revision.fingerprint,
        mediaType: read.observation.mediaType,
      },
      sourceVersion: envelope.expected.sourceVersion,
      authorization: read.authorization,
      relativePath,
      descriptor: read.observation.descriptor,
      timeObserved: read.observation.timeObserved,
    } satisfies Representation.SourceProof

    const candidateRevisionID = Representation.createRevisionID()
    const result = yield* producer.run(inputBytes, abort)
    yield* requireNotAborted(abort)
    const candidate = producerCandidate(candidateRevisionID, producer, result)

    yield* requireNotAborted(abort)
    const acceptance = yield* representations.prepareAcceptance({
      ...identity,
      candidateRevisionID,
      sourceProof,
      candidate,
      timeAccepted: Date.now(),
    })
    if (acceptance.type === "already_accepted") return acceptance satisfies PreparedResult
    return { type: "candidate", acceptance } satisfies PreparedResult
  })
}

export function convert(input: Input) {
  return Effect.scoped(
    Effect.gen(function* () {
      const prepared = yield* prepare(input)
      if (prepared.type === "already_accepted") return prepared satisfies Result
      const database = yield* Database.Service
      const representation = yield* Effect.uninterruptible(
        database.db.transaction(prepared.acceptance.commit).pipe(Effect.catchTag("SqlError", Effect.die)),
      )
      return { type: "accepted", representation } satisfies Result
    }),
  )
}

function resolveProducer(selection: ProducerSelection, mediaType: string) {
  if (selection.kind === "local_pdf") {
    if (mediaType !== "application/pdf") return Effect.fail(new Failure({ code: "unsupported_media" }))
    return Effect.succeed({
      kind: "local_pdf" as const,
      recipe: LocalPDFProducer.recipe,
      run: (bytes: Uint8Array, signal: AbortSignal) =>
        LocalPDFProducer.convert(bytes, signal).pipe(Effect.mapError(mapPDFProducerFailure)),
    } satisfies ResolvedProducer)
  }
  return RepresentationModel.resolveRecipe({
    sessionID: selection.sessionID,
    messageID: selection.messageID,
    mediaType: mediaType as "application/pdf" | `image/${string}`,
  }).pipe(
    Effect.mapError(() => new Failure({ code: "producer_unavailable" })),
    Effect.map(
      (resolved) =>
        ({
          kind: "configured_model" as const,
          recipe: resolved.recipe,
          run: (bytes: Uint8Array, signal: AbortSignal) =>
            resolved
              .sample({
                bytes,
                attestation: {
                  algorithm: "sha256",
                  digest: sha256(bytes),
                  byteLength: bytes.byteLength,
                },
                abort: signal,
              })
              .pipe(Effect.mapError(mapModelFailure)),
        }) satisfies ResolvedProducer,
    ),
  )
}

function mapPDFProducerFailure(error: LocalPDFProducer.PDFProducerError) {
  if (error.code === "input_too_large") return new Failure({ code: "source_too_large" })
  if (error.code === "cancelled") return new Failure({ code: "cancelled" })
  if (error.code === "timed_out") return new Failure({ code: "producer_timeout" })
  if (
    error.code === "stdout_limit_exceeded" ||
    error.code === "stderr_output" ||
    error.code === "invalid_frame" ||
    error.code === "input_attestation_mismatch" ||
    error.code === "invalid_profile"
  ) {
    return new Failure({ code: "invalid_producer_output" })
  }
  return new Failure({ code: "producer_failed" })
}

function mapModelFailure(error: RepresentationModel.Failure) {
  if (error.code === "input_mismatch") return new Failure({ code: "input_mismatch" })
  if (error.code === "cancelled") return new Failure({ code: "cancelled" })
  if (error.code === "timed_out") return new Failure({ code: "producer_timeout" })
  if (error.code === "provider_failure" || error.code === "content_filtered") {
    return new Failure({ code: "producer_failed" })
  }
  if (
    error.code === "output_overflow" ||
    error.code === "diagnostic_overflow" ||
    error.code === "tool_attempted" ||
    error.code === "truncated" ||
    error.code === "unknown_finish" ||
    error.code === "incomplete" ||
    error.code === "invalid_utf8" ||
    error.code === "invalid_schema" ||
    error.code === "empty_rendition"
  ) {
    return new Failure({ code: "invalid_producer_output" })
  }
  return new Failure({ code: "producer_unavailable" })
}

function producerCandidate(
  candidateRevisionID: Representation.RevisionID,
  producer: ResolvedProducer,
  result: LocalPDFProducer.Result | RepresentationModel.Candidate,
): Representation.ProducerCandidate {
  const runIdentity = `representation-run:${candidateRevisionID}`
  if (producer.kind === "local_pdf") {
    const local = result as LocalPDFProducer.Result
    return {
      kind: "local_pdf",
      runIdentity,
      provenance: producer.recipe,
      input: local.input,
      bytes: local.canonicalBytes,
      diagnostics: local.diagnostics,
      usage: local.usage,
    }
  }
  const model = result as RepresentationModel.Candidate
  return {
    kind: "configured_model",
    runIdentity,
    provenance: producer.recipe,
    input: model.inputAttestation,
    bytes: model.bytes,
    diagnostics: model.usage
      ? model.usage.cost === undefined
        ? [{ code: "provider_cost_unavailable", count: 1 }]
        : []
      : [{ code: "provider_usage_unavailable", count: 1 }],
    usage: model.usage ?? { kind: "configured_model" },
  }
}

function requireOrdinaryUse(source: Artifact.ArtifactInfo) {
  if (source.withdrawalReason || source.correctionHidden) return fail("source_ineligible")
  return Effect.void
}

function requireActiveReceipt(root: ContentRoot.RootInfo) {
  const grant = root.grant
  if (
    root.disposition !== "active" ||
    root.bindingEpisode.timeEnded !== undefined ||
    !grant ||
    grant.timeClosed !== undefined ||
    root.verification.status !== "verified"
  ) {
    return Effect.fail(new Failure({ code: "content_root_stale" }))
  }
  return Effect.succeed({
    contentRootID: root.id,
    bindingID: root.binding.id,
    bindingEpisodeID: root.bindingEpisode.id,
    bindingEpisodeOrdinal: root.bindingEpisode.ordinal,
    grantEpisodeID: grant.id,
    grantVersion: root.grantVersion,
  } satisfies ContentRoot.ReadAuthorizationReceipt)
}

function requireRootSelection(input: {
  readonly artifacts: Artifact.Interface
  readonly source: Artifact.ArtifactInfo
  readonly rootSelection: RootSelection
  readonly authorization: ContentRoot.ReadAuthorizationReceipt
}) {
  if (input.rootSelection.type === "explicit_learner") return Effect.void
  const observationID = input.source.source.descriptor?.observationID
  if (!observationID) return fail("ambiguous_content_root")
  return Effect.gen(function* () {
    const observation = yield* input.artifacts.getObservation(observationID)
    if (
      observation.observer.capabilityIdentity !== observerIdentity(input.authorization) ||
      observation.observer.capabilityVersion !== input.authorization.grantVersion
    ) {
      return yield* fail("ambiguous_content_root")
    }
  })
}

function sameReceipt(left: ContentRoot.ReadAuthorizationReceipt, right: ContentRoot.ReadAuthorizationReceipt) {
  return (
    left.contentRootID === right.contentRootID &&
    left.bindingID === right.bindingID &&
    left.bindingEpisodeID === right.bindingEpisodeID &&
    left.bindingEpisodeOrdinal === right.bindingEpisodeOrdinal &&
    left.grantEpisodeID === right.grantEpisodeID &&
    left.grantVersion === right.grantVersion
  )
}

function sameAttribution(left: Artifact.AttributionBasis | undefined, right: Artifact.AttributionBasis) {
  if (!left || left.type !== right.type) return false
  if (left.type === "recorded" || right.type === "recorded") return true
  return left.memberID === right.memberID
}

function observerIdentity(receipt: ContentRoot.ReadAuthorizationReceipt) {
  return `content-root:${receipt.contentRootID}:${receipt.bindingID}:${receipt.grantEpisodeID}`
}

function requireNotAborted(signal: AbortSignal) {
  if (signal.aborted) return fail("cancelled")
  return Effect.void
}

function sha256(input: Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(input).digest("hex")
}

function fail(code: FailureCode) {
  return Effect.fail(new Failure({ code }))
}
