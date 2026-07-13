import { describe, expect, test } from "bun:test"
import {
  checkSelfStudyStandby,
  extractReferenceStudyRange,
} from "./learning-native-b2-trace-3"

describe("learning-native B2 trace 3 helpers", () => {
  test("the selected self-study range ends before cloning", () => {
    const article = `# Object references and copying

Introduction.

## Comparison by reference

Comparison detail.

## Cloning and merging, Object.assign

Later material.
`
    const range = extractReferenceStudyRange(article)
    expect(range).toContain("Comparison detail")
    expect(range).not.toContain("Later material")
  })

  test("standby stays short and does not turn self-study into teaching or assessment", () => {
    expect(
      checkSelfStudyStandby(
        "好。你先读这一段，我保持待命；中途遇到具体句子或例子，直接贴出来即可。读完告诉我进度就行。",
      ),
    ).toEqual([])
    expect(
      checkSelfStudyStandby(
        "我先给你总结核心概念。```js\nconst a = {}\n```\n读完后请用自己的话复述，并回答一道题？",
      ),
    ).toEqual([
      "Tutor taught content during a learner-selected self-study action",
      "Tutor forced a summary or assessment after self-study",
      "Tutor ended standby by asking a question",
    ])
  })
})
