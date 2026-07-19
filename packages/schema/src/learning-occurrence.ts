export * as LearningOccurrence from "./learning-occurrence"

import { Schema } from "effect"
import { ascending } from "./identifier"
import { statics } from "./schema"

export const ID = Schema.String.check(Schema.isPattern(/^lco_[0-9A-Za-z]{26}$/)).pipe(
  Schema.brand("LearningCommand.OccurrenceID"),
  statics((schema) => ({ create: () => schema.make("lco_" + ascending()) })),
)
export type ID = typeof ID.Type

export const PresentationProvenance = Schema.Literals(["origin", "compaction_replay", "fork_clone"])
export type PresentationProvenance = typeof PresentationProvenance.Type
