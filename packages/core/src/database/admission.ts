import { Schema } from "effect"

export const APPLICATION_ID = 0x52455041
export const BASELINE_VERSION = 1
export const BASELINE_ID = "repa_20260714_baseline"

export const AdmissionReason = Schema.Literals([
  "foreign",
  "unsupported-old",
  "future",
  "partial",
  "corrupt",
  "unavailable",
  "initialization",
])
export type AdmissionReason = typeof AdmissionReason.Type

export class DatabaseAdmissionError extends Schema.TaggedErrorClass<DatabaseAdmissionError>()(
  "DatabaseAdmissionError",
  {
    path: Schema.String,
    reason: AdmissionReason,
    detail: Schema.String,
    currentVersion: Schema.Number,
    observedVersion: Schema.optional(Schema.Number),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message() {
    return this.detail
  }
}

export class DatabaseMigrationError extends Schema.TaggedErrorClass<DatabaseMigrationError>()(
  "DatabaseMigrationError",
  {
    path: Schema.String,
    migrationID: Schema.String,
    fromVersion: Schema.Number,
    toVersion: Schema.Number,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message() {
    return `Failed to apply Repa database migration ${this.migrationID} (${this.fromVersion} -> ${this.toVersion})`
  }
}
