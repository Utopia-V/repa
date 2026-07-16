import { Course } from "@opencode-ai/core/course"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Plugin } from "@/plugin"
import { MessageID, SessionID } from "@/session/schema"
import { observeLearningCommandResult, prepareLearningCommandCall } from "@/session/tools"
import { SessionProcessor } from "@/session/processor"
import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"

const courseID = Schema.decodeUnknownSync(Course.CourseID)("crs_00000000000000000000000000")
const revisionID = Schema.decodeUnknownSync(Course.RevisionID)("cvr_00000000000000000000000000")
const canonical = {
  courseID,
  revisionID,
  expectedCourseVersion: 0,
  expectedSelectionRevisionID: null,
  expectedSelectionVersion: 0,
  expectedViewVersion: 0,
  expectedRevisionVersion: 0,
}
const registration = Object.freeze({
  partID: SessionV1.PartID.ascending("prt_learning_hook"),
  callID: "call-learning-hook",
  emissionOrdinal: 0,
  sessionID: SessionID.make("ses_learning_hook"),
  parentUserMessageID: MessageID.make("msg_learning_hook_user"),
  assistantMessageID: MessageID.make("msg_learning_hook_assistant"),
}) satisfies SessionProcessor.RegisteredToolCall

describe("learning-command hooks", () => {
  test("runs the before observer before admission without allowing it to change canonical input", async () => {
    const order: string[] = []
    let prepared: unknown
    const plugin = mockPlugin(((name: unknown, _input: unknown, output: unknown) =>
      Effect.sync(() => {
        expect(name).toBe("tool.execute.before")
        order.push("before")
        const observed = output as { args: { expectedCourseVersion: number } }
        observed.args.expectedCourseVersion = 99
        return output
      })) as Plugin.Interface["trigger"])

    await Effect.runPromise(
      prepareLearningCommandCall(
        plugin,
        LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
        canonical,
        registration,
        (input) =>
          Effect.sync(() => {
            order.push("prepare")
            prepared = input
          }),
      ),
    )

    expect(order).toEqual(["before", "prepare"])
    expect(prepared).toEqual(canonical)
    expect(canonical.expectedCourseVersion).toBe(0)
  })

  test("isolates a failing after observer from the exact committed result", async () => {
    const output = {
      title: "Course view revision acceptance",
      metadata: { durablySettled: true, outcome: "applied" },
      output: '{"outcome":"applied"}',
    }
    const plugin = mockPlugin(((_name: unknown, _input: unknown, observed: unknown) =>
      Effect.gen(function* () {
        const clone = observed as { title: string; metadata: { outcome: string }; output: string }
        clone.title = "tampered"
        clone.metadata.outcome = "error"
        clone.output = "tampered"
        return yield* Effect.die(new Error("observer failed after durable settlement"))
      })) as Plugin.Interface["trigger"])

    const result = await Effect.runPromise(
      observeLearningCommandResult(
        plugin,
        LearningCommand.ACCEPT_COURSE_VIEW_REVISION_CAPABILITY,
        registration.sessionID,
        registration.callID,
        canonical,
        output,
      ),
    )

    expect(result).toBe(output)
    expect(result).toEqual({
      title: "Course view revision acceptance",
      metadata: { durablySettled: true, outcome: "applied" },
      output: '{"outcome":"applied"}',
    })
  })
})

function mockPlugin(trigger: Plugin.Interface["trigger"]): Plugin.Interface {
  return {
    trigger,
    init: () => Effect.void,
    list: () => Effect.succeed([]),
  }
}
