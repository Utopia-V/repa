import { Artifact } from "@opencode-ai/core/artifact"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Course } from "@opencode-ai/core/course"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { FutureAttention } from "@opencode-ai/core/future-attention"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearningBootstrap } from "@opencode-ai/core/learning-bootstrap"
import { LearnerResponseEvidence } from "@opencode-ai/core/learner-response-evidence"
import { LearnerGoal } from "@opencode-ai/core/learner-goal"
import { LearnerNavigation } from "@opencode-ai/core/learner-navigation"
import { MaterialMap } from "@opencode-ai/core/material-map"
import {
  SET_DEFAULT_COURSE_PREFERENCE_V2_VERSION,
  SET_DEFAULT_COURSE_PREFERENCE_V3_VERSION,
  issueDefaultCourseCapabilityPrompt,
  readDefaultCourseInvocationVersion,
  recoverDefaultCourseV2,
  recoverDefaultCourseV3,
  reserveDefaultCourseV2,
  reserveDefaultCourseV3,
  resolveDefaultCourseProposalPresentation,
  settleDefaultCoursePolicy,
  settleDefaultCoursePrompt,
  settleDefaultCourseV2,
  settleDefaultCourseV3,
  type DefaultCourseInvocationVersion,
  type DefaultCourseV3ResultDisposition,
  type DefaultCourseV2ResultDisposition,
  type DefaultCourseV2Authorization,
} from "@opencode-ai/core/learner-navigation/default-course-v2"
import type {
  DefaultCourseAcknowledgement,
  DefaultCourseAgentAction,
} from "@opencode-ai/core/learner-navigation/schema"
import type { DefaultCourseSemanticTerminalDisposition } from "@opencode-ai/core/learner-navigation/schema"
import { RetainedSteering } from "@opencode-ai/core/retained-steering"
import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { PartTable } from "@opencode-ai/core/session/sql"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceRef } from "@/effect/instance-ref"
import { workspaceReadIdentity } from "./workspace-authority"
import { Permission } from "@/permission"
import { eq } from "drizzle-orm"
import { Cause, Context, Deferred, Effect, Exit, Layer, Schema } from "effect"
import { isDeepStrictEqual } from "node:util"
import {
  anchorCommand,
  command,
  defaultCommand,
  directDefaultV2Command,
  learnerGoalCommand,
  normalize,
  normalizeAnchor,
  normalizeDefault,
  normalizeDefaultV2,
  normalizeDefaultV3,
  normalizeGoalsV2,
  normalizeLegacyGoals,
  normalizeLearningBootstrap,
  normalizeLearnerResponseEvidence,
  normalizeFutureAttention,
  normalizeSteering,
  retainedSteeringCommand,
  type AcceptCourseViewRevisionInput,
  type SetCourseRouteAnchorInput,
  type SetDefaultCoursePreferenceInput,
  type SetDefaultCoursePreferenceV2Input,
  type SetDefaultCoursePreferenceV3Input,
  type LegacyUpdateLearnerGoalsInput,
  type UpdateLearnerGoalsInput,
  type UpdateLearningCourseInput,
  type UpdateLearnerResponseEvidenceInput,
  type UpdateFutureAttentionInput,
  type UpdateRetainedLearningSteeringInput,
} from "./input"
import { LearningCommandPermission } from "./permission"
import { LearningCommandPresentation } from "./presentation"
import { resolveLearnerResponseEvidenceMaterial } from "@/learning-context/learner-response-evidence-material"

export type Registration = Readonly<{
  turnID: Turn.ID
  inputID: Turn.InputID
  causalOccurrenceID?: LearningCommand.OccurrenceID
  partID: SessionV1.ToolPart["id"]
  callID: string
  emissionOrdinal: number
  sessionID: SessionV1.ToolPart["sessionID"]
  parentUserMessageID: SessionV1.Assistant["parentID"]
  assistantMessageID: SessionV1.Assistant["id"]
}>

export type ExecuteContext = Readonly<{
  agent?: string
  sessionID: SessionV1.ToolPart["sessionID"]
  messageID: SessionV1.Assistant["id"]
  callID?: string
  abort: AbortSignal
  extra?: Record<string, unknown>
  interaction?: Readonly<{
    permission: Readonly<{
      ruleset: PermissionV1.Ruleset
      authority: readonly Permission.AuthorityLayer[]
    }>
  }>
}>

export type ExactResult = Readonly<{
  title: string
  metadata: Record<string, unknown>
  output: string
}>

export type PrimaryCapability =
  | typeof LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY
  | typeof LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY
  | typeof LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY
  | typeof LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY
  | typeof LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY
  | typeof LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY
  | typeof LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY
  | typeof LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY

type Canonical =
  | Readonly<{
      toolID: typeof LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY
      input: AcceptCourseViewRevisionInput
    }>
  | Readonly<{
      toolID: typeof LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY
      input: SetDefaultCoursePreferenceInput
    }>
  | Readonly<{
      toolID: typeof LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY
      input: SetCourseRouteAnchorInput
    }>
  | Readonly<{
      toolID: typeof LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY
      input: UpdateRetainedLearningSteeringInput
    }>
  | Readonly<{
      toolID: typeof LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY
      input: LegacyUpdateLearnerGoalsInput
    }>

type Invocation =
  | LearningCommand.AcceptCourseViewRevisionInvocation
  | LearningCommand.NavigationInvocation
  | LearningCommand.RetainedSteeringInvocation
  | LearnerGoal.Invocation

type Prepared = Readonly<{
  canonical: Canonical
  invocation: Invocation
  settlement?: LearningCommand.Settlement
  exact?: ExactResult
}>

type RetainedExecutionReconciliation =
  | { readonly type: "candidate" }
  | { readonly type: "settled"; readonly exact: ExactResult }

type TerminalPartEnvelope = Pick<
  LearningCommand.InvocationEnvelope,
  "partID" | "assistantMessageID" | "sessionID" | "providerCallID" | "timeAdmitted"
> &
  Partial<Pick<LearningCommand.InvocationEnvelope, "capabilityVersion">>

type Active = Readonly<{
  canonical: Canonical
  registration: Registration
  deferred: Deferred.Deferred<ExactResult, unknown>
}>

type PreparationOutcome = { readonly type: "success" } | { readonly type: "failure"; readonly error: unknown }

type DefaultV2Canonical = Readonly<{
  toolID: typeof LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY
  input: SetDefaultCoursePreferenceV2Input
}>

type DefaultV2Active = Readonly<{
  canonical: DefaultV2Canonical
  registration: Registration
  deferred: Deferred.Deferred<ExactResult, unknown>
}>

type DefaultV2ExecutionPreparation =
  | Readonly<{ type: "candidate"; authorization: DefaultCourseV2Authorization }>
  | Readonly<{ type: "settled"; exact: ExactResult }>

type DefaultV3Canonical = Readonly<{
  toolID: typeof LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY
  input: SetDefaultCoursePreferenceV3Input
}>

type DefaultV3Active = Readonly<{
  canonical: DefaultV3Canonical
  registration: Registration
  deferred: Deferred.Deferred<ExactResult, unknown>
}>

type DefaultV3ExecutionPreparation =
  | Readonly<{ type: "candidate"; agentAction: DefaultCourseAgentAction }>
  | Readonly<{ type: "settled"; exact: ExactResult }>

type GoalV2Canonical = Readonly<{
  toolID: typeof LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY
  input: UpdateLearnerGoalsInput
}>

type GoalV2Active = Readonly<{
  canonical: GoalV2Canonical
  registration: Registration
  deferred: Deferred.Deferred<ExactResult, unknown>
}>

type GoalV2ExecutionPreparation =
  | Readonly<{ type: "candidate"; candidate: LearnerGoal.CandidateV2 }>
  | Readonly<{ type: "settled"; exact: ExactResult }>

type BootstrapCanonical = Readonly<{
  toolID: typeof LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY
  input: UpdateLearningCourseInput
}>

type BootstrapActive = Readonly<{
  canonical: BootstrapCanonical
  registration: Registration
  deferred: Deferred.Deferred<ExactResult, unknown>
}>

type BootstrapExecutionPreparation =
  | Readonly<{ type: "candidate"; candidate: LearningBootstrap.Candidate }>
  | Readonly<{ type: "settled"; exact: ExactResult }>

type ResponseEvidenceCanonical = Readonly<{
  toolID: typeof LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY
  input: UpdateLearnerResponseEvidenceInput
}>

type ResponseEvidenceActive = Readonly<{
  canonical: ResponseEvidenceCanonical
  registration: Registration
  deferred: Deferred.Deferred<ExactResult, unknown>
}>

type ResponseEvidenceExecutionPreparation =
  | Readonly<{ type: "candidate"; candidate: LearnerResponseEvidence.Candidate }>
  | Readonly<{ type: "settled"; exact: ExactResult }>

type FutureAttentionCanonical = Readonly<{
  toolID: typeof LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY
  input: UpdateFutureAttentionInput
}>

type FutureAttentionActive = Readonly<{
  canonical: FutureAttentionCanonical
  registration: Registration
  deferred: Deferred.Deferred<ExactResult, unknown>
}>

type FutureAttentionExecutionPreparation =
  | Readonly<{ type: "candidate"; candidate: FutureAttention.Candidate }>
  | Readonly<{ type: "settled"; exact: ExactResult }>

export interface Interface {
  readonly prepare: (input: unknown, registration: Registration) => Effect.Effect<void, unknown>
  readonly execute: (input: unknown, context: ExecuteContext) => Effect.Effect<ExactResult, unknown>
  readonly prepareCommand: (
    toolID: PrimaryCapability,
    input: unknown,
    registration: Registration,
  ) => Effect.Effect<void, unknown>
  readonly executeCommand: (
    toolID: PrimaryCapability,
    input: unknown,
    context: ExecuteContext,
  ) => Effect.Effect<ExactResult, unknown>
  readonly interrupt: (registration: Registration) => Effect.Effect<boolean, unknown>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/LearningCommandRuntime") {}

const decodePart = Schema.decodeUnknownSync(SessionV1.ToolPart)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    const permission = yield* Permission.Service
    const database = yield* Database.Service
    const courses = yield* Course.Service
    const artifacts = yield* Artifact.Service
    const contentRoots = yield* ContentRoot.Service
    const maps = yield* MaterialMap.Service
    const tutorMaterials = yield* MaterialMap.TutorCurrentUseReader
    const inflight = new Map<SessionV1.PartID, Active>()
    const defaultV2Inflight = new Map<SessionV1.PartID, DefaultV2Active>()
    const defaultV3Inflight = new Map<SessionV1.PartID, DefaultV3Active>()
    const goalV2Inflight = new Map<SessionV1.PartID, GoalV2Active>()
    const bootstrapInflight = new Map<SessionV1.PartID, BootstrapActive>()
    const responseEvidenceInflight = new Map<SessionV1.PartID, ResponseEvidenceActive>()
    const futureAttentionInflight = new Map<SessionV1.PartID, FutureAttentionActive>()

    yield* recoverAdmitted(events)

    const prepareCommand = Effect.fn("LearningCommandRuntime.prepare")(function* (
      toolID: PrimaryCapability,
      modelInput: unknown,
      registration: Registration,
    ) {
      if (toolID === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
        return yield* prepareDefaultCourse(events, modelInput, registration)
      }
      if (toolID === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY) {
        return yield* prepareLearnerGoalsV2(events, modelInput, registration)
      }
      if (toolID === LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY) {
        return yield* prepareLearningBootstrap(events, modelInput, registration)
      }
      if (toolID === LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY) {
        return yield* prepareLearnerResponseEvidence(events, modelInput, registration)
      }
      if (toolID === LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY) {
        return yield* prepareFutureAttention(events, modelInput, registration)
      }
      const canonical = canonicalInput(toolID, modelInput)
      const transaction = events.transaction((tx) =>
        Effect.gen(function* () {
          const physical = yield* loadPhysicalPrepared(tx, canonical, registration)
          if (physical) return noEvent<PreparationOutcome>({ type: "success" })
          const consumed = yield* LearningFrontier.read(tx)
          yield* TurnLifecycle.consumeToolFrontier(tx, { partID: registration.partID, frontier: consumed })
          const row = yield* readPartRow(tx, registration.partID)
          if (!row) {
            return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
          }
          const trusted = yield* TurnLifecycle.validateLearningCommandRegistration(tx, {
            turnID: registration.turnID,
            inputID: registration.inputID,
            causalOccurrenceID: registration.causalOccurrenceID,
            partID: registration.partID,
            callID: registration.callID,
            emissionOrdinal: registration.emissionOrdinal,
            sessionID: registration.sessionID,
            assistantMessageID: registration.assistantMessageID,
            capabilityIdentity: canonical.toolID,
          })
          const timeAdmitted = Math.max(
            row.time_created,
            trusted.modelTimeAdmitted,
            trusted.candidateTimeRegistered,
            trusted.toolTimeAdmitted,
          )
          yield* assertAdmittedPart(tx, canonical, registration, timeAdmitted)
          const invocation = invocationFor(canonical, registration, timeAdmitted)
          const reserved = yield* reserveTransaction(tx, canonical, invocation)
          return { ...reserved, result: { type: "success" } as PreparationOutcome }
        }).pipe(
          Effect.catch((error) => Effect.succeed(noEvent<PreparationOutcome>({ type: "failure", error }))),
          Effect.orDie,
        ),
      )
      return yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const exit = yield* restore(transaction).pipe(Effect.exit)
          if (Exit.isFailure(exit)) {
            const reconciled = yield* loadCommittedExactResult(events, registration, canonical).pipe(Effect.exit)
            if (Exit.isSuccess(reconciled) && Exit.isSuccess(reconciled.value) && reconciled.value.value) return
            if (Exit.isSuccess(reconciled) && Exit.isFailure(reconciled.value)) {
              return yield* Effect.failCause(reconciled.value.cause)
            }
            if (Exit.isFailure(reconciled)) return yield* Effect.failCause(reconciled.cause)
            return yield* Effect.failCause(exit.cause)
          }
          const outcome = exit.value
          if (outcome.result.type === "failure") return yield* Effect.fail(outcome.result.error)
        }),
      )
    })

    const prepare = (input: unknown, registration: Registration) =>
      prepareCommand(LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY, input, registration)

    const executeCommand = Effect.fn("LearningCommandRuntime.execute")(function* (
      toolID: PrimaryCapability,
      modelInput: unknown,
      context: ExecuteContext,
    ) {
      if (toolID === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
        return yield* executeDefaultCourse(
          events,
          permission,
          defaultV2Inflight,
          defaultV3Inflight,
          modelInput,
          context,
        )
      }
      if (toolID === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY) {
        return yield* executeLearnerGoalsV2(events, permission, goalV2Inflight, modelInput, context)
      }
      if (toolID === LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY) {
        return yield* executeLearningBootstrap(
          events,
          permission,
          bootstrapInflight,
          { database, courses, artifacts, contentRoots, maps },
          modelInput,
          context,
        )
      }
      if (toolID === LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY) {
        return yield* executeLearnerResponseEvidence(
          events,
          permission,
          responseEvidenceInflight,
          { database, contentRoots, maps, tutorMaterials },
          modelInput,
          context,
        )
      }
      if (toolID === LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY) {
        return yield* executeFutureAttention(
          events,
          permission,
          futureAttentionInflight,
          modelInput,
          context,
        )
      }
      const registration = requireRegistration(context)
      const canonical = canonicalInput(toolID, modelInput)
      const active = inflight.get(registration.partID)
      if (active) {
        if (!isDeepStrictEqual(active.registration, registration) || !isDeepStrictEqual(active.canonical, canonical)) {
          return yield* invocationConflict(registration)
        }
        return yield* Deferred.await(active.deferred)
      }

      const deferred = Deferred.makeUnsafe<ExactResult, unknown>()
      const token = { canonical, registration, deferred } satisfies Active
      inflight.set(registration.partID, token)
      return yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const exit = yield* restore(
            loadPrepared(events, canonical, registration).pipe(
              Effect.flatMap((prepared) => executePrepared(events, permission, prepared, context)),
            ),
          ).pipe(Effect.exit)
          if (Exit.isFailure(exit)) {
            const reconciled = yield* loadCommittedExactResult(events, registration, canonical).pipe(Effect.exit)
            if (Exit.isSuccess(reconciled) && Exit.isSuccess(reconciled.value) && reconciled.value.value) {
              yield* Deferred.succeed(deferred, reconciled.value.value).pipe(Effect.ignore)
              if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
              return reconciled.value.value
            }
            if (Exit.isFailure(reconciled)) {
              yield* Deferred.failCause(deferred, reconciled.cause).pipe(Effect.ignore)
              if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
              return yield* Effect.failCause(reconciled.cause)
            }
            if (Exit.isFailure(reconciled.value)) {
              yield* Deferred.failCause(deferred, reconciled.value.cause).pipe(Effect.ignore)
              if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
              return yield* Effect.failCause(reconciled.value.cause)
            }
            if (isKnownExecutionFailure(Cause.squash(exit.cause))) {
              yield* Deferred.failCause(deferred, exit.cause).pipe(Effect.ignore)
              if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
              return yield* Effect.failCause(exit.cause)
            }
            const unknown = outcomeUnknown(canonical.toolID, {
              partID: registration.partID,
              assistantMessageID: registration.assistantMessageID,
              sessionID: registration.sessionID,
              providerCallID: registration.callID,
              timeAdmitted: Date.now(),
            })
            yield* Deferred.succeed(deferred, unknown).pipe(Effect.ignore)
            if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
            return unknown
          }
          yield* Deferred.succeed(deferred, exit.value).pipe(Effect.ignore)
          if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
          return exit.value
        }),
      )
    })

    const execute = (input: unknown, context: ExecuteContext) =>
      executeCommand(LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY, input, context)

    const interrupt = (registration: Registration) => interruptInvocation(events, registration)

    return Service.of({
      prepare,
      execute,
      prepareCommand,
      executeCommand,
      interrupt,
    })
  }),
)

function prepareLearnerGoalsV2(events: EventV2.Interface, modelInput: unknown, registration: Registration) {
  return Effect.gen(function* () {
    const stored = yield* readStoredLearnerGoalState(events, registration)
    if (stored?.version === 1) {
      yield* interruptInvocation(events, registration)
      return
    }
    return yield* events
      .transaction((tx) =>
        Effect.gen(function* () {
          const canonical = {
            toolID: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
            input: normalizeGoalsV2(modelInput),
          } satisfies GoalV2Canonical
          const existing = yield* readLearnerGoalV2State(tx, registration)
          if (existing) {
            const state = yield* requireLearnerGoalV2State(tx, canonical, registration)
            if (state.status !== "admitted") {
              yield* assertLearnerGoalV2TerminalPart(tx, canonical, registration, state)
            }
            return noEvent(undefined)
          }

          const consumed = yield* LearningFrontier.read(tx)
          yield* TurnLifecycle.consumeToolFrontier(tx, { partID: registration.partID, frontier: consumed })
          const row = yield* readPartRow(tx, registration.partID)
          if (!row) {
            return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
          }
          const trusted = yield* TurnLifecycle.validateLearningCommandRegistration(tx, {
            turnID: registration.turnID,
            inputID: registration.inputID,
            causalOccurrenceID: registration.causalOccurrenceID,
            partID: registration.partID,
            callID: registration.callID,
            emissionOrdinal: registration.emissionOrdinal,
            sessionID: registration.sessionID,
            assistantMessageID: registration.assistantMessageID,
            capabilityIdentity: canonical.toolID,
          })
          const timeAdmitted = Math.max(
            row.time_created,
            trusted.modelTimeAdmitted,
            trusted.candidateTimeRegistered,
            trusted.toolTimeAdmitted,
          )
          yield* assertLearnerGoalV2AdmittedPart(tx, canonical, registration)
          const reserved = yield* LearningCommand.reserveLearnerGoalsV2(tx, {
            envelope: learnerGoalV2Envelope(registration, timeAdmitted),
            command: canonical.input,
            settlement: yield* settlementMetadata(tx, registration.sessionID, timeAdmitted),
          })
          if (reserved.type === "admitted") return noEvent(undefined)
          if (reserved.type === "replay") {
            return yield* Effect.die("New learner Goal V2 admission unexpectedly replayed")
          }
          const state = yield* requireLearnerGoalV2State(tx, canonical, registration)
          const part = learnerGoalV2TerminalPart(canonical, registration, state)
          return withPartEvent(undefined, part, requirePhysicalSettlement(state.settlement).settlementTime)
        }).pipe(Effect.orDie),
      )
      .pipe(Effect.asVoid)
  })
}

function executeLearnerGoalsV2(
  events: EventV2.Interface,
  permission: Permission.Interface,
  inflight: Map<SessionV1.PartID, GoalV2Active>,
  modelInput: unknown,
  context: ExecuteContext,
) {
  return Effect.gen(function* () {
    const registration = requireRegistration(context)
    const legacy = yield* loadLegacyLearnerGoalResult(events, registration)
    if (legacy) return legacy
    const canonical = {
      toolID: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      input: normalizeGoalsV2(modelInput),
    } satisfies GoalV2Canonical
    const active = inflight.get(registration.partID)
    if (active) {
      if (!isDeepStrictEqual(active.registration, registration) || !isDeepStrictEqual(active.canonical, canonical)) {
        return yield* invocationConflict(registration)
      }
      return yield* Deferred.await(active.deferred)
    }

    const deferred = Deferred.makeUnsafe<ExactResult, unknown>()
    const token = { canonical, registration, deferred } satisfies GoalV2Active
    inflight.set(registration.partID, token)
    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const exit = yield* restore(
          executeLearnerGoalsV2Once(events, permission, canonical, registration, context),
        ).pipe(Effect.exit)
        if (Exit.isFailure(exit)) {
          const reconciled = yield* loadCommittedLearnerGoalV2Result(events, canonical, registration).pipe(Effect.exit)
          if (Exit.isSuccess(reconciled) && reconciled.value) {
            yield* Deferred.succeed(deferred, reconciled.value).pipe(Effect.ignore)
            if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
            return reconciled.value
          }
          const cause = Exit.isFailure(reconciled) ? reconciled.cause : exit.cause
          yield* Deferred.failCause(deferred, cause).pipe(Effect.ignore)
          if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
          return yield* Effect.failCause(cause)
        }
        yield* Deferred.succeed(deferred, exit.value).pipe(Effect.ignore)
        if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
        return exit.value
      }),
    )
  })
}

function executeLearnerGoalsV2Once(
  events: EventV2.Interface,
  permission: Permission.Interface,
  canonical: GoalV2Canonical,
  registration: Registration,
  context: ExecuteContext,
) {
  return Effect.gen(function* () {
    const prepared = yield* events.transaction<GoalV2ExecutionPreparation, typeof SessionV1.Event.PartUpdated>((tx) =>
      Effect.gen(function* () {
        const state = yield* requireLearnerGoalV2State(tx, canonical, registration)
        if (state.status !== "admitted") {
          return noEvent({
            type: "settled" as const,
            exact: exactFromPart(yield* assertLearnerGoalV2TerminalPart(tx, canonical, registration, state)),
          })
        }
        if (state.disposition !== "candidate_v2" || !state.candidate) {
          return yield* Effect.die("Admitted learner Goal V2 invocation is not a complete candidate")
        }
        return noEvent({ type: "candidate" as const, candidate: state.candidate })
      }).pipe(Effect.orDie),
    )
    if (prepared.result.type === "settled") return prepared.result.exact

    const authority = requirePermissionContext(context)
    const candidate = prepared.result.candidate
    const presentation = LearningCommandPresentation.learnerGoalsV2Capability(candidate, {
      sessionID: registration.sessionID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
      partID: registration.partID,
    })
    const shownScope = {
      patterns: [LearnerGoal.PERMISSION_PATTERN],
      agentAction: candidate.agentAction,
      materialized: candidate.materialized,
      semanticPresentation: presentation,
    }
    const permissionOutcome = yield* LearningCommandPermission.ask(
      permission,
      {
        sessionID: registration.sessionID,
        permission: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        patterns: [LearnerGoal.PERMISSION_PATTERN],
        always: [LearnerGoal.PERMISSION_PATTERN],
        metadata: {
          goalKind: "learner_goal",
          commandFingerprint: candidate.commandFingerprint,
          issuance: candidate.agentAction.kind,
          operations: candidate.materialized.operations.map((operation) =>
            LearningCommandPresentation.learnerGoalV2MaterializedOperation(operation),
          ),
          ...SemanticPresentation.metadata(presentation),
        },
        tool: { messageID: registration.assistantMessageID, callID: registration.callID },
        ruleset: authority.ruleset,
        authority: authority.authority,
        lifecycle: {
          resolution: "request_exact",
          selected: (selection) => persistLearnerGoalSelection(events, registration, selection, shownScope),
          replied: (input) => persistLearnerGoalReply(events, registration, input),
        },
      },
      context.abort,
    )
    return yield* commitLearnerGoalsV2(events, canonical, registration, permissionOutcome)
  })
}

function persistLearnerGoalSelection(
  events: EventV2.Interface,
  registration: Registration,
  selection: Permission.Selection,
  shownScope: Readonly<Record<string, unknown>>,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const metadata = yield* settlementMetadata(tx, registration.sessionID, Date.now())
        if (selection.action === "ask") {
          yield* LearningCommand.issueLearnerGoalCapabilityPromptV2(tx, {
            partID: registration.partID,
            requestID: selection.request.id,
            policyBasis: { ...selection.basis },
            shownScope,
            time: metadata.time,
            order: metadata.order,
          })
          return noEvent(undefined)
        }
        yield* LearningCommand.settleLearnerGoalPolicyV2(tx, {
          partID: registration.partID,
          outcome: selection.action === "allow" ? "policy_allow" : "policy_deny",
          policyBasis: { ...selection.basis },
          time: metadata.time,
          order: metadata.order,
        })
        return noEvent(undefined)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.asVoid)
}

