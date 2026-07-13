import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "crypto"
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import { tmpdir } from "../fixture/fixture"

const cli = fileURLToPath(new URL("../../src/index.ts", import.meta.url))
const children = new Set<ReturnType<typeof Bun.spawn>>()

afterEach(async () => {
  await Promise.all(
    [...children].map(async (child) => {
      if (child.exitCode === null) child.kill()
      await child.exited
    }),
  )
  children.clear()
})

type Result = {
  exitCode: number
  stdout: string
  stderr: string
}

type Fixture = Awaited<ReturnType<typeof makeFixture>>

async function run(input: Fixture, args: string[], extra: Record<string, string> = {}): Promise<Result> {
  const child = Bun.spawn([process.execPath, "run", "--conditions=browser", cli, ...args], {
    cwd: input.workspace,
    env: { ...input.env, ...extra },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  children.add(child)
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  children.delete(child)
  return { exitCode, stdout, stderr }
}

function cleanEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !entry[0].startsWith("OPENCODE_") && !entry[0].startsWith("REPA_"),
    ),
  )
}

async function write(target: string, value: string) {
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, value)
}

async function makeFixture(root: string) {
  const home = path.join(root, "home")
  const workspace = path.join(root, "workspace")
  const systemTmp = path.join(root, "system-tmp")
  const xdg = {
    data: path.join(root, "xdg-data"),
    cache: path.join(root, "xdg-cache"),
    config: path.join(root, "xdg-config"),
    state: path.join(root, "xdg-state"),
  }
  const managed = {
    repa: path.join(root, "managed-repa"),
    opencode: path.join(root, "managed-opencode"),
  }
  const opencodeHome = path.join(root, "opencode-home")
  const opencodeConfigOverride = path.join(root, "opencode-config-override.json")
  const opencodeConfigDir = path.join(root, "opencode-config-dir")
  const opencodeDatabaseOverride = path.join(root, "opencode-database-override.db")
  const pluginMarker = path.join(root, "opencode-plugin-loaded")

  await Promise.all([
    fs.mkdir(home, { recursive: true }),
    fs.mkdir(workspace, { recursive: true }),
    fs.mkdir(systemTmp, { recursive: true }),
    ...Object.values(xdg).map((item) => fs.mkdir(item, { recursive: true })),
    fs.mkdir(managed.repa, { recursive: true }),
    fs.mkdir(managed.opencode, { recursive: true }),
    fs.mkdir(opencodeHome, { recursive: true }),
    fs.mkdir(opencodeConfigDir, { recursive: true }),
  ])

  const git = Bun.spawn(["git", "init"], { cwd: workspace, stdin: "ignore", stdout: "ignore", stderr: "pipe" })
  if ((await git.exited) !== 0) throw new Error(`git init failed: ${await new Response(git.stderr).text()}`)
  const opencodeProjectCache = path.join(workspace, ".git", "opencode")
  await write(opencodeProjectCache, "OpenCode project cache sentinel")

  const opencodeRoots = [
    path.join(xdg.data, "opencode"),
    path.join(xdg.cache, "opencode"),
    path.join(xdg.config, "opencode"),
    path.join(xdg.state, "opencode"),
    path.join(systemTmp, "opencode"),
  ]
  await Promise.all(opencodeRoots.map((item) => write(path.join(item, "sentinel"), item)))

  await write(path.join(workspace, "repa.json"), JSON.stringify({ model: "repa/root" }))
  await write(path.join(workspace, ".repa", "repa.json"), JSON.stringify({ small_model: "repa/local" }))
  await write(path.join(workspace, "opencode.json"), "{ invalid OpenCode project config")
  await write(path.join(workspace, ".opencode", "opencode.json"), JSON.stringify({ model: "opencode/local" }))
  await write(
    path.join(workspace, ".opencode", "plugin", "sentinel.ts"),
    `await Bun.write(${JSON.stringify(pluginMarker)}, "loaded")\nexport default async () => ({})\n`,
  )
  await write(path.join(opencodeHome, ".opencode", "opencode.json"), JSON.stringify({ model: "opencode/home" }))
  await write(path.join(xdg.config, "opencode", "opencode.json"), JSON.stringify({ model: "opencode/global" }))
  await write(path.join(managed.opencode, "opencode.json"), "{ invalid OpenCode managed config")
  await write(opencodeConfigOverride, "{ invalid OpenCode config override")
  await write(path.join(opencodeConfigDir, "opencode.json"), "{ invalid OpenCode config directory")
  await write(opencodeDatabaseOverride, "OpenCode database sentinel")

  const env = {
    ...cleanEnv(),
    CI: "1",
    NO_COLOR: "1",
    HOME: home,
    USERPROFILE: home,
    TEMP: systemTmp,
    TMP: systemTmp,
    TMPDIR: systemTmp,
    XDG_DATA_HOME: xdg.data,
    XDG_CACHE_HOME: xdg.cache,
    XDG_CONFIG_HOME: xdg.config,
    XDG_STATE_HOME: xdg.state,
    REPA_TEST_HOME: home,
    REPA_TEST_MANAGED_CONFIG_DIR: managed.repa,
    REPA_DISABLE_AUTOUPDATE: "1",
    REPA_DISABLE_MODELS_FETCH: "1",
    REPA_DISABLE_DEFAULT_PLUGINS: "1",
    REPA_DISABLE_CHANNEL_DB: "1",
    OPENCODE_TEST_HOME: opencodeHome,
    OPENCODE_TEST_MANAGED_CONFIG_DIR: managed.opencode,
    OPENCODE_CONFIG: opencodeConfigOverride,
    OPENCODE_CONFIG_DIR: opencodeConfigDir,
    OPENCODE_CONFIG_CONTENT: "{ invalid OpenCode config content",
    OPENCODE_DB: opencodeDatabaseOverride,
  }

  return {
    root,
    home,
    workspace,
    systemTmp,
    xdg,
    managed,
    opencodeRoots: [
      ...opencodeRoots,
      path.join(workspace, "opencode.json"),
      path.join(workspace, ".opencode"),
      path.join(opencodeHome, ".opencode"),
      managed.opencode,
      opencodeConfigOverride,
      opencodeConfigDir,
      opencodeDatabaseOverride,
      opencodeProjectCache,
    ],
    opencodeDatabaseOverride,
    pluginMarker,
    env,
  }
}

