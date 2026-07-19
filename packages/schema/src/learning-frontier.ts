export * as LearningFrontier from "./learning-frontier"

import { Schema } from "effect"
import { DateTimeUtcFromMillis, NonNegativeInt } from "./schema"

export const Snapshot = Schema.Struct({
  sequence: NonNegativeInt,
  time: DateTimeUtcFromMillis,
}).annotate({ identifier: "LearningFrontier.Snapshot" })
export type Snapshot = typeof Snapshot.Type
