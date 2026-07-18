import { PDFTextProfile } from "@opencode-ai/core/representation/pdf-text-profile"
import { PDFWorkerFrame } from "@opencode-ai/core/representation/pdf-worker-frame"
import { RepresentationSchema } from "@opencode-ai/core/representation/schema"
import path from "node:path"
import { pathToFileURL } from "node:url"

export const limits = {
  maxInputBytes: RepresentationSchema.localPDFRecipe.limits.inputBytes,
  maxPages: RepresentationSchema.localPDFRecipe.limits.pages,
  maxProfileBytes: RepresentationSchema.localPDFRecipe.limits.outputBytes,
  maxRecordBytes: RepresentationSchema.localPDFRecipe.limits.recordBytes,
  maxItemsPerPage: RepresentationSchema.localPDFRecipe.limits.itemsPerPage,
  maxTextItemBytes: RepresentationSchema.localPDFRecipe.limits.textItemBytes,
  maxOperatorsPerPage: RepresentationSchema.localPDFRecipe.limits.operatorsPerPage,
  maxDiagnosticCount: RepresentationSchema.localPDFRecipe.limits.diagnostics,
} as const

export interface Limits {
  readonly maxInputBytes: number
  readonly maxPages: number
  readonly maxProfileBytes: number
  readonly maxRecordBytes: number
  readonly maxItemsPerPage: number
  readonly maxTextItemBytes: number
  readonly maxOperatorsPerPage: number
  readonly maxDiagnosticCount: number
}

export function limitArguments(inputLimits: Limits = limits) {
  return [
    inputLimits.maxInputBytes,
    inputLimits.maxPages,
    inputLimits.maxProfileBytes,
    inputLimits.maxRecordBytes,
    inputLimits.maxItemsPerPage,
    inputLimits.maxTextItemBytes,
    inputLimits.maxOperatorsPerPage,
    inputLimits.maxDiagnosticCount,
  ].map(String)
}

export async function convert(input: Uint8Array, inputLimits: Limits): Promise<Uint8Array> {
  const attestation = PDFWorkerFrame.attest(input)
  if (input.byteLength > inputLimits.maxInputBytes) return errorFrame(attestation, [], "input_too_large", inputLimits)

  const diagnostics = new DiagnosticCounter(inputLimits.maxDiagnosticCount)
  const pdfjs = await loadRuntime().catch(() => undefined)
  if (!pdfjs) return errorFrame(attestation, [], "runtime_unavailable", inputLimits)
  const restore = diagnostics.captureConsole()
  try {
    const pages = await extract(input, pdfjs, inputLimits, diagnostics)
    if (diagnostics.overflowed) {
      return errorFrame(attestation, diagnostics.values(), "diagnostic_limit_exceeded", inputLimits)
    }
    const profile = PDFTextProfile.encode(pages, profileLimits(inputLimits))
    if (!profile.ok) return errorFrame(attestation, diagnostics.values(), profileError(profile.error), inputLimits)
    const frame = PDFWorkerFrame.encodeSuccess(
      attestation,
      diagnostics.values(),
      profile.value.bytes,
      frameLimits(inputLimits),
    )
    if (frame.ok) return frame.value
    return errorFrame(attestation, diagnostics.values(), "profile_limit_exceeded", inputLimits)
  } catch (error) {
    const code = error instanceof WorkerFailure ? error.code : documentError(error) ? "invalid_pdf" : "internal_error"
    return errorFrame(attestation, diagnostics.values(), code, inputLimits)
  } finally {
    restore()
  }
}

async function loadRuntime() {
  if (!globalThis.DOMMatrix) {
    const { default: DOMMatrixShim } = await import("@thednp/dommatrix")
    // PDF.js initializes DOMMatrix even for its text/operator path. The pure shim
    // avoids turning its optional native canvas renderer into a release dependency.
    Object.defineProperty(globalThis, "DOMMatrix", { value: DOMMatrixShim, configurable: true, writable: true })
  }
  const restore = silenceConsole()
  try {
    return await import("pdfjs-dist/legacy/build/pdf.mjs")
  } finally {
    restore()
  }
}

