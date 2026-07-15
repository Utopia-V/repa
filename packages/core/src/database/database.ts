export * as Database from "./database"

import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { layer as sqliteLayer } from "#sqlite"
import { Cause, Context, Effect, Layer } from "effect"
import { Global } from "../global"
import { Flag } from "../flag/flag"
import { isAbsolute, join } from "path"
import { DatabaseMigration } from "./migration"
import { DatabaseAdmissionError, DatabaseMigrationError } from "./admission"
import { DatabaseBusyError, DatabaseOwnershipError, DatabaseStorageError, DatabaseAuthority } from "./authority"
import { InstallationChannel } from "../installation/version"
import { makeGlobalNode } from "../effect/app-node"
import { existsSync } from "node:fs"

const makeDatabase = EffectDrizzleSqlite.makeWithDefaults()
type DatabaseShape = Effect.Success<typeof makeDatabase>

export interface Interface {
  db: DatabaseShape
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/storage/Database") {}

function databaseLayer(filename: string, fresh: boolean) {
  return Layer.effect(
    Service,
    Effect.gen(function* () {
      const db = yield* makeDatabase

      yield* db.run("PRAGMA synchronous = FULL")
      yield* db.run("PRAGMA busy_timeout = 5000")
      yield* db.run("PRAGMA foreign_keys = ON")
      yield* DatabaseMigration.apply(db, { path: filename, fresh })

      yield* db.run("PRAGMA journal_mode = WAL")
      yield* db.run("PRAGMA synchronous = NORMAL")
      yield* db.run("PRAGMA cache_size = -64000")

      return { db }
    }).pipe(
      Effect.catchCause((cause) => {
        const error = Cause.squash(cause)
        if (
          error instanceof DatabaseAdmissionError ||
          error instanceof DatabaseMigrationError ||
          error instanceof DatabaseBusyError ||
          error instanceof DatabaseOwnershipError ||
          error instanceof DatabaseStorageError
        )
          return Effect.fail(error)
        return Effect.fail(
          new DatabaseAdmissionError({
            path: filename,
            reason: fresh ? "initialization" : "unavailable",
            detail: fresh
              ? `Could not create the Repa database at ${filename}`
              : `Could not open the configured database at ${filename}`,
            currentVersion: DatabaseMigration.version,
            cause: error,
          }),
        )
      }),
    ),
  )
}

export function layerFromPath(filename: string) {
  return Layer.unwrap(
    Effect.sync(() => {
      const fresh = filename === ":memory:" || !existsSync(filename)
      return databaseLayer(filename, fresh).pipe(Layer.provide(sqliteLayer({ filename, disableWAL: true })))
    }),
  )
}

export function runtimeLayerFromPath(filename: string) {
  return Layer.unwrap(
    Effect.try({
      try: () => DatabaseAuthority.preflight(filename, DatabaseMigration.version),
      catch: (cause) => {
        if (cause instanceof DatabaseAdmissionError || cause instanceof DatabaseStorageError) return cause
        return new DatabaseStorageError({
          path: filename,
          reason: "unsupported",
          detail: `Could not resolve the configured Repa database target: ${filename}`,
          cause,
        })
      },
    }).pipe(
      Effect.map((target) =>
        databaseLayer(target.filename, target.initialize).pipe(
          Layer.provide(sqliteLayer({ filename: target.filename, disableWAL: true, exclusive: true })),
        ),
      ),
    ),
  )
}

export function path() {
  if (Flag.REPA_DB) {
    if (Flag.REPA_DB === ":memory:" || isAbsolute(Flag.REPA_DB)) return Flag.REPA_DB
    return join(Global.Path.data, Flag.REPA_DB)
  }
  if (
    ["latest", "beta", "prod"].includes(InstallationChannel) ||
    process.env.REPA_DISABLE_CHANNEL_DB === "1" ||
    process.env.REPA_DISABLE_CHANNEL_DB === "true"
  )
    return join(Global.Path.data, "repa.db")
  return join(Global.Path.data, `repa-${InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
}

export const node = makeGlobalNode({
  service: Service,
  layer: runtimeLayerFromPath(path()).pipe(Layer.orDie),
  deps: [],
})
