import { realpathSync, statSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"

export const MARKDOWN_OUTLINE_PARSER_REVISION = "markdown-atx-outline-v1"

const MAX_MARKDOWN_BYTES = 4 * 1024 * 1024

export type MarkdownHeading = {
  key: string
  level: number
  ordinal: number
  title: string
  parentKey: string | null
  startLine: number
  endLine: number
}

export type MarkdownArtifactObservation = {
  workspaceRoot: string
  relativePath: string
  revision: string
  parserRevision: typeof MARKDOWN_OUTLINE_PARSER_REVISION
  observedAt?: number
  byteLength: number
  lineCount: number
  headings: MarkdownHeading[]
}

export async function observeMarkdownArtifact(input: {
  workspaceRoot: string
  relativePath: string
  observedAt?: number
}): Promise<MarkdownArtifactObservation> {
  const source = await readConfinedText(input)
  const headings = parseMarkdownHeadings(source.text)
  if (headings.length === 0) {
    throw new Error(`Markdown material has no ATX headings: ${source.relativePath}`)
  }
  return {
    workspaceRoot: source.workspaceRoot,
    relativePath: source.relativePath,
    revision: contentRevision(source.text),
    parserRevision: MARKDOWN_OUTLINE_PARSER_REVISION,
    ...(input.observedAt === undefined ? {} : { observedAt: input.observedAt }),
    byteLength: source.byteLength,
    lineCount: splitLines(source.text).length,
    headings,
  }
}

export async function readMarkdownSelector(input: {
  workspaceRoot: string
  relativePath: string
  expectedRevision: string
  startLine: number
  endLine: number
}) {
  assertLineRange(input.startLine, input.endLine)
  const source = await readConfinedText(input)
  const actualRevision = contentRevision(source.text)
  if (actualRevision !== input.expectedRevision) {
    return {
      status: "stale" as const,
      expectedRevision: input.expectedRevision,
      actualRevision,
    }
  }
  return {
    status: "current" as const,
    revision: actualRevision,
    startLine: input.startLine,
    endLine: input.endLine,
    text: sliceLines(source.text, input.startLine, input.endLine),
  }
}

export function contentRevision(content: string) {
  return `sha256:${new Bun.CryptoHasher("sha256").update(content).digest("hex")}`
}

export function parseMarkdownHeadings(content: string): MarkdownHeading[] {
  const lines = splitLines(content)
  const pending: Array<Omit<MarkdownHeading, "endLine">> = []
  const ancestors: Array<{ level: number; key: string }> = []
  const siblingOccurrences = new Map<string, number>()
  let fence: { marker: "`" | "~"; length: number } | undefined

  for (const [index, line] of lines.entries()) {
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1]?.[0] === fence.marker &&
        fenceMatch[1].length >= fence.length &&
        line.slice(fenceMatch[0].length).trim() === ""
      ) {
        fence = undefined
      }
      continue
    }
    if (fenceMatch?.[1]) {
      fence = {
        marker: fenceMatch[1][0] as "`" | "~",
        length: fenceMatch[1].length,
      }
      continue
    }

    const heading = line.match(/^ {0,3}(#{1,6})(?:[ \t]+|$)(.*)$/)
    if (!heading?.[1]) continue
    const level = heading[1].length
    const title = (heading[2] ?? "")
      .replace(/[ \t]+#+[ \t]*$/, "")
      .trim()
    if (!title) throw new Error(`Markdown heading at line ${index + 1} has no title`)

    while (ancestors.at(-1) && (ancestors.at(-1)?.level ?? 0) >= level) {
      ancestors.pop()
    }
    const parentKey = ancestors.at(-1)?.key ?? null
    const slug = headingSlug(title)
    const occurrenceKey = `${parentKey ?? "root"}\u0000${slug}`
    const occurrence = (siblingOccurrences.get(occurrenceKey) ?? 0) + 1
    siblingOccurrences.set(occurrenceKey, occurrence)
    const key = `${parentKey ?? "root"}/${slug}:${occurrence}`
    pending.push({
      key,
      level,
      ordinal: pending.length,
      title,
      parentKey,
      startLine: index + 1,
    })
    ancestors.push({ level, key })
  }

  return pending.map((heading, index) => ({
    ...heading,
    endLine: (pending[index + 1]?.startLine ?? lines.length + 1) - 1,
  }))
}

async function readConfinedText(input: { workspaceRoot: string; relativePath: string }) {
  if (!input.workspaceRoot.trim()) throw new Error("workspaceRoot must not be empty")
  if (!input.relativePath.trim()) throw new Error("relativePath must not be empty")
  if (isAbsolute(input.relativePath)) {
    throw new Error("Markdown material path must be relative to the workspace root")
  }

  const lexicalRoot = resolve(input.workspaceRoot)
  const lexicalTarget = resolve(lexicalRoot, input.relativePath)
  assertInsideRoot(lexicalRoot, lexicalTarget)
  const workspaceRoot = realpathSync.native(lexicalRoot)
  const target = realpathSync.native(lexicalTarget)
  assertInsideRoot(workspaceRoot, target)
  const stats = statSync(target)
  if (!stats.isFile()) throw new Error(`Markdown material is not a file: ${input.relativePath}`)
  if (stats.size > MAX_MARKDOWN_BYTES) {
    throw new Error(`Markdown material exceeds ${MAX_MARKDOWN_BYTES} bytes: ${input.relativePath}`)
  }
  const text = await Bun.file(target).text()
  return {
    workspaceRoot,
    relativePath: relative(workspaceRoot, target).replaceAll("\\", "/"),
    byteLength: stats.size,
    text,
  }
}

function assertInsideRoot(root: string, target: string) {
  const pathFromRoot = relative(root, target)
  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..\\`) || pathFromRoot.startsWith("../") || isAbsolute(pathFromRoot)) {
    throw new Error(`Markdown material resolves outside the workspace root: ${target}`)
  }
}

function sliceLines(content: string, startLine: number, endLine: number) {
  const lines = splitLines(content)
  if (endLine > lines.length) {
    throw new RangeError(`Markdown selector exceeds source lines: ${endLine} > ${lines.length}`)
  }
  return lines.slice(startLine - 1, endLine).join("\n")
}

function splitLines(content: string) {
  return content.split(/\r?\n/)
}

function assertLineRange(startLine: number, endLine: number) {
  if (
    !Number.isSafeInteger(startLine) ||
    !Number.isSafeInteger(endLine) ||
    startLine < 1 ||
    endLine < startLine
  ) {
    throw new RangeError(`Invalid Markdown selector: ${startLine}-${endLine}`)
  }
}

function headingSlug(title: string) {
  const slug = title
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/g, "")
  return slug || "section"
}
