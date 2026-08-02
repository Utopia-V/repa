export * as MaterialTarget from "./target"

import { Artifact } from "../artifact"
import { ContentRoot } from "../content-root"
import { ContentRootNTFS } from "../content-root/ntfs"
import { Course } from "../course"
import { Representation } from "../representation"
import { Effect, Scope } from "effect"
import { MaterialSelector } from "./selector"
import { MapID, PreparationError, SelectorID } from "./schema"
import type { ArtifactTargetReceipt, MapProposal, MapTarget, SelectorInfo } from "./types"

export const limits = {
  artifactBytes: 64 * 1024 * 1024,
  representationIntegrityBytes: 64 * 1024 * 1024,
  representationReturnBytes: 64 * 1024 * 1024,
  representationRecords: 2_000,
} as const

export type ReadBudgets = {
  readonly artifactBytes: number
  readonly representation: Representation.ReadBudgets
}

export type TargetAccess =
  | {
      readonly type: "artifact"
      readonly source: ArtifactSourceSelection
    }
  | {
      readonly type: "representation"
      readonly effectiveArtifactID?: Artifact.ArtifactID
    }

export type Dependencies = {
  readonly artifacts: Artifact.Interface
  readonly roots: ContentRoot.Interface
  readonly currentRepresentations: Representation.CurrentUseReaderInterface
}

type MapAdmission =
  | {
      readonly type: "artifact"
      readonly expected: Artifact.ExpectedOrdinarySource
    }
  | {
      readonly type: "representation"
      readonly proof: Representation.CurrentUseProof
    }

type SelectorAdmission =
  | {
      readonly type: "artifact"
      readonly expected: Artifact.OrdinaryUseByteSnapshot
    }
  | {
      readonly type: "representation"
      readonly proof: Representation.CurrentUseProof
    }

type MapExpectation = {
  readonly mapID: MapID
  readonly canonicalInput: string
  readonly receipt:
    | ArtifactTargetReceipt
    | { readonly type: "representation"; readonly representationRevisionID: Representation.RevisionID }
  readonly witnesses: ReadonlyMap<SelectorID, MaterialSelector.Witness>
  readonly selections: ReadonlyMap<SelectorID, MaterialSelector.Selected>
  readonly admission: MapAdmission
}

type SelectorExpectation = {
  readonly mapID: MapID
  readonly selectorID: SelectorID
  readonly mapDispositionVersion: number
  readonly selected: MaterialSelector.Selected
  readonly admission: SelectorAdmission
}

const targetProofToken = Symbol("MaterialMap.TargetProof")

export class PreparedMapTarget {
  readonly receipt: MapExpectation["receipt"]
  readonly witnesses: ReadonlyMap<SelectorID, MaterialSelector.Witness>
  #expectation: MapExpectation

  constructor(token: symbol, expectation: MapExpectation) {
    if (token !== targetProofToken) throw new Error("Material target proofs are owner-issued")
    this.receipt = expectation.receipt
    this.witnesses = expectation.witnesses
    this.#expectation = expectation
  }

  expectation(token: symbol) {
    if (token !== targetProofToken) return
    return this.#expectation
  }
}

export class PreparedSelectorTarget {
  readonly bytes: Uint8Array
  readonly witness: MaterialSelector.Witness
  #expectation: SelectorExpectation

  constructor(token: symbol, expectation: SelectorExpectation) {
    if (token !== targetProofToken) throw new Error("Material selector proofs are owner-issued")
    this.bytes = expectation.selected.bytes
    this.witness = expectation.selected.witness
    this.#expectation = expectation
  }

  expectation(token: symbol) {
    if (token !== targetProofToken) return
    return this.#expectation
  }
}

type SourceSelectionExpectation = {
  readonly mode: "inherited_artifact_provenance" | "explicit_learner"
  readonly authorization: ContentRoot.ReadAuthorizationReceipt
  readonly grantEpisodeOrdinal: number
  readonly relativePath: string
  readonly basis?: string
  readonly capabilityIdentity?: string
  readonly capabilityVersion?: number
}

const sourceSelectionToken = Symbol("MaterialMap.ArtifactSourceSelection")

export class ArtifactSourceSelection {
  #expectation: SourceSelectionExpectation

  constructor(token: symbol, expectation: SourceSelectionExpectation) {
    if (token !== sourceSelectionToken) throw new Error("Artifact source selections are application-issued")
    this.#expectation = expectation
  }