async function extract(
  input: Uint8Array,
  pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs"),
  inputLimits: Limits,
  diagnostics: DiagnosticCounter,
) {
  const root = assetRoot()
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(root, "legacy", "build", "pdf.worker.mjs")).href
  const task = pdfjs.getDocument({
    data: input.slice(),
    cMapUrl: directoryURL(path.join(root, "cmaps")),
    cMapPacked: true,
    iccUrl: directoryURL(path.join(root, "iccs")),
    standardFontDataUrl: directoryURL(path.join(root, "standard_fonts")),
    wasmUrl: directoryURL(path.join(root, "wasm")),
    useWorkerFetch: false,
    stopAtErrors: true,
    maxImageSize: 100_000_000,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
  })
  const document = await task.promise
  try {
    if (document.numPages > inputLimits.maxPages) throw new WorkerFailure("page_limit_exceeded")
    const metadata = await document.getMetadata().catch(() => undefined)
    const declaredPages = metadata?.metadata?.get("xmptpg:npages")
    if (
      typeof declaredPages === "string" &&
      /^\d+$/.test(declaredPages) &&
      Number(declaredPages) !== document.numPages
    ) {
      diagnostics.add("source_page_count_mismatch")
    }
    const pages: PDFTextProfile.Page[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false })
      if (content.items.length > inputLimits.maxItemsPerPage) throw new WorkerFailure("item_limit_exceeded")
      const items: PDFTextProfile.TextItem[] = []
      for (const item of content.items) {
        if (!("str" in item)) {
          diagnostics.add("unsupported_text_item")
          continue
        }
        if (new TextEncoder().encode(item.str).byteLength > inputLimits.maxTextItemBytes) {
          throw new WorkerFailure("text_item_limit_exceeded")
        }
        items.push({ text: item.str, lineBreakAfter: item.hasEOL })
      }
      const signals = await extractSignals(page, pdfjs.OPS, inputLimits, diagnostics)
      pages.push(signals ? { page: pageNumber, items, signals } : { page: pageNumber, items })
      page.cleanup()
    }
    return pages
  } finally {
    await document.destroy()
  }
}

async function extractSignals(
  page: Awaited<
    ReturnType<
      Awaited<ReturnType<(typeof import("pdfjs-dist/legacy/build/pdf.mjs"))["getDocument"]>["promise"]>["getPage"]
    >
  >,
  operators: (typeof import("pdfjs-dist/legacy/build/pdf.mjs"))["OPS"],
  inputLimits: Limits,
  diagnostics: DiagnosticCounter,
): Promise<PDFTextProfile.PageSignals | undefined> {
  try {
    const list = await page.getOperatorList()
    if (list.fnArray.length > inputLimits.maxOperatorsPerPage) throw new WorkerFailure("operator_limit_exceeded")
    const imageOperators = new Set([
      operators.paintImageMaskXObject,
      operators.paintImageMaskXObjectGroup,
      operators.paintImageXObject,
      operators.paintInlineImageXObject,
      operators.paintInlineImageXObjectGroup,
      operators.paintImageXObjectRepeat,
      operators.paintImageMaskXObjectRepeat,
    ])
    return {
      operatorCount: list.fnArray.length,
      imagePaintOperations: list.fnArray.filter((operator) => imageOperators.has(operator)).length,
    }
  } catch (error) {
    if (error instanceof WorkerFailure) throw error
    diagnostics.add("operator_signals_unavailable")
    return undefined
  }
}

export function errorFrame(
  input: PDFWorkerFrame.InputAttestation,
  diagnostics: ReadonlyArray<PDFWorkerFrame.Diagnostic>,
  error: PDFWorkerFrame.WorkerErrorCode,
  inputLimits: Limits = limits,
) {
  const frame = PDFWorkerFrame.encodeError(input, diagnostics, error, frameLimits(inputLimits))
  if (frame.ok) return frame.value
  const fallback = PDFWorkerFrame.encodeError(input, [], "internal_error")
  return fallback.ok ? fallback.value : new Uint8Array()
}

