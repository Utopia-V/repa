import type {
  LanguageModelV3,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider"
import { wrapLanguageModel } from "ai"

export type SerializableValue =
  | null
  | boolean
  | number
  | string
  | SerializableValue[]
  | { [key: string]: SerializableValue }

export type ObservedModelCallStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "cancelled"
  | "failed"

export interface SafeObservedError {
  [key: string]: string
  name: string
  message: string
}

/**
 * Lab-only record of the model boundary visible to the Tutor runtime.
 *
 * Every value in this structure is a detached, JSON-serializable copy. It is
 * intentionally less complete than the live provider objects: credentials,
 * headers, cancellation signals, error stacks, and arbitrary Error fields are
 * never observation data.
 */
export interface ObservedModelCall {
  sequence: number
  operation: "stream"
  provider: string
  modelId: string
  request: SerializableValue
  providerRequest?: SerializableValue
  providerResponse?: SerializableValue
  streamParts: SerializableValue[]
  responseMetadata: SerializableValue[]
  status: ObservedModelCallStatus
  error?: SafeObservedError
}

export interface ObservedLanguageModel {
  model: LanguageModelV3
  observations: readonly ObservedModelCall[]
  snapshot: () => ObservedModelCall[]
}

export interface ObserveLanguageModelOptions {
  /** Additional exact values to scrub wherever they occur in a recorded string. */
  redactValues?: Iterable<string>
}

/**
 * Adds a passive V3 middleware around a provider model for ALS-021 lab runs.
 * The middleware forwards the provider result and each stream part unchanged;
 * only the detached observation is sanitized.
 */
export function observeLanguageModel(
  model: LanguageModelV3,
  options: ObserveLanguageModelOptions = {},
): ObservedLanguageModel {
  const observations: ObservedModelCall[] = []
  const sanitizer = new ObservationSanitizer(options.redactValues)

  const observedModel = wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v3",
      wrapStream: async ({ doStream, params }) => {
        const observation: ObservedModelCall = {
          sequence: observations.length + 1,
          operation: "stream",
          provider: sanitizer.text(model.provider),
          modelId: sanitizer.text(model.modelId),
          request: sanitizer.copy(params),
          streamParts: [],
          responseMetadata: [],
          status: "pending",
        }
        observations.push(observation)

        let result: Awaited<ReturnType<typeof doStream>>
        try {
          result = await doStream()
        } catch (error) {
          observation.status = "failed"
          observation.error = sanitizer.error(error)
          throw error
        }

        if (result.request !== undefined) {
          observation.providerRequest = sanitizer.copy(result.request)
        }
        if (result.response !== undefined) {
          const response = sanitizer.copy(result.response)
          if (!isEmptyRecord(response)) {
            observation.providerResponse = response
          }
        }
        observation.status = "streaming"

        let stream: ReadableStream<LanguageModelV3StreamPart>
        try {
          stream = forwardObservedStream(result.stream, observation, sanitizer)
        } catch (error) {
          observation.status = "failed"
          observation.error = sanitizer.error(error)
          throw error
        }

        return {
          ...result,
          stream,
        }
      },
    },
  })

  return {
    model: observedModel,
    observations,
    snapshot: () => snapshotObservedModelCalls(observations),
  }
}

/**
 * A one-reader pass-through preserves upstream chunks, failures, backpressure,
 * and cancellation while giving the lab a safe observation point.
 */
function forwardObservedStream(
  source: ReadableStream<LanguageModelV3StreamPart>,
  observation: ObservedModelCall,
  sanitizer: ObservationSanitizer,
): ReadableStream<LanguageModelV3StreamPart> {
  const reader = source.getReader()
  let settled = false

  const releaseReader = () => {
    try {
      reader.releaseLock()
    } catch {
      // A still-pending read owns the lock until it settles.
    }
  }

  return new ReadableStream<LanguageModelV3StreamPart>({
    async pull(controller) {
      try {
        const next = await reader.read()
        if (next.done) {
          settled = true
          observation.status = "completed"
          controller.close()
          releaseReader()
          return
        }

        const recordedPart = sanitizer.copy(next.value)
        observation.streamParts.push(recordedPart)
        if (next.value.type === "response-metadata") {
          observation.responseMetadata.push(recordedPart)
        }
        controller.enqueue(next.value)
      } catch (error) {
        settled = true
        observation.status = "failed"
        observation.error = sanitizer.error(error)
        controller.error(error)
        releaseReader()
      }
    },
    async cancel(reason) {
      if (!settled) {
        settled = true
        observation.status = "cancelled"
      }
      try {
        await reader.cancel(reason)
      } catch (error) {
        observation.status = "failed"
        observation.error = sanitizer.error(error)
        throw error
      } finally {
        releaseReader()
      }
    },
  })
}

/** Returns a detached persistence value; mutating it cannot change live observations. */
export function snapshotObservedModelCalls(
  observations: readonly ObservedModelCall[],
): ObservedModelCall[] {
  return JSON.parse(JSON.stringify(observations)) as ObservedModelCall[]
}

const OMIT = Symbol("omit-from-observation")

class ObservationSanitizer {
  readonly #redactions = new Set<string>()

  constructor(redactValues: Iterable<string> | undefined) {
    for (const value of redactValues ?? []) {
      if (value.length > 0) {
        this.#redactions.add(value)
      }
    }
  }

