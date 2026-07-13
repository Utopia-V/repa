import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
} from "@ai-sdk/provider"
import { wrapLanguageModel } from "ai"

export const EXACT_REASON_DEFAULT_MARKER =
  "Exact-source conditional default (program-owned composition status)"

export const EXACT_REASON_DEFAULT_CONTRIBUTION = [
  EXACT_REASON_DEFAULT_MARKER + ":",
  "- The sole visible [eligible; current_view] Agenda concern is the conditional default for this Turn when the admitted learner request is a generic compatible continuation.",
  "- Treat that concern's exact stored reason as the operative purpose. Preserve any ordering, assistance, or learner-role condition expressed there. Do not rewrite it or add semantics not present in the exact source.",
  "- The exact current learner request remains higher priority when it explicitly conflicts, redirects, specifies another form, or reports a completed occurrence.",
  "- The default itself does not address Agenda, create evidence, or prove learning. Do not narrate this control status to the learner.",
].join("\n")

export function injectExactReasonDefault(
  params: LanguageModelV3CallOptions,
): LanguageModelV3CallOptions {
  const systemIndex = params.prompt.findIndex((message) => message.role === "system")
  if (systemIndex < 0) throw new Error("ALS-022E requires the production system prompt")
  const system = params.prompt[systemIndex]
  if (system?.role !== "system") throw new Error("ALS-022E system contribution changed")
  if (system.content.includes(EXACT_REASON_DEFAULT_MARKER)) {
    throw new Error("ALS-022E exact-reason default was injected more than once")
  }
  const prompt = params.prompt.slice()
  prompt[systemIndex] = {
    ...system,
    content: `${system.content}\n\n${EXACT_REASON_DEFAULT_CONTRIBUTION}`,
  }
  return { ...params, prompt }
}

export function withExactReasonDefault(model: LanguageModelV3) {
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v3",
      transformParams: async ({ params }) => injectExactReasonDefault(params),
    },
  })
}

