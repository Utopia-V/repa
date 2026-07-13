import { Database, SQLiteError } from "bun:sqlite"
import { existsSync, realpathSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"

const OWNERSHIP_SUFFIX = ".writer-owner.sqlite"

export class LearnerHomeAlreadyOwnedError extends Error {
  readonly code = "LEARNER_HOME_ALREADY_OWNED"

  constructor(readonly databasePath: string) {
    super(`LearnerHome already has a state-changing owner: ${databasePath}`)
    this.name = "LearnerHomeAlreadyOwnedError"
  }
}

export type LearnerHomeWriteOwnership = {
  databasePath: string
  ownershipPath: string
  release(): { replayed: boolean }
}

/**
 * Holds a write transaction on a separate SQLite file for the lifetime of one
 * state-changing Repa process. The main state database remains free to commit
 * each interaction and domain transition independently.
 */
export function acquireLearnerHomeWriteOwnership(input: {
  databasePath: string
}): LearnerHomeWriteOwnership {
  if (!input.databasePath.trim()) throw new Error("databasePath must not be empty")
  const databasePath = canonicalDatabasePath(input.databasePath)
  const ownershipPath = `${databasePath}${OWNERSHIP_SUFFIX}`
  const ownershipDatabase = new Database(ownershipPath, { create: true })

  try {
    ownershipDatabase.exec("PRAGMA busy_timeout = 0; BEGIN IMMEDIATE;")
  } catch (error) {
    ownershipDatabase.close()
    if (isOwnershipConflict(error)) throw new LearnerHomeAlreadyOwnedError(databasePath)
    throw error
  }

  let released = false
  return {
    databasePath,
    ownershipPath,
    release() {
      if (released) return { replayed: true }
      released = true
      try {
        ownershipDatabase.exec("ROLLBACK")
      } finally {
        ownershipDatabase.close()
      }
      return { replayed: false }
    },
  }
}

function canonicalDatabasePath(databasePath: string) {
  const absolute = resolve(databasePath)
  if (existsSync(absolute)) return realpathSync.native(absolute)
  const parent = realpathSync.native(dirname(absolute))
  return join(parent, basename(absolute))
}

function isOwnershipConflict(error: unknown) {
  return (
    error instanceof SQLiteError &&
    (error.code === "SQLITE_BUSY" ||
      error.code === "SQLITE_LOCKED" ||
      error.code?.startsWith("SQLITE_BUSY_") === true ||
      error.code?.startsWith("SQLITE_LOCKED_") === true)
  )
}
