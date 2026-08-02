#!/usr/bin/env bun

import { $ } from "bun"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"
import { parseArgs } from "util"

const root = path.resolve(import.meta.dirname, "../../..")
const snapshot = path.join(root, "packages/core/schema.json")
const tsDir = path.join(root, "packages/core/src/database/migration/repa")
const registry = path.join(root, "packages/core/src/database/migration.gen.ts")
const schema = path.join(root, "packages/core/src/database/schema.gen.ts")
// These text-keyed append-only authorities must not expose SQLite's hidden replacement-conflict key.
const withoutRowidTables = new Set([
  "course_state_history",
  "learner_course_route_anchor_transition",
  "learner_default_course_acknowledgement",
  "learner_default_course_disposition",
  "learner_default_course_capability_issue",
  "learner_default_course_capability_settlement",
  "learner_default_course_proposal",
  "learner_default_course_transition",
  "learner_goal_capability_issue_v2",
  "learner_goal_capability_settlement_v2",
  "learner_goal_disposition_v2",
  "learner_goal_time_zone",
  "learner_goal_time_zone_release",
  "learning_bootstrap_disposition",
  "learning_bootstrap_capability_issue",
  "learning_bootstrap_capability_settlement",
  "learning_bootstrap_effect",
  "learning_bootstrap_commit_seal",
  "learning_course_material_adoption",
  "learning_bootstrap_course_result",
  "learning_bootstrap_route_result",
  "learning_bootstrap_selection_result",
  "learning_bootstrap_material_result",
  "learning_bootstrap_map_result",
  "learning_bootstrap_alignment_result",
  "learning_bootstrap_anchor_result",
  "learning_command_receipt",
])
const args = parseArgs({
  args: process.argv.slice(2),
  options: {
    check: { type: "boolean" },
    name: { type: "string" },
  },
})

if (args.values.check) {
  await check()
  process.exit(0)
}

await generate()

async function generate() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "repa-core-migration-"))
  const incremental = path.join(temporary, "incremental")
  const full = path.join(temporary, "full")
  try {
    await fs.mkdir(incremental)
    await fs.mkdir(path.join(incremental, "baseline"))
    await fs.copyFile(snapshot, path.join(incremental, "baseline/snapshot.json"))
    await drizzle(temporary, incremental, args.values.name)

    const generated = await generatedMigrations(incremental)
    if (generated.length > 1) throw new Error(`Expected one generated migration, found ${generated.length}.`)
    const name = generated[0]
    if (name) {
      await fs.mkdir(tsDir, { recursive: true })
      const target = path.join(tsDir, `${name}.ts`)
      if (await Bun.file(target).exists()) throw new Error(`Database migration already exists: ${name}`)
      await Bun.write(
        target,
        await formatTypescript(
          renderMigration(name, await Bun.file(path.join(incremental, name, "migration.sql")).text()),
        ),
      )
      await fs.copyFile(path.join(incremental, name, "snapshot.json"), snapshot)
    }

    await fs.mkdir(full)
    await drizzle(temporary, full, "schema")
    await Bun.write(schema, await formatTypescript(renderSchema(await generatedSql(full))))
    await Bun.write(registry, await formatTypescript(renderRegistry(await typescriptMigrations())))
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
}

async function check() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "repa-core-migration-check-"))
  const incremental = path.join(temporary, "incremental")
  const full = path.join(temporary, "full")
  try {
    await fs.mkdir(incremental)
    await fs.mkdir(path.join(incremental, "baseline"))
    await fs.copyFile(snapshot, path.join(incremental, "baseline/snapshot.json"))
    await drizzle(temporary, incremental)
    if ((await generatedMigrations(incremental)).length > 0) {
      throw new Error(
        "Core schema has ungenerated database migrations. Run `bun script/migration.ts` from packages/core.",
      )
    }

    await fs.mkdir(full)
    await drizzle(temporary, full, "schema")
    if (
      normalizeNewlines(await Bun.file(schema).text()) !==
      normalizeNewlines(await formatTypescript(renderSchema(await generatedSql(full))))
    ) {
      throw new Error("Current database schema is stale. Run `bun script/migration.ts` from packages/core.")
    }

    const migrations = await typescriptMigrations()
    if (
      normalizeNewlines(await Bun.file(registry).text()) !==
      normalizeNewlines(await formatTypescript(renderRegistry(migrations)))
    ) {
      throw new Error("Database migration registry is stale. Run `bun script/migration.ts` from packages/core.")
    }
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
}

