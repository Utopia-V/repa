import { describe, expect, test } from "bun:test"
import {
  checkSteeringResponse,
  chooseLearnerSteering,
  collectAssistantText,
  extractObjectIntroduction,
  shouldRecordCompletedExplanation,
} from "./learning-native-b2-first-trace"

describe("learning-native B2 first trace helpers", () => {
  test("material retrieval returns the bounded introduction and literals section", () => {
    const article = `# Objects

Orientation text.

## Literals and properties

The first useful section.

## Square brackets

Later detail that should stay lazy.
`

    expect(extractObjectIntroduction(article)).toBe(`# Objects

Orientation text.

## Literals and properties

The first useful section.`)
  })

  test("keeps assistant prose from every model step around a material tool call", () => {
    expect(
      collectAssistantText([
        { text: "先说它在课程路线中的位置。" },
        { text: "" },
        { text: "对象的第一个用途，是把相关数据放在同一个值里。" },
      ]),
    ).toBe(
      "先说它在课程路线中的位置。\n\n对象的第一个用途，是把相关数据放在同一个值里。",
    )
  })

  test("responsive learner steering depends only on visible tutor behavior", () => {
    expect(chooseLearnerSteering("现在考你一道题：请回答。\n```js\nlet user = {}\n```"))
      .toMatchObject({ reason: "forced-quiz" })
    expect(chooseLearnerSteering("对象用来存放键值对。"))
      .toMatchObject({ reason: "missing-example" })
    expect(chooseLearnerSteering(`\`\`\`js\nlet user = {}\n\`\`\`\n${"细节".repeat(1_000)}`))
      .toMatchObject({ reason: "too-broad" })
    expect(chooseLearnerSteering("```js\nlet user = { name: 'Ada' }\n```\n读取 user.name。"))
      .toMatchObject({ reason: "focus-request" })
  })

  test("steering check asks only whether the tutor adapted to the visible request", () => {
    const firstText = `\`\`\`js\nlet user = {}\n\`\`\`\n${"细节".repeat(1_000)}`
    const steering = chooseLearnerSteering(firstText)
    expect(
      checkSteeringResponse({
        firstText,
        secondText: "```js\nconst user = { name: 'Ada' };\nconsole.log(user.name);\n```\n花括号创建对象，点号读取属性。",
        steering,
      }),
    ).toEqual([])
    expect(
      checkSteeringResponse({
        firstText,
        secondText: `${firstText}\n要不要做一道题？`,
        steering,
      }),
    ).toEqual([
      "Steered explanation ended by asking another question",
      "Steered explanation was not narrower than the original broad response",
    ])
    expect(
      checkSteeringResponse({
        firstText,
        secondText:
          "```js\nconst student = { name: 'Ada' };\nstudent.age = 20;\ndelete student.age;\n```",
        steering,
      }),
    ).toEqual(["Steered explanation added adjacent operations outside the learner's scope"])
    expect(
      checkSteeringResponse({
        firstText,
        secondText:
          "```js\nconst student = { name: 'Ada' };\nstudent.age = 20;\nstudent.grade = '大三'; // 新增属性\n```",
        steering,
      }),
    ).toEqual([])
  })

  test("an explained fact is recorded only after material-backed prose completes normally", () => {
    expect(
      shouldRecordCompletedExplanation({
        text: "对象用于保存键值数据。",
        finishReasons: ["tool-calls", "stop"],
        materialReadCount: 1,
      }),
    ).toBe(true)
    expect(
      shouldRecordCompletedExplanation({
        text: "对象用于保存键值数据。",
        finishReasons: ["tool-calls", "length"],
        materialReadCount: 1,
      }),
    ).toBe(false)
    expect(
      shouldRecordCompletedExplanation({
        text: "对象用于保存键值数据。",
        finishReasons: ["stop"],
        materialReadCount: 0,
      }),
    ).toBe(false)
    expect(
      shouldRecordCompletedExplanation({
        text: "  ",
        finishReasons: ["tool-calls", "stop"],
        materialReadCount: 1,
      }),
    ).toBe(false)
  })
})
