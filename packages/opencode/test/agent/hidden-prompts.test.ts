import { describe, expect, test } from "bun:test"
import TITLE from "@/agent/prompt/title.txt"
import SUMMARY from "@/agent/prompt/summary.txt"
import COMPACTION from "@/agent/prompt/compaction.txt"
import GENERATE from "@/agent/generate.txt"
import { Agent } from "@/agent/agent"
import { SystemPrompt } from "@/session/system"

describe("narrow Repa internal prompts", () => {
  test("title prompt optimizes Session retrieval without a coding default", () => {
    expect(TITLE).toContain("find this Session later")
    expect(TITLE).toContain("理解特征值")
    expect(TITLE).not.toMatch(/debug 500|refactor user service|codebase|pull request/i)
  })

  test("conversation summary preserves learning continuity rather than a PR narrative", () => {
    expect(SUMMARY).toContain("learning continuity")
    expect(SUMMARY).toContain("Do not claim mastery")
    expect(SUMMARY).not.toMatch(/pull request|I added|I fixed/i)
  })

  test("compaction is continuation context rather than learning truth", () => {
    expect(COMPACTION).toContain("continuation context")
    expect(COMPACTION).toContain("not durable learning truth")
    expect(COMPACTION).not.toMatch(/coding sessions|pull request/i)
  })

  test("agent generation specializes Repa without changing the product identity", () => {
    expect(GENERATE).toContain("specialized Repa agent profile")
    expect(GENERATE).toContain("cannot replace Repa's product contract")
    expect(GENERATE).not.toMatch(/elite AI agent architect|CLAUDE\.md|review code/i)
  })

  test("agent generation keeps the internal operation boundary non-replaceable", () => {
    const system = Agent.generationSystem(["PLUGIN_REPLACEMENT", SystemPrompt.internal(), SystemPrompt.product()])

    expect(system[0]).toBe(SystemPrompt.internal())
    expect(system).toContain(GENERATE)
    expect(system).toContain("PLUGIN_REPLACEMENT")
    expect(system.join("\n").split("<repa_internal_operation>")).toHaveLength(2)
    expect(system.join("\n")).not.toContain("<repa_product_contract>")
  })
})
