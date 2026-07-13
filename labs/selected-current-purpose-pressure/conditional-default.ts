import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
} from "@ai-sdk/provider"
import { wrapLanguageModel } from "ai"

export const CONDITIONAL_DEFAULT_MARKER =
  "Conditional default current learning purpose (program-selected from the sole legal Agenda candidate)"

export const CONDITIONAL_DEFAULT_CONTRIBUTION = [
  CONDITIONAL_DEFAULT_MARKER + ":",
  "- Exact source meaning: 回来时检查学习者能否在不先得到答案或决定性提示的情况下，独立预测别名修改的结果。 Do not rewrite that source meaning.",
  "- This is the default only when the admitted current learner request is a generic continuation compatible with it. In that case, ask one clear unaided prediction and wait; do not reveal the answer or a decisive hint first.",
  "- The learner's explicit current request remains higher priority. If it asks for direct help, a different form/purpose, cancellation, redirection, or reports a completed occurrence, follow that exact request instead. Leave the concern open unless a complete aligned occurrence truthfully supports the ordinary address command.",
  "- Overriding the default does not change or reinterpret the Agenda reason. Do not narrate this control comparison to the learner.",
  "- Selection or beginning a move never proves learning or mastery.",
].join("\n")

export function injectConditionalDefault(
  params: LanguageModelV3CallOptions,
): LanguageModelV3CallOptions {
  const systemIndex = params.prompt.findIndex((message) => message.role === "system")
  if (systemIndex < 0) {
    throw new Error("ALS-022D requires an existing production system contribution")
  }
  const system = params.prompt[systemIndex]
  if (system?.role !== "system") throw new Error("ALS-022D system contribution changed")
  if (system.content.includes(CONDITIONAL_DEFAULT_MARKER)) {
    throw new Error("ALS-022D conditional default was injected more than once")
  }
  const prompt = params.prompt.slice()
  prompt[systemIndex] = {
    ...system,
    content: `${system.content}\n\n${CONDITIONAL_DEFAULT_CONTRIBUTION}`,
  }
  return { ...params, prompt }
}

export function withConditionalDefault(model: LanguageModelV3) {
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v3",
      transformParams: async ({ params }) => injectConditionalDefault(params),
    },
  })
}

