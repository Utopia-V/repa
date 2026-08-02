export * as LearningBootstrap from "./learning-bootstrap"

import { and, asc, eq, isNull } from "drizzle-orm"
import { Effect } from "effect"
import { isDeepStrictEqual } from "node:util"
import { Artifact } from "./artifact"
import { ContentRoot } from "./content-root"
import { Course } from "./course"
import { Database } from "./database/database"
import { LearnerNavigation } from "./learner-navigation"
import { LearningFrontier } from "./learning-frontier"
import { Occurrence } from "./learning-command/occurrence"
import {
  admitPhysicalInvocation,
  appliedMutation,
  errorSettlement,
  findPhysicalInvocation,
  insertPhysicalReceipt,
  invocationConflict,
  lookupPhysicalInvocation,
  occurrenceAvailable,
  requirePhysicalSettlement,
  requireSettlementMetadata,
  settlePhysicalInvocation,
} from "./learning-command/physical"
import type { InvocationEnvelope, SettlementMetadata } from "./learning-command/physical-schema"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "./learning-command/sql"
import type { Transaction } from "./learning-command/transaction"
import { MaterialMap } from "./material-map"
import { Representation } from "./representation"
import { TurnLifecycle, type ValidatedAgentActionRegistration } from "./turn/turn"
import { Wildcard } from "./util/wildcard"
import type { PermissionV1 } from "./v1/permission"
import type { PartID } from "./v1/session"
import {
  LearningBootstrapAlignmentResultTable,
  LearningBootstrapAnchorResultTable,
  LearningBootstrapCapabilityIssueTable,
  LearningBootstrapCapabilitySettlementTable,
  LearningBootstrapCommitSealTable,
  LearningBootstrapCourseResultTable,
  LearningBootstrapDispositionTable,
  LearningBootstrapEffectTable,
  LearningBootstrapMapResultTable,
  LearningBootstrapMaterialResultTable,
  LearningBootstrapRouteResultTable,
  LearningBootstrapSelectionResultTable,
  LearningCourseMaterialAdoptionTable,
} from "./learning-bootstrap/sql"
import {
  InvalidCommandError,
  IntegrityError,
  createAdoptionID,
  createEffectID,
  limits,
  type Acknowledgement,
  type AgentAction,
  type AlignmentIntent,
  type AlreadyAppliedSettlement,
  type AnchorIntent,
  type AppliedSettlement,
  type AuthorshipIntent,
  type BootstrapOwnerSnapshots,
  type Candidate,
  type CanonicalCommand,
  type CapabilityOutcome,
  type ChildResult,
  type Command,
  type CourseSnapshot,
  type EffectID,
  type LocalReadIntent,
  type MapIntent,
  type MaterialIntent,
  type MaterialSnapshot,
  type MaterializedCandidate,
  type NoChangeSettlement,
  type RevisionIntent,
  type SemanticTerminal,
} from "./learning-bootstrap/schema"

export {
  AdoptionID,
  EffectID,
  InvalidCommandError,
  IntegrityError,
  createAdoptionID,
  createEffectID,
  limits,
} from "./learning-bootstrap/schema"
export type {
  Acknowledgement,
  AgentAction,
  AlreadyAppliedSettlement,
  AppliedSettlement,
  Candidate,
  CanonicalCommand,
  CapabilityOutcome,
  ChildResult,
  Command,
  MaterializedCandidate,
  NoChangeSettlement,
  SemanticTerminal,
} from "./learning-bootstrap/schema"

export const UPDATE_LEARNING_COURSE_CAPABILITY = "update_learning_course"
export const UPDATE_LEARNING_COURSE_VERSION = 1
export const PERMISSION_PATTERN = "learning_course"

const identity = {
  name: UPDATE_LEARNING_COURSE_CAPABILITY,
  version: UPDATE_LEARNING_COURSE_VERSION,
} as const

export type Invocation = Readonly<{
  envelope: InvocationEnvelope
  command: Command
}>

export type PolicyInput = Readonly<{
  partID: PartID
  outcome: "policy_allow" | "policy_deny"
  policyBasis: Readonly<Record<string, unknown>>
  time: number
  order: number
}>

export type PromptIssueInput = Readonly<{
  partID: PartID
  requestID: PermissionV1.ID
  policyBasis: Readonly<Record<string, unknown>>
  shownScope: Readonly<Record<string, unknown>>
  time: number
  order: number
}>

export type PromptSettlementInput = Readonly<{
  partID: PartID
  requestID: PermissionV1.ID
  outcome: "prompted_allow" | "prompted_deny" | "prompted_correct" | "prompted_cancel"
  reply: Readonly<Record<string, unknown>>
  time: number
  order: number
}>

export type InvocationVersion = Readonly<{
  version: 1
  disposition: "candidate_v1" | "semantic_terminal_v1" | "physical_no_effect"
  status: "admitted" | "applied" | "already_applied" | "no_change" | "error"
  settlement: unknown
  candidate?: Candidate
  semanticTerminal?: SemanticTerminal
  capabilityOutcome?: CapabilityOutcome
  permissionRequestID?: PermissionV1.ID
  timeAdmitted: number
}>

export function canonicalizeCommand(input: Command): CanonicalCommand {
  if (!closedCommand(input)) throw new InvalidCommandError({ reason: "validation_error" })
  const course =
    input.course.type === "new"
      ? { type: "new" as const, title: normalizeText(input.course.title) }
      : {
          type: "existing" as const,
          courseID: input.course.courseID,
          ...(input.course.title === undefined ? {} : { title: normalizeText(input.course.title) }),
        }
  const route = input.route
    ? input.route.type === "successor_revision"
      ? {
          type: input.route.type,
          key: normalizeKey(input.route.key),
          viewID: input.route.viewID,
          predecessorRevisionID: input.route.predecessorRevisionID,
          authorship: input.route.authorship,
          revision: canonicalRevision(input.route.revision),
        }
      : {
          type: input.route.type,
          key: normalizeKey(input.route.key),
          name: normalizeText(input.route.name),
          authorship: input.route.authorship,
          revision: canonicalRevision(input.route.revision),
        }
    : undefined
  const selection = input.selection ?? ({ type: "preserve" } as const)
  const materials = (input.materials ?? [])
    .map((material): MaterialIntent => {
      if (material.type === "representation") {
        return { ...material, key: normalizeKey(material.key) }
      }
      if (material.type === "artifact") {
        return {
          ...material,
          key: normalizeKey(material.key),
          attribution: { ...material.attribution },
          ...(material.read ? { read: canonicalRead(material.read) } : {}),
        }
      }
      return { type: "local", key: normalizeKey(material.key), ...canonicalRead(material) }
    })
    .sort(compareKey)
  const maps = (input.maps ?? [])
    .map(
      (map): MapIntent => ({
        key: normalizeKey(map.key),
        materialKey: normalizeKey(map.materialKey),
        authorship: map.authorship,
        ...(map.supersedesMapID ? { supersedesMapID: map.supersedesMapID } : {}),
        outline: map.outline.map((node) => ({
          key: normalizeKey(node.key),
          ...(node.parentKey ? { parentKey: normalizeKey(node.parentKey) } : {}),
          title: normalizeText(node.title),
          selectors: node.selectors.map((selector) => ({
            key: normalizeKey(selector.key),
            coordinate: structuredClone(selector.coordinate),
          })),
        })),
      }),
    )
    .sort(compareKey)
  const alignments = (input.alignments ?? [])
    .map(
      (alignment): AlignmentIntent => ({
        key: normalizeKey(alignment.key),
        mapKey: normalizeKey(alignment.mapKey),
        selectorKey: normalizeKey(alignment.selectorKey),
        authorship: alignment.authorship,
        course:
          alignment.course.type === "route_item"
            ? { type: "route_item", itemKey: normalizeKey(alignment.course.itemKey) }
            : { ...alignment.course },
        reason: normalizeText(alignment.reason),
        ...(alignment.supersedesAlignmentID ? { supersedesAlignmentID: alignment.supersedesAlignmentID } : {}),
      }),
    )
    .sort(compareKey)
  const anchor = canonicalAnchor(input.anchor ?? { type: "preserve" })
  const command = {
    schemaVersion: 1 as const,
    course,
    ...(route ? { route } : {}),
    selection,
    materials,
    maps,
    alignments,
    anchor,
  }
  validateCanonical(command)
  if (bytes(JSON.stringify(command)) > limits.aggregateBytes) {
    throw new InvalidCommandError({ reason: "capacity_exceeded" })
  }
  return command
}

export function commandFingerprint(command: CanonicalCommand) {
  return fingerprint(command)
}

