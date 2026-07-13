import { z } from "zod"
import type { SelectorScenario } from "./selector-protocol"
import { selectorScenarios } from "./selector-protocol"

export const SOURCE_SELECTOR_PROTOCOL_REVISION =
  "als-022c-governing-source-selection-v1"

export const sourceSelectorOutputSchema = z
  .object({
    governingSource: z.enum([
      "current_request",
      "agenda_candidate",
      "unresolved",
    ]),
    concernId: z.string().nullable(),
    basis: z.string().min(1),
  })
  .strict()

export type SourceSelectorOutput = z.infer<typeof sourceSelectorOutputSchema>

type ExpectedSource = Readonly<{
  governingSource: SourceSelectorOutput["governingSource"]
  concernId: string | null
}>

export type SourceSelectorScenario = Readonly<{
  id: string
  learnerText: string
  candidates: SelectorScenario["candidates"]
  expected: ExpectedSource
}>

const byId = (id: string) => {
  const scenario = selectorScenarios.find((item) => item.id === id)
  if (!scenario) throw new Error(`Missing ALS-022B source scenario ${id}`)
  return scenario
}

function sourceScenario(
  id: string,
  expected: ExpectedSource,
): SourceSelectorScenario {
  const source = byId(id)
  return Object.freeze({
    id,
    learnerText: source.learnerText,
    candidates: Object.freeze(
      source.candidates.filter(
        (candidate) =>
          candidate.eligibility === "eligible" &&
          candidate.targetState === "current_view",
      ),
    ),
    expected: Object.freeze(expected),
  })
}

export const sourceSelectorScenarios: readonly SourceSelectorScenario[] =
  Object.freeze([
    sourceScenario("generic_continue_independent", {
      governingSource: "agenda_candidate",
      concernId: "concern:independent",
    }),
    sourceScenario("explicit_independent_request", {
      governingSource: "current_request",
      concernId: null,
    }),
    sourceScenario("explicit_discrimination_request", {
      governingSource: "current_request",
      concernId: null,
    }),
    sourceScenario("generic_continue_repair", {
      governingSource: "agenda_candidate",
      concernId: "concern:repair",
    }),
    sourceScenario("deadline_direct_answer", {
      governingSource: "current_request",
      concernId: null,
    }),
    sourceScenario("explicit_cancel", {
      governingSource: "current_request",
      concernId: null,
    }),
    sourceScenario("multiple_ambiguous", {
      governingSource: "unresolved",
      concernId: null,
    }),
    sourceScenario("already_completed_input", {
      governingSource: "current_request",
      concernId: null,
    }),
    sourceScenario("learner_redirect", {
      governingSource: "current_request",
      concernId: null,
    }),
  ])

export const SOURCE_SELECTOR_SYSTEM_PROMPT = [
  "You are the model component in a control-only Tutor source-arbitration step.",
  "Choose the exact source that should govern the next learner-visible move. Do not teach, answer, mutate state, address Agenda, or invent a replacement purpose.",
  "The program has already removed ineligible or stale Agenda candidates. The legal choices are:",
  "- current_request: choose when the admitted learner request itself determines the next move, including explicit form, direct help, cancellation, redirection, or a reported completed occurrence.",
  "- agenda_candidate: choose exactly one visible candidate only when the current request is underspecified and that candidate truthfully supplies the governing purpose.",
  "- unresolved: choose when several materially different candidates remain and the current request does not disambiguate them.",
  "The current request has priority. A matching explicit request still uses current_request; do not borrow Agenda provenance. Never reinterpret or rewrite a candidate reason.",
  "For agenda_candidate copy exactly one visible concernId. For current_request or unresolved, concernId must be null.",
  'Return one JSON object exactly shaped as: {"governingSource":"current_request|agenda_candidate|unresolved","concernId":"visible id or null","basis":"brief comparison"}. Do not add Markdown or prose outside JSON.',
].join("\n")

export function renderSourceSelectorScenario(scenario: SourceSelectorScenario) {
  const candidates = scenario.candidates
    .map(
      (candidate) =>
        `- concernId ${JSON.stringify(candidate.id)}; exact reason ${JSON.stringify(candidate.reason)}`,
    )
    .join("\n")
  return [
    `Exact admitted current request:\n${scenario.learnerText}`,
    `Legally adoptable Agenda candidates:\n${candidates || "(none)"}`,
  ].join("\n\n")
}

export function assessSourceSelectorOutput(
  scenario: SourceSelectorScenario,
  raw: unknown,
) {
  const parsed = sourceSelectorOutputSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      passed: false,
      transportValid: false,
      sourceCorrect: false,
      identityCorrect: false,
      fieldsConsistent: false,
      locallyAdmitted: false,
      detail: parsed.error.message,
    }
  }
  const value = parsed.data
  const sourceCorrect =
    value.governingSource === scenario.expected.governingSource
  const identityCorrect = value.concernId === scenario.expected.concernId
  const fieldsConsistent =
    value.governingSource === "agenda_candidate"
      ? typeof value.concernId === "string"
      : value.concernId === null
  const admission = admitGoverningSource(scenario, value)
  return {
    passed:
      sourceCorrect &&
      identityCorrect &&
      fieldsConsistent &&
      admission.accepted,
    transportValid: true,
    sourceCorrect,
    identityCorrect,
    fieldsConsistent,
    locallyAdmitted: admission.accepted,
    detail: value.basis,
    value,
    admission,
  }
}

export function admitGoverningSource(
  scenario: SourceSelectorScenario,
  output: SourceSelectorOutput,
):
  | { accepted: true; selection: Record<string, unknown> }
  | { accepted: false; reason: string } {
  if (output.governingSource === "current_request") {
    if (output.concernId !== null) {
      return { accepted: false, reason: "current_request cannot borrow concern provenance" }
    }
    return {
      accepted: true,
      selection: {
        kind: "current_request",
        exactLearnerText: scenario.learnerText,
      },
    }
  }
  if (output.governingSource === "unresolved") {
    if (output.concernId !== null) {
      return { accepted: false, reason: "unresolved cannot claim concern provenance" }
    }
    return { accepted: true, selection: { kind: "unresolved" } }
  }
  const candidate = scenario.candidates.find(
    (item) => item.id === output.concernId,
  )
  if (!candidate) {
    return { accepted: false, reason: "candidate is not in the legal option set" }
  }
  return {
    accepted: true,
    selection: {
      kind: "agenda_candidate",
      concernId: candidate.id,
      exactReason: candidate.reason,
    },
  }
}

export function validateSourceSelectorProtocol() {
  const ids = sourceSelectorScenarios.map((scenario) => scenario.id)
  if (new Set(ids).size !== ids.length) {
    throw new Error("ALS-022C scenario IDs must be unique")
  }
  for (const scenario of sourceSelectorScenarios) {
    if (
      scenario.candidates.some(
        (candidate) =>
          candidate.eligibility !== "eligible" ||
          candidate.targetState !== "current_view",
      )
    ) {
      throw new Error(`ALS-022C leaked an illegal candidate in ${scenario.id}`)
    }
    if (scenario.expected.governingSource === "agenda_candidate") {
      if (!scenario.candidates.some((item) => item.id === scenario.expected.concernId)) {
        throw new Error(`ALS-022C oracle selects a missing candidate in ${scenario.id}`)
      }
    } else if (scenario.expected.concernId !== null) {
      throw new Error(`ALS-022C non-candidate oracle has a concern ID in ${scenario.id}`)
    }
  }
}

