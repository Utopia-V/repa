import { describe, expect, test } from "bun:test"
import {
  OBJECT_REFERENCE_RECALL_EXERCISE,
  checkContinuation,
  renderRecallExercise,
} from "./learning-native-b2-trace-6"

describe("learning-native B2 trace 6 helpers", () => {
  test("continue surfaces the due local revisit without asking the learner to resynchronize", () => {
    expect(
      checkContinuation(
        `先回顾对象引用。请先预测：\n${renderRecallExercise(OBJECT_REFERENCE_RECALL_EXERCISE)}`,
      ),
    ).toEqual([])
    expect(
      checkContinuation(
        "现在有一个到期的复习任务。上次你做了一道关于对象赋值的题目，当时你认为 b = a 后修改 b.value，a.value 不会受影响，因为你把 b 当成了一个新对象。让我们重温这个关键概念。请先思考：修改 b.score 后，a.score 输出什么？",
      ),
    ).toEqual([])
    expect(
      checkContinuation(
        `这是到期复习。${"先说明本次来源。".repeat(8)}对象赋值里 b = a 后修改 b.score，a.score 输出什么？`,
      ),
    ).toEqual([])
    expect(
      checkContinuation(
        "现在复习对象引用：let a={score:10}; let b=a; b.score=20; a.score 会变成 20。请判断原因？",
      ),
    ).toEqual(["Tutor revealed the revisit answer before learner recall"])
    expect(
      checkContinuation(
        "现在复习对象引用：对象赋值共享引用，所以修改 b.score 也会修改 a.score。请复述原因？",
      ),
    ).toEqual(["Tutor revealed the revisit answer before learner recall"])
    expect(
      checkContinuation(
        "现在复习对象引用：b = a means both variables point to the same object, so changing b.score also changes a.score. 请回答为什么？",
      ),
    ).toEqual(["Tutor revealed the revisit answer before learner recall"])
    expect(checkContinuation("你想继续哪门课？我们也可以开始对象克隆新内容。答案是 2。")).toEqual([
      "Tutor asked the learner to restate context already available locally",
      "Tutor skipped the due revisit for new material",
      "Tutor did not begin a targeted object-reference revisit",
    ])
  })
})
