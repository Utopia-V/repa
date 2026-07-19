import { describe, expect, test } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Session } from "@/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { MessageV2 } from "../../src/session/message-v2"
import { testEffect } from "../lib/effect"
import { MessageID, SessionID } from "@/session/schema"
import { Turn } from "@opencode-ai/schema/turn"

// Skip tests if no API key is available
const hasApiKey = !!process.env.ANTHROPIC_API_KEY
const it = testEffect(AppNodeBuilder.build(LayerNode.group([SessionPrompt.node, Session.node, Ripgrep.node])))
const live = hasApiKey ? it.instance : it.instance.skip

describe("StructuredOutput Integration", () => {
  live(
    "produces structured output with simple schema",
    () =>
      Effect.gen(function* () {
        const prompt = yield* SessionPrompt.Service
        const sessions = yield* Session.Service
        const sessionID = SessionID.create()
        const turnID = Turn.ID.create()
        yield* prompt.start({
          sessionID,
          turnID,
          inputID: Turn.InputID.create(),
          messageID: MessageID.ascending(),
          session: { title: "Structured Output Test" },
          parts: [
            {
              type: "text",
              text: "What is 2 + 2? Provide a simple answer.",
            },
          ],
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                answer: { type: "number", description: "The numerical answer" },
                explanation: { type: "string", description: "Brief explanation" },
              },
              required: ["answer"],
            },
            retryCount: 0,
          },
        })

        yield* prompt.awaitTurn(sessionID, turnID)
        const result = (yield* sessions.messages({ sessionID })).findLast(
          (message) => message.info.role === "assistant",
        )
        expect(result).toBeDefined()
        if (!result) return yield* Effect.die("Expected assistant response")
        expect(result.info.role).toBe("assistant")
        if (result.info.role === "assistant") {
          expect(result.info.structured).toBeDefined()
          expect(typeof result.info.structured).toBe("object")

          const output = result.info.structured as any
          expect(output.answer).toBe(4)

          // Verify no error was set
          expect(result.info.error).toBeUndefined()
        }

        // Clean up
        // Note: Not removing session to avoid race with background SessionSummary.summarize
      }),
    { git: true },
    60000,
  )

  live(
    "produces structured output with nested objects",
    () =>
      Effect.gen(function* () {
        const prompt = yield* SessionPrompt.Service
        const sessions = yield* Session.Service
        const sessionID = SessionID.create()
        const turnID = Turn.ID.create()
        yield* prompt.start({
          sessionID,
          turnID,
          inputID: Turn.InputID.create(),
          messageID: MessageID.ascending(),
          session: { title: "Nested Schema Test" },
          parts: [
            {
              type: "text",
              text: "Tell me about Anthropic company in a structured format.",
            },
          ],
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                company: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    founded: { type: "number" },
                  },
                  required: ["name", "founded"],
                },
                products: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["company"],
            },
            retryCount: 0,
          },
        })

        yield* prompt.awaitTurn(sessionID, turnID)
        const result = (yield* sessions.messages({ sessionID })).findLast(
          (message) => message.info.role === "assistant",
        )
        expect(result).toBeDefined()
        if (!result) return yield* Effect.die("Expected assistant response")
        expect(result.info.role).toBe("assistant")
        if (result.info.role === "assistant") {
          expect(result.info.structured).toBeDefined()
          const output = result.info.structured as any

          expect(output.company).toBeDefined()
          expect(output.company.name).toBe("Anthropic")
          expect(typeof output.company.founded).toBe("number")

          if (output.products) {
            expect(Array.isArray(output.products)).toBe(true)
          }

          // Verify no error was set
          expect(result.info.error).toBeUndefined()
        }

        // Clean up
        // Note: Not removing session to avoid race with background SessionSummary.summarize
      }),
    { git: true },
    60000,
  )

  live(
    "works with text outputFormat (default)",
    () =>
      Effect.gen(function* () {
        const prompt = yield* SessionPrompt.Service
        const sessions = yield* Session.Service
        const sessionID = SessionID.create()
        const turnID = Turn.ID.create()
        yield* prompt.start({
          sessionID,
          turnID,
          inputID: Turn.InputID.create(),
          messageID: MessageID.ascending(),
          session: { title: "Text Output Test" },
          parts: [
            {
              type: "text",
              text: "Say hello.",
            },
          ],
          format: {
            type: "text",
          },
        })

        yield* prompt.awaitTurn(sessionID, turnID)
        const result = (yield* sessions.messages({ sessionID })).findLast(
          (message) => message.info.role === "assistant",
        )
        expect(result).toBeDefined()
        if (!result) return yield* Effect.die("Expected assistant response")
        expect(result.info.role).toBe("assistant")
        if (result.info.role === "assistant") {
          expect(result.info.structured).toBeUndefined()
          expect(result.info.error).toBeUndefined()
        }

        // Verify we got a response with parts
        expect(result.parts.length).toBeGreaterThan(0)

        // Clean up
        // Note: Not removing session to avoid race with background SessionSummary.summarize
      }),
    { git: true },
    60000,
  )

  live(
    "stores outputFormat on user message",
    () =>
      Effect.gen(function* () {
        const prompt = yield* SessionPrompt.Service
        const sessions = yield* Session.Service
        const sessionID = SessionID.create()
        const turnID = Turn.ID.create()
        yield* prompt.start({
          sessionID,
          turnID,
          inputID: Turn.InputID.create(),
          messageID: MessageID.ascending(),
          session: { title: "OutputFormat Storage Test" },
          parts: [
            {
              type: "text",
              text: "What is 1 + 1?",
            },
          ],
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                result: { type: "number" },
              },
              required: ["result"],
            },
            retryCount: 3,
          },
        })

        yield* prompt.awaitTurn(sessionID, turnID)
        const messages = yield* sessions.messages({ sessionID })
        const userMessage = messages.find((m) => m.info.role === "user")

        // Verify outputFormat was stored on user message
        expect(userMessage).toBeDefined()
        if (userMessage?.info.role === "user") {
          expect(userMessage.info.format).toBeDefined()
          expect(userMessage.info.format?.type).toBe("json_schema")
          if (userMessage.info.format?.type === "json_schema") {
            expect(userMessage.info.format.retryCount).toBe(3)
          }
        }

        // Clean up
        // Note: Not removing session to avoid race with background SessionSummary.summarize
      }),
    { git: true },
    60000,
  )

  test("unit test: StructuredOutputError is properly structured", () => {
    const error = new SessionV1.StructuredOutputError({
      message: "Failed to produce valid structured output after 3 attempts",
      retries: 3,
    })

    expect(error.name).toBe("StructuredOutputError")
    expect(error.data.message).toContain("3 attempts")
    expect(error.data.retries).toBe(3)

    const obj = error.toObject()
    expect(obj.name).toBe("StructuredOutputError")
    expect(obj.data.retries).toBe(3)
  })
})
