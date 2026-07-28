import { expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { AgentIdentifier } from "@/agent/identifier"
import { GeneratedAgentFile } from "@/agent/generated-agent-file"
import { Filesystem } from "@/util/filesystem"
import { tmpdir } from "../fixture/fixture"

test("rejects malicious generated identifiers before any path is created", async () => {
  await using tmp = await tmpdir()
  const targetPath = path.join(tmp.path, "scope", "agents")
  const outsidePath = path.resolve(targetPath, "../../outside.md")
  const invalid = [
    "../../outside",
    "..\\..\\outside",
    "/absolute",
    "\\\\server\\share",
    "C:\\outside",
    "C:/outside",
    ".",
    "..",
    "valid-name\n",
    "__proto__",
    "con",
    "nul",
    "com1",
    "lpt9",
  ]

  for (const identifier of invalid) {
    await expect(
      GeneratedAgentFile.create({
        targetPath,
        identifier,
        content: identifier,
        existingIdentifiers: [],
      }),
    ).rejects.toThrow()
  }

  expect(await Filesystem.exists(targetPath)).toBeFalse()
  expect(await Filesystem.exists(outsidePath)).toBeFalse()
})

test("rejects live built-in and custom agent collisions independently of file existence", async () => {
  await using tmp = await tmpdir()
  const targetPath = path.join(tmp.path, "agents")
  const existingIdentifiers = ["repa", "custom-agent"]

  for (const identifier of existingIdentifiers) {
    await expect(
      GeneratedAgentFile.create({
        targetPath,
        identifier,
        content: identifier,
        existingIdentifiers,
      }),
    ).rejects.toBeInstanceOf(AgentIdentifier.ConflictError)
  }

  expect(await Filesystem.exists(targetPath)).toBeFalse()
  expect(await Filesystem.exists(path.join(targetPath, "repa.md"))).toBeFalse()
  expect(await Filesystem.exists(path.join(targetPath, "custom-agent.md"))).toBeFalse()
})

test("creates a valid agent only inside the canonical target and never overwrites it", async () => {
  await using tmp = await tmpdir()
  const targetPath = path.join(tmp.path, "scope", "..", "agents")
  const filePath = await GeneratedAgentFile.create({
    targetPath,
    identifier: "lesson-helper",
    content: "original",
    existingIdentifiers: ["repa"],
  })
  const canonicalTarget = await fs.realpath(path.resolve(targetPath))

  expect(filePath).toBe(path.join(canonicalTarget, "lesson-helper.md"))
  expect(path.dirname(filePath)).toBe(canonicalTarget)
  expect(await Bun.file(filePath).text()).toBe("original")

  await expect(
    GeneratedAgentFile.create({
      targetPath,
      identifier: "lesson-helper",
      content: "replacement",
      existingIdentifiers: [],
    }),
  ).rejects.toBeInstanceOf(GeneratedAgentFile.ExistsError)
  expect(await Bun.file(filePath).text()).toBe("original")
})
