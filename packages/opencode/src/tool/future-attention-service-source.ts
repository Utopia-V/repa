export * as FutureAttentionServiceSource from "./future-attention-service-source"

export type Use = "learner_usable" | "internal_control"

const learnerUsable = new Set([
  "bash",
  "content_inventory",
  "content_read",
  "content_roots",
  "content_search",
  "course_query",
  "glob",
  "grep",
  "learner_goal_query",
  "learner_response_evidence_read",
  "learning_interaction_read",
  "learning_material_query",
  "learning_material_read",
  "learning_navigation_query",
  "lsp",
  "read",
  "webfetch",
  "websearch",
])

export function classify(toolID: string): Use {
  return learnerUsable.has(toolID) ? "learner_usable" : "internal_control"
}