  static inherited(root: ContentRoot.RootInfo, relativePath: string) {
    return new ArtifactSourceSelection(
      sourceSelectionToken,
      sourceExpectation(root, relativePath, {
        mode: "inherited_artifact_provenance",
      }),
    )
  }

  static explicitLearner(input: {
    readonly root: ContentRoot.RootInfo
    readonly relativePath: string
    readonly basis: string
    readonly capabilityIdentity: string
    readonly capabilityVersion: number
  }) {
    return new ArtifactSourceSelection(
      sourceSelectionToken,
      sourceExpectation(input.root, input.relativePath, {
        mode: "explicit_learner",
        basis: input.basis,
        capabilityIdentity: input.capabilityIdentity,
        capabilityVersion: input.capabilityVersion,
      }),
    )
  }

  expectation(token: symbol) {
    if (token !== sourceSelectionToken) return
    return this.#expectation
  }
}

export function prepareMap(
  dependencies: Dependencies,
  input: {
    readonly mapID: MapID
    readonly canonicalInput: string
    readonly proposal: MapProposal
    readonly access: TargetAccess
    readonly budgets: ReadBudgets
    readonly abort?: AbortSignal
  },
): Effect.Effect<
  PreparedMapTarget,
  Artifact.Error | ContentRoot.Error | Representation.Error | PreparationError,
  Scope.Scope
> {
  return Effect.gen(function* () {
    yield* requireBudgets(input.budgets)
    const coordinates = input.proposal.outline.flatMap((node) => node.selectors.map((selector) => selector.coordinate))
    if (input.proposal.target.type === "artifact") {
      if (input.access.type !== "artifact") return yield* fail("source_provenance", "Artifact access is required")
      const observed = yield* readArtifact(dependencies, {
        target: input.proposal.target,
        source: input.access.source,
        maxBytes: input.budgets.artifactBytes,
        abort: input.abort,
      })
      const target = {
        type: "artifact" as const,
        bytes: observed.bytes,
        fingerprint: observed.snapshot.fingerprint,
      }
      const selections = yield* selectAll(input.proposal, target)
      const witnesses = new Map(Array.from(selections, ([id, selected]) => [id, selected.witness] as const))
      return new PreparedMapTarget(targetProofToken, {
        mapID: input.mapID,
        canonicalInput: input.canonicalInput,
        receipt: observed.receipt,
        witnesses,
        selections,
        admission: {
          type: "artifact",
          expected: { source: observed.expected, revision: observed.snapshot },
        },
      })
    }
    if (input.access.type !== "representation") {
      return yield* fail("stale_target", "Representation access is required")
    }
    const observed = yield* readRepresentation(dependencies, {
      target: input.proposal.target,
      coordinates,
      access: input.access,
      budgets: input.budgets.representation,
      abort: input.abort,
    })
    const selections = yield* selectAll(input.proposal, observed.content)
    const witnesses = new Map(Array.from(selections, ([id, selected]) => [id, selected.witness] as const))
    return new PreparedMapTarget(targetProofToken, {
      mapID: input.mapID,
      canonicalInput: input.canonicalInput,
      receipt: {
        type: "representation",
        representationRevisionID: observed.read.representation.id,
      },
      witnesses,
      selections,
      admission: { type: "representation", proof: observed.read.proof },
    })
  })
}

export function prepareSelector(
  dependencies: Dependencies,
  input: {
    readonly mapID: MapID
    readonly mapDispositionVersion: number
    readonly target:
      | ArtifactTargetReceipt
      | { readonly type: "representation"; readonly representationRevisionID: Representation.RevisionID }
    readonly selector: SelectorInfo
    readonly access: TargetAccess
    readonly budgets: ReadBudgets
    readonly abort?: AbortSignal
  },
): Effect.Effect<
  PreparedSelectorTarget,
  Artifact.Error | ContentRoot.Error | Representation.Error | PreparationError,
  Scope.Scope
