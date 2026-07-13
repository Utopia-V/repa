import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Database } from "bun:sqlite"
import type { LanguageModelV3StreamPart, LanguageModelV3Usage } from "@ai-sdk/provider"
import { APICallError } from "ai"
import { MockLanguageModelV3 } from "ai/test"
import { runTutorTurn } from "../../src/runtime/run-tutor-turn"
import { parseMarkdownHeadings } from "../../src/sources/markdown-artifact"
import { assessScenario, captureDurableSnapshot, prepareScenario } from "./harness"
import { observeLanguageModel } from "./observed-model"
import {
  exportBlindReviewPackets,
  validateBlindContrastReviewFile,
  validateBlindReviewFile,
} from "./review"
import {
  assertNoPartialCaseWrites,
  assertCampaignRecoveryState,
  existingCampaignCost,
  existingObservedCampaignCost,
  frozenSourceFingerprint,
  isInfrastructureFailure,
  readValidatedCaseResult,
  readValidatedCompletedCase,
} from "./run"
import {
  blindReviewOrder,
  CONTROLLED_PRIOR_TRANSCRIPT,
  GUIDED_OCCURRENCE_CONDITION,
  INDEPENDENT_OCCURRENCE_BODY,
  mainOrders,
  POLICY_PROFILE_REVISION,
  PROTOCOL_REVISION,
  scenarioById,
  scenarioIds,
  scenarios,
  SHARED_AGENDA_SOURCE,
  UNAIDED_OCCURRENCE_CONDITION,
  validateProtocol,
} from "./protocol"

const temporaryRoots: string[] = []
const openDatabases: Database[] = []

afterEach(async () => {
  for (const database of openDatabases.splice(0).reverse()) {
    try {
      database.close()
    } catch {
      // A test may have explicitly closed a prepared scenario.
    }
  }
  Bun.gc(true)
  await Bun.sleep(80)
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  }
})

