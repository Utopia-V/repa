import path from "node:path"
import { Schema } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Global } from "@opencode-ai/core/global"
import { Flock } from "@opencode-ai/core/util/flock"

export class LearnerHomeBusyError extends Schema.TaggedErrorClass<LearnerHomeBusyError>()("LearnerHomeBusyError", {
  database: Schema.String,
}) {
  override get message() {
    return `Another Repa process owns the LearnerHome database at ${this.database}. If you intentionally started \`repa serve\`, connect with \`repa attach <url>\` instead.`
  }
}

export class LearnerHomeOwnershipError extends Schema.TaggedErrorClass<LearnerHomeOwnershipError>()(
  "LearnerHomeOwnershipError",
  {
    database: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message() {
    return `Could not establish LearnerHome ownership for ${this.database}`
  }
}

export interface Handle {
  readonly database: string
  readonly release: () => Promise<void>
}

type Owned = {
  readonly database: string
  readonly key: string
  readonly lease: Flock.Lease
  readonly onExit: () => void
  refs: number
  releasing?: Promise<void>
}

let acquisition: Promise<Owned> | undefined

function identity() {
  const database = Database.path()
  const resolved = database === ":memory:" ? database : path.resolve(database)
  const authority = database === ":memory:" ? path.join(Global.Path.data, "repa.db") : resolved
  return {
    database: resolved,
    key: `learner-home:${process.platform === "win32" ? authority.toLowerCase() : authority}`,
  }
}

async function start(database: string, key: string) {
  try {
    const lease = await Flock.tryAcquire(key)
    if (!lease) throw new LearnerHomeBusyError({ database })
    const owned: Owned = {
      database,
      key,
      lease,
      refs: 0,
      onExit: () => {
        try {
          lease.releaseSync()
        } catch {}
      },
    }
    process.once("exit", owned.onExit)
    return owned
  } catch (cause) {
    if (cause instanceof LearnerHomeBusyError) throw cause
    throw new LearnerHomeOwnershipError({ database, cause })
  }
}

export async function acquire(): Promise<Handle> {
  const target = identity()
  acquisition ??= start(target.database, target.key).catch((error) => {
    acquisition = undefined
    throw error
  })
  const owned = await acquisition
  if (owned.releasing) {
    await owned.releasing
    return acquire()
  }
  if (owned.key !== target.key) {
    throw new LearnerHomeOwnershipError({
      database: target.database,
      cause: new Error(`This process already owns a different LearnerHome database: ${owned.database}`),
    })
  }

  owned.refs += 1
  let released = false
  return {
    database: owned.database,
    async release() {
      if (released) return
      released = true
      owned.refs -= 1
      if (owned.refs > 0) return

      process.off("exit", owned.onExit)
      const current = acquisition
      owned.releasing = owned.lease.release().finally(() => {
        if (acquisition === current) acquisition = undefined
      })
      await owned.releasing
    },
  }
}

export * as LearnerHomeOwnership from "./ownership"