function persistLearnerGoalReply(
  events: EventV2.Interface,
  registration: Registration,
  input: Readonly<{ request: PermissionV1.Request; reply: PermissionV1.ReplyInput }>,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const metadata = yield* settlementMetadata(tx, registration.sessionID, Date.now())
        yield* LearningCommand.settleLearnerGoalPromptV2(tx, {
          partID: registration.partID,
          requestID: input.request.id,
          outcome:
            input.reply.reply === "once" || input.reply.reply === "always"
              ? "prompted_allow"
              : input.reply.reply === "cancel"
                ? "prompted_cancel"
                : input.reply.message
                  ? "prompted_correct"
                  : "prompted_deny",
          reply: { ...input.reply },
          time: metadata.time,
          order: metadata.order,
        })
        return noEvent(undefined)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.asVoid)
}

function commitLearnerGoalsV2(
  events: EventV2.Interface,
  canonical: GoalV2Canonical,
  registration: Registration,
  permission: LearningCommand.PermissionOutcome,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const state = yield* requireLearnerGoalV2State(tx, canonical, registration)
        if (state.status !== "admitted") {
          return noEvent(exactFromPart(yield* assertLearnerGoalV2TerminalPart(tx, canonical, registration, state)))
        }
        const settlement = yield* permission.type === "abort"
          ? LearningCommand.recoverLearnerGoalsV2(tx, {
              partID: registration.partID,
              settlement: yield* settlementMetadata(tx, registration.sessionID, state.timeAdmitted),
            })
          : Effect.gen(function* () {
              const consumed = yield* LearningFrontier.read(tx)
              yield* TurnLifecycle.consumeToolFrontier(tx, { partID: registration.partID, frontier: consumed })
              return yield* LearningCommand.settleLearnerGoalsV2(tx, {
                partID: registration.partID,
                settlement: yield* settlementMetadata(tx, registration.sessionID, state.timeAdmitted),
              })
            })
        if (settlement.settlement.outcome === "applied") {
          yield* TurnLifecycle.recordToolResultingFrontier(tx, {
            partID: registration.partID,
            frontier: yield* LearningFrontier.read(tx),
          })
        }
        const terminal = yield* requireLearnerGoalV2State(tx, canonical, registration)
        const part = learnerGoalV2TerminalPart(canonical, registration, terminal)
        return withPartEvent(exactFromPart(part), part, requirePhysicalSettlement(terminal.settlement).settlementTime)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

function readStoredLearnerGoalState(events: EventV2.Interface, registration: Registration) {
  return events
    .transaction((tx) => readLearnerGoalV2State(tx, registration).pipe(Effect.map(noEvent), Effect.orDie))
    .pipe(Effect.map((result) => result.result))
}

function readLearnerGoalV2State(tx: EventV2.Transaction, registration: Registration) {
  return LearningCommand.readLearnerGoalInvocationVersion(tx, {
    partID: registration.partID,
    assistantMessageID: registration.assistantMessageID,
    providerCallID: registration.callID,
  })
}

function loadLegacyLearnerGoalResult(events: EventV2.Interface, registration: Registration) {
  return Effect.gen(function* () {
    const state = yield* readStoredLearnerGoalState(events, registration)
    if (!state || state.version !== 1) return undefined
    yield* interruptInvocation(events, registration)
    return yield* events
      .transaction((tx) =>
        readPart(tx, registration.partID).pipe(
          Effect.map((part) => noEvent(exactFromPart(part))),
          Effect.orDie,
        ),
      )
      .pipe(Effect.map((result) => result.result))
  })
}

function loadCommittedLearnerGoalV2Result(
  events: EventV2.Interface,
  canonical: GoalV2Canonical,
  registration: Registration,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const state = yield* readLearnerGoalV2State(tx, registration)
        if (!state || state.version !== 2 || state.status === "admitted") return noEvent(undefined)
        return noEvent(exactFromPart(yield* assertLearnerGoalV2TerminalPart(tx, canonical, registration, state)))
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

function requireLearnerGoalV2State(tx: EventV2.Transaction, canonical: GoalV2Canonical, registration: Registration) {
  return Effect.gen(function* () {
    const state = yield* readLearnerGoalV2State(tx, registration)
    if (!state || state.version !== 2) {
      return yield* new LearningCommand.InvocationNotFoundError({ partID: registration.partID })
    }
    const storedCommand =
      state.disposition === "candidate_v2"
        ? state.candidate?.canonicalCommand
        : state.disposition === "semantic_terminal_v2"
          ? state.semanticTerminal?.canonicalCommand
          : undefined
    if (storedCommand && !isDeepStrictEqual(storedCommand, LearningCommand.canonicalizeCommandV2(canonical.input))) {
      return yield* invocationConflict(registration)
    }
    if (state.status === "admitted" && (state.disposition !== "candidate_v2" || !state.candidate)) {
      return yield* Effect.die("Admitted learner Goal V2 invocation is not a complete candidate")
    }
    const physical = yield* LearningCommand.lookupPhysicalInvocation(tx, {
      partID: registration.partID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
    })
    if (!physical || !physical.turn_id || !physical.input_id) {
      return yield* new LearningCommand.InvocationNotFoundError({ partID: registration.partID })
    }
    const envelope = learnerGoalV2Envelope(registration, physical.time_admitted)
    if (
      physical.turn_id !== envelope.turnID ||
      physical.input_id !== envelope.inputID ||
      physical.occurrence_id !== envelope.occurrenceID ||
      physical.session_id !== envelope.sessionID ||
      physical.parent_user_message_id !== envelope.parentUserMessageID ||
      physical.assistant_message_id !== envelope.assistantMessageID ||
      physical.emission_ordinal !== envelope.emissionOrdinal ||
      physical.capability_identity !== envelope.capabilityIdentity ||
      physical.capability_version !== envelope.capabilityVersion ||
      physical.authorization_basis !== envelope.authorizationBasis
    ) {
      return yield* invocationConflict(registration)
    }
    if (state.status === "admitted") yield* assertLearnerGoalV2AdmittedPart(tx, canonical, registration)
    return { ...state, timeAdmitted: physical.time_admitted }
  })
}

function learnerGoalV2Envelope(
  registration: Registration,
  timeAdmitted: number,
): LearningCommand.InvocationEnvelope & Readonly<{ authorizationBasis: "agent_action"; capabilityVersion: 2 }> {
  return {
    occurrenceID: registration.causalOccurrenceID!,
    turnID: registration.turnID,
    inputID: registration.inputID,
    sessionID: registration.sessionID,
    parentUserMessageID: registration.parentUserMessageID,
    assistantMessageID: registration.assistantMessageID,
    partID: registration.partID,
    providerCallID: registration.callID,
    emissionOrdinal: registration.emissionOrdinal,
    capabilityIdentity: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
    capabilityVersion: 2,
    authorizationBasis: "agent_action",
    timeAdmitted,
  }
}

function assertLearnerGoalV2AdmittedPart(
  tx: EventV2.Transaction,
  canonical: GoalV2Canonical,
  registration: Registration,
) {
  return readPart(tx, registration.partID).pipe(
    Effect.flatMap((part) =>
      part.id === registration.partID &&
      part.messageID === registration.assistantMessageID &&
      part.sessionID === registration.sessionID &&
      part.type === "tool" &&
      part.tool === canonical.toolID &&
      part.callID === registration.callID &&
      part.state.status === "pending" &&
      isDeepStrictEqual(part.state.input, canonical.input)
        ? Effect.void
        : invocationConflict(registration),
    ),
  )
}

function assertLearnerGoalV2TerminalPart(
  tx: EventV2.Transaction,
  canonical: GoalV2Canonical,
  registration: Registration,
  state: Extract<LearningCommand.GoalInvocationVersion, { readonly version: 2 }> & Readonly<{ timeAdmitted?: number }>,
) {
  return Effect.gen(function* () {
    const expected = learnerGoalV2TerminalPart(canonical, registration, state)
    const part = yield* readPart(tx, registration.partID)
    if (
      !isDeepStrictEqual(invocationPart(part), invocationPart(expected)) ||
      SemanticPresentation.readResult(part, true).type !== "valid"
    ) {
      return yield* Effect.die(`Terminal learner Goal V2 Part ${registration.partID} diverged from its settlement`)
    }
    return part
  })
}

function learnerGoalV2TerminalPart(
  canonical: GoalV2Canonical,
  registration: Registration,
  state: Extract<LearningCommand.GoalInvocationVersion, { readonly version: 2 }> & Readonly<{ timeAdmitted?: number }>,
) {
  const settlement = requirePhysicalSettlement(state.settlement)
  const presentation = LearningCommandPresentation.learnerGoalsV2SettlementResult(settlement, state, {
    sessionID: registration.sessionID,
    assistantMessageID: registration.assistantMessageID,
    providerCallID: registration.callID,
    partID: registration.partID,
  })
  const projected = SemanticPresentation.projectResultBasis(presentation.basis)
  if (!projected) throw new Error("Learner Goal V2 settlement has no valid semantic projection")
  const exact = {
    title: projected.title,
    metadata: {
      command: canonical.toolID,
      commandVersion: 2,
      outcome: settlement.outcome,
      ...(settlement.outcome === "error" ? { code: settlement.code } : {}),
      durablySettled: projected.durablySettled,
      truncated: false,
      ...SemanticPresentation.metadata(presentation),
    },
    output: JSON.stringify({
      settlement,
      disposition: state.disposition,
      ...(state.disposition === "candidate_v2" && state.candidate
        ? {
            agentAction: state.candidate.agentAction,
            ...(state.capabilityOutcome ? { capabilityOutcome: state.capabilityOutcome } : {}),
            ...(state.permissionRequestID ? { permissionRequestID: state.permissionRequestID } : {}),
          }
        : {}),
      ...(state.disposition === "semantic_terminal_v2" && state.semanticTerminal
        ? { semanticTerminal: state.semanticTerminal }
        : {}),
    }),
  }
  const part = {
    id: registration.partID,
    messageID: registration.assistantMessageID,
    sessionID: registration.sessionID,
    type: "tool",
    tool: canonical.toolID,
    callID: registration.callID,
    state: {
      status: "completed",
      input: canonical.input,
      output: exact.output,
      title: exact.title,
      metadata: exact.metadata,
      time: { start: state.timeAdmitted!, end: settlement.settlementTime },
    },
  } satisfies SessionV1.ToolPart
  if (SemanticPresentation.readResult(part, true).type !== "valid") {
    throw new Error(`Constructed terminal learner Goal V2 Part ${registration.partID} is invalid`)
  }
  return part
}

type BootstrapRuntimeOwners = Readonly<{
  database: Database.Interface
  courses: Course.Interface
  artifacts: Artifact.Interface
  contentRoots: ContentRoot.Interface
  maps: MaterialMap.Interface
}>

function prepareLearningBootstrap(events: EventV2.Interface, modelInput: unknown, registration: Registration) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const canonical = {
          toolID: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
          input: normalizeLearningBootstrap(modelInput),
        } satisfies BootstrapCanonical
        const existing = yield* readLearningBootstrapState(tx, registration)
        if (existing) {
          const state = yield* requireLearningBootstrapState(tx, canonical, registration)
          if (state.status !== "admitted") {
            yield* assertLearningBootstrapTerminalPart(tx, canonical, registration, state)
          }
          return noEvent(undefined)
        }

        const consumed = yield* LearningFrontier.read(tx)
        yield* TurnLifecycle.consumeToolFrontier(tx, { partID: registration.partID, frontier: consumed })
        const row = yield* readPartRow(tx, registration.partID)
        if (!row) {
          return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
        }
        const trusted = yield* TurnLifecycle.validateLearningCommandRegistration(tx, {
          turnID: registration.turnID,
          inputID: registration.inputID,
          causalOccurrenceID: registration.causalOccurrenceID,
          partID: registration.partID,
          callID: registration.callID,
          emissionOrdinal: registration.emissionOrdinal,
          sessionID: registration.sessionID,
          assistantMessageID: registration.assistantMessageID,
          capabilityIdentity: canonical.toolID,
        })
        const timeAdmitted = Math.max(
          row.time_created,
          trusted.modelTimeAdmitted,
          trusted.candidateTimeRegistered,
          trusted.toolTimeAdmitted,
        )
        yield* assertLearningBootstrapAdmittedPart(tx, canonical, registration)
        const reserved = yield* LearningBootstrap.reserve(tx, {
          envelope: learningBootstrapEnvelope(registration, timeAdmitted),
          command: canonical.input,
          settlement: yield* settlementMetadata(tx, registration.sessionID, timeAdmitted),
        })
        if (reserved.type === "admitted") return noEvent(undefined)
        if (reserved.type === "replay") {
          return yield* Effect.die("New learning-bootstrap admission unexpectedly replayed")
        }
        const state = yield* requireLearningBootstrapState(tx, canonical, registration)
        const part = learningBootstrapTerminalPart(canonical, registration, state)
        return withPartEvent(undefined, part, requirePhysicalSettlement(state.settlement).settlementTime)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.asVoid)
}

function executeLearningBootstrap(
  events: EventV2.Interface,
  permission: Permission.Interface,
  inflight: Map<SessionV1.PartID, BootstrapActive>,
  owners: BootstrapRuntimeOwners,
  modelInput: unknown,
  context: ExecuteContext,
) {
  return Effect.gen(function* () {
    const registration = requireRegistration(context)
    const canonical = {
      toolID: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
      input: normalizeLearningBootstrap(modelInput),
    } satisfies BootstrapCanonical
    const active = inflight.get(registration.partID)
    if (active) {
      if (!isDeepStrictEqual(active.registration, registration) || !isDeepStrictEqual(active.canonical, canonical)) {
        return yield* invocationConflict(registration)
      }
      return yield* Deferred.await(active.deferred)
    }

    const deferred = Deferred.makeUnsafe<ExactResult, unknown>()
    const token = { canonical, registration, deferred } satisfies BootstrapActive
    inflight.set(registration.partID, token)
    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const exit = yield* restore(
          executeLearningBootstrapOnce(events, permission, canonical, registration, owners, context),
        ).pipe(Effect.exit)
        if (Exit.isFailure(exit)) {
          const reconciled = yield* loadCommittedLearningBootstrapResult(events, canonical, registration).pipe(
            Effect.exit,
          )
          if (Exit.isSuccess(reconciled) && reconciled.value) {
            yield* Deferred.succeed(deferred, reconciled.value).pipe(Effect.ignore)
            if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
            return reconciled.value
          }
          const cause = Exit.isFailure(reconciled) ? reconciled.cause : exit.cause
          yield* Deferred.failCause(deferred, cause).pipe(Effect.ignore)
          if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
          return yield* Effect.failCause(cause)
        }
        yield* Deferred.succeed(deferred, exit.value).pipe(Effect.ignore)
        if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
        return exit.value
      }),
    )
  })
}

function executeLearningBootstrapOnce(
  events: EventV2.Interface,
  permission: Permission.Interface,
  canonical: BootstrapCanonical,
  registration: Registration,
  owners: BootstrapRuntimeOwners,
  context: ExecuteContext,
) {
  return Effect.gen(function* () {
    const prepared = yield* events.transaction<BootstrapExecutionPreparation, typeof SessionV1.Event.PartUpdated>(
      (tx) =>
        Effect.gen(function* () {
          const state = yield* requireLearningBootstrapState(tx, canonical, registration)
          if (state.status !== "admitted") {
            return noEvent({
              type: "settled" as const,
              exact: exactFromPart(yield* assertLearningBootstrapTerminalPart(tx, canonical, registration, state)),
            })
          }
          if (state.disposition !== "candidate_v1" || !state.candidate) {
            return yield* Effect.die("Admitted learning-bootstrap invocation is not a complete candidate")
          }
          return noEvent({ type: "candidate" as const, candidate: state.candidate })
        }).pipe(Effect.orDie),
    )
    if (prepared.result.type === "settled") return prepared.result.exact

    const authority = requirePermissionContext(context)
    const candidate = prepared.result.candidate
    const scope = LearningCommandPresentation.learningBootstrapScope(candidate)
    const permissionConstraint = SemanticPresentation.learningBootstrapPermissionConstraint(scope)
    const presentation = LearningCommandPresentation.learningBootstrapCapability(candidate, {
      sessionID: registration.sessionID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
      partID: registration.partID,
    })
    const shownScope = {
      patterns: [LearningBootstrap.PERMISSION_PATTERN],
      agentAction: candidate.agentAction,
      scope,
      semanticPresentation: presentation,
    }
    const permissionOutcome = yield* LearningCommandPermission.ask(
      permission,
      {
        sessionID: registration.sessionID,
        permission: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
        patterns: [LearningBootstrap.PERMISSION_PATTERN],
        always: permissionConstraint.always,
        requirePrompt: permissionConstraint.promptRequired,
        metadata: {
          bootstrapKind: "learning_bootstrap",
          commandFingerprint: candidate.commandFingerprint,
          issuance: candidate.agentAction.kind,
          scope,
          ...SemanticPresentation.metadata(presentation),
        },
        tool: { messageID: registration.assistantMessageID, callID: registration.callID },
        ruleset: authority.ruleset,
        authority: authority.authority,
        lifecycle: {
          resolution: "request_exact",
          selected: (selection) => persistLearningBootstrapSelection(events, registration, selection, shownScope),
          replied: (input) => persistLearningBootstrapReply(events, registration, input),
        },
      },
      context.abort,
    )
    if (permissionOutcome.type !== "allow" || context.abort.aborted) {
      return yield* completeLearningBootstrap(events, canonical, registration, owners)
    }

    const current = yield* events
      .transaction((tx) =>
        requireLearningBootstrapState(tx, canonical, registration).pipe(Effect.map(noEvent), Effect.orDie),
      )
      .pipe(Effect.map((result) => result.result))
    if (current.status !== "admitted" || current.disposition !== "candidate_v1" || !current.candidate) {
      return exactFromPart(
        yield* events
          .transaction((tx) =>
            assertLearningBootstrapTerminalPart(tx, canonical, registration, current).pipe(
              Effect.map((part) => noEvent(part)),
              Effect.orDie,
            ),
          )
          .pipe(Effect.map((result) => result.result)),
      )
    }
    const instance = yield* InstanceRef
    const oneOperationPath =
      "oneOperationPath" in permissionConstraint ? permissionConstraint.oneOperationPath : undefined
    const execution = yield* Effect.scoped(
      LearningBootstrap.prepareExecution(
        current.candidate,
        {
          database: owners.database.db,
          contentRoots: owners.contentRoots,
          artifacts: owners.artifacts,
          maps: owners.maps,
          ...(instance
            ? {
                activeWorkspace: ContentRoot.ActiveWorkspaceRead.trusted(
                  instance.directory,
                  workspaceReadIdentity(instance),
                ),
              }
            : {}),
          ...(oneOperationPath && current.capabilityOutcome === "prompted_allow" && current.permissionRequestID
            ? {
                oneOperation: ContentRoot.OneOperationRead.trusted(
                  oneOperationPath,
                  `${registration.partID}:${registration.callID}`,
                  JSON.stringify({
                    permissionRequestID: current.permissionRequestID,
                    commandFingerprint: current.candidate.commandFingerprint,
                  }),
                ),
              }
            : {}),
        },
        { abort: context.abort },
      ),
    ).pipe(Effect.exit)
    if (Exit.isFailure(execution)) {
      return yield* failLearningBootstrap(events, canonical, registration, Cause.squash(execution.cause))
    }
    return yield* completeLearningBootstrap(events, canonical, registration, owners, execution.value)
  })
}

function persistLearningBootstrapSelection(
  events: EventV2.Interface,
  registration: Registration,
  selection: Permission.Selection,
  shownScope: Readonly<Record<string, unknown>>,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const metadata = yield* settlementMetadata(tx, registration.sessionID, Date.now())
        if (selection.action === "ask") {
          yield* LearningBootstrap.issueCapabilityPrompt(tx, {
            partID: registration.partID,
            requestID: selection.request.id,
            policyBasis: { ...selection.basis },
            shownScope,
            time: metadata.time,
            order: metadata.order,
          })
          return noEvent(undefined)
        }
        yield* LearningBootstrap.settlePolicy(tx, {
          partID: registration.partID,
          outcome: selection.action === "allow" ? "policy_allow" : "policy_deny",
          policyBasis: { ...selection.basis },
          time: metadata.time,
          order: metadata.order,
        })
        return noEvent(undefined)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.asVoid)
}

function persistLearningBootstrapReply(
  events: EventV2.Interface,
  registration: Registration,
  input: Readonly<{ request: PermissionV1.Request; reply: PermissionV1.ReplyInput }>,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const metadata = yield* settlementMetadata(tx, registration.sessionID, Date.now())
        yield* LearningBootstrap.settlePrompt(tx, {
          partID: registration.partID,
          requestID: input.request.id,
          outcome:
            input.reply.reply === "once" || input.reply.reply === "always"
              ? "prompted_allow"
              : input.reply.reply === "cancel"
                ? "prompted_cancel"
                : input.reply.message
                  ? "prompted_correct"
                  : "prompted_deny",
          reply: { ...input.reply },
          time: metadata.time,
          order: metadata.order,
        })
        return noEvent(undefined)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.asVoid)
}

