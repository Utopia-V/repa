import { Schema } from "effect"
import { Identifier } from "../id/id"

export const OccurrenceID = Schema.String.check(Schema.isPattern(/^lco_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("LearningCommand.OccurrenceID"),
)
export type OccurrenceID = typeof OccurrenceID.Type

const decodeOccurrenceID = Schema.decodeUnknownSync(OccurrenceID)

export const createOccurrenceID = () => decodeOccurrenceID(Identifier.create("lco", "ascending"))

export const PresentationProvenance = Schema.Union([
  Schema.Literal("origin"),
  Schema.Literal("compaction_replay"),
  Schema.Literal("fork_clone"),
])
export type PresentationProvenance = typeof PresentationProvenance.Type

export class LearnerAdmission {
  private constructor() {}

  static interactive() {
    return new LearnerAdmission()
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
