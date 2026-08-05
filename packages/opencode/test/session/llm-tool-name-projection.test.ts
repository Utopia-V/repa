import { describe, expect, test } from "bun:test"
import { LLMEvent } from "@opencode-ai/llm"
import { tool, type ModelMessage } from "ai"
import { Effect } from "effect"
import z from "zod"
import { LLMAISDK } from "@/session/llm/ai-sdk"
import { ToolNameProjection } from "@/session/llm/tool-name-projection"
import { INVALID_TOOL_ID } from "@/tool/invalid"

describe("session.llm provider tool-name projection", () => {
  test("keeps valid identities and gives invalid identities deterministic collision-safe names", () => {
    const first = ToolNameProjection.make(["representation.convert", "representation_convert", "read"])
    const second = ToolNameProjection.make(["read", "representation_convert", "representation.convert"])
    const projected = first.provider("representation.convert")
    const occupied = ToolNameProjection.make(["representation.convert", projected])

    expect(projected).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    expect(projected).not.toBe("representation_convert")
    expect(occupied.provider("representation.convert")).not.toBe(projected)
    expect(occupied.provider(projected)).toBe(projected)
    expect(first.provider("representation_convert")).toBe("representation_convert")
    expect(first.provider("read")).toBe("read")
    expect(first.internal(projected)).toBe("representation.convert")
    expect(first.binding).toEqual(second.binding)
    expect(first.binding.fingerprint).toHaveLength(64)
  })

  test("projects only tool-call and tool-result identity fields", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "representation.convert" },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "representation.convert",
            input: { nested: { toolName: "representation.convert" } },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "representation.convert",
            output: { type: "json", value: { toolName: "representation.convert" } },
          },
        ],
      },
    ] as ModelMessage[]
    const projection = ToolNameProjection.make(ToolNameProjection.messageNames(messages))
    const provider = projection.provider("representation.convert")
    const result = ToolNameProjection.messages(projection, messages)

    expect(ToolNameProjection.messageNames(result)).toEqual([provider, provider])
    expect(result[0]?.content[0]).toEqual({ type: "text", text: "representation.convert" })
    expect(result[0]?.content[1]).toMatchObject({ input: { nested: { toolName: "representation.convert" } } })
    expect(result[1]?.content[0]).toMatchObject({
      output: { type: "json", value: { toolName: "representation.convert" } },
    })
  })

  test("uses one projection for definitions and incoming events and rejects unbound names", () => {
    const projection = ToolNameProjection.make(["representation.convert", "representation_convert", "invalid"])
    const definitions = ToolNameProjection.tools(projection, {
      "representation.convert": tool({ inputSchema: z.object({ source: z.string() }) }),
      representation_convert: tool({ inputSchema: z.object({ source: z.string() }) }),
      invalid: tool({ inputSchema: z.object({ tool: z.string() }) }),
    })
    const provider = projection.provider("representation.convert")

    expect(Object.keys(definitions).toSorted()).toEqual(["invalid", provider, "representation_convert"].toSorted())
    expect(
      ToolNameProjection.event(
        projection,
        LLMEvent.toolCall({ id: "call-1", name: provider, input: { source: "a" } }),
        new Set([provider, "representation_convert"]),
      ),
    ).toMatchObject({ type: "tool-call", name: "representation.convert" })
    expect(() =>
      ToolNameProjection.event(
        projection,
        LLMEvent.toolCall({ id: "call-2", name: "not_offered", input: {} }),
        new Set([provider, "representation_convert"]),
      ),
    ).toThrow("Provider tool name is outside the prepared provider surface: not_offered")
  })

  test("reverses AI SDK stream names before creating session events", async () => {
    const projection = ToolNameProjection.make(["representation.convert", "invalid"])
    const provider = projection.provider("representation.convert")
    const events = await Effect.runPromise(
      LLMAISDK.toLLMEvents(
        LLMAISDK.adapterState(),
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: provider,
          input: { artifactID: "artifact-1" },
        },
        projection.internal,
      ),
    )

    expect(events).toEqual([
      expect.objectContaining({
        type: "tool-call",
        id: "call-1",
        name: "representation.convert",
        input: { artifactID: "artifact-1" },
      }),
    ])
  })

  test("rejects an unbound AI SDK stream name before creating a session event", async () => {
    const projection = ToolNameProjection.make(["invalid"])

    await expect(
      Effect.runPromise(
        LLMAISDK.toLLMEvents(
          LLMAISDK.adapterState(),
          {
            type: "tool-call",
            toolCallId: "call-unbound",
            toolName: "not_offered",
            input: {},
          },
          projection.internal,
        ),
      ),
    ).rejects.toThrow("Provider tool name is outside the frozen projection: not_offered")
  })

  test("accepts invalid only once with exact AI SDK repair provenance", async () => {
    const projection = ToolNameProjection.make(["read", INVALID_TOOL_ID])
    const repaired = { tool: "read", error: "filePath is required" }
    const authority: LLMAISDK.ToolEventAuthority = {
      offeredProviderNames: new Set(["read"]),
      repairedFallbacks: new Map([["call-repaired", { providerName: "read", input: repaired }]]),
    }
    const event = {
      type: "tool-call" as const,
      toolCallId: "call-repaired",
      toolName: INVALID_TOOL_ID,
      input: repaired,
    }

    const events = await Effect.runPromise(
      LLMAISDK.toLLMEvents(LLMAISDK.adapterState(), event, projection.internal, authority),
    )
    expect(events).toEqual([
      expect.objectContaining({ type: "tool-call", id: "call-repaired", name: INVALID_TOOL_ID, input: repaired }),
    ])
    expect(authority.repairedFallbacks.size).toBe(0)
    await expect(
      Effect.runPromise(LLMAISDK.toLLMEvents(LLMAISDK.adapterState(), event, projection.internal, authority)),
    ).rejects.toThrow("Provider tool name is outside the prepared provider surface: invalid")
  })

  test("rejects direct fallback names and all tool events when the prepared choice is none", async () => {
    const projection = ToolNameProjection.make(["read", INVALID_TOOL_ID])
    const noTools: LLMAISDK.ToolEventAuthority = {
      offeredProviderNames: new Set(),
      repairedFallbacks: new Map(),
    }
    const adapt = (toolName: string, id: string) =>
      Effect.runPromise(
        LLMAISDK.toLLMEvents(
          LLMAISDK.adapterState(),
          { type: "tool-call", toolCallId: id, toolName, input: {} },
          projection.internal,
          noTools,
        ),
      )

    await expect(adapt(INVALID_TOOL_ID, "call-invalid")).rejects.toThrow(
      "Provider tool name is outside the prepared provider surface: invalid",
    )
    await expect(adapt("Invalid", "call-invalid-case")).rejects.toThrow(
      "Provider tool name is outside the frozen projection: Invalid",
    )
    await expect(adapt("read", "call-none")).rejects.toThrow(
      "Provider tool name is outside the prepared provider surface: read",
    )
  })
})