export function reserve(tx: Transaction, input: Invocation & Readonly<{ settlement: SettlementMetadata }>) {
  return Effect.gen(function* () {
    const command = yield* canonicalCommandEffect(input.command)
    const semanticFingerprint = commandFingerprint(command)
    const physicalFingerprint = fingerprint({ identity, envelope: input.envelope, command })
    const existing = yield* findPhysicalInvocation(tx, input, physicalFingerprint, identity)
    if (existing) {
      const disposition = yield* readDisposition(tx, existing.part_id)
      if (existing.status === "admitted") {
        if (!disposition || disposition.disposition !== "candidate_v1") {
          return yield* integrity("Only a complete learning-bootstrap candidate may remain admitted")
        }
        return { type: "admitted" as const, candidate: candidateInfo(disposition) }
      }
      return {
        type: "replay" as const,
        settlement: requirePhysicalSettlement(existing),
        ...(disposition?.disposition === "candidate_v1" ? { candidate: candidateInfo(disposition) } : {}),
        ...(disposition?.disposition === "semantic_terminal_v1"
          ? { semanticTerminal: semanticTerminalInfo(disposition) }
          : {}),
      }
    }

    yield* requireEnvelope(input.envelope)
    const registration = registrationFromEnvelope(input.envelope)
    yield* TurnLifecycle.validateLearningCommandRegistration(tx, registration).pipe(
      Effect.mapError((error) => new IntegrityError({ detail: error.reason })),
    )
    yield* requireSettlementMetadata(input.envelope.timeAdmitted, input.settlement)
    const addressFingerprint = fingerprint({ occurrenceID: input.envelope.occurrenceID, slot: "learning_bootstrap" })
    const semantic = yield* resolveSemantic(tx, input.envelope.occurrenceID, semanticFingerprint)
    if (semantic.type !== "new") {
      const terminal = {
        kind: "semantic_terminal_v1",
        outcome: semantic.type,
        canonicalCommand: command,
        commandFingerprint: semanticFingerprint,
        semanticAddressFingerprint: addressFingerprint,
        existingEffectID: semantic.effect.id,
        existingIntentFingerprint: semantic.effect.semantic_fingerprint,
      } satisfies SemanticTerminal
      yield* admitPhysicalInvocation(tx, {
        envelope: input.envelope,
        fingerprint: physicalFingerprint,
        command: identity,
      })
      yield* tx
        .insert(LearningBootstrapDispositionTable)
        .values({
          invocation_part_id: input.envelope.partID,
          disposition: "semantic_terminal_v1",
          command_fingerprint: semanticFingerprint,
          canonical_command: command,
          semantic_address_fingerprint: addressFingerprint,
          semantic_outcome: semantic.type,
          existing_effect_id: semantic.effect.id,
          existing_intent_fingerprint: semantic.effect.semantic_fingerprint,
          time_disposed: input.envelope.timeAdmitted,
        })
        .run()
        .pipe(Effect.orDie)
      if (semantic.type === "already_applied") {
        const settlement = yield* settleAlreadyApplied(tx, input.envelope.partID, semantic.effect.id, input.settlement)
        return { type: "settled" as const, settlement, semanticTerminal: terminal }
      }
      const settlement = errorSettlement("semantic_conflict", input.settlement, { effectID: semantic.effect.id })
      yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
      return { type: "settled" as const, settlement, semanticTerminal: terminal }
    }

    const trusted = yield* TurnLifecycle.validateAgentActionRegistration(tx, registration).pipe(
      Effect.mapError((error) => new IntegrityError({ detail: error.reason })),
    )
    yield* admitPhysicalInvocation(tx, {
      envelope: input.envelope,
      fingerprint: physicalFingerprint,
      command: identity,
    })
    if (!hasWriteMembership(trusted)) {
      const settlement = errorSettlement("permission_rejected", input.settlement)
      yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    if (yield* appliedMutation(tx, input.envelope.assistantMessageID)) {
      const settlement = errorSettlement("context_refresh_required", input.settlement)
      yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const materialized = yield* materializeCandidate(tx, input.envelope, command).pipe(
      Effect.map((value) => ({ type: "success" as const, value })),
      Effect.catch((error) => Effect.succeed({ type: "failure" as const, error })),
    )
    if (materialized.type === "failure") {
      const settlement = bootstrapErrorSettlement(materialized.error, input.settlement)
      yield* settlePhysicalInvocation(tx, input.envelope.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const agentAction = yield* agentActionProvenance(input.envelope, trusted)
    const agentActionFingerprint = fingerprint({
      agentAction,
      commandFingerprint: semanticFingerprint,
      materialized: materialized.value,
    })
    const candidate = {
      kind: "candidate_v1",
      commandFingerprint: semanticFingerprint,
      canonicalCommand: command,
      agentActionFingerprint,
      agentAction,
      materialized: { ...materialized.value, agentAction },
    } satisfies Candidate
    yield* tx
      .insert(LearningBootstrapDispositionTable)
      .values({
        invocation_part_id: input.envelope.partID,
        disposition: "candidate_v1",
        command_fingerprint: semanticFingerprint,
        canonical_command: command,
        semantic_address_fingerprint: addressFingerprint,
        agent_action_fingerprint: agentActionFingerprint,
        agent_action: agentAction,
        materialized_candidate: candidate.materialized,
        time_disposed: input.envelope.timeAdmitted,
      })
      .run()
      .pipe(Effect.orDie)
    return { type: "admitted" as const, candidate }
  })
}

export function settlePolicy(tx: Transaction, input: PolicyInput) {
  return Effect.gen(function* () {
    const candidate = yield* requireCandidate(tx, input.partID)
    const basisFingerprint = fingerprint(input.policyBasis)
    const existing = yield* readCapabilitySettlement(tx, input.partID)
    if (existing) {
      if (
        existing.outcome !== input.outcome ||
        existing.agent_action_fingerprint !== candidate.agentActionFingerprint ||
        existing.basis_fingerprint !== basisFingerprint
      ) {
        return yield* integrity("Learning-bootstrap capability policy settlement conflicts")
      }
      return capabilitySettlementInfo(existing)
    }
    if (yield* readCapabilityIssue(tx, input.partID)) {
      return yield* integrity("A prompted learning-bootstrap capability cannot become a policy settlement")
    }
    yield* tx
      .insert(LearningBootstrapCapabilitySettlementTable)
      .values({
        invocation_part_id: input.partID,
        outcome: input.outcome,
        agent_action_fingerprint: candidate.agentActionFingerprint,
        basis: input.policyBasis,
        basis_fingerprint: basisFingerprint,
        time_settled: input.time,
        settlement_order: input.order,
      })
      .run()
      .pipe(Effect.orDie)
    return {
      outcome: input.outcome,
      agentActionFingerprint: candidate.agentActionFingerprint,
      basis: input.policyBasis,
      basisFingerprint,
      timeSettled: input.time,
      settlementOrder: input.order,
    }
  })
}

export function issueCapabilityPrompt(tx: Transaction, input: PromptIssueInput) {
  return Effect.gen(function* () {
    const candidate = yield* requireCandidate(tx, input.partID)
    if (yield* readCapabilitySettlement(tx, input.partID)) {
      return yield* integrity("A terminal learning-bootstrap capability outcome cannot issue a prompt")
    }
    const policyFingerprint = fingerprint(input.policyBasis)
    const shownScopeFingerprint = fingerprint(input.shownScope)
    const existing = yield* readCapabilityIssue(tx, input.partID)
    if (existing) {
      if (
        existing.permission_request_id !== input.requestID ||
        existing.agent_action_fingerprint !== candidate.agentActionFingerprint ||
        existing.policy_fingerprint !== policyFingerprint ||
        existing.shown_scope_fingerprint !== shownScopeFingerprint
      ) {
        return yield* integrity("Learning-bootstrap capability prompt issue conflicts")
      }
      return capabilityIssueInfo(existing)
    }
    yield* tx
      .insert(LearningBootstrapCapabilityIssueTable)
      .values({
        invocation_part_id: input.partID,
        permission_request_id: input.requestID,
        agent_action_fingerprint: candidate.agentActionFingerprint,
        policy_basis: input.policyBasis,
        policy_fingerprint: policyFingerprint,
        shown_scope: input.shownScope,
        shown_scope_fingerprint: shownScopeFingerprint,
        time_issued: input.time,
        issue_order: input.order,
      })
      .run()
      .pipe(Effect.orDie)
    return capabilityIssueInfo((yield* readCapabilityIssue(tx, input.partID))!)
  })
}

export function settlePrompt(tx: Transaction, input: PromptSettlementInput) {
  return Effect.gen(function* () {
    const candidate = yield* requireCandidate(tx, input.partID)
    const issue = yield* readCapabilityIssue(tx, input.partID)
    if (
      !issue ||
      issue.permission_request_id !== input.requestID ||
      issue.agent_action_fingerprint !== candidate.agentActionFingerprint
    ) {
      return yield* integrity("Learning-bootstrap prompt reply has no exact durable issue")
    }
    const replyFingerprint = fingerprint(input.reply)
    const existing = yield* readCapabilitySettlement(tx, input.partID)
    if (existing) {
      if (
        existing.outcome !== input.outcome ||
        existing.permission_request_id !== input.requestID ||
        existing.basis_fingerprint !== replyFingerprint ||
        existing.agent_action_fingerprint !== candidate.agentActionFingerprint
      ) {
        return yield* integrity("Learning-bootstrap prompt settlement conflicts")
      }
      return capabilitySettlementInfo(existing)
    }
    yield* tx
      .insert(LearningBootstrapCapabilitySettlementTable)
      .values({
        invocation_part_id: input.partID,
        outcome: input.outcome,
        permission_request_id: input.requestID,
        agent_action_fingerprint: candidate.agentActionFingerprint,
        basis: input.reply,
        basis_fingerprint: replyFingerprint,
        time_settled: input.time,
        settlement_order: input.order,
      })
      .run()
      .pipe(Effect.orDie)
    return capabilitySettlementInfo((yield* readCapabilitySettlement(tx, input.partID))!)
  })
}

export function recoverCapability(tx: Transaction, input: Readonly<{ partID: PartID; time: number; order: number }>) {
  return Effect.gen(function* () {
    const candidate = yield* requireCandidate(tx, input.partID)
    const existing = yield* readCapabilitySettlement(tx, input.partID)
    if (existing) return capabilitySettlementInfo(existing)
    const issue = yield* readCapabilityIssue(tx, input.partID)
    const outcome = issue ? ("prompted_abort" as const) : ("not_evaluated" as const)
    yield* tx
      .insert(LearningBootstrapCapabilitySettlementTable)
      .values({
        invocation_part_id: input.partID,
        outcome,
        permission_request_id: issue?.permission_request_id ?? null,
        agent_action_fingerprint: candidate.agentActionFingerprint,
        time_settled: input.time,
        settlement_order: input.order,
      })
      .run()
      .pipe(Effect.orDie)
    return capabilitySettlementInfo((yield* readCapabilitySettlement(tx, input.partID))!)
  })
}

type PreparedMaterial =
  | Readonly<{
      key: string
      type: "artifact"
      intent: Extract<MaterialIntent, { readonly type: "artifact" }>
      proof: Artifact.RevisionReferenceProof
      read?: ContentRoot.PreparedLocalRead
    }>
  | Readonly<{
      key: string
      type: "representation"
      intent: Extract<MaterialIntent, { readonly type: "representation" }>
      proof: Representation.CurrentUseProof
    }>
  | Readonly<{
      key: string
      type: "local"
      intent: Extract<MaterialIntent, { readonly type: "local" }>
      read: ContentRoot.PreparedLocalRead
      mutation: Artifact.PreparedMutation
    }>

export type PreparedMap = Readonly<{
  key: string
  id: MaterialMap.MapID
  intent: MapIntent
  write: MaterialMap.PreparedMapWrite
  nodeIDs: Readonly<Record<string, string>>
  selectorIDs: Readonly<Record<string, MaterialMap.SelectorID>>
  predecessor?: MaterialMap.MapOwnerProof
}>

export type PreparedExecution = Readonly<{
  candidate: Candidate
  materials: readonly PreparedMaterial[]
  maps: readonly PreparedMap[]
  alignmentIDs: Readonly<Record<string, MaterialMap.AlignmentID>>
  alignmentPredecessors: Readonly<Record<string, MaterialMap.AlignmentOwnerProof>>
  selectionTarget?: Course.RevisionOwnerProof
  memberships: Readonly<Record<string, Course.MembershipProof>>
}>

export type PreparationOwners = Readonly<{
  database: Database.Interface["db"]
  contentRoots: ContentRoot.Interface
  artifacts: Artifact.Interface
  maps: MaterialMap.Interface
  activeWorkspace?: ContentRoot.ActiveWorkspaceRead
  oneOperation?: ContentRoot.OneOperationRead
}>

export function prepareExecution(
  candidate: Candidate,
  owners: PreparationOwners,
  input?: Readonly<{ abort?: AbortSignal; maxLocalBytes?: number }>,
) {
  return Effect.gen(function* () {
    const materialSnapshots = new Map(candidate.materialized.owners.materials.map((item) => [item.key, item]))
    const materials = yield* Effect.forEach(candidate.canonicalCommand.materials ?? [], (intent) =>
      Effect.gen(function* () {
        const expected = materialSnapshots.get(intent.key)
        if (!expected || expected.type !== intent.type) {
          return yield* integrity(`Material ${intent.key} lost its admission snapshot`)
        }
        if (intent.type === "artifact") {
          const proof = yield* owners.artifacts.prepareRevisionReference(
            intent.artifactID,
            intent.revisionID,
            intent.attribution,
          )
          if (expected.type !== "artifact" || !isDeepStrictEqual(proof.receipt, expected.receipt)) {
            return yield* new InvalidCommandError({ reason: "validation_error" })
          }
          const read = intent.read ? yield* prepareLocalRead(owners, intent.read, input?.maxLocalBytes) : undefined
          return {
            key: intent.key,
            type: "artifact",
            intent,
            proof,
            ...(read ? { read } : {}),
          } satisfies PreparedMaterial
        }
        if (intent.type === "representation") {
          const proof = yield* owners.database
            .transaction((tx) => Representation.prepareCurrentUseProof(tx, intent.representationRevisionID))
            .pipe(Effect.catchTag("SqlError", Effect.die))
          if (expected.type !== "representation" || !isDeepStrictEqual(proof.receipt, expected.receipt)) {
            return yield* new InvalidCommandError({ reason: "validation_error" })
          }
          return { key: intent.key, type: "representation", intent, proof } satisfies PreparedMaterial
        }
        const read = yield* prepareLocalRead(owners, intent, input?.maxLocalBytes)
        const observation = {
          result: "present" as const,
          fingerprint: read.observation.fingerprint,
          mediaType: read.observation.mediaType,
          observer: Artifact.Observer.trusted(UPDATE_LEARNING_COURSE_CAPABILITY, UPDATE_LEARNING_COURSE_VERSION),
          timeObserved: read.observation.timeObserved,
        }
        const mutation = yield* owners.artifacts.prepareLocalMutation({
          location: Artifact.CanonicalLocation.trusted(read.observation.descriptor.canonicalPath),
          observation,
          authority: Artifact.Admission.learnerInstruction(
            UPDATE_LEARNING_COURSE_CAPABILITY,
            UPDATE_LEARNING_COURSE_VERSION,
          ),
        })
        return { key: intent.key, type: "local", intent, read, mutation } satisfies PreparedMaterial
      }),
    )
    const materialByKey = new Map(materials.map((material) => [material.key, material]))
    const predecessorSnapshots = new Map(
      candidate.materialized.owners.mapPredecessors.map((item) => [item.key, item.receipt]),
    )
    const maps = yield* Effect.forEach(candidate.canonicalCommand.maps ?? [], (intent) =>
      Effect.gen(function* () {
        const material = materialByKey.get(intent.materialKey)
        if (!material) return yield* integrity(`Map ${intent.key} lost material ${intent.materialKey}`)
        const id = MaterialMap.createMapID()
        const nodeIDs = Object.fromEntries(intent.outline.map((node) => [node.key, MaterialMap.createOutlineNodeID()]))
        const selectorIDs = Object.fromEntries(
          intent.outline.flatMap((node) =>
            node.selectors.map((selector) => [selector.key, MaterialMap.createSelectorID()]),
          ),
        ) as Readonly<Record<string, MaterialMap.SelectorID>>
        const outline = intent.outline.map((node, index) => ({
          id: nodeIDs[node.key] as MaterialMap.OutlineNodeID,
          ...(node.parentKey ? { parentNodeID: nodeIDs[node.parentKey] as MaterialMap.OutlineNodeID } : {}),
          title: node.title,
          preorderPosition: index,
          depth: outlineDepth(intent, node.key),
          selectors: node.selectors.map((selector, position) => ({
            id: selectorIDs[selector.key]!,
            position,
            coordinate: selector.coordinate,
          })),
        }))
        const authorship = MaterialMap.Authorship.trusted(
          intent.authorship,
          UPDATE_LEARNING_COURSE_CAPABILITY,
          UPDATE_LEARNING_COURSE_VERSION,
        )
        const write =
          material.type === "local"
            ? yield* owners.maps.prepareLocalArtifactMapWrite({
                mapID: id,
                proposal: { ...(intent.supersedesMapID ? { supersedesMapID: intent.supersedesMapID } : {}), outline },
                authorship,
                mutation: material.mutation,
                read: material.read,
              })
            : material.type === "artifact"
              ? yield* owners.maps.prepareReferencedArtifactMapWrite({
                  mapID: id,
                  proposal: {
                    ...(intent.supersedesMapID ? { supersedesMapID: intent.supersedesMapID } : {}),
                    outline,
                  },
                  authorship,
                  reference: material.proof,
                  read: material.read!,
                })
              : yield* owners.maps.prepareMapWrite({
                  mapID: id,
                  proposal: {
                    target: {
                      type: "representation",
                      representationRevisionID: material.intent.representationRevisionID,
                    },
                    ...(intent.supersedesMapID ? { supersedesMapID: intent.supersedesMapID } : {}),
                    outline,
                  },
                  authorship,
                  access: { type: "representation", effectiveArtifactID: material.proof.effectiveArtifactID },
                  budgets: mapReadBudgets(input?.maxLocalBytes),
                  abort: input?.abort,
                })
        const expectedPredecessor = predecessorSnapshots.get(intent.key)
        const predecessor = intent.supersedesMapID
          ? yield* owners.database
              .transaction((tx) => MaterialMap.prepareMapOwnerProof(tx, intent.supersedesMapID!))
              .pipe(Effect.catchTag("SqlError", Effect.die))
          : undefined
        if (
          (expectedPredecessor === undefined) !== (predecessor === undefined) ||
          (expectedPredecessor && predecessor && !isDeepStrictEqual(expectedPredecessor, predecessor.receipt))
        ) {
          return yield* new InvalidCommandError({ reason: "validation_error" })
        }
        return { key: intent.key, id, intent, write, nodeIDs, selectorIDs, ...(predecessor ? { predecessor } : {}) }
      }),
    )
    const expectedAlignmentPredecessors = new Map(
      candidate.materialized.owners.alignmentPredecessors.map((item) => [item.key, item.receipt]),
    )
    const alignmentPredecessorEntries = yield* Effect.forEach(
      (candidate.canonicalCommand.alignments ?? []).filter((alignment) => alignment.supersedesAlignmentID),
      (alignment) =>
        owners.database
          .transaction((tx) => MaterialMap.prepareAlignmentOwnerProof(tx, alignment.supersedesAlignmentID!))
          .pipe(
            Effect.catchTag("SqlError", Effect.die),
            Effect.flatMap((proof) =>
              isDeepStrictEqual(expectedAlignmentPredecessors.get(alignment.key), proof.receipt)
                ? Effect.succeed([alignment.key, proof] as const)
                : Effect.fail(new InvalidCommandError({ reason: "validation_error" })),
            ),
          ),
    )
    const selectionTarget = candidate.materialized.owners.selectionTarget
      ? yield* owners.database
          .transaction((tx) => Course.prepareRevisionOwnerProof(tx, candidate.materialized.owners.selectionTarget!))
          .pipe(Effect.catchTag("SqlError", Effect.die))
      : undefined
    if (selectionTarget && !isDeepStrictEqual(selectionTarget.receipt, candidate.materialized.owners.selectionTarget)) {
      return yield* new InvalidCommandError({ reason: "validation_error" })
    }
    const membershipEntries = yield* Effect.forEach(candidate.materialized.owners.memberships, (expected) =>
      owners.database
        .transaction((tx) =>
          Course.prepareMembershipProof(tx, {
            endpoint: expected.receipt.endpoint,
            selection: expected.receipt.selection,
          }),
        )
        .pipe(
          Effect.catchTag("SqlError", Effect.die),
          Effect.flatMap((proof) =>
            isDeepStrictEqual(proof.receipt, expected.receipt)
              ? Effect.succeed([expected.key, proof] as const)
              : Effect.fail(new InvalidCommandError({ reason: "validation_error" })),
          ),
        ),
    )
    return {
      candidate,
      materials,
      maps,
      alignmentIDs: Object.fromEntries(
        (candidate.canonicalCommand.alignments ?? []).map((alignment) => [
          alignment.key,
          MaterialMap.createAlignmentID(),
        ]),
      ),
      alignmentPredecessors: Object.fromEntries(alignmentPredecessorEntries),
      ...(selectionTarget ? { selectionTarget } : {}),
      memberships: Object.fromEntries(membershipEntries),
    } satisfies PreparedExecution
  })
}

export type SettlementOwners = Readonly<{
  courses: Course.Interface
  maps: MaterialMap.Interface
}>

export function settle(
  tx: Transaction,
  input: Readonly<{
    partID: PartID
    prepared: PreparedExecution
    owners: SettlementOwners
    settlement: SettlementMetadata
  }>,
) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, input.partID)
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requirePhysicalSettlement(invocation) }
    }
    yield* requireSettlementMetadata(invocation.time_admitted, input.settlement)
    const candidate = yield* requireCandidate(tx, input.partID)
    if (
      candidate.commandFingerprint !== input.prepared.candidate.commandFingerprint ||
      candidate.agentActionFingerprint !== input.prepared.candidate.agentActionFingerprint ||
      !isDeepStrictEqual(candidate.canonicalCommand, input.prepared.candidate.canonicalCommand) ||
      fingerprint(candidate.materialized) !== fingerprint(input.prepared.candidate.materialized)
    ) {
      return yield* integrity("Prepared learning-bootstrap execution belongs to another candidate")
    }
    const semantic = yield* settleSemanticRace(tx, invocation, candidate, input.settlement)
    if (semantic) return semantic
    const capability = yield* readCapabilitySettlement(tx, input.partID)
    if (!capability || capability.agent_action_fingerprint !== candidate.agentActionFingerprint) {
      return yield* integrity("Final learning-bootstrap settlement has no exact capability outcome")
    }
    if (capability.outcome !== "policy_allow" && capability.outcome !== "prompted_allow") {
      const settlement = errorSettlement(capabilityErrorCode(capability.outcome), input.settlement)
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }
    const envelope = invocationEnvelope(invocation)
    if (!(yield* occurrenceAvailable(tx, envelope))) {
      const settlement = errorSettlement("source_unavailable", input.settlement)
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }

    yield* revalidatePrepared(tx, input.prepared)
    const command = candidate.canonicalCommand
    const courseSnapshot =
      candidate.materialized.course.type === "existing" ? candidate.materialized.course.snapshot : undefined
    let course: Course.CourseInfo
    let courseOutcome: "created" | "corrected" | "no_change"
    if (command.course.type === "new") {
      course = yield* input.owners.courses.createCourseInTransaction(tx, {
        title: command.course.title,
        time: input.settlement.time,
      })
      courseOutcome = "created"
    } else {
      if (!courseSnapshot) return yield* integrity("Existing Course command lost its owner snapshot")
      if (command.course.title !== undefined && command.course.title !== courseSnapshot.title) {
        course = yield* input.owners.courses.correctCourseInTransaction(tx, {
          courseID: command.course.courseID,
          title: command.course.title,
          expectedCourseVersion: courseSnapshot.courseVersion,
          time: input.settlement.time,
        })
        courseOutcome = "corrected"
      } else {
        course = {
          id: courseSnapshot.courseID,
          title: courseSnapshot.title,
          stateVersion: courseSnapshot.courseVersion,
          timeCreated: 0,
          timeUpdated: 0,
          selection: {
            revisionID: courseSnapshot.selectionRevisionID ?? undefined,
            version: courseSnapshot.selectionVersion,
          },
        }
        courseOutcome = "no_change"
      }
    }

    let route: Course.PublishedRevision | undefined
    if (command.route) {
      const authorship = courseAuthorship(command.route.authorship)
      route =
        command.route.type === "successor_revision"
          ? yield* input.owners.courses.addRevisionInTransaction(tx, {
              courseID: course.id,
              viewID: command.route.viewID,
              predecessorRevisionID: command.route.predecessorRevisionID,
              expectedCourseVersion: course.stateVersion,
              expectedViewVersion: courseSnapshot?.routeViewVersion ?? -1,
              authorship,
              revision: command.route.revision,
              time: input.settlement.time,
            })
          : yield* input.owners.courses.createViewInTransaction(tx, {
              courseID: course.id,
              name: command.route.name,
              expectedCourseVersion: course.stateVersion,
              authorship,
              revision: command.route.revision,
              time: input.settlement.time,
            })
    }

    const selectionIntent = command.selection ?? { type: "preserve" as const }
    const selectionTarget =
      selectionIntent.type !== "set"
        ? undefined
        : selectionIntent.target.type === "route"
          ? route?.revision
          : input.prepared.selectionTarget
            ? {
                id: input.prepared.selectionTarget.receipt.revisionID,
                viewID: input.prepared.selectionTarget.receipt.viewID,
                stateVersion: input.prepared.selectionTarget.receipt.revisionVersion,
              }
            : undefined
    if (selectionIntent.type === "set" && !selectionTarget) {
      return yield* new InvalidCommandError({ reason: "validation_error" })
    }
    const selectedRevisionID = selectionIntent.type === "set" ? selectionTarget!.id : undefined
    const desiredSelection =
      selectionIntent.type === "preserve"
        ? course.selection.revisionID
        : selectionIntent.type === "clear"
          ? undefined
          : selectedRevisionID
    const selectionChanged = desiredSelection !== course.selection.revisionID
    if (selectionChanged) {
      course = {
        ...course,
        selection: yield* input.owners.courses.selectInTransaction(tx, {
          courseID: course.id,
          revisionID: desiredSelection,
          expectedCourseVersion: course.stateVersion,
          expectedSelectionRevisionID: course.selection.revisionID,
          expectedSelectionVersion: course.selection.version,
          ...(desiredSelection
            ? {
                expectedViewVersion:
                  selectionIntent.type === "set" && selectionIntent.target.type === "route"
                    ? route!.view.stateVersion
                    : input.prepared.selectionTarget!.receipt.viewVersion,
                expectedRevisionVersion:
                  selectionIntent.type === "set" && selectionIntent.target.type === "route"
                    ? route!.revision.stateVersion
                    : input.prepared.selectionTarget!.receipt.revisionVersion,
              }
            : {}),
          time: input.settlement.time,
        }),
      }
    }

    const resolvedMaterials = yield* Effect.forEach(input.prepared.materials, (material) =>
      Effect.gen(function* () {
        if (material.type === "local") yield* material.read.require(tx)
        const local = material.type === "local" ? yield* material.mutation.commit(tx, input.settlement.time) : undefined
        const target =
          material.type === "representation"
            ? {
                type: "representation" as const,
                representationRevisionID: material.intent.representationRevisionID,
              }
            : material.type === "artifact"
              ? {
                  type: "artifact" as const,
                  artifactID: material.intent.artifactID,
                  revisionID: material.intent.revisionID,
                  attribution: material.intent.attribution,
                }
              : {
                  type: "artifact" as const,
                  artifactID: local!.artifact.id,
                  revisionID: local!.revisionID,
                  attribution: local!.artifact.source.revisionAttribution!,
                }
        const existing = yield* findAdoption(tx, course.id, target)
        const adoptionID = existing?.id ?? createAdoptionID()
        return {
          key: material.key,
          target,
          adoptionID,
          existing,
          changed: !existing || (local !== undefined && local.result !== "no_change"),
          ...(local ? { local } : {}),
          ...(material.type === "local" ? { sourceAuthority: material.read.authorization } : {}),
        }
      }),
    )

    const committedMaps = yield* Effect.forEach(input.prepared.maps, (map) =>
      input.owners.maps
        .commitMapInTransaction(tx, { prepared: map.write, time: input.settlement.time })
        .pipe(Effect.map((info) => ({ prepared: map, info }))),
    )
    const mapByKey = new Map(committedMaps.map((map) => [map.prepared.key, map]))
    const committedAlignments = yield* Effect.forEach(command.alignments ?? [], (alignment) =>
      Effect.gen(function* () {
        const map = mapByKey.get(alignment.mapKey)
        if (!map) return yield* integrity(`Alignment ${alignment.key} lost Map ${alignment.mapKey}`)
        const endpoint =
          alignment.course.type === "route_item"
            ? route
              ? {
                  courseID: course.id,
                  viewID: route.view.id,
                  revisionID: route.revision.id,
                  itemID: route.items[alignment.course.itemKey]!,
                }
              : undefined
            : {
                courseID: course.id,
                viewID: alignment.course.viewID,
                revisionID: alignment.course.revisionID,
                itemID: alignment.course.itemID,
              }
        if (!endpoint?.itemID) return yield* new InvalidCommandError({ reason: "validation_error" })
        const membership = yield* Course.prepareMembershipProof(tx, {
          endpoint,
          selection:
            alignment.course.type === "existing" && alignment.course.selection === "observed_working"
              ? {
                  type: "observed_working",
                  revisionID: endpoint.revisionID,
                  version: course.selection.version,
                }
              : { type: "explicit_exact" },
        })
        const info = yield* input.owners.maps.alignPreparedMapInTransaction(tx, {
          alignmentID: input.prepared.alignmentIDs[alignment.key]!,
          proposal: {
            mapID: map.info.id,
            selectorID: map.prepared.selectorIDs[alignment.selectorKey]!,
            course: endpoint,
            selection: membership.selection,
            reason: alignment.reason,
            ...(alignment.supersedesAlignmentID ? { supersedesAlignmentID: alignment.supersedesAlignmentID } : {}),
          },
          authorship: MaterialMap.Authorship.trusted(
            alignment.authorship,
            UPDATE_LEARNING_COURSE_CAPABILITY,
            UPDATE_LEARNING_COURSE_VERSION,
          ),
          preparedMap: map.prepared.write,
          membership,
          time: input.settlement.time,
        })
        return { key: alignment.key, info }
      }),
    )

    const desiredAnchor = yield* anchorTarget(command.anchor ?? { type: "preserve" }, course, route)
    const admittedAnchor = candidate.materialized.owners.anchor
    const anchorChanged =
      (command.anchor?.type ?? "preserve") !== "preserve" && !sameEndpoint(desiredAnchor, admittedAnchor.target)
    const changed =
      courseOutcome !== "no_change" ||
      route !== undefined ||
      selectionChanged ||
      resolvedMaterials.some((material) => material.changed) ||
      committedMaps.length > 0 ||
      committedAlignments.length > 0 ||
      anchorChanged
    const initialChildren = childResults({
      course,
      courseOutcome,
      route,
      routeAuthorship: command.route?.authorship,
      selectionChanged,
      materials: resolvedMaterials,
      maps: committedMaps,
      alignments: committedAlignments,
      anchorChanged,
    })
    if (!changed) {
      const currentAnchor = yield* LearnerNavigation.readCurrentAnchor(tx, course.id)
      const acknowledgement = acknowledgementFor(
        "no_change",
        course,
        route,
        command.route?.authorship,
        initialChildren,
        {
          headID: currentAnchor.headID,
          target: currentAnchor.target,
          usability: currentAnchor.usability,
        },
      )
      const settlement = {
        outcome: "no_change",
        bootstrapKind: "learning_bootstrap",
        schemaVersion: 1,
        courseID: course.id,
        children: initialChildren,
        acknowledgement,
        settlementTime: input.settlement.time,
        settlementOrder: input.settlement.order,
      } satisfies NoChangeSettlement
      yield* settlePhysicalInvocation(tx, input.partID, settlement)
      return { type: "settled" as const, settlement }
    }

    const consumed = yield* LearningFrontier.read(tx)
    const frontier = yield* LearningFrontier.advance(tx, {
      time: input.settlement.time,
      consumed: [consumed],
    })
    let anchorEffect: LearnerNavigation.AnchorEffect | undefined
    if (anchorChanged) {
      const proof = desiredAnchor
        ? yield* Course.prepareMembershipProof(tx, {
            endpoint: desiredAnchor,
            selection: {
              type: "observed_working",
              revisionID: desiredAnchor.revisionID,
              version: course.selection.version,
            },
          })
        : undefined
      anchorEffect = yield* LearnerNavigation.applyAnchorAtFrontier(tx, {
        occurrenceID: envelope.occurrenceID,
        command: {
          kind: "course_route_anchor",
          courseID: course.id,
          expectedHeadID: admittedAnchor.headID as LearnerNavigation.AnchorEffectID | null,
          expectedVersion: admittedAnchor.version,
          target: proof
            ? {
                viewID: proof.endpoint.viewID,
                revisionID: proof.endpoint.revisionID,
                itemID: proof.endpoint.itemID,
                courseVersion: proof.receipt.courseVersion,
                selectionVersion: course.selection.version,
                viewVersion: proof.receipt.viewVersion,
                revisionVersion: proof.receipt.revisionVersion,
              }
            : null,
        },
        proof,
        trustedTime: input.settlement.time,
        commitOrder: input.settlement.order,
        frontier,
      })
    }
    const finalAnchor = anchorChanged
      ? {
          headID: anchorEffect?.id ?? admittedAnchor.headID,
          version: anchorEffect?.version ?? admittedAnchor.version,
          target: desiredAnchor ?? null,
          usability: desiredAnchor ? ({ usable: true } as const) : ({ usable: false, cause: "absent" } as const),
        }
      : yield* LearnerNavigation.readCurrentAnchor(tx, course.id)
    const children = childResults({
      course,
      courseOutcome,
      route,
      routeAuthorship: command.route?.authorship,
      selectionChanged,
      materials: resolvedMaterials,
      maps: committedMaps,
      alignments: committedAlignments,
      anchorChanged,
      anchorEffect,
    })
    const acknowledgement = acknowledgementFor(
      "applied",
      course,
      route,
      command.route?.authorship,
      children,
      finalAnchor,
    )
    const effectID = createEffectID()
    yield* tx.run("PRAGMA defer_foreign_keys = ON")
    const receiptID = yield* insertPhysicalReceipt(tx, envelope, input.settlement)
    yield* tx.insert(LearningBootstrapEffectTable).values({
      id: effectID,
      commit_seal_id: effectID,
      occurrence_id: envelope.occurrenceID,
      invocation_part_id: input.partID,
      semantic_fingerprint: candidate.commandFingerprint,
      command,
      materialized_candidate: candidate.materialized,
      course_id: course.id,
      child_results: children,
      acknowledgement,
      time_committed: input.settlement.time,
      commit_order: input.settlement.order,
      frontier_sequence: frontier.sequence,
      frontier_time: frontier.time,
    })
    yield* tx.insert(LearningBootstrapCourseResultTable).values({
      effect_id: effectID,
      course_id: course.id,
      outcome: courseOutcome,
    })
    if (route) {
      yield* tx.insert(LearningBootstrapRouteResultTable).values({
        effect_id: effectID,
        view_id: route.view.id,
        revision_id: route.revision.id,
      })
    }
    yield* tx.insert(LearningBootstrapSelectionResultTable).values({
      effect_id: effectID,
      outcome: selectionChanged ? "changed" : "no_change",
      selected_revision_id: course.selection.revisionID,
      selection_version: course.selection.version,
    })
    yield* Effect.forEach(
      resolvedMaterials,
      (material, ordinal) =>
        Effect.gen(function* () {
          if (!material.existing) {
            yield* tx.insert(LearningCourseMaterialAdoptionTable).values(
              material.target.type === "representation"
                ? {
                    id: material.adoptionID,
                    course_id: course.id,
                    target_kind: "representation",
                    representation_revision_id: material.target.representationRevisionID,
                    creation_effect_id: effectID,
                    time_created: input.settlement.time,
                  }
                : {
                    id: material.adoptionID,
                    course_id: course.id,
                    target_kind: "artifact",
                    artifact_id: material.target.artifactID,
                    artifact_revision_id: material.target.revisionID,
                    attribution_type: material.target.attribution.type,
                    attribution_member_id:
                      material.target.attribution.type === "lineage_correction"
                        ? material.target.attribution.memberID
                        : undefined,
                    creation_effect_id: effectID,
                    time_created: input.settlement.time,
                  },
            )
          }
          yield* tx.insert(LearningBootstrapMaterialResultTable).values({
            effect_id: effectID,
            ordinal,
            local_key: material.key,
            adoption_id: material.adoptionID,
            outcome: material.changed ? "changed" : "no_change",
          })
        }),
      { discard: true },
    )
    yield* Effect.forEach(
      committedMaps,
      (map) =>
        tx.insert(LearningBootstrapMapResultTable).values({
          effect_id: effectID,
          local_key: map.prepared.key,
          map_id: map.info.id,
        }),
      { discard: true },
    )
    yield* Effect.forEach(
      committedAlignments,
      (alignment) =>
        tx.insert(LearningBootstrapAlignmentResultTable).values({
          effect_id: effectID,
          local_key: alignment.key,
          alignment_id: alignment.info.id,
        }),
      { discard: true },
    )
    yield* tx.insert(LearningBootstrapAnchorResultTable).values({
      effect_id: effectID,
      outcome: anchorEffect ? "changed" : "no_change",
      anchor_effect_id: anchorEffect?.id,
    })
    yield* tx.insert(LearningBootstrapCommitSealTable).values({
      effect_id: effectID,
      receipt_id: receiptID,
      invocation_part_id: input.partID,
    })
    if (anchorEffect) {
      yield* LearnerNavigation.sealAnchor(tx, {
        effectID: anchorEffect.id,
        receiptID,
        invocationPartID: input.partID,
      })
    }
    const settlement = {
      outcome: "applied",
      bootstrapKind: "learning_bootstrap",
      schemaVersion: 1,
      receiptID,
      effectID,
      courseID: course.id,
      children,
      acknowledgement,
      frontierSequence: frontier.sequence,
      settlementTime: input.settlement.time,
      settlementOrder: input.settlement.order,
    } satisfies AppliedSettlement
    yield* settlePhysicalInvocation(tx, input.partID, settlement)
    return { type: "settled" as const, settlement }
  })
}

