import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
} from "@ai-sdk/provider"
import { wrapLanguageModel } from "ai"

export const ORACLE_SELECTED_PURPOSE_MARKER =
  "Selected current learning purpose (program-owned control decision for this Turn)"

export const ORACLE_SELECTED_PURPOSE = [
  ORACLE_SELECTED_PURPOSE_MARKER + ":",
  "- Source: the visible eligible Agenda concern about independently predicting alias mutation before receiving help. Preserve its exact concern identity and source context from the context cut.",
  "- Purpose now: obtain one unaided, answerable prediction before explaining the result.",
  "- Learner-role constraint: before the learner commits to a prediction, do not reveal the final output, execute the decisive reasoning step, eliminate all meaningful alternatives, or give a hint that removes the central decision.",
  "- Service boundary for this response: present a clear prediction question and wait for the learner's answer. Asking the question does not address the Agenda concern and does not prove learning or mastery.",
  "- Flexible realization: choose the exact example, wording, and representation; read the aligned material first if useful. Do not narrate this control decision to the learner.",
].join("\n")

export function injectOracleSelectedPurpose(
  params: LanguageModelV3CallOptions,
): LanguageModelV3CallOptions {
  const systemIndex = params.prompt.findIndex((message) => message.role === "system")
  if (systemIndex < 0) {
    throw new Error("ALS-022A requires an existing production system contribution")
  }
  const system = params.prompt[systemIndex]
  if (system?.role !== "system") {
    throw new Error("ALS-022A system contribution changed while injecting the oracle")
  }
  if (system.content.includes(ORACLE_SELECTED_PURPOSE_MARKER)) {
    throw new Error("ALS-022A oracle selected purpose was injected more than once")
  }
  const prompt = params.prompt.slice()
  prompt[systemIndex] = {
    ...system,
    content: `${system.content}\n\n${ORACLE_SELECTED_PURPOSE}`,
  }
  return { ...params, prompt }
}

export function withOracleSelectedPurpose(model: LanguageModelV3) {
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v3",
      transformParams: async ({ params }) => injectOracleSelectedPurpose(params),
    },
  })
}

export function inspectPredictionResponse(text: string) {
  const normalized = text.replaceAll("，", ",").replaceAll(/\s+/g, " ").trim()
  return {
    asksForPrediction:
      /预测|先.{0,10}(?:判断|回答|写下)|输出(?:是|为|什么)|你认为|请.{0,12}(?:判断|回答)/u.test(
        normalized,
      ),
    containsKnownSeededAnswer:
      /(?:^|\D)2\s*[, ]\s*2\s*[, ]\s*1(?:\D|$)/u.test(normalized),
    containsQuestionMark: /[?？]/u.test(normalized),
    normalizedLength: normalized.length,
  }
}

