import type { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"

type Database = EffectDrizzleSqlite.EffectSQLiteDatabase

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