export function recover(tx: Transaction, input: Readonly<{ partID: PartID; settlement: SettlementMetadata }>) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, input.partID)
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requirePhysicalSettlement(invocation) }
    }
    const candidate = yield* requireCandidate(tx, input.partID)
    const semantic = yield* settleSemanticRace(tx, invocation, candidate, input.settlement)
    if (semantic) return semantic
    const capability = yield* recoverCapability(tx, {
      partID: input.partID,
      time: input.settlement.time,
      order: input.settlement.order,
    })
    const settlement = errorSettlement(
      capability.outcome === "policy_allow" || capability.outcome === "prompted_allow"
        ? "interrupted"
        : capabilityErrorCode(capability.outcome),
      input.settlement,
    )
    yield* settlePhysicalInvocation(tx, input.partID, settlement)
    return { type: "settled" as const, settlement }
  })
}

export function settleFailure(
  tx: Transaction,
  input: Readonly<{ partID: PartID; error: unknown; settlement: SettlementMetadata }>,
) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, input.partID)
    if (invocation.status !== "admitted") {
      return { type: "replay" as const, settlement: requirePhysicalSettlement(invocation) }
    }
    const candidate = yield* requireCandidate(tx, input.partID)
    const semantic = yield* settleSemanticRace(tx, invocation, candidate, input.settlement)
    if (semantic) return semantic
    const settlement = bootstrapErrorSettlement(input.error, input.settlement)
    yield* settlePhysicalInvocation(tx, input.partID, settlement)
    return { type: "settled" as const, settlement }
  })
}

