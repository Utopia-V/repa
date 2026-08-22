import { Schema } from "effect"

export class FrontierUnrepresentableError extends Schema.TaggedErrorClass<FrontierUnrepresentableError>()(
  "SessionPresentation.FrontierUnrepresentableError",
  {
    sessionID: Schema.String,
  },
) {}

export class AdministrativeHistoryIntegrityError extends Schema.TaggedErrorClass<AdministrativeHistoryIntegrityError>()(
  "SessionPresentation.AdministrativeHistoryIntegrityError",
  {
    sessionID: Schema.String,
    reason: Schema.String,
  },
) {}

export class HistoricalPresentationNotRevertibleError extends Schema.TaggedErrorClass<HistoricalPresentationNotRevertibleError>()(
  "SessionPresentation.HistoricalPresentationNotRevertibleError",
  {
    sessionID: Schema.String,
    presentationID: Schema.String,
  },
) {}
