import { PDFWorkerFrame } from "@opencode-ai/core/representation/pdf-worker-frame"
import { createHash } from "node:crypto"
import { convert, errorFrame, limitArguments, limits, type Limits } from "./pdf-worker"

const parsed = parseLimits(process.argv.slice(2))
const input = await readInput(parsed.ok ? parsed.value.maxInputBytes : limits.maxInputBytes)
const frame = !parsed.ok
  ? errorFrame(input.attestation, [], "invalid_arguments")
  : input.overflowed
    ? errorFrame(input.attestation, [], "input_too_large", parsed.value)
    : await convert(input.bytes, parsed.value)

await write(frame)

function parseLimits(args: ReadonlyArray<string>): { ok: true; value: Limits } | { ok: false } {
  if (args.length !== 8) return { ok: false }
  const values = args.map(Number)
  const maxima = limitArguments().map(Number)
  if (values.some((value, index) => !Number.isSafeInteger(value) || value < 1 || value > maxima[index]!)) {
    return { ok: false }
  }
  return {
    ok: true,
    value: {
      maxInputBytes: values[0]!,
      maxPages: values[1]!,
      maxProfileBytes: values[2]!,
      maxRecordBytes: values[3]!,
      maxItemsPerPage: values[4]!,
      maxTextItemBytes: values[5]!,
      maxOperatorsPerPage: values[6]!,
      maxDiagnosticCount: values[7]!,
    },
  }
}

async function readInput(maximum: number) {
  const chunks: Uint8Array[] = []
  const hasher = createHash("sha256")
  let byteLength = 0
  const reader = Bun.stdin.stream().getReader()
  while (true) {
    const next = await reader.read()
    if (next.done) break
    const chunk = next.value
    hasher.update(chunk)
    byteLength += chunk.byteLength
    if (byteLength > maximum) {
      return {
        bytes: new Uint8Array(),
        attestation: {
          algorithm: "sha256",
          digest: hasher.digest("hex"),
          byteLength,
        } satisfies PDFWorkerFrame.InputAttestation,
        overflowed: true,
      }
    }
    chunks.push(chunk)
  }
  return {
    bytes: concat(chunks, byteLength),
    attestation: {
      algorithm: "sha256",
      digest: hasher.digest("hex"),
      byteLength,
    } satisfies PDFWorkerFrame.InputAttestation,
    overflowed: false,
  }
}

function concat(chunks: ReadonlyArray<Uint8Array>, byteLength: number) {
  const result = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function write(bytes: Uint8Array) {
  return new Promise<void>((resolve, reject) => {
    process.stdout.write(bytes, (error) => (error ? reject(error) : resolve()))
  })
}
