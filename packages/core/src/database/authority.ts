export * as DatabaseAuthority from "./authority"

import path from "node:path"
import { closeSync, existsSync, openSync, readSync, realpathSync, statSync } from "node:fs"
import { Schema } from "effect"
import { APPLICATION_ID, DatabaseAdmissionError } from "./admission"

const SQLITE_HEADER = Buffer.from("SQLite format 3\0")
const APPLICATION_ID_OFFSET = 68
const HEADER_LENGTH = 72

export const StorageReason = Schema.Literals(["memory", "remote", "hardlink", "unsupported"])
export type StorageReason = typeof StorageReason.Type

export class DatabaseStorageError extends Schema.TaggedErrorClass<DatabaseStorageError>()("DatabaseStorageError", {
  path: Schema.String,
  reason: StorageReason,
  detail: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message() {
    return this.detail
  }
}

export class DatabaseBusyError extends Schema.TaggedErrorClass<DatabaseBusyError>()("DatabaseBusyError", {
  database: Schema.String,
}) {
  override get message() {
    return `Another Repa process owns the LearnerHome database at ${this.database}. If you intentionally started \`repa serve\`, connect with \`repa attach <url>\` instead.`
  }
}

export class DatabaseOwnershipError extends Schema.TaggedErrorClass<DatabaseOwnershipError>()(
  "DatabaseOwnershipError",
  {
    database: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message() {
    return `Could not establish LearnerHome ownership for ${this.database}`
  }
}

export type Target = {
  readonly filename: string
  readonly initialize: boolean
}

export function preflight(filename: string, currentVersion: number): Target {
  if (filename === ":memory:") {
    throw new DatabaseStorageError({
      path: filename,
      reason: "memory",
      detail: "The ordinary Repa runtime requires a filesystem database and does not accept :memory:",
    })
  }

  const absolute = path.resolve(filename)
  requireLocal(absolute)
  const existed = existsSync(absolute)
  const canonical = existed
    ? realpathSync.native(absolute)
    : path.join(realpathSync.native(path.dirname(absolute)), path.basename(absolute))
  requireLocal(canonical)
  if (!existed) return { filename: canonical, initialize: true }

  const stats = statSync(canonical, { bigint: true })
  if (!stats.isFile()) {
    throw new DatabaseStorageError({
      path: canonical,
      reason: "unsupported",
      detail: `The configured Repa database target is not a regular file: ${canonical}`,
    })
  }
  if (stats.nlink > 1n) {
    throw new DatabaseStorageError({
      path: canonical,
      reason: "hardlink",
      detail: `The Repa database at ${canonical} has multiple hardlinks; SQLite journal and WAL ownership would be unsafe`,
    })
  }
  if (stats.size === 0n) return { filename: canonical, initialize: true }
  if (["-journal", "-wal", "-shm"].some((suffix) => existsSync(canonical + suffix))) {
    return { filename: canonical, initialize: true }
  }

  const header = readHeader(canonical, currentVersion)
  if (
    !header.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER) ||
    header.readUInt32BE(APPLICATION_ID_OFFSET) !== APPLICATION_ID
  ) {
    throw new DatabaseAdmissionError({
      path: canonical,
      reason: "foreign",
      detail: `The database at ${canonical} is not a recognized Repa database`,
      currentVersion,
    })
  }
  return { filename: canonical, initialize: false }
}

export function openError(database: string, cause: unknown) {
  if (
    cause instanceof DatabaseBusyError ||
    cause instanceof DatabaseOwnershipError ||
    cause instanceof DatabaseStorageError ||
    cause instanceof DatabaseAdmissionError
  )
    return cause
  if (isBusy(cause)) return new DatabaseBusyError({ database })
  return new DatabaseOwnershipError({ database, cause })
}

function requireLocal(filename: string) {
  if (process.platform !== "win32") return
  const value = filename.replaceAll("/", "\\")
  const remote =
    value.toLowerCase().startsWith("\\\\?\\unc\\") || (value.startsWith("\\\\") && !value.startsWith("\\\\?\\"))
  const device = value.startsWith("\\\\.\\")
  if (!remote && !device) return
  throw new DatabaseStorageError({
    path: filename,
    reason: "remote",
    detail: `The Repa LearnerHome database requires a stable local filesystem: ${filename}`,
  })
}

function readHeader(filename: string, currentVersion: number) {
  const buffer = Buffer.alloc(HEADER_LENGTH)
  const descriptor = openSync(filename, "r")
  try {
    const read = readSync(descriptor, buffer, 0, buffer.length, 0)
    if (read === buffer.length) return buffer
  } finally {
    closeSync(descriptor)
  }
  throw new DatabaseAdmissionError({
    path: filename,
    reason: "foreign",
    detail: `The database at ${filename} is not a recognized Repa database`,
    currentVersion,
  })
}

function isBusy(cause: unknown) {
  if (typeof cause !== "object" || cause === null) return false
  const input = cause as Record<string, unknown>
  return (
    input.code === "SQLITE_BUSY" ||
    input.code === "SQLITE_LOCKED" ||
    input.errno === 5 ||
    input.errno === 6 ||
    input.errcode === 5 ||
    input.errcode === 6
  )
}