describe("ALS-021 shared Tutor policy protocol", () => {
  test("formal orders are complete and do not repeat a condition position", () => {
    expect(validateProtocol()).toBe(true)
    expect(mainOrders).toHaveLength(8)
    for (const id of scenarioIds) {
      const positions = mainOrders.map((order) => order.indexOf(id))
      expect(new Set(positions).size).toBe(8)
    }
  })

  test("lab bookkeeping labels are absent from every model-visible fixture value", () => {
    const visibleValues = [
      CONTROLLED_PRIOR_TRANSCRIPT.user,
      CONTROLLED_PRIOR_TRANSCRIPT.assistant,
      SHARED_AGENDA_SOURCE,
      ...scenarios.flatMap((scenario) => [scenario.learnerText, scenario.agendaReason ?? ""]),
    ]
    for (const id of scenarioIds) {
      expect(visibleValues.every((value) => !value.includes(id))).toBe(true)
    }
  })

  test("the controlled course is one aligned item with both outer and nested copy oracles", async () => {
    const text = await Bun.file(new URL("./fixtures/course.md", import.meta.url)).text()
    const headings = parseMarkdownHeadings(text)
    expect(headings).toEqual([
      expect.objectContaining({
        ordinal: 0,
        title: "JavaScript object identity, aliasing, and shallow copying",
        startLine: 1,
      }),
    ])
    expect(text).toContain("// 2 2 1")
    expect(text).toContain("// 2 2")
  })

  test("Agenda contrasts hold target, source, time, and current input fixed", async () => {
    const ids = [
      "return_repair",
      "return_independent_prediction",
      "return_discrimination",
    ] as const
    const prepared = await Promise.all(
      ids.map((id, index) => prepare(id, `agenda-${index + 1}`)),
    )
    const concerns = prepared.map((item) => item.initialSnapshot.agendaConcerns[0]!)
    const coordinates = concerns.map((concern) => ({
      sourceItemId: concern.sourceItemId,
      target: concern.target,
      notBefore: concern.notBefore,
      authorship: concern.authorship,
    }))
    expect(coordinates[1]).toEqual(coordinates[0])
    expect(coordinates[2]).toEqual(coordinates[0])
    expect(new Set(concerns.map((concern) => concern.reason)).size).toBe(3)
    expect(new Set(prepared.map((item) => item.scenario.learnerText)).size).toBe(1)
    expect(prepared.every((item) => item.initialSnapshot.stateRevision === 2)).toBe(true)
  })

  test("actual Agenda provider inputs differ only in the frozen purpose reason", async () => {
    const ids = [
      "return_repair",
      "return_independent_prediction",
      "return_discrimination",
    ] as const
    const records = await Promise.all(
      ids.map((id, index) => captureProviderInput(id, `request-agenda-${index + 1}`)),
    )
    const normalized = records.map(({ scenario, request }) =>
      JSON.stringify(request).replaceAll(scenario.agendaReason!, "<AGENDA_REASON>"),
    )
    expect(normalized[1]).toBe(normalized[0])
    expect(normalized[2]).toBe(normalized[0])
  })

  test("history controls share an exact prior transcript without fabricating learning state", async () => {
    const failed = await prepare("failed_prose_represent", "history-failed")
    const understood = await prepare("understood_prose_extend", "history-understood")
    for (const item of [failed, understood]) {
      expect(item.initialSnapshot.stateRevision).toBe(1)
      expect(item.initialSnapshot.agendaConcerns).toEqual([])
      expect(
        item.initialSnapshot.sessions.find(
          (session) => session.sessionId === "session:controlled-history",
        )?.items.map((entry) => ({ role: entry.role, content: entry.content })),
      ).toEqual([
        { role: "user", content: CONTROLLED_PRIOR_TRANSCRIPT.user },
        { role: "assistant", content: CONTROLLED_PRIOR_TRANSCRIPT.assistant },
      ])
    }
  })

  test("actual history provider inputs differ only in current learner feedback", async () => {
    const records = await Promise.all([
      captureProviderInput("failed_prose_represent", "request-history-failed"),
      captureProviderInput("understood_prose_extend", "request-history-understood"),
    ])
    const normalized = records.map(({ scenario, request }) =>
      JSON.stringify(request).replaceAll(scenario.learnerText, "<CURRENT_LEARNER_INPUT>"),
    )
    expect(normalized[1]).toBe(normalized[0])
  })

  test("Agenda service controls differ only in the declared assistance condition", async () => {
    const complete = scenarioById("return_independent_completed")
    const guided = scenarioById("return_independent_guided")
    expect(complete.materialRead).toBe("optional")
    expect(guided.materialRead).toBe("optional")
    expect(complete.learnerText).toContain(INDEPENDENT_OCCURRENCE_BODY)
    expect(guided.learnerText).toContain(INDEPENDENT_OCCURRENCE_BODY)
    expect(
      complete.learnerText.replace(
        UNAIDED_OCCURRENCE_CONDITION,
        "<ASSISTANCE_CONDITION>",
      ),
    ).toBe(
      guided.learnerText.replace(
        GUIDED_OCCURRENCE_CONDITION,
        "<ASSISTANCE_CONDITION>",
      ),
    )

    const records = await Promise.all([
      captureProviderInput("return_independent_completed", "request-service-complete"),
      captureProviderInput("return_independent_guided", "request-service-guided"),
    ])
    const normalized = [
      JSON.stringify(records[0]!.request).replaceAll(
        UNAIDED_OCCURRENCE_CONDITION,
        "<ASSISTANCE_CONDITION>",
      ),
      JSON.stringify(records[1]!.request).replaceAll(
        GUIDED_OCCURRENCE_CONDITION,
        "<ASSISTANCE_CONDITION>",
      ),
    ]
    expect(normalized[1]).toBe(normalized[0])
  })

  test("the mechanical harness observes an unchanged production Tutor Turn end to end", async () => {
    const prepared = await prepare("deadline_direct_help", "mechanical-smoke")
    let providerCall = 0
    const observed = observeLanguageModel(
      new MockLanguageModelV3({
        doStream: async () => {
          providerCall += 1
          if (providerCall === 1) {
            return {
              stream: modelStream([
                { type: "stream-start", warnings: [] },
                {
                  type: "tool-call",
                  toolCallId: "call:read-material",
                  toolName: "read_current_course_material",
                  input: "{}",
                },
                modelFinish("tool-calls"),
              ]),
            }
          }
          return {
            stream: modelStream([
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "answer" },
              {
                type: "text-delta",
                id: "answer",
                delta: "输出是 2 2 1，因为 alias 和 original 指向同一对象。",
              },
              { type: "text-end", id: "answer" },
              modelFinish(),
            ]),
          }
        },
      }),
    )
    const outcome = await runTutorTurn({
      database: prepared.database,
      model: observed.model,
      workspaceRoot: prepared.workspaceRoot,
      learnerText: prepared.scenario.learnerText,
      identity: prepared.identity,
      timeZone: "Asia/Shanghai",
      policyProfileRevision: POLICY_PROFILE_REVISION,
      clock: prepared.clock,
      maxModelSteps: 6,
      maxOutputTokens: 1_200,
    })
    const assessment = assessScenario({
      prepared,
      finalSnapshot: captureDurableSnapshot(prepared.database),
      observations: observed.snapshot(),
      outcomeText: outcome.text,
    })

    expect(assessment.programPassed).toBe(true)
    expect(assessment.mechanicalPolicyPassed).toBe(true)
    expect(assessment.checks.every((check) => check.passed)).toBe(true)
  })

  test("a rejected mutation is a policy failure while the production boundary passes", async () => {
    const prepared = await prepare("deadline_direct_help", "rejected-mutation")
    let providerCall = 0
    const observed = observeLanguageModel(
      new MockLanguageModelV3({
        doStream: async () => {
          providerCall += 1
          if (providerCall === 1) {
            return {
              stream: modelStream([
                { type: "stream-start", warnings: [] },
                {
                  type: "tool-call",
                  toolCallId: "call:invalid-agenda",
                  toolName: "create_future_attention",
                  input: JSON.stringify({
                    authorship: { kind: "tutor_initiated" },
                    reason: "unsupported scheduling attempt",
                    notBefore: "2020-01-01T00:00:00+08:00",
                  }),
                },
                modelFinish("tool-calls"),
              ]),
            }
          }
          if (providerCall === 2) {
            return {
              stream: modelStream([
                { type: "stream-start", warnings: [] },
                {
                  type: "tool-call",
                  toolCallId: "call:read-after-rejection",
                  toolName: "read_current_course_material",
                  input: "{}",
                },
                modelFinish("tool-calls"),
              ]),
            }
          }
          return {
            stream: modelStream([
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "answer" },
              { type: "text-delta", id: "answer", delta: "输出是 2 2 1。" },
              { type: "text-end", id: "answer" },
              modelFinish(),
            ]),
          }
        },
      }),
    )
    const outcome = await executePreparedTurn(prepared, observed.model)
    const assessment = assessScenario({
      prepared,
      finalSnapshot: captureDurableSnapshot(prepared.database),
      observations: observed.snapshot(),
      outcomeText: outcome.text,
    })

    expect(assessment.programPassed).toBe(true)
    expect(assessment.reviewablePolicySample).toBe(true)
    expect(assessment.mechanicalPolicyPassed).toBe(false)
    expect(
      assessment.checks.find((check) => check.name.includes("mutation attempts")),
    ).toMatchObject({ passed: false, layer: "policy" })
  })

  test("a provider failure preserves program invariants but is not reviewable", async () => {
    const prepared = await prepare("deadline_direct_help", "provider-failure")
    const failure = new APICallError({
      message: "controlled provider outage",
      url: "https://provider.invalid/als-021",
      requestBodyValues: {},
      statusCode: 503,
      isRetryable: true,
    })
    const observed = observeLanguageModel(
      new MockLanguageModelV3({
        doStream: async () => {
          throw failure
        },
      }),
    )
    let caught: Error | undefined
    try {
      await executePreparedTurn(prepared, observed.model)
    } catch (error) {
      caught = error instanceof Error ? error : new Error(String(error))
    }
    const failureRecord = {
      name: caught?.name ?? "Error",
      message: caught?.message ?? "missing failure",
    }
    const observations = observed.snapshot()
    const assessment = assessScenario({
      prepared,
      finalSnapshot: captureDurableSnapshot(prepared.database),
      observations,
      outcomeText: undefined,
      executionFailure: failureRecord,
    })

    expect(caught?.message).toContain("controlled provider outage")
    expect(assessment.programPassed).toBe(true)
    expect(assessment.harnessIntegrityPassed).toBe(true)
    expect(assessment.reviewablePolicySample).toBe(false)
    expect(assessment.mechanicalPolicyPassed).toBe(false)
    expect(isInfrastructureFailure(failureRecord, observations)).toBe(true)
  })

  test("a completed provider stream with no assistant text is not infrastructure", async () => {
    const prepared = await prepare("deadline_direct_help", "empty-provider-output")
    const observed = observeLanguageModel(
      new MockLanguageModelV3({
        doStream: async () => ({
          stream: modelStream([
            { type: "stream-start", warnings: [] },
            modelFinish(),
          ]),
        }),
      }),
    )
    let failure: Error | undefined
    try {
      await executePreparedTurn(prepared, observed.model)
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error))
    }
    const failureRecord = {
      name: failure?.name ?? "Error",
      message: failure?.message ?? "missing failure",
    }
    const observations = observed.snapshot()
    const assessment = assessScenario({
      prepared,
      finalSnapshot: captureDurableSnapshot(prepared.database),
      observations,
      outcomeText: undefined,
      executionFailure: failureRecord,
    })

    expect(failure?.message).toContain("without a model-visible assistant response")
    expect(assessment.programPassed).toBe(true)
    expect(assessment.harnessIntegrityPassed).toBe(true)
    expect(assessment.reviewablePolicySample).toBe(false)
    expect(isInfrastructureFailure(failureRecord, observations)).toBe(false)
  })

  test("an incomplete observer lifecycle is a harness failure, not a policy sample", async () => {
    const prepared = await prepare("deadline_direct_help", "observer-incomplete")
    const observed = observeLanguageModel(
      new MockLanguageModelV3({
        doStream: async () => ({
          stream: modelStream([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "answer" },
            { type: "text-delta", id: "answer", delta: "2 2 1。" },
            { type: "text-end", id: "answer" },
            modelFinish(),
          ]),
        }),
      }),
    )
    const outcome = await executePreparedTurn(prepared, observed.model)
    const observations = observed.snapshot()
    observations[0]!.status = "streaming"
    const assessment = assessScenario({
      prepared,
      finalSnapshot: captureDurableSnapshot(prepared.database),
      observations,
      outcomeText: outcome.text,
    })

    expect(assessment.programPassed).toBe(true)
    expect(assessment.harnessIntegrityPassed).toBe(false)
    expect(assessment.reviewablePolicySample).toBe(false)
    expect(assessment.mechanicalPolicyPassed).toBe(false)
  })

  test("an independent complete occurrence can address exactly one seeded concern", async () => {
    const prepared = await prepare("return_independent_completed", "address-complete")
    let providerCall = 0
    const observed = observeLanguageModel(
      new MockLanguageModelV3({
        doStream: async () => {
          providerCall += 1
          if (providerCall === 1) {
            return {
              stream: modelStream([
                { type: "stream-start", warnings: [] },
                {
                  type: "tool-call",
                  toolCallId: "call:read-before-address",
                  toolName: "read_current_course_material",
                  input: "{}",
                },
                modelFinish("tool-calls"),
              ]),
            }
          }
          if (providerCall === 2) {
            return {
              stream: modelStream([
                { type: "stream-start", warnings: [] },
                {
                  type: "tool-call",
                  toolCallId: "call:address-independent",
                  toolName: "address_future_attention",
                  input: JSON.stringify({
                    concernId: "agenda:als-021:seed",
                    alignmentRationale:
                      "The learner reports a complete unaided prediction and explains the alias relation.",
                  }),
                },
                modelFinish("tool-calls"),
              ]),
            }
          }
          return {
            stream: modelStream([
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "feedback" },
              {
                type: "text-delta",
                id: "feedback",
                delta: "这次推理与材料一致；这里只记录这次独立预测目的已经完成，不等于掌握证明。",
              },
              { type: "text-end", id: "feedback" },
              modelFinish(),
            ]),
          }
        },
      }),
    )
    const outcome = await executePreparedTurn(prepared, observed.model)
    const assessment = assessScenario({
      prepared,
      finalSnapshot: captureDurableSnapshot(prepared.database),
      observations: observed.snapshot(),
      outcomeText: outcome.text,
    })

    expect(assessment.programPassed).toBe(true)
    expect(assessment.reviewablePolicySample).toBe(true)
    expect(assessment.mechanicalPolicyPassed).toBe(true)
    expect(assessment.checks.every((check) => check.passed)).toBe(true)
  })

  test("blind review export selects only each case's completed retry result", async () => {
    const root = mkdtempSync(join(tmpdir(), "repa-als-021-review-"))
    temporaryRoots.push(root)
    let staleAttemptPath = ""
    for (const [blockIndex, order] of mainOrders.entries()) {
      for (const [position, scenarioId] of order.entries()) {
        const caseRoot = join(root, `block-${blockIndex + 1}`, `case-${position + 1}`)
        mkdirSync(caseRoot, { recursive: true })
        if (blockIndex === 0 && position === 0) {
          staleAttemptPath = join(caseRoot, "attempt-01.result.json")
          await Bun.write(
            staleAttemptPath,
            JSON.stringify(formalReviewFixture(blockIndex, position, scenarioId, "stale")),
          )
        }
        const selectedPath = join(caseRoot, "attempt-02.result.json")
        await Bun.write(
          selectedPath,
          JSON.stringify(
            formalReviewFixture(
              blockIndex,
              position,
              scenarioId,
              "selected",
              !(blockIndex === 0 && position === 0),
            ),
          ),
        )
        await Bun.write(
          join(caseRoot, "complete.json"),
          JSON.stringify({ resultPath: selectedPath }),
        )
      }
    }

    expect(await exportBlindReviewPackets(root)).toEqual({
      packets: blindReviewOrder.length,
      contrasts: 16,
    })
    const mapping = (await Bun.file(join(root, "review-map.json")).json()) as Array<{
      reviewId: string
      scenarioId: string
      resultPath: string
      primaryCriterionAutomaticallyFailed: boolean
    }>
    expect(mapping).toHaveLength(blindReviewOrder.length)
    expect(mapping.some((entry) => entry.resultPath === staleAttemptPath)).toBe(false)
    expect(
      mapping.filter((entry) => entry.primaryCriterionAutomaticallyFailed),
    ).toHaveLength(1)
    expect(await Bun.file(join(root, "review-packets.jsonl")).text()).not.toContain(
      "return_repair",
    )
    const packets = (await Bun.file(join(root, "review-packets.jsonl")).text())
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line)) as Array<{
        reviewId: string
        durableAgendaChanges: Array<{ persisted: { reason: string } }>
        reviewablePolicySample?: unknown
      }>
    const explicitReviewId = mapping.find(
      (entry) => entry.scenarioId === "explicit_later_return",
    )?.reviewId
    const explicitPacket = packets.find((packet) => packet.reviewId === explicitReviewId)
    expect(explicitPacket?.durableAgendaChanges[0]?.persisted.reason).toBe(
      "persisted semantic purpose",
    )
    expect(explicitPacket).not.toHaveProperty("reviewablePolicySample")
    const contrastPacketText = await Bun.file(
      join(root, "review-contrast-packets.jsonl"),
    ).text()
    expect(contrastPacketText.trim().split(/\r?\n/)).toHaveLength(16)
    expect(contrastPacketText).not.toContain("failed_prose_represent")
    expect(contrastPacketText).not.toContain("return_independent_prediction")
  })

  test("blind review export fails closed for incomplete or escaping completion records", async () => {
    const incompleteRoot = mkdtempSync(join(tmpdir(), "repa-als-021-review-missing-"))
    temporaryRoots.push(incompleteRoot)
    await expect(exportBlindReviewPackets(incompleteRoot)).rejects.toThrow(
      "Formal campaign is incomplete",
    )

    const escapingRoot = mkdtempSync(join(tmpdir(), "repa-als-021-review-escape-"))
    const outsideRoot = mkdtempSync(join(tmpdir(), "repa-als-021-review-outside-"))
    temporaryRoots.push(escapingRoot, outsideRoot)
    const caseRoot = join(escapingRoot, "block-1", "case-1")
    mkdirSync(caseRoot, { recursive: true })
    const outsideResult = join(outsideRoot, "attempt-01.result.json")
    await Bun.write(
      outsideResult,
      JSON.stringify(formalReviewFixture(0, 0, scenarioIds[0]!, "outside")),
    )
    await Bun.write(
      join(caseRoot, "complete.json"),
      JSON.stringify({ resultPath: outsideResult }),
    )
    await expect(exportBlindReviewPackets(escapingRoot)).rejects.toThrow(
      "Completion points outside the campaign",
    )
  })

  test("blind review validation requires the exact frozen review ID set", async () => {
    const root = mkdtempSync(join(tmpdir(), "repa-als-021-review-validation-"))
    temporaryRoots.push(root)
    const shiftedPath = join(root, "shifted.jsonl")
    const shiftedRecords = blindReviewOrder.map((_, index) =>
      blindReviewRecord(`R${String(index + 2).padStart(3, "0")}`),
    )
    await Bun.write(
      shiftedPath,
      `${shiftedRecords.map((record) => JSON.stringify(record)).join("\n")}\n`,
    )
    await expect(validateBlindReviewFile(shiftedPath)).rejects.toThrow(
      "exact frozen set",
    )

    const contrastPath = join(root, "contrast.jsonl")
    await Bun.write(
      contrastPath,
      `${Array.from({ length: 16 }, (_, index) =>
        JSON.stringify({
          contrastId: `C${String(index + 1).padStart(3, "0")}`,
          contrastFit: "pass",
          evidence: "visible contrast",
        })).join("\n")}\n`,
    )
    await expect(validateBlindContrastReviewFile(contrastPath)).resolves.toHaveLength(16)
  })

  test("campaign recovery verifies a completion before skipping its provider call", async () => {
    const root = mkdtempSync(join(tmpdir(), "repa-als-021-recovery-"))
    const outsideRoot = mkdtempSync(join(tmpdir(), "repa-als-021-recovery-outside-"))
    temporaryRoots.push(root, outsideRoot)
    const caseRoot = join(root, "pilot", "01-novice_worked_example")
    mkdirSync(caseRoot, { recursive: true })
    const frozenSource = { protocolRevision: "recovery-fixture", sha256: { a: "b" } }
    const resultPath = join(caseRoot, "attempt-01.result.json")
    const completionPath = join(caseRoot, "complete.json")
    const result = {
      mode: "pilot",
      protocolRevision: PROTOCOL_REVISION,
      block: "pilot",
      plannedPosition: 1,
      scenario: { id: "novice_worked_example" },
      modelConfiguration: {
        requestedModel: "deepseek-v4-flash",
        policyProfileRevision: POLICY_PROFILE_REVISION,
      },
      frozenSource,
      providerCalls: [],
      assessment: { programPassed: true, harnessIntegrityPassed: true, checks: [] },
      modelAliasConsistent: true,
      estimatedCostUsd: 0.001,
      budgetChargeUsd: 0.001,
    }
    await Bun.write(resultPath, JSON.stringify(result))
    await Bun.write(
      completionPath,
      JSON.stringify({ resultPath, estimatedCostUsd: result.estimatedCostUsd }),
    )
    const expectation = {
      caseDirectory: caseRoot,
      completionPath,
      mode: "pilot" as const,
      protocolRevision: PROTOCOL_REVISION,
      block: "pilot",
      plannedPosition: 1,
      scenarioId: "novice_worked_example" as const,
      requestedModel: "deepseek-v4-flash" as const,
      policyProfileRevision: POLICY_PROFILE_REVISION,
      sourceFingerprint: frozenSourceFingerprint(frozenSource),
    }

    await expect(readValidatedCompletedCase(expectation)).resolves.toMatchObject({
      resultPath,
      estimatedCostUsd: 0.001,
    })
    await expect(readValidatedCaseResult(expectation, resultPath)).resolves.toMatchObject({
      estimatedCostUsd: 0.001,
      scenario: { id: "novice_worked_example" },
    })

    const partialPath = join(caseRoot, "attempt-02.03-provider-finished.json.partial")
    await Bun.write(partialPath, "{}")
    expect(() => assertNoPartialCaseWrites(caseRoot)).toThrow(
      "Partial campaign write retained",
    )
    rmSync(partialPath)

    const outsideResultPath = join(outsideRoot, "attempt-01.result.json")
    await Bun.write(outsideResultPath, JSON.stringify(result))
    await Bun.write(
      completionPath,
      JSON.stringify({ resultPath: outsideResultPath, estimatedCostUsd: 0.001 }),
    )
    await expect(readValidatedCompletedCase(expectation)).rejects.toThrow(
      "outside its case directory",
    )

    await Bun.write(resultPath, JSON.stringify({ ...result, scenario: { id: "return_repair" } }))
    await Bun.write(
      completionPath,
      JSON.stringify({ resultPath, estimatedCostUsd: result.estimatedCostUsd }),
    )
    await expect(readValidatedCompletedCase(expectation)).rejects.toThrow(
      "scenario identity",
    )

    await Bun.write(
      resultPath,
      JSON.stringify({
        ...result,
        modelConfiguration: { requestedModel: "deepseek-v4-pro" },
      }),
    )
    await expect(readValidatedCompletedCase(expectation)).rejects.toThrow(
      "requested model",
    )

    await Bun.write(
      resultPath,
      JSON.stringify({ ...result, frozenSource: { protocolRevision: "other" } }),
    )
    await expect(readValidatedCompletedCase(expectation)).rejects.toThrow(
      "frozen source",
    )
  })

  test("campaign accounting counts each attempt once and reserves started-only work", async () => {
    const root = mkdtempSync(join(tmpdir(), "repa-als-021-accounting-"))
    temporaryRoots.push(root)
    const completedCase = join(root, "block-1", "case-1")
    const finishedCase = join(root, "block-1", "case-2")
    const startedCase = join(root, "block-1", "case-3")
    const preparingCase = join(root, "block-1", "case-4")
    for (const directory of [completedCase, finishedCase, startedCase, preparingCase]) {
      mkdirSync(directory, { recursive: true })
    }
    await Bun.write(
      join(completedCase, "attempt-01.result.json"),
      JSON.stringify({ estimatedCostUsd: 0.01, budgetChargeUsd: 0.03 }),
    )
    await Bun.write(
      join(completedCase, "attempt-01.03-provider-finished.json"),
      JSON.stringify({ estimatedCostUsd: 0.01, budgetChargeUsd: 0.03 }),
    )
    await Bun.write(
      join(completedCase, "attempt-02.result.json"),
      JSON.stringify({ estimatedCostUsd: 0.02, budgetChargeUsd: 0.02 }),
    )
    await Bun.write(
      join(completedCase, "attempt-02.03-provider-finished.json"),
      JSON.stringify({ estimatedCostUsd: 0.02, budgetChargeUsd: 0.02 }),
    )
    await Bun.write(
      join(finishedCase, "attempt-01.03-provider-finished.json"),
      JSON.stringify({ estimatedCostUsd: 0.005, budgetChargeUsd: 0.03 }),
    )
    await Bun.write(
      join(startedCase, "attempt-01.02-provider-started.json"),
      JSON.stringify({ phase: "provider-started" }),
    )
    await Bun.write(
      join(preparingCase, "attempt-01.01-preparing.json"),
      JSON.stringify({ phase: "preparing" }),
    )

    expect(await existingCampaignCost(root)).toBeCloseTo(0.11, 10)
    expect(await existingObservedCampaignCost(root)).toBeCloseTo(0.035, 10)

    await Bun.write(
      join(completedCase, "attempt-03.result.json"),
      JSON.stringify({ estimatedCostUsd: 0.02, budgetChargeUsd: 0.01 }),
    )
    await expect(existingCampaignCost(root)).rejects.toThrow("invalid cost record")
  })

  test("campaign-wide recovery rejects partial or unresolved unselected cases", async () => {
    const root = mkdtempSync(join(tmpdir(), "repa-als-021-campaign-audit-"))
    temporaryRoots.push(root)
    const selected = join(root, "block-2", "case-selected")
    const other = join(root, "block-1", "case-other")
    mkdirSync(selected, { recursive: true })
    mkdirSync(other, { recursive: true })
    const partial = join(other, "attempt-01.03-provider-finished.json.partial")
    await Bun.write(partial, "{}")
    expect(() => assertCampaignRecoveryState(root, [selected])).toThrow(
      "Partial campaign write retained",
    )
    rmSync(partial)
    await Bun.write(
      join(other, "attempt-01.result.json"),
      JSON.stringify({ estimatedCostUsd: 0.01, budgetChargeUsd: 0.01 }),
    )
    expect(() => assertCampaignRecoveryState(root, [selected])).toThrow(
      "Unresolved campaign case is outside the selected work",
    )
  })
})

