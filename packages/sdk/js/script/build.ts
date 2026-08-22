#!/usr/bin/env bun
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

import { $ } from "bun"

import { patchTurnInfo } from "./patch-turn-info"

const { openapiJson } = await import("../../../opencode/src/cli/cmd/generate")
await Bun.write("./openapi.json", await openapiJson({ formatted: false }))

const document = (await Bun.file("./openapi.json").json()) as {
  components?: { schemas?: Record<string, unknown> }
  [key: string]: unknown
}
const schemas = document.components?.schemas
if (schemas) {
  const reachable = new Set<string>()
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (typeof value !== "object" || value === null) return
    for (const [key, child] of Object.entries(value)) {
      if (key === "$ref" && typeof child === "string" && child.startsWith("#/components/schemas/")) {
        const name = child.slice("#/components/schemas/".length)
        if (reachable.has(name)) continue
        reachable.add(name)
        visit(schemas[name])
      } else {
        visit(child)
      }
    }
  }
  visit({ ...document, components: { ...document.components, schemas: undefined } })
  for (const name of Object.keys(schemas)) {
    if (/^SessionNext\w+1$/.test(name) && !reachable.has(name)) delete schemas[name]
  }
  await Bun.write("./openapi.json", JSON.stringify(document))
}

await $`node ./script/generate-client.mjs`

const generatedTypes = await retryGeneratedFileAccess(() => Bun.file("./src/v2/gen/types.gen.ts").text())
if (/export type SessionNext\w+1 =/.test(generatedTypes)) {
  throw new Error("Session history generated duplicate Session event variants")
}
const historyTypesPatched = generatedTypes.replace(
  /(export type V2SessionHistoryData = \{[\s\S]*?query\?: \{\s*limit\?: )string([;,]\s*after\?: )string/,
  "$1number$2number",
)
if (historyTypesPatched === generatedTypes) {
  throw new Error("Session history numeric query patch did not apply")
}
await retryGeneratedFileAccess(() => Bun.write("./src/v2/gen/types.gen.ts", patchTurnInfo(historyTypesPatched)))

const generatedSdk = await retryGeneratedFileAccess(() => Bun.file("./src/v2/gen/sdk.gen.ts").text())
let sdkPatched = generatedSdk.replace(
  /(Get session history[\s\S]*?parameters: \{\s*sessionID: string[;,]\s*limit\?: )string([;,]\s*after\?: )string/,
  "$1number$2number",
)
if (sdkPatched === generatedSdk) {
  throw new Error("Session history numeric SDK patch did not apply")
}

// @hey-api/openapi-ts 0.90.10 flattens required JSON request bodies into
// optional method parameters. These deletion methods must carry the exact
// displayed proposal, so make each body field required and fail closed if the
// generated shape changes.
sdkPatched = requireFlatBody(sdkPatched, "delete", [
  "schemaVersion",
  "requestID",
  "rootSessionID",
  "targets",
  "subtreeCount",
  "subtreeFingerprint",
  "mode",
  "requestFingerprint",
])
sdkPatched = requireFlatBody(sdkPatched, "deleteProposal", ["mode"])
sdkPatched = requireFlatBody(sdkPatched, "deletionAuditPurge", [
  "schemaVersion",
  "requestID",
  "rootSessionID",
  "deletionRequestID",
  "auditBundleID",
  "requestFingerprint",
])
await retryGeneratedFileAccess(() => Bun.write("./src/v2/gen/sdk.gen.ts", sdkPatched))

// Patch a @hey-api/openapi-ts codegen bug: SseFn incorrectly passes the
// endpoint's TError into the second generic of ServerSentEventsResult, which
// is the AsyncGenerator's TReturn slot. Iterator return values have nothing
// to do with HTTP errors, and any consumer that calls `.return()` or returns
// from a mock generator gets type-checked against the wrong shape. Drop the
// arg so TReturn defaults to void.
const sseTypesPath = "./src/v2/gen/client/types.gen.ts"
const sseTypesFile = Bun.file(sseTypesPath)
const sseTypesSource = await retryGeneratedFileAccess(() => sseTypesFile.text())
const sseTypesPatched = sseTypesSource.replace(
  "=> Promise<ServerSentEventsResult<TData, TError>>",
  "=> Promise<ServerSentEventsResult<TData>>",
)
if (sseTypesPatched === sseTypesSource) {
  throw new Error(`SseFn patch did not apply; @hey-api/openapi-ts output may have changed (${sseTypesPath})`)
}
await retryGeneratedFileAccess(() => Bun.write(sseTypesPath, sseTypesPatched))

await retryGeneratedFileAccess(() => $`bun prettier --write src/v2/gen`)
await $`rm -rf dist`
await $`bun tsc`
await $`rm openapi.json`

async function retryGeneratedFileAccess<A>(operation: () => Promise<A>) {
  const attempts = process.platform === "win32" ? 20 : 1
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await operation().then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    )
    if (result.ok) return result.value
    if (attempt === attempts - 1) throw result.error
    // Windows scanners can briefly retain generated files after the codegen
    // promise resolves. Retry the exact idempotent post-processing operation.
    await Bun.sleep(100)
  }
  throw new Error("Generated file retry exhausted without a result")
}

function requireFlatBody(source: string, method: string, keys: string[]) {
  const pattern = new RegExp(
    `(^[ \\t]+public ${method}<[\\s\\S]*?parameters: \\{)([\\s\\S]*?)(\\r?\\n[ \\t]+\\},(?:\\r?\\n[ \\t]+| )options\\?:)`,
    "m",
  )
  const match = source.match(pattern)
  if (!match) throw new Error(`Required-body SDK patch could not find ${method}`)
  let parameters = match[2]
  for (const key of keys) {
    const next = parameters.replace(new RegExp(`(\\r?\\n[ \\t]+${key})\\?:`), "$1:")
    if (next === parameters) throw new Error(`Required-body SDK patch could not require ${method}.${key}`)
    parameters = next
  }
  return source.replace(pattern, `$1${parameters}$3`)
}
