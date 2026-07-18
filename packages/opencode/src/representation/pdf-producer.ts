export * as LocalPDFProducer from "./pdf-producer"

import { AppProcess } from "@opencode-ai/core/process"
import { PDFTextProfile } from "@opencode-ai/core/representation/pdf-text-profile"
import { PDFWorkerFrame } from "@opencode-ai/core/representation/pdf-worker-frame"
import { RepresentationSchema } from "@opencode-ai/core/representation/schema"
import { Effect, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import path from "node:path"
import { limitArguments, limits } from "./pdf-worker"

export const producer = {
  kind: "local_pdf",
  id: "pdfjs-dist",
  version: "5.7.284",
  profile: PDFTextProfile.PROFILE,
  canonicalizer: PDFTextProfile.CANONICALIZER,
  resultBoundary: "framed_stdout_v1",
} as const

export const recipe = RepresentationSchema.localPDFRecipe

export type Usage = RepresentationSchema.LocalPDFUsage

export interface Result {
  readonly canonicalBytes: Uint8Array
  readonly input: PDFWorkerFrame.InputAttestation
  readonly diagnostics: ReadonlyArray<PDFWorkerFrame.Diagnostic>
  readonly usage: Usage
}

export type ErrorCode =
  | "input_too_large"
  | "cancelled"
  | "timed_out"
  | "process_failed"
  | "unexpected_exit"
  | "stdout_limit_exceeded"
  | "stderr_output"
  | "invalid_frame"
  | "input_attestation_mismatch"
  | "invalid_profile"
  | "worker_failure"

export class PDFProducerError extends Error {
  override readonly name = "PDFProducerError"

  constructor(
    readonly code: ErrorCode,
    readonly workerError?: PDFWorkerFrame.WorkerErrorCode,
  ) {
    super(workerError ? `${code}:${workerError}` : code)
  }
}

export const convert = Effect.fn("LocalPDFProducer.convert")(function* (input: Uint8Array, signal?: AbortSignal) {
  if (input.byteLength > limits.maxInputBytes) return yield* fail("input_too_large")
  const presented = input.slice()
  const processService = yield* AppProcess.Service
  const result = yield* runWorker(processService, presented, signal).pipe(
    Effect.mapError((error) => processFailure(error, signal)),
  )

  if (result.exitCode !== 0) return yield* fail("unexpected_exit")
  if (result.stdoutTruncated) return yield* fail("stdout_limit_exceeded")
  if (result.stderrTruncated || result.stderr.byteLength > 0) return yield* fail("stderr_output")
  const frame = PDFWorkerFrame.decode(result.stdout, frameLimits())
  if (!frame.ok) return yield* fail("invalid_frame")

  const expected = PDFWorkerFrame.attest(presented)
  if (
    frame.value.input.algorithm !== expected.algorithm ||
    frame.value.input.digest !== expected.digest ||
    frame.value.input.byteLength !== expected.byteLength
  ) {
    return yield* fail("input_attestation_mismatch")
  }
  if (frame.value.status === "error") {
    return yield* Effect.fail(new PDFProducerError("worker_failure", frame.value.error))
  }

  const profile = PDFTextProfile.decode(frame.value.payload, profileLimits())
  if (!profile.ok) return yield* fail("invalid_profile")
  const pages = profile.value.profile.pages
  return {
    canonicalBytes: frame.value.payload,
    input: frame.value.input,
    diagnostics: frame.value.diagnostics,
    usage: {
      kind: "local_pdf",
      pageCount: pages.length,
      textItemCount: pages.reduce((count, page) => count + page.items.length, 0),
      signalPageCount: pages.filter((page) => page.signals !== undefined).length,
      operatorCount: pages.reduce((count, page) => count + (page.signals?.operatorCount ?? 0), 0),
      imagePaintOperations: pages.reduce((count, page) => count + (page.signals?.imagePaintOperations ?? 0), 0),
      profileByteLength: frame.value.payload.byteLength,
    },
  } satisfies Result
})

export const probePackagedCancellation = Effect.fn("LocalPDFProducer.probePackagedCancellation")(function* (
  signal: AbortSignal,
) {
  const processService = yield* AppProcess.Service
  return yield* runWorker(processService, Stream.never, signal).pipe(
    Effect.mapError((error) => processFailure(error, signal)),
  )
})

function runWorker(
  processService: AppProcess.Interface,
  stdin: Exclude<AppProcess.RunOptions["stdin"], undefined>,
  signal?: AbortSignal,
) {
  const worker = workerCommand()
  return processService.run(
    ChildProcess.make(worker.command, [...worker.args, ...limitArguments()], {
      env: {},
      extendEnv: false,
      shell: false,
      forceKillAfter: "2 seconds",
    }),
    {
      stdin,
      signal,
      timeout: `${recipe.limits.wallTimeMs} millis`,
      maxOutputBytes: frameLimits().maxFrameBytes,
      maxErrorBytes: 4 * 1024,
    },
  )
}

function processFailure(error: AppProcess.AppProcessError, signal?: AbortSignal) {
  return new PDFProducerError(
    signal?.aborted
      ? "cancelled"
      : error.cause instanceof AppProcess.AppProcessTimeoutError
        ? "timed_out"
        : "process_failed",
  )
}

function workerCommand() {
  const executable = path.basename(process.execPath).toLowerCase()
  if (executable === "repa" || executable === "repa.exe") {
    return {
      command: path.join(
        path.dirname(process.execPath),
        process.platform === "win32" ? "repa-pdf-worker.exe" : "repa-pdf-worker",
      ),
      args: [] as string[],
    }
  }
  return { command: process.execPath, args: [path.join(import.meta.dir, "pdf-worker-entry.ts")] }
}

function profileLimits(): PDFTextProfile.Limits {
  return {
    maxProfileBytes: limits.maxProfileBytes,
    maxRecordBytes: limits.maxRecordBytes,
    maxPages: limits.maxPages,
    maxItemsPerPage: limits.maxItemsPerPage,
    maxTextItemBytes: limits.maxTextItemBytes,
    maxOperatorsPerPage: limits.maxOperatorsPerPage,
  }
}

function frameLimits(): PDFWorkerFrame.Limits {
  return {
    ...PDFWorkerFrame.defaultLimits,
    maxFrameBytes: limits.maxProfileBytes + PDFWorkerFrame.defaultLimits.maxHeaderBytes + 16,
    maxPayloadBytes: limits.maxProfileBytes,
    maxDiagnosticCount: limits.maxDiagnosticCount,
  }
}

function fail(code: ErrorCode) {
  return Effect.fail(new PDFProducerError(code))
}