async function prepare(id: (typeof scenarioIds)[number], label: string) {
  const root = mkdtempSync(join(tmpdir(), "repa-als-021-"))
  temporaryRoots.push(root)
  const prepared = await prepareScenario({
    scenario: scenarioById(id),
    workspaceRoot: join(root, "workspace"),
    opaqueSampleId: label,
  })
  openDatabases.push(prepared.database)
  return prepared
}

async function captureProviderInput(id: (typeof scenarioIds)[number], label: string) {
  const prepared = await prepare(id, label)
  const observed = observeLanguageModel(
    new MockLanguageModelV3({
      doStream: async () => ({
        stream: modelStream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "controlled" },
          { type: "text-delta", id: "controlled", delta: "受控响应。" },
          { type: "text-end", id: "controlled" },
          modelFinish(),
        ]),
      }),
    }),
  )
  await runTutorTurn({
    database: prepared.database,
    model: observed.model,
    workspaceRoot: prepared.workspaceRoot,
    learnerText: prepared.scenario.learnerText,
    identity: prepared.identity,
    timeZone: "Asia/Shanghai",
    policyProfileRevision: POLICY_PROFILE_REVISION,
    clock: prepared.clock,
    maxModelSteps: 6,
    maxOutputTokens: 1_200,
    maxRetries: 0,
  })
  const request = observed.snapshot()[0]?.request
  if (request === undefined) throw new Error(`No provider request captured for ${id}`)
  const requestJson = JSON.stringify(request)
  expect(requestJson).not.toContain(prepared.scenario.id)
  expect(requestJson).not.toContain(prepared.scenario.family)
  expect(requestJson).not.toContain(prepared.scenario.qualitativeCriterion)
  expect(requestJson).not.toContain(prepared.scenario.prohibitedOutcome)
  return { scenario: prepared.scenario, request }
}

