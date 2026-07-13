import { describe, expect, test } from "bun:test"
import {
  checkDemonstration,
  checkPrincipleExplanation,
  extractObjectMethodRange,
  hasVisibleMethodDemonstration,
} from "./learning-native-b2-trace-2"

describe("learning-native B2 trace 2 helpers", () => {
  const article = `# Object methods, "this"

## Method examples

Add a function property and call it.

### Method shorthand

Short form.

## "this" in methods

The value of this is the object before the dot.

## "this" is not bound

Later principle detail.
`

  test("loads operation and principle ranges separately", () => {
    expect(extractObjectMethodRange(article, "method-examples")).toContain("Method shorthand")
    expect(extractObjectMethodRange(article, "method-examples")).not.toContain(
      '## "this" in methods',
    )
    expect(extractObjectMethodRange(article, "this-in-methods")).toContain(
      "The value of this is the object before the dot.",
    )
    expect(extractObjectMethodRange(article, "this-in-methods")).not.toContain(
      '## "this" is not bound',
    )
  })

  test("learner follows only an actually visible method demonstration", () => {
    expect(
      checkDemonstration(`
\`\`\`js
student.sayHi = function () { console.log("你好") };
student.sayHi();
\`\`\`
`),
    ).toEqual([])
    expect(checkDemonstration("对象方法就是对象中的函数。")).toEqual([
      "Tutor did not show both a method definition and its call",
    ])
    expect(
      checkDemonstration(`
\`\`\`js
student.sayHi = function () { console.log(this.name) };
student.sayHi();
\`\`\`
this 指向点号前的对象。
`),
    ).toEqual(["Tutor explained the postponed this principle during the operation step"])
    expect(
      hasVisibleMethodDemonstration(`
\`\`\`js
student.sayHi = function () { console.log(this.name) };
student.sayHi();
\`\`\`
this 指向点号前的对象。
`),
    ).toBe(true)
    expect(hasVisibleMethodDemonstration("对象方法就是对象中的函数。")).toBe(false)
    expect(hasVisibleMethodDemonstration("```js\nstudent.sayHi();\n```")).toBe(false)
  })

  test("later explanation connects this to the calling object without a quiz", () => {
    expect(
      checkPrincipleExplanation(
        "调用 student.sayHi() 时，点号前的 student 是当前对象，所以 this.name 读取 student.name。",
      ),
    ).toEqual([])
    expect(checkPrincipleExplanation("this 是一个特殊关键字。你来回答它是什么？")).toEqual([
      "Principle explanation did not connect this.name to the calling object",
      "Principle explanation ended by asking a question",
    ])
    expect(
      checkPrincipleExplanation(
        "调用 student.sayHi() 时，this.name 读取当前对象 student.name。没有别的额外规则。",
      ),
    ).toEqual(["Principle explanation turned a bounded receiver rule into a universal claim"])
  })
})