function completeLearningBootstrap(
  events: EventV2.Interface,
  canonical: BootstrapCanonical,
  registration: Registration,
  owners: BootstrapRuntimeOwners,
  prepared?: LearningBootstrap.PreparedExecution,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const state = yield* requireLearningBootstrapState(tx, canonical, registration)
        if (state.status !== "admitted") {
          return noEvent(exactFromPart(yield* assertLearningBootstrapTerminalPart(tx, canonical, registration, state)))
        }
        const settlement = prepared
          ? yield* Effect.gen(function* () {
              const consumed = yield* LearningFrontier.read(tx)
              yield* TurnLifecycle.consumeToolFrontier(tx, { partID: registration.partID, frontier: consumed })
              return yield* LearningBootstrap.settle(tx, {
                partID: registration.partID,
                prepared,
                owners: { courses: owners.courses, maps: owners.maps },
                settlement: yield* settlementMetadata(tx, registration.sessionID, state.timeAdmitted),
              })
            })
          : yield* LearningBootstrap.recover(tx, {
              partID: registration.partID,
              settlement: yield* settlementMetadata(tx, registration.sessionID, state.timeAdmitted),
            })
        if (settlement.settlement.outcome === "applied") {
          yield* TurnLifecycle.recordToolResultingFrontier(tx, {
            partID: registration.partID,
            frontier: yield* LearningFrontier.read(tx),
          })
        }
        const terminal = yield* requireLearningBootstrapState(tx, canonical, registration)
        const part = learningBootstrapTerminalPart(canonical, registration, terminal)
        return withPartEvent(exactFromPart(part), part, requirePhysicalSettlement(terminal.settlement).settlementTime)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

function failLearningBootstrap(
  events: EventV2.Interface,
  canonical: BootstrapCanonical,
  registration: Registration,
  error: unknown,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const state = yield* requireLearningBootstrapState(tx, canonical, registration)
        if (state.status !== "admitted") {
          return noEvent(exactFromPart(yield* assertLearningBootstrapTerminalPart(tx, canonical, registration, state)))
        }
        yield* LearningBootstrap.settleFailure(tx, {
          partID: registration.partID,
          error,
          settlement: yield* settlementMetadata(tx, registration.sessionID, state.timeAdmitted),
        })
        const terminal = yield* requireLearningBootstrapState(tx, canonical, registration)
        const part = learningBootstrapTerminalPart(canonical, registration, terminal)
        return withPartEvent(exactFromPart(part), part, requirePhysicalSettlement(terminal.settlement).settlementTime)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

function readLearningBootstrapState(tx: EventV2.Transaction, registration: Registration) {
  return LearningBootstrap.readInvocationVersion(tx, {
    partID: registration.partID,
    assistantMessageID: registration.assistantMessageID,
    providerCallID: registration.callID,
  })
}

function requireLearningBootstrapState(
  tx: EventV2.Transaction,
  canonical: BootstrapCanonical,
  registration: Registration,
) {
  return Effect.gen(function* () {
    const state = yield* readLearningBootstrapState(tx, registration)
    if (!state) return yield* new LearningCommand.InvocationNotFoundError({ partID: registration.partID })
    const storedCommand =
      state.disposition === "candidate_v1"
        ? state.candidate?.canonicalCommand
        : state.disposition === "semantic_terminal_v1"
          ? state.semanticTerminal?.canonicalCommand
          : undefined
    if (storedCommand && !isDeepStrictEqual(storedCommand, LearningBootstrap.canonicalizeCommand(canonical.input))) {
      return yield* invocationConflict(registration)
    }
    if (state.status === "admitted" && (state.disposition !== "candidate_v1" || !state.candidate)) {
      return yield* Effect.die("Admitted learning-bootstrap invocation is not a complete candidate")
    }
    const physical = yield* LearningCommand.lookupPhysicalInvocation(tx, {
      partID: registration.partID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
    })
    if (!physical || !physical.turn_id || !physical.input_id) {
      return yield* new LearningCommand.InvocationNotFoundError({ partID: registration.partID })
    }
    const envelope = learningBootstrapEnvelope(registration, physical.time_admitted)
    if (
      physical.turn_id !== envelope.turnID ||
      physical.input_id !== envelope.inputID ||
      physical.occurrence_id !== envelope.occurrenceID ||
      physical.session_id !== envelope.sessionID ||
      physical.parent_user_message_id !== envelope.parentUserMessageID ||
      physical.assistant_message_id !== envelope.assistantMessageID ||
      physical.emission_ordinal !== envelope.emissionOrdinal ||
      physical.capability_identity !== envelope.capabilityIdentity ||
      physical.capability_version !== envelope.capabilityVersion ||
      physical.authorization_basis !== envelope.authorizationBasis
    ) {
      return yield* invocationConflict(registration)
    }
    if (state.status === "admitted") yield* assertLearningBootstrapAdmittedPart(tx, canonical, registration)
    return state
  })
}

function learningBootstrapEnvelope(
  registration: Registration,
  timeAdmitted: number,
): LearningCommand.InvocationEnvelope & Readonly<{ authorizationBasis: "agent_action"; capabilityVersion: 1 }> {
  return {
    occurrenceID: registration.causalOccurrenceID!,
    turnID: registration.turnID,
    inputID: registration.inputID,
    sessionID: registration.sessionID,
    parentUserMessageID: registration.parentUserMessageID,
    assistantMessageID: registration.assistantMessageID,
    partID: registration.partID,
    providerCallID: registration.callID,
    emissionOrdinal: registration.emissionOrdinal,
    capabilityIdentity: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
    capabilityVersion: 1,
    authorizationBasis: "agent_action",
    timeAdmitted,
  }
}

function assertLearningBootstrapAdmittedPart(
  tx: EventV2.Transaction,
  canonical: BootstrapCanonical,
  registration: Registration,
) {
  return readPart(tx, registration.partID).pipe(
    Effect.flatMap((part) =>
      part.id === registration.partID &&
      part.messageID === registration.assistantMessageID &&
      part.sessionID === registration.sessionID &&
      part.type === "tool" &&
      part.tool === canonical.toolID &&
      part.callID === registration.callID &&
      part.state.status === "pending" &&
      isDeepStrictEqual(part.state.input, canonical.input)
        ? Effect.void
        : invocationConflict(registration),
    ),
  )
}

function assertLearningBootstrapTerminalPart(
  tx: EventV2.Transaction,
  canonical: BootstrapCanonical,
  registration: Registration,
  state: LearningBootstrap.InvocationVersion,
) {
  return Effect.gen(function* () {
    const expected = learningBootstrapTerminalPart(canonical, registration, state)
    const part = yield* readPart(tx, registration.partID)
    if (
      !isDeepStrictEqual(invocationPart(part), invocationPart(expected)) ||
      SemanticPresentation.readResult(part, true).type !== "valid"
    ) {
      return yield* Effect.die(`Terminal learning-bootstrap Part ${registration.partID} diverged from its settlement`)
    }
    return part
  })
}

function learningBootstrapTerminalPart(
  canonical: BootstrapCanonical,
  registration: Registration,
  state: LearningBootstrap.InvocationVersion,
) {
  const settlement = requirePhysicalSettlement(state.settlement)
  const presentation = LearningCommandPresentation.learningBootstrapSettlementResult(settlement, state, {
    sessionID: registration.sessionID,
    assistantMessageID: registration.assistantMessageID,
    providerCallID: registration.callID,
    partID: registration.partID,
  })
  const projected = SemanticPresentation.projectResultBasis(presentation.basis)
  if (!projected) throw new Error("Learning-bootstrap settlement has no valid semantic projection")
  const exact = {
    title: projected.title,
    metadata: {
      command: canonical.toolID,
      commandVersion: 1,
      outcome: settlement.outcome,
      ...(settlement.outcome === "error" ? { code: settlement.code } : {}),
      durablySettled: projected.durablySettled,
      truncated: false,
      ...SemanticPresentation.metadata(presentation),
    },
    output: JSON.stringify({
      settlement,
      disposition: state.disposition,
      ...(state.disposition === "candidate_v1" && state.candidate
        ? {
            agentAction: state.candidate.agentAction,
            ...(state.capabilityOutcome ? { capabilityOutcome: state.capabilityOutcome } : {}),
            ...(state.permissionRequestID ? { permissionRequestID: state.permissionRequestID } : {}),
          }
        : {}),
      ...(state.disposition === "semantic_terminal_v1" && state.semanticTerminal
        ? { semanticTerminal: state.semanticTerminal }
        : {}),
    }),
  }
  const part = {
    id: registration.partID,
    messageID: registration.assistantMessageID,
    sessionID: registration.sessionID,
    type: "tool",
    tool: canonical.toolID,
    callID: registration.callID,
    state: {
      status: "completed",
      input: canonical.input,
      output: exact.output,
      title: exact.title,
      metadata: exact.metadata,
      time: { start: state.timeAdmitted, end: settlement.settlementTime },
    },
  } satisfies SessionV1.ToolPart
  if (SemanticPresentation.readResult(part, true).type !== "valid") {
    throw new Error(`Constructed terminal learning-bootstrap Part ${registration.partID} is invalid`)
  }
  return part
}

function loadCommittedLearningBootstrapResult(
  events: EventV2.Interface,
  canonical: BootstrapCanonical,
  registration: Registration,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const state = yield* readLearningBootstrapState(tx, registration)
        if (!state || state.status === "admitted") return noEvent(undefined)
        return noEvent(exactFromPart(yield* assertLearningBootstrapTerminalPart(tx, canonical, registration, state)))
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

type ResponseEvidenceRuntimeOwners = Readonly<{
  database: Database.Interface
  contentRoots: ContentRoot.Interface
  maps: MaterialMap.Interface
  tutorMaterials: MaterialMap.TutorCurrentUseReaderInterface
}>

function prepareLearnerResponseEvidence(events: EventV2.Interface, modelInput: unknown, registration: Registration) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const canonical = {
          toolID: LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY,
          input: normalizeLearnerResponseEvidence(modelInput),
        } satisfies ResponseEvidenceCanonical
        const existing = yield* readLearnerResponseEvidenceState(tx, registration)
        if (existing) {
          const state = yield* requireLearnerResponseEvidenceState(tx, canonical, registration)
          if (state.status !== "admitted") {
            yield* assertLearnerResponseEvidenceTerminalPart(tx, canonical, registration, state)
          }
          return noEvent(undefined)
        }

        const consumed = yield* LearningFrontier.read(tx)
        yield* TurnLifecycle.consumeToolFrontier(tx, { partID: registration.partID, frontier: consumed })
        const row = yield* readPartRow(tx, registration.partID)
        if (!row) {
          return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
        }
        const trusted = yield* TurnLifecycle.validateLearningCommandRegistration(tx, {
          turnID: registration.turnID,
          inputID: registration.inputID,
          causalOccurrenceID: registration.causalOccurrenceID,
          partID: registration.partID,
          callID: registration.callID,
          emissionOrdinal: registration.emissionOrdinal,
          sessionID: registration.sessionID,
          assistantMessageID: registration.assistantMessageID,
          capabilityIdentity: canonical.toolID,
        })
        const timeAdmitted = Math.max(
          row.time_created,
          trusted.modelTimeAdmitted,
          trusted.candidateTimeRegistered,
          trusted.toolTimeAdmitted,
        )
        yield* assertLearnerResponseEvidenceAdmittedPart(tx, canonical, registration)
        const reserved = yield* LearnerResponseEvidence.reserve(tx, {
          envelope: learnerResponseEvidenceEnvelope(registration, timeAdmitted),
          command: canonical.input,
          settlement: yield* settlementMetadata(tx, registration.sessionID, timeAdmitted),
        })
        if (reserved.type === "admitted") return noEvent(undefined)
        if (reserved.type === "replay") {
          return yield* Effect.die("New learner-response-evidence admission unexpectedly replayed")
        }
        const state = yield* requireLearnerResponseEvidenceState(tx, canonical, registration)
        const part = learnerResponseEvidenceTerminalPart(canonical, registration, state)
        return withPartEvent(undefined, part, requirePhysicalSettlement(state.settlement).settlementTime)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.asVoid)
}

function executeLearnerResponseEvidence(
  events: EventV2.Interface,
  permission: Permission.Interface,
  inflight: Map<SessionV1.PartID, ResponseEvidenceActive>,
  owners: ResponseEvidenceRuntimeOwners,
  modelInput: unknown,
  context: ExecuteContext,
) {
  return Effect.gen(function* () {
    const registration = requireRegistration(context)
    const canonical = {
      toolID: LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY,
      input: normalizeLearnerResponseEvidence(modelInput),
    } satisfies ResponseEvidenceCanonical
    const active = inflight.get(registration.partID)
    if (active) {
      if (!isDeepStrictEqual(active.registration, registration) || !isDeepStrictEqual(active.canonical, canonical)) {
        return yield* invocationConflict(registration)
      }
      return yield* Deferred.await(active.deferred)
    }

    const deferred = Deferred.makeUnsafe<ExactResult, unknown>()
    const token = { canonical, registration, deferred } satisfies ResponseEvidenceActive
    inflight.set(registration.partID, token)
    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const exit = yield* restore(
          executeLearnerResponseEvidenceOnce(events, permission, canonical, registration, owners, context),
        ).pipe(Effect.exit)
        if (Exit.isFailure(exit)) {
          const reconciled = yield* loadCommittedLearnerResponseEvidenceResult(events, canonical, registration).pipe(
            Effect.exit,
          )
          if (Exit.isSuccess(reconciled) && reconciled.value) {
            yield* Deferred.succeed(deferred, reconciled.value).pipe(Effect.ignore)
            if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
            return reconciled.value
          }
          const cause = Exit.isFailure(reconciled) ? reconciled.cause : exit.cause
          yield* Deferred.failCause(deferred, cause).pipe(Effect.ignore)
          if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
          return yield* Effect.failCause(cause)
        }
        yield* Deferred.succeed(deferred, exit.value).pipe(Effect.ignore)
        if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
        return exit.value
      }),
    )
  })
}

function executeLearnerResponseEvidenceOnce(
  events: EventV2.Interface,
  permission: Permission.Interface,
  canonical: ResponseEvidenceCanonical,
  registration: Registration,
  owners: ResponseEvidenceRuntimeOwners,
  context: ExecuteContext,
) {
  return Effect.gen(function* () {
    const prepared = yield* events.transaction<
      ResponseEvidenceExecutionPreparation,
      typeof SessionV1.Event.PartUpdated
    >((tx) =>
      Effect.gen(function* () {
        const state = yield* requireLearnerResponseEvidenceState(tx, canonical, registration)
        if (state.status !== "admitted") {
          return noEvent({
            type: "settled" as const,
            exact: exactFromPart(yield* assertLearnerResponseEvidenceTerminalPart(tx, canonical, registration, state)),
          })
        }
        if (state.disposition !== "candidate_v1" || !state.candidate) {
          return yield* Effect.die("Admitted learner-response-evidence invocation is not a complete candidate")
        }
        return noEvent({ type: "candidate" as const, candidate: state.candidate })
      }).pipe(Effect.orDie),
    )
    if (prepared.result.type === "settled") return prepared.result.exact

    const authority = requirePermissionContext(context)
    const candidate = prepared.result.candidate
    const scope = LearningCommandPresentation.learnerResponseEvidenceScope(candidate)
    const presentation = LearningCommandPresentation.learnerResponseEvidenceCapability(candidate, {
      sessionID: registration.sessionID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
      partID: registration.partID,
    })
    const shownScope = {
      patterns: [LearnerResponseEvidence.PERMISSION_PATTERN],
      agentAction: candidate.agentAction,
      scope,
      semanticPresentation: presentation,
    }
    const permissionOutcome = yield* LearningCommandPermission.ask(
      permission,
      {
        sessionID: registration.sessionID,
        permission: LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY,
        patterns: [LearnerResponseEvidence.PERMISSION_PATTERN],
        always: [LearnerResponseEvidence.PERMISSION_PATTERN],
        requirePrompt: false,
        metadata: {
          evidenceKind: "learner_response_evidence",
          commandFingerprint: candidate.commandFingerprint,
          issuance: candidate.agentAction.kind,
          scope,
          ...SemanticPresentation.metadata(presentation),
        },
        tool: { messageID: registration.assistantMessageID, callID: registration.callID },
        ruleset: authority.ruleset,
        authority: authority.authority,
        lifecycle: {
          resolution: "request_exact",
          selected: (selection) =>
            persistLearnerResponseEvidenceSelection(events, registration, selection, shownScope),
          replied: (input) => persistLearnerResponseEvidenceReply(events, registration, input),
        },
      },
      context.abort,
    )
    if (permissionOutcome.type !== "allow" || context.abort.aborted) {
      return yield* completeLearnerResponseEvidence(events, canonical, registration)
    }

    const current = yield* events
      .transaction((tx) =>
        requireLearnerResponseEvidenceState(tx, canonical, registration).pipe(Effect.map(noEvent), Effect.orDie),
      )
      .pipe(Effect.map((result) => result.result))
    if (current.status !== "admitted" || current.disposition !== "candidate_v1" || !current.candidate) {
      return exactFromPart(
        yield* events
          .transaction((tx) =>
            assertLearnerResponseEvidenceTerminalPart(tx, canonical, registration, current).pipe(
              Effect.map((part) => noEvent(part)),
              Effect.orDie,
            ),
          )
          .pipe(Effect.map((result) => result.result)),
      )
    }

    const proof = yield* prepareLearnerResponseEvidenceCurrentUse(owners, current.candidate, registration, context).pipe(
      Effect.exit,
    )
    if (Exit.isFailure(proof)) {
      return yield* failLearnerResponseEvidence(events, canonical, registration, Cause.squash(proof.cause))
    }
    return yield* completeLearnerResponseEvidence(events, canonical, registration, proof.value)
  })
}

function persistLearnerResponseEvidenceSelection(
  events: EventV2.Interface,
  registration: Registration,
  selection: Permission.Selection,
  shownScope: Readonly<Record<string, unknown>>,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const metadata = yield* settlementMetadata(tx, registration.sessionID, Date.now())
        if (selection.action === "ask") {
          yield* LearnerResponseEvidence.issueCapabilityPrompt(tx, {
            partID: registration.partID,
            requestID: selection.request.id,
            policyBasis: { ...selection.basis },
            shownScope,
            time: metadata.time,
            order: metadata.order,
          })
          return noEvent(undefined)
        }
        yield* LearnerResponseEvidence.settlePolicy(tx, {
          partID: registration.partID,
          outcome: selection.action === "allow" ? "policy_allow" : "policy_deny",
          policyBasis: { ...selection.basis },
          time: metadata.time,
          order: metadata.order,
        })
        return noEvent(undefined)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.asVoid)
}

function persistLearnerResponseEvidenceReply(
  events: EventV2.Interface,
  registration: Registration,
  input: Readonly<{ request: PermissionV1.Request; reply: PermissionV1.ReplyInput }>,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const metadata = yield* settlementMetadata(tx, registration.sessionID, Date.now())
        yield* LearnerResponseEvidence.settlePrompt(tx, {
          partID: registration.partID,
          requestID: input.request.id,
          outcome:
            input.reply.reply === "once" || input.reply.reply === "always"
              ? "prompted_allow"
              : input.reply.reply === "cancel"
                ? "prompted_cancel"
                : input.reply.message
                  ? "prompted_correct"
                  : "prompted_deny",
          reply: { ...input.reply },
          time: metadata.time,
          order: metadata.order,
        })
        return noEvent(undefined)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.asVoid)
}

function prepareLearnerResponseEvidenceCurrentUse(
  owners: ResponseEvidenceRuntimeOwners,
  candidate: LearnerResponseEvidence.Candidate,
  registration: Registration,
  context: ExecuteContext,
) {
  return Effect.gen(function* () {
    if (candidate.canonicalCommand.operation !== "create" || !candidate.materialized.target) return undefined
    const target = candidate.materialized.target
    const targetProof = yield* owners.database.db.transaction((tx) =>
      MaterialMap.prepareEvidenceTargetProof(tx, {
        alignmentID: target.alignmentID,
        mapID: target.mapID,
        selectorID: target.selectorID,
        course: {
          courseID: target.courseID,
          viewID: target.viewID,
          revisionID: target.revisionID,
          itemID: target.itemID,
        },
      }),
    )
    const operationIdentity = `${registration.partID}:${registration.callID}`
    const profileIdentity = JSON.stringify({
      agent: context.agent ?? "repa",
      sessionID: context.sessionID,
      permission: requirePermissionContext(context),
    })
    const resolved = yield* resolveLearnerResponseEvidenceMaterial(owners, {
      mapID: target.mapID,
      selectorID: target.selectorID,
      operationIdentity,
      profileIdentity,
      abort: context.abort,
    })
    if (
      resolved.byteLength <= 0 ||
      resolved.byteLength > LearnerResponseEvidence.MAX_SELECTOR_BYTES
    ) {
      return yield* new LearnerResponseEvidence.InvalidCommandError({ reason: "capacity_exceeded" })
    }
    return { targetProof, currentUse: resolved.receipt }
  })
}

function completeLearnerResponseEvidence(
  events: EventV2.Interface,
  canonical: ResponseEvidenceCanonical,
  registration: Registration,
  proof?: Readonly<{
    targetProof: MaterialMap.EvidenceTargetProof
    currentUse: MaterialMap.CurrentUseReceipt
  }>,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const state = yield* requireLearnerResponseEvidenceState(tx, canonical, registration)
        if (state.status !== "admitted") {
          return noEvent(
            exactFromPart(yield* assertLearnerResponseEvidenceTerminalPart(tx, canonical, registration, state)),
          )
        }
        const settlement = proof || canonical.input.operation !== "create"
          ? yield* Effect.gen(function* () {
              const consumed = yield* LearningFrontier.read(tx)
              yield* TurnLifecycle.consumeToolFrontier(tx, { partID: registration.partID, frontier: consumed })
              return yield* LearnerResponseEvidence.settle(tx, {
                partID: registration.partID,
                settlement: yield* settlementMetadata(tx, registration.sessionID, state.timeAdmitted),
                ...(proof ?? {}),
              })
            })
          : yield* LearnerResponseEvidence.recover(tx, {
              partID: registration.partID,
              settlement: yield* settlementMetadata(tx, registration.sessionID, state.timeAdmitted),
            })
        if (settlement.settlement.outcome === "applied") {
          yield* TurnLifecycle.recordToolResultingFrontier(tx, {
            partID: registration.partID,
            frontier: yield* LearningFrontier.read(tx),
          })
        }
        const terminal = yield* requireLearnerResponseEvidenceState(tx, canonical, registration)
        const part = learnerResponseEvidenceTerminalPart(canonical, registration, terminal)
        return withPartEvent(exactFromPart(part), part, requirePhysicalSettlement(terminal.settlement).settlementTime)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

function failLearnerResponseEvidence(
  events: EventV2.Interface,
  canonical: ResponseEvidenceCanonical,
  registration: Registration,
  error: unknown,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const state = yield* requireLearnerResponseEvidenceState(tx, canonical, registration)
        if (state.status !== "admitted") {
          return noEvent(
            exactFromPart(yield* assertLearnerResponseEvidenceTerminalPart(tx, canonical, registration, state)),
          )
        }
        yield* LearnerResponseEvidence.settleFailure(tx, {
          partID: registration.partID,
          error,
          settlement: yield* settlementMetadata(tx, registration.sessionID, state.timeAdmitted),
        })
        const terminal = yield* requireLearnerResponseEvidenceState(tx, canonical, registration)
        const part = learnerResponseEvidenceTerminalPart(canonical, registration, terminal)
        return withPartEvent(exactFromPart(part), part, requirePhysicalSettlement(terminal.settlement).settlementTime)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

function readLearnerResponseEvidenceState(tx: EventV2.Transaction, registration: Registration) {
  return LearnerResponseEvidence.readInvocationVersion(tx, {
    partID: registration.partID,
    assistantMessageID: registration.assistantMessageID,
    providerCallID: registration.callID,
  })
}

function requireLearnerResponseEvidenceState(
  tx: EventV2.Transaction,
  canonical: ResponseEvidenceCanonical,
  registration: Registration,
) {
  return Effect.gen(function* () {
    const state = yield* readLearnerResponseEvidenceState(tx, registration)
    if (!state) return yield* new LearningCommand.InvocationNotFoundError({ partID: registration.partID })
    const storedCommand =
      state.disposition === "candidate_v1"
        ? state.candidate?.canonicalCommand
        : state.disposition === "semantic_terminal_v1"
          ? state.semanticTerminal?.canonicalCommand
          : undefined
    if (
      storedCommand &&
      !isDeepStrictEqual(storedCommand, LearnerResponseEvidence.canonicalizeCommand(canonical.input))
    ) {
      return yield* invocationConflict(registration)
    }
    if (state.status === "admitted" && (state.disposition !== "candidate_v1" || !state.candidate)) {
      return yield* Effect.die("Admitted learner-response-evidence invocation is not a complete candidate")
    }
    const physical = yield* LearningCommand.lookupPhysicalInvocation(tx, {
      partID: registration.partID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
    })
    if (!physical || !physical.turn_id || !physical.input_id) {
      return yield* new LearningCommand.InvocationNotFoundError({ partID: registration.partID })
    }
    const envelope = learnerResponseEvidenceEnvelope(registration, physical.time_admitted)
    if (
      physical.turn_id !== envelope.turnID ||
      physical.input_id !== envelope.inputID ||
      physical.occurrence_id !== envelope.occurrenceID ||
      physical.session_id !== envelope.sessionID ||
      physical.parent_user_message_id !== envelope.parentUserMessageID ||
      physical.assistant_message_id !== envelope.assistantMessageID ||
      physical.emission_ordinal !== envelope.emissionOrdinal ||
      physical.capability_identity !== envelope.capabilityIdentity ||
      physical.capability_version !== envelope.capabilityVersion ||
      physical.authorization_basis !== envelope.authorizationBasis
    ) {
      return yield* invocationConflict(registration)
    }
    if (state.status === "admitted") yield* assertLearnerResponseEvidenceAdmittedPart(tx, canonical, registration)
    return state
  })
}

function learnerResponseEvidenceEnvelope(
  registration: Registration,
  timeAdmitted: number,
): LearningCommand.InvocationEnvelope & Readonly<{ authorizationBasis: "agent_action"; capabilityVersion: 1 }> {
  return {
    occurrenceID: registration.causalOccurrenceID!,
    turnID: registration.turnID,
    inputID: registration.inputID,
    sessionID: registration.sessionID,
    parentUserMessageID: registration.parentUserMessageID,
    assistantMessageID: registration.assistantMessageID,
    partID: registration.partID,
    providerCallID: registration.callID,
    emissionOrdinal: registration.emissionOrdinal,
    capabilityIdentity: LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY,
    capabilityVersion: 1,
    authorizationBasis: "agent_action",
    timeAdmitted,
  }
}

function assertLearnerResponseEvidenceAdmittedPart(
  tx: EventV2.Transaction,
  canonical: ResponseEvidenceCanonical,
  registration: Registration,
) {
  return readPart(tx, registration.partID).pipe(
    Effect.flatMap((part) =>
      part.id === registration.partID &&
      part.messageID === registration.assistantMessageID &&
      part.sessionID === registration.sessionID &&
      part.type === "tool" &&
      part.tool === canonical.toolID &&
      part.callID === registration.callID &&
      part.state.status === "pending" &&
      isDeepStrictEqual(part.state.input, canonical.input)
        ? Effect.void
        : invocationConflict(registration),
    ),
  )
}

function assertLearnerResponseEvidenceTerminalPart(
  tx: EventV2.Transaction,
  canonical: ResponseEvidenceCanonical,
  registration: Registration,
  state: LearnerResponseEvidence.InvocationVersion,
) {
  return Effect.gen(function* () {
    const expected = learnerResponseEvidenceTerminalPart(canonical, registration, state)
    const part = yield* readPart(tx, registration.partID)
    if (
      !isDeepStrictEqual(invocationPart(part), invocationPart(expected)) ||
      SemanticPresentation.readResult(part, true).type !== "valid"
    ) {
      return yield* Effect.die(
        `Terminal learner-response-evidence Part ${registration.partID} diverged from its settlement`,
      )
    }
    return part
  })
}

function learnerResponseEvidenceTerminalPart(
  canonical: ResponseEvidenceCanonical,
  registration: Registration,
  state: LearnerResponseEvidence.InvocationVersion,
) {
  const settlement = requirePhysicalSettlement(state.settlement)
  const presentation = LearningCommandPresentation.learnerResponseEvidenceSettlementResult(settlement, state, {
    sessionID: registration.sessionID,
    assistantMessageID: registration.assistantMessageID,
    providerCallID: registration.callID,
    partID: registration.partID,
  })
  const projected = SemanticPresentation.projectResultBasis(presentation.basis)
  if (!projected) throw new Error("Learner-response-evidence settlement has no valid semantic projection")
  const exact = {
    title: projected.title,
    metadata: {
      command: canonical.toolID,
      commandVersion: 1,
      outcome: settlement.outcome,
      ...(settlement.outcome === "error" ? { code: settlement.code } : {}),
      durablySettled: projected.durablySettled,
      truncated: false,
      ...SemanticPresentation.metadata(presentation),
    },
    output: JSON.stringify({
      settlement,
      disposition: state.disposition,
      ...(state.disposition === "candidate_v1" && state.candidate
        ? {
            agentAction: state.candidate.agentAction,
            ...(state.capabilityOutcome ? { capabilityOutcome: state.capabilityOutcome } : {}),
            ...(state.permissionRequestID ? { permissionRequestID: state.permissionRequestID } : {}),
          }
        : {}),
      ...(state.disposition === "semantic_terminal_v1" && state.semanticTerminal
        ? { semanticTerminal: state.semanticTerminal }
        : {}),
    }),
  }
  const part = {
    id: registration.partID,
    messageID: registration.assistantMessageID,
    sessionID: registration.sessionID,
    type: "tool",
    tool: canonical.toolID,
    callID: registration.callID,
    state: {
      status: "completed",
      input: canonical.input,
      output: exact.output,
      title: exact.title,
      metadata: exact.metadata,
      time: { start: state.timeAdmitted, end: settlement.settlementTime },
    },
  } satisfies SessionV1.ToolPart
  if (SemanticPresentation.readResult(part, true).type !== "valid") {
    throw new Error(`Constructed terminal learner-response-evidence Part ${registration.partID} is invalid`)
  }
  return part
}

function loadCommittedLearnerResponseEvidenceResult(
  events: EventV2.Interface,
  canonical: ResponseEvidenceCanonical,
  registration: Registration,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const state = yield* readLearnerResponseEvidenceState(tx, registration)
        if (!state || state.status === "admitted") return noEvent(undefined)
        return noEvent(
          exactFromPart(yield* assertLearnerResponseEvidenceTerminalPart(tx, canonical, registration, state)),
        )
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

function prepareFutureAttention(events: EventV2.Interface, modelInput: unknown, registration: Registration) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const canonical = {
          toolID: LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY,
          input: normalizeFutureAttention(modelInput),
        } satisfies FutureAttentionCanonical
        const existing = yield* readFutureAttentionState(tx, registration)
        if (existing) {
          const state = yield* requireFutureAttentionState(tx, canonical, registration)
          if (state.status !== "admitted") yield* assertFutureAttentionTerminalPart(tx, canonical, registration, state)
          return noEvent(undefined)
        }

        const consumed = yield* LearningFrontier.read(tx)
        yield* TurnLifecycle.consumeToolFrontier(tx, { partID: registration.partID, frontier: consumed })
        const row = yield* readPartRow(tx, registration.partID)
        if (!row) {
          return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
        }
        const trusted = yield* TurnLifecycle.validateLearningCommandRegistration(tx, {
          turnID: registration.turnID,
          inputID: registration.inputID,
          causalOccurrenceID: registration.causalOccurrenceID,
          partID: registration.partID,
          callID: registration.callID,
          emissionOrdinal: registration.emissionOrdinal,
          sessionID: registration.sessionID,
          assistantMessageID: registration.assistantMessageID,
          capabilityIdentity: canonical.toolID,
        })
        const timeAdmitted = Math.max(
          row.time_created,
          trusted.modelTimeAdmitted,
          trusted.candidateTimeRegistered,
          trusted.toolTimeAdmitted,
        )
        yield* assertFutureAttentionAdmittedPart(tx, canonical, registration)
        const reserved = yield* FutureAttention.reserve(tx, {
          envelope: futureAttentionEnvelope(registration, timeAdmitted),
          command: canonical.input,
          settlement: yield* settlementMetadata(tx, registration.sessionID, timeAdmitted),
        })
        if (reserved.type === "admitted") return noEvent(undefined)
        if (reserved.type === "replay") return yield* Effect.die("New FutureAttention admission unexpectedly replayed")
        const state = yield* requireFutureAttentionState(tx, canonical, registration)
        const part = futureAttentionTerminalPart(canonical, registration, state)
        return withPartEvent(undefined, part, requirePhysicalSettlement(state.settlement).settlementTime)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.asVoid)
}

function executeFutureAttention(
  events: EventV2.Interface,
  permission: Permission.Interface,
  inflight: Map<SessionV1.PartID, FutureAttentionActive>,
  modelInput: unknown,
  context: ExecuteContext,
) {
  return Effect.gen(function* () {
    const registration = requireRegistration(context)
    const canonical = {
      toolID: LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY,
      input: normalizeFutureAttention(modelInput),
    } satisfies FutureAttentionCanonical
    const active = inflight.get(registration.partID)
    if (active) {
      if (!isDeepStrictEqual(active.registration, registration) || !isDeepStrictEqual(active.canonical, canonical)) {
        return yield* invocationConflict(registration)
      }
      return yield* Deferred.await(active.deferred)
    }

    const deferred = Deferred.makeUnsafe<ExactResult, unknown>()
    const token = { canonical, registration, deferred } satisfies FutureAttentionActive
    inflight.set(registration.partID, token)
    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const exit = yield* restore(
          executeFutureAttentionOnce(events, permission, canonical, registration, context),
        ).pipe(Effect.exit)
        if (Exit.isFailure(exit)) {
          const reconciled = yield* loadCommittedFutureAttentionResult(events, canonical, registration).pipe(Effect.exit)
          if (Exit.isSuccess(reconciled) && reconciled.value) {
            yield* Deferred.succeed(deferred, reconciled.value).pipe(Effect.ignore)
            if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
            return reconciled.value
          }
          const cause = Exit.isFailure(reconciled) ? reconciled.cause : exit.cause
          yield* Deferred.failCause(deferred, cause).pipe(Effect.ignore)
          if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
          return yield* Effect.failCause(cause)
        }
        yield* Deferred.succeed(deferred, exit.value).pipe(Effect.ignore)
        if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
        return exit.value
      }),
    )
  })
}

