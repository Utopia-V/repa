import { $ } from "bun"
import semver from "semver"
import path from "path"

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]
const productVersion = rootPkg.version
const productChannel = rootPkg.repa?.channel

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}
if (typeof productVersion !== "string" || !semver.valid(productVersion)) {
  throw new Error("A valid product version is required in root package.json")
}
if (typeof productChannel !== "string" || !productChannel) {
  throw new Error("A product channel is required in root package.json")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}

const env = {
  REPA_CHANNEL: process.env["REPA_CHANNEL"],
  REPA_BUMP: process.env["REPA_BUMP"],
  REPA_VERSION: process.env["REPA_VERSION"],
  REPA_RELEASE: process.env["REPA_RELEASE"],
}
const CHANNEL = await (async () => {
  if (env.REPA_CHANNEL) return env.REPA_CHANNEL
  if (env.REPA_BUMP) return "latest"
  if (env.REPA_VERSION && semver.prerelease(env.REPA_VERSION) === null) return "latest"
  const branch = await $`git branch --show-current`.text().then((x) => x.trim())
  return !branch || branch === "main" ? productChannel : branch
})()
const IS_PREVIEW = CHANNEL !== "latest"

const VERSION = await (async () => {
  if (env.REPA_VERSION) {
    if (!semver.valid(env.REPA_VERSION)) throw new Error(`Invalid REPA_VERSION: ${env.REPA_VERSION}`)
    return env.REPA_VERSION
  }
  const t = env.REPA_BUMP?.toLowerCase()
  if (!t) return productVersion
  const parsed = semver.parse(productVersion)!
  const { major, minor, patch } = parsed
  if (t === "major") return `${major + 1}.0.0`
  if (t === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
})()

const bot = ["actions-user", "opencode", "opencode-agent[bot]"]
const teamPath = path.resolve(import.meta.dir, "../../../.github/TEAM_MEMBERS")
const team = [
  ...(await Bun.file(teamPath)
    .text()
    .then((x) => x.split(/\r?\n/).map((x) => x.trim()))
    .then((x) => x.filter((x) => x && !x.startsWith("#")))),
  ...bot,
]

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release(): boolean {
    return !!env.REPA_RELEASE
  },
  get team() {
    return team
  },
}
console.log(`repa script`, JSON.stringify(Script, null, 2))
