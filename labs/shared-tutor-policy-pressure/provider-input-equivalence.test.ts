import { describe, expect, test } from "bun:test"
import {
  compareProviderVisibleRequestTraces,
  readProviderReplayFixture,
  verifyRecordedPilotProviderInputEquivalence,
} from "./provider-input-equivalence"

const OLD_CONCERN = "agenda:11111111-1111-4111-8111-111111111111"
const NEW_CONCERN = "agenda:22222222-2222-4222-8222-222222222222"
const OLD_EFFECT = "effect:agenda:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const NEW_EFFECT = "effect:agenda:bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb"

describe("ALS-021 provider-visible input equivalence", () => {
  test("alpha-renames generated Agenda identities while preserving their references", () => {
    const expected = [requestFixture(OLD_CONCERN, OLD_EFFECT)]
    const actual = [requestFixture(NEW_CONCERN, NEW_EFFECT)]

    expect(compareProviderVisibleRequestTraces(expected, actual)).toMatchObject({
      equivalent: true,
      expectedGeneratedIdentities: { agendaConcern: 1, agendaEffect: 1 },
      actualGeneratedIdentities: { agendaConcern: 1, agendaEffect: 1 },
    })
  })

  test("does not hide a changed generated-identity relationship", () => {
    const expected = [requestFixture(OLD_CONCERN, OLD_EFFECT)]
    const actual = [requestFixture(NEW_CONCERN, NEW_EFFECT)]
    const differentConcern = "agenda:33333333-3333-4333-8333-333333333333"
    const prompt = actual[0]!.prompt as Array<Record<string, unknown>>
    const toolMessage = prompt[2]!.content as Array<Record<string, unknown>>
    const output = toolMessage[0]!.output as { value: { concern: { id: string } } }
    output.value.concern.id = differentConcern

    expect(compareProviderVisibleRequestTraces(expected, actual).equivalent).toBe(false)
  })

  for (const counterexample of [
    {
      name: "prompt text",
      mutate(request: ReturnType<typeof requestFixture>) {
        ;(request.prompt[0] as { content: string }).content = "A different Tutor policy prompt."
      },
    },
    {
      name: "tool schema",
      mutate(request: ReturnType<typeof requestFixture>) {
        const schema = request.tools[0]!.inputSchema as {
          properties: { concernId: { minLength: number } }
        }
        schema.properties.concernId.minLength = 2
      },
    },
    {
      name: "sampling timestamp",
      mutate(request: ReturnType<typeof requestFixture>) {
        const system = request.prompt[0] as { content: string }
        system.content = system.content.replace(
          "2026-07-12T01:00:00.002Z",
          "2026-07-12T01:00:00.003Z",
        )
      },
    },
    {
      name: "toolCallId",
      mutate(request: ReturnType<typeof requestFixture>) {
        const assistant = request.prompt[1] as {
          content: Array<{ type: string; toolCallId?: string }>
        }
        assistant.content[0]!.toolCallId = "call-changed"
      },
    },
  ]) {
    test(`rejects a changed ${counterexample.name}`, () => {
      const expected = [requestFixture(OLD_CONCERN, OLD_EFFECT)]
      const actual = structuredClone(expected)
      counterexample.mutate(actual[0]!)

      const comparison = compareProviderVisibleRequestTraces(expected, actual)
      expect(comparison.equivalent).toBe(false)
      expect(comparison.difference).toBeDefined()
    })
  }

  test("the durable fixture is self-contained and contains no transport secrets", async () => {
    const fixture = await readProviderReplayFixture()

    expect(fixture.schemaRevision).toBe("als-021-provider-replay-v1")
    expect(fixture.provenance.sourceFingerprint).toBe("5171a2474590")
    expect(fixture.traces).toHaveLength(14)
    expect(fixture.traces.reduce((sum, trace) => sum + trace.requests.length, 0)).toBe(29)
    expect(JSON.stringify(fixture)).not.toMatch(
      /authorization|api[_-]?key|providerRequest|providerResponse|cookie|\[REDACTED\]/i,
    )
  })

  test(
    "replays all selected second-pilot outputs through the current Tutor loop",
    async () => {
      const report = await verifyRecordedPilotProviderInputEquivalence()

      expect(report).toMatchObject({
        equivalent: true,
        baselineSourceFingerprint: "5171a2474590",
        currentPolicyProfileRevision: "tutor-default-v2",
        casesCompared: 14,
        requestsCompared: 29,
      })
      expect(report.failures).toEqual([])
    },
    30_000,
  )
})

function requestFixture(concernId: string, effectId: string) {
  return {
    maxOutputTokens: 1_200,
    tools: [
      {
        type: "function",
        name: "address_future_attention",
        description: "Address one concern.",
        inputSchema: {
          type: "object",
          properties: { concernId: { type: "string", minLength: 1 } },
          required: ["concernId"],
          additionalProperties: false,
        },
      },
    ],
    toolChoice: { type: "auto" },
    prompt: [
      {
        role: "system",
        content:
          `Open concern ${concernId}. ` +
          "Sampling time: 2026-07-12T01:00:00.002Z.",
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-stable",
            toolName: "address_future_attention",
            input: { concernId },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-stable",
            toolName: "address_future_attention",
            output: {
              type: "json",
              value: {
                operationEffectId: effectId,
                concern: { id: concernId, status: "addressed", version: 2 },
              },
            },
          },
        ],
      },
    ],
    includeRawChunks: false,
  }
}
