#!/usr/bin/env bun

// Inactive fork evidence. The OpenCode /changelog command this script invokes
// was retired from Repa's project root.

import { rm } from "fs/promises"
import path from "path"
import { parseArgs } from "util"

if (process.env.REPA_RUN_HIBERNATED_OPENCODE_AUTOMATION !== "1")
  throw new Error("Refusing to run hibernated upstream changelog automation")

const root = path.resolve(import.meta.dir, "../../..")
const file = path.join(root, "UPCOMING_CHANGELOG.md")
const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    from: { type: "string", short: "f" },
    to: { type: "string", short: "t" },
    variant: { type: "string", default: "low" },
    quiet: { type: "boolean", default: false },
    print: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
})
const args = [...positionals]

if (values.from) args.push("--from", values.from)
if (values.to) args.push("--to", values.to)

if (values.help) {
  console.log(`
Usage: bun .github/hibernated-workflows/support/changelog.ts [options]

Generates UPCOMING_CHANGELOG.md by running the opencode changelog command.

Options:
  -f, --from <version>   Starting version (default: latest non-draft GitHub release)
  -t, --to <ref>         Ending ref (default: HEAD)
      --variant <name>   Thinking variant for opencode run (default: low)
      --quiet            Suppress opencode command output unless it fails
      --print            Print the generated UPCOMING_CHANGELOG.md after success
  -h, --help             Show this help message

Examples:
  REPA_RUN_HIBERNATED_OPENCODE_AUTOMATION=1 bun .github/hibernated-workflows/support/changelog.ts
  REPA_RUN_HIBERNATED_OPENCODE_AUTOMATION=1 bun .github/hibernated-workflows/support/changelog.ts --from 1.0.200
  REPA_RUN_HIBERNATED_OPENCODE_AUTOMATION=1 bun .github/hibernated-workflows/support/changelog.ts -f 1.0.200 -t 1.0.205
`)
  process.exit(0)
}

await rm(file, { force: true })

const quiet = values.quiet
const cmd = ["opencode", "run"]
cmd.push("--variant", values.variant)
cmd.push("--command", "changelog", "--", ...args)

const proc = Bun.spawn(cmd, {
  cwd: root,
  stdin: "inherit",
  stdout: quiet ? "pipe" : "inherit",
  stderr: quiet ? "pipe" : "inherit",
})

const [out, err] = quiet
  ? await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  : ["", ""]
const code = await proc.exited
if (code === 0) {
  if (values.print) process.stdout.write(await Bun.file(file).text())
  process.exit(0)
}

if (quiet) {
  if (out) process.stdout.write(out)
  if (err) process.stderr.write(err)
}

process.exit(code)