export function readInvocationVersion(
  tx: Transaction,
  input: Readonly<{
    partID: PartID
    assistantMessageID: InvocationEnvelope["assistantMessageID"]
    providerCallID: string
  }>,
) {
  return Effect.gen(function* () {
    const invocation = yield* lookupPhysicalInvocation(tx, input)
    if (!invocation) return undefined
    if (
      invocation.command_name !== UPDATE_LEARNING_COURSE_CAPABILITY ||
      invocation.command_version !== UPDATE_LEARNING_COURSE_VERSION
    ) {
      return yield* invocationConflict(input)
    }
    const disposition = yield* readDisposition(tx, invocation.part_id)
    const state = {
      version: 1 as const,
      status: invocation.status,
      settlement: invocation.settlement,
      timeAdmitted: invocation.time_admitted,
    }
    if (!disposition) {
      if (invocation.status === "admitted" || invocation.status !== "error") {
        return yield* integrity("Learning-bootstrap invocation lost its required disposition")
      }
      return { ...state, disposition: "physical_no_effect" as const } satisfies InvocationVersion
    }
    if (disposition.disposition === "candidate_v1") {
      const capability = yield* readCapabilitySettlement(tx, invocation.part_id)
      const issue = yield* readCapabilityIssue(tx, invocation.part_id)
      return {
        ...state,
        disposition: "candidate_v1" as const,
        candidate: candidateInfo(disposition),
        ...(capability ? { capabilityOutcome: capability.outcome } : {}),
        ...(issue ? { permissionRequestID: issue.permission_request_id } : {}),
      } satisfies InvocationVersion
    }
    return {
      ...state,
      disposition: "semantic_terminal_v1" as const,
      semanticTerminal: semanticTerminalInfo(disposition),
    } satisfies InvocationVersion
  })
}

