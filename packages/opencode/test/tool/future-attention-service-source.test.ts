import { describe, expect, test } from "bun:test"
import { FutureAttentionServiceSource } from "@/tool/future-attention-service-source"

describe("FutureAttention service-source catalog", () => {
  test("admits only closed learner-usable tools and defaults every control or extension tool to internal", () => {
    expect(
      ["bash", "course_query", "learner_goal_query", "learning_material_read", "read", "websearch"].map((id) =>
        FutureAttentionServiceSource.classify(id),
      ),
    ).toEqual(Array.from({ length: 6 }, () => "learner_usable"))
    expect(
      [
        "update_future_attention",
        "future_attention_read",
        "task",
        "question",
        "interrupt",
        "custom_extension_tool",
        "mcp_connected_tool",
      ].map((id) => FutureAttentionServiceSource.classify(id)),
    ).toEqual(Array.from({ length: 7 }, () => "internal_control"))
  })
})