> {
  return Effect.gen(function* () {
    yield* requireBudgets(input.budgets)
    if (input.target.type === "artifact") {
      if (input.access.type !== "artifact") return yield* fail("source_provenance", "Artifact access is required")
      const observed = yield* readArtifact(dependencies, {
        target: input.target,
        source: input.access.source,
        maxBytes: input.budgets.artifactBytes,
        abort: input.abort,
      })
      const selected = yield* selectOne(
        {
          type: "artifact",
          bytes: observed.bytes,
          fingerprint: observed.snapshot.fingerprint,
        },
        input.selector,
      )
      return new PreparedSelectorTarget(targetProofToken, {
        mapID: input.mapID,
        selectorID: input.selector.id,
        mapDispositionVersion: input.mapDispositionVersion,
        selected,
        admission: { type: "artifact", expected: Artifact.ordinaryUseByteSnapshot(observed.snapshot) },
      })
    }
    if (input.access.type !== "representation") {
      return yield* fail("stale_target", "Representation access is required")
    }
    const observed = yield* readRepresentation(dependencies, {
      target: input.target,
      coordinates: [input.selector.coordinate],
      access: input.access,
      budgets: input.budgets.representation,
      abort: input.abort,
    })
    const selected = yield* selectOne(observed.content, input.selector)
    return new PreparedSelectorTarget(targetProofToken, {
      mapID: input.mapID,
      selectorID: input.selector.id,
      mapDispositionVersion: input.mapDispositionVersion,
      selected,
      admission: { type: "representation", proof: observed.read.proof },
    })
  })
}

export function requirePreparedMap(
  tx: Artifact.Transaction,
  proof: PreparedMapTarget,
  input: { readonly mapID: MapID; readonly canonicalInput: string },
) {
  return Effect.gen(function* () {
    const expected = proof instanceof PreparedMapTarget ? proof.expectation(targetProofToken) : undefined
    if (!expected || expected.mapID !== input.mapID || expected.canonicalInput !== input.canonicalInput) {
      return yield* fail("stale_target", "Prepared target proof belongs to another Map proposal")
    }
    if (expected.admission.type === "artifact") {
      yield* Artifact.requireExpectedOrdinarySource(tx, expected.admission.expected)
    } else {
      yield* Representation.requireCurrentUseProof(tx, expected.admission.proof)
    }
    return expected
  })
}

export function preparedSelectorFromMap(
  proof: PreparedMapTarget,
  input: { readonly mapID: MapID; readonly selectorID: SelectorID; readonly mapDispositionVersion: number },
): Effect.Effect<PreparedSelectorTarget, PreparationError> {
  const expected = proof instanceof PreparedMapTarget ? proof.expectation(targetProofToken) : undefined
  const selected = expected?.selections.get(input.selectorID)
  if (!expected || expected.mapID !== input.mapID || !selected) {
    return Effect.fail(new PreparationError({ code: "stale_target", detail: "Prepared Map omitted the selector" }))
  }
  return Effect.succeed(
    new PreparedSelectorTarget(targetProofToken, {
      mapID: input.mapID,
      selectorID: input.selectorID,
      mapDispositionVersion: input.mapDispositionVersion,
      selected,
      admission:
        expected.admission.type === "artifact"
          ? { type: "artifact", expected: Artifact.ordinaryUseByteSnapshot(expected.admission.expected.revision) }
          : { type: "representation", proof: expected.admission.proof },
    }),
  )
}

export function requirePreparedSelector(
  tx: Artifact.Transaction,
  proof: PreparedSelectorTarget,
  input: { readonly mapID: MapID; readonly selectorID: SelectorID; readonly mapDispositionVersion: number },
) {
  return Effect.gen(function* () {
    const expected = proof instanceof PreparedSelectorTarget ? proof.expectation(targetProofToken) : undefined
    if (
      !expected ||
      expected.mapID !== input.mapID ||
      expected.selectorID !== input.selectorID ||
      expected.mapDispositionVersion !== input.mapDispositionVersion
    ) {
      return yield* fail("stale_target", "Prepared selector proof belongs to another current-use request")
    }
    if (expected.admission.type === "artifact") {
      yield* Artifact.requireOrdinaryUseByteSnapshot(tx, expected.admission.expected)
    } else {
      yield* Representation.requireCurrentUseProof(tx, expected.admission.proof)
    }
    return expected
  })
}

