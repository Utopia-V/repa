export * as LearningContext from "./learning-context"
export * from "./learning-context/capacity"

import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import type { Turn } from "@opencode-ai/schema/turn"
import { Course } from "./course"
import type { Database } from "./database/database"
import { FutureAttention } from "./future-attention"
import { LearnerGoal } from "./learner-goal"
import { LearnerNavigation } from "./learner-navigation"
import { LearnerResponseEvidence } from "./learner-response-evidence"
import { MaterialMap } from "./material-map"
import type { RetainedSteering } from "./retained-steering"
import type { SessionSchema } from "./session/schema"
import { TurnLearningContext } from "./turn/learning-context"
import { TurnModelOperationTable, TurnUnavailableModelTable } from "./turn/sql"
import type { MessageID } from "./v1/session"
import {
  CAPABILITY_CATALOG_VERSION,
  CutCapacityError,
  CutIntegrityError,
  GATE19_CAPABILITY_CATALOG_VERSION,
  GATE19_LAZY_READ_CAPABILITY_IDS,
  GATE19_POLICY_VERSION,
  GATE19_RENDERER_VERSION,
  LAZY_READ_CAPABILITY_IDS,
  LEGACY_CAPABILITY_CATALOG_VERSION,
  LEGACY_LAZY_READ_CAPABILITY_IDS,
  LEGACY_POLICY_VERSION,
  LEGACY_RENDERER_VERSION,
  MAX_CANONICAL_BYTES,
  MAX_CANDIDATES_PER_FAMILY,
  MAX_ENTRY_BYTES,
  MAX_INTERACTION_CANDIDATES,
  MAX_RENDERED_BYTES,
  POLICY_VERSION,
  RENDERER_VERSION,
  SCHEMA_VERSION,
  boundedValue,
  bindProviderToolSurface,
  canonicalFingerprint,
  canonicalJson,
  hardLimits,
  sha256,
  toJsonValue,
  utf8Bytes,
  type CapabilityBasis,
  type Cut,
  type CutRead,
  type Entry,
  type JsonValue,
  type Operation,
  type Section,
} from "./learning-context/schema"
import { TurnLearningContextCutTable } from "./learning-context/sql"

export * from "./learning-context/schema"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export type Preparation = Readonly<{ cut: Cut; canonicalCut: string; renderedBlock: string }>

export type PrepareInput = Readonly<{
  operation: Operation
  retainedSteering: RetainedSteering.Cut
  capabilityBasis: CapabilityBasis
  learnerResponseEvidenceMaterials?: readonly LearnerResponseEvidence.ContextMaterialResolution[]
}>

const legacyOwners = ["course", "learner_navigation", "learner_goal", "material", "interaction"] as const
const gate19Owners = [...legacyOwners, "learner_response_evidence"] as const
const currentOwners = [...gate19Owners, "future_attention"] as const
const sectionPolicy = {
  course: {
    scope: "eligible_courses_and_structurally_referenced_default",
    selectionBasis: "course_created_time_then_id_not_priority",
  },
  learner_navigation: {
    scope: "default_and_included_course_anchors",
    selectionBasis: "structural_default_then_course_id_not_priority",
  },
  learner_goal: {
    scope: "current_goal_heads",
    selectionBasis: "revision_order_desc_then_goal_id_desc_not_priority",
  },
  material: {
    scope: "alignments_reached_from_included_course_membership",
    selectionBasis: "alignment_created_time_then_id_not_priority",
    notApplicableSelectionBasis: "structural_membership_only_no_global_latest",
  },
  interaction: {
    scope: "terminal_root_turns_outside_current_session",
    selectionBasis: "terminal_time_desc_then_turn_id_desc_not_priority",
  },
  learner_response_evidence: {
    scope: "active_source_deleted_heads_for_structurally_included_course_membership",
    selectionBasis: "subject_source_order_then_record_id_not_priority",
  },
  future_attention: {
    scope: "all_due_open_target_current_concerns_in_learner_home",
    selectionBasis: "not_before_then_created_then_id_non_priority",
  },
} as const
const withheldSelectionBasis = "automatic_context_capability_withheld" as const

export function unavailableCapabilityBasis(): CapabilityBasis {
  const providerToolSurface = bindProviderToolSurface({
    route: {
      runtime: "ai_sdk",
      provider: "unavailable",
      model: "unavailable",
      protocol: "language-model-v3",
      compiler: {
        sourcePackage: "unavailable",
        sourceVersion: "0",
        projector: "unavailable",
        projectorVersion: 1,
        promptFields: [],
        publicQuery: [],
        credentialQuery: [],
        bodyCredentials: [],
        compilerAuth: "api_key",
        terminalRoutes: [],
      },
      transport: {
        method: "POST",
        endpoint: { protocol: "https:", host: "unavailable.invalid", pathname: "/", query: [] },
      },
    },
    toolChoice: { state: "absent" },
    definitions: [],
  })
  return {
    catalogVersion: CAPABILITY_CATALOG_VERSION,
    policyFingerprint: canonicalFingerprint(toJsonValue({ automaticContext: "withheld", lazy: [] })),
    effectiveAutomaticContext: false,
    effectiveLazyReadCapabilities: [],
    effectiveProviderToolSurfaceBinding: providerToolSurface.binding,
  }
}

export function prepareCut(tx: Transaction, input: PrepareInput): Effect.Effect<Preparation, unknown> {
  return Effect.gen(function* () {
    validateInput(input)
    const sections = input.capabilityBasis.effectiveAutomaticContext
      ? yield* projectSections(tx, input)
      : unauthorizedSections()
    return fit({
      schemaVersion: SCHEMA_VERSION,
      policyVersion: POLICY_VERSION,
      rendererVersion: RENDERER_VERSION,
      operation: input.operation,
      cutAsOf: input.retainedSteering.cutAsOf,
      throughSharedFrontier: input.retainedSteering.throughSharedFrontier,
      retainedSteering: {
        assistantMessageID: input.retainedSteering.assistantMessageID,
        cutAsOf: input.retainedSteering.cutAsOf,
        fingerprint: input.retainedSteering.fingerprint,
      },
      capabilityBasis: input.capabilityBasis,
      sections,
    })
  })
}

