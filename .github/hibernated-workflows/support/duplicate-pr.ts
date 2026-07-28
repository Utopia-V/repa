#!/usr/bin/env bun

// Inactive fork evidence. The OpenCode agent/tool control files this script
// depended on were retired from Repa's project root.

import path from "path"
import { pathToFileURL } from "bun"
import { createOpencode } from "@opencode-ai/sdk"
import { parseArgs } from "util"

if (process.env.REPA_RUN_HIBERNATED_OPENCODE_AUTOMATION !== "1")
  throw new Error("Refusing to run hibernated upstream pull-request automation")

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      file: { type: "string", short: "f" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  })

  if (values.help) {
    console.log(`
Usage: bun .github/hibernated-workflows/support/duplicate-pr.ts [options] <message>

Options:
  -f, --file <path>   File to attach to the prompt
  -h, --help          Show this help message

Examples:
  REPA_RUN_HIBERNATED_OPENCODE_AUTOMATION=1 bun .github/hibernated-workflows/support/duplicate-pr.ts -f pr_info.txt "Check the attached file for PR details"
`)
    process.exit(0)
  }

  const message = positionals.join(" ")
  if (!message) {
    console.error("Error: message is required")
    process.exit(1)
  }

  const opencode = await createOpencode({ port: 0 })

  try {
    const parts: Array<{ type: "text"; text: string } | { type: "file"; url: string; filename: string; mime: string }> =
      []

    if (values.file) {
      const resolved = path.resolve(process.cwd(), values.file)
      const file = Bun.file(resolved)
      if (!(await file.exists())) {
        console.error(`Error: file not found: ${values.file}`)
        process.exit(1)
      }
      parts.push({
        type: "file",
        url: pathToFileURL(resolved).href,
        filename: path.basename(resolved),
        mime: "text/plain",
      })
    }

    parts.push({ type: "text", text: message })

    const session = await opencode.client.session.create()
    const result = await opencode.client.session
      .prompt({
        path: { id: session.data!.id },
        body: {
          agent: "duplicate-pr",
          parts,
        },
        signal: AbortSignal.timeout(120_000),
      })
      .then((x) => x.data?.parts?.find((y) => y.type === "text")?.text ?? "")

    console.log(result.trim())
  } finally {
    opencode.server.close()
  }
}

void main()
