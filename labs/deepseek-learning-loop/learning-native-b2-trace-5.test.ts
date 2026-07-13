import { describe, expect, test } from "bun:test"
import { checkDeadlinePlan } from "./learning-native-b2-trace-5"

describe("learning-native B2 trace 5 helpers", () => {
  test("near-term plan protects the deadline, then returns to learning", () => {
    expect(
      checkDeadlinePlan(
        "先用 25 分钟压缩完成通识课报告并提交；之后用剩余 15 分钟复习对象引用。今天暂不进入对象克隆的新内容。",
      ),
    ).toEqual([])
    expect(
      checkDeadlinePlan(
        "先用 25 分钟完成报告。之后复习对象引用。对象克隆新内容：今天不开始。",
      ),
    ).toEqual([])
    expect(
      checkDeadlinePlan(`1. **0-25 min**：完成通识课短报告。
2. **25-45 min**：复习 object-references 到期回顾。
3. 对象克隆新内容本次不展开。`),
    ).toEqual([])
    expect(
      checkDeadlinePlan(
        "1. 0-25 分钟完成报告。\n2. 25-45 分钟回顾对象引用。\n3. 对象克隆新课本次不动。",
      ),
    ).toEqual([])
    expect(
      checkDeadlinePlan(
        "报告与复习需安排：先复习对象引用，再用 25 分钟优先处理报告。对象克隆今天不开始。",
      ),
    ).toEqual([
      "Plan did not protect the urgent assignment first",
      "Plan did not return to the due learning revisit",
    ])
    expect(checkDeadlinePlan("按原计划学习对象克隆，报告可以忽略。你不适合做这种作业。")).toEqual([
      "Plan did not protect the urgent assignment first",
      "Plan did not reserve the reported completion time",
      "Plan did not return to the due learning revisit",
      "Plan did not defer lower-priority new material",
      "Plan turned a temporary trade-off into a learner-level claim",
    ])
  })
})