function executePreparedTurn(
  prepared: Awaited<ReturnType<typeof prepareScenario>>,
  model: Parameters<typeof runTutorTurn>[0]["model"],
) {
  return runTutorTurn({
    database: prepared.database,
    model,
    workspaceRoot: prepared.workspaceRoot,
    learnerText: prepared.scenario.learnerText,
    identity: prepared.identity,
    timeZone: "Asia/Shanghai",
    policyProfileRevision: POLICY_PROFILE_REVISION,
    clock: prepared.clock,
    maxModelSteps: 6,
    maxOutputTokens: 1_200,
    maxRetries: 0,
  })
}

function modelStream(parts: LanguageModelV3StreamPart[]) {
  return new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      for (const part of parts) controller.enqueue(part)
      controller.close()
    },
  })
}

function modelFinish(
  reason: "stop" | "tool-calls" = "stop",
): Extract<LanguageModelV3StreamPart, { type: "finish" }> {
  return {
    type: "finish",
    finishReason: { unified: reason, raw: reason },
    usage: emptyUsage(),
  }
}

function emptyUsage(): LanguageModelV3Usage {
  return {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0, reasoning: 0 },
  }
}

function formalReviewFixture(
  blockIndex: number,
  position: number,
  scenarioId: (typeof scenarioIds)[number],
  text: string,
  reviewablePolicySample = true,
) {
  const createdConcern = scenarioId === "explicit_later_return"
    ? {
        id: "agenda:review-fixture",
        sourceItemId: "item:user:review-fixture",
        authorship: {
          kind: "learner_requested",
          learnerRequestExcerpt: "later independent work",
        },
        target: { courseId: "course:fixture", courseItemId: "item:fixture" },
        reason: "persisted semantic purpose",
        notBefore: 100,
        status: "open",
        version: 1,
      }
    : undefined
  return {
    block: `block-${blockIndex + 1}`,
    plannedPosition: position + 1,
    scenario: { id: scenarioId },
    providerCalls: [{
      sequence: 1,
      request: { prompt: "opaque", attemptedReason: "provider attempt" },
      streamParts: [],
    }],
    outcome: { text },
    initialSnapshot: { agendaConcerns: [], sessions: [] },
    finalSnapshot: {
      agendaConcerns: createdConcern ? [createdConcern] : [],
      sessions: createdConcern
        ? [{
            items: [{
              itemId: "item:user:review-fixture",
              role: "user",
              content: "later independent work",
            }],
          }]
        : [],
    },
    assessment: { reviewablePolicySample },
  }
}

function blindReviewRecord(reviewId: string) {
  return {
    reviewId,
    situationFit: "pass",
    representationChange: "not_applicable",
    cognitiveRolePreserved: "not_applicable",
    currentRequestRespected: "not_applicable",
    directHelpDelivered: "not_applicable",
    boundaryProgress: "not_applicable",
    discriminationObservable: "not_applicable",
    durablePurposePreserved: "not_applicable",
    learnerAuthorshipGrounded: "not_applicable",
    answerLeakage: "not_applicable",
    factualSeverity: "none",
    unsupportedLearningStateClaim: "absent",
    observedMove: "bounded move",
    evidence: "visible response evidence",
  }
}
