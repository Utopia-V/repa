import fs from "fs/promises"
import path from "path"
import { Filesystem } from "@/util/filesystem"
import { AgentIdentifier } from "./identifier"

export class ExistsError extends Error {
  constructor(readonly filePath: string) {
    super(`Agent file already exists: ${filePath}`)
    this.name = "GeneratedAgentFileExistsError"
  }
}

export async function create(input: {
  targetPath: string
  identifier: unknown
  content: string
  existingIdentifiers: readonly string[]
}) {
  const identifier = AgentIdentifier.parse(input.identifier)
  if (!AgentIdentifier.isAvailable(identifier, input.existingIdentifiers)) {
    throw new AgentIdentifier.ConflictError({ identifier })
  }

  const requestedTargetPath = path.resolve(input.targetPath)
  await fs.mkdir(requestedTargetPath, { recursive: true })
  const targetPath = await fs.realpath(requestedTargetPath)
  const filePath = path.resolve(targetPath, `${identifier}.md`)
  if (path.dirname(filePath) !== targetPath) {
    throw new Error(`Generated agent path escaped its target directory: ${filePath}`)
  }
  if (await Filesystem.exists(filePath)) throw new ExistsError(filePath)

  const handle = await fs.open(filePath, "wx").catch((error: unknown) => {
    if (isAlreadyExists(error)) throw new ExistsError(filePath)
    throw error
  })
  try {
    await handle.writeFile(input.content)
  } finally {
    await handle.close()
  }
  return filePath
}

function isAlreadyExists(error: unknown): error is { code: "EEXIST" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST"
}

export * as GeneratedAgentFile from "./generated-agent-file"
