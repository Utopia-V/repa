import { Schema } from "effect"
import { LearningOccurrence } from "@opencode-ai/schema/learning-occurrence"

export const OccurrenceID = LearningOccurrence.ID
export type OccurrenceID = typeof OccurrenceID.Type

export const createOccurrenceID = OccurrenceID.create

export const PresentationProvenance = LearningOccurrence.PresentationProvenance
export type PresentationProvenance = typeof PresentationProvenance.Type

export type ResolvedSourceTemporalContext = Readonly<{
  state: "resolved"
  instant: number
  timeZone: string
  utcOffsetMinutes: number
}>

export type UnavailableSourceTemporalContext = Readonly<{
  state: "unavailable"
  instant: number
  reason: "timezone_unavailable"
}>

export type SourceTemporalContext = ResolvedSourceTemporalContext | UnavailableSourceTemporalContext

export class LearnerAdmission {
  private constructor(
    readonly timeZone: string | null | undefined,
    readonly capturedTemporalContext?: SourceTemporalContext,
  ) {}

  static interactive(input?: { readonly timeZone?: string | null; readonly instant?: number }) {
    return new LearnerAdmission(
      input?.timeZone,
      input?.instant === undefined ? undefined : captureSourceTemporalContext(input.timeZone, input.instant),
    )
  }

  temporalContext(instant: number) {
    if (this.capturedTemporalContext?.instant !== undefined && this.capturedTemporalContext.instant !== instant) {
      return undefined
    }
    return this.capturedTemporalContext ?? captureSourceTemporalContext(this.timeZone, instant)
  }
}

function captureSourceTemporalContext(timeZoneInput: string | null | undefined, instant: number): SourceTemporalContext {
  const timeZone = timeZoneInput === undefined ? hostTimeZone() : timeZoneInput
  if (!timeZone) return { state: "unavailable", instant, reason: "timezone_unavailable" }
  const utcOffsetMinutes = offsetAt(timeZone, instant)
  if (utcOffsetMinutes === undefined) return { state: "unavailable", instant, reason: "timezone_unavailable" }
  return { state: "resolved", instant, timeZone, utcOffsetMinutes }
}

function hostTimeZone() {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return timeZone.trim().length > 0 ? timeZone : null
  } catch {
    return null
  }
}

function offsetAt(timeZone: string, instant: number) {
  try {
    const value = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(new Date(instant))
      .find((part) => part.type === "timeZoneName")?.value
    const match = /^(?:GMT|UTC)([+-])(\d{2}):(\d{2})$/.exec(value ?? "")
    if (!match) return value === "GMT" || value === "UTC" ? 0 : undefined
    const minutes = Number(match[2]) * 60 + Number(match[3])
    return match[1] === "-" ? -minutes : minutes
  } catch {
    return undefined
  }
}

export class OccurrenceConflictError extends Schema.TaggedErrorClass<OccurrenceConflictError>()(
  "LearningCommand.OccurrenceConflictError",
  {
    messageID: Schema.String,
  },
) {}

export class InvalidCausalSourceError extends Schema.TaggedErrorClass<InvalidCausalSourceError>()(
  "LearningCommand.InvalidCausalSourceError",
  {
    reason: Schema.Union([
      Schema.Literal("missing_presentation"),
      Schema.Literal("wrong_session"),
      Schema.Literal("wrong_occurrence"),
      Schema.Literal("not_learner_input"),
      Schema.Literal("synthetic_only"),
      Schema.Literal("changed_presentation"),
      Schema.Literal("source_unavailable"),
      Schema.Literal("invalid_time"),
    ]),
  },
) {}

export class HistoricalPresentationConflictError extends Schema.TaggedErrorClass<HistoricalPresentationConflictError>()(
  "LearningCommand.HistoricalPresentationConflictError",
  {
    partID: Schema.String,
  },
) {}

export type Error = OccurrenceConflictError | InvalidCausalSourceError | HistoricalPresentationConflictError