function executeFutureAttentionOnce(
  events: EventV2.Interface,
  permission: Permission.Interface,
  canonical: FutureAttentionCanonical,
  registration: Registration,
  context: ExecuteContext,
) {
  return Effect.gen(function* () {
    const prepared = yield* events.transaction<FutureAttentionExecutionPreparation, typeof SessionV1.Event.PartUpdated>(
      (tx) =>
        Effect.gen(function* () {
          const state = yield* requireFutureAttentionState(tx, canonical, registration)
          if (state.status !== "admitted") {
            return noEvent({
              type: "settled" as const,
              exact: exactFromPart(yield* assertFutureAttentionTerminalPart(tx, canonical, registration, state)),
            })
          }
          if (state.disposition !== "candidate_v1" || !state.candidate) {
            return yield* Effect.die("Admitted FutureAttention invocation is not a complete candidate")
          }
          return noEvent({ type: "candidate" as const, candidate: state.candidate })
        }).pipe(Effect.orDie),
    )
    if (prepared.result.type === "settled") return prepared.result.exact

    const authority = requirePermissionContext(context)
    const candidate = prepared.result.candidate
    const scope = SemanticPresentation.futureAttentionScope(candidate.canonicalCommand)
    const presentation = LearningCommandPresentation.futureAttentionCapability(candidate, {
      sessionID: registration.sessionID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
      partID: registration.partID,
    })
    const shownScope = {
      patterns: [FutureAttention.PERMISSION_PATTERN],
      agentAction: candidate.agentAction,
      scope,
      semanticPresentation: presentation,
    }
    const permissionOutcome = yield* LearningCommandPermission.ask(
      permission,
      {
        sessionID: registration.sessionID,
        permission: LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY,
        patterns: [FutureAttention.PERMISSION_PATTERN],
        always: [FutureAttention.PERMISSION_PATTERN],
        requirePrompt: false,
        metadata: {
          futureAttentionKind: "change_set",
          commandFingerprint: candidate.commandFingerprint,
          issuance: candidate.agentAction.kind,
          scope,
          ...SemanticPresentation.metadata(presentation),
        },
        tool: { messageID: registration.assistantMessageID, callID: registration.callID },
        ruleset: authority.ruleset,
        authority: authority.authority,
        lifecycle: {
          resolution: "request_exact",
          selected: (selection) => persistFutureAttentionSelection(events, registration, selection, shownScope),
          replied: (input) => persistFutureAttentionReply(events, registration, input),
        },
      },
      context.abort,
    )
    if (permissionOutcome.type !== "allow" || context.abort.aborted) {
      return yield* completeFutureAttention(events, canonical, registration)
    }
    return yield* completeFutureAttention(events, canonical, registration)
  })
}

function persistFutureAttentionSelection(
  events: EventV2.Interface,
  registration: Registration,
  selection: Permission.Selection,
  shownScope: Readonly<Record<string, unknown>>,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const metadata = yield* settlementMetadata(tx, registration.sessionID, Date.now())
        if (selection.action === "ask") {
          yield* FutureAttention.issueCapabilityPrompt(tx, {
            partID: registration.partID,
            requestID: selection.request.id,
            policyBasis: { ...selection.basis },
            shownScope,
            time: metadata.time,
            order: metadata.order,
          })
          return noEvent(undefined)
        }
        yield* FutureAttention.settlePolicy(tx, {
          partID: registration.partID,
          outcome: selection.action === "allow" ? "policy_allow" : "policy_deny",
          policyBasis: { ...selection.basis },
          time: metadata.time,
          order: metadata.order,
        })
        return noEvent(undefined)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.asVoid)
}

function persistFutureAttentionReply(
  events: EventV2.Interface,
  registration: Registration,
  input: Readonly<{ request: PermissionV1.Request; reply: PermissionV1.ReplyInput }>,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const metadata = yield* settlementMetadata(tx, registration.sessionID, Date.now())
        yield* FutureAttention.settlePrompt(tx, {
          partID: registration.partID,
          requestID: input.request.id,
          outcome:
            input.reply.reply === "once" || input.reply.reply === "always"
              ? "prompted_allow"
              : input.reply.reply === "cancel"
                ? "prompted_cancel"
                : input.reply.message
                  ? "prompted_correct"
                  : "prompted_deny",
          reply: { ...input.reply },
          time: metadata.time,
          order: metadata.order,
        })
        return noEvent(undefined)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.asVoid)
}

function completeFutureAttention(
  events: EventV2.Interface,
  canonical: FutureAttentionCanonical,
  registration: Registration,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const state = yield* requireFutureAttentionState(tx, canonical, registration)
        if (state.status !== "admitted") {
          return noEvent(exactFromPart(yield* assertFutureAttentionTerminalPart(tx, canonical, registration, state)))
        }
        const consumed = yield* LearningFrontier.read(tx)
        yield* TurnLifecycle.consumeToolFrontier(tx, { partID: registration.partID, frontier: consumed })
        const settled = yield* FutureAttention.settle(tx, {
          partID: registration.partID,
          settlement: yield* settlementMetadata(tx, registration.sessionID, state.timeAdmitted),
        })
        if (settled.settlement.outcome === "applied") {
          yield* TurnLifecycle.recordToolResultingFrontier(tx, {
            partID: registration.partID,
            frontier: yield* LearningFrontier.read(tx),
          })
        }
        const terminal = yield* requireFutureAttentionState(tx, canonical, registration)
        const part = futureAttentionTerminalPart(canonical, registration, terminal)
        return withPartEvent(exactFromPart(part), part, requirePhysicalSettlement(terminal.settlement).settlementTime)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

function failFutureAttention(
  events: EventV2.Interface,
  canonical: FutureAttentionCanonical,
  registration: Registration,
  error: unknown,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const state = yield* requireFutureAttentionState(tx, canonical, registration)
        if (state.status !== "admitted") {
          return noEvent(exactFromPart(yield* assertFutureAttentionTerminalPart(tx, canonical, registration, state)))
        }
        yield* FutureAttention.settleFailure(tx, {
          partID: registration.partID,
          error,
          settlement: yield* settlementMetadata(tx, registration.sessionID, state.timeAdmitted),
        })
        const terminal = yield* requireFutureAttentionState(tx, canonical, registration)
        const part = futureAttentionTerminalPart(canonical, registration, terminal)
        return withPartEvent(exactFromPart(part), part, requirePhysicalSettlement(terminal.settlement).settlementTime)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

function readFutureAttentionState(tx: EventV2.Transaction, registration: Registration) {
  return FutureAttention.readInvocationVersion(tx, {
    partID: registration.partID,
    assistantMessageID: registration.assistantMessageID,
    providerCallID: registration.callID,
  })
}

function requireFutureAttentionState(
  tx: EventV2.Transaction,
  canonical: FutureAttentionCanonical,
  registration: Registration,
) {
  return Effect.gen(function* () {
    const state = yield* readFutureAttentionState(tx, registration)
    if (!state) return yield* new LearningCommand.InvocationNotFoundError({ partID: registration.partID })
    const storedCommand = state.disposition === "candidate_v1" ? state.candidate?.canonicalCommand : undefined
    if (storedCommand && !isDeepStrictEqual(storedCommand, FutureAttention.canonicalizeCommand(canonical.input))) {
      return yield* invocationConflict(registration)
    }
    if (state.status === "admitted" && (state.disposition !== "candidate_v1" || !state.candidate)) {
      return yield* Effect.die("Admitted FutureAttention invocation is not a complete candidate")
    }
    const physical = yield* LearningCommand.lookupPhysicalInvocation(tx, {
      partID: registration.partID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
    })
    if (!physical || !physical.turn_id || !physical.input_id) {
      return yield* new LearningCommand.InvocationNotFoundError({ partID: registration.partID })
    }
    const envelope = futureAttentionEnvelope(registration, physical.time_admitted)
    if (
      physical.turn_id !== envelope.turnID ||
      physical.input_id !== envelope.inputID ||
      physical.occurrence_id !== envelope.occurrenceID ||
      physical.session_id !== envelope.sessionID ||
      physical.parent_user_message_id !== envelope.parentUserMessageID ||
      physical.assistant_message_id !== envelope.assistantMessageID ||
      physical.emission_ordinal !== envelope.emissionOrdinal ||
      physical.capability_identity !== envelope.capabilityIdentity ||
      physical.capability_version !== envelope.capabilityVersion ||
      physical.authorization_basis !== envelope.authorizationBasis
    ) {
      return yield* invocationConflict(registration)
    }
    if (state.status === "admitted") yield* assertFutureAttentionAdmittedPart(tx, canonical, registration)
    return state
  })
}

function futureAttentionEnvelope(
  registration: Registration,
  timeAdmitted: number,
): LearningCommand.InvocationEnvelope & Readonly<{ authorizationBasis: "agent_action"; capabilityVersion: 1 }> {
  return {
    occurrenceID: registration.causalOccurrenceID!,
    turnID: registration.turnID,
    inputID: registration.inputID,
    sessionID: registration.sessionID,
    parentUserMessageID: registration.parentUserMessageID,
    assistantMessageID: registration.assistantMessageID,
    partID: registration.partID,
    providerCallID: registration.callID,
    emissionOrdinal: registration.emissionOrdinal,
    capabilityIdentity: LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY,
    capabilityVersion: 1,
    authorizationBasis: "agent_action",
    timeAdmitted,
  }
}

function assertFutureAttentionAdmittedPart(
  tx: EventV2.Transaction,
  canonical: FutureAttentionCanonical,
  registration: Registration,
) {
  return readPart(tx, registration.partID).pipe(
    Effect.flatMap((part) =>
      part.id === registration.partID &&
      part.messageID === registration.assistantMessageID &&
      part.sessionID === registration.sessionID &&
      part.type === "tool" &&
      part.tool === canonical.toolID &&
      part.callID === registration.callID &&
      part.state.status === "pending" &&
      isDeepStrictEqual(part.state.input, canonical.input)
        ? Effect.void
        : invocationConflict(registration),
    ),
  )
}

function assertFutureAttentionTerminalPart(
  tx: EventV2.Transaction,
  canonical: FutureAttentionCanonical,
  registration: Registration,
  state: FutureAttention.InvocationVersion,
) {
  return Effect.gen(function* () {
    const expected = futureAttentionTerminalPart(canonical, registration, state)
    const part = yield* readPart(tx, registration.partID)
    if (
      !isDeepStrictEqual(invocationPart(part), invocationPart(expected)) ||
      SemanticPresentation.readResult(part, true).type !== "valid"
    ) {
      return yield* Effect.die(`Terminal FutureAttention Part ${registration.partID} diverged from its settlement`)
    }
    return part
  })
}

function futureAttentionTerminalPart(
  canonical: FutureAttentionCanonical,
  registration: Registration,
  state: FutureAttention.InvocationVersion,
) {
  const settlement = requirePhysicalSettlement(state.settlement)
  const presentation = LearningCommandPresentation.futureAttentionSettlementResult(settlement, state, {
    sessionID: registration.sessionID,
    assistantMessageID: registration.assistantMessageID,
    providerCallID: registration.callID,
    partID: registration.partID,
  })
  const projected = SemanticPresentation.projectResultBasis(presentation.basis)
  if (!projected) throw new Error("FutureAttention settlement has no valid semantic projection")
  const exact = {
    title: projected.title,
    metadata: {
      command: canonical.toolID,
      commandVersion: 1,
      outcome: settlement.outcome,
      ...(settlement.outcome === "error" ? { code: settlement.code } : {}),
      durablySettled: projected.durablySettled,
      truncated: false,
      ...SemanticPresentation.metadata(presentation),
    },
    output: JSON.stringify({
      settlement,
      disposition: state.disposition,
      ...(state.disposition === "candidate_v1" && state.candidate
        ? {
            agentAction: state.candidate.agentAction,
            ...(state.capabilityOutcome ? { capabilityOutcome: state.capabilityOutcome } : {}),
            ...(state.permissionRequestID ? { permissionRequestID: state.permissionRequestID } : {}),
          }
        : {}),
      ...(state.disposition === "semantic_terminal_v1" && state.semanticTerminal
        ? { semanticTerminal: state.semanticTerminal }
        : {}),
    }),
  }
  const part = {
    id: registration.partID,
    messageID: registration.assistantMessageID,
    sessionID: registration.sessionID,
    type: "tool",
    tool: canonical.toolID,
    callID: registration.callID,
    state: {
      status: "completed",
      input: canonical.input,
      output: exact.output,
      title: exact.title,
      metadata: exact.metadata,
      time: { start: state.timeAdmitted, end: settlement.settlementTime },
    },
  } satisfies SessionV1.ToolPart
  if (SemanticPresentation.readResult(part, true).type !== "valid") {
    throw new Error(`Constructed terminal FutureAttention Part ${registration.partID} is invalid`)
  }
  return part
}

function loadCommittedFutureAttentionResult(
  events: EventV2.Interface,
  canonical: FutureAttentionCanonical,
  registration: Registration,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const state = yield* readFutureAttentionState(tx, registration)
        if (!state || state.status === "admitted") return noEvent(undefined)
        return noEvent(exactFromPart(yield* assertFutureAttentionTerminalPart(tx, canonical, registration, state)))
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

function prepareDefaultCourse(events: EventV2.Interface, modelInput: unknown, registration: Registration) {
  return Effect.gen(function* () {
    const state = yield* readStoredDefaultCourseState(events, registration)
    if (state?.version === 1 || state?.version === 2) {
      return yield* prepareDefaultCourseV2(events, modelInput, registration)
    }
    return yield* prepareDefaultCourseV3(events, modelInput, registration)
  })
}

function executeDefaultCourse(
  events: EventV2.Interface,
  permission: Permission.Interface,
  v2Inflight: Map<SessionV1.PartID, DefaultV2Active>,
  v3Inflight: Map<SessionV1.PartID, DefaultV3Active>,
  modelInput: unknown,
  context: ExecuteContext,
) {
  return Effect.gen(function* () {
    const registration = requireRegistration(context)
    const state = yield* readStoredDefaultCourseState(events, registration)
    if (state?.version === 1 || state?.version === 2) {
      return yield* executeDefaultCourseV2(events, permission, v2Inflight, modelInput, context)
    }
    return yield* executeDefaultCourseV3(events, permission, v3Inflight, modelInput, context)
  })
}

function readStoredDefaultCourseState(events: EventV2.Interface, registration: Registration) {
  return events
    .transaction((tx) =>
      readDefaultCourseInvocationVersion(tx, {
        partID: registration.partID,
        assistantMessageID: registration.assistantMessageID,
        providerCallID: registration.callID,
      }).pipe(Effect.map(noEvent), Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

function prepareDefaultCourseV3(events: EventV2.Interface, modelInput: unknown, registration: Registration) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const canonical = {
          toolID: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
          input: normalizeDefaultV3(modelInput),
        } satisfies DefaultV3Canonical
        const existing = yield* readDefaultCourseInvocationVersion(tx, {
          partID: registration.partID,
          assistantMessageID: registration.assistantMessageID,
          providerCallID: registration.callID,
        })
        if (existing) {
          if (existing.version !== 3) return yield* invocationConflict(registration)
          const state = yield* requireDefaultCourseV3State(tx, canonical, registration)
          if (state.status !== "admitted") {
            yield* assertDefaultCourseV3TerminalPart(tx, canonical, registration, state)
          }
          return noEvent(undefined)
        }

        const consumed = yield* LearningFrontier.read(tx)
        yield* TurnLifecycle.consumeToolFrontier(tx, { partID: registration.partID, frontier: consumed })
        const row = yield* readPartRow(tx, registration.partID)
        if (!row) {
          return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
        }
        const trusted = yield* TurnLifecycle.validateLearningCommandRegistration(tx, {
          turnID: registration.turnID,
          inputID: registration.inputID,
          causalOccurrenceID: registration.causalOccurrenceID,
          partID: registration.partID,
          callID: registration.callID,
          emissionOrdinal: registration.emissionOrdinal,
          sessionID: registration.sessionID,
          assistantMessageID: registration.assistantMessageID,
          capabilityIdentity: canonical.toolID,
        })
        const timeAdmitted = Math.max(
          row.time_created,
          trusted.modelTimeAdmitted,
          trusted.candidateTimeRegistered,
          trusted.toolTimeAdmitted,
        )
        yield* assertDefaultCourseV3AdmittedPart(tx, canonical, registration)
        const reserved = yield* reserveDefaultCourseV3(tx, {
          envelope: defaultCourseV3Envelope(registration, timeAdmitted),
          command: canonical.input,
          settlement: yield* settlementMetadata(tx, registration.sessionID, timeAdmitted),
        })
        if (reserved.type === "admitted") return noEvent(undefined)
        if (reserved.type === "replay") {
          return yield* Effect.die("New Default-Course V3 admission unexpectedly replayed")
        }
        const part = defaultCourseV3TerminalPart(
          canonical,
          registration,
          requireSemanticTerminalV3(reserved.semanticTerminal),
          reserved.settlement,
          "acknowledgement" in reserved ? reserved.acknowledgement : undefined,
          timeAdmitted,
        )
        return withPartEvent(undefined, part, reserved.settlement.settlementTime)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.asVoid)
}

function executeDefaultCourseV3(
  events: EventV2.Interface,
  permission: Permission.Interface,
  inflight: Map<SessionV1.PartID, DefaultV3Active>,
  modelInput: unknown,
  context: ExecuteContext,
) {
  return Effect.gen(function* () {
    const registration = requireRegistration(context)
    const canonical = {
      toolID: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      input: normalizeDefaultV3(modelInput),
    } satisfies DefaultV3Canonical
    const active = inflight.get(registration.partID)
    if (active) {
      if (!isDeepStrictEqual(active.registration, registration) || !isDeepStrictEqual(active.canonical, canonical)) {
        return yield* invocationConflict(registration)
      }
      return yield* Deferred.await(active.deferred)
    }

    const deferred = Deferred.makeUnsafe<ExactResult, unknown>()
    const token = { canonical, registration, deferred } satisfies DefaultV3Active
    inflight.set(registration.partID, token)
    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const exit = yield* restore(
          executeDefaultCourseV3Once(events, permission, canonical, registration, context),
        ).pipe(Effect.exit)
        if (Exit.isFailure(exit)) {
          const reconciled = yield* loadCommittedDefaultCourseV3Result(events, canonical, registration).pipe(
            Effect.exit,
          )
          if (Exit.isSuccess(reconciled) && reconciled.value) {
            yield* Deferred.succeed(deferred, reconciled.value).pipe(Effect.ignore)
            if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
            return reconciled.value
          }
          const cause = Exit.isFailure(reconciled) ? reconciled.cause : exit.cause
          yield* Deferred.failCause(deferred, cause).pipe(Effect.ignore)
          if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
          return yield* Effect.failCause(cause)
        }
        yield* Deferred.succeed(deferred, exit.value).pipe(Effect.ignore)
        if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
        return exit.value
      }),
    )
  })
}

function executeDefaultCourseV3Once(
  events: EventV2.Interface,
  permission: Permission.Interface,
  canonical: DefaultV3Canonical,
  registration: Registration,
  context: ExecuteContext,
) {
  return Effect.gen(function* () {
    const prepared = yield* events.transaction<DefaultV3ExecutionPreparation, typeof SessionV1.Event.PartUpdated>(
      (tx) =>
        Effect.gen(function* () {
          const state = yield* requireDefaultCourseV3State(tx, canonical, registration)
          if (state.status !== "admitted") {
            return noEvent({
              type: "settled" as const,
              exact: exactFromPart(yield* assertDefaultCourseV3TerminalPart(tx, canonical, registration, state)),
            })
          }
          return noEvent({ type: "candidate" as const, agentAction: state.agentAction! })
        }).pipe(Effect.orDie),
    )
    if (prepared.result.type === "settled") return prepared.result.exact

    const authority = requirePermissionContext(context)
    const agentAction = prepared.result.agentAction
    const presentation = LearningCommandPresentation.defaultCourseV3Capability(agentAction, {
      sessionID: registration.sessionID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
      partID: registration.partID,
    })
    const pattern = agentAction.to.kind === "course" ? agentAction.to.locator.courseID : "clear"
    const shownScope = {
      patterns: [pattern],
      agentAction,
      semanticPresentation: presentation,
    }
    const permissionOutcome = yield* LearningCommandPermission.ask(
      permission,
      {
        sessionID: registration.sessionID,
        permission: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        patterns: [pattern],
        always: [pattern],
        metadata: {
          navigationKind: "default_course_preference",
          agentAction,
          ...SemanticPresentation.metadata(presentation),
        },
        tool: {
          messageID: registration.assistantMessageID,
          callID: registration.callID,
        },
        ruleset: authority.ruleset,
        authority: authority.authority,
        lifecycle: {
          resolution: "request_exact",
          selected: (selection) => persistDefaultCourseSelection(events, registration, selection, shownScope),
          replied: (input) => persistDefaultCourseReply(events, registration, input),
        },
      },
      context.abort,
    )
    return yield* commitDefaultCourseV3(events, canonical, registration, permissionOutcome)
  })
}

function commitDefaultCourseV3(
  events: EventV2.Interface,
  canonical: DefaultV3Canonical,
  registration: Registration,
  permission: LearningCommand.PermissionOutcome,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const state = yield* requireDefaultCourseV3State(tx, canonical, registration)
        if (state.status !== "admitted") {
          return noEvent(exactFromPart(yield* assertDefaultCourseV3TerminalPart(tx, canonical, registration, state)))
        }
        const settlement = yield* permission.type === "abort"
          ? recoverDefaultCourseV3(tx, {
              partID: registration.partID,
              settlement: yield* settlementMetadata(tx, registration.sessionID, state.timeAdmitted),
            })
          : Effect.gen(function* () {
              const consumed = yield* LearningFrontier.read(tx)
              yield* TurnLifecycle.consumeToolFrontier(tx, { partID: registration.partID, frontier: consumed })
              return yield* settleDefaultCourseV3(tx, {
                partID: registration.partID,
                settlement: yield* settlementMetadata(tx, registration.sessionID, state.timeAdmitted),
              })
            })
        if (settlement.type === "replay") {
          const replayed = requirePhysicalSettlement(settlement.settlement)
          return noEvent(
            exactFromPart(
              yield* assertDefaultCourseV3TerminalPart(tx, canonical, registration, {
                ...state,
                status: replayed.outcome,
                settlement: replayed,
                acknowledgement: settlement.acknowledgement,
              }),
            ),
          )
        }
        if (settlement.settlement.outcome === "applied") {
          yield* TurnLifecycle.recordToolResultingFrontier(tx, {
            partID: registration.partID,
            frontier: yield* LearningFrontier.read(tx),
          })
        }
        const part = defaultCourseV3TerminalPart(
          canonical,
          registration,
          candidateV3ResultDisposition(state.agentAction!),
          settlement.settlement,
          settlement.acknowledgement,
          state.timeAdmitted,
        )
        return withPartEvent(exactFromPart(part), part, settlement.settlement.settlementTime)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

function prepareDefaultCourseV2(events: EventV2.Interface, modelInput: unknown, registration: Registration) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const existing = yield* readDefaultCourseInvocationVersion(tx, {
          partID: registration.partID,
          assistantMessageID: registration.assistantMessageID,
          providerCallID: registration.callID,
        })
        if (existing?.version === 1) return yield* prepareLegacyDefaultCourseReplay(tx, registration, existing)
        if (existing && existing.version !== 2) return yield* invocationConflict(registration)

        const canonical = {
          toolID: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
          input: normalizeDefaultV2(modelInput),
        } satisfies DefaultV2Canonical
        if (existing) {
          if (existing.status !== "admitted") {
            yield* assertDefaultCourseV2TerminalPart(tx, canonical, registration, existing)
            return noEvent(undefined)
          }
          yield* assertDefaultCourseV2AdmittedPart(tx, canonical, registration)
          const reserved = yield* reserveDefaultCourseAuthorization(tx, canonical, registration, {
            ...existing,
            version: 2,
          })
          if (reserved.type === "replay") {
            const settlement = requirePhysicalSettlement(reserved.settlement)
            yield* assertDefaultCourseV2TerminalPart(tx, canonical, registration, {
              ...existing,
              status: settlement.outcome,
              settlement,
              acknowledgement: reserved.acknowledgement,
              authorization: reserved.authorization,
            })
          }
          return noEvent(undefined)
        }

        const consumed = yield* LearningFrontier.read(tx)
        yield* TurnLifecycle.consumeToolFrontier(tx, { partID: registration.partID, frontier: consumed })
        const row = yield* readPartRow(tx, registration.partID)
        if (!row) {
          return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
        }
        const trusted = yield* TurnLifecycle.validateLearningCommandRegistration(tx, {
          turnID: registration.turnID,
          inputID: registration.inputID,
          causalOccurrenceID: registration.causalOccurrenceID,
          partID: registration.partID,
          callID: registration.callID,
          emissionOrdinal: registration.emissionOrdinal,
          sessionID: registration.sessionID,
          assistantMessageID: registration.assistantMessageID,
          capabilityIdentity: canonical.toolID,
        })
        const timeAdmitted = Math.max(
          row.time_created,
          trusted.modelTimeAdmitted,
          trusted.candidateTimeRegistered,
          trusted.toolTimeAdmitted,
        )
        yield* assertDefaultCourseV2AdmittedPart(tx, canonical, registration)
        const reserved = yield* reserveDefaultCourseAuthorization(tx, canonical, registration, {
          version: 2,
          status: "admitted",
          settlement: null,
          authorizationFingerprint: "",
          authorization: undefined,
          timeAdmitted,
          admissionSettlement: yield* settlementMetadata(tx, registration.sessionID, timeAdmitted),
        })
        if (reserved.type === "admitted") return noEvent(undefined)
        if (reserved.type === "replay") {
          return yield* Effect.die("New Default-Course V2 admission unexpectedly replayed")
        }
        const part = defaultCourseV2TerminalPart(
          canonical,
          registration,
          requireSemanticTerminal(reserved.semanticTerminal),
          reserved.settlement,
          "acknowledgement" in reserved ? reserved.acknowledgement : undefined,
          timeAdmitted,
        )
        return withPartEvent(undefined, part, reserved.settlement.settlementTime)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.asVoid)
}

