import { describe, expect, test } from "bun:test"
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from "@ai-sdk/provider"
import { MockLanguageModelV3 } from "ai/test"
import {
  observeLanguageModel,
  snapshotObservedModelCalls,
} from "./observed-model"

describe("shared-policy lab model observer", () => {
  test("forwards the provider stream without changing its parts or response", async () => {
    const streamedError = Object.assign(new Error("provider sent a recoverable error"), {
      internal: "must not be copied",
    })
    const parts: LanguageModelV3StreamPart[] = [
      { type: "stream-start", warnings: [] },
      {
        type: "response-metadata",
        id: "response-1",
        modelId: "actual-model",
        timestamp: new Date("2026-07-12T04:00:00.000Z"),
      },
      { type: "text-start", id: "answer" },
      { type: "text-delta", id: "answer", delta: "解释" },
      { type: "error", error: streamedError },
      { type: "text-end", id: "answer" },
      finish(),
    ]
    const providerRequest = { body: { messages: [{ role: "user", content: "解释引用" }] } }
    const providerResponse = { headers: { "x-request-id": "request-1" } }
    const baseModel = new MockLanguageModelV3({
      provider: "fixture-provider",
      modelId: "fixture-model",
      doStream: async () => ({
        stream: stream(parts),
        request: providerRequest,
        response: providerResponse,
      }),
    })
    const observed = observeLanguageModel(baseModel)

    const result = await observed.model.doStream(callOptions("first request"))
    expect(result.request).toBe(providerRequest)
    expect(result.response).toBe(providerResponse)

    const received = await readAll(result.stream)
    expect(received).toHaveLength(parts.length)
    for (const [index, part] of received.entries()) {
      expect(part).toBe(parts[index]!)
    }

    expect(observed.observations).toHaveLength(1)
    expect(observed.observations[0]).toMatchObject({
      sequence: 1,
      operation: "stream",
      provider: "fixture-provider",
      modelId: "fixture-model",
      status: "completed",
      providerRequest: {
        body: { messages: [{ role: "user", content: "解释引用" }] },
      },
      responseMetadata: [
        {
          type: "response-metadata",
          id: "response-1",
          modelId: "actual-model",
          timestamp: "2026-07-12T04:00:00.000Z",
        },
      ],
    })
    expect(observed.observations[0]?.streamParts[4]).toEqual({
      type: "error",
      error: {
        name: "Error",
        message: "provider sent a recoverable error",
      },
    })
  })

  test("keeps concurrently opened provider calls in separate observations", async () => {
    let providerCall = 0
    const baseModel = new MockLanguageModelV3({
      doStream: async () => {
        providerCall += 1
        const label = providerCall === 1 ? "A" : "B"
        return {
          stream: stream([
            { type: "text-start", id: label },
            { type: "text-delta", id: label, delta: label },
            { type: "text-end", id: label },
            finish(),
          ]),
          request: { body: { label } },
        }
      },
    })
    const observed = observeLanguageModel(baseModel)

    const first = await observed.model.doStream(callOptions("request A"))
    const second = await observed.model.doStream(callOptions("request B"))
    await Promise.all([readAll(second.stream), readAll(first.stream)])

    expect(observed.observations.map((call) => call.sequence)).toEqual([1, 2])
    expect(observed.observations[0]?.providerRequest).toEqual({ body: { label: "A" } })
    expect(observed.observations[1]?.providerRequest).toEqual({ body: { label: "B" } })
    expect(observed.observations[0]?.streamParts[1]).toMatchObject({ delta: "A" })
    expect(observed.observations[1]?.streamParts[1]).toMatchObject({ delta: "B" })
    expect(observed.observations.every((call) => call.status === "completed")).toBe(true)
  })

  test("omits credentials, headers, and AbortSignal from serializable snapshots", async () => {
    const secrets = {
      authorization: "Bearer auth-secret-01",
      apiKey: "api-secret-02",
      accessToken: "access-secret-03",
      password: "password-secret-04",
      cookie: "cookie-secret-05",
      external: "closure-secret-06",
      shortToken: "731",
    }
    const controller = new AbortController()
    const streamedError = Object.assign(new TypeError(`bad provider chunk ${secrets.apiKey}`), {
      apiKey: secrets.apiKey,
    })
    const baseModel = new MockLanguageModelV3({
      doStream: async () => ({
        stream: stream([
          {
            type: "raw",
            rawValue: {
              password: secrets.password,
              echoed: secrets.password,
              token: secrets.shortToken,
              echoedShortToken: secrets.shortToken,
              safe: "raw-safe",
            },
          },
          { type: "error", error: streamedError },
          finish(),
        ]),
        request: {
          body: {
            apiKey: secrets.apiKey,
            echoed: secrets.apiKey,
            nested: { accessToken: secrets.accessToken, safe: "body-safe" },
          },
        },
        response: {
          headers: {
            authorization: secrets.authorization,
            "set-cookie": secrets.cookie,
          },
        },
      }),
    })
    const observed = observeLanguageModel(baseModel, {
      redactValues: [secrets.external],
    })
    const options = callOptions(`credential safety ${secrets.external}`)
    options.abortSignal = controller.signal
    options.headers = {
      authorization: secrets.authorization,
      "x-api-key": secrets.apiKey,
    }
    options.providerOptions = {
      fixture: {
        password: secrets.password,
        token: secrets.accessToken,
        safe: "options-safe",
      },
    }

    const result = await observed.model.doStream(options)
    await readAll(result.stream)

    const snapshot = snapshotObservedModelCalls(observed.observations)
    const json = JSON.stringify(snapshot)
    for (const secret of Object.values(secrets)) {
      expect(json).not.toContain(secret)
    }
    expect(json.toLowerCase()).not.toContain("abortsignal")
    expect(json.toLowerCase()).not.toContain("authorization")
    expect(json.toLowerCase()).not.toContain("apikey")
    expect(json.toLowerCase()).not.toContain("accesstoken")
    expect(json.toLowerCase()).not.toContain("password")
    expect(json.toLowerCase()).not.toContain("headers")
    expect(json).toContain("options-safe")
    expect(json).toContain("body-safe")
    expect(json).toContain("raw-safe")
    expect(snapshot[0]?.streamParts[1]).toEqual({
      type: "error",
      error: { name: "TypeError", message: "bad provider chunk [REDACTED]" },
    })
  })

  test("dropping header containers does not globally redact ordinary header values", async () => {
    const safeText = "ISO-8601 keeps count 10 and offset 20 with flag 0"
    const baseModel = new MockLanguageModelV3({
      doStream: async () => ({
        stream: stream([
          { type: "text-start", id: "answer-10" },
          { type: "text-delta", id: "answer-10", delta: safeText },
          { type: "text-end", id: "answer-10" },
          finish(),
        ]),
        request: { body: { prompt: safeText } },
        response: {
          headers: {
            "x-ratelimit-limit": "10",
            "x-ratelimit-reset": "20",
            "x-feature-flag": "0",
          },
        },
      }),
    })
    const observed = observeLanguageModel(baseModel)

    const result = await observed.model.doStream(callOptions(safeText))
    await readAll(result.stream)

    const json = JSON.stringify(snapshotObservedModelCalls(observed.observations))
    expect(json).toContain(safeText)
    expect(json).toContain("answer-10")
    expect(json).not.toContain("[REDACTED]")
    expect(json.toLowerCase()).not.toContain("headers")
  })

  test("records a rejected provider call safely while rethrowing the original error", async () => {
    const failure = Object.assign(new Error("provider unavailable"), {
      password: "not-for-the-log",
    })
    const observed = observeLanguageModel(
      new MockLanguageModelV3({
        doStream: async () => {
          throw failure
        },
      }),
    )

    await expect(observed.model.doStream(callOptions("rejected"))).rejects.toBe(failure)

    expect(snapshotObservedModelCalls(observed.observations)).toEqual([
      expect.objectContaining({
        sequence: 1,
        status: "failed",
        error: { name: "Error", message: "provider unavailable" },
      }),
    ])
    expect(JSON.stringify(observed.observations)).not.toContain("not-for-the-log")
  })

  test("forwards a fatal stream error unchanged and records only its safe shape", async () => {
    const secret = "stream-secret-07"
    const failure = Object.assign(new Error(`connection lost: ${secret}`), {
      accessToken: secret,
    })
    const firstPart: LanguageModelV3StreamPart = {
      type: "text-start",
      id: "partial",
    }
    let pull = 0
    const observed = observeLanguageModel(
      new MockLanguageModelV3({
        doStream: async () => ({
          stream: new ReadableStream<LanguageModelV3StreamPart>({
            pull(controller) {
              pull += 1
              if (pull === 1) {
                controller.enqueue(firstPart)
                return
              }
              controller.error(failure)
            },
          }),
        }),
      }),
    )

    const result = await observed.model.doStream(callOptions("stream failure"))
    const reader = result.stream.getReader()
    expect((await reader.read()).value).toBe(firstPart)
    await expect(reader.read()).rejects.toBe(failure)

    expect(snapshotObservedModelCalls(observed.observations)).toEqual([
      expect.objectContaining({
        status: "failed",
        error: { name: "Error", message: "connection lost: [REDACTED]" },
      }),
    ])
    expect(JSON.stringify(observed.observations)).not.toContain(secret)
  })
})

function callOptions(label: string): LanguageModelV3CallOptions {
  return {
    prompt: [{ role: "system", content: label }],
    temperature: 0.2,
  }
}

function stream(parts: LanguageModelV3StreamPart[]) {
  return new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part)
      }
      controller.close()
    },
  })
}

async function readAll(stream: ReadableStream<LanguageModelV3StreamPart>) {
  const parts: LanguageModelV3StreamPart[] = []
  for await (const part of stream) {
    parts.push(part)
  }
  return parts
}

function finish(): Extract<LanguageModelV3StreamPart, { type: "finish" }> {
  return {
    type: "finish",
    finishReason: { unified: "stop", raw: "stop" },
    usage: emptyUsage(),
  }
}

function emptyUsage(): LanguageModelV3Usage {
  return {
    inputTokens: {
      total: 0,
      noCache: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    outputTokens: {
      total: 0,
      text: 0,
      reasoning: 0,
    },
  }
}