function materializeCandidate(tx: Transaction, envelope: InvocationEnvelope, command: CanonicalCommand) {
  return Effect.gen(function* () {
    const courseProof =
      command.course.type === "existing"
        ? yield* Course.prepareCurrentPreferenceTargetProof(tx, command.course.courseID)
        : undefined
    const routeProof =
      command.course.type === "existing" && command.route?.type === "successor_revision"
        ? yield* Course.prepareRevisionOwnerProof(tx, {
            courseID: command.course.courseID,
            viewID: command.route.viewID,
            revisionID: command.route.predecessorRevisionID,
          })
        : undefined
    const course: MaterializedCandidate["course"] = courseProof
      ? {
          type: "existing",
          snapshot: {
            courseID: courseProof.receipt.courseID,
            title: courseProof.receipt.courseTitle,
            courseVersion: courseProof.receipt.courseVersion,
            selectionRevisionID: courseProof.receipt.selectionRevisionID,
            selectionVersion: courseProof.receipt.selectionVersion,
            ...(routeProof
              ? {
                  routeViewID: routeProof.receipt.viewID,
                  routeViewVersion: routeProof.receipt.viewVersion,
                  predecessorRevisionID: routeProof.receipt.revisionID,
                  predecessorRevisionVersion: routeProof.receipt.revisionVersion,
                }
              : {}),
          },
        }
      : { type: "new" }
    const materials = yield* Effect.forEach(command.materials ?? [], (material) =>
      Effect.gen(function* () {
        if (material.type === "local") return { key: material.key, type: "local" } satisfies MaterialSnapshot
        if (material.type === "artifact") {
          const proof = yield* Artifact.prepareRevisionReferenceInTransaction(
            tx,
            material.artifactID,
            material.revisionID,
            material.attribution,
          )
          return { key: material.key, type: "artifact", receipt: proof.receipt } satisfies MaterialSnapshot
        }
        const proof = yield* Representation.prepareCurrentUseProof(tx, material.representationRevisionID)
        return { key: material.key, type: "representation", receipt: proof.receipt } satisfies MaterialSnapshot
      }),
    )
    const selectionTarget =
      command.course.type === "existing" &&
      command.selection?.type === "set" &&
      command.selection.target.type === "existing"
        ? yield* Course.prepareSelectionTargetProof(tx, {
            courseID: command.course.courseID,
            revisionID: command.selection.target.revisionID,
          })
        : undefined
    const courseID = command.course.type === "existing" ? command.course.courseID : undefined
    const membershipInputs = courseID
      ? [
          ...(command.alignments ?? []).flatMap((alignment) =>
            alignment.course.type === "existing"
              ? [
                  {
                    key: `alignment:${alignment.key}`,
                    endpoint: {
                      courseID,
                      viewID: alignment.course.viewID,
                      revisionID: alignment.course.revisionID,
                      itemID: alignment.course.itemID,
                    },
                  },
                ]
              : [],
          ),
          ...((command.anchor?.type === "set" && command.anchor.target.type === "existing"
            ? [
                {
                  key: "anchor",
                  endpoint: {
                    courseID,
                    viewID: command.anchor.target.viewID,
                    revisionID: command.anchor.target.revisionID,
                    itemID: command.anchor.target.itemID,
                  },
                },
              ]
            : []) as readonly { key: string; endpoint: Course.MembershipEndpoint }[]),
        ]
      : []
    const memberships = yield* Effect.forEach(membershipInputs, (membership) =>
      Course.prepareMembershipProof(tx, { endpoint: membership.endpoint, selection: { type: "explicit_exact" } }).pipe(
        Effect.map((proof) => ({ key: membership.key, receipt: proof.receipt })),
      ),
    )
    const mapPredecessors = yield* Effect.forEach(
      (command.maps ?? []).filter((map) => map.supersedesMapID),
      (map) =>
        MaterialMap.prepareMapOwnerProof(tx, map.supersedesMapID!).pipe(
          Effect.map((proof) => ({ key: map.key, receipt: proof.receipt })),
        ),
    )
    const alignmentPredecessors = yield* Effect.forEach(
      (command.alignments ?? []).filter((alignment) => alignment.supersedesAlignmentID),
      (alignment) =>
        MaterialMap.prepareAlignmentOwnerProof(tx, alignment.supersedesAlignmentID!).pipe(
          Effect.map((proof) => ({ key: alignment.key, receipt: proof.receipt })),
        ),
    )
    const anchor =
      command.course.type === "existing"
        ? yield* LearnerNavigation.readCurrentAnchor(tx, command.course.courseID)
        : undefined
    const owners = {
      materials,
      ...(selectionTarget ? { selectionTarget: selectionTarget.receipt } : {}),
      memberships,
      mapPredecessors,
      alignmentPredecessors,
      anchor: {
        headID: anchor?.headID ?? null,
        version: anchor?.version ?? 0,
        target: anchor?.target ?? null,
      },
    } satisfies BootstrapOwnerSnapshots
    return {
      schemaVersion: 1 as const,
      canonicalCommand: command,
      course,
      owners,
      timeFloor: Math.max(envelope.timeAdmitted, (yield* LearningFrontier.read(tx)).time),
    }
  })
}

function revalidatePrepared(tx: Transaction, prepared: PreparedExecution) {
  return Effect.gen(function* () {
    const candidate = prepared.candidate
    if (candidate.materialized.course.type === "existing") {
      const current = yield* Course.prepareCurrentPreferenceTargetProof(
        tx,
        candidate.materialized.course.snapshot.courseID,
      )
      const expected = candidate.materialized.course.snapshot
      if (current.receipt.courseTitle !== expected.title || current.receipt.courseVersion !== expected.courseVersion) {
        return yield* new Course.ConflictError({ entity: "course", id: expected.courseID })
      }
      if (
        current.receipt.selectionRevisionID !== expected.selectionRevisionID ||
        current.receipt.selectionVersion !== expected.selectionVersion
      ) {
        return yield* new Course.ConflictError({ entity: "selection", id: expected.courseID })
      }
      if (candidate.canonicalCommand.route?.type === "successor_revision") {
        const route = yield* Course.prepareRevisionOwnerProof(tx, {
          courseID: expected.courseID,
          viewID: candidate.canonicalCommand.route.viewID,
          revisionID: candidate.canonicalCommand.route.predecessorRevisionID,
        })
        if (route.receipt.viewID !== expected.routeViewID || route.receipt.viewVersion !== expected.routeViewVersion) {
          return yield* new Course.ConflictError({ entity: "view", id: candidate.canonicalCommand.route.viewID })
        }
        if (
          route.receipt.revisionID !== expected.predecessorRevisionID ||
          route.receipt.revisionVersion !== expected.predecessorRevisionVersion
        ) {
          return yield* new Course.ConflictError({
            entity: "revision",
            id: candidate.canonicalCommand.route.predecessorRevisionID,
          })
        }
      }
      const anchor = yield* LearnerNavigation.readCurrentAnchor(tx, expected.courseID)
      if (
        anchor.headID !== candidate.materialized.owners.anchor.headID ||
        anchor.version !== candidate.materialized.owners.anchor.version ||
        !sameEndpoint(anchor.target, candidate.materialized.owners.anchor.target)
      ) {
        return yield* new LearnerNavigation.StaleStateError({
          kind: "course_route_anchor",
          courseID: expected.courseID,
        })
      }
    } else if (
      candidate.materialized.owners.anchor.headID !== null ||
      candidate.materialized.owners.anchor.version !== 0 ||
      candidate.materialized.owners.anchor.target !== null
    ) {
      return yield* integrity("New Course candidate has a fabricated anchor head")
    }
    yield* Effect.forEach(
      prepared.materials,
      (material) =>
        Effect.gen(function* () {
          if (material.type === "artifact") yield* Artifact.requireRevisionReference(tx, material.proof)
          else if (material.type === "representation") yield* Representation.requireCurrentUseProof(tx, material.proof)
          else yield* material.read.require(tx)
        }),
      { discard: true },
    )
    yield* Effect.forEach(
      prepared.maps,
      (map) => (map.predecessor ? MaterialMap.requireMapOwnerProof(tx, map.predecessor) : Effect.void),
      { discard: true },
    )
    yield* Effect.forEach(
      Object.values(prepared.alignmentPredecessors),
      (proof) => MaterialMap.requireAlignmentOwnerProof(tx, proof),
      { discard: true },
    )
    if (prepared.selectionTarget) yield* Course.requireRevisionOwnerProof(tx, prepared.selectionTarget)
    yield* Effect.forEach(Object.values(prepared.memberships), (proof) => Course.requireMembershipProof(tx, proof), {
      discard: true,
    })
  })
}