function reserveDefaultCourseAuthorization(
  tx: EventV2.Transaction,
  canonical: DefaultV2Canonical,
  registration: Registration,
  state: Readonly<{
    version: 2
    status: string
    settlement: unknown
    authorizationFingerprint?: string
    authorization?: DefaultCourseV2Authorization
    timeAdmitted?: number
    admissionSettlement?: LearningCommand.SettlementMetadata
  }>,
) {
  return Effect.gen(function* () {
    const timeAdmitted = state.timeAdmitted ?? (yield* requireDefaultCourseV2Time(tx, registration))
    const envelope = defaultCourseV2Envelope(registration, canonical.input, timeAdmitted)
    if ("expectedHeadID" in canonical.input) {
      return yield* reserveDefaultCourseV2(tx, {
        kind: "direct_request_v2",
        envelope,
        settlement: state.admissionSettlement,
        command: directDefaultV2Command(canonical.input),
        sourceExcerpt: canonical.input.authorization.sourceExcerpt,
        resolutionScope: canonical.input.authorization.resolutionScope,
      })
    }
    const accepted = canonical.input.authorization
    const proposal = yield* resolveDefaultCourseProposalPresentation(tx, {
      partID: accepted.presentedPartID,
      acceptanceOccurrenceID: envelope.occurrenceID,
      selection: accepted.selection,
    })
    if (
      proposal.presentationAssistantMessageID !== accepted.presentedAssistantMessageID ||
      proposal.emissionOrdinal !== accepted.emissionOrdinal ||
      proposal.fingerprint !== accepted.proposalFingerprint
    ) {
      return yield* new LearnerNavigation.IntegrityError({
        detail: "Accepted Default-Course proposal input diverges from its exact generic Tool presentation",
      })
    }
    return yield* reserveDefaultCourseV2(tx, {
      kind: "accepted_proposal_v2",
      envelope,
      settlement: state.admissionSettlement,
      proposal,
      sourceExcerpt: accepted.sourceExcerpt,
    })
  })
}

function executeDefaultCourseV2(
  events: EventV2.Interface,
  permission: Permission.Interface,
  inflight: Map<SessionV1.PartID, DefaultV2Active>,
  modelInput: unknown,
  context: ExecuteContext,
) {
  return Effect.gen(function* () {
    const registration = requireRegistration(context)
    const legacy = yield* loadLegacyDefaultCourseResult(events, registration)
    if (legacy) return legacy
    const canonical = {
      toolID: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      input: normalizeDefaultV2(modelInput),
    } satisfies DefaultV2Canonical
    const active = inflight.get(registration.partID)
    if (active) {
      if (!isDeepStrictEqual(active.registration, registration) || !isDeepStrictEqual(active.canonical, canonical)) {
        return yield* invocationConflict(registration)
      }
      return yield* Deferred.await(active.deferred)
    }

    const deferred = Deferred.makeUnsafe<ExactResult, unknown>()
    const token = { canonical, registration, deferred } satisfies DefaultV2Active
    inflight.set(registration.partID, token)
    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const exit = yield* restore(
          executeDefaultCourseV2Once(events, permission, canonical, registration, context),
        ).pipe(Effect.exit)
        if (Exit.isFailure(exit)) {
          const reconciled = yield* loadCommittedDefaultCourseV2Result(events, canonical, registration).pipe(
            Effect.exit,
          )
          if (Exit.isSuccess(reconciled) && reconciled.value) {
            yield* Deferred.succeed(deferred, reconciled.value).pipe(Effect.ignore)
            if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
            return reconciled.value
          }
          const cause = Exit.isFailure(reconciled) ? reconciled.cause : exit.cause
          yield* Deferred.failCause(deferred, cause).pipe(Effect.ignore)
          if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
          return yield* Effect.failCause(cause)
        }
        yield* Deferred.succeed(deferred, exit.value).pipe(Effect.ignore)
        if (inflight.get(registration.partID) === token) inflight.delete(registration.partID)
        return exit.value
      }),
    )
  })
}

function executeDefaultCourseV2Once(
  events: EventV2.Interface,
  permission: Permission.Interface,
  canonical: DefaultV2Canonical,
  registration: Registration,
  context: ExecuteContext,
) {
  return Effect.gen(function* () {
    const prepared = yield* events.transaction<DefaultV2ExecutionPreparation, typeof SessionV1.Event.PartUpdated>(
      (tx) =>
        Effect.gen(function* () {
          const state = yield* requireDefaultCourseV2State(tx, canonical, registration)
          if (state.status !== "admitted") {
            return noEvent({
              type: "settled" as const,
              exact: exactFromPart(yield* assertDefaultCourseV2TerminalPart(tx, canonical, registration, state)),
            })
          }
          return noEvent({ type: "candidate" as const, authorization: state.authorization! })
        }).pipe(Effect.orDie),
    )
    if (prepared.result.type === "settled") return prepared.result.exact

    const authority = requirePermissionContext(context)
    const authorization = prepared.result.authorization
    const presentation = LearningCommandPresentation.defaultCourseV2Capability(authorization, {
      sessionID: registration.sessionID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
      partID: registration.partID,
    })
    const pattern = authorization.to.kind === "course" ? authorization.to.locator.courseID : "clear"
    const shownScope = {
      patterns: [pattern],
      authorization,
      semanticPresentation: presentation,
    }
    const permissionOutcome = yield* LearningCommandPermission.ask(
      permission,
      {
        sessionID: registration.sessionID,
        permission: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        patterns: [pattern],
        always: [pattern],
        metadata: {
          navigationKind: "default_course_preference",
          authorization,
          ...SemanticPresentation.metadata(presentation),
        },
        tool: {
          messageID: registration.assistantMessageID,
          callID: registration.callID,
        },
        ruleset: authority.ruleset,
        authority: authority.authority,
        lifecycle: {
          resolution: "request_exact",
          selected: (selection) => persistDefaultCourseSelection(events, registration, selection, shownScope),
          replied: (input) => persistDefaultCourseReply(events, registration, input),
        },
      },
      context.abort,
    )
    return yield* commitDefaultCourseV2(events, canonical, registration, permissionOutcome)
  })
}

function persistDefaultCourseSelection(
  events: EventV2.Interface,
  registration: Registration,
  selection: Permission.Selection,
  shownScope: Readonly<Record<string, unknown>>,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const metadata = yield* settlementMetadata(tx, registration.sessionID, Date.now())
        if (selection.action === "ask") {
          yield* issueDefaultCourseCapabilityPrompt(tx, {
            partID: registration.partID,
            requestID: selection.request.id,
            policyBasis: { ...selection.basis },
            shownScope,
            time: metadata.time,
            order: metadata.order,
          })
          return noEvent(undefined)
        }
        yield* settleDefaultCoursePolicy(tx, {
          partID: registration.partID,
          outcome: selection.action === "allow" ? "policy_allow" : "policy_deny",
          policyBasis: { ...selection.basis },
          time: metadata.time,
          order: metadata.order,
        })
        return noEvent(undefined)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.asVoid)
}

function persistDefaultCourseReply(
  events: EventV2.Interface,
  registration: Registration,
  input: Readonly<{ request: PermissionV1.Request; reply: PermissionV1.ReplyInput }>,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const metadata = yield* settlementMetadata(tx, registration.sessionID, Date.now())
        yield* settleDefaultCoursePrompt(tx, {
          partID: registration.partID,
          requestID: input.request.id,
          outcome:
            input.reply.reply === "once" || input.reply.reply === "always"
              ? "prompted_allow"
              : input.reply.reply === "cancel"
                ? "prompted_cancel"
                : input.reply.message
                  ? "prompted_correct"
                  : "prompted_deny",
          reply: { ...input.reply },
          time: metadata.time,
          order: metadata.order,
        })
        return noEvent(undefined)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.asVoid)
}

function commitDefaultCourseV2(
  events: EventV2.Interface,
  canonical: DefaultV2Canonical,
  registration: Registration,
  permission: LearningCommand.PermissionOutcome,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const state = yield* requireDefaultCourseV2State(tx, canonical, registration)
        if (state.status !== "admitted") {
          return noEvent(exactFromPart(yield* assertDefaultCourseV2TerminalPart(tx, canonical, registration, state)))
        }
        const settlement = yield* permission.type === "abort"
          ? recoverDefaultCourseV2(tx, {
              partID: registration.partID,
              settlement: yield* settlementMetadata(tx, registration.sessionID, stateTimeAdmitted(state, registration)),
            })
          : Effect.gen(function* () {
              const consumed = yield* LearningFrontier.read(tx)
              yield* TurnLifecycle.consumeToolFrontier(tx, { partID: registration.partID, frontier: consumed })
              return yield* settleDefaultCourseV2(tx, {
                partID: registration.partID,
                settlement: yield* settlementMetadata(
                  tx,
                  registration.sessionID,
                  stateTimeAdmitted(state, registration),
                ),
              })
            })
        if (settlement.type === "replay") {
          const replayed = requirePhysicalSettlement(settlement.settlement)
          return noEvent(
            exactFromPart(
              yield* assertDefaultCourseV2TerminalPart(tx, canonical, registration, {
                ...state,
                status: replayed.outcome,
                settlement: replayed,
                acknowledgement: settlement.acknowledgement,
              }),
            ),
          )
        }
        if (settlement.settlement.outcome === "applied") {
          yield* TurnLifecycle.recordToolResultingFrontier(tx, {
            partID: registration.partID,
            frontier: yield* LearningFrontier.read(tx),
          })
        }
        const part = defaultCourseV2TerminalPart(
          canonical,
          registration,
          candidateResultDisposition(state.authorization!),
          settlement.settlement,
          settlement.acknowledgement,
          stateTimeAdmitted(state, registration),
        )
        return withPartEvent(exactFromPart(part), part, settlement.settlement.settlementTime)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

function prepareLegacyDefaultCourseReplay(
  tx: EventV2.Transaction,
  registration: Registration,
  state: DefaultCourseInvocationVersion | undefined,
) {
  return Effect.gen(function* () {
    if (!state || state.version !== 1) return yield* Effect.die("Expected one legacy Default-Course invocation")
    const canonical = yield* legacyDefaultCanonical(tx, registration.partID)
    const physical = yield* LearningCommand.lookupPhysicalInvocation(tx, {
      partID: registration.partID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
    })
    if (!physical) return yield* Effect.die(`Legacy Default-Course invocation ${registration.partID} disappeared`)
    const envelope = terminalEnvelopeFromPhysical(physical)
    if (state.status !== "admitted") {
      yield* assertTerminalPart(tx, canonical, envelope, requireLearningSettlement(state.settlement))
      return noEvent(undefined)
    }
    const settlement = yield* LearningCommand.recoverInterrupted(tx, {
      partID: registration.partID,
      settlement: yield* settlementMetadata(tx, registration.sessionID, physical.time_admitted),
    })
    if (settlement.type === "replay") {
      yield* assertRecoveredTerminalPart(tx, canonical, envelope, settlement.settlement)
      return noEvent(undefined)
    }
    const interrupted = requireInterruptedSettlement(settlement.settlement)
    return withPartEvent(
      undefined,
      yield* terminalPart(tx, canonical, envelope, interrupted),
      interrupted.settlementTime,
    )
  })
}

function loadLegacyDefaultCourseResult(events: EventV2.Interface, registration: Registration) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const state = yield* readDefaultCourseInvocationVersion(tx, {
          partID: registration.partID,
          assistantMessageID: registration.assistantMessageID,
          providerCallID: registration.callID,
        })
        if (!state || state.version === 2) return noEvent(undefined)
        const prepared = yield* prepareLegacyDefaultCourseReplay(tx, registration, state)
        if (prepared.event) {
          return {
            result: exactFromPart(yield* readPart(tx, registration.partID)),
            event: prepared.event,
          }
        }
        const canonical = yield* legacyDefaultCanonical(tx, registration.partID)
        const physical = yield* LearningCommand.lookupPhysicalInvocation(tx, {
          partID: registration.partID,
          assistantMessageID: registration.assistantMessageID,
          providerCallID: registration.callID,
        })
        if (!physical) return yield* Effect.die(`Legacy Default-Course invocation ${registration.partID} disappeared`)
        return noEvent(
          exactFromPart(
            yield* assertTerminalPart(
              tx,
              canonical,
              terminalEnvelopeFromPhysical(physical),
              requireLearningSettlement(
                (yield* readDefaultCourseInvocationVersion(tx, {
                  partID: registration.partID,
                  assistantMessageID: registration.assistantMessageID,
                  providerCallID: registration.callID,
                }))!.settlement,
              ),
            ),
          ),
        )
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

function legacyDefaultCanonical(tx: EventV2.Transaction, partID: SessionV1.PartID) {
  return Effect.gen(function* () {
    const row = yield* readPartRow(tx, partID)
    if (!row) return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID })
    const part = partFromRow(row)
    if (part.tool !== LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
      return yield* Effect.die(`Legacy Default-Course Part ${partID} changed tool identity`)
    }
    return {
      toolID: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      input: normalizeDefault(part.state.input),
    } satisfies Canonical
  })
}

