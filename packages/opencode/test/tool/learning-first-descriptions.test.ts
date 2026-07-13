import { describe, expect, test } from "bun:test"
import GREP from "@/tool/grep.txt"
import GLOB from "@/tool/glob.txt"
import EDIT from "@/tool/edit.txt"
import WRITE from "@/tool/write.txt"
import TASK from "@/tool/task.txt"
import TODO from "@/tool/todowrite.txt"
import QUESTION from "@/tool/question.txt"
import PLAN_ENTER from "@/tool/plan-enter.txt"
import SHELL from "@/tool/shell/shell.txt"

describe("learning-first generic tool descriptions", () => {
  test("file discovery is scope-aware rather than codebase-first", () => {
    for (const description of [GREP, GLOB]) {
      expect(description).toContain("requested scope")
      expect(description).not.toMatch(/codebase|always better|must use the Task tool/i)
    }
  })

  test("file mutation supports learner artifacts without a documentation ban", () => {
    for (const description of [EDIT, WRITE]) expect(description).not.toMatch(/codebase/i)
    expect(WRITE).toContain("learner's requested output")
    expect(WRITE).not.toMatch(/NEVER proactively create documentation|NEVER write new files/i)
  })

  test("delegation is bounded by a parent question and evidence contract", () => {
    expect(TASK).toContain("parent question")
    expect(TASK).toContain("evidence")
    expect(TASK).not.toMatch(/must specify|Launch multiple agents concurrently whenever possible|generally be trusted/i)
  })

  test("todo is explicitly Session-local execution state rather than learning truth", () => {
    expect(TODO).toContain("Session-local execution checklist")
    expect(TODO).toContain("not an Agenda")
    expect(TODO).not.toMatch(/coding session|When in doubt, use it/i)
  })

  test("questions and planning are reserved for consequential choices", () => {
    expect(QUESTION).toContain("Research factual uncertainty before asking")
    expect(QUESTION).toContain("expensive-to-reverse")
    expect(PLAN_ENTER).toContain("planning policy profile")
    expect(PLAN_ENTER).not.toMatch(/implementation|ALWAYS call/i)
  })

  test("shell is a neutral terminal capability with conditional version-control guidance", () => {
    expect(SHELL).toContain("converters")
    expect(SHELL).toContain("When the requested work uses Git")
    expect(SHELL).not.toContain("# Git and GitHub")
  })
})
