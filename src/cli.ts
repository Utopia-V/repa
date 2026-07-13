import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { recoverOrphanedRuntime } from "./interaction/records"
import {
  createDeepSeekModel,
  estimateDeepSeekUpperBoundUsd,
  loadDeepSeekApiKey,
  parseDeepSeekModel,
} from "./providers/deepseek"
import { runTutorTurn } from "./runtime/run-tutor-turn"
import {
  acquireLearnerHomeWriteOwnership,
  type LearnerHomeWriteOwnership,
} from "./storage/learner-home-owner"
import { openRepaDatabase } from "./storage/open-database"
import { CURRENT_TUTOR_POLICY_PROFILE_REVISION } from "./tutor/policy-profile"

const parsed = parseArguments(Bun.argv.slice(2))
if (parsed.help) {
  console.log(usage())
  process.exit(0)
}
if (!parsed.learnerText) {
  console.error(usage())
  process.exit(2)
}

const databasePath = resolve(parsed.databasePath ?? ".repa/repa.sqlite")
mkdirSync(dirname(databasePath), { recursive: true })
const abortController = new AbortController()
process.once("SIGINT", () => abortController.abort("Learner interrupted the Turn"))

let ownership: LearnerHomeWriteOwnership | undefined
let database: ReturnType<typeof openRepaDatabase> | undefined
try {
  ownership = acquireLearnerHomeWriteOwnership({ databasePath })
  database = openRepaDatabase(databasePath)
  const recovered = recoverOrphanedRuntime(database, { recoveredAt: Date.now() })
  if (recovered.interruptedTurns > 0) {
    console.error(`Recovered ${recovered.interruptedTurns} interrupted Turn(s).`)
  }

  const modelId = parseDeepSeekModel(parsed.model ?? process.env.REPA_MODEL)
  const apiKey = await loadDeepSeekApiKey()
  const startedAt = performance.now()
  const runId = crypto.randomUUID()
  const sessionId = parsed.sessionId ?? process.env.REPA_SESSION ?? "default"
  const timeZone =
    parsed.timeZone ??
    process.env.REPA_TIME_ZONE ??
    Intl.DateTimeFormat().resolvedOptions().timeZone

  const outcome = await runTutorTurn({
    database,
    model: createDeepSeekModel({ apiKey, model: modelId }),
    workspaceRoot: process.cwd(),
    learnerText: parsed.learnerText,
    identity: {
      sessionId,
      turnId: `turn:${runId}`,
      userItemId: `item:user:${runId}`,
      assistantItemId: `item:assistant:${runId}`,
      modelOperationId: (stepNumber) => `model:${runId}:${stepNumber}`,
      toolItemId: (toolCallId) => `item:tool:${runId}:${toolCallId}`,
    },
    timeZone,
    policyProfileRevision: CURRENT_TUTOR_POLICY_PROFILE_REVISION,
    abortSignal: abortController.signal,
    maxModelSteps: 8,
    maxOutputTokens: 1_200,
    onTextDelta(delta) {
      process.stdout.write(delta)
    },
  })
  process.stdout.write("\n")

  const report = {
    recordedAt: new Date().toISOString(),
    sessionId,
    model: modelId,
    modelSteps: outcome.modelSteps,
    finishReason: outcome.finishReason,
    elapsedMs: Math.round(performance.now() - startedAt),
    usage: outcome.usage,
    estimatedUpperBoundUsd: estimateDeepSeekUpperBoundUsd(modelId, outcome.usage),
  }
  const runDirectory = resolve(".repa/runs")
  mkdirSync(runDirectory, { recursive: true })
  const reportPath = resolve(runDirectory, `${runId}.json`)
  await Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.error(
    `[${modelId}; ${outcome.modelSteps} step(s); ${outcome.usage.totalTokens ?? "?"} tokens; ≤$${report.estimatedUpperBoundUsd.toFixed(6)}; session ${sessionId}]`,
  )
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Repa Turn failed: ${message}`)
  process.exitCode = 1
} finally {
  database?.close()
  ownership?.release()
}

type ParsedArguments = {
  help: boolean
  learnerText?: string
  databasePath?: string
  sessionId?: string
  model?: string
  timeZone?: string
}

function parseArguments(arguments_: string[]): ParsedArguments {
  const remaining = [...arguments_]
  const help = removeFlag(remaining, "--help") || removeFlag(remaining, "-h")
  const databasePath = removeOption(remaining, "--db")
  const sessionId = removeOption(remaining, "--session")
  const model = removeOption(remaining, "--model")
  const timeZone = removeOption(remaining, "--time-zone")
  const unknownOption = remaining.find((value) => value.startsWith("--"))
  if (unknownOption) throw new Error(`Unknown option: ${unknownOption}`)
  const learnerText = remaining.join(" ").trim() || undefined
  return {
    help,
    ...(learnerText === undefined ? {} : { learnerText }),
    ...(databasePath === undefined ? {} : { databasePath }),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(model === undefined ? {} : { model }),
    ...(timeZone === undefined ? {} : { timeZone }),
  }
}

function removeFlag(arguments_: string[], name: string) {
  const index = arguments_.indexOf(name)
  if (index === -1) return false
  arguments_.splice(index, 1)
  return true
}

function removeOption(arguments_: string[], name: string) {
  const index = arguments_.indexOf(name)
  if (index === -1) return undefined
  const value = arguments_[index + 1]
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`)
  arguments_.splice(index, 2)
  return value
}

function usage() {
  return [
    "Usage: bun run repa [options] <learner message>",
    "",
    "Options:",
    "  --session <id>       Continue one durable Session (default: default)",
    "  --db <path>          SQLite state path (default: .repa/repa.sqlite)",
    "  --model <id>         deepseek-v4-flash or deepseek-v4-pro",
    "  --time-zone <iana>   Context timezone (default: system timezone)",
  ].join("\n")
}