function loadCommittedDefaultCourseV3Result(
  events: EventV2.Interface,
  canonical: DefaultV3Canonical,
  registration: Registration,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const state = yield* readDefaultCourseInvocationVersion(tx, {
          partID: registration.partID,
          assistantMessageID: registration.assistantMessageID,
          providerCallID: registration.callID,
        })
        if (!state || state.version !== 3 || state.status === "admitted") return noEvent(undefined)
        return noEvent(exactFromPart(yield* assertDefaultCourseV3TerminalPart(tx, canonical, registration, state)))
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

function requireDefaultCourseV3State(
  tx: EventV2.Transaction,
  canonical: DefaultV3Canonical,
  registration: Registration,
) {
  return Effect.gen(function* () {
    const state = yield* readDefaultCourseInvocationVersion(tx, {
      partID: registration.partID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
    })
    if (!state || state.version !== 3) {
      return yield* new LearningCommand.InvocationNotFoundError({ partID: registration.partID })
    }
    if (
      (state.disposition === "agent_action_v3" &&
        (!state.agentAction || !isDeepStrictEqual(state.agentAction.command, canonical.input))) ||
      (state.disposition === "semantic_terminal_v3" &&
        (!state.semanticTerminal || !isDeepStrictEqual(state.semanticTerminal.command, canonical.input)))
    ) {
      return yield* invocationConflict(registration)
    }
    if (state.status === "admitted" && (state.disposition !== "agent_action_v3" || !state.agentAction)) {
      return yield* Effect.die("Admitted Default-Course V3 invocation is not a complete Agent action")
    }
    const physical = yield* LearningCommand.lookupPhysicalInvocation(tx, {
      partID: registration.partID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
    })
    if (!physical || !physical.turn_id || !physical.input_id) {
      return yield* new LearningCommand.InvocationNotFoundError({ partID: registration.partID })
    }
    const envelope = defaultCourseV3Envelope(registration, physical.time_admitted)
    if (
      physical.turn_id !== envelope.turnID ||
      physical.input_id !== envelope.inputID ||
      physical.occurrence_id !== envelope.occurrenceID ||
      physical.session_id !== envelope.sessionID ||
      physical.parent_user_message_id !== envelope.parentUserMessageID ||
      physical.assistant_message_id !== envelope.assistantMessageID ||
      physical.emission_ordinal !== envelope.emissionOrdinal ||
      physical.capability_identity !== envelope.capabilityIdentity ||
      physical.capability_version !== envelope.capabilityVersion ||
      physical.authorization_basis !== envelope.authorizationBasis
    ) {
      return yield* invocationConflict(registration)
    }
    if (state.status === "admitted") {
      if (state.disposition !== "agent_action_v3" || !state.agentAction) {
        return yield* Effect.die("Admitted Default-Course V3 invocation is not a complete Agent action")
      }
      yield* assertDefaultCourseV3AdmittedPart(tx, canonical, registration)
      return { ...state, status: "admitted" as const, timeAdmitted: physical.time_admitted }
    }
    return { ...state, status: state.status, timeAdmitted: physical.time_admitted }
  })
}

function defaultCourseV3Envelope(registration: Registration, timeAdmitted: number): LearningCommand.InvocationEnvelope {
  return {
    occurrenceID: registration.causalOccurrenceID!,
    turnID: registration.turnID,
    inputID: registration.inputID,
    sessionID: registration.sessionID,
    parentUserMessageID: registration.parentUserMessageID,
    assistantMessageID: registration.assistantMessageID,
    partID: registration.partID,
    providerCallID: registration.callID,
    emissionOrdinal: registration.emissionOrdinal,
    capabilityIdentity: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
    capabilityVersion: SET_DEFAULT_COURSE_PREFERENCE_V3_VERSION,
    authorizationBasis: "agent_action",
    timeAdmitted,
  }
}

function assertDefaultCourseV3AdmittedPart(
  tx: EventV2.Transaction,
  canonical: DefaultV3Canonical,
  registration: Registration,
) {
  return readPart(tx, registration.partID).pipe(
    Effect.flatMap((part) =>
      part.id === registration.partID &&
      part.messageID === registration.assistantMessageID &&
      part.sessionID === registration.sessionID &&
      part.type === "tool" &&
      part.tool === canonical.toolID &&
      part.callID === registration.callID &&
      part.state.status === "pending" &&
      isDeepStrictEqual(part.state.input, canonical.input)
        ? Effect.void
        : invocationConflict(registration),
    ),
  )
}

function candidateV3ResultDisposition(agentAction: DefaultCourseAgentAction): DefaultCourseV3ResultDisposition {
  return { kind: "agent_action_v3", agentAction }
}

function requireSemanticTerminalV3(
  disposition: DefaultCourseSemanticTerminalDisposition | undefined,
): Extract<DefaultCourseSemanticTerminalDisposition, { readonly kind: "semantic_terminal_v3" }> {
  if (!disposition || disposition.kind !== "semantic_terminal_v3") {
    throw new Error("Settled semantic-terminal Default-Course V3 invocation lost its evidence")
  }
  return disposition
}

function resultDispositionV3(
  state: Extract<DefaultCourseInvocationVersion, { readonly version: 3 }>,
): DefaultCourseV3ResultDisposition {
  if (state.disposition === "semantic_terminal_v3") return requireSemanticTerminalV3(state.semanticTerminal)
  if (state.disposition === "agent_action_v3" && state.agentAction) {
    return candidateV3ResultDisposition(state.agentAction)
  }
  throw new Error("Terminal Default-Course V3 state has no closed disposition")
}

function assertDefaultCourseV3TerminalPart(
  tx: EventV2.Transaction,
  canonical: DefaultV3Canonical,
  registration: Registration,
  state: Extract<DefaultCourseInvocationVersion, { readonly version: 3 }> & Readonly<{ timeAdmitted?: number }>,
) {
  return Effect.gen(function* () {
    const timeAdmitted = state.timeAdmitted ?? (yield* requireDefaultCourseV2Time(tx, registration))
    const expected = defaultCourseV3TerminalPart(
      canonical,
      registration,
      resultDispositionV3(state),
      requirePhysicalSettlement(state.settlement),
      state.acknowledgement,
      timeAdmitted,
    )
    const part = yield* readPart(tx, registration.partID)
    if (
      !isDeepStrictEqual(invocationPart(part), invocationPart(expected)) ||
      SemanticPresentation.readResult(part, true).type !== "valid"
    ) {
      return yield* Effect.die(`Terminal Default-Course V3 Part ${registration.partID} diverged from its settlement`)
    }
    return part
  })
}

function defaultCourseV3TerminalPart(
  canonical: DefaultV3Canonical,
  registration: Registration,
  disposition: DefaultCourseV3ResultDisposition,
  settlement: LearningCommand.PhysicalSettlement,
  acknowledgement: DefaultCourseAcknowledgement | undefined,
  timeAdmitted: number,
) {
  const presentation = LearningCommandPresentation.defaultCourseV3SettlementResult(
    settlement,
    disposition,
    acknowledgement,
    {
      sessionID: registration.sessionID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
      partID: registration.partID,
    },
  )
  const projected = SemanticPresentation.projectResultBasis(presentation.basis)
  if (!projected) throw new Error("Default-Course V3 settlement has no valid semantic projection")
  const exact = {
    title: projected.title,
    metadata: {
      command: canonical.toolID,
      commandVersion: SET_DEFAULT_COURSE_PREFERENCE_V3_VERSION,
      outcome: settlement.outcome,
      ...(settlement.outcome === "error" ? { code: settlement.code } : {}),
      durablySettled: projected.durablySettled,
      truncated: false,
      ...SemanticPresentation.metadata(presentation),
    },
    output: JSON.stringify({
      settlement,
      disposition: disposition.kind,
      ...(disposition.kind === "agent_action_v3"
        ? { agentAction: disposition.agentAction }
        : { semanticTerminal: disposition }),
      ...(acknowledgement ? { acknowledgement } : {}),
    }),
  }
  const part = {
    id: registration.partID,
    messageID: registration.assistantMessageID,
    sessionID: registration.sessionID,
    type: "tool",
    tool: canonical.toolID,
    callID: registration.callID,
    state: {
      status: "completed",
      input: canonical.input,
      output: exact.output,
      title: exact.title,
      metadata: exact.metadata,
      time: { start: timeAdmitted, end: settlement.settlementTime },
    },
  } satisfies SessionV1.ToolPart
  if (SemanticPresentation.readResult(part, true).type !== "valid") {
    throw new Error(`Constructed terminal Default-Course V3 Part ${registration.partID} is invalid`)
  }
  return part
}

function loadCommittedDefaultCourseV2Result(
  events: EventV2.Interface,
  canonical: DefaultV2Canonical,
  registration: Registration,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const state = yield* readDefaultCourseInvocationVersion(tx, {
          partID: registration.partID,
          assistantMessageID: registration.assistantMessageID,
          providerCallID: registration.callID,
        })
        if (!state || state.version !== 2 || state.status === "admitted") return noEvent(undefined)
        return noEvent(exactFromPart(yield* assertDefaultCourseV2TerminalPart(tx, canonical, registration, state)))
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

function requireDefaultCourseV2State(
  tx: EventV2.Transaction,
  canonical: DefaultV2Canonical,
  registration: Registration,
) {
  return Effect.gen(function* () {
    const state = yield* readDefaultCourseInvocationVersion(tx, {
      partID: registration.partID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
    })
    if (!state || state.version !== 2) {
      return yield* new LearningCommand.InvocationNotFoundError({ partID: registration.partID })
    }
    const physical = yield* LearningCommand.lookupPhysicalInvocation(tx, {
      partID: registration.partID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
    })
    if (!physical || !physical.turn_id || !physical.input_id) {
      return yield* new LearningCommand.InvocationNotFoundError({ partID: registration.partID })
    }
    const envelope = defaultCourseV2Envelope(registration, canonical.input, physical.time_admitted)
    if (
      physical.turn_id !== envelope.turnID ||
      physical.input_id !== envelope.inputID ||
      physical.occurrence_id !== envelope.occurrenceID ||
      physical.session_id !== envelope.sessionID ||
      physical.parent_user_message_id !== envelope.parentUserMessageID ||
      physical.assistant_message_id !== envelope.assistantMessageID ||
      physical.emission_ordinal !== envelope.emissionOrdinal ||
      physical.capability_identity !== envelope.capabilityIdentity ||
      physical.capability_version !== envelope.capabilityVersion ||
      physical.authorization_basis !== envelope.authorizationBasis
    ) {
      return yield* invocationConflict(registration)
    }
    if (state.status === "admitted") {
      if (state.disposition !== "candidate_v2" || !state.authorization) {
        return yield* Effect.die("Admitted Default-Course V2 invocation is not a complete candidate")
      }
      yield* assertDefaultCourseV2AdmittedPart(tx, canonical, registration)
      return { ...state, status: "admitted" as const, timeAdmitted: physical.time_admitted }
    }
    return { ...state, status: state.status, timeAdmitted: physical.time_admitted }
  })
}

function requireDefaultCourseV2Time(tx: EventV2.Transaction, registration: Registration) {
  return Effect.gen(function* () {
    const physical = yield* LearningCommand.lookupPhysicalInvocation(tx, {
      partID: registration.partID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
    })
    if (!physical) return yield* new LearningCommand.InvocationNotFoundError({ partID: registration.partID })
    return physical.time_admitted
  })
}

function defaultCourseV2Envelope(
  registration: Registration,
  input: SetDefaultCoursePreferenceV2Input,
  timeAdmitted: number,
): LearningCommand.InvocationEnvelope {
  return {
    occurrenceID: registration.causalOccurrenceID!,
    turnID: registration.turnID,
    inputID: registration.inputID,
    sessionID: registration.sessionID,
    parentUserMessageID: registration.parentUserMessageID,
    assistantMessageID: registration.assistantMessageID,
    partID: registration.partID,
    providerCallID: registration.callID,
    emissionOrdinal: registration.emissionOrdinal,
    capabilityIdentity: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
    capabilityVersion: SET_DEFAULT_COURSE_PREFERENCE_V2_VERSION,
    authorizationBasis: input.authorization.type === "direct_request_v2" ? "learner_request" : "learner_acceptance",
    timeAdmitted,
  }
}

function assertDefaultCourseV2AdmittedPart(
  tx: EventV2.Transaction,
  canonical: DefaultV2Canonical,
  registration: Registration,
) {
  return readPart(tx, registration.partID).pipe(
    Effect.flatMap((part) =>
      part.id === registration.partID &&
      part.messageID === registration.assistantMessageID &&
      part.sessionID === registration.sessionID &&
      part.type === "tool" &&
      part.tool === canonical.toolID &&
      part.callID === registration.callID &&
      part.state.status === "pending" &&
      isDeepStrictEqual(part.state.input, canonical.input)
        ? Effect.void
        : invocationConflict(registration),
    ),
  )
}

function candidateResultDisposition(authorization: DefaultCourseV2Authorization): DefaultCourseV2ResultDisposition {
  return { kind: "candidate_v2", authorization }
}

function requireSemanticTerminal(
  disposition: DefaultCourseSemanticTerminalDisposition | undefined,
): Extract<DefaultCourseSemanticTerminalDisposition, { readonly kind: "semantic_terminal_v2" }> {
  if (!disposition || disposition.kind !== "semantic_terminal_v2") {
    throw new Error("Settled semantic-terminal Default-Course V2 invocation lost its evidence")
  }
  return disposition
}

function resultDisposition(
  state: Readonly<{
    disposition?: "legacy_v1" | "semantic_terminal_v2" | "candidate_v2"
    authorization?: DefaultCourseV2Authorization
    semanticTerminal?: Extract<DefaultCourseSemanticTerminalDisposition, { readonly kind: "semantic_terminal_v2" }>
  }>,
): DefaultCourseV2ResultDisposition {
  if (state.disposition === "semantic_terminal_v2") return requireSemanticTerminal(state.semanticTerminal)
  if (state.disposition === "candidate_v2" && state.authorization) {
    return candidateResultDisposition(state.authorization)
  }
  throw new Error("Terminal Default-Course V2 state has no closed disposition")
}

function assertDefaultCourseV2TerminalPart(
  tx: EventV2.Transaction,
  canonical: DefaultV2Canonical,
  registration: Registration,
  state: Readonly<{
    status: string
    settlement: unknown
    disposition?: "legacy_v1" | "semantic_terminal_v2" | "candidate_v2"
    authorization?: DefaultCourseV2Authorization
    semanticTerminal?: Extract<DefaultCourseSemanticTerminalDisposition, { readonly kind: "semantic_terminal_v2" }>
    acknowledgement?: DefaultCourseAcknowledgement
    timeAdmitted?: number
  }>,
) {
  return Effect.gen(function* () {
    const timeAdmitted = state.timeAdmitted ?? (yield* requireDefaultCourseV2Time(tx, registration))
    const expected = defaultCourseV2TerminalPart(
      canonical,
      registration,
      resultDisposition(state),
      requirePhysicalSettlement(state.settlement),
      state.acknowledgement,
      timeAdmitted,
    )
    const part = yield* readPart(tx, registration.partID)
    if (
      !isDeepStrictEqual(invocationPart(part), invocationPart(expected)) ||
      SemanticPresentation.readResult(part, true).type !== "valid"
    ) {
      return yield* Effect.die(`Terminal Default-Course V2 Part ${registration.partID} diverged from its settlement`)
    }
    return part
  })
}

function defaultCourseV2TerminalPart(
  canonical: DefaultV2Canonical,
  registration: Registration,
  disposition: DefaultCourseV2ResultDisposition,
  settlement: LearningCommand.PhysicalSettlement,
  acknowledgement: DefaultCourseAcknowledgement | undefined,
  timeAdmitted: number,
) {
  const presentation = LearningCommandPresentation.defaultCourseV2SettlementResult(
    settlement,
    disposition,
    acknowledgement,
    {
      sessionID: registration.sessionID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
      partID: registration.partID,
    },
  )
  const projected = SemanticPresentation.projectResultBasis(presentation.basis)
  if (!projected) throw new Error("Default-Course V2 settlement has no valid semantic projection")
  const exact = {
    title: projected.title,
    metadata: {
      command: canonical.toolID,
      commandVersion: SET_DEFAULT_COURSE_PREFERENCE_V2_VERSION,
      outcome: settlement.outcome,
      ...(settlement.outcome === "error" ? { code: settlement.code } : {}),
      durablySettled: projected.durablySettled,
      truncated: false,
      ...SemanticPresentation.metadata(presentation),
    },
    output: JSON.stringify({
      settlement,
      disposition: disposition.kind,
      ...(disposition.kind === "candidate_v2"
        ? { authorization: disposition.authorization }
        : { semanticTerminal: disposition }),
      ...(acknowledgement ? { acknowledgement } : {}),
    }),
  }
  const part = {
    id: registration.partID,
    messageID: registration.assistantMessageID,
    sessionID: registration.sessionID,
    type: "tool",
    tool: canonical.toolID,
    callID: registration.callID,
    state: {
      status: "completed",
      input: canonical.input,
      output: exact.output,
      title: exact.title,
      metadata: exact.metadata,
      time: { start: timeAdmitted, end: settlement.settlementTime },
    },
  } satisfies SessionV1.ToolPart
  if (SemanticPresentation.readResult(part, true).type !== "valid") {
    throw new Error(`Constructed terminal Default-Course V2 Part ${registration.partID} is invalid`)
  }
  return part
}

function requirePhysicalSettlement(value: unknown): LearningCommand.PhysicalSettlement {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !["applied", "already_applied", "no_change", "error"].includes(
      (value as Record<string, unknown>).outcome as string,
    ) ||
    typeof (value as Record<string, unknown>).settlementTime !== "number" ||
    typeof (value as Record<string, unknown>).settlementOrder !== "number"
  ) {
    throw new Error("Default-Course physical settlement is unavailable")
  }
  return value as LearningCommand.PhysicalSettlement
}

function requireLearningSettlement(value: unknown): LearningCommand.Settlement {
  return requirePhysicalSettlement(value) as LearningCommand.Settlement
}

function stateTimeAdmitted(state: Readonly<{ timeAdmitted?: number }>, registration: Registration) {
  if (state.timeAdmitted === undefined) {
    throw new Error(`Default-Course V2 invocation ${registration.partID} lost its admission time`)
  }
  return state.timeAdmitted
}

function loadPrepared(events: EventV2.Interface, canonical: Canonical, registration: Registration) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const prepared = yield* loadPhysicalPrepared(tx, canonical, registration)
        if (!prepared) return yield* new LearningCommand.InvocationNotFoundError({ partID: registration.partID })
        return noEvent(prepared)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

function loadCommittedExactResult(
  events: EventV2.Interface,
  registration: Registration,
  attemptedCanonical?: Canonical,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const physical = yield* LearningCommand.lookupPhysicalInvocation(tx, {
          partID: registration.partID,
          assistantMessageID: registration.assistantMessageID,
          providerCallID: registration.callID,
        })
        if (physical?.command_name === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
          const state = yield* readDefaultCourseInvocationVersion(tx, {
            partID: registration.partID,
            assistantMessageID: registration.assistantMessageID,
            providerCallID: registration.callID,
          })
          if (state?.version === 2) {
            if (state.status === "admitted") return undefined
            const row = yield* readPartRow(tx, registration.partID)
            if (!row) {
              return yield* new LearningCommand.InvocationTranscriptUnavailableError({
                partID: registration.partID,
              })
            }
            const part = partFromRow(row)
            if (part.tool !== LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
              return yield* Effect.die(`Default-Course V2 Part ${registration.partID} changed tool identity`)
            }
            const canonical = {
              toolID: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
              input: normalizeDefaultV2(part.state.input),
            } satisfies DefaultV2Canonical
            return exactFromPart(yield* assertDefaultCourseV2TerminalPart(tx, canonical, registration, state))
          }
          if (state?.version === 3) {
            if (state.status === "admitted") return undefined
            const row = yield* readPartRow(tx, registration.partID)
            if (!row) {
              return yield* new LearningCommand.InvocationTranscriptUnavailableError({
                partID: registration.partID,
              })
            }
            const part = partFromRow(row)
            if (part.tool !== LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
              return yield* Effect.die(`Default-Course V3 Part ${registration.partID} changed tool identity`)
            }
            const canonical = {
              toolID: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
              input: normalizeDefaultV3(part.state.input),
            } satisfies DefaultV3Canonical
            return exactFromPart(yield* assertDefaultCourseV3TerminalPart(tx, canonical, registration, state))
          }
        }
        if (physical?.command_name === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY) {
          const state = yield* readLearnerGoalV2State(tx, registration)
          if (state?.version === 2) {
            if (state.status === "admitted") return undefined
            const row = yield* readPartRow(tx, registration.partID)
            if (!row) {
              return yield* new LearningCommand.InvocationTranscriptUnavailableError({
                partID: registration.partID,
              })
            }
            const part = partFromRow(row)
            if (part.tool !== LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY) {
              return yield* Effect.die(`Learner Goal V2 Part ${registration.partID} changed tool identity`)
            }
            const canonical = {
              toolID: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
              input: normalizeGoalsV2(part.state.input),
            } satisfies GoalV2Canonical
            return exactFromPart(yield* assertLearnerGoalV2TerminalPart(tx, canonical, registration, state))
          }
        }
        if (physical?.command_name === LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY) {
          const state = yield* readLearningBootstrapState(tx, registration)
          if (state) {
            if (state.status === "admitted") return undefined
            const row = yield* readPartRow(tx, registration.partID)
            if (!row) {
              return yield* new LearningCommand.InvocationTranscriptUnavailableError({
                partID: registration.partID,
              })
            }
            const part = partFromRow(row)
            if (part.tool !== LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY) {
              return yield* Effect.die(`Learning-bootstrap Part ${registration.partID} changed tool identity`)
            }
            const canonical = {
              toolID: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
              input: normalizeLearningBootstrap(part.state.input),
            } satisfies BootstrapCanonical
            return exactFromPart(yield* assertLearningBootstrapTerminalPart(tx, canonical, registration, state))
          }
        }
        if (physical?.command_name === LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY) {
          const state = yield* readLearnerResponseEvidenceState(tx, registration)
          if (state) {
            if (state.status === "admitted") return undefined
            const row = yield* readPartRow(tx, registration.partID)
            if (!row) {
              return yield* new LearningCommand.InvocationTranscriptUnavailableError({
                partID: registration.partID,
              })
            }
            const part = partFromRow(row)
            if (part.tool !== LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY) {
              return yield* Effect.die(`Learner-response-evidence Part ${registration.partID} changed tool identity`)
            }
            const canonical = {
              toolID: LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY,
              input: normalizeLearnerResponseEvidence(part.state.input),
            } satisfies ResponseEvidenceCanonical
            return exactFromPart(
              yield* assertLearnerResponseEvidenceTerminalPart(tx, canonical, registration, state),
            )
          }
        }
        if (physical?.command_name === LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY) {
          const state = yield* readFutureAttentionState(tx, registration)
          if (state) {
            if (state.status === "admitted") return undefined
            const row = yield* readPartRow(tx, registration.partID)
            if (!row) {
              return yield* new LearningCommand.InvocationTranscriptUnavailableError({
                partID: registration.partID,
              })
            }
            const part = partFromRow(row)
            if (part.tool !== LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY) {
              return yield* Effect.die(`FutureAttention Part ${registration.partID} changed tool identity`)
            }
            const canonical = {
              toolID: LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY,
              input: normalizeFutureAttention(part.state.input),
            } satisfies FutureAttentionCanonical
            return exactFromPart(yield* assertFutureAttentionTerminalPart(tx, canonical, registration, state))
          }
        }
        const canonical = attemptedCanonical ?? (yield* canonicalFromStoredPart(tx, registration.partID))
        if (!canonical) return undefined
        const prepared = yield* loadPhysicalPrepared(tx, canonical, registration)
        if (!prepared?.settlement) return undefined
        return prepared.exact ?? (yield* Effect.die("Settled learning command lost its exact terminal result"))
      }).pipe(Effect.exit, Effect.map(noEvent)),
    )
    .pipe(Effect.map((result) => result.result))
}

function canonicalFromStoredPart(tx: EventV2.Transaction, partID: SessionV1.PartID) {
  return Effect.gen(function* () {
    const row = yield* readPartRow(tx, partID)
    if (!row) return undefined
    const part = partFromRow(row)
    if (!isPrimaryCapability(part.tool)) return undefined
    return canonicalInput(part.tool, part.state.input)
  })
}

function loadPhysicalPrepared(tx: EventV2.Transaction, canonical: Canonical, registration: Registration) {
  return Effect.gen(function* () {
    const physical = yield* LearningCommand.lookupPhysicalInvocation(tx, {
      partID: registration.partID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
    })
    if (!physical) return undefined
    const invocation = yield* invocationFromPhysical(tx, physical, canonical)
    if (!sameRegistration(invocation.envelope, registration, canonical)) return yield* invocationConflict(registration)
    const reservation = yield* reservePrimary(tx, invocation)
    if (reservation.type === "admitted") {
      yield* assertAdmittedPart(tx, canonical, registration, invocation.envelope.timeAdmitted)
      return { canonical, invocation } satisfies Prepared
    }
    if (reservation.type === "replay") {
      const part = yield* assertTerminalPart(tx, canonical, invocation.envelope, reservation.settlement)
      return {
        canonical,
        invocation,
        settlement: reservation.settlement,
        exact: exactFromPart(part),
      } satisfies Prepared
    }
    return yield* Effect.die(`Stored learning invocation ${registration.partID} lost its physical reservation`)
  })
}

function invocationFromPhysical(
  tx: EventV2.Transaction,
  physical: LearningCommand.PhysicalInvocation,
  canonical: Canonical,
) {
  return Effect.gen(function* () {
    if (!physical.turn_id || !physical.input_id) {
      return yield* Effect.die(`Learning invocation ${physical.part_id} predates durable Turn authorization`)
    }
    if (physical.command_name !== canonical.toolID) {
      return yield* Effect.die(`Learning invocation ${physical.part_id} changed command identity`)
    }
    const envelope = {
      occurrenceID: physical.occurrence_id,
      turnID: physical.turn_id,
      inputID: physical.input_id,
      sessionID: physical.session_id,
      parentUserMessageID: physical.parent_user_message_id,
      assistantMessageID: physical.assistant_message_id,
      partID: physical.part_id,
      providerCallID: physical.provider_call_id,
      emissionOrdinal: physical.emission_ordinal,
      capabilityIdentity: physical.capability_identity,
      capabilityVersion: physical.capability_version,
      authorizationBasis: physical.authorization_basis,
      timeAdmitted: physical.time_admitted,
    }
    if (canonical.toolID === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY) {
      return { envelope, command: command(canonical.input) } as Invocation
    }
    if (canonical.toolID === LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY) {
      return { envelope, command: retainedSteeringCommand(canonical.input) } as Invocation
    }
    if (canonical.toolID === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY) {
      const invocation = { envelope, command: learnerGoalCommand(canonical.input) }
      if (canonical.input.authorizationBasis === "learner_request") {
        return invocation as LearnerGoal.DirectInvocation
      }
      const reservation = yield* LearningCommand.lookupHistoricalLearnerGoalCommand(tx, physical.part_id)
      if (!reservation?.permission_request_id) {
        return yield* Effect.die(`Learner Goal invocation ${physical.part_id} has no stable permission request`)
      }
      return {
        ...invocation,
        permissionRequestID: reservation.permission_request_id,
      } as LearnerGoal.AcceptedInvocation
    }
    if (canonical.toolID === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
      const permissionRequestID = yield* LearningCommand.lookupDefaultCoursePermissionRequestID(tx, physical.part_id)
      if (!permissionRequestID) {
        return yield* Effect.die(`Default Course invocation ${physical.part_id} has no stable permission request`)
      }
      return {
        envelope,
        command: defaultCommand(canonical.input),
        permissionRequestID,
      } as Invocation
    }
    return { envelope, command: anchorCommand(canonical.input) } as Invocation
  })
}

function reserveTransaction(tx: EventV2.Transaction, canonical: Canonical, invocation: Invocation) {
  return Effect.gen(function* () {
    const reservation = yield* reservePrimary(tx, invocation)
    if (reservation.type === "candidate" || reservation.type === "admitted") {
      return noEvent({ canonical, invocation } satisfies Prepared)
    }
    if (reservation.type === "replay") {
      const part = yield* assertTerminalPart(tx, canonical, invocation.envelope, reservation.settlement)
      return noEvent({
        canonical,
        invocation,
        settlement: reservation.settlement,
        exact: exactFromPart(part),
      } satisfies Prepared)
    }

    const metadata = isRetainedSteeringInvocation(invocation)
      ? yield* retainedSteeringSettlementMetadata(tx, invocation.envelope.sessionID, invocation.envelope.timeAdmitted)
      : yield* settlementMetadata(tx, invocation.envelope.sessionID, invocation.envelope.timeAdmitted)
    const settlement = isRetainedSteeringInvocation(invocation)
      ? yield* LearningCommand.settleRetainedSteeringReservation(tx, { ...invocation, settlement: metadata })
      : isLearnerGoalInvocation(invocation)
        ? yield* LearningCommand.settleHistoricalLearnerGoalReservation(tx, { ...invocation, settlement: metadata })
        : isNavigationInvocation(invocation)
          ? yield* LearningCommand.settleNavigationReservation(tx, { ...invocation, settlement: metadata })
          : yield* LearningCommand.settleReservation(tx, { ...invocation, settlement: metadata })
    if (settlement.type === "candidate") return yield* Effect.die("Terminal reservation became a new candidate")
    const part = yield* terminalPart(tx, canonical, invocation.envelope, settlement.settlement)
    return withPartEvent(
      {
        canonical,
        invocation,
        settlement: settlement.settlement,
        exact: exactFromPart(part),
      } satisfies Prepared,
      part,
      settlement.settlement.settlementTime,
    )
  })
}

function executePrepared(
  events: EventV2.Interface,
  permission: Permission.Interface,
  prepared: Prepared,
  context: ExecuteContext,
) {
  if (prepared.settlement) {
    if (!prepared.exact) return Effect.die("Settled learning command lost its exact terminal result")
    return Effect.succeed(prepared.exact)
  }
  if (isRetainedSteeringInvocation(prepared.invocation)) {
    return executeRetainedSteeringPrepared(events, permission, prepared.canonical, prepared.invocation, context)
  }
  if (isNavigationInvocation(prepared.invocation)) {
    return executeNavigationPrepared(events, permission, prepared.canonical, prepared.invocation, context)
  }
  if (isLearnerGoalInvocation(prepared.invocation)) {
    return Effect.die("Historical learner Goal V1 invocations may only replay or recover")
  }
  if (prepared.canonical.toolID !== LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY) {
    return Effect.die("Course acceptance invocation has a different canonical command")
  }
  const canonical = prepared.canonical
  const invocation = prepared.invocation
  return Effect.gen(function* () {
    const authority = requirePermissionContext(context)
    const located = yield* events.transaction((tx) =>
      Course.readRevisionPresentationLocator(tx, {
        courseID: invocation.command.courseID,
        revisionID: invocation.command.revisionID,
      }).pipe(Effect.map(noEvent), Effect.orDie),
    )
    const permissionOutcome = yield* LearningCommandPermission.ask(
      permission,
      {
        sessionID: invocation.envelope.sessionID,
        permission: LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
        patterns: [invocation.command.courseID],
        always: [invocation.command.courseID],
        metadata: {
          courseID: invocation.command.courseID,
          revisionID: invocation.command.revisionID,
          ...SemanticPresentation.metadata(
            LearningCommandPresentation.acceptCourseProposal(invocation, located.result),
          ),
        },
        tool: {
          messageID: invocation.envelope.assistantMessageID,
          callID: invocation.envelope.providerCallID,
        },
        ruleset: authority.ruleset,
        authority: authority.authority,
      },
      context.abort,
    )
    const committed = yield* events.transaction((tx) =>
      Effect.gen(function* () {
        const current = yield* loadPhysicalPrepared(tx, canonical, registrationFromEnvelope(invocation.envelope))
        if (!current) return yield* Effect.die(`Learning invocation ${invocation.envelope.partID} disappeared`)
        if (current.settlement) {
          if (!current.exact) return yield* Effect.die("Settled Goal command lost its exact terminal result")
          return noEvent(current.exact)
        }
        const consumed = yield* LearningFrontier.read(tx)
        yield* TurnLifecycle.consumeToolFrontier(tx, {
          partID: invocation.envelope.partID,
          frontier: consumed,
        })
        if (
          isNavigationInvocation(current.invocation) ||
          isRetainedSteeringInvocation(current.invocation) ||
          isLearnerGoalInvocation(current.invocation)
        ) {
          return yield* Effect.die("Course acceptance invocation changed command kind")
        }
        const settlement = yield* LearningCommand.settleAcceptance(tx, {
          ...current.invocation,
          permission: permissionOutcome,
          settlement: yield* settlementMetadata(
            tx,
            current.invocation.envelope.sessionID,
            current.invocation.envelope.timeAdmitted,
          ),
        })
        if (settlement.type === "replay") {
          const part = yield* assertTerminalPart(tx, canonical, current.invocation.envelope, settlement.settlement)
          return noEvent(exactFromPart(part))
        }
        if (settlement.settlement.outcome === "applied") {
          yield* TurnLifecycle.recordToolResultingFrontier(tx, {
            partID: current.invocation.envelope.partID,
            frontier: yield* LearningFrontier.read(tx),
          })
        }
        const part = yield* terminalPart(tx, canonical, current.invocation.envelope, settlement.settlement)
        return withPartEvent(exactFromPart(part), part, settlement.settlement.settlementTime)
      }).pipe(Effect.orDie),
    )
    return committed.result
  })
}

function executeNavigationPrepared(
  events: EventV2.Interface,
  permission: Permission.Interface,
  canonical: Canonical,
  invocation: LearningCommand.NavigationInvocation,
  context: ExecuteContext,
) {
  return Effect.gen(function* () {
    if (!navigationMatchesCanonical(invocation, canonical)) {
      return yield* Effect.die("Navigation invocation has a different canonical command")
    }
    const authority = requirePermissionContext(context)
    const pattern = navigationPermissionPattern(invocation)
    const rule = Permission.evaluateAuthority(
      invocation.envelope.capabilityIdentity,
      pattern,
      authority.ruleset,
      authority.authority,
    )
    if (rule.action === "deny") {
      return yield* commitNavigation(events, canonical, invocation, { type: "deny" }, undefined)
    }
    const prepared = yield* prepareNavigation(events, invocation)
    const permissionOutcome = yield* navigationPermissionOutcome(
      permission,
      invocation,
      prepared,
      rule.action,
      authority,
      context.abort,
    )
    return yield* commitNavigation(
      events,
      canonical,
      invocation,
      permissionOutcome,
      prepared.type === "success" ? prepared.value : undefined,
    )
  })
}