type Snapshot =
  | { type: "missing" }
  | { type: "file"; size: number; mtimeMs: number; digest: string }
  | { type: "directory"; mtimeMs: number; entries: Record<string, Snapshot> }

async function snapshot(target: string): Promise<Snapshot> {
  const stat = await fs.lstat(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (!stat) return { type: "missing" }
  if (!stat.isDirectory()) {
    const bytes = await fs.readFile(target)
    return {
      type: "file",
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      digest: createHash("sha256").update(bytes).digest("hex"),
    }
  }
  const entries: Record<string, Snapshot> = {}
  for (const name of (await fs.readdir(target)).sort()) {
    entries[name] = await snapshot(path.join(target, name))
  }
  return { type: "directory", mtimeMs: stat.mtimeMs, entries }
}

async function snapshotOpenCode(input: Fixture) {
  return Object.fromEntries(await Promise.all(input.opencodeRoots.map(async (item) => [item, await snapshot(item)])))
}

function expectSuccess(result: Result) {
  expect(result.exitCode, result.stderr || result.stdout).toBe(0)
}

describe("Repa product and state identity", () => {
  test(
    "a fresh launch uses Repa paths and ignores OpenCode config, plugins, environment, and database overrides",
    async () => {
      await using tmp = await tmpdir()
      const input = await makeFixture(tmp.path)
      const before = await snapshotOpenCode(input)

      const help = await run(input, ["--help"])
      expectSuccess(help)
      const helpText = help.stdout + help.stderr
      expect(helpText).toMatch(/(?:^|\n)\s*repa completion\b/)
      expect(helpText.toLowerCase()).not.toContain("opencode")

      const paths = await run(input, ["debug", "paths"])
      expectSuccess(paths)
      for (const expected of [
        path.join(input.xdg.data, "repa"),
        path.join(input.xdg.cache, "repa"),
        path.join(input.xdg.config, "repa"),
        path.join(input.xdg.state, "repa"),
        path.join(input.systemTmp, "repa"),
      ]) {
        expect(paths.stdout).toContain(expected)
      }
      for (const forbidden of [
        path.join(input.xdg.data, "opencode"),
        path.join(input.xdg.cache, "opencode"),
        path.join(input.xdg.config, "opencode"),
        path.join(input.xdg.state, "opencode"),
        path.join(input.systemTmp, "opencode"),
      ]) {
        expect(paths.stdout).not.toContain(forbidden)
      }

      const database = await run(input, ["db", "path"])
      expectSuccess(database)
      expect(database.stdout.trim()).toBe(path.join(input.xdg.data, "repa", "repa.db"))
      expect(database.stdout).not.toContain(input.opencodeDatabaseOverride)

      const config = await run(input, ["debug", "config"])
      expectSuccess(config)
      expect(JSON.parse(config.stdout)).toMatchObject({ model: "repa/root", small_model: "repa/local" })
      expect(await snapshot(input.pluginMarker)).toEqual({ type: "missing" })
      expect(await snapshotOpenCode(input)).toEqual(before)
    },
    60_000,
  )

  test(
    "an unusable partial Repa home fails closed and a repaired restart completes it in place",
    async () => {
      await using tmp = await tmpdir()
      const input = await makeFixture(tmp.path)
      const before = await snapshotOpenCode(input)
      const blocked = path.join(input.xdg.data, "repa")
      await write(blocked, "not a directory")

      const failed = await run(input, ["debug", "paths"])
      expect(failed.exitCode).not.toBe(0)
      expect(await snapshotOpenCode(input)).toEqual(before)

      await fs.rm(blocked)
      const recovered = await run(input, ["debug", "paths"])
      expectSuccess(recovered)
      for (const expected of [
        path.join(input.xdg.data, "repa"),
        path.join(input.xdg.cache, "repa"),
        path.join(input.xdg.config, "repa"),
        path.join(input.xdg.state, "repa"),
        path.join(input.systemTmp, "repa"),
      ]) {
        expect((await fs.stat(expected)).isDirectory()).toBe(true)
      }
      expect(await snapshotOpenCode(input)).toEqual(before)
    },
    60_000,
  )

  test(
    "a Repa database path collision fails without an OpenCode or alternate database fallback",
    async () => {
      await using tmp = await tmpdir()
      const input = await makeFixture(tmp.path)
      const before = await snapshotOpenCode(input)
      const data = path.join(input.xdg.data, "repa")
      const database = path.join(data, "repa.db")
      await fs.mkdir(database, { recursive: true })

      const failed = await run(input, ["db", "SELECT 1"])
      expect(failed.exitCode).not.toBe(0)
      expect(await snapshotOpenCode(input)).toEqual(before)
      expect((await fs.lstat(database)).isDirectory()).toBe(true)
      expect((await fs.readdir(data)).filter((item) => /^repa(?:-.+)?\.db$/.test(item))).toEqual(["repa.db"])

      await fs.rm(database, { recursive: true })
      const recovered = await run(input, ["db", "SELECT 1"])
      expectSuccess(recovered)
      expect((await fs.stat(database)).isFile()).toBe(true)
      expect(await snapshotOpenCode(input)).toEqual(before)
    },
    60_000,
  )
})