function profileLimits(inputLimits: Limits): PDFTextProfile.Limits {
  return {
    maxProfileBytes: inputLimits.maxProfileBytes,
    maxRecordBytes: inputLimits.maxRecordBytes,
    maxPages: inputLimits.maxPages,
    maxItemsPerPage: inputLimits.maxItemsPerPage,
    maxTextItemBytes: inputLimits.maxTextItemBytes,
    maxOperatorsPerPage: inputLimits.maxOperatorsPerPage,
  }
}

function frameLimits(inputLimits: Limits): PDFWorkerFrame.Limits {
  return {
    ...PDFWorkerFrame.defaultLimits,
    maxFrameBytes: inputLimits.maxProfileBytes + PDFWorkerFrame.defaultLimits.maxHeaderBytes + 16,
    maxPayloadBytes: inputLimits.maxProfileBytes,
    maxDiagnosticCount: inputLimits.maxDiagnosticCount,
  }
}

function profileError(error: PDFTextProfile.ErrorCode): PDFWorkerFrame.WorkerErrorCode {
  if (error === "page_limit_exceeded") return "page_limit_exceeded"
  if (error === "item_limit_exceeded") return "item_limit_exceeded"
  if (error === "text_item_limit_exceeded") return "text_item_limit_exceeded"
  if (error === "operator_limit_exceeded") return "operator_limit_exceeded"
  if (error === "record_limit_exceeded" || error === "profile_limit_exceeded") return "profile_limit_exceeded"
  if (error === "no_readable_text") return "no_readable_text"
  return "internal_error"
}

function assetRoot() {
  const executable = path.basename(process.execPath).toLowerCase()
  if (executable === "repa-pdf-worker" || executable === "repa-pdf-worker.exe") {
    return path.join(path.dirname(process.execPath), "pdfjs-dist")
  }
  return path.dirname(Bun.resolveSync("pdfjs-dist/package.json", import.meta.dir))
}

function directoryURL(value: string) {
  return pathToFileURL(`${value}${path.sep}`).href
}

function silenceConsole() {
  const previous = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  }
  console.log = () => undefined
  console.info = () => undefined
  console.warn = () => undefined
  console.error = () => undefined
  return () => {
    console.log = previous.log
    console.info = previous.info
    console.warn = previous.warn
    console.error = previous.error
  }
}

function documentError(error: unknown) {
  return (
    error instanceof Error &&
    ["InvalidPDFException", "PasswordException", "FormatError", "UnknownErrorException"].includes(error.name)
  )
}

class WorkerFailure {
  constructor(readonly code: PDFWorkerFrame.WorkerErrorCode) {}
}

class DiagnosticCounter {
  private readonly counts = new Map<PDFWorkerFrame.DiagnosticCode, number>()
  private total = 0
  overflowed = false

  constructor(private readonly maximum: number) {}

  add(code: PDFWorkerFrame.DiagnosticCode) {
    this.total++
    if (this.total > this.maximum) {
      this.overflowed = true
      return
    }
    const count = (this.counts.get(code) ?? 0) + 1
    this.counts.set(code, count)
  }

  values() {
    return PDFWorkerFrame.diagnosticCodes.flatMap((code) => {
      const count = this.counts.get(code)
      return count === undefined ? [] : [{ code, count }]
    })
  }

  captureConsole() {
    const previous = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
    }
    console.log = () => this.add("parser_info")
    console.info = () => this.add("parser_info")
    console.warn = () => this.add("parser_warning")
    console.error = () => this.add("parser_warning")
    return () => {
      console.log = previous.log
      console.info = previous.info
      console.warn = previous.warn
      console.error = previous.error
    }
  }
}