  copy(value: unknown): SerializableValue {
    this.#collectSensitiveValues(value, new WeakSet<object>())
    const copied = this.#copy(value, new WeakSet<object>())
    return copied === OMIT ? null : copied
  }

  text(value: string): string {
    return this.#scrubString(value)
  }

  error(value: unknown): SafeObservedError {
    this.#collectSensitiveValues(value, new WeakSet<object>())
    if (value instanceof Error) {
      return {
        name: this.#scrubString(value.name || "Error"),
        message: this.#scrubString(value.message),
      }
    }
    return {
      name: "Error",
      message: this.#scrubString(safeString(value)),
    }
  }

  #copy(value: unknown, ancestors: WeakSet<object>): SerializableValue | typeof OMIT {
    if (value === null) {
      return null
    }
    switch (typeof value) {
      case "string":
        return this.#scrubString(value)
      case "boolean":
        return value
      case "number":
        return Number.isFinite(value) ? value : String(value)
      case "bigint":
        return value.toString()
      case "undefined":
      case "function":
      case "symbol":
        return OMIT
      case "object":
        break
    }

    if (isAbortSignal(value)) {
      return OMIT
    }
    if (value instanceof Error) {
      return this.error(value)
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString()
    }
    if (value instanceof URL) {
      return this.#scrubString(value.toString())
    }
    if (value instanceof Uint8Array) {
      return { type: "Uint8Array", byteLength: value.byteLength }
    }
    if (value instanceof ArrayBuffer) {
      return { type: "ArrayBuffer", byteLength: value.byteLength }
    }
    if (ancestors.has(value)) {
      return "[Circular]"
    }

    ancestors.add(value)
    try {
      if (Array.isArray(value)) {
        return value.map((item) => {
          const copied = this.#copy(item, ancestors)
          return copied === OMIT ? null : copied
        })
      }

      const copied: { [key: string]: SerializableValue } = {}
      for (const [key, entry] of Object.entries(value)) {
        if (isSensitiveKey(key) || isAbortSignal(entry)) {
          continue
        }
        const copiedEntry = this.#copy(entry, ancestors)
        if (copiedEntry !== OMIT) {
          copied[key] = copiedEntry
        }
      }
      return copied
    } finally {
      ancestors.delete(value)
    }
  }

  #collectSensitiveValues(value: unknown, seen: WeakSet<object>): void {
    if (value === null || typeof value !== "object" || isAbortSignal(value)) {
      return
    }
    if (seen.has(value)) {
      return
    }
    seen.add(value)

    if (value instanceof Error) {
      for (const [key, entry] of Object.entries(value)) {
        if (isSensitiveContainerKey(key)) {
          continue
        }
        if (isSecretValueKey(key)) {
          collectStrings(entry, this.#redactions, new WeakSet<object>())
        }
      }
      return
    }
    if (value instanceof Date || value instanceof URL) {
      return
    }
    for (const [key, entry] of Object.entries(value)) {
      if (isSensitiveContainerKey(key)) {
        // Header/cookie containers often contain ordinary counters and request
        // metadata. Drop the whole container without turning every value into
        // a global replacement token.
        continue
      }
      if (isSecretValueKey(key)) {
        collectStrings(entry, this.#redactions, new WeakSet<object>())
      } else {
        this.#collectSensitiveValues(entry, seen)
      }
    }
  }

  #scrubString(value: string): string {
    let scrubbed = value
    const values = [...this.#redactions].sort((left, right) => right.length - left.length)
    for (const secret of values) {
      scrubbed = scrubbed.split(secret).join("[REDACTED]")
    }
    return scrubbed
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [REDACTED]")
      .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-[REDACTED]")
      .replace(
        /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)=([^&\s]+)/gi,
        "$1=[REDACTED]",
      )
  }
}

function isSensitiveKey(key: string): boolean {
  return isSensitiveContainerKey(key) || isSecretValueKey(key)
}

function isSensitiveContainerKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "")
  return (
    normalized === "header" ||
    normalized === "headers" ||
    normalized === "abortsignal" ||
    normalized === "cookies"
  )
}

function isSecretValueKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "")
  return (
    normalized === "authorization" ||
    normalized === "proxyauthorization" ||
    normalized === "cookie" ||
    normalized === "setcookie" ||
    normalized === "token" ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("accesstoken") ||
    normalized.endsWith("refreshtoken") ||
    normalized.endsWith("idtoken") ||
    normalized.includes("password") ||
    normalized.endsWith("passwd") ||
    normalized.endsWith("passphrase") ||
    normalized.endsWith("secret")
  )
}

function collectStrings(value: unknown, target: Set<string>, seen: WeakSet<object>): void {
  if (typeof value === "string") {
    if (value.length > 0) {
      target.add(value)
    }
    return
  }
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return
  }
  seen.add(value)
  for (const entry of Array.isArray(value) ? value : Object.values(value)) {
    collectStrings(entry, target, seen)
  }
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return typeof AbortSignal !== "undefined" && value instanceof AbortSignal
}

function isEmptyRecord(value: SerializableValue): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  )
}

function safeString(value: unknown): string {
  try {
    return String(value)
  } catch {
    return "Unknown provider error"
  }
}
