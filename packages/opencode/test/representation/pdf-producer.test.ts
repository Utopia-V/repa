import { describe, expect } from "bun:test"
import { AppProcess } from "@opencode-ai/core/process"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { PDFTextProfile } from "@opencode-ai/core/representation/pdf-text-profile"
import { PDFWorkerFrame } from "@opencode-ai/core/representation/pdf-worker-frame"
import { Effect, Exit } from "effect"
import { ChildProcess } from "effect/unstable/process"
import path from "node:path"
import { LocalPDFProducer } from "@/representation/pdf-producer"
import { limitArguments } from "@/representation/pdf-worker"
import { testEffect } from "../lib/effect"
import { pdfFixture } from "../fixture/pdf"

const it = testEffect(LayerNode.compile(AppProcess.node))

describe("local PDF producer", () => {
  it.live(
    "extracts ordered text, empty pages, and bounded mechanical image signals through the real child",
    Effect.gen(function* () {
      const source = pdfFixture(undefined, 9)
      const result = yield* LocalPDFProducer.convert(source)
      expect(result.input.byteLength).toBe(source.byteLength)
      expect(result.usage.pageCount).toBe(3)
      expect(result.usage.signalPageCount).toBe(3)
      expect(result.usage.imagePaintOperations).toBeGreaterThanOrEqual(1)
      expect(result.diagnostics).toContainEqual({ code: "source_page_count_mismatch", count: 1 })
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === "parser_warning")).toBe(true)
      const profile = PDFTextProfile.decode(result.canonicalBytes)
      expect(profile.ok).toBe(true)
      if (!profile.ok) throw new Error(profile.error)
      expect(profile.value.profile.pages.map((page) => page.page)).toEqual([1, 2, 3])
      expect(profile.value.profile.pages[0]?.items.map((item) => item.text).join("")).toContain("Page one")
      expect(profile.value.profile.pages[1]?.items).toEqual([])
      expect(profile.value.profile.pages[2]?.signals?.imagePaintOperations).toBeGreaterThanOrEqual(1)
    }),
    20_000,
  )

  it.live(
    "accepts only the fixed numeric child protocol and emits one typed bounded failure frame",
    Effect.gen(function* () {
      const processService = yield* AppProcess.Service
      const entry = path.join(import.meta.dir, "../../src/representation/pdf-worker-entry.ts")
      const constrained = limitArguments()
      constrained[0] = "1"
      const oversized = yield* processService.run(
        ChildProcess.make(process.execPath, [entry, ...constrained], { env: {}, extendEnv: false, shell: false }),
        { stdin: pdfFixture(), maxOutputBytes: 1024 * 1024, maxErrorBytes: 1024 },
      )
      expect(oversized.exitCode).toBe(0)
      expect(oversized.stderr.byteLength).toBe(0)
      expect(PDFWorkerFrame.decode(oversized.stdout)).toMatchObject({
        ok: true,
        value: { status: "error", error: "input_too_large" },
      })

      const pathname = yield* processService.run(
        ChildProcess.make(process.execPath, [entry, ...limitArguments(), "C:\\source.pdf"], {
          env: {},
          extendEnv: false,
          shell: false,
        }),
        { stdin: pdfFixture(), maxOutputBytes: 1024 * 1024, maxErrorBytes: 1024 },
      )
      expect(pathname.exitCode).toBe(0)
      expect(pathname.stderr.byteLength).toBe(0)
      expect(PDFWorkerFrame.decode(pathname.stdout)).toMatchObject({
        ok: true,
        value: { status: "error", error: "invalid_arguments" },
      })
    }),
    20_000,
  )

  it.live(
    "returns typed child failures for invalid and all-empty documents",
    Effect.gen(function* () {
      const invalid = yield* Effect.exit(LocalPDFProducer.convert(new TextEncoder().encode("not a pdf")))
      expect(Exit.isFailure(invalid)).toBe(true)
      if (Exit.isFailure(invalid)) {
        const reason = invalid.cause.reasons[0]
        expect(reason?._tag).toBe("Fail")
        if (reason?._tag === "Fail")
          expect(reason.error).toMatchObject({ code: "worker_failure", workerError: "invalid_pdf" })
      }

      const empty = yield* Effect.exit(LocalPDFProducer.convert(pdfFixture([{}])))
      expect(Exit.isFailure(empty)).toBe(true)
      if (Exit.isFailure(empty)) {
        const reason = empty.cause.reasons[0]
        expect(reason?._tag).toBe("Fail")
        if (reason?._tag === "Fail") {
          expect(reason.error).toMatchObject({ code: "worker_failure", workerError: "no_readable_text" })
        }
      }
    }),
    20_000,
  )

  it.live(
    "fails closed when cancellation is already requested",
    Effect.gen(function* () {
      const controller = new AbortController()
      controller.abort()
      const exit = yield* Effect.exit(LocalPDFProducer.convert(pdfFixture(), controller.signal))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const reason = exit.cause.reasons[0]
        expect(reason?._tag).toBe("Fail")
        if (reason?._tag === "Fail") expect(reason.error).toMatchObject({ code: "cancelled" })
      }
    }),
    20_000,
  )

  it.effect(
    "maps child process failure and crash to typed failures without profile bytes",
    Effect.gen(function* () {
      const processService = yield* AppProcess.Service
      const processFailure = yield* Effect.exit(
        LocalPDFProducer.convert(pdfFixture()).pipe(
          Effect.provideService(AppProcess.Service, {
            ...processService,
            run: () =>
              Effect.fail(
                new AppProcess.AppProcessError({
                  command: "repa-pdf-worker",
                  cause: new Error("spawn or timeout failure"),
                }),
              ),
          }),
        ),
      )
      expect(Exit.isFailure(processFailure)).toBe(true)
      if (Exit.isFailure(processFailure)) {
        const reason = processFailure.cause.reasons[0]
        expect(reason?._tag).toBe("Fail")
        if (reason?._tag === "Fail") expect(reason.error).toMatchObject({ code: "process_failed" })
      }

      const crash = yield* Effect.exit(
        LocalPDFProducer.convert(pdfFixture()).pipe(
          Effect.provideService(AppProcess.Service, {
            ...processService,
            run: () =>
              Effect.succeed({
                command: "repa-pdf-worker",
                exitCode: 9,
                stdout: Buffer.alloc(0),
                stderr: Buffer.alloc(0),
                stdoutTruncated: false,
                stderrTruncated: false,
              }),
          }),
        ),
      )
      expect(Exit.isFailure(crash)).toBe(true)
      if (Exit.isFailure(crash)) {
        const reason = crash.cause.reasons[0]
        expect(reason?._tag).toBe("Fail")
        if (reason?._tag === "Fail") expect(reason.error).toMatchObject({ code: "unexpected_exit" })
      }
    }),
  )

  it.effect(
    "preserves the typed process timeout without profile bytes",
    Effect.gen(function* () {
      const processService = yield* AppProcess.Service
      const exit = yield* Effect.exit(
        LocalPDFProducer.convert(pdfFixture()).pipe(
          Effect.provideService(AppProcess.Service, {
            ...processService,
            run: () =>
              Effect.fail(
                new AppProcess.AppProcessError({
                  command: "repa-pdf-worker",
                  cause: new AppProcess.AppProcessTimeoutError("Timed out"),
                }),
              ),
          }),
        ),
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const reason = exit.cause.reasons[0]
        expect(reason?._tag).toBe("Fail")
        if (reason?._tag === "Fail") expect(reason.error).toMatchObject({ code: "timed_out" })
      }
    }),
  )
})