function executeRetainedSteeringPrepared(
  events: EventV2.Interface,
  permission: Permission.Interface,
  canonical: Canonical,
  invocation: LearningCommand.RetainedSteeringInvocation,
  context: ExecuteContext,
) {
  return Effect.gen(function* () {
    if (canonical.toolID !== LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY) {
      return yield* Effect.die("Retained steering invocation has a different canonical command")
    }
    const reconciled = yield* events.transaction<RetainedExecutionReconciliation, typeof SessionV1.Event.PartUpdated>(
      (tx) =>
        Effect.gen(function* () {
          const current = yield* loadPhysicalPrepared(tx, canonical, registrationFromEnvelope(invocation.envelope))
          if (!current) return yield* Effect.die(`Learning invocation ${invocation.envelope.partID} disappeared`)
          if (current.settlement) {
            if (!current.exact) return yield* Effect.die("Settled retained steering lost its exact terminal result")
            return noEvent({ type: "settled" as const, exact: current.exact })
          }
          if (!isRetainedSteeringInvocation(current.invocation)) {
            return yield* Effect.die("Retained steering invocation changed command kind")
          }
          const semantic = yield* RetainedSteering.resolveSemantic(tx, {
            occurrenceID: current.invocation.envelope.occurrenceID,
            fingerprint: RetainedSteering.commandFingerprint(current.invocation.command),
          })
          if (semantic.type === "candidate") return noEvent({ type: "candidate" as const })
          yield* TurnLifecycle.consumeToolFrontier(tx, {
            partID: current.invocation.envelope.partID,
            frontier: yield* LearningFrontier.read(tx),
          })
          const settlement = yield* LearningCommand.settleRetainedSteeringReservation(tx, {
            ...current.invocation,
            settlement: yield* retainedSteeringSettlementMetadata(
              tx,
              current.invocation.envelope.sessionID,
              current.invocation.envelope.timeAdmitted,
            ),
          })
          if (settlement.type === "candidate") {
            return yield* Effect.die("Committed retained steering reconciliation became a new candidate")
          }
          if (settlement.type === "replay") {
            const part = yield* assertTerminalPart(tx, canonical, current.invocation.envelope, settlement.settlement)
            return noEvent({ type: "settled" as const, exact: exactFromPart(part) })
          }
          const part = yield* terminalPart(tx, canonical, current.invocation.envelope, settlement.settlement)
          return withPartEvent(
            { type: "settled" as const, exact: exactFromPart(part) },
            part,
            settlement.settlement.settlementTime,
          )
        }).pipe(Effect.orDie),
    )
    if (reconciled.result.type === "settled") {
      return reconciled.result.exact
    }
    const authority = requirePermissionContext(context)
    const permissionOutcome = yield* LearningCommandPermission.ask(
      permission,
      {
        sessionID: invocation.envelope.sessionID,
        permission: invocation.envelope.capabilityIdentity,
        patterns: [RetainedSteering.SCOPE],
        always: [RetainedSteering.SCOPE],
        metadata: {
          action: invocation.command.action,
          scope: RetainedSteering.SCOPE,
          command: invocation.command,
          ...SemanticPresentation.metadata(LearningCommandPresentation.retainedSteeringProposal(invocation)),
        },
        tool: {
          messageID: invocation.envelope.assistantMessageID,
          callID: invocation.envelope.providerCallID,
        },
        ruleset: authority.ruleset,
        authority: authority.authority,
      },
      context.abort,
    )
    const committed = yield* events.transaction((tx) =>
      Effect.gen(function* () {
        const current = yield* loadPhysicalPrepared(tx, canonical, registrationFromEnvelope(invocation.envelope))
        if (!current) return yield* Effect.die(`Learning invocation ${invocation.envelope.partID} disappeared`)
        if (current.settlement) {
          if (!current.exact) return yield* Effect.die("Settled retained steering lost its exact terminal result")
          return noEvent(current.exact)
        }
        if (!isRetainedSteeringInvocation(current.invocation)) {
          return yield* Effect.die("Retained steering invocation changed command kind")
        }
        const consumed = yield* LearningFrontier.read(tx)
        yield* TurnLifecycle.consumeToolFrontier(tx, {
          partID: current.invocation.envelope.partID,
          frontier: consumed,
        })
        const settlement = yield* LearningCommand.settleRetainedSteering(tx, {
          ...current.invocation,
          permission: permissionOutcome,
          settlement: yield* retainedSteeringSettlementMetadata(
            tx,
            current.invocation.envelope.sessionID,
            current.invocation.envelope.timeAdmitted,
          ),
        })
        if (settlement.type === "replay") {
          const part = yield* assertTerminalPart(tx, canonical, current.invocation.envelope, settlement.settlement)
          return noEvent(exactFromPart(part))
        }
        if (settlement.settlement.outcome === "applied") {
          yield* TurnLifecycle.recordToolResultingFrontier(tx, {
            partID: current.invocation.envelope.partID,
            frontier: yield* LearningFrontier.read(tx),
          })
        }
        const part = yield* terminalPart(tx, canonical, current.invocation.envelope, settlement.settlement)
        return withPartEvent(exactFromPart(part), part, settlement.settlement.settlementTime)
      }).pipe(Effect.orDie),
    )
    return committed.result
  })
}

type NavigationPreparation =
  | { readonly type: "success"; readonly kind: "default"; readonly value: LearnerNavigation.PreparedDefault }
  | { readonly type: "success"; readonly kind: "anchor"; readonly value: LearnerNavigation.PreparedAnchor }
  | { readonly type: "failure"; readonly error: unknown }

function prepareNavigation(events: EventV2.Interface, invocation: LearningCommand.NavigationInvocation) {
  if (isDefaultNavigationInvocation(invocation)) {
    return events
      .transaction((tx) =>
        LearnerNavigation.prepareDefaultInTransaction(tx, invocation.command, invocation.permissionRequestID).pipe(
          Effect.map((value): NavigationPreparation => ({ type: "success", kind: "default", value })),
          Effect.catch((error) => Effect.succeed({ type: "failure", error } as NavigationPreparation)),
          Effect.map(noEvent),
        ),
      )
      .pipe(Effect.map((result) => result.result))
  }
  return events
    .transaction((tx) =>
      LearnerNavigation.prepareAnchorInTransaction(tx, invocation.command).pipe(
        Effect.map((value): NavigationPreparation => ({ type: "success", kind: "anchor", value })),
        Effect.catch((error) => Effect.succeed({ type: "failure", error } as NavigationPreparation)),
        Effect.map(noEvent),
      ),
    )
    .pipe(Effect.map((result) => result.result))
}

function navigationPermissionOutcome(
  permission: Permission.Interface,
  invocation: LearningCommand.NavigationInvocation,
  prepared: NavigationPreparation,
  action: PermissionV1.Action,
  authority: ReturnType<typeof requirePermissionContext>,
  abort: AbortSignal,
) {
  if (prepared.type === "failure") return Effect.succeed({ type: "allow" } as const)
  if (action === "allow" && prepared.value.decision === "no_change") {
    return Effect.succeed({ type: "allow" } as const)
  }
  if (action === "allow" && invocation.command.kind === "course_route_anchor") {
    return Effect.succeed({ type: "allow" } as const)
  }
  if (
    isDefaultNavigationInvocation(invocation) &&
    prepared.kind === "default" &&
    prepared.value.decision === "candidate"
  ) {
    return LearningCommandPermission.ask(
      permission,
      {
        id: invocation.permissionRequestID,
        requirePrompt: true,
        sessionID: invocation.envelope.sessionID,
        permission: invocation.envelope.capabilityIdentity,
        patterns: [navigationPermissionPattern(invocation)],
        always: [],
        metadata: {
          onceOnly: true,
          navigationKind: invocation.command.kind,
          confirmation: prepared.value.confirmation,
          ...SemanticPresentation.metadata(
            LearningCommandPresentation.defaultCourseProposal(invocation, prepared.value.confirmation),
          ),
        },
        tool: {
          messageID: invocation.envelope.assistantMessageID,
          callID: invocation.envelope.providerCallID,
        },
        ruleset: authority.ruleset,
        authority: authority.authority,
      },
      abort,
    )
  }
  const presentation = isDefaultNavigationInvocation(invocation)
    ? LearningCommandPresentation.defaultCourseCommandProposal(invocation, prepared.value.decision === "no_change")
    : LearningCommandPresentation.routeAnchorProposal(
        invocation,
        prepared.value.decision === "no_change",
        "locator" in prepared.value ? prepared.value.locator : undefined,
      )
  return LearningCommandPermission.ask(
    permission,
    {
      sessionID: invocation.envelope.sessionID,
      permission: invocation.envelope.capabilityIdentity,
      patterns: [navigationPermissionPattern(invocation)],
      always: [navigationPermissionPattern(invocation)],
      metadata: {
        navigationKind: invocation.command.kind,
        noChange: prepared.value.decision === "no_change",
        command: invocation.command,
        ...SemanticPresentation.metadata(presentation),
      },
      tool: {
        messageID: invocation.envelope.assistantMessageID,
        callID: invocation.envelope.providerCallID,
      },
      ruleset: authority.ruleset,
      authority: authority.authority,
    },
    abort,
  )
}

function commitNavigation(
  events: EventV2.Interface,
  canonical: Canonical,
  invocation: LearningCommand.NavigationInvocation,
  permission: LearningCommand.PermissionOutcome,
  prepared: LearnerNavigation.PreparedDefault | LearnerNavigation.PreparedAnchor | undefined,
) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const current = yield* loadPhysicalPrepared(tx, canonical, registrationFromEnvelope(invocation.envelope))
        if (!current) return yield* Effect.die(`Learning invocation ${invocation.envelope.partID} disappeared`)
        if (current.settlement) {
          if (!current.exact) return yield* Effect.die("Settled navigation command lost its exact terminal result")
          return noEvent(current.exact)
        }
        if (!isNavigationInvocation(current.invocation)) {
          return yield* Effect.die("Navigation invocation changed command kind")
        }
        const consumed = yield* LearningFrontier.read(tx)
        yield* TurnLifecycle.consumeToolFrontier(tx, {
          partID: current.invocation.envelope.partID,
          frontier: consumed,
        })
        const settlement = yield* LearningCommand.settleNavigation(tx, {
          ...current.invocation,
          permission,
          settlement: yield* settlementMetadata(
            tx,
            current.invocation.envelope.sessionID,
            current.invocation.envelope.timeAdmitted,
          ),
          ...(prepared ? { prepared } : {}),
        })
        if (settlement.type === "replay") {
          const part = yield* assertTerminalPart(tx, canonical, current.invocation.envelope, settlement.settlement)
          return noEvent(exactFromPart(part))
        }
        if (settlement.settlement.outcome === "applied") {
          yield* TurnLifecycle.recordToolResultingFrontier(tx, {
            partID: current.invocation.envelope.partID,
            frontier: yield* LearningFrontier.read(tx),
          })
        }
        const part = yield* terminalPart(tx, canonical, current.invocation.envelope, settlement.settlement)
        return withPartEvent(exactFromPart(part), part, settlement.settlement.settlementTime)
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

export function recoverAdmitted(events: EventV2.Interface) {
  return Effect.gen(function* () {
    const admitted = yield* events.transaction((tx) =>
      LearningCommand.listAdmitted(tx).pipe(
        Effect.map((rows) =>
          noEvent(
            rows.filter(
              (row) =>
                isPrimaryCapability(row.command_name) ||
                row.command_name === LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY ||
                row.command_name === LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY ||
                row.command_name === LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY,
            ),
          ),
        ),
        Effect.orDie,
      ),
    )
    yield* Effect.forEach(
      admitted.result,
      (row) =>
        row.turn_id && row.input_id
          ? interruptInvocation(events, {
              turnID: row.turn_id,
              inputID: row.input_id,
              causalOccurrenceID: row.occurrence_id,
              partID: row.part_id,
              callID: row.provider_call_id,
              emissionOrdinal: row.emission_ordinal,
              sessionID: row.session_id,
              parentUserMessageID: row.parent_user_message_id,
              assistantMessageID: row.assistant_message_id,
            }).pipe(Effect.orDie)
          : recoverLegacyAdmitted(events, row),
      { discard: true },
    )
  })
}

function recoverLegacyAdmitted(events: EventV2.Interface, row: LearningCommand.PhysicalInvocation) {
  return events
    .transaction((tx) =>
      Effect.gen(function* () {
        const canonical = yield* canonicalFromStoredPart(tx, row.part_id)
        if (!canonical) {
          return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: row.part_id })
        }
        const settlement = yield* LearningCommand.recoverInterrupted(tx, {
          partID: row.part_id,
          settlement:
            canonical.toolID === LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY
              ? yield* retainedSteeringSettlementMetadata(tx, row.session_id, row.time_admitted)
              : yield* settlementMetadata(tx, row.session_id, row.time_admitted),
        })
        const envelope = terminalEnvelopeFromPhysical(row)
        if (settlement.type === "replay") {
          yield* assertRecoveredTerminalPart(tx, canonical, envelope, settlement.settlement)
          return noEvent(true)
        }
        const interrupted = requireInterruptedSettlement(settlement.settlement)
        return withPartEvent(
          true,
          yield* terminalPart(tx, canonical, envelope, interrupted),
          interrupted.settlementTime,
        )
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.map((result) => result.result))
}

export const interruptInvocation = Effect.fn("LearningCommandRuntime.interrupt")(function* (
  events: EventV2.Interface,
  registration: Registration,
) {
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const exit = yield* restore(
        events.transaction((tx) => interruptTransaction(tx, registration).pipe(Effect.orDie)),
      ).pipe(Effect.exit)
      if (Exit.isSuccess(exit)) return exit.value.result

      const reconciled = yield* loadCommittedExactResult(events, registration).pipe(Effect.exit)
      if (Exit.isSuccess(reconciled) && Exit.isSuccess(reconciled.value) && reconciled.value.value) return true
      if (Exit.isSuccess(reconciled) && Exit.isFailure(reconciled.value)) {
        return yield* Effect.failCause(reconciled.value.cause)
      }
      if (Exit.isFailure(reconciled)) return yield* Effect.failCause(reconciled.cause)
      return yield* Effect.failCause(exit.cause)
    }),
  )
})

function interruptTransaction(tx: EventV2.Transaction, registration: Registration) {
  return Effect.gen(function* () {
    const physical = yield* LearningCommand.lookupPhysicalInvocation(tx, {
      partID: registration.partID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
    })
    if (!physical) return noEvent(false)
    if (physical.command_name === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
      const state = yield* readDefaultCourseInvocationVersion(tx, {
        partID: registration.partID,
        assistantMessageID: registration.assistantMessageID,
        providerCallID: registration.callID,
      })
      if (state?.version === 2) return yield* interruptDefaultCourseV2Transaction(tx, registration, state)
      if (state?.version === 3) return yield* interruptDefaultCourseV3Transaction(tx, registration, state)
    }
    if (physical.command_name === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY) {
      const state = yield* readLearnerGoalV2State(tx, registration)
      if (state?.version === 2) return yield* interruptLearnerGoalV2Transaction(tx, registration)
    }
    if (physical.command_name === LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY) {
      return yield* interruptLearningBootstrapTransaction(tx, registration)
    }
    if (physical.command_name === LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY) {
      return yield* interruptLearnerResponseEvidenceTransaction(tx, registration)
    }
    if (physical.command_name === LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY) {
      return yield* interruptFutureAttentionTransaction(tx, registration)
    }
    const row = yield* readPartRow(tx, registration.partID)
    if (!row) {
      return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
    }
    const part = partFromRow(row)
    if (!isPrimaryCapability(part.tool)) {
      return yield* Effect.die(`Primary learning invocation ${registration.partID} has a different tool ID`)
    }
    const canonical = canonicalInput(part.tool, part.state.input)
    const prepared = yield* loadPhysicalPrepared(tx, canonical, registration)
    if (!prepared) return yield* Effect.die(`Learning invocation ${registration.partID} disappeared`)
    if (prepared.settlement) return noEvent(true)
    const metadata =
      canonical.toolID === LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY
        ? yield* retainedSteeringSettlementMetadata(
            tx,
            registration.sessionID,
            prepared.invocation.envelope.timeAdmitted,
          )
        : yield* settlementMetadata(tx, registration.sessionID, prepared.invocation.envelope.timeAdmitted)
    if (isRetainedSteeringInvocation(prepared.invocation)) {
      const reconciled = yield* LearningCommand.settleRetainedSteeringReservation(tx, {
        ...prepared.invocation,
        settlement: metadata,
      })
      if (reconciled.type !== "candidate") {
        if (reconciled.type === "replay") {
          yield* assertTerminalPart(tx, canonical, prepared.invocation.envelope, reconciled.settlement)
          return noEvent(true)
        }
        return withPartEvent(
          true,
          yield* terminalPart(tx, canonical, prepared.invocation.envelope, reconciled.settlement),
          reconciled.settlement.settlementTime,
        )
      }
    }
    if (isLearnerGoalInvocation(prepared.invocation)) {
      const reconciled = yield* LearningCommand.settleHistoricalLearnerGoalReservation(tx, {
        ...prepared.invocation,
        settlement: metadata,
      })
      if (reconciled.type !== "candidate") {
        if (reconciled.type === "replay") {
          yield* assertTerminalPart(tx, canonical, prepared.invocation.envelope, reconciled.settlement)
          return noEvent(true)
        }
        return withPartEvent(
          true,
          yield* terminalPart(tx, canonical, prepared.invocation.envelope, reconciled.settlement),
          reconciled.settlement.settlementTime,
        )
      }
    }
    const settlement = yield* LearningCommand.recoverInterrupted(tx, {
      partID: registration.partID,
      settlement: metadata,
    })
    if (settlement.type === "replay") {
      yield* assertRecoveredTerminalPart(tx, canonical, prepared.invocation.envelope, settlement.settlement)
      return noEvent(true)
    }
    const interrupted = requireInterruptedSettlement(settlement.settlement)
    const terminal = yield* terminalPart(tx, canonical, prepared.invocation.envelope, interrupted)
    return withPartEvent(true, terminal, interrupted.settlementTime)
  })
}

function interruptLearningBootstrapTransaction(tx: EventV2.Transaction, registration: Registration) {
  return Effect.gen(function* () {
    const row = yield* readPartRow(tx, registration.partID)
    if (!row) {
      return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
    }
    const part = partFromRow(row)
    const canonical = {
      toolID: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
      input: normalizeLearningBootstrap(part.state.input),
    } satisfies BootstrapCanonical
    const state = yield* requireLearningBootstrapState(tx, canonical, registration)
    if (state.status !== "admitted") {
      yield* assertLearningBootstrapTerminalPart(tx, canonical, registration, state)
      return noEvent(true)
    }
    yield* LearningBootstrap.recover(tx, {
      partID: registration.partID,
      settlement: yield* settlementMetadata(tx, registration.sessionID, state.timeAdmitted),
    })
    const terminal = yield* requireLearningBootstrapState(tx, canonical, registration)
    if (terminal.status === "admitted") {
      return yield* Effect.die(`Recovered learning-bootstrap invocation ${registration.partID} remained admitted`)
    }
    const completed = learningBootstrapTerminalPart(canonical, registration, terminal)
    return withPartEvent(true, completed, requirePhysicalSettlement(terminal.settlement).settlementTime)
  })
}

export function finalizeFutureAttentionClaims(
  events: EventV2.Interface,
  input: Readonly<{
    assistantMessageID?: SessionV1.MessageID
    observationCut: FutureAttention.CompletionFacts["observationCut"]
    time: number
  }>,
) {
  return Effect.gen(function* () {
    const pending = yield* events
      .transaction((tx) =>
        FutureAttention.listPendingClaimGroups(tx, {
          ...(input.assistantMessageID ? { assistantMessageID: input.assistantMessageID } : {}),
        }).pipe(Effect.map((groups) => noEvent(groups.map((group) => group.id))), Effect.orDie),
      )
      .pipe(Effect.map((result) => result.result))
    return yield* Effect.forEach(
      pending,
      (groupID) =>
        FutureAttention.finalizeObservedClaimGroup(events, {
          groupID,
          observationCut: input.observationCut,
          time: input.time,
        }).pipe(Effect.orDie),
      { concurrency: 1 },
    )
  })
}

function interruptLearnerResponseEvidenceTransaction(tx: EventV2.Transaction, registration: Registration) {
  return Effect.gen(function* () {
    const row = yield* readPartRow(tx, registration.partID)
    if (!row) {
      return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
    }
    const part = partFromRow(row)
    const canonical = {
      toolID: LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY,
      input: normalizeLearnerResponseEvidence(part.state.input),
    } satisfies ResponseEvidenceCanonical
    const state = yield* requireLearnerResponseEvidenceState(tx, canonical, registration)
    if (state.status !== "admitted") {
      yield* assertLearnerResponseEvidenceTerminalPart(tx, canonical, registration, state)
      return noEvent(true)
    }
    yield* LearnerResponseEvidence.recover(tx, {
      partID: registration.partID,
      settlement: yield* settlementMetadata(tx, registration.sessionID, state.timeAdmitted),
    })
    const terminal = yield* requireLearnerResponseEvidenceState(tx, canonical, registration)
    if (terminal.status === "admitted") {
      return yield* Effect.die(`Recovered learner-response-evidence invocation ${registration.partID} remained admitted`)
    }
    const completed = learnerResponseEvidenceTerminalPart(canonical, registration, terminal)
    return withPartEvent(true, completed, requirePhysicalSettlement(terminal.settlement).settlementTime)
  })
}

function interruptFutureAttentionTransaction(tx: EventV2.Transaction, registration: Registration) {
  return Effect.gen(function* () {
    const row = yield* readPartRow(tx, registration.partID)
    if (!row) {
      return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
    }
    const part = partFromRow(row)
    const canonical = {
      toolID: LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY,
      input: normalizeFutureAttention(part.state.input),
    } satisfies FutureAttentionCanonical
    const state = yield* requireFutureAttentionState(tx, canonical, registration)
    if (state.status !== "admitted") {
      yield* assertFutureAttentionTerminalPart(tx, canonical, registration, state)
      return noEvent(true)
    }
    yield* FutureAttention.recover(tx, {
      partID: registration.partID,
      settlement: yield* settlementMetadata(tx, registration.sessionID, state.timeAdmitted),
    })
    const terminal = yield* requireFutureAttentionState(tx, canonical, registration)
    if (terminal.status === "admitted") {
      return yield* Effect.die(`Recovered FutureAttention invocation ${registration.partID} remained admitted`)
    }
    const completed = futureAttentionTerminalPart(canonical, registration, terminal)
    return withPartEvent(true, completed, requirePhysicalSettlement(terminal.settlement).settlementTime)
  })
}

function interruptLearnerGoalV2Transaction(tx: EventV2.Transaction, registration: Registration) {
  return Effect.gen(function* () {
    const row = yield* readPartRow(tx, registration.partID)
    if (!row) {
      return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
    }
    const part = partFromRow(row)
    const canonical = {
      toolID: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
      input: normalizeGoalsV2(part.state.input),
    } satisfies GoalV2Canonical
    const state = yield* requireLearnerGoalV2State(tx, canonical, registration)
    if (state.status !== "admitted") {
      yield* assertLearnerGoalV2TerminalPart(tx, canonical, registration, state)
      return noEvent(true)
    }
    yield* LearningCommand.recoverLearnerGoalsV2(tx, {
      partID: registration.partID,
      settlement: yield* settlementMetadata(tx, registration.sessionID, state.timeAdmitted),
    })
    const terminal = yield* requireLearnerGoalV2State(tx, canonical, registration)
    if (terminal.status === "admitted") {
      return yield* Effect.die(`Recovered learner Goal V2 invocation ${registration.partID} remained admitted`)
    }
    const completed = learnerGoalV2TerminalPart(canonical, registration, terminal)
    return withPartEvent(true, completed, requirePhysicalSettlement(terminal.settlement).settlementTime)
  })
}

function interruptDefaultCourseV2Transaction(
  tx: EventV2.Transaction,
  registration: Registration,
  initial: Extract<DefaultCourseInvocationVersion, { readonly version: 2 }>,
) {
  return Effect.gen(function* () {
    const row = yield* readPartRow(tx, registration.partID)
    if (!row) {
      return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
    }
    const part = partFromRow(row)
    const canonical = {
      toolID: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      input: normalizeDefaultV2(part.state.input),
    } satisfies DefaultV2Canonical
    const state = yield* requireDefaultCourseV2State(tx, canonical, registration)
    if (state.status !== "admitted") {
      yield* assertDefaultCourseV2TerminalPart(tx, canonical, registration, state)
      return noEvent(true)
    }
    const settlement = yield* recoverDefaultCourseV2(tx, {
      partID: registration.partID,
      settlement: yield* settlementMetadata(tx, registration.sessionID, state.timeAdmitted),
    })
    if (settlement.type === "replay") {
      const replayed = requirePhysicalSettlement(settlement.settlement)
      yield* assertDefaultCourseV2TerminalPart(tx, canonical, registration, {
        ...initial,
        status: replayed.outcome,
        settlement: replayed,
        acknowledgement: settlement.acknowledgement,
        timeAdmitted: state.timeAdmitted,
      })
      return noEvent(true)
    }
    const terminal = defaultCourseV2TerminalPart(
      canonical,
      registration,
      candidateResultDisposition(state.authorization!),
      settlement.settlement,
      settlement.acknowledgement,
      state.timeAdmitted,
    )
    return withPartEvent(true, terminal, settlement.settlement.settlementTime)
  })
}

function interruptDefaultCourseV3Transaction(
  tx: EventV2.Transaction,
  registration: Registration,
  initial: Extract<DefaultCourseInvocationVersion, { readonly version: 3 }>,
) {
  return Effect.gen(function* () {
    const row = yield* readPartRow(tx, registration.partID)
    if (!row) {
      return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
    }
    const part = partFromRow(row)
    const canonical = {
      toolID: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
      input: normalizeDefaultV3(part.state.input),
    } satisfies DefaultV3Canonical
    const state = yield* requireDefaultCourseV3State(tx, canonical, registration)
    if (state.status !== "admitted") {
      yield* assertDefaultCourseV3TerminalPart(tx, canonical, registration, state)
      return noEvent(true)
    }
    const settlement = yield* recoverDefaultCourseV3(tx, {
      partID: registration.partID,
      settlement: yield* settlementMetadata(tx, registration.sessionID, state.timeAdmitted),
    })
    if (settlement.type === "replay") {
      const replayed = requirePhysicalSettlement(settlement.settlement)
      yield* assertDefaultCourseV3TerminalPart(tx, canonical, registration, {
        ...initial,
        status: replayed.outcome,
        settlement: replayed,
        acknowledgement: settlement.acknowledgement,
        timeAdmitted: state.timeAdmitted,
      })
      return noEvent(true)
    }
    const terminal = defaultCourseV3TerminalPart(
      canonical,
      registration,
      candidateV3ResultDisposition(state.agentAction!),
      settlement.settlement,
      settlement.acknowledgement,
      state.timeAdmitted,
    )
    return withPartEvent(true, terminal, settlement.settlement.settlementTime)
  })
}

