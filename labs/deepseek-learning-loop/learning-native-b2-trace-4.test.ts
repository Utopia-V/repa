import { describe, expect, test } from "bun:test"
import { checkAliasingFeedback } from "./learning-native-b2-trace-4"

describe("learning-native B2 trace 4 helpers", () => {
  test("feedback repairs the observed reference-copy misconception without a new quiz", () => {
    expect(
      checkAliasingFeedback(
        "输出是 2。b = a 复制的是同一个对象的引用，所以 b.value = 2 也会让 a.value 读到 2。",
      ),
    ).toEqual([])
    expect(checkAliasingFeedback("你粗心了。再做一道题？")).toEqual([
      "Feedback did not give the correct observed result",
      "Feedback did not identify the shared-reference misconception",
      "Feedback ended by asking another question",
    ])
  })
})