function readArtifact(
  dependencies: Dependencies,
  input: {
    readonly target: Extract<MapTarget, { type: "artifact" }> | ArtifactTargetReceipt
    readonly source: ArtifactSourceSelection
    readonly maxBytes: number
    readonly abort?: AbortSignal
  },
) {
  return Effect.gen(function* () {
    const selection =
      input.source instanceof ArtifactSourceSelection ? input.source.expectation(sourceSelectionToken) : undefined
    if (!selection) return yield* fail("ambiguous_content_root", "One exact source provenance episode is required")
    const source = yield* dependencies.artifacts.getArtifact(input.target.effectiveArtifactID)
    const expected = Artifact.expectedSource(source)
    const revisionID = source.source.currentRevisionID
    const attribution = source.source.revisionAttribution
    const mediaType = source.source.descriptor?.mediaType
    const activeBinding = source.source.activeBinding
    if (
      source.withdrawalReason ||
      source.correctionHidden ||
      !revisionID ||
      !attribution ||
      !mediaType ||
      !activeBinding ||
      source.source.availability !== "available"
    ) {
      return yield* fail("source_ineligible", "The Artifact is not eligible for ordinary current use")
    }
    if (revisionID !== input.target.revisionID || !sameAttribution(attribution, input.target.attribution)) {
      return yield* fail("stale_target", "The Artifact no longer names the requested exact Revision")
    }
    const root = yield* dependencies.roots.get(selection.authorization.contentRootID)
    const authorization = yield* requireRoot(root)
    if (!sameReceipt(authorization, selection.authorization) || root.grant?.ordinal !== selection.grantEpisodeOrdinal) {
      return yield* fail("source_provenance", "The selected ContentRoot episode changed")
    }
    const relativePath = yield* Effect.try({
      try: () => ContentRootNTFS.normalizeRelativePath(selection.relativePath),
      catch: () => new PreparationError({ code: "source_provenance", detail: "The source path is invalid" }),
    })
    const resolved = ContentRootNTFS.containsPath(root.binding.descriptor, relativePath)
    if (resolved !== activeBinding.location) {
      return yield* fail("source_provenance", "The selected path is not the Artifact active source location")
    }
    if (selection.mode === "inherited_artifact_provenance") {
      const observationID = source.source.descriptor?.observationID
      if (!observationID) return yield* fail("ambiguous_content_root", "Artifact provenance is unavailable")
      const observation = yield* dependencies.artifacts.getObservation(observationID)
      if (
        observation.observer.capabilityIdentity !== observerIdentity(authorization) ||
        observation.observer.capabilityVersion !== authorization.grantVersion
      ) {
        return yield* fail("ambiguous_content_root", "The named root is not the inherited Artifact provenance")
      }
    } else if (
      !selection.basis?.trim() ||
      !selection.capabilityIdentity?.trim() ||
      !Number.isSafeInteger(selection.capabilityVersion) ||
      selection.capabilityVersion! < 0
    ) {
      return yield* fail("ambiguous_content_root", "Explicit source selection lacks learner authority")
    }
    const invalidation = yield* dependencies.roots.subscribeInvalidation(root.id)
    const abort = input.abort ? AbortSignal.any([input.abort, invalidation]) : invalidation
    yield* requireNotAborted(abort)
    const read = yield* dependencies.roots
      .read({ contentRootID: root.id, relativePath, maxBytes: input.maxBytes })
      .pipe(
        Effect.catchIf(
          (error) => error instanceof ContentRoot.PathError && error.reason === "budget_exceeded",
          () => fail("over_budget", "The Artifact exceeds the stable-read byte budget"),
        ),
      )
    if (!sameReceipt(authorization, read.authorization)) {
      return yield* fail("source_provenance", "The ContentRoot read used a different authorization episode")
    }
    yield* requireNotAborted(abort)
    const observer = Artifact.Observer.trusted(observerIdentity(read.authorization), read.authorization.grantVersion)
    if (read.observation.result === "missing") {
      yield* dependencies.artifacts.observe({
        expected,
        observation: { result: "missing", observer, timeObserved: read.observation.timeObserved },
      })
      return yield* fail("source_unavailable", "The exact active Artifact source is missing")
    }
    if (
      read.observation.relativePath !== relativePath ||
      read.observation.descriptor.canonicalPath !== activeBinding.location
    ) {
      return yield* fail("source_provenance", "The stable read did not resolve the captured Artifact source")
    }
    const bytes = read.observation.bytes.slice()
    const observed = yield* dependencies.artifacts.observe({
      expected,
      observation: {
        result: "present",
        fingerprint: read.observation.fingerprint,
        mediaType,
        observer,
        timeObserved: read.observation.timeObserved,
      },
    })
    if (
      observed.artifact.id !== expected.artifactID ||
      observed.artifact.dispositionVersion !== expected.dispositionVersion ||
      observed.artifact.lineageVersion !== expected.lineageVersion ||
      observed.artifact.source.sourceVersion !== expected.sourceVersion ||
      observed.artifact.source.currentRevisionID !== revisionID ||
      !sameAttribution(observed.artifact.source.revisionAttribution, attribution)
    ) {
      return yield* fail("stale_target", "The Artifact changed while its target was prepared")
    }
    const revision = yield* dependencies.artifacts.getRevision(observed.artifact.id, revisionID, attribution)
    const snapshot = {
      effectiveArtifactID: observed.artifact.id,
      dispositionVersion: observed.artifact.dispositionVersion,
      currentRevisionID: revisionID,
      attribution,
      lineageVersion: observed.artifact.lineageVersion,
      fingerprint: revision.fingerprint,
      mediaType: observed.artifact.source.descriptor?.mediaType ?? mediaType,
    } satisfies Artifact.OrdinaryUseRevisionSnapshot
    if (
      !sameWitness(snapshot.fingerprint, read.observation.fingerprint) ||
      bytes.byteLength !== snapshot.fingerprint.byteLength ||
      (input.target.type === "artifact" &&
        "fingerprint" in input.target &&
        !sameWitness(snapshot.fingerprint, input.target.fingerprint))
    ) {
      return yield* fail("stale_target", "The observed bytes do not match the exact Artifact target")
    }
    return {
      bytes,
      expected,
      snapshot,
      receipt: {
        type: "artifact" as const,
        effectiveArtifactID: snapshot.effectiveArtifactID,
        revisionID: snapshot.currentRevisionID,
        attribution: snapshot.attribution,
        dispositionVersion: snapshot.dispositionVersion,
        lineageVersion: snapshot.lineageVersion,
        sourceVersion: expected.sourceVersion,
        artifactBindingID: activeBinding.id,
        activeLocation: activeBinding.location,
        descriptorObservationID: expected.descriptorObservationID!,
        descriptorCorrectionID: expected.descriptorCorrectionID,
        fingerprint: snapshot.fingerprint,
        mediaType: snapshot.mediaType,
        authorization: {
          kind: "content_root",
          root: root.binding.descriptor,
          relativePath,
          canonicalPath: read.observation.descriptor.canonicalPath,
          contentRoot: read.authorization,
          grantEpisodeOrdinal: selection.grantEpisodeOrdinal,
        },
        relativePath,
        descriptor: read.observation.descriptor,
        timeObserved: read.observation.timeObserved,
      } satisfies ArtifactTargetReceipt,
    }
  })
}