function settlementMetadata(tx: EventV2.Transaction, sessionID: string, floor: number) {
  return Effect.gen(function* () {
    const frontier = yield* LearningFrontier.read(tx)
    return {
      time: Math.max(Date.now(), floor, frontier.time),
      order: yield* EventV2.nextSequence(tx, sessionID),
    }
  })
}

function retainedSteeringSettlementMetadata(tx: EventV2.Transaction, sessionID: string, floor: number) {
  return Effect.gen(function* () {
    const [frontier, latestCutAsOf] = yield* Effect.all([LearningFrontier.read(tx), RetainedSteering.latestCutAsOf(tx)])
    return {
      time: Math.max(Date.now(), floor, frontier.time, latestCutAsOf),
      order: yield* EventV2.nextSequence(tx, sessionID),
    }
  })
}

function pendingPart(canonical: Canonical, registration: Registration): SessionV1.ToolPart {
  return {
    id: registration.partID,
    messageID: registration.assistantMessageID,
    sessionID: registration.sessionID,
    type: "tool",
    tool: canonical.toolID,
    callID: registration.callID,
    state: { status: "pending", input: canonical.input, raw: JSON.stringify(canonical.input) },
  }
}

function terminalPart(
  tx: EventV2.Transaction,
  canonical: Canonical,
  envelope: TerminalPartEnvelope,
  settlement: LearningCommand.Settlement,
): Effect.Effect<SessionV1.ToolPart, LearnerGoal.IntegrityError> {
  return Effect.gen(function* () {
    const goalOperations =
      canonical.toolID === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY &&
      settlement.outcome !== "error" &&
      "operations" in settlement
        ? yield* LearnerGoal.prepareResultPresentation(tx, settlement.operations, settlement.settlementTime)
        : []
    const owner = yield* resultOwnerPresentation(tx, canonical.toolID, settlement)
    const result = exactResult(settlement, canonical.toolID, envelope, goalOperations, owner)
    const part = {
      id: envelope.partID,
      messageID: envelope.assistantMessageID,
      sessionID: envelope.sessionID,
      type: "tool",
      tool: canonical.toolID,
      callID: envelope.providerCallID,
      state: {
        status: "completed",
        input: canonical.input,
        output: result.output,
        title: result.title,
        metadata: result.metadata,
        time: { start: envelope.timeAdmitted, end: settlement.settlementTime },
      },
    } satisfies SessionV1.ToolPart
    if (SemanticPresentation.readResult(part, true).type !== "valid") {
      return yield* Effect.die(`Constructed terminal learning Part ${envelope.partID} has an invalid semantic result`)
    }
    return part
  })
}

export function exactResult(
  settlement: LearningCommand.Settlement,
  toolID: PrimaryCapability = LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
  envelope?: TerminalPartEnvelope,
  goalOperations: readonly LearnerGoal.ResultPresentationOperation[] = [],
  owner: LearningCommandPresentation.ResultOwnerPresentation = {},
): ExactResult {
  if (!envelope) throw new Error("Consequential result is missing its terminal ToolPart binding")
  if (toolID === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY) {
    const acknowledged = "acknowledgementTitle" in settlement ? settlement : undefined
    const output =
      acknowledged?.acknowledgementBody ??
      learnerGoalErrorMessage(settlement.outcome === "error" ? settlement.code : "validation_error")
    const presentation = LearningCommandPresentation.settlementResult(
      settlement,
      toolID,
      envelope,
      goalOperations,
      owner,
    )
    const projected = SemanticPresentation.projectResultBasis(presentation.basis)
    if (!projected) throw new Error("Learner Goal settlement has no valid semantic projection")
    return {
      title: projected.title,
      metadata: {
        command: toolID,
        commandVersion: envelope.capabilityVersion ?? capabilityVersion(toolID),
        outcome: settlement.outcome,
        ...(settlement.outcome === "error" ? { code: settlement.code } : {}),
        durablySettled: projected.durablySettled,
        truncated: false,
        ...SemanticPresentation.metadata(presentation),
      },
      output,
    }
  }
  if (toolID === LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY) {
    const acknowledged = "acknowledgementTitle" in settlement ? settlement : undefined
    const output =
      acknowledged?.acknowledgementBody ??
      retainedSteeringErrorMessage(settlement.outcome === "error" ? settlement.code : "validation_error")
    const presentation = LearningCommandPresentation.settlementResult(settlement, toolID, envelope, [], owner)
    const projected = SemanticPresentation.projectResultBasis(presentation.basis)
    if (!projected) throw new Error("Retained steering settlement has no valid semantic projection")
    return {
      title: projected.title,
      metadata: {
        command: toolID,
        commandVersion: envelope.capabilityVersion ?? capabilityVersion(toolID),
        outcome: settlement.outcome,
        ...(settlement.outcome === "error" ? { code: settlement.code } : {}),
        durablySettled: projected.durablySettled,
        truncated: false,
        ...SemanticPresentation.metadata(presentation),
      },
      output,
    }
  }
  const presentation = LearningCommandPresentation.settlementResult(settlement, toolID, envelope, [], owner)
  const projected = SemanticPresentation.projectResultBasis(presentation.basis)
  if (!projected) throw new Error("Learning command settlement has no valid semantic projection")
  return {
    title: projected.title,
    metadata: {
      command: toolID,
      commandVersion: envelope.capabilityVersion ?? capabilityVersion(toolID),
      outcome: settlement.outcome,
      ...(settlement.outcome === "error" ? { code: settlement.code } : {}),
      durablySettled: projected.durablySettled,
      truncated: false,
      ...SemanticPresentation.metadata(presentation),
    },
    output: JSON.stringify(settlement),
  }
}

function resultOwnerPresentation(
  tx: EventV2.Transaction,
  toolID: PrimaryCapability,
  settlement: LearningCommand.Settlement,
): Effect.Effect<LearningCommandPresentation.ResultOwnerPresentation, LearnerGoal.IntegrityError> {
  if (settlement.outcome === "error") return Effect.succeed({})
  if (
    toolID === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY &&
    "courseID" in settlement &&
    "revisionID" in settlement &&
    "effectID" in settlement
  ) {
    return Course.readSelectionAcceptancePresentation(tx, settlement.effectID).pipe(
      Effect.orDie,
      Effect.map((course) => ({ course })),
    )
  }
  if (
    toolID === LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY &&
    "navigationKind" in settlement &&
    settlement.navigationKind === "course_route_anchor"
  ) {
    if (!("effectID" in settlement) && !settlement.current.courseID) {
      return Effect.die("Course route-anchor result lost its owner Course")
    }
    const input =
      "effectID" in settlement ? { effectID: settlement.effectID } : { courseID: settlement.current.courseID! }
    return LearnerNavigation.readAnchorResultPresentation(tx, input).pipe(
      Effect.orDie,
      Effect.map((anchor) => ({ anchor })),
    )
  }
  if (
    toolID === LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY &&
    "policyID" in settlement &&
    "state" in settlement
  ) {
    return RetainedSteering.readResultPresentation(tx, settlement).pipe(Effect.map((retained) => ({ retained })))
  }
  return Effect.succeed({})
}

function learnerGoalErrorMessage(code: LearningCommand.ErrorCode) {
  if (code === "permission_rejected" || code === "permission_corrected") {
    return "The learner Goals were not changed because effective permission did not authorize this candidate. Continue from the learner's ordinary interaction or form a corrected candidate from a new learner input."
  }
  if (code === "cancelled" || code === "interrupted") {
    return "The learner Goals were not changed because the operation did not commit."
  }
  if (code === "source_unavailable") {
    return "The learner Goals were not changed because the exact learner source is no longer available."
  }
  if (code === "stale" || code === "context_refresh_required") {
    return "The learner Goals were not changed because an exact Goal or Course basis changed. Re-read the current Goal state before forming a new candidate."
  }
  if (code === "semantic_conflict") {
    return "That learner input already produced a different durable Goal change. Use a new learner input for a correction."
  }
  if (code === "temporal_context_unavailable") {
    return "The learner Goals were not changed because the requested target could not be interpreted from trusted time context."
  }
  return "The learner Goals were not changed. Clarify the intended Goal meaning, scope, target, or lifecycle change before trying again."
}

function retainedSteeringErrorMessage(code: LearningCommand.ErrorCode) {
  if (code === "temporal_context_unavailable") {
    return "I could not retain that time-bounded instruction because the learner source timezone was unavailable. I will keep the current request current-only; provide a new explicit learning-wide instruction after timezone resolution if you want it retained."
  }
  if (code === "source_unavailable") {
    return "I could not retain that instruction because its exact learner source is no longer available."
  }
  if (code === "permission_rejected" || code === "permission_corrected") {
    return "The retained learning instruction was not changed because effective permission did not authorize it."
  }
  if (code === "cancelled" || code === "interrupted") {
    return "The retained learning instruction was not changed because the operation did not commit."
  }
  if (code === "stale") {
    return "The retained learning instruction changed since this request was formed. Re-read the current policy head before correcting it."
  }
  if (code === "capacity_exceeded") {
    return "The retained learning instructions are at their bounded capacity. Retract or consolidate an existing instruction first."
  }
  if (code === "semantic_conflict") {
    return "That learner source already produced a different retained-steering effect; use a new explicit learner correction."
  }
  return "The retained learning instruction was not changed. Clarify an explicit learning-wide scope and finite offset-bearing end time."
}

function outcomeUnknown(toolID: PrimaryCapability, envelope: TerminalPartEnvelope): ExactResult {
  const presentation = LearningCommandPresentation.unknownResult(toolID, envelope)
  const projected = SemanticPresentation.projectResultBasis(presentation.basis)
  if (!projected) throw new Error("Unknown learning-command outcome has no valid semantic projection")
  return {
    title: projected.title,
    metadata: {
      command: toolID,
      commandVersion: envelope.capabilityVersion ?? capabilityVersion(toolID),
      outcome: "error",
      code: "outcome_unknown" satisfies LearningCommand.ErrorCode,
      durablySettled: projected.durablySettled,
      truncated: false,
      ...SemanticPresentation.metadata(presentation),
    },
    output: JSON.stringify({ outcome: "error", code: "outcome_unknown" }),
  }
}

function isKnownExecutionFailure(error: unknown) {
  return (
    error instanceof LearningCommand.InvocationConflictError ||
    error instanceof LearningCommand.InvocationNotFoundError ||
    error instanceof LearningCommand.InvocationTranscriptUnavailableError ||
    error instanceof LearningCommand.InvalidInvocationEnvelopeError
  )
}

function partEvent(part: SessionV1.ToolPart, time: number) {
  return {
    definition: SessionV1.Event.PartUpdated,
    data: { sessionID: part.sessionID, part, time },
  } as const
}

function noEvent<A>(result: A): EventV2.PreparedTransaction<A, typeof SessionV1.Event.PartUpdated> {
  return { result }
}

function withPartEvent<A>(
  result: A,
  part: SessionV1.ToolPart,
  time: number,
): EventV2.PreparedTransaction<A, typeof SessionV1.Event.PartUpdated> {
  return { result, event: partEvent(part, time) }
}

function readPartRow(tx: EventV2.Transaction, partID: SessionV1.PartID) {
  return tx.select().from(PartTable).where(eq(PartTable.id, partID)).get().pipe(Effect.orDie)
}

function readPart(tx: EventV2.Transaction, partID: SessionV1.PartID) {
  return readPartRow(tx, partID).pipe(
    Effect.flatMap((row) =>
      row
        ? Effect.sync(() => partFromRow(row))
        : Effect.fail(new LearningCommand.InvocationTranscriptUnavailableError({ partID })),
    ),
  )
}

function partFromRow(row: typeof PartTable.$inferSelect): SessionV1.ToolPart {
  return decodePart({
    ...row.data,
    id: row.id,
    messageID: row.message_id,
    sessionID: row.session_id,
  }) as unknown as SessionV1.ToolPart
}

function exactFromPart(part: SessionV1.ToolPart): ExactResult {
  if (part.state.status !== "completed") {
    throw new Error(`Learning Part ${part.id} is not terminal`)
  }
  if (SemanticPresentation.readResult(part, true).type !== "valid") {
    throw new Error(`Learning Part ${part.id} has an invalid semantic result`)
  }
  return {
    title: part.state.title,
    metadata: part.state.metadata,
    output: part.state.output,
  }
}

function assertTerminalPart(
  tx: EventV2.Transaction,
  canonical: Canonical,
  envelope: TerminalPartEnvelope,
  settlement: LearningCommand.Settlement,
) {
  return readPart(tx, envelope.partID).pipe(
    Effect.flatMap((part) =>
      recoveredPartMatches(canonical, envelope, settlement, part) &&
      SemanticPresentation.readResult(part, true).type === "valid"
        ? Effect.succeed(part)
        : Effect.die(`Terminal learning Part ${envelope.partID} diverged from its exact settlement`),
    ),
  )
}

function assertRecoveredTerminalPart(
  tx: EventV2.Transaction,
  canonical: Canonical,
  envelope: TerminalPartEnvelope,
  settlement: LearningCommand.PhysicalSettlement,
) {
  return readPart(tx, envelope.partID).pipe(
    Effect.flatMap((part) =>
      recoveredPartMatches(canonical, envelope, settlement, part) &&
      SemanticPresentation.readResult(part, true).type === "valid"
        ? Effect.succeed(part)
        : Effect.die(`Recovered terminal learning Part ${envelope.partID} diverged from its physical settlement`),
    ),
  )
}

function recoveredPartMatches(
  canonical: Canonical,
  envelope: TerminalPartEnvelope,
  settlement: LearningCommand.PhysicalSettlement,
  part: SessionV1.ToolPart,
) {
  if (part.state.status !== "completed") return false
  const metadata = part.state.metadata
  return (
    part.id === envelope.partID &&
    part.sessionID === envelope.sessionID &&
    part.messageID === envelope.assistantMessageID &&
    part.tool === canonical.toolID &&
    part.callID === envelope.providerCallID &&
    isDeepStrictEqual(part.state.input, canonical.input) &&
    part.state.time.start === envelope.timeAdmitted &&
    part.state.time.end === settlement.settlementTime &&
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    metadata.outcome === settlement.outcome &&
    (settlement.outcome !== "error" || metadata.code === settlement.code)
  )
}

function requireInterruptedSettlement(settlement: LearningCommand.PhysicalSettlement): LearningCommand.ErrorSettlement {
  if (settlement.outcome !== "error" || settlement.code !== "interrupted") {
    throw new Error("New physical recovery did not produce the required interrupted settlement")
  }
  return {
    outcome: "error",
    code: "interrupted",
    settlementTime: settlement.settlementTime,
    settlementOrder: settlement.settlementOrder,
  }
}

function terminalEnvelopeFromPhysical(physical: LearningCommand.PhysicalInvocation): TerminalPartEnvelope {
  return {
    partID: physical.part_id,
    assistantMessageID: physical.assistant_message_id,
    sessionID: physical.session_id,
    providerCallID: physical.provider_call_id,
    capabilityVersion: physical.capability_version,
    timeAdmitted: physical.time_admitted,
  }
}

function assertAdmittedPart(
  tx: EventV2.Transaction,
  canonical: Canonical,
  registration: Registration,
  timeAdmitted: number,
) {
  return Effect.gen(function* () {
    const row = yield* readPartRow(tx, registration.partID)
    if (!row) {
      return yield* new LearningCommand.InvocationTranscriptUnavailableError({ partID: registration.partID })
    }
    if (
      row.time_created <= timeAdmitted &&
      isDeepStrictEqual(invocationPart(partFromRow(row)), invocationPart(pendingPart(canonical, registration)))
    ) {
      return
    }
    return yield* invocationConflict(registration)
  })
}

function invocationPart(part: SessionV1.ToolPart) {
  return {
    id: part.id,
    messageID: part.messageID,
    sessionID: part.sessionID,
    type: part.type,
    tool: part.tool,
    callID: part.callID,
    state: part.state,
  }
}

function requireRegistration(context: ExecuteContext): Registration {
  const value = context.extra?.toolCall
  if (!isRegistration(value)) throw new Error("Learning command is missing its frozen host tool-call registration")
  if (
    context.sessionID !== value.sessionID ||
    context.messageID !== value.assistantMessageID ||
    context.callID !== value.callID
  ) {
    throw new Error("Learning command execution context diverged from its frozen host registration")
  }
  return value
}

function requirePermissionContext(context: ExecuteContext) {
  if (context.interaction) return context.interaction.permission
  const ruleset = context.extra?.permissionRuleset
  if (!Array.isArray(ruleset)) throw new Error("Learning command is missing its trusted permission ruleset")
  return { ruleset: ruleset as PermissionV1.Ruleset, authority: [] as const }
}

function isRegistration(value: unknown): value is Registration {
  if (typeof value !== "object" || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.partID === "string" &&
    typeof item.turnID === "string" &&
    typeof item.inputID === "string" &&
    typeof item.causalOccurrenceID === "string" &&
    typeof item.callID === "string" &&
    typeof item.emissionOrdinal === "number" &&
    typeof item.sessionID === "string" &&
    typeof item.parentUserMessageID === "string" &&
    typeof item.assistantMessageID === "string"
  )
}

function canonicalInput(toolID: PrimaryCapability, input: unknown): Canonical {
  if (
    toolID === LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY ||
    toolID === LearningCommand.UPDATE_LEARNER_RESPONSE_EVIDENCE_CAPABILITY ||
    toolID === LearningCommand.UPDATE_FUTURE_ATTENTION_CAPABILITY
  ) {
    throw new Error("This command uses its dedicated Agent-action admission path")
  }
  if (toolID === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY) {
    return { toolID, input: normalize(input) }
  }
  if (toolID === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
    return { toolID, input: normalizeDefault(input) }
  }
  if (toolID === LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY) {
    return { toolID, input: normalizeSteering(input) }
  }
  if (toolID === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY) {
    return { toolID, input: normalizeLegacyGoals(input) }
  }
  return { toolID, input: normalizeAnchor(input) }
}

function invocationFor(canonical: Canonical, registration: Registration, timeAdmitted: number): Invocation {
  const envelope = {
    occurrenceID: registration.causalOccurrenceID!,
    turnID: registration.turnID,
    inputID: registration.inputID,
    sessionID: registration.sessionID,
    parentUserMessageID: registration.parentUserMessageID,
    assistantMessageID: registration.assistantMessageID,
    partID: registration.partID,
    providerCallID: registration.callID,
    emissionOrdinal: registration.emissionOrdinal,
    capabilityIdentity: canonical.toolID,
    capabilityVersion: canonicalVersion(canonical),
    authorizationBasis: authorizationBasis(canonical),
    timeAdmitted,
  }
  if (canonical.toolID === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY) {
    return { envelope, command: command(canonical.input) }
  }
  if (canonical.toolID === LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY) {
    return { envelope, command: retainedSteeringCommand(canonical.input) }
  }
  if (canonical.toolID === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY) {
    if (canonical.input.authorizationBasis === "learner_acceptance") {
      return {
        envelope: { ...envelope, authorizationBasis: "learner_acceptance" },
        command: learnerGoalCommand(canonical.input),
        permissionRequestID: stableGoalPermissionRequestID(registration),
      } satisfies LearnerGoal.AcceptedInvocation
    }
    return {
      envelope: { ...envelope, authorizationBasis: "learner_request" },
      command: learnerGoalCommand(canonical.input),
    } satisfies LearnerGoal.DirectInvocation
  }
  if (canonical.toolID === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
    return {
      envelope,
      command: defaultCommand(canonical.input),
      permissionRequestID: stableDefaultPermissionRequestID(registration),
    }
  }
  return { envelope, command: anchorCommand(canonical.input) }
}

function stableDefaultPermissionRequestID(registration: Registration) {
  const digest = new Bun.CryptoHasher("sha256")
    .update(
      JSON.stringify({
        command: LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY,
        partID: registration.partID,
        callID: registration.callID,
      }),
    )
    .digest("hex")
  return PermissionV1.ID.ascending(`per_${digest.slice(0, 26)}`)
}

function stableGoalPermissionRequestID(registration: Registration) {
  const digest = new Bun.CryptoHasher("sha256")
    .update(
      JSON.stringify({
        command: LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY,
        partID: registration.partID,
        callID: registration.callID,
      }),
    )
    .digest("hex")
  return PermissionV1.ID.ascending(`per_${digest.slice(0, 26)}`)
}

function reservePrimary(tx: EventV2.Transaction, invocation: Invocation) {
  if (isRetainedSteeringInvocation(invocation)) return LearningCommand.reserveRetainedSteering(tx, invocation)
  if (isLearnerGoalInvocation(invocation)) {
    return LearningCommand.reopenHistoricalLearnerGoalInvocation(tx, invocation)
  }
  return isNavigationInvocation(invocation)
    ? LearningCommand.reserveNavigation(tx, invocation)
    : LearningCommand.reserveAcceptance(tx, invocation)
}

function isRetainedSteeringInvocation(
  invocation: Invocation,
): invocation is LearningCommand.RetainedSteeringInvocation {
  return "action" in invocation.command
}

function isNavigationInvocation(invocation: Invocation): invocation is LearningCommand.NavigationInvocation {
  return "kind" in invocation.command
}

function isLearnerGoalInvocation(invocation: Invocation): invocation is LearnerGoal.Invocation {
  return "operations" in invocation.command
}

function isDefaultNavigationInvocation(
  invocation: LearningCommand.NavigationInvocation,
): invocation is LearningCommand.SetDefaultCoursePreferenceInvocation {
  return invocation.command.kind === "default_course_preference"
}

function navigationMatchesCanonical(invocation: LearningCommand.NavigationInvocation, canonical: Canonical) {
  return invocation.command.kind === "default_course_preference"
    ? canonical.toolID === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY
    : canonical.toolID === LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY
}

function navigationPermissionPattern(invocation: LearningCommand.NavigationInvocation) {
  if (invocation.command.kind === "default_course_preference") {
    return invocation.command.target?.courseID ?? "clear"
  }
  return invocation.command.courseID
}

function isPrimaryCapability(value: string): value is PrimaryCapability {
  return (
    value === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY ||
    value === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY ||
    value === LearningCommand.SET_COURSE_ROUTE_ANCHOR_CAPABILITY ||
    value === LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY ||
    value === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY
  )
}

function capabilityVersion(toolID: PrimaryCapability) {
  if (toolID === LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY) {
    return LearningCommand.ACCEPT_COURSE_VIEW_REVISION_VERSION
  }
  if (toolID === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY) {
    return LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_VERSION
  }
  if (toolID === LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY) {
    return LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_VERSION
  }
  if (toolID === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY) {
    return LearningCommand.UPDATE_LEARNER_GOALS_VERSION
  }
  return LearningCommand.SET_COURSE_ROUTE_ANCHOR_VERSION
}

function canonicalVersion(canonical: Canonical) {
  if (canonical.toolID === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY) {
    return LearningCommand.HISTORICAL_UPDATE_LEARNER_GOALS_VERSION
  }
  return capabilityVersion(canonical.toolID)
}

function authorizationBasis(canonical: Canonical): LearningCommand.AuthorizationBasis {
  if (canonical.toolID === LearningCommand.UPDATE_LEARNER_GOALS_CAPABILITY) {
    return canonical.input.authorizationBasis
  }
  return canonical.toolID === LearningCommand.SET_DEFAULT_COURSE_PREFERENCE_CAPABILITY
    ? "learner_acceptance"
    : "learner_request"
}

function sameRegistration(
  envelope: LearningCommand.InvocationEnvelope,
  registration: Registration,
  canonical: Canonical,
) {
  return (
    envelope.turnID === registration.turnID &&
    envelope.inputID === registration.inputID &&
    envelope.occurrenceID === registration.causalOccurrenceID &&
    envelope.partID === registration.partID &&
    envelope.providerCallID === registration.callID &&
    envelope.emissionOrdinal === registration.emissionOrdinal &&
    envelope.sessionID === registration.sessionID &&
    envelope.parentUserMessageID === registration.parentUserMessageID &&
    envelope.assistantMessageID === registration.assistantMessageID &&
    envelope.capabilityIdentity === canonical.toolID &&
    envelope.capabilityVersion === canonicalVersion(canonical) &&
    envelope.authorizationBasis === authorizationBasis(canonical)
  )
}

function registrationFromEnvelope(envelope: LearningCommand.InvocationEnvelope): Registration {
  return {
    turnID: envelope.turnID,
    inputID: envelope.inputID,
    causalOccurrenceID: envelope.occurrenceID,
    partID: envelope.partID,
    callID: envelope.providerCallID,
    emissionOrdinal: envelope.emissionOrdinal,
    sessionID: envelope.sessionID,
    parentUserMessageID: envelope.parentUserMessageID,
    assistantMessageID: envelope.assistantMessageID,
  }
}

function invocationConflict(registration: Registration) {
  return Effect.fail(
    new LearningCommand.InvocationConflictError({
      partID: registration.partID,
      assistantMessageID: registration.assistantMessageID,
      providerCallID: registration.callID,
    }),
  )
}

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [
    EventV2Bridge.node,
    Permission.node,
    Database.node,
    SessionProjector.node,
    Course.node,
    Artifact.node,
    ContentRoot.node,
    MaterialMap.node,
    MaterialMap.tutorCurrentUseReaderNode,
  ],
})

export * as LearningCommandRuntime from "./runtime"