export function commitCut(tx: Transaction, preparation: Preparation) {
  return Effect.gen(function* () {
    validateStored(preparation.canonicalCut, preparation.renderedBlock, preparation.cut.operation.assistantMessageID)
    const operation = yield* tx
      .select()
      .from(TurnModelOperationTable)
      .where(eq(TurnModelOperationTable.assistant_message_id, preparation.cut.operation.assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (
      !operation ||
      operation.turn_id !== preparation.cut.operation.turnID ||
      operation.session_id !== preparation.cut.operation.sessionID ||
      operation.input_id !== preparation.cut.operation.inputID ||
      (operation.causal_occurrence_id ?? undefined) !== preparation.cut.operation.causalOccurrenceID ||
      operation.ordinal !== preparation.cut.operation.ordinal ||
      operation.retained_steering_cut_fingerprint !== preparation.cut.retainedSteering.fingerprint ||
      operation.retained_steering_cut_as_of !== preparation.cut.cutAsOf ||
      operation.time_admitted !== preparation.cut.cutAsOf ||
      operation.observed_shared_frontier_sequence !== preparation.cut.throughSharedFrontier.sequence ||
      operation.observed_shared_frontier_time !== preparation.cut.throughSharedFrontier.time
    ) {
      return yield* invalid(preparation.cut.operation.assistantMessageID, "model_operation_mismatch")
    }
    yield* tx
      .insert(TurnLearningContextCutTable)
      .values({
        assistant_message_id: preparation.cut.operation.assistantMessageID,
        canonical_cut: preparation.canonicalCut,
        canonical_bytes: preparation.cut.budget.canonicalBytes,
        cut_fingerprint: preparation.cut.fingerprint,
        cut_as_of: preparation.cut.cutAsOf,
        rendered_block: preparation.renderedBlock,
        rendered_bytes: preparation.cut.budget.renderedBytes,
        rendered_fingerprint: preparation.cut.renderedFingerprint,
      })
      .run()
      .pipe(Effect.orDie)
    return preparation
  })
}

export function readCut(tx: Transaction, assistantMessageID: MessageID): Effect.Effect<CutRead, CutIntegrityError> {
  return Effect.gen(function* () {
    const row = yield* tx
      .select()
      .from(TurnLearningContextCutTable)
      .where(eq(TurnLearningContextCutTable.assistant_message_id, assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    if (row) {
      return {
        type: "available" as const,
        cut: validateStored(row.canonical_cut, row.rendered_block, assistantMessageID),
        renderedBlock: row.rendered_block,
      }
    }
    const unavailable = yield* tx
      .select()
      .from(TurnUnavailableModelTable)
      .where(eq(TurnUnavailableModelTable.assistant_message_id, assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    return unavailable
      ? { type: "source_unavailable" as const, assistantMessageID, turnID: unavailable.turn_id }
      : { type: "not_found" as const, assistantMessageID }
  })
}

export function renderCut(cut: Cut) {
  validateCut(cut)
  const value = renderValue(cut)
  if (utf8Bytes(value) !== cut.budget.renderedBytes || sha256(value) !== cut.renderedFingerprint) {
    throw new CutIntegrityError({
      assistantMessageID: cut.operation.assistantMessageID,
      reason: "rendered_block_mismatch",
    })
  }
  return value
}

export function decodeStored(canonicalCut: string, renderedBlock: string, assistantMessageID: MessageID) {
  return validateStored(canonicalCut, renderedBlock, assistantMessageID)
}

export function listLearnerResponseEvidenceRequirements(
  tx: Transaction,
  input: Readonly<{ cutAsOf: number }>,
) {
  return Effect.gen(function* () {
    const structural = yield* structuralContext(tx, input.cutAsOf)
    return yield* LearnerResponseEvidence.listContextRequirements(tx, { endpoints: structural.endpoints })
  })
}

function projectSections(tx: Transaction, input: PrepareInput) {
  return Effect.gen(function* () {
    const { defaultContext, currentDefault, courses, orderedCourses, anchorContexts, anchors, endpoints } =
      yield* structuralContext(tx, input.retainedSteering.cutAsOf)
    const goals = yield* LearnerGoal.projectLearningContext(
      tx,
      input.retainedSteering.cutAsOf,
      MAX_CANDIDATES_PER_FAMILY,
    )
    const materials = yield* MaterialMap.projectLearningContext(tx, {
      endpoints,
      limit: MAX_CANDIDATES_PER_FAMILY,
    })
    const interactions = yield* TurnLearningContext.projectLearningContext(tx, {
      currentSessionID: input.operation.sessionID,
      limit: MAX_INTERACTION_CANDIDATES,
    })
    const lazy = new Set(input.capabilityBasis.effectiveLazyReadCapabilities)
    const learnerResponseEvidence = yield* LearnerResponseEvidence.projectLearningContext(tx, {
      endpoints,
      materials: input.learnerResponseEvidenceMaterials ?? [],
      lazyReadAvailable: lazy.has("learner_response_evidence_read"),
    })
    const futureAttention = yield* FutureAttention.listEligibleForContext(tx, {
      now: input.retainedSteering.cutAsOf,
      limit: MAX_CANDIDATES_PER_FAMILY,
    })
    const courseEntries = orderedCourses.map((value) =>
      value.status === "unavailable"
        ? entry("course", {
            courseID: value.courseID,
            status: "unavailable",
            cause: value.cause,
            lazyReadAvailable: lazy.has("course_query"),
          })
        : entry("course", Course.learningContextLocator(value, lazy.has("course_query")), value),
    )
    const navigationEntries = [
      ...(currentDefault.headID
        ? [
            entry(
              "navigation_default",
              {
                headID: currentDefault.headID,
                version: currentDefault.version,
                courseID: currentDefault.courseID,
                asOf: defaultContext.asOf,
                transition: defaultContext.transition,
                projection: currentDefault,
                lazyReadAvailable: lazy.has("learning_navigation_query"),
              },
              currentDefault,
            ),
          ]
        : []),
      ...anchorContexts.flatMap((context) => {
        const anchor = context.projection
        return anchor.headID
          ? [
              entry(
                "navigation_anchor",
                {
                  courseID: anchor.courseID,
                  headID: anchor.headID,
                  version: anchor.version,
                  asOf: context.asOf,
                  transition: context.transition,
                  projection: anchor,
                  lazyReadAvailable: lazy.has("learning_navigation_query"),
                },
                anchor,
              ),
            ]
          : []
      }),
    ]
    const goalEntries = goals.entries.map((goal) =>
      entry(
        "goal",
        {
          goalID: goal.goalID,
          timeCreated: goal.timeCreated,
          revisionID: goal.head.id,
          version: goal.head.version,
          predecessorID: goal.head.predecessorID ?? null,
          schemaVersion: goal.head.schemaVersion,
          targetVersion: goal.head.targetVersion,
          disposition: goal.head.disposition,
          occurrenceID: goal.head.occurrenceID,
          sourceOrder: goal.head.sourceOrder,
          effectID: goal.head.effectID,
          operationOrdinal: goal.head.operationOrdinal,
          revisionOrder: goal.head.revisionOrder,
          timeCommitted: goal.head.timeCommitted,
          commitOrder: goal.head.commitOrder,
          frontierSequence: goal.head.frontierSequence,
          source: goal.head.source,
          derivedTargetRelation: goal.learningContextDependencies,
          scopeDependencies:
            goal.head.scope.type === "learner_home"
              ? { type: "learner_home" }
              : {
                  type: "courses",
                  courses: goal.head.scope.courses.map((course, index) => ({
                    courseID: course.courseID,
                    admission: course.admission,
                    current: compactCourseDependency(goal.learningContextDependencies.scopeCourses[index]),
                  })),
                },
          fieldOmissions: {
            outcome: exactFieldReference(goal.head.outcome),
            conditions: exactFieldReference(goal.head.conditions),
            scope: exactFieldReference(goal.head.scope),
            target: exactFieldReference(goal.head.target),
            disposition: exactFieldReference(goal.head.disposition),
            ...(goal.head.schemaVersion === 1 ? { fieldBases: exactFieldReference(goal.head.fieldBases) } : {}),
          },
          lazyReadAvailable: lazy.has("learner_goal_query"),
        },
        goal,
      ),
    )
    const materialEntries = materials.entries.map((value) =>
      entry(
        "material",
        MaterialMap.learningContextLocator(value, {
          metadata: lazy.has("learning_material_query"),
          tutor: lazy.has("learning_material_read"),
        }),
        value,
      ),
    )
    const interactionEntries = interactions.entries.map((value) =>
      entry(
        "interaction",
        { ...value.locator, lazyReadAvailable: lazy.has("learning_interaction_read") },
        "navigationHint" in value ? { navigationHint: value.navigationHint } : undefined,
      ),
    )
    const learnerResponseEvidenceEntries = learnerResponseEvidence.entries.map((value) =>
      entry("learner_response_evidence", value.locator, value.semantic),
    )
    const futureAttentionEntries = futureAttention.entries.map((value) =>
      futureAttentionEntry(
        {
          concernID: value.concern.id,
          version: value.concern.current.version,
          headTransitionID: value.concern.current.id,
          lazyReadAvailable: lazy.has("future_attention_read"),
        },
        FutureAttention.semanticValueFor(value.concern.payload, value.sourceAvailability),
        input.operation.assistantMessageID,
      ),
    )
    return [
      section(
        "course",
        sectionPolicy.course.scope,
        sectionPolicy.course.selectionBasis,
        courses.countAtCut,
        courseEntries,
      ),
      section(
        "learner_navigation",
        sectionPolicy.learner_navigation.scope,
        sectionPolicy.learner_navigation.selectionBasis,
        (currentDefault.headID ? 1 : 0) + anchors.filter((anchor) => anchor.headID).length,
        navigationEntries,
      ),
      section(
        "learner_goal",
        sectionPolicy.learner_goal.scope,
        sectionPolicy.learner_goal.selectionBasis,
        goals.countAtCut,
        goalEntries,
      ),
      endpoints.length === 0
        ? {
            owner: "material" as const,
            scope: sectionPolicy.material.scope,
            selectionBasis: sectionPolicy.material.notApplicableSelectionBasis,
            coverage: "not_applicable" as const,
            countAtCut: 0,
            omission: { type: "none" as const },
            entries: [],
          }
        : section(
            "material",
            sectionPolicy.material.scope,
            sectionPolicy.material.selectionBasis,
            materials.countAtCut,
            materialEntries,
          ),
      section(
        "interaction",
        sectionPolicy.interaction.scope,
        sectionPolicy.interaction.selectionBasis,
        interactions.countAtCut,
        interactionEntries,
      ),
      section(
        "learner_response_evidence",
        sectionPolicy.learner_response_evidence.scope,
        sectionPolicy.learner_response_evidence.selectionBasis,
        learnerResponseEvidence.countAtCut,
        learnerResponseEvidenceEntries,
      ),
      section(
        "future_attention",
        sectionPolicy.future_attention.scope,
        sectionPolicy.future_attention.selectionBasis,
        futureAttention.countAtCut,
        futureAttentionEntries,
      ),
    ] satisfies Section[]
  })
}

function structuralContext(tx: Transaction, cutAsOf: number) {
  return Effect.gen(function* () {
    const defaultContext = yield* LearnerNavigation.projectLearningContextDefault(tx, cutAsOf)
    const currentDefault = defaultContext.projection
    const courses = yield* Course.projectLearningContext(tx, {
      limit: MAX_CANDIDATES_PER_FAMILY,
      includeCourseIDs: currentDefault.courseID ? [currentDefault.courseID] : [],
    })
    const defaultCourse = courses.entries.find(
      (entry) => (entry.status === "available" ? entry.course.id : entry.courseID) === currentDefault.courseID,
    )
    const orderedCourses = [
      ...(defaultCourse ? [defaultCourse] : []),
      ...courses.entries
        .filter((entry) => entry !== defaultCourse)
        .slice(0, MAX_CANDIDATES_PER_FAMILY - (defaultCourse ? 1 : 0)),
    ]
    const anchorContexts = yield* Effect.forEach(
      orderedCourses.flatMap((entry) => (entry.status === "available" ? [entry.course.id] : [])),
      (courseID) => LearnerNavigation.projectLearningContextAnchor(tx, courseID, cutAsOf),
    )
    const anchors = anchorContexts.map((context) => context.projection)
    const endpoints = uniqueEndpoints([
      ...orderedCourses.flatMap((entry) =>
        entry.status === "available" && entry.working
          ? entry.working.items.map((item) => ({
              courseID: entry.course.id,
              viewID: entry.working!.view.id,
              revisionID: entry.working!.revision.id,
              itemID: item.itemID,
            }))
          : [],
      ),
      ...anchors.flatMap((anchor) => (anchor.target ? [anchor.target] : [])),
    ])
    return { defaultContext, currentDefault, courses, orderedCourses, anchorContexts, anchors, endpoints }
  })
}

function unauthorizedSections(): readonly Section[] {
  return currentOwners.map((owner) => ({
    owner,
    scope: sectionPolicy[owner].scope,
    selectionBasis: withheldSelectionBasis,
    coverage: "not_authorized",
    countAtCut: "unknown",
    omission: { type: "unknown", reason: "automatic_context_capability_withheld" },
    entries: [],
  }))
}

function entry(kind: Entry["kind"], locator: unknown, semantic?: unknown): Entry {
  const canonicalLocator = toJsonValue(locator)
  if (!jsonObject(canonicalLocator)) {
    throw new Error("Learning-context entry locator must be a JSON object")
  }
  return {
    kind,
    locator: canonicalLocator,
    ...(semantic === undefined ? {} : { semantic: boundedValue(toJsonValue(semantic)) }),
  }
}

function section(
  owner: Section["owner"],
  scope: string,
  selectionBasis: string,
  countAtCut: number,
  entries: readonly Entry[],
): Section {
  const coverage =
    countAtCut === 0
      ? "empty"
      : entries.length < countAtCut
        ? "truncated"
        : entries.some((item) => item.semantic?.state === "locator_only")
          ? "locator_only"
          : "complete"
  return {
    owner,
    scope,
    selectionBasis,
    coverage,
    countAtCut,
    omission:
      entries.length < countAtCut
        ? {
            type: "exact",
            omitted: countAtCut - entries.length,
            reasons: [{ reason: "candidate_limit", omitted: countAtCut - entries.length }],
          }
        : { type: "none" },
    entries,
  }
}

function uniqueEndpoints(input: readonly Course.MembershipEndpoint[]) {
  return [...new Map(input.map((item) => [canonicalJson(toJsonValue(item)), item])).values()].toSorted((left, right) =>
    ordinal(canonicalJson(toJsonValue(left)), canonicalJson(toJsonValue(right))),
  )
}

function exactFieldReference(value: unknown) {
  const canonical = canonicalJson(toJsonValue(value))
  return { canonicalBytes: utf8Bytes(canonical), fingerprint: sha256(canonical) }
}

function compactCourseDependency(value: Course.PreferenceTargetStatus | undefined) {
  if (!value) return { status: "unavailable" as const, cause: "dependency_missing" as const }
  if (value.status === "available") {
    return {
      status: value.status,
      courseID: value.courseID,
      stateVersion: value.stateVersion,
      timeUpdated: value.timeUpdated,
      title: exactFieldReference(value.title),
    }
  }
  return {
    status: value.status,
    courseID: value.courseID,
    cause: value.cause,
    ...(value.cause === "course_withdrawn"
      ? { stateVersion: value.stateVersion, timeUpdated: value.timeUpdated, title: exactFieldReference(value.title) }
      : {}),
  }
}

type CutBase = Omit<Cut, "budget" | "fingerprint" | "renderedFingerprint">
type MutableSection = {
  owner: Section["owner"]
  scope: string
  selectionBasis: string
  coverage: Section["coverage"]
  countAtCut: number | "unknown"
  omission: Section["omission"]
  entries: Entry[]
  candidateCount: number
}

function fit(base: CutBase): Preparation {
  const sections: MutableSection[] = base.sections.map((section) => ({
    ...section,
    entries: [...section.entries],
    candidateCount: section.entries.length,
  }))
  while (true) {
    try {
      return finalize({
        ...base,
        sections: sections.map(({ candidateCount: _, ...section }) => section),
      })
    } catch (error) {
      if (!(error instanceof CutCapacityError)) throw error
      const semantic = lastSemanticValue(sections)
      if (semantic) {
        const current = semantic.section.entries[semantic.index]!
        const value = current.semantic!
        if (value.state !== "value") throw error
        const canonical = canonicalJson(value.value)
        semantic.section.entries[semantic.index] = {
          ...current,
          semantic: {
            state: "locator_only",
            canonicalBytes: utf8Bytes(canonical),
            fingerprint: sha256(canonical),
            reason: "gate18_byte_budget",
          },
        }
        if (semantic.section.coverage === "complete") semantic.section.coverage = "locator_only"
        continue
      }
      const removable = removableEntry(sections)
      if (!removable) throw error
      removable.section.entries.splice(removable.index, 1)
      const section = removable.section
      if (typeof section.countAtCut === "number") {
        section.coverage = "truncated"
        section.omission = exactOmission(section.countAtCut, section.candidateCount, section.entries.length)
      }
    }
  }
}

function removableEntry(sections: MutableSection[]) {
  const candidates = sections.flatMap((section, ownerOrder) =>
    section.entries.flatMap((_, index) => {
      if (section.owner === "future_attention" && section.countAtCut === 1) return []
      if (
        section.owner !== "learner_response_evidence" &&
        section.owner !== "future_attention" &&
        (section.entries.length <= (section.countAtCut === 0 ? 0 : 1) || index === 0)
      )
        return []
      return [
        {
          section,
          index,
          tier:
            section.owner === "future_attention"
              ? 4
              : section.owner === "learner_response_evidence"
                ? 3
                : section.owner === "learner_navigation"
                  ? 1
                  : 2,
          ownerOrder,
        },
      ]
    }),
  )
  return candidates.toSorted(
    (left, right) => right.tier - left.tier || right.index - left.index || right.ownerOrder - left.ownerOrder,
  )[0]
}

function exactOmission(
  countAtCut: number,
  candidateCount: number,
  retainedCount: number,
): Extract<Section["omission"], { type: "exact" }> {
  const candidateOmitted = Math.max(0, countAtCut - candidateCount)
  const budgetOmitted = Math.max(0, candidateCount - retainedCount)
  return {
    type: "exact",
    omitted: candidateOmitted + budgetOmitted,
    reasons: [
      ...(candidateOmitted > 0 ? [{ reason: "candidate_limit" as const, omitted: candidateOmitted }] : []),
      ...(budgetOmitted > 0 ? [{ reason: "gate18_byte_budget" as const, omitted: budgetOmitted }] : []),
    ],
  }
}

function lastSemanticValue(sections: MutableSection[]) {
  for (const section of [...sections].reverse()) {
    if (section.owner === "learner_response_evidence") continue
    if (section.owner === "future_attention" && section.countAtCut === 1) continue
    for (let index = section.entries.length - 1; index >= 0; index--) {
      if (section.entries[index]?.semantic?.state === "value") return { section, index }
    }
  }
}

function finalize(base: CutBase): Preparation {
  const counts = Object.fromEntries(
    currentOwners.map((owner) => [owner, base.sections.find((section) => section.owner === owner)!.entries.length]),
  ) as Record<Section["owner"], number>
  let canonicalBytes = 0
  let renderedBytes = 0
  let cut: Cut | undefined
  let renderedBlock = ""
  for (let attempt = 0; attempt < 8; attempt++) {
    const budget = { canonicalBytes, renderedBytes, entryCounts: counts, hardLimits }
    const fingerprint = canonicalFingerprint(toJsonValue({ ...base, budget }))
    const draft = { ...base, budget, fingerprint, renderedFingerprint: "0".repeat(64) } satisfies Cut
    renderedBlock = renderValue(draft)
    renderedBytes = utf8Bytes(renderedBlock)
    const renderedFingerprint = sha256(renderedBlock)
    const candidate = { ...draft, budget: { ...budget, renderedBytes }, renderedFingerprint } satisfies Cut
    const canonicalCut = canonicalJson(toJsonValue(candidate))
    const nextCanonicalBytes = utf8Bytes(canonicalCut)
    if (nextCanonicalBytes === canonicalBytes && candidate.budget.renderedBytes === renderedBytes) {
      cut = candidate
      break
    }
    canonicalBytes = nextCanonicalBytes
  }
  if (!cut) throw new Error("Learning-context byte accounting did not converge")
  const canonicalCut = canonicalJson(toJsonValue(cut))
  const actualCanonicalBytes = utf8Bytes(canonicalCut)
  if (actualCanonicalBytes > MAX_CANONICAL_BYTES) {
    throw new CutCapacityError({
      assistantMessageID: cut.operation.assistantMessageID,
      boundary: "canonical",
      observedBytes: actualCanonicalBytes,
      ceilingBytes: MAX_CANONICAL_BYTES,
    })
  }
  if (cut.budget.renderedBytes > MAX_RENDERED_BYTES) {
    throw new CutCapacityError({
      assistantMessageID: cut.operation.assistantMessageID,
      boundary: "rendered",
      observedBytes: cut.budget.renderedBytes,
      ceilingBytes: MAX_RENDERED_BYTES,
    })
  }
  validateStored(canonicalCut, renderedBlock, cut.operation.assistantMessageID)
  return { cut, canonicalCut, renderedBlock }
}

function renderValue(cut: Cut) {
  if (cut.policyVersion === POLICY_VERSION && cut.rendererVersion === RENDERER_VERSION) {
    return renderGate20Value(cut)
  }
  return renderFrozenValue(cut)
}

function renderFrozenValue(cut: Cut) {
  return [
    "[Repa learning context — protected]",
    `schemaVersion: ${cut.schemaVersion}; policyVersion: ${cut.policyVersion}; rendererVersion: ${cut.rendererVersion}`,
    `cutFingerprint: ${cut.fingerprint}`,
    `cutAsOf: ${cut.cutAsOf}; throughSharedFrontier: ${canonicalJson(toJsonValue(cut.throughSharedFrontier))}`,
    `retainedSteering: ${canonicalJson(toJsonValue(cut.retainedSteering))}`,
    `capabilityBasis: ${canonicalJson(
      toJsonValue({
        catalogVersion: cut.capabilityBasis.catalogVersion,
        policyFingerprint: cut.capabilityBasis.policyFingerprint,
        effectiveAutomaticContext: cut.capabilityBasis.effectiveAutomaticContext,
        effectiveLazyReadCapabilities: cut.capabilityBasis.effectiveLazyReadCapabilities,
        providerToolSurface: cut.capabilityBasis.effectiveProviderToolSurfaceBinding,
      }),
    )}`,
    `sections (canonical order is not priority): ${canonicalJson(toJsonValue(cut.sections))}`,
    "This is a bounded observation condition for this sample, not learning truth, priority, mastery, progress, or a selected Tutor move. Use exact owner reads when available; never infer missing detail or authorization from a locator.",
    "[/Repa learning context]",
  ].join("\n")
}

function renderGate20Value(cut: Cut) {
  const section = cut.sections.find((item) => item.owner === "future_attention")!
  const futureAttention =
    section.coverage === "not_authorized"
      ? "futureAttention: automatic contribution withheld by the effective capability basis."
      : section.countAtCut === 0
        ? "futureAttention: none eligible at this immutable cut."
        : section.countAtCut === 1
          ? "futureAttention: conditional_default. The exact current learner request overrides an overlapping present action; otherwise realize the sole complete concern naturally. Do not narrate concern IDs, lifecycle labels, precedence machinery, or internal control vocabulary. Override alone does not serve, dismiss, or otherwise mutate the concern."
          : `futureAttention: multiple_unresolved; exactEligibleCount=${section.countAtCut}. Candidate order is deterministic storage order, never priority. Honor an exact current learner request; otherwise make a transparent reversible local choice or ask a learning-level clarification when the difference matters. Do not claim the program selected the first row or ask the learner to manage internal IDs/state.`
  return [
    "[Repa learning context — protected]",
    `schemaVersion: ${cut.schemaVersion}; policyVersion: ${cut.policyVersion}; rendererVersion: ${cut.rendererVersion}`,
    `cutFingerprint: ${cut.fingerprint}`,
    `cutAsOf: ${cut.cutAsOf}; throughSharedFrontier: ${canonicalJson(toJsonValue(cut.throughSharedFrontier))}`,
    `retainedSteering: ${canonicalJson(toJsonValue(cut.retainedSteering))}`,
    `capabilityBasis: ${canonicalJson(
      toJsonValue({
        catalogVersion: cut.capabilityBasis.catalogVersion,
        policyFingerprint: cut.capabilityBasis.policyFingerprint,
        effectiveAutomaticContext: cut.capabilityBasis.effectiveAutomaticContext,
        effectiveLazyReadCapabilities: cut.capabilityBasis.effectiveLazyReadCapabilities,
        providerToolSurface: cut.capabilityBasis.effectiveProviderToolSurfaceBinding,
      }),
    )}`,
    futureAttention,
    "Future attention is a conditional default, not service, evidence, mastery, progress, priority, or a durable selected Tutor move.",
    `sections (canonical order is not priority): ${canonicalJson(toJsonValue(cut.sections))}`,
    "This is a bounded observation condition for this sample, not learning truth, priority, mastery, progress, or a selected Tutor move. Use exact owner reads when available; never infer missing detail or authorization from a locator.",
    "[/Repa learning context]",
  ].join("\n")
}

function validateStored(canonicalCut: string, renderedBlock: string, assistantMessageID: MessageID) {
  let parsed: unknown
  try {
    parsed = JSON.parse(canonicalCut)
  } catch {
    throw new CutIntegrityError({ assistantMessageID, reason: "canonical_json_invalid" })
  }
  if (canonicalJson(toJsonValue(parsed)) !== canonicalCut) {
    throw new CutIntegrityError({ assistantMessageID, reason: "canonical_json_not_canonical" })
  }
  const cut = parsed as Cut
  validateCut(cut)
  if (cut.operation.assistantMessageID !== assistantMessageID) {
    throw new CutIntegrityError({ assistantMessageID, reason: "assistant_message_mismatch" })
  }
  if (utf8Bytes(canonicalCut) !== cut.budget.canonicalBytes || utf8Bytes(renderedBlock) !== cut.budget.renderedBytes) {
    throw new CutIntegrityError({ assistantMessageID, reason: "byte_count_mismatch" })
  }
  const expectedFingerprint = canonicalFingerprint(
    toJsonValue({
      schemaVersion: cut.schemaVersion,
      policyVersion: cut.policyVersion,
      rendererVersion: cut.rendererVersion,
      operation: cut.operation,
      cutAsOf: cut.cutAsOf,
      throughSharedFrontier: cut.throughSharedFrontier,
      retainedSteering: cut.retainedSteering,
      capabilityBasis: cut.capabilityBasis,
      sections: cut.sections,
      budget: cut.budget,
    }),
  )
  if (
    expectedFingerprint !== cut.fingerprint ||
    renderValue(cut) !== renderedBlock ||
    sha256(renderedBlock) !== cut.renderedFingerprint
  ) {
    throw new CutIntegrityError({ assistantMessageID, reason: "fingerprint_or_render_mismatch" })
  }
  return cut
}

function validateCut(cut: Cut) {
  const id = typeof cut?.operation?.assistantMessageID === "string" ? cut.operation.assistantMessageID : "unknown"
  const expectedOwners =
    cut.policyVersion === LEGACY_POLICY_VERSION && cut.rendererVersion === LEGACY_RENDERER_VERSION
      ? legacyOwners
      : cut.policyVersion === GATE19_POLICY_VERSION && cut.rendererVersion === GATE19_RENDERER_VERSION
        ? gate19Owners
        : cut.policyVersion === POLICY_VERSION && cut.rendererVersion === RENDERER_VERSION
          ? currentOwners
          : undefined
  if (
    !record(cut) ||
    !keys(cut, [
      "schemaVersion",
      "policyVersion",
      "rendererVersion",
      "operation",
      "cutAsOf",
      "throughSharedFrontier",
      "retainedSteering",
      "capabilityBasis",
      "sections",
      "budget",
      "fingerprint",
      "renderedFingerprint",
    ]) ||
    cut.schemaVersion !== SCHEMA_VERSION ||
    !expectedOwners ||
    !integer(cut.cutAsOf) ||
    !digest(cut.fingerprint) ||
    !digest(cut.renderedFingerprint) ||
    !operation(cut.operation) ||
    !frontier(cut.throughSharedFrontier) ||
    cut.cutAsOf < cut.throughSharedFrontier.time ||
    !retained(cut.retainedSteering, cut) ||
    !capability(
      cut.capabilityBasis,
      cut.policyVersion === LEGACY_POLICY_VERSION
        ? LEGACY_CAPABILITY_CATALOG_VERSION
        : cut.policyVersion === GATE19_POLICY_VERSION
          ? GATE19_CAPABILITY_CATALOG_VERSION
          : CAPABILITY_CATALOG_VERSION,
    ) ||
    !Array.isArray(cut.sections) ||
    cut.sections.length !== expectedOwners.length ||
    cut.sections.some((section, index) => !sectionShape(section, expectedOwners[index]!)) ||
    !sectionSetSemantics(cut) ||
    !capabilitySectionRelations(cut) ||
    !budgetShape(cut, expectedOwners)
  ) {
    throw new CutIntegrityError({ assistantMessageID: id, reason: "malformed_cut" })
  }
}

function validateInput(input: PrepareInput) {
  if (!operation(input.operation))
    throw new CutIntegrityError({ assistantMessageID: "unknown", reason: "operation_invalid" })
  if (
    input.retainedSteering.assistantMessageID !== input.operation.assistantMessageID ||
    input.retainedSteering.cutAsOf < input.retainedSteering.throughSharedFrontier.time ||
    !capability(input.capabilityBasis, CAPABILITY_CATALOG_VERSION)
  ) {
    throw new CutIntegrityError({ assistantMessageID: input.operation.assistantMessageID, reason: "basis_invalid" })
  }
}

function operation(value: unknown): value is Operation {
  return (
    record(value) &&
    keys(value, [
      "sessionID",
      "turnID",
      "inputID",
      "assistantMessageID",
      "ordinal",
      ...(value.causalOccurrenceID === undefined ? [] : ["causalOccurrenceID"]),
    ]) &&
    [value.sessionID, value.turnID, value.inputID, value.assistantMessageID].every(
      (item) => typeof item === "string" && item.length > 0,
    ) &&
    (value.causalOccurrenceID === undefined ||
      (typeof value.causalOccurrenceID === "string" && value.causalOccurrenceID.length > 0)) &&
    integer(value.ordinal)
  )
}

function frontier(value: unknown): value is Cut["throughSharedFrontier"] {
  return record(value) && keys(value, ["sequence", "time"]) && integer(value.sequence) && integer(value.time)
}

function retained(value: unknown, cut: Cut) {
  return (
    record(value) &&
    keys(value, ["assistantMessageID", "cutAsOf", "fingerprint"]) &&
    value.assistantMessageID === cut.operation.assistantMessageID &&
    value.cutAsOf === cut.cutAsOf &&
    digest(value.fingerprint)
  )
}

function capability(
  value: unknown,
  expectedCatalogVersion:
    | typeof LEGACY_CAPABILITY_CATALOG_VERSION
    | typeof GATE19_CAPABILITY_CATALOG_VERSION
    | typeof CAPABILITY_CATALOG_VERSION,
): value is CapabilityBasis {
  const catalog =
    expectedCatalogVersion === LEGACY_CAPABILITY_CATALOG_VERSION
      ? LEGACY_LAZY_READ_CAPABILITY_IDS
      : expectedCatalogVersion === GATE19_CAPABILITY_CATALOG_VERSION
        ? GATE19_LAZY_READ_CAPABILITY_IDS
        : LAZY_READ_CAPABILITY_IDS
  if (
    !record(value) ||
    !keys(value, [
      "catalogVersion",
      "policyFingerprint",
      "effectiveAutomaticContext",
      "effectiveLazyReadCapabilities",
      "effectiveProviderToolSurfaceBinding",
    ]) ||
    value.catalogVersion !== expectedCatalogVersion ||
    !digest(value.policyFingerprint) ||
    typeof value.effectiveAutomaticContext !== "boolean" ||
    !Array.isArray(value.effectiveLazyReadCapabilities) ||
    !value.effectiveLazyReadCapabilities.every((item) => catalog.some((id) => id === item)) ||
    !catalogOrderedSubset(value.effectiveLazyReadCapabilities, catalog)
  )
    return false
  const surface = value.effectiveProviderToolSurfaceBinding
  const choice = record(surface) && record(surface.toolChoice) ? surface.toolChoice : undefined
  const definitionIDs =
    record(surface) && Array.isArray(surface.definitions)
      ? new Set(surface.definitions.flatMap((item) => (record(item) && typeof item.id === "string" ? [item.id] : [])))
      : new Set<string>()
  const effectiveLazyReadCapabilities = catalog.filter((id) => definitionIDs.has(id))
  return (
    record(surface) &&
    keys(surface, [
      "route",
      "toolChoice",
      "definitions",
      "definitionCount",
      "combinedFingerprint",
      "combinedCanonicalBytes",
      "fingerprint",
    ]) &&
    routeIdentity(surface.route) &&
    binding(surface.toolChoice, true) &&
    Array.isArray(surface.definitions) &&
    surface.definitions.every((item) => binding(item, false)) &&
    unique(surface.definitions.map((item) => item.id)) &&
    surface.definitionCount === surface.definitions.length &&
    digest(surface.combinedFingerprint) &&
    integer(surface.combinedCanonicalBytes) &&
    surface.combinedCanonicalBytes > 0 &&
    !!choice &&
    utf8Bytes(canonicalJson(choice.value as JsonValue)) === choice.canonicalBytes &&
    canonicalFingerprint(choice.value as JsonValue) === choice.fingerprint &&
    digest(surface.fingerprint) &&
    canonicalFingerprint(
      toJsonValue(Object.fromEntries(Object.entries(surface).filter(([key]) => key !== "fingerprint"))),
    ) === surface.fingerprint &&
    value.effectiveLazyReadCapabilities.length === effectiveLazyReadCapabilities.length &&
    value.effectiveLazyReadCapabilities.every((id, index) => id === effectiveLazyReadCapabilities[index])
  )
}

function binding(value: unknown, choice: boolean) {
  return (
    record(value) &&
    keys(value, choice ? ["value", "canonicalBytes", "fingerprint"] : ["id", "canonicalBytes", "fingerprint"]) &&
    (choice || (typeof value.id === "string" && value.id.length > 0)) &&
    integer(value.canonicalBytes) &&
    value.canonicalBytes > 0 &&
    digest(value.fingerprint) &&
    (!choice || (json(value.value) && toolChoiceValue(value.value)))
  )
}

function toolChoiceValue(value: unknown) {
  return (
    record(value) &&
    ((value.state === "absent" && keys(value, ["state"])) ||
      (value.state === "present" && keys(value, ["state", "value"]) && json(value.value)))
  )
}

function routeIdentity(value: unknown) {
  if (!record(value)) return false
  if (value.runtime === "ai_sdk") {
    return (
      keys(value, ["runtime", "provider", "model", "protocol", "compiler", "transport"]) &&
      value.protocol === "language-model-v3" &&
      [value.provider, value.model].every(nonempty) &&
      compilerIdentity(value.compiler) &&
      transportIdentity(value.transport)
    )
  }
  return (
    value.runtime === "native" &&
    keys(value, ["runtime", "provider", "model", "route", "protocol", "compiler", "transport"]) &&
    [value.provider, value.model, value.route, value.protocol].every(nonempty) &&
    compilerIdentity(value.compiler) &&
    transportIdentity(value.transport)
  )
}

function compilerIdentity(value: unknown) {
  return (
    record(value) &&
    keys(value, [
      "sourcePackage",
      "sourceVersion",
      "projector",
      "projectorVersion",
      "promptFields",
      "publicQuery",
      "credentialQuery",
      "bodyCredentials",
      "compilerAuth",
      "terminalRoutes",
    ]) &&
    [value.sourcePackage, value.sourceVersion, value.projector].every(nonempty) &&
    integer(value.projectorVersion) &&
    value.projectorVersion > 0 &&
    [value.promptFields, value.publicQuery, value.credentialQuery, value.terminalRoutes].every(
      (item) => Array.isArray(item) && item.every(nonempty) && unique(item),
    ) &&
    Array.isArray(value.bodyCredentials) &&
    value.bodyCredentials.every(
      (item) => typeof item === "string" && ["gateway_call_options", "openai_hosted_mcp"].includes(item),
    ) &&
    unique(value.bodyCredentials) &&
    ["api_key", "bedrock_bearer", "vertex_api_key", "vertex_anthropic_token", "gateway_api_key"].includes(
      String(value.compilerAuth),
    )
  )
}

function transportIdentity(value: unknown) {
  if (!record(value) || !keys(value, ["method", "endpoint"]) || !nonempty(value.method) || !record(value.endpoint)) {
    return false
  }
  const endpoint = value.endpoint
  return (
    keys(endpoint, ["protocol", "host", "pathname", "query"]) &&
    [endpoint.protocol, endpoint.host, endpoint.pathname].every(nonempty) &&
    Array.isArray(endpoint.query) &&
    endpoint.query.every(
      (item) =>
        record(item) &&
        ((item.state === "credential" && keys(item, ["key", "state"]) && nonempty(item.key)) ||
          (item.state === "value" &&
            keys(item, ["key", "state", "value"]) &&
            nonempty(item.key) &&
            typeof item.value === "string")),
    )
  )
}

function sectionShape(value: unknown, owner: Section["owner"]): value is Section {
  return (
    record(value) &&
    keys(value, ["owner", "scope", "selectionBasis", "coverage", "countAtCut", "omission", "entries"]) &&
    value.owner === owner &&
    value.scope === sectionPolicy[owner].scope &&
    sectionSelectionBasis(value, owner) &&
    ["complete", "truncated", "locator_only", "empty", "unavailable", "not_authorized", "not_applicable"].includes(
      String(value.coverage),
    ) &&
    (value.countAtCut === "unknown" || integer(value.countAtCut)) &&
    omission(value.omission) &&
    Array.isArray(value.entries) &&
    value.entries.every(entryShape) &&
    value.entries.every((entry) => entryOwner(entry, owner)) &&
    sectionAlgebra(value as unknown as Section) &&
    value.entries.length <= sectionLimit(owner)
  )
}

function sectionSelectionBasis(value: Record<string, unknown>, owner: Section["owner"]) {
  if (value.coverage === "not_authorized") return value.selectionBasis === withheldSelectionBasis
  if (owner === "material" && value.coverage === "not_applicable") {
    return value.selectionBasis === sectionPolicy.material.notApplicableSelectionBasis
  }
  return value.selectionBasis === sectionPolicy[owner].selectionBasis
}

function sectionSetSemantics(cut: Cut) {
  if (!cut.capabilityBasis.effectiveAutomaticContext) {
    return cut.sections.every(
      (section) =>
        section.coverage === "not_authorized" &&
        section.countAtCut === "unknown" &&
        section.entries.length === 0 &&
        section.omission.type === "unknown" &&
        section.omission.reason === "automatic_context_capability_withheld",
    )
  }
  return (
    cut.sections.every((section) => section.coverage !== "not_authorized") &&
    (cut.policyVersion !== POLICY_VERSION || futureAttentionSectionSemantics(cut))
  )
}

function futureAttentionSectionSemantics(cut: Cut) {
  const section = cut.sections.find((item) => item.owner === "future_attention")
  if (!section || typeof section.countAtCut !== "number") return false
  if (section.countAtCut === 0) return section.entries.length === 0
  if (section.countAtCut === 1) {
    return section.coverage === "complete" && section.entries.length === 1 && section.entries[0]?.semantic?.state === "value"
  }
  return section.entries.length <= section.countAtCut
}

function capabilitySectionRelations(cut: Cut) {
  const capabilities = new Set(cut.capabilityBasis.effectiveLazyReadCapabilities)
  return cut.sections.every((section) =>
    section.entries.every((entry) => {
      if (entry.kind === "course") return entry.locator.lazyReadAvailable === capabilities.has("course_query")
      if (entry.kind === "navigation_default" || entry.kind === "navigation_anchor")
        return entry.locator.lazyReadAvailable === capabilities.has("learning_navigation_query")
      if (entry.kind === "goal") return entry.locator.lazyReadAvailable === capabilities.has("learner_goal_query")
      if (entry.kind === "material")
        return (
          entry.locator.metadataReadAvailable === capabilities.has("learning_material_query") &&
          entry.locator.tutorReadAvailable === capabilities.has("learning_material_read")
        )
      if (entry.kind === "learner_response_evidence") {
        return entry.locator.lazyReadAvailable === capabilities.has("learner_response_evidence_read")
      }
      if (entry.kind === "future_attention") {
        return entry.locator.lazyReadAvailable === capabilities.has("future_attention_read")
      }
      return entry.locator.lazyReadAvailable === capabilities.has("learning_interaction_read")
    }),
  )
}

function sectionAlgebra(section: Section) {
  if (section.coverage === "not_authorized") {
    return section.countAtCut === "unknown" && section.entries.length === 0 && section.omission.type === "unknown"
  }
  if (section.coverage === "not_applicable" || section.coverage === "empty") {
    return section.countAtCut === 0 && section.entries.length === 0 && section.omission.type === "none"
  }
  if (section.coverage === "unavailable") {
    return section.omission.type === "unknown" && section.entries.length === 0
  }
  if (typeof section.countAtCut !== "number") return false
  if (section.coverage === "truncated") {
    return (
      section.countAtCut > section.entries.length &&
      section.omission.type === "exact" &&
      section.omission.omitted === section.countAtCut - section.entries.length &&
      section.omission.omitted > 0 &&
      section.omission.reasons.reduce((total, reason) => total + reason.omitted, 0) === section.omission.omitted
    )
  }
  if (section.countAtCut !== section.entries.length || section.omission.type !== "none") return false
  if (section.coverage === "locator_only") {
    return section.entries.some((entry) => entry.semantic?.state === "locator_only")
  }
  return section.coverage === "complete" && section.entries.every((entry) => entry.semantic?.state !== "locator_only")
}

function entryOwner(entry: Entry, owner: Section["owner"]) {
  if (owner === "course") return entry.kind === "course"
  if (owner === "learner_navigation") return entry.kind === "navigation_default" || entry.kind === "navigation_anchor"
  if (owner === "learner_goal") return entry.kind === "goal"
  return entry.kind === owner
}

function sectionLimit(owner: Section["owner"]) {
  if (owner === "interaction") return MAX_INTERACTION_CANDIDATES
  if (owner === "learner_navigation") return MAX_CANDIDATES_PER_FAMILY + 1
  return MAX_CANDIDATES_PER_FAMILY
}

function entryShape(value: unknown): value is Entry {
  return (
    record(value) &&
    keys(value, ["kind", "locator", ...(value.semantic === undefined ? [] : ["semantic"])]) &&
    [
      "course",
      "navigation_default",
      "navigation_anchor",
      "goal",
      "material",
      "interaction",
      "learner_response_evidence",
      "future_attention",
    ].includes(
      String(value.kind),
    ) &&
    record(value.locator) &&
    json(value.locator) &&
    locatorShape(value.kind as Entry["kind"], value.locator) &&
    (value.semantic === undefined || bounded(value.semantic)) &&
    interactionSemantic(value.kind as Entry["kind"], value.semantic) &&
    learnerResponseEvidenceSemantic(value.kind as Entry["kind"], value.semantic) &&
    futureAttentionSemantic(value.kind as Entry["kind"], value.semantic)
  )
}

function locatorShape(kind: Entry["kind"], value: Record<string, unknown>) {
  if (kind === "course") return courseLocator(value)
  if (kind === "navigation_default" || kind === "navigation_anchor") return navigationLocator(kind, value)
  if (kind === "goal") return goalLocator(value)
  if (kind === "material") return materialLocator(value)
  if (kind === "learner_response_evidence") return learnerResponseEvidenceLocator(value)
  if (kind === "future_attention") return futureAttentionLocator(value)
  return interactionLocator(value)
}

function futureAttentionLocator(value: Record<string, unknown>) {
  return (
    keys(value, ["concernID", "version", "headTransitionID", "lazyReadAvailable"]) &&
    typeof value.concernID === "string" &&
    /^fac_[0-9A-Za-z]{26}$/.test(value.concernID) &&
    integer(value.version) &&
    typeof value.headTransitionID === "string" &&
    /^fat_[0-9A-Za-z]{26}$/.test(value.headTransitionID) &&
    typeof value.lazyReadAvailable === "boolean"
  )
}

function courseLocator(value: Record<string, unknown>) {
  if (value.status === "unavailable") {
    return (
      keys(value, ["courseID", "status", "cause", "lazyReadAvailable"]) &&
      nonempty(value.courseID) &&
      value.cause === "course_not_found" &&
      typeof value.lazyReadAvailable === "boolean"
    )
  }
  return (
    keys(value, [
      "courseID",
      "stateVersion",
      "selectionRevisionID",
      "selectionVersion",
      "workingViewID",
      "workingViewVersion",
      "workingRevisionID",
      "workingRevisionNumber",
      "workingRevisionVersion",
      "predecessorRevisionID",
      "itemIDs",
      "itemCountAtCut",
      "lazyReadAvailable",
    ]) &&
    Schema.is(Course.CourseID)(value.courseID) &&
    integer(value.stateVersion) &&
    (value.selectionRevisionID === null || Schema.is(Course.RevisionID)(value.selectionRevisionID)) &&
    integer(value.selectionVersion) &&
    (value.workingViewID === null || Schema.is(Course.ViewID)(value.workingViewID)) &&
    nullableInteger(value.workingViewVersion) &&
    (value.workingRevisionID === null || Schema.is(Course.RevisionID)(value.workingRevisionID)) &&
    nullableInteger(value.workingRevisionNumber) &&
    nullableInteger(value.workingRevisionVersion) &&
    (value.predecessorRevisionID === null || Schema.is(Course.RevisionID)(value.predecessorRevisionID)) &&
    Array.isArray(value.itemIDs) &&
    value.itemIDs.every(Schema.is(Course.ItemID)) &&
    unique(value.itemIDs) &&
    integer(value.itemCountAtCut) &&
    value.itemCountAtCut >= value.itemIDs.length &&
    typeof value.lazyReadAvailable === "boolean" &&
    ((value.workingRevisionID === null &&
      value.workingViewID === null &&
      value.workingRevisionNumber === null &&
      value.workingRevisionVersion === null &&
      value.workingViewVersion === null &&
      value.predecessorRevisionID === null &&
      value.itemIDs.length === 0 &&
      value.itemCountAtCut === 0) ||
      (Schema.is(Course.RevisionID)(value.workingRevisionID) &&
        value.workingRevisionID === value.selectionRevisionID &&
        Schema.is(Course.ViewID)(value.workingViewID) &&
        integer(value.workingViewVersion) &&
        integer(value.workingRevisionNumber) &&
        value.workingRevisionNumber >= 1 &&
        integer(value.workingRevisionVersion) &&
        ((value.workingRevisionNumber === 1 && value.predecessorRevisionID === null) ||
          (value.workingRevisionNumber > 1 && Schema.is(Course.RevisionID)(value.predecessorRevisionID)))))
  )
}

function navigationLocator(kind: "navigation_default" | "navigation_anchor", value: Record<string, unknown>) {
  const expected = [
    ...(kind === "navigation_anchor" ? ["courseID"] : []),
    "headID",
    "version",
    ...(kind === "navigation_default" && value.courseID !== undefined ? ["courseID"] : []),
    "asOf",
    "transition",
    "projection",
    "lazyReadAvailable",
  ]
  if (
    !keys(value, expected) ||
    !nonempty(value.headID) ||
    !integer(value.version) ||
    !integer(value.asOf) ||
    !record(value.transition) ||
    !record(value.projection) ||
    typeof value.lazyReadAvailable !== "boolean" ||
    value.transition.id !== value.headID ||
    value.transition.version !== value.version ||
    value.projection.headID !== value.headID ||
    value.projection.version !== value.version
  )
    return false
  if (kind === "navigation_anchor") {
    return (
      nonempty(value.courseID) &&
      value.transition.courseID === value.courseID &&
      value.projection.courseID === value.courseID &&
      transitionShape(value.transition, true)
    )
  }
  return (
    (value.courseID === undefined || nonempty(value.courseID)) &&
    value.projection.courseID === value.courseID &&
    transitionShape(value.transition, false)
  )
}

function transitionShape(value: Record<string, unknown>, anchor: boolean) {
  const expected = anchor
    ? [
        "id",
        "courseID",
        "version",
        ...(value.predecessorID === undefined ? [] : ["predecessorID"]),
        ...(value.previous === undefined ? [] : ["previous"]),
        ...(value.target === undefined ? [] : ["target"]),
        "occurrenceID",
        "timeCommitted",
        "commitOrder",
        "frontier",
      ]
    : [
        "id",
        "version",
        ...(value.predecessorID === undefined ? [] : ["predecessorID"]),
        ...(value.previousCourseID === undefined ? [] : ["previousCourseID"]),
        ...(value.courseID === undefined ? [] : ["courseID"]),
        "occurrenceID",
        ...(value.target === undefined ? [] : ["target"]),
        "timeCommitted",
        "commitOrder",
        "frontier",
      ]
  return (
    keys(value, expected) &&
    nonempty(value.id) &&
    integer(value.version) &&
    nonempty(value.occurrenceID) &&
    integer(value.timeCommitted) &&
    integer(value.commitOrder) &&
    frontier(value.frontier) &&
    (value.predecessorID === undefined || nonempty(value.predecessorID)) &&
    (value.target === undefined || (record(value.target) && json(value.target))) &&
    (!anchor || nonempty(value.courseID))
  )
}

function goalLocator(value: Record<string, unknown>) {
  const expected = [
    "goalID",
    "timeCreated",
    "revisionID",
    "version",
    "predecessorID",
    "schemaVersion",
    "targetVersion",
    "disposition",
    "occurrenceID",
    "sourceOrder",
    "effectID",
    "operationOrdinal",
    "revisionOrder",
    "timeCommitted",
    "commitOrder",
    "frontierSequence",
    "source",
    "derivedTargetRelation",
    "scopeDependencies",
    "fieldOmissions",
    "lazyReadAvailable",
  ]
  if (
    !keys(value, expected) ||
    ![value.goalID, value.revisionID, value.occurrenceID, value.effectID].every(nonempty) ||
    ![
      value.timeCreated,
      value.version,
      value.schemaVersion,
      value.targetVersion,
      value.sourceOrder,
      value.operationOrdinal,
      value.revisionOrder,
      value.timeCommitted,
      value.commitOrder,
      value.frontierSequence,
    ].every(integer) ||
    !nullableString(value.predecessorID) ||
    !record(value.source) ||
    !record(value.derivedTargetRelation) ||
    !keys(value.derivedTargetRelation, ["asOf", "target", "targetRelation", "scopeCourses"]) ||
    !integer(value.derivedTargetRelation.asOf) ||
    !Array.isArray(value.derivedTargetRelation.scopeCourses) ||
    !record(value.scopeDependencies) ||
    !scopeDependencies(value.scopeDependencies) ||
    !record(value.fieldOmissions) ||
    !fieldOmissions(value.fieldOmissions, value.schemaVersion) ||
    typeof value.lazyReadAvailable !== "boolean"
  )
    return false
  return json(value.disposition) && json(value.source) && json(value.derivedTargetRelation.target)
}

function scopeDependencies(value: Record<string, unknown>) {
  if (value.type === "learner_home") return keys(value, ["type"])
  return (
    value.type === "courses" &&
    keys(value, ["type", "courses"]) &&
    Array.isArray(value.courses) &&
    value.courses.every(
      (course) =>
        record(course) &&
        keys(course, ["courseID", "admission", "current"]) &&
        nonempty(course.courseID) &&
        json(course.admission) &&
        json(course.current),
    )
  )
}

function fieldOmissions(value: Record<string, unknown>, schemaVersion: unknown) {
  const expected = [
    "outcome",
    "conditions",
    "scope",
    "target",
    "disposition",
    ...(schemaVersion === 1 ? ["fieldBases"] : []),
  ]
  return keys(value, expected) && Object.values(value).every(exactReference)
}

function materialLocator(value: Record<string, unknown>) {
  if (
    !keys(value, ["alignment", "map", "selector", "target", "metadataReadAvailable", "tutorReadAvailable"]) ||
    !record(value.alignment) ||
    !materialAlignment(value.alignment) ||
    !record(value.map) ||
    !materialMap(value.map) ||
    !record(value.selector) ||
    !materialSelector(value.selector) ||
    !record(value.target) ||
    !materialTarget(value.target) ||
    typeof value.metadataReadAvailable !== "boolean" ||
    typeof value.tutorReadAvailable !== "boolean"
  )
    return false
  return true
}

function materialAlignment(value: Record<string, unknown>) {
  return (
    keys(value, ["id", "disposition", "superseded", "membership"]) &&
    nonempty(value.id) &&
    disposition(value.disposition) &&
    typeof value.superseded === "boolean" &&
    record(value.membership) &&
    keys(value.membership, [
      "course",
      "acceptedCourseVersion",
      "acceptedViewVersion",
      "acceptedRevisionVersion",
      "selection",
    ]) &&
    courseMembership(value.membership.course) &&
    [
      value.membership.acceptedCourseVersion,
      value.membership.acceptedViewVersion,
      value.membership.acceptedRevisionVersion,
    ].every(integer) &&
    membershipSelection(value.membership.selection, value.membership.course)
  )
}

function materialMap(value: Record<string, unknown>) {
  return (
    keys(value, ["id", "disposition", "superseded"]) &&
    nonempty(value.id) &&
    disposition(value.disposition) &&
    typeof value.superseded === "boolean"
  )
}

function materialSelector(value: Record<string, unknown>) {
  return (
    keys(value, ["id", "coordinate", "witness"]) &&
    nonempty(value.id) &&
    coordinate(value.coordinate) &&
    witness(value.witness)
  )
}

function materialTarget(value: Record<string, unknown>) {
  if (value.type === "artifact") {
    return (
      keys(value, ["type", "effectiveArtifactID", "recorded", "current", "targetAdmission"]) &&
      nonempty(value.effectiveArtifactID) &&
      record(value.recorded) &&
      recordedArtifactTarget(value.recorded) &&
      artifactCurrent(value.current) &&
      currentUseStatus(value.targetAdmission)
    )
  }
  return value.type === "representation" && representationTarget(value)
}

function recordedArtifactTarget(value: Record<string, unknown>) {
  return (
    keys(value, [
      "revisionID",
      "attribution",
      "dispositionVersion",
      "lineageVersion",
      "sourceVersion",
      "artifactBindingID",
      "fingerprint",
      "mediaType",
      "authorizationProvenance",
    ]) &&
    [value.revisionID, value.artifactBindingID, value.mediaType].every(nonempty) &&
    [value.dispositionVersion, value.lineageVersion, value.sourceVersion].every(integer) &&
    attribution(value.attribution) &&
    witness(value.fingerprint) &&
    authorizationProvenance(value.authorizationProvenance)
  )
}

function artifactCurrent(value: unknown) {
  if (!record(value) || typeof value.type !== "string") return false
  if (value.type === "unavailable") return keys(value, ["type"])
  return value.type === "available" && keys(value, ["type", "value"]) && ordinaryUseSnapshot(value.value)
}

function ordinaryUseSnapshot(value: unknown) {
  return (
    record(value) &&
    keys(value, [
      "effectiveArtifactID",
      "dispositionVersion",
      "currentRevisionID",
      "attribution",
      "lineageVersion",
      "fingerprint",
      "mediaType",
    ]) &&
    [value.effectiveArtifactID, value.currentRevisionID, value.mediaType].every(nonempty) &&
    [value.dispositionVersion, value.lineageVersion].every(integer) &&
    attribution(value.attribution) &&
    witness(value.fingerprint)
  )
}

function currentUseStatus(value: unknown) {
  if (!record(value) || typeof value.status !== "string") return false
  if (value.status === "eligible") return keys(value, ["status"])
  return (
    value.status === "stale" &&
    keys(value, ["status", "cause"]) &&
    typeof value.cause === "string" &&
    [
      "artifact_not_found",
      "artifact_withdrawn",
      "lineage_hidden",
      "source_missing",
      "source_unbound",
      "source_ineligible",
      "disposition_changed",
      "lineage_changed",
      "revision_changed",
      "attribution_changed",
      "fingerprint_changed",
      "media_type_changed",
      "representation_not_found",
      "artifact_ineligible",
      "wrong_artifact",
      "source_drift",
      "grant_required",
      "grant_stale",
      "grant_revoked",
      "availability_changed",
      "externally_missing",
      "integrity_mismatch",
      "explicitly_deleted",
      "material_unavailable",
    ].includes(value.cause)
  )
}

function representationTarget(value: Record<string, unknown>) {
  return (
    keys(value, [
      "type",
      "representationRevisionID",
      "effectiveArtifactID",
      "acceptance",
      "availability",
      "currentArtifact",
      "targetAdmission",
      "metadata",
    ]) &&
    [value.representationRevisionID, value.effectiveArtifactID].every(nonempty) &&
    record(value.acceptance) &&
    representationAcceptance(value.acceptance) &&
    availability(value.availability) &&
    artifactCurrent(value.currentArtifact) &&
    record(value.targetAdmission) &&
    keys(value.targetAdmission, ["status", "activeGrant"]) &&
    currentUseStatus(value.targetAdmission.status) &&
    (value.targetAdmission.activeGrant === null || continuedUseGrant(value.targetAdmission.activeGrant)) &&
    representationGrantRelation(value) &&
    exactReference(value.metadata)
  )
}

function representationAcceptance(value: Record<string, unknown>) {
  return (
    keys(value, ["sourceRevisionID", "acceptedLineageVersion", "acceptedAttribution", "output"]) &&
    nonempty(value.sourceRevisionID) &&
    integer(value.acceptedLineageVersion) &&
    attribution(value.acceptedAttribution) &&
    record(value.output) &&
    keys(value.output, ["digest", "byteLength", "mediaType"]) &&
    nonempty(value.output.mediaType) &&
    digest(value.output.digest) &&
    integer(value.output.byteLength)
  )
}

function availability(value: unknown) {
  return (
    record(value) &&
    keys(value, ["version", "disposition"]) &&
    integer(value.version) &&
    ["available", "externally_missing", "integrity_mismatch", "explicitly_deleted"].includes(String(value.disposition))
  )
}

function representationGrantRelation(value: Record<string, unknown>) {
  const target = value.targetAdmission
  if (!record(target)) return false
  const grant = target.activeGrant
  if (grant === null) return true
  if (!record(grant) || !record(value.currentArtifact) || value.currentArtifact.type !== "available") return false
  const current = value.currentArtifact.value
  return (
    record(current) &&
    ordinaryUseSnapshot(current) &&
    grant.currentSourceRevisionID === current.currentRevisionID &&
    grant.currentLineageVersion === current.lineageVersion &&
    canonicalJson(grant.currentAttribution as JsonValue) === canonicalJson(current.attribution as JsonValue)
  )
}

function continuedUseGrant(value: unknown) {
  return (
    record(value) &&
    keys(value, [
      "id",
      "version",
      "disposition",
      "oldSourceRevisionID",
      "currentSourceRevisionID",
      "currentLineageVersion",
      "currentAttribution",
    ]) &&
    [value.id, value.oldSourceRevisionID, value.currentSourceRevisionID].every(nonempty) &&
    [value.version, value.currentLineageVersion].every(integer) &&
    value.disposition === "active" &&
    attribution(value.currentAttribution)
  )
}

function authorizationProvenance(value: unknown) {
  if (!record(value) || typeof value.kind !== "string") return false
  if (value.kind === "content_root") {
    if ("contentRootID" in value) {
      return (
        keys(value, [
          "kind",
          "contentRootID",
          "bindingID",
          "bindingEpisodeID",
          "bindingEpisodeOrdinal",
          "grantEpisodeID",
          "grantVersion",
        ]) &&
        [value.contentRootID, value.bindingID, value.bindingEpisodeID, value.grantEpisodeID].every(nonempty) &&
        integer(value.bindingEpisodeOrdinal) &&
        integer(value.grantVersion)
      )
    }
    return (
      keys(value, ["kind", "contentRoot", "grantEpisodeOrdinal"]) &&
      contentRootReceipt(value.contentRoot) &&
      integer(value.grantEpisodeOrdinal)
    )
  }
  if (value.kind === "content_root_historical_v16") {
    return (
      keys(value, ["kind", "contentRoot", "grantEpisodeOrdinal", "receipt"]) &&
      contentRootReceipt(value.contentRoot) &&
      integer(value.grantEpisodeOrdinal) &&
      exactReference(value.receipt)
    )
  }
  if (value.kind === "active_workspace") {
    return (
      keys(value, ["kind", "workspaceIdentity", "receipt"]) &&
      nonempty(value.workspaceIdentity) &&
      exactReference(value.receipt)
    )
  }
  return (
    value.kind === "one_operation" &&
    keys(value, ["kind", "priorOperationIdentity", "receipt"]) &&
    nonempty(value.priorOperationIdentity) &&
    exactReference(value.receipt)
  )
}

function contentRootReceipt(value: unknown) {
  return (
    record(value) &&
    keys(value, [
      "contentRootID",
      "bindingID",
      "bindingEpisodeID",
      "bindingEpisodeOrdinal",
      "grantEpisodeID",
      "grantVersion",
    ]) &&
    [value.contentRootID, value.bindingID, value.bindingEpisodeID, value.grantEpisodeID].every(nonempty) &&
    [value.bindingEpisodeOrdinal, value.grantVersion].every(integer)
  )
}

function learnerResponseEvidenceLocator(value: Record<string, unknown>) {
  return (
    keys(value, [
      "recordID",
      "revisionID",
      "version",
      "subjectOccurrenceID",
      "subjectSourceOrder",
      "target",
      "lazyReadAvailable",
    ]) &&
    [value.recordID, value.revisionID, value.subjectOccurrenceID].every(nonempty) &&
    integer(value.version) &&
    integer(value.subjectSourceOrder) &&
    Number(value.subjectSourceOrder) > 0 &&
    typeof value.lazyReadAvailable === "boolean" &&
    record(value.target) &&
    keys(value.target, ["mapID", "selectorID", "courseID", "viewID", "revisionID", "itemID", "alignmentID"]) &&
    [
      value.target.mapID,
      value.target.selectorID,
      value.target.courseID,
      value.target.viewID,
      value.target.revisionID,
      value.target.itemID,
      value.target.alignmentID,
    ].every(nonempty)
  )
}

function futureAttentionEntry(locator: unknown, semantic: unknown, assistantMessageID: MessageID): Entry {
  const result = entry("future_attention", locator, semantic)
  if (result.semantic?.state === "value") return result
  throw new CutCapacityError({
    assistantMessageID,
    boundary: "mandatory",
    observedBytes: result.semantic?.canonicalBytes ?? 0,
    ceilingBytes: MAX_ENTRY_BYTES,
  })
}

function interactionLocator(value: Record<string, unknown>) {
  const optional = [
    "inputID",
    "causalOccurrenceID",
    "terminalReason",
    "sessionParentID",
    "messageRange",
    "partRange",
    "timeDeleted",
  ]
  if (
    !keys(value, [
      "status",
      "sessionID",
      "turnID",
      "timeAdmitted",
      "timeTerminal",
      "terminalState",
      "presentationProvenance",
      "lazyReadAvailable",
      ...optional.filter((key) => value[key] !== undefined),
    ]) ||
    ![value.sessionID, value.turnID].every(nonempty) ||
    !integer(value.timeAdmitted) ||
    !integer(value.timeTerminal) ||
    !["completed", "failed", "interrupted", "exhausted"].includes(String(value.terminalState)) ||
    typeof value.lazyReadAvailable !== "boolean" ||
    (value.inputID !== undefined && !nonempty(value.inputID)) ||
    (value.causalOccurrenceID !== undefined && !nonempty(value.causalOccurrenceID)) ||
    (value.terminalReason !== undefined && !nonempty(value.terminalReason)) ||
    (value.sessionParentID !== undefined && !nonempty(value.sessionParentID))
  )
    return false
  if (value.status === "available") {
    return (
      presentationProvenanceShape(value.presentationProvenance) &&
      value.timeDeleted === undefined &&
      rangeShape(value.messageRange) &&
      rangeShape(value.partRange)
    )
  }
  return (
    value.status === "source_unavailable" &&
    value.presentationProvenance === "source_unavailable" &&
    integer(value.timeDeleted) &&
    value.messageRange === undefined &&
    value.partRange === undefined
  )
}

function presentationProvenanceShape(value: unknown) {
  const order = ["origin", "compaction_replay", "fork_clone"] as const
  if (
    !record(value) ||
    !keys(value, ["count", "kinds", "fingerprint", "historicalMessageOrPart"]) ||
    !integer(value.count) ||
    value.count <= 0 ||
    !Array.isArray(value.kinds) ||
    value.kinds.length === 0 ||
    value.kinds.length > value.count
  )
    return false
  const kinds = value.kinds
  return (
    kinds.every(
      (kind, index) =>
        order.includes(kind as (typeof order)[number]) &&
        order.indexOf(kind as (typeof order)[number]) >
          (index ? order.indexOf(kinds[index - 1] as (typeof order)[number]) : -1),
    ) &&
    digest(value.fingerprint) &&
    typeof value.historicalMessageOrPart === "boolean"
  )
}

function interactionSemantic(kind: Entry["kind"], value: unknown) {
  if (kind !== "interaction" || value === undefined || !record(value) || value.state === "locator_only") return true
  if (value.state !== "value" || !record(value.value) || !keys(value.value, ["navigationHint"])) return false
  const hint = value.value.navigationHint
  return (
    record(hint) &&
    keys(hint, ["sessionTitle", "trust"]) &&
    typeof hint.sessionTitle === "string" &&
    hint.trust === "untrusted_navigation_hint"
  )
}

function learnerResponseEvidenceSemantic(kind: Entry["kind"], value: unknown) {
  if (kind !== "learner_response_evidence") return true
  if (!record(value) || value.state !== "value" || !record(value.value)) return false
  const semantic = value.value
  const nonImplications = semantic.nonImplications
  return (
    keys(semantic, [
      "assessmentScope",
      "relation",
      "basis",
      "exposure",
      "disposition",
      "sourceAvailability",
      "targetRelation",
      "selectorByteLength",
      "interpretation",
      "nonImplications",
    ]) &&
    semantic.assessmentScope === "entire_exact_selector" &&
    ["supports", "does_not_support"].includes(String(semantic.relation)) &&
    ["tutor_interpretation", "learner_report"].includes(String(semantic.basis)) &&
    ["learner_response_before_tutor_disclosure", "tutor_disclosure_before_learner_response"].includes(
      String(semantic.exposure),
    ) &&
    semantic.disposition === "active" &&
    record(semantic.sourceAvailability) &&
    keys(semantic.sourceAvailability, ["subject", "condition", "basis"]) &&
    Object.values(semantic.sourceAvailability).every((item) => item === "source_deleted") &&
    record(semantic.targetRelation) &&
    keys(semantic.targetRelation, ["alignment", "map", "course", "selector"]) &&
    Object.values(semantic.targetRelation).every((item) => item === "current") &&
    integer(semantic.selectorByteLength) &&
    semantic.selectorByteLength > 0 &&
    semantic.selectorByteLength <= LearnerResponseEvidence.MAX_SELECTOR_BYTES &&
    nonempty(semantic.interpretation) &&
    Array.isArray(nonImplications) &&
    nonImplications.length === 5 &&
    [
      "mastery",
      "understanding",
      "retention",
      "correctness_beyond_this_selector_bound_occurrence",
      "required_next_action",
    ].every((item, index) => nonImplications[index] === item)
  )
}

function futureAttentionSemantic(kind: Entry["kind"], value: unknown) {
  if (kind !== "future_attention") return true
  if (!record(value)) return false
  if (value.state === "locator_only") return bounded(value)
  if (value.state !== "value" || !record(value.value)) return false
  const semantic = value.value
  const optional = semantic.interactionOrder === undefined ? [] : ["interactionOrder"]
  return (
    keys(semantic, [
      "schemaVersion",
      "purpose",
      "authorship",
      "sourceAvailability",
      "target",
      "notBefore",
      "serviceTiming",
      ...optional,
    ]) &&
    semantic.schemaVersion === 1 &&
    nonempty(semantic.purpose) &&
    utf8Bytes(semantic.purpose as string) <= FutureAttention.MAX_PURPOSE_BYTES &&
    ["interpreted_learner_request", "tutor_initiated"].includes(String(semantic.authorship)) &&
    ["available", "source_unavailable"].includes(String(semantic.sourceAvailability)) &&
    futureAttentionTarget(semantic.target) &&
    futureAttentionNotBefore(semantic.notBefore) &&
    ["after_creation", "at_or_after_not_before"].includes(String(semantic.serviceTiming)) &&
    (semantic.interactionOrder === undefined ||
      semantic.interactionOrder === "learner_response_before_tutor_disclosure")
  )
}

function futureAttentionTarget(value: unknown) {
  if (!record(value) || !keys(value, ["endpoint", "selection", "receipt"]) || !courseMembership(value.endpoint)) {
    return false
  }
  if (!membershipSelection(value.selection, value.endpoint) || !record(value.receipt)) return false
  return (
    keys(value.receipt, ["endpoint", "selection", "courseVersion", "viewVersion", "revisionVersion"]) &&
    courseMembership(value.receipt.endpoint) &&
    membershipSelection(value.receipt.selection, value.receipt.endpoint) &&
    canonicalJson(toJsonValue(value.receipt.endpoint)) === canonicalJson(toJsonValue(value.endpoint)) &&
    canonicalJson(toJsonValue(value.receipt.selection)) === canonicalJson(toJsonValue(value.selection)) &&
    [value.receipt.courseVersion, value.receipt.viewVersion, value.receipt.revisionVersion].every(integer)
  )
}

function futureAttentionNotBefore(value: unknown) {
  if (
    !record(value) ||
    !keys(value, ["instant", "utcOffsetMinutes", "resolvedZone"]) ||
    !integer(value.instant) ||
    !Number.isSafeInteger(value.utcOffsetMinutes) ||
    Number(value.utcOffsetMinutes) < -840 ||
    Number(value.utcOffsetMinutes) > 840 ||
    !record(value.resolvedZone)
  ) {
    return false
  }
  if (value.resolvedZone.type === "fixed_offset") {
    return (
      keys(value.resolvedZone, ["type", "offsetMinutes"]) &&
      value.resolvedZone.offsetMinutes === value.utcOffsetMinutes
    )
  }
  return (
    value.resolvedZone.type === "iana" &&
    keys(value.resolvedZone, ["type", "name", "releaseID"]) &&
    nonempty(value.resolvedZone.name) &&
    nonempty(value.resolvedZone.releaseID)
  )
}

function courseMembership(value: unknown) {
  return (
    record(value) &&
    keys(value, ["courseID", "viewID", "revisionID", "itemID"]) &&
    [value.courseID, value.viewID, value.revisionID, value.itemID].every(nonempty)
  )
}

function membershipSelection(value: unknown, course: unknown) {
  if (!record(value) || !record(course)) return false
  if (value.type === "explicit_exact") return keys(value, ["type"])
  return (
    value.type === "observed_working" &&
    keys(value, ["type", "revisionID", "version"]) &&
    value.revisionID === course.revisionID &&
    integer(value.version)
  )
}

function disposition(value: unknown) {
  return (
    record(value) &&
    keys(value, ["version", "value"]) &&
    integer(value.version) &&
    ["active", "withdrawn"].includes(String(value.value))
  )
}

function coordinate(value: unknown) {
  if (!record(value) || typeof value.kind !== "string") return false
  if (value.kind === "whole_target.v1") return keys(value, ["kind"])
  if (value.kind === "artifact_byte_range.v1") {
    return keys(value, ["kind", "startByte", "endByte"]) && integer(value.startByte) && integer(value.endByte)
  }
  if (value.kind === "pdf_page_range.v1") {
    return keys(value, ["kind", "startPage", "endPage"]) && integer(value.startPage) && integer(value.endPage)
  }
  if (value.kind === "model_text_range.v1") {
    return keys(value, ["kind", "startScalar", "endScalar"]) && integer(value.startScalar) && integer(value.endScalar)
  }
  return (
    value.kind === "pdf_text_range.v1" &&
    keys(value, ["kind", "start", "end"]) &&
    textPoint(value.start) &&
    textPoint(value.end)
  )
}

function textPoint(value: unknown) {
  return (
    record(value) &&
    keys(value, ["page", "item", "scalar"]) &&
    integer(value.page) &&
    integer(value.item) &&
    integer(value.scalar)
  )
}

function witness(value: unknown) {
  return (
    record(value) &&
    keys(value, ["algorithm", "digest", "byteLength"]) &&
    value.algorithm === "sha256" &&
    digest(value.digest) &&
    integer(value.byteLength)
  )
}

function attribution(value: unknown) {
  return (
    record(value) &&
    ((value.type === "recorded" && keys(value, ["type"])) ||
      (value.type === "lineage_correction" && keys(value, ["type", "memberID"]) && nonempty(value.memberID)))
  )
}

function exactReference(value: unknown) {
  return (
    record(value) &&
    keys(value, ["canonicalBytes", "fingerprint"]) &&
    integer(value.canonicalBytes) &&
    value.canonicalBytes > 0 &&
    digest(value.fingerprint)
  )
}

function nullableString(value: unknown) {
  return value === null || nonempty(value)
}

function nullableInteger(value: unknown) {
  return value === null || integer(value)
}

function rangeShape(value: unknown) {
  if (!record(value) || !integer(value.count) || !digest(value.fingerprint)) return false
  if (value.count === 0) return keys(value, ["count", "fingerprint"])
  return keys(value, ["first", "last", "count", "fingerprint"]) && nonempty(value.first) && nonempty(value.last)
}

function bounded(value: unknown) {
  if (!record(value)) return false
  if (value.state === "value")
    return (
      keys(value, ["state", "value"]) && json(value.value) && utf8Bytes(canonicalJson(value.value)) <= MAX_ENTRY_BYTES
    )
  return (
    value.state === "locator_only" &&
    keys(value, ["state", "canonicalBytes", "fingerprint", "reason"]) &&
    integer(value.canonicalBytes) &&
    value.canonicalBytes > 0 &&
    digest(value.fingerprint) &&
    (value.reason === "entry_allowance" || value.reason === "gate18_byte_budget") &&
    (value.reason !== "entry_allowance" || value.canonicalBytes > MAX_ENTRY_BYTES)
  )
}

function omission(value: unknown) {
  if (!record(value) || typeof value.type !== "string") return false
  if (value.type === "none") return keys(value, ["type"])
  if (value.type === "exact") {
    return (
      keys(value, ["type", "omitted", "reasons"]) &&
      integer(value.omitted) &&
      Number(value.omitted) > 0 &&
      Array.isArray(value.reasons) &&
      value.reasons.length > 0 &&
      value.reasons.length <= 2 &&
      value.reasons.every(
        (reason) =>
          record(reason) &&
          keys(reason, ["reason", "omitted"]) &&
          (reason.reason === "candidate_limit" || reason.reason === "gate18_byte_budget") &&
          integer(reason.omitted) &&
          reason.omitted > 0,
      ) &&
      unique(value.reasons.map((reason) => reason.reason)) &&
      value.reasons.every((reason, index) => index === 0 || reason.reason === "gate18_byte_budget") &&
      value.reasons.reduce((total, reason) => total + Number(reason.omitted), 0) === value.omitted
    )
  }
  return value.type === "unknown" && keys(value, ["type", "reason"]) && nonempty(value.reason)
}

function budgetShape(cut: Cut, expectedOwners: readonly Section["owner"][]) {
  const value = cut.budget
  return (
    record(value) &&
    keys(value, ["canonicalBytes", "renderedBytes", "entryCounts", "hardLimits"]) &&
    integer(value.canonicalBytes) &&
    value.canonicalBytes <= MAX_CANONICAL_BYTES &&
    integer(value.renderedBytes) &&
    value.renderedBytes <= MAX_RENDERED_BYTES &&
    record(value.entryCounts) &&
    keys(value.entryCounts, [...expectedOwners]) &&
    expectedOwners.every(
      (owner) => value.entryCounts[owner] === cut.sections.find((section) => section.owner === owner)?.entries.length,
    ) &&
    canonicalJson(toJsonValue(value.hardLimits)) === canonicalJson(toJsonValue(hardLimits))
  )
}

function invalid(assistantMessageID: MessageID, reason: string) {
  return Effect.fail(new CutIntegrityError({ assistantMessageID, reason }))
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function keys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort()
  const target = [...expected].sort()
  return actual.length === target.length && actual.every((item, index) => item === target[index])
}

function integer(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
}

function catalogOrderedSubset(value: readonly string[], catalog: readonly string[]) {
  return value.every((item, index) => {
    const position = catalog.indexOf(item)
    const previous = index === 0 ? -1 : catalog.indexOf(value[index - 1]!)
    return position > previous
  })
}

function unique(value: readonly string[]) {
  return new Set(value).size === value.length
}

function ordinal(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function nonempty(value: unknown) {
  return typeof value === "string" && value.length > 0
}

function json(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(json)
  return record(value) && Object.values(value).every(json)
}

function jsonObject(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