async function drizzle(temporary: string, output: string, name?: string) {
  const config = path.join(temporary, `${path.basename(output)}.config.ts`)
  await Bun.write(
    config,
    `import config from ${JSON.stringify(pathToFileURL(path.join(root, "packages/core/drizzle.config.ts")).href)}

export default { ...config, out: ${JSON.stringify(output)} }
`,
  )
  await $`bun drizzle-kit generate --config ${config} ${name ? ["--name", name] : []}`.cwd(
    path.join(root, "packages/core"),
  )
}

async function generatedMigrations(directory: string) {
  return (await Array.fromAsync(new Bun.Glob("*/migration.sql").scan({ cwd: directory })))
    .map((file) => file.replaceAll("\\", "/").split("/")[0])
    .filter((name): name is string => name !== undefined)
    .sort()
}

async function generatedSql(directory: string) {
  const generated = await generatedMigrations(directory)
  if (generated.length !== 1) throw new Error(`Expected one full schema migration, found ${generated.length}.`)
  return Bun.file(path.join(directory, generated[0]!, "migration.sql")).text()
}

async function typescriptMigrations() {
  return (await Array.fromAsync(new Bun.Glob("*.ts").scan({ cwd: tsDir })))
    .map((file) => path.basename(file, ".ts"))
    .sort()
}

function renderMigration(name: string, sql: string) {
  return `import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"

export default {
  id: ${JSON.stringify(name)},
  up(tx) {
    return Effect.gen(function* () {
${renderStatements(sql)}
    })
  },
} satisfies DatabaseMigration.Migration
`
}

function renderSchema(sql: string) {
  return `import { Effect } from "effect"
import type { DatabaseMigration } from "./migration"

export default {
  up(tx) {
    return Effect.gen(function* () {
${renderStatements(sql)}
    })
  },
} satisfies Omit<DatabaseMigration.Migration, "id">
`
}

function renderStatements(sql: string) {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
    .map(applyTableOptions)
    .map(renderRun)
    .join("\n")
}

function applyTableOptions(statement: string) {
  const generatedName = /^CREATE TABLE `([^`]+)` \(/.exec(statement)?.[1]
  const tableName = generatedName?.replace(/^__new_/, "")
  if (!tableName || !withoutRowidTables.has(tableName)) return statement
  if (!statement.endsWith(");")) throw new Error(`Cannot apply WITHOUT ROWID to generated table ${generatedName}.`)
  return `${statement.slice(0, -1)} WITHOUT ROWID;`
}

function renderRun(statement: string) {
  const lines = statement.replaceAll("\t", "  ").split("\n")
  if (lines.length === 1) return `      yield* tx.run(\`${escapeTemplate(lines[0])}\`)`
  return `      yield* tx.run(\`\n${lines.map((line) => `        ${escapeTemplate(line)}`).join("\n")}\n      \`)`
}

function escapeTemplate(line: string) {
  return line.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${")
}

async function formatTypescript(input: string) {
  const prettier = await import("prettier")
  const typescript = await import("prettier/plugins/typescript")
  const estree = await import("prettier/plugins/estree")
  return prettier.format(input, {
    parser: "typescript",
    plugins: [typescript.default, estree.default],
    semi: false,
    printWidth: 120,
  })
}

function renderRegistry(names: string[]) {
  if (names.length === 0) {
    return `import type { DatabaseMigration } from "./migration"

export const migrations = [] satisfies DatabaseMigration.Migration[]
`
  }
  return `import type { DatabaseMigration } from "./migration"

export const migrations = (
  await Promise.all([
${names.map((name) => `    import("./migration/repa/${name}"),`).join("\n")}
  ])
).map((module) => module.default) satisfies DatabaseMigration.Migration[]
`
}

function normalizeNewlines(input: string) {
  return input.replaceAll("\r\n", "\n")
}