function readRepresentation(
  dependencies: Dependencies,
  input: {
    readonly target:
      | Extract<MapTarget, { type: "representation" }>
      | { readonly type: "representation"; readonly representationRevisionID: Representation.RevisionID }
    readonly coordinates: readonly MaterialSelector.Coordinate[]
    readonly access: Extract<TargetAccess, { type: "representation" }>
    readonly budgets: Representation.ReadBudgets
    readonly abort?: AbortSignal
  },
) {
  return Effect.gen(function* () {
    yield* requireNotAborted(input.abort)
    const representation = yield* dependencies.currentRepresentations.describeForCurrentUse(
      input.target.representationRevisionID,
    )
    const effectiveArtifactID = representation.effectiveArtifactID
    if (input.access.effectiveArtifactID && input.access.effectiveArtifactID !== effectiveArtifactID) {
      return yield* fail("stale_target", "The Representation access hint names another Artifact")
    }
    const plan = MaterialSelector.representationReadSelection(input.coordinates, representation.profile)
    if (!plan.ok) return yield* fail("unsupported_selector", `Selector/profile mismatch: ${plan.error}`)
    const selection =
      plan.value.type === "pdf_pages" ? { type: "pdf_pages" as const, startPage: plan.value.startPage } : plan.value
    const read = yield* dependencies.currentRepresentations
      .readForCurrentUse({
        representationRevisionID: representation.id,
        effectiveArtifactID,
        selection,
        budgets: input.budgets,
      })
      .pipe(
        Effect.catchIf(
          (error) =>
            error instanceof Representation.ReturnBudgetExceededError ||
            error instanceof Representation.IntegrityBudgetExceededError,
          () => fail("over_budget", "The Representation exceeds the current-use read budget"),
        ),
      )
    yield* requireNotAborted(input.abort)
    if (read.representation.id !== input.target.representationRevisionID) {
      return yield* fail("stale_target", "The reader returned another Representation Revision")
    }
    if (plan.value.type === "pdf_pages" && read.content.records < plan.value.records && read.content.truncated) {
      return yield* fail("over_budget", "The Representation page prefix did not reach the selector end")
    }
    return {
      read,
      content: {
        type: "representation" as const,
        profile: read.representation.profile,
        bytes: read.content.bytes,
        complete: plan.value.type !== "pdf_pages",
        ...(plan.value.type === "pdf_pages" ? { startPage: plan.value.startPage } : {}),
        output: {
          algorithm: "sha256" as const,
          digest: read.representation.output.digest,
          byteLength: read.representation.output.byteLength,
        },
      },
    }
  })
}