function readDisposition(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(LearningBootstrapDispositionTable)
    .where(eq(LearningBootstrapDispositionTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function candidateInfo(row: typeof LearningBootstrapDispositionTable.$inferSelect): Candidate {
  if (
    row.disposition !== "candidate_v1" ||
    !row.agent_action_fingerprint ||
    !row.agent_action ||
    !row.materialized_candidate
  ) {
    throw new Error("Learning-bootstrap candidate row is structurally incomplete")
  }
  return {
    kind: "candidate_v1",
    commandFingerprint: row.command_fingerprint,
    canonicalCommand: row.canonical_command,
    agentActionFingerprint: row.agent_action_fingerprint,
    agentAction: row.agent_action,
    materialized: row.materialized_candidate,
  }
}

function semanticTerminalInfo(row: typeof LearningBootstrapDispositionTable.$inferSelect): SemanticTerminal {
  if (
    row.disposition !== "semantic_terminal_v1" ||
    !row.semantic_outcome ||
    !row.existing_effect_id ||
    !row.existing_intent_fingerprint
  ) {
    throw new Error("Learning-bootstrap semantic-terminal row is structurally incomplete")
  }
  return {
    kind: "semantic_terminal_v1",
    outcome: row.semantic_outcome,
    canonicalCommand: row.canonical_command,
    commandFingerprint: row.command_fingerprint,
    semanticAddressFingerprint: row.semantic_address_fingerprint,
    existingEffectID: row.existing_effect_id,
    existingIntentFingerprint: row.existing_intent_fingerprint,
  }
}

function requireCandidate(tx: Transaction, partID: PartID) {
  return Effect.gen(function* () {
    const invocation = yield* requireInvocation(tx, partID)
    if (invocation.status !== "admitted") {
      return yield* integrity("Learning-bootstrap capability requires an admitted candidate")
    }
    const row = yield* readDisposition(tx, partID)
    if (!row || row.disposition !== "candidate_v1") {
      return yield* integrity("Learning-bootstrap invocation has no candidate disposition")
    }
    return candidateInfo(row)
  })
}

function requireInvocation(tx: Transaction, partID: PartID) {
  return Effect.gen(function* () {
    const invocation = yield* tx
      .select()
      .from(LearningCommandInvocationTable)
      .where(eq(LearningCommandInvocationTable.part_id, partID))
      .get()
      .pipe(Effect.orDie)
    if (
      !invocation ||
      invocation.command_name !== UPDATE_LEARNING_COURSE_CAPABILITY ||
      invocation.command_version !== UPDATE_LEARNING_COURSE_VERSION
    ) {
      return yield* integrity("Learning-bootstrap invocation is unavailable")
    }
    return invocation
  })
}

function readCapabilityIssue(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(LearningBootstrapCapabilityIssueTable)
    .where(eq(LearningBootstrapCapabilityIssueTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function readCapabilitySettlement(tx: Transaction, partID: PartID) {
  return tx
    .select()
    .from(LearningBootstrapCapabilitySettlementTable)
    .where(eq(LearningBootstrapCapabilitySettlementTable.invocation_part_id, partID))
    .get()
    .pipe(Effect.orDie)
}

function capabilityIssueInfo(row: typeof LearningBootstrapCapabilityIssueTable.$inferSelect) {
  return {
    requestID: row.permission_request_id,
    agentActionFingerprint: row.agent_action_fingerprint,
    policyBasis: row.policy_basis,
    policyFingerprint: row.policy_fingerprint,
    shownScope: row.shown_scope,
    shownScopeFingerprint: row.shown_scope_fingerprint,
    timeIssued: row.time_issued,
    issueOrder: row.issue_order,
  }
}

function capabilitySettlementInfo(row: typeof LearningBootstrapCapabilitySettlementTable.$inferSelect) {
  return {
    outcome: row.outcome,
    ...(row.permission_request_id ? { requestID: row.permission_request_id } : {}),
    agentActionFingerprint: row.agent_action_fingerprint,
    ...(row.basis ? { basis: row.basis } : {}),
    ...(row.basis_fingerprint ? { basisFingerprint: row.basis_fingerprint } : {}),
    timeSettled: row.time_settled,
    settlementOrder: row.settlement_order,
  }
}

function resolveSemantic(
  tx: Transaction,
  occurrenceID: InvocationEnvelope["occurrenceID"],
  semanticFingerprint: string,
) {
  return Effect.gen(function* () {
    const effect = yield* committedEffectByOccurrence(tx, occurrenceID)
    if (!effect) return { type: "new" as const }
    return effect.semantic_fingerprint === semanticFingerprint
      ? { type: "already_applied" as const, effect }
      : { type: "semantic_conflict" as const, effect }
  })
}

function committedEffectByOccurrence(tx: Transaction, occurrenceID: InvocationEnvelope["occurrenceID"]) {
  return tx
    .select({
      id: LearningBootstrapEffectTable.id,
      semantic_fingerprint: LearningBootstrapEffectTable.semantic_fingerprint,
      receipt_id: LearningCommandReceiptTable.id,
    })
    .from(LearningBootstrapEffectTable)
    .innerJoin(
      LearningBootstrapCommitSealTable,
      eq(LearningBootstrapCommitSealTable.effect_id, LearningBootstrapEffectTable.id),
    )
    .innerJoin(
      LearningCommandReceiptTable,
      eq(LearningCommandReceiptTable.id, LearningBootstrapCommitSealTable.receipt_id),
    )
    .innerJoin(
      LearningCommandInvocationTable,
      and(
        eq(LearningCommandInvocationTable.part_id, LearningBootstrapCommitSealTable.invocation_part_id),
        eq(LearningCommandInvocationTable.receipt_id, LearningCommandReceiptTable.id),
        eq(LearningCommandInvocationTable.status, "applied"),
      ),
    )
    .where(eq(LearningBootstrapEffectTable.occurrence_id, occurrenceID))
    .get()
    .pipe(Effect.orDie)
}

function settleSemanticRace(
  tx: Transaction,
  invocation: typeof LearningCommandInvocationTable.$inferSelect,
  candidate: Candidate,
  settlement: SettlementMetadata,
) {
  return Effect.gen(function* () {
    const semantic = yield* resolveSemantic(tx, invocation.occurrence_id, candidate.commandFingerprint)
    if (semantic.type === "new") return undefined
    if (semantic.type === "already_applied") {
      const result = yield* settleAlreadyApplied(tx, invocation.part_id, semantic.effect.id, settlement)
      return { type: "settled" as const, settlement: result }
    }
    const result = errorSettlement("semantic_conflict", settlement, { effectID: semantic.effect.id })
    yield* settlePhysicalInvocation(tx, invocation.part_id, result)
    return { type: "settled" as const, settlement: result }
  })
}

function settleAlreadyApplied(tx: Transaction, partID: PartID, effectID: EffectID, metadata: SettlementMetadata) {
  return Effect.gen(function* () {
    const applied = yield* readAppliedEffect(tx, effectID)
    const settlement = {
      ...applied,
      outcome: "already_applied",
      acknowledgement: { ...applied.acknowledgement, outcome: "already_applied" },
      settlementTime: metadata.time,
      settlementOrder: metadata.order,
    } satisfies AlreadyAppliedSettlement
    yield* settlePhysicalInvocation(tx, partID, settlement)
    return settlement
  })
}

function readAppliedEffect(tx: Transaction, effectID: EffectID) {
  return Effect.gen(function* () {
    const row = yield* tx
      .select({ effect: LearningBootstrapEffectTable, receiptID: LearningCommandReceiptTable.id })
      .from(LearningBootstrapEffectTable)
      .innerJoin(
        LearningBootstrapCommitSealTable,
        eq(LearningBootstrapCommitSealTable.effect_id, LearningBootstrapEffectTable.id),
      )
      .innerJoin(
        LearningCommandReceiptTable,
        eq(LearningCommandReceiptTable.id, LearningBootstrapCommitSealTable.receipt_id),
      )
      .innerJoin(
        LearningCommandInvocationTable,
        and(
          eq(LearningCommandInvocationTable.part_id, LearningBootstrapCommitSealTable.invocation_part_id),
          eq(LearningCommandInvocationTable.receipt_id, LearningCommandReceiptTable.id),
          eq(LearningCommandInvocationTable.status, "applied"),
        ),
      )
      .where(eq(LearningBootstrapEffectTable.id, effectID))
      .get()
      .pipe(Effect.orDie)
    if (!row) return yield* integrity(`Learning-bootstrap effect ${effectID} has no immutable applied projection`)
    return {
      outcome: "applied",
      bootstrapKind: "learning_bootstrap",
      schemaVersion: 1,
      receiptID: row.receiptID,
      effectID: row.effect.id,
      courseID: row.effect.course_id,
      children: row.effect.child_results,
      acknowledgement: row.effect.acknowledgement,
      frontierSequence: row.effect.frontier_sequence,
      settlementTime: row.effect.time_committed,
      settlementOrder: row.effect.commit_order,
    } satisfies AppliedSettlement
  })
}

function requireEnvelope(envelope: InvocationEnvelope) {
  return envelope.capabilityIdentity === UPDATE_LEARNING_COURSE_CAPABILITY &&
    envelope.capabilityVersion === UPDATE_LEARNING_COURSE_VERSION &&
    envelope.authorizationBasis === "agent_action"
    ? Effect.void
    : integrity("Learning-bootstrap envelope has an incompatible capability or provenance basis")
}

function registrationFromEnvelope(envelope: InvocationEnvelope) {
  return {
    turnID: envelope.turnID,
    inputID: envelope.inputID,
    causalOccurrenceID: envelope.occurrenceID,
    partID: envelope.partID,
    callID: envelope.providerCallID,
    emissionOrdinal: envelope.emissionOrdinal,
    sessionID: envelope.sessionID,
    assistantMessageID: envelope.assistantMessageID,
    capabilityIdentity: envelope.capabilityIdentity,
  }
}

function invocationEnvelope(invocation: typeof LearningCommandInvocationTable.$inferSelect): InvocationEnvelope {
  if (!invocation.turn_id || !invocation.input_id) throw new Error("Learning-bootstrap invocation lost Turn identity")
  return {
    occurrenceID: invocation.occurrence_id,
    turnID: invocation.turn_id,
    inputID: invocation.input_id,
    sessionID: invocation.session_id,
    parentUserMessageID: invocation.parent_user_message_id,
    assistantMessageID: invocation.assistant_message_id,
    partID: invocation.part_id,
    providerCallID: invocation.provider_call_id,
    emissionOrdinal: invocation.emission_ordinal,
    capabilityIdentity: invocation.capability_identity,
    capabilityVersion: invocation.capability_version,
    authorizationBasis: invocation.authorization_basis,
    timeAdmitted: invocation.time_admitted,
  }
}

function agentActionProvenance(
  envelope: InvocationEnvelope,
  trusted: ValidatedAgentActionRegistration,
): Effect.Effect<AgentAction, IntegrityError> {
  return Effect.gen(function* () {
    if (
      trusted.occurrenceID !== envelope.occurrenceID ||
      trusted.depth !== trusted.lineage.length ||
      (trusted.admissionKind === "learner" && (trusted.depth !== 0 || trusted.lineage.length !== 0)) ||
      (trusted.admissionKind === "delegated_task" && (trusted.depth <= 0 || trusted.lineage.length === 0))
    ) {
      return yield* integrity("Learning-bootstrap Agent action has no exact root-or-delegated lineage")
    }
    const common = {
      schemaVersion: 1 as const,
      occurrenceID: envelope.occurrenceID,
      causalRootOccurrenceID: trusted.occurrenceID,
      sessionID: envelope.sessionID,
      turnID: envelope.turnID,
      inputID: envelope.inputID,
      assistantMessageID: envelope.assistantMessageID,
      invocationPartID: envelope.partID,
      providerCallID: envelope.providerCallID,
      emissionOrdinal: envelope.emissionOrdinal,
      capabilityIdentity: UPDATE_LEARNING_COURSE_CAPABILITY,
      capabilityVersion: UPDATE_LEARNING_COURSE_VERSION,
      issuingModelOperationID: envelope.assistantMessageID,
    }
    if (trusted.admissionKind === "learner") return { ...common, kind: "root" as const, lineage: [] }
    const lineage = trusted.lineage.map((edge) => ({
      ...edge,
      delegatedCapabilityFingerprint: fingerprint(edge.delegatedCapability),
    }))
    const effective = lineage.at(-1)
    if (
      !effective ||
      effective.childTurnID !== envelope.turnID ||
      !isDelegatedCapabilityProjection(effective.delegatedCapability)
    ) {
      return yield* integrity("Delegated learning-bootstrap action has no exact effective capability")
    }
    return {
      ...common,
      kind: "delegated" as const,
      lineage,
      effectiveDelegatedCapability: {
        identity: UPDATE_LEARNING_COURSE_CAPABILITY,
        version: UPDATE_LEARNING_COURSE_VERSION,
        projectionVersion: 2,
        fingerprint: effective.delegatedCapabilityFingerprint,
      },
    }
  })
}

function hasWriteMembership(trusted: ValidatedAgentActionRegistration) {
  if (trusted.admissionKind === "learner") return true
  const effective = trusted.lineage.at(-1)?.delegatedCapability
  if (!isDelegatedCapabilityProjection(effective)) return false
  return effective.explicit.some(
    (value) =>
      isRecord(value) &&
      value.action === "allow" &&
      typeof value.permission === "string" &&
      typeof value.pattern === "string" &&
      Wildcard.matchIdentifier(UPDATE_LEARNING_COURSE_CAPABILITY, value.permission) &&
      Wildcard.match(PERMISSION_PATTERN, value.pattern),
  )
}

function isDelegatedCapabilityProjection(value: unknown): value is Readonly<{
  version: 2
  explicit: readonly unknown[]
  parent: readonly unknown[]
  inherited: readonly unknown[]
  profile: readonly unknown[]
}> {
  return (
    isRecord(value) &&
    value.version === 2 &&
    Array.isArray(value.parent) &&
    Array.isArray(value.inherited) &&
    Array.isArray(value.profile) &&
    Array.isArray(value.explicit)
  )
}

type AdoptionTarget =
  | Readonly<{
      type: "artifact"
      artifactID: Artifact.ArtifactID
      revisionID: Artifact.RevisionID
      attribution: Artifact.AttributionBasis
    }>
  | Readonly<{ type: "representation"; representationRevisionID: Representation.RevisionID }>

function findAdoption(tx: Transaction, courseID: Course.CourseID, target: AdoptionTarget) {
  return tx
    .select()
    .from(LearningCourseMaterialAdoptionTable)
    .where(
      target.type === "representation"
        ? and(
            eq(LearningCourseMaterialAdoptionTable.course_id, courseID),
            eq(LearningCourseMaterialAdoptionTable.target_kind, "representation"),
            eq(LearningCourseMaterialAdoptionTable.representation_revision_id, target.representationRevisionID),
          )
        : and(
            eq(LearningCourseMaterialAdoptionTable.course_id, courseID),
            eq(LearningCourseMaterialAdoptionTable.target_kind, "artifact"),
            eq(LearningCourseMaterialAdoptionTable.artifact_id, target.artifactID),
            eq(LearningCourseMaterialAdoptionTable.artifact_revision_id, target.revisionID),
            eq(LearningCourseMaterialAdoptionTable.attribution_type, target.attribution.type),
            target.attribution.type === "lineage_correction"
              ? eq(LearningCourseMaterialAdoptionTable.attribution_member_id, target.attribution.memberID)
              : isNull(LearningCourseMaterialAdoptionTable.attribution_member_id),
          ),
    )
    .get()
    .pipe(Effect.orDie)
}

function anchorTarget(intent: AnchorIntent, course: Course.CourseInfo, route: Course.PublishedRevision | undefined) {
  if (intent.type === "preserve") return Effect.succeed(undefined)
  if (intent.type === "clear") return Effect.succeed(null)
  if (intent.target.type === "route_item") {
    const itemID = route?.items[intent.target.itemKey]
    if (!route || !itemID) return Effect.fail(new InvalidCommandError({ reason: "validation_error" }))
    return Effect.succeed({
      courseID: course.id,
      viewID: route.view.id,
      revisionID: route.revision.id,
      itemID,
    } satisfies Course.MembershipEndpoint)
  }
  return Effect.succeed({ courseID: course.id, ...intent.target } satisfies Course.MembershipEndpoint)
}

function childResults(input: {
  readonly course: Course.CourseInfo
  readonly courseOutcome: "created" | "corrected" | "no_change"
  readonly route?: Course.PublishedRevision
  readonly routeAuthorship?: AuthorshipIntent
  readonly selectionChanged: boolean
  readonly materials: readonly Readonly<{
    key: string
    changed: boolean
    adoptionID: string
    target:
      | Readonly<{
          type: "artifact"
          artifactID: Artifact.ArtifactID
          revisionID: Artifact.RevisionID
          attribution: Artifact.AttributionBasis
        }>
      | Readonly<{ type: "representation"; representationRevisionID: Representation.RevisionID }>
    sourceAuthority?: ContentRoot.LocalReadAuthorizationReceipt
  }>[]
  readonly maps: readonly Readonly<{ prepared: PreparedMap; info: MaterialMap.MapInfo }>[]
  readonly alignments: readonly Readonly<{ key: string; info: MaterialMap.AlignmentInfo }>[]
  readonly anchorChanged: boolean
  readonly anchorEffect?: LearnerNavigation.AnchorEffect
}) {
  return [
    {
      kind: "course" as const,
      outcome: input.courseOutcome === "no_change" ? ("no_change" as const) : ("changed" as const),
      id: input.course.id,
      detail: input.courseOutcome,
    },
    ...(input.route
      ? [
          {
            kind: "route" as const,
            outcome: "changed" as const,
            id: input.route.revision.id,
            viewID: input.route.view.id,
            revisionID: input.route.revision.id,
            authorship: input.routeAuthorship!,
            detail: `published ${input.route.view.name}`,
          },
        ]
      : []),
    {
      kind: "selection" as const,
      outcome: input.selectionChanged ? ("changed" as const) : ("no_change" as const),
      id: input.course.selection.revisionID,
      selectedRevisionID: input.course.selection.revisionID ?? null,
      detail: input.course.selection.revisionID ? "exact revision selected" : "selection clear or preserved",
    },
    ...input.materials.map(
      (material): ChildResult => ({
        kind: "material",
        key: material.key,
        outcome: material.changed ? "changed" : "no_change",
        id: material.adoptionID,
        materialTarget:
          material.target.type === "representation"
            ? {
                type: "representation",
                representationRevisionID: material.target.representationRevisionID,
              }
            : {
                type: "artifact",
                artifactID: material.target.artifactID,
                revisionID: material.target.revisionID,
                attribution: material.target.attribution,
                ...(material.sourceAuthority ? { sourceAuthority: material.sourceAuthority } : {}),
              },
        detail: material.changed ? "explicit material adoption committed" : "exact material already adopted",
      }),
    ),
    ...input.maps.map(
      (map): ChildResult => ({
        kind: "map",
        key: map.prepared.key,
        outcome: "changed",
        id: map.info.id,
        detail: "immutable Material Map published",
      }),
    ),
    ...input.alignments.map(
      (alignment): ChildResult => ({
        kind: "alignment",
        key: alignment.key,
        outcome: "changed",
        id: alignment.info.id,
        detail: "neutral exact alignment published",
      }),
    ),
    {
      kind: "anchor" as const,
      outcome: input.anchorChanged ? ("changed" as const) : ("no_change" as const),
      id: input.anchorEffect?.id,
      detail: input.anchorChanged ? "exact route anchor changed" : "route anchor preserved",
    },
  ] satisfies readonly ChildResult[]
}

function acknowledgementFor(
  outcome: "applied" | "no_change",
  course: Course.CourseInfo,
  route: Course.PublishedRevision | undefined,
  routeAuthorship: AuthorshipIntent | undefined,
  children: readonly ChildResult[],
  anchor: Readonly<{
    headID: string | null
    target: Course.MembershipEndpoint | null
    usability: Readonly<{ usable: true }> | Readonly<{ usable: false; cause: string }>
  }>,
) {
  return {
    schemaVersion: 1 as const,
    outcome,
    course: { id: course.id, title: course.title },
    ...(route
      ? {
          view: {
            id: route.view.id,
            name: route.view.name,
            revisionID: route.revision.id,
            authorship: routeAuthorship!,
          },
        }
      : {}),
    children,
    selectedRevisionID: course.selection.revisionID ?? null,
    anchor: { headID: anchor.headID, target: anchor.target, usability: anchor.usability },
    correction: "Continue in ordinary language; Repa will bind any correction to a new learner occurrence.",
  } satisfies Acknowledgement
}

function courseAuthorship(authorship: AuthorshipIntent) {
  if (authorship === "learner_supplied") return Course.Authorship.learnerAuthored()
  if (authorship === "learner_requested") return Course.Authorship.learnerDirected()
  return Course.Authorship.tutorProposed()
}

function prepareLocalRead(owners: PreparationOwners, input: LocalReadIntent, maxBytes = 16 * 1024 * 1024) {
  if (input.authority.type === "content_root") {
    return owners.contentRoots.prepareLocalRead({
      authority: { type: "content_root", contentRootID: input.authority.contentRootID },
      path: input.path,
      maxBytes,
    })
  }
  if (input.authority.type === "active_workspace") {
    return owners.activeWorkspace
      ? owners.contentRoots.prepareLocalRead({
          authority: { type: "active_workspace", scope: owners.activeWorkspace },
          path: input.path,
          maxBytes,
        })
      : Effect.fail(new InvalidCommandError({ reason: "validation_error" }))
  }
  return owners.oneOperation
    ? owners.contentRoots.prepareLocalRead({
        authority: { type: "one_operation", grant: owners.oneOperation },
        path: input.path,
        maxBytes,
      })
    : Effect.fail(new InvalidCommandError({ reason: "validation_error" }))
}

function mapReadBudgets(maxBytes = 16 * 1024 * 1024): MaterialMap.MaterialTarget.ReadBudgets {
  return {
    artifactBytes: maxBytes,
    representation: {
      integrityScanBytes: maxBytes,
      returnBytes: maxBytes,
      records: MaterialMap.MaterialTarget.limits.representationRecords,
    },
  }
}

function outlineDepth(map: MapIntent, key: string) {
  let current = map.outline.find((node) => node.key === key)
  let depth = 0
  const seen = new Set<string>()
  while (current?.parentKey) {
    if (seen.has(current.parentKey)) throw new InvalidCommandError({ reason: "validation_error" })
    seen.add(current.parentKey)
    depth++
    current = map.outline.find((node) => node.key === current!.parentKey)
  }
  return depth
}

function sameEndpoint(
  left: Course.MembershipEndpoint | null | undefined,
  right: Course.MembershipEndpoint | null | undefined,
) {
  return (
    (left == null && right == null) ||
    (left != null &&
      right != null &&
      left.courseID === right.courseID &&
      left.viewID === right.viewID &&
      left.revisionID === right.revisionID &&
      left.itemID === right.itemID)
  )
}

function validateCanonical(command: CanonicalCommand) {
  if (!bounded(command.course.type === "new" ? command.course.title : command.course.title, limits.textBytes, true)) {
    throw new InvalidCommandError({ reason: "validation_error" })
  }
  const routeKeys = command.route?.revision.items.map((item) => item.key) ?? []
  if (command.route) {
    if (
      command.route.revision.items.length === 0 ||
      command.route.revision.items.length > limits.items ||
      !unique(routeKeys) ||
      command.route.revision.items.some(
        (item) =>
          !bounded(item.key, 256) ||
          !bounded(item.title, limits.textBytes) ||
          (item.parentKey !== undefined && !routeKeys.includes(item.parentKey)),
      ) ||
      (command.route.type !== "successor_revision" && !bounded(command.route.name, limits.textBytes))
    ) {
      throw new InvalidCommandError({ reason: "validation_error" })
    }
  }
  const materials = command.materials ?? []
  const maps = command.maps ?? []
  const alignments = command.alignments ?? []
  if (
    materials.length > limits.materials ||
    maps.length > limits.maps ||
    alignments.length > limits.alignments ||
    !unique(materials.map((material) => material.key)) ||
    !unique(maps.map((map) => map.key)) ||
    !unique(alignments.map((alignment) => alignment.key)) ||
    materials.filter((material) => material.type === "local").length > 1 ||
    materials.some(
      (material) =>
        !bounded(material.key, 256) ||
        (material.type === "local" && !bounded(material.path, limits.localPathBytes)) ||
        (material.type === "artifact" &&
          material.read !== undefined &&
          !bounded(material.read.path, limits.localPathBytes)),
    )
  ) {
    throw new InvalidCommandError({ reason: "capacity_exceeded" })
  }
  const oneOperationReads = materials.filter(
    (material) =>
      (material.type === "local" && material.authority.type === "one_operation") ||
      (material.type === "artifact" && material.read?.authority.type === "one_operation"),
  )
  if (oneOperationReads.length > 1) throw new InvalidCommandError({ reason: "validation_error" })
  const materialByKey = new Map(materials.map((material) => [material.key, material]))
  const targetFingerprints = materials.map((material) =>
    material.type === "artifact"
      ? `artifact:${material.artifactID}:${material.revisionID}:${material.attribution.type}:${
          material.attribution.type === "lineage_correction" ? material.attribution.memberID : ""
        }`
      : material.type === "representation"
        ? `representation:${material.representationRevisionID}`
        : `local:${material.path}`,
  )
  if (!unique(targetFingerprints)) throw new InvalidCommandError({ reason: "validation_error" })
  for (const map of maps) {
    const material = materialByKey.get(map.materialKey)
    const nodeKeys = map.outline.map((node) => node.key)
    const selectorKeys = map.outline.flatMap((node) => node.selectors.map((selector) => selector.key))
    if (
      !material ||
      !authorshipIntent(map.authorship) ||
      map.outline.length === 0 ||
      map.outline.length > limits.outlineNodes ||
      selectorKeys.length > limits.selectors ||
      !unique(nodeKeys) ||
      !unique(selectorKeys) ||
      map.outline.some(
        (node) =>
          !bounded(node.key, 256) ||
          !bounded(node.title, limits.textBytes) ||
          (node.parentKey !== undefined && !nodeKeys.includes(node.parentKey)) ||
          node.selectors.some((selector) => !bounded(selector.key, 256)),
      ) ||
      (material.type === "artifact" && !material.read)
    ) {
      throw new InvalidCommandError({ reason: "validation_error" })
    }
    for (const node of map.outline) outlineDepth(map, node.key)
  }
  const mapByKey = new Map(maps.map((map) => [map.key, map]))
  for (const alignment of alignments) {
    const map = mapByKey.get(alignment.mapKey)
    if (
      !map ||
      !authorshipIntent(alignment.authorship) ||
      !map.outline.some((node) => node.selectors.some((selector) => selector.key === alignment.selectorKey)) ||
      !bounded(alignment.reason, limits.textBytes) ||
      (alignment.course.type === "route_item" && !routeKeys.includes(alignment.course.itemKey))
    ) {
      throw new InvalidCommandError({ reason: "validation_error" })
    }
  }
  const selection = command.selection ?? { type: "preserve" as const }
  const anchor = command.anchor ?? { type: "preserve" as const }
  if (
    (selection.type === "set" && selection.target.type === "route" && !command.route) ||
    (anchor.type === "set" && anchor.target.type === "route_item" && !routeKeys.includes(anchor.target.itemKey)) ||
    (command.route?.authorship === "tutor_initiated" &&
      selection.type === "set" &&
      selection.target.type === "route") ||
    (command.course.type === "new" && selection.type === "set" && selection.target.type === "existing") ||
    (command.course.type === "new" && anchor.type === "set" && anchor.target.type === "existing") ||
    (command.course.type === "new" && alignments.some((alignment) => alignment.course.type === "existing"))
  ) {
    throw new InvalidCommandError({ reason: "validation_error" })
  }
  const transition =
    command.course.type === "new" ||
    command.course.title !== undefined ||
    command.route !== undefined ||
    selection.type !== "preserve" ||
    materials.length > 0 ||
    maps.length > 0 ||
    alignments.length > 0 ||
    anchor.type !== "preserve"
  if (!transition) throw new InvalidCommandError({ reason: "validation_error" })
}

function canonicalRevision(revision: RevisionIntent): RevisionIntent {
  return {
    items: revision.items.map((item) => ({
      key: normalizeKey(item.key),
      title: normalizeText(item.title),
      ...(item.parentKey ? { parentKey: normalizeKey(item.parentKey) } : {}),
      ...(item.reuse ? { reuse: { ...item.reuse } } : {}),
    })),
    ...(revision.mappings
      ? {
          mappings: revision.mappings.map((mapping) => ({
            kind: mapping.kind,
            sourceItemIDs: [...mapping.sourceItemIDs],
            targetKeys: mapping.targetKeys.map(normalizeKey),
          })),
        }
      : {}),
  }
}

function canonicalRead(input: LocalReadIntent): LocalReadIntent {
  return {
    path: input.path.trim().normalize("NFC"),
    authority:
      input.authority.type === "content_root"
        ? { type: "content_root", contentRootID: input.authority.contentRootID }
        : { type: input.authority.type },
  }
}

function canonicalAnchor(anchor: AnchorIntent): AnchorIntent {
  if (anchor.type !== "set" || anchor.target.type !== "route_item") return structuredClone(anchor)
  return { type: "set", target: { type: "route_item", itemKey: normalizeKey(anchor.target.itemKey) } }
}

function canonicalCommandEffect(input: Command) {
  return Effect.try({
    try: () => canonicalizeCommand(input),
    catch: (error) =>
      error instanceof InvalidCommandError ? error : new InvalidCommandError({ reason: "validation_error" }),
  })
}

function bootstrapErrorSettlement(error: unknown, metadata: SettlementMetadata) {
  if (error instanceof InvalidCommandError) {
    return errorSettlement(error.reason === "capacity_exceeded" ? "capacity_exceeded" : "validation_error", metadata)
  }
  const tag = isRecord(error) && typeof error._tag === "string" ? error._tag : ""
  if (tag.includes("Conflict") || tag.includes("Stale")) return errorSettlement("stale", metadata)
  if (tag.includes("Inactive") || tag.includes("Unavailable")) return errorSettlement("source_unavailable", metadata)
  if (tag.includes("Path") || tag.includes("Filesystem")) return errorSettlement("source_unavailable", metadata)
  if (tag.includes("Cancelled") || tag.includes("Abort")) return errorSettlement("cancelled", metadata)
  return errorSettlement("validation_error", metadata)
}

function capabilityErrorCode(outcome: CapabilityOutcome) {
  if (outcome === "policy_deny" || outcome === "prompted_deny") return "permission_rejected" as const
  if (outcome === "prompted_correct") return "permission_corrected" as const
  if (outcome === "prompted_cancel") return "cancelled" as const
  return "interrupted" as const
}

function closedCommand(value: unknown): value is Command {
  if (
    !isRecord(value) ||
    !onlyKeys(value, ["course", "route", "selection", "materials", "maps", "alignments", "anchor"])
  ) {
    return false
  }
  if (!isRecord(value.course)) return false
  if (
    value.course.type === "new"
      ? !onlyKeys(value.course, ["type", "title"]) || typeof value.course.title !== "string"
      : value.course.type === "existing"
        ? !onlyKeys(value.course, ["type", "courseID", "title"]) ||
          typeof value.course.courseID !== "string" ||
          (value.course.title !== undefined && typeof value.course.title !== "string")
        : true
  ) {
    return false
  }
  if (value.route !== undefined && !closedRoute(value.route)) return false
  if (value.selection !== undefined && !closedSelection(value.selection)) return false
  if (value.anchor !== undefined && !closedAnchor(value.anchor)) return false
  if (value.materials !== undefined && (!Array.isArray(value.materials) || !value.materials.every(closedMaterial))) {
    return false
  }
  if (value.maps !== undefined && (!Array.isArray(value.maps) || !value.maps.every(closedMap))) return false
  if (
    value.alignments !== undefined &&
    (!Array.isArray(value.alignments) || !value.alignments.every(closedAlignment))
  ) {
    return false
  }
  return true
}

function closedRoute(value: unknown) {
  if (!isRecord(value) || !authorshipIntent(value.authorship) || !closedRevision(value.revision)) return false
  if (value.type === "successor_revision") {
    return (
      onlyKeys(value, ["type", "key", "viewID", "predecessorRevisionID", "authorship", "revision"]) &&
      typeof value.key === "string" &&
      typeof value.viewID === "string" &&
      typeof value.predecessorRevisionID === "string"
    )
  }
  return (
    (value.type === "new_view" || value.type === "distinct_view") &&
    onlyKeys(value, ["type", "key", "name", "authorship", "revision"]) &&
    typeof value.key === "string" &&
    typeof value.name === "string"
  )
}

function closedRevision(value: unknown) {
  if (!isRecord(value) || !onlyKeys(value, ["items", "mappings"]) || !Array.isArray(value.items)) return false
  if (
    !value.items.every(
      (item) =>
        isRecord(item) &&
        onlyKeys(item, ["key", "title", "parentKey", "reuse"]) &&
        typeof item.key === "string" &&
        typeof item.title === "string" &&
        (item.parentKey === undefined || typeof item.parentKey === "string") &&
        (item.reuse === undefined ||
          (isRecord(item.reuse) &&
            onlyKeys(item.reuse, ["sourceRevisionID", "itemID"]) &&
            typeof item.reuse.sourceRevisionID === "string" &&
            typeof item.reuse.itemID === "string")),
    )
  ) {
    return false
  }
  return (
    value.mappings === undefined ||
    (Array.isArray(value.mappings) &&
      value.mappings.every(
        (mapping) =>
          isRecord(mapping) &&
          onlyKeys(mapping, ["kind", "sourceItemIDs", "targetKeys"]) &&
          ["preserve", "split", "merge"].includes(String(mapping.kind)) &&
          Array.isArray(mapping.sourceItemIDs) &&
          mapping.sourceItemIDs.every((id) => typeof id === "string") &&
          Array.isArray(mapping.targetKeys) &&
          mapping.targetKeys.every((key) => typeof key === "string"),
      ))
  )
}

function closedSelection(value: unknown) {
  if (!isRecord(value)) return false
  if (value.type === "preserve" || value.type === "clear") return onlyKeys(value, ["type"])
  return (
    value.type === "set" &&
    onlyKeys(value, ["type", "target"]) &&
    isRecord(value.target) &&
    ((value.target.type === "route" && onlyKeys(value.target, ["type"])) ||
      (value.target.type === "existing" &&
        onlyKeys(value.target, ["type", "revisionID"]) &&
        typeof value.target.revisionID === "string"))
  )
}

function closedAnchor(value: unknown) {
  if (!isRecord(value)) return false
  if (value.type === "preserve" || value.type === "clear") return onlyKeys(value, ["type"])
  if (value.type !== "set" || !onlyKeys(value, ["type", "target"]) || !isRecord(value.target)) return false
  return value.target.type === "route_item"
    ? onlyKeys(value.target, ["type", "itemKey"]) && typeof value.target.itemKey === "string"
    : value.target.type === "existing" &&
        onlyKeys(value.target, ["type", "viewID", "revisionID", "itemID"]) &&
        typeof value.target.viewID === "string" &&
        typeof value.target.revisionID === "string" &&
        typeof value.target.itemID === "string"
}

function closedMaterial(value: unknown) {
  if (!isRecord(value) || typeof value.key !== "string") return false
  if (value.type === "representation") {
    return (
      onlyKeys(value, ["type", "key", "representationRevisionID"]) && typeof value.representationRevisionID === "string"
    )
  }
  if (value.type === "local") {
    return onlyKeys(value, ["type", "key", "path", "authority"]) && closedRead(value)
  }
  return (
    value.type === "artifact" &&
    onlyKeys(value, ["type", "key", "artifactID", "revisionID", "attribution", "read"]) &&
    typeof value.artifactID === "string" &&
    typeof value.revisionID === "string" &&
    isRecord(value.attribution) &&
    ((value.attribution.type === "recorded" && onlyKeys(value.attribution, ["type"])) ||
      (value.attribution.type === "lineage_correction" &&
        onlyKeys(value.attribution, ["type", "memberID"]) &&
        typeof value.attribution.memberID === "string")) &&
    (value.read === undefined || closedRead(value.read))
  )
}

function closedRead(value: unknown) {
  if (!isRecord(value) || typeof value.path !== "string" || !isRecord(value.authority)) return false
  return value.authority.type === "content_root"
    ? onlyKeys(value.authority, ["type", "contentRootID"]) && typeof value.authority.contentRootID === "string"
    : (value.authority.type === "active_workspace" || value.authority.type === "one_operation") &&
        onlyKeys(value.authority, ["type"])
}

function closedMap(value: unknown) {
  return (
    isRecord(value) &&
    onlyKeys(value, ["key", "materialKey", "authorship", "supersedesMapID", "outline"]) &&
    typeof value.key === "string" &&
    typeof value.materialKey === "string" &&
    authorshipIntent(value.authorship) &&
    (value.supersedesMapID === undefined || typeof value.supersedesMapID === "string") &&
    Array.isArray(value.outline) &&
    value.outline.every(
      (node) =>
        isRecord(node) &&
        onlyKeys(node, ["key", "parentKey", "title", "selectors"]) &&
        typeof node.key === "string" &&
        (node.parentKey === undefined || typeof node.parentKey === "string") &&
        typeof node.title === "string" &&
        Array.isArray(node.selectors) &&
        node.selectors.every(
          (selector) =>
            isRecord(selector) &&
            onlyKeys(selector, ["key", "coordinate"]) &&
            typeof selector.key === "string" &&
            closedCoordinate(selector.coordinate),
        ),
    )
  )
}

function closedCoordinate(value: unknown) {
  if (!isRecord(value) || typeof value.kind !== "string") return false
  if (value.kind === "whole_target.v1") return onlyKeys(value, ["kind"])
  if (value.kind === "artifact_byte_range.v1") {
    return (
      onlyKeys(value, ["kind", "startByte", "endByte"]) &&
      Number.isSafeInteger(value.startByte) &&
      Number.isSafeInteger(value.endByte)
    )
  }
  if (value.kind === "pdf_page_range.v1") {
    return (
      onlyKeys(value, ["kind", "startPage", "endPage"]) &&
      Number.isSafeInteger(value.startPage) &&
      Number.isSafeInteger(value.endPage)
    )
  }
  if (value.kind === "model_text_range.v1") {
    return (
      onlyKeys(value, ["kind", "startScalar", "endScalar"]) &&
      Number.isSafeInteger(value.startScalar) &&
      Number.isSafeInteger(value.endScalar)
    )
  }
  return (
    value.kind === "pdf_text_range.v1" &&
    onlyKeys(value, ["kind", "start", "end"]) &&
    closedCoordinateEndpoint(value.start) &&
    closedCoordinateEndpoint(value.end)
  )
}

function closedCoordinateEndpoint(value: unknown) {
  return (
    isRecord(value) &&
    onlyKeys(value, ["page", "item", "scalar"]) &&
    Number.isSafeInteger(value.page) &&
    Number.isSafeInteger(value.item) &&
    Number.isSafeInteger(value.scalar)
  )
}

function closedAlignment(value: unknown) {
  if (
    !isRecord(value) ||
    !onlyKeys(value, ["key", "mapKey", "selectorKey", "authorship", "course", "reason", "supersedesAlignmentID"]) ||
    typeof value.key !== "string" ||
    typeof value.mapKey !== "string" ||
    typeof value.selectorKey !== "string" ||
    !authorshipIntent(value.authorship) ||
    typeof value.reason !== "string" ||
    (value.supersedesAlignmentID !== undefined && typeof value.supersedesAlignmentID !== "string") ||
    !isRecord(value.course)
  ) {
    return false
  }
  return value.course.type === "route_item"
    ? onlyKeys(value.course, ["type", "itemKey"]) && typeof value.course.itemKey === "string"
    : value.course.type === "existing" &&
        onlyKeys(value.course, ["type", "viewID", "revisionID", "itemID", "selection"]) &&
        typeof value.course.viewID === "string" &&
        typeof value.course.revisionID === "string" &&
        typeof value.course.itemID === "string" &&
        (value.course.selection === "explicit_exact" || value.course.selection === "observed_working")
}

function authorshipIntent(value: unknown): value is AuthorshipIntent {
  return value === "learner_supplied" || value === "learner_requested" || value === "tutor_initiated"
}

function normalizeText(value: string) {
  return value.trim().normalize("NFC").replace(/\r\n?/g, "\n")
}

function normalizeKey(value: string) {
  return normalizeText(value)
}

function compareKey(left: { readonly key: string }, right: { readonly key: string }) {
  return left.key.localeCompare(right.key, "und")
}

function bounded(value: string | undefined, maxBytes: number, optional = false) {
  return value === undefined ? optional : value.length > 0 && bytes(value) <= maxBytes
}

function bytes(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function unique(values: readonly string[]) {
  return new Set(values).size === values.length
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function fingerprint(value: unknown) {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(canonicalJSON(value))
  return hasher.digest("hex")
}

function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJSON(record[key])}`)
    .join(",")}}`
}

function integrity(detail: string) {
  return Effect.fail(new IntegrityError({ detail }))
}