function selectAll(proposal: MapProposal, target: MaterialSelector.TargetContent) {
  return Effect.gen(function* () {
    const selected: readonly (readonly [SelectorID, MaterialSelector.Selected])[] = yield* Effect.forEach(
      proposal.outline.flatMap((node) => node.selectors),
      (selector) =>
        Effect.gen(function* () {
          const result = yield* selectCoordinate(target, selector.coordinate)
          return [selector.id, result] as const
        }),
    )
    return new Map(selected)
  })
}

function selectOne(target: MaterialSelector.TargetContent, selector: SelectorInfo) {
  return Effect.gen(function* () {
    const selected = yield* selectCoordinate(target, selector.coordinate)
    if (!sameWitness(selected.witness, selector.witness)) {
      return yield* fail("witness_mismatch", "The selected current content does not match the stored witness")
    }
    return selected
  })
}

function selectCoordinate(target: MaterialSelector.TargetContent, coordinate: MaterialSelector.Coordinate) {
  return Effect.gen(function* () {
    const selected = MaterialSelector.select(target, coordinate)
    if (selected.ok) return selected.value
    const code = selected.error === "profile_mismatch" ? "unsupported_selector" : "invalid_selector"
    return yield* fail(code, `Selector validation failed: ${selected.error}`)
  })
}

function requireBudgets(budgets: ReadBudgets) {
  const valid =
    Number.isSafeInteger(budgets.artifactBytes) &&
    budgets.artifactBytes > 0 &&
    budgets.artifactBytes <= limits.artifactBytes &&
    Number.isSafeInteger(budgets.representation.integrityScanBytes) &&
    budgets.representation.integrityScanBytes > 0 &&
    budgets.representation.integrityScanBytes <= limits.representationIntegrityBytes &&
    Number.isSafeInteger(budgets.representation.returnBytes) &&
    budgets.representation.returnBytes > 0 &&
    budgets.representation.returnBytes <= limits.representationReturnBytes &&
    Number.isSafeInteger(budgets.representation.records) &&
    budgets.representation.records > 0 &&
    budgets.representation.records <= limits.representationRecords
  if (valid) return Effect.void
  return fail("over_budget", "Material read budgets must be positive safe integers within the Gate 13 limits")
}

function sourceExpectation(
  root: ContentRoot.RootInfo,
  relativePath: string,
  authority:
    | { readonly mode: "inherited_artifact_provenance" }
    | {
        readonly mode: "explicit_learner"
        readonly basis: string
        readonly capabilityIdentity: string
        readonly capabilityVersion: number
      },
): SourceSelectionExpectation {
  const grant = root.grant
  if (!grant) throw new Error("An active ContentRoot grant is required")
  return {
    ...authority,
    authorization: {
      contentRootID: root.id,
      bindingID: root.binding.id,
      bindingEpisodeID: root.bindingEpisode.id,
      bindingEpisodeOrdinal: root.bindingEpisode.ordinal,
      grantEpisodeID: grant.id,
      grantVersion: root.grantVersion,
    },
    grantEpisodeOrdinal: grant.ordinal,
    relativePath,
  }
}

function requireRoot(root: ContentRoot.RootInfo) {
  const grant = root.grant
  if (
    root.disposition !== "active" ||
    root.bindingEpisode.timeEnded !== undefined ||
    !grant ||
    grant.timeClosed !== undefined ||
    root.verification.status !== "verified"
  ) {
    return fail("source_provenance", "The selected ContentRoot episode is not currently authorized")
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

function sameWitness(left: MaterialSelector.Witness, right: MaterialSelector.Witness) {
  return left.algorithm === right.algorithm && left.digest === right.digest && left.byteLength === right.byteLength
}

function observerIdentity(receipt: ContentRoot.ReadAuthorizationReceipt) {
  return `content-root:${receipt.contentRootID}:${receipt.bindingID}:${receipt.grantEpisodeID}`
}

function requireNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) return fail("cancelled", "Material preparation was cancelled")
  return Effect.void
}

function fail(code: PreparationError["code"], detail: string) {
  return Effect.fail(new PreparationError({ code, detail }))
}
