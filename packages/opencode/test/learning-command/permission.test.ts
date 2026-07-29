import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Effect, Fiber } from "effect"
import { describe, expect, test } from "bun:test"
import { LearningCommandPermission } from "@/learning-command/permission"
import type { Permission } from "@/permission"
import { SessionID } from "@/session/schema"

const input: PermissionV1.AskInput = {
  sessionID: SessionID.make("ses_test"),
  permission: "accept_course_view_revision",
  patterns: ["course_test"],
  always: ["course_test"],
  metadata: {},
  ruleset: [],
}

function service(ask: Permission.Interface["ask"]): Permission.Interface {
  return {
    ask,
    reply: () => Effect.void,
    list: () => Effect.succeed([]),
  }
}

describe("learning command permission", () => {
  test("preserves every permission decision as a typed outcome", async () => {
    const abort = new AbortController().signal
    const exact = {
      ...input,
      lifecycle: {
        resolution: "request_exact" as const,
        selected: () => Effect.void,
        replied: () => Effect.void,
      },
    }
    expect(
      await Effect.runPromise(
        LearningCommandPermission.ask(
          service(() => Effect.void),
          input,
          abort,
        ),
      ),
    ).toEqual({ type: "allow" })
    expect(
      await Effect.runPromise(
        LearningCommandPermission.ask(
          service(() => Effect.fail(new PermissionV1.DeniedError({ ruleset: [] }))),
          input,
          abort,
        ),
      ),
    ).toEqual({ type: "deny" })
    expect(
      await Effect.runPromise(
        LearningCommandPermission.ask(
          service(() => Effect.fail(new PermissionV1.RejectedError())),
          input,
          abort,
        ),
      ),
    ).toEqual({ type: "cancel" })
    expect(
      await Effect.runPromise(
        LearningCommandPermission.ask(
          service(() => Effect.fail(new PermissionV1.CorrectedError({ feedback: "use the other revision" }))),
          input,
          abort,
        ),
      ),
    ).toEqual({ type: "correct" })
    expect(
      await Effect.runPromise(
        LearningCommandPermission.ask(
          service(() => Effect.fail(new PermissionV1.RejectedError())),
          exact,
          abort,
        ),
      ),
    ).toEqual({ type: "deny" })
    expect(
      await Effect.runPromise(
        LearningCommandPermission.ask(
          service(() => Effect.fail(new PermissionV1.CancelledError())),
          exact,
          abort,
        ),
      ),
    ).toEqual({ type: "cancel" })
  })

  test("abort cancels and finalizes a pending process-local permission waiter", async () => {
    const controller = new AbortController()
    let finalized = false
    const pending = LearningCommandPermission.ask(
      service(() =>
        Effect.never.pipe(
          Effect.ensuring(
            Effect.sync(() => {
              finalized = true
            }),
          ),
        ),
      ),
      input,
      controller.signal,
    )
    const fiber = Effect.runFork(pending)

    await Promise.resolve()
    controller.abort()

    expect(await Effect.runPromise(Fiber.join(fiber))).toEqual({ type: "abort" })
    expect(finalized).toBe(true)
  })

  test("an already-aborted signal never enters permission", async () => {
    const controller = new AbortController()
    controller.abort()
    let asked = false

    const outcome = await Effect.runPromise(
      LearningCommandPermission.ask(
        service(() => {
          asked = true
          return Effect.void
        }),
        input,
        controller.signal,
      ),
    )

    expect(outcome).toEqual({ type: "abort" })
    expect(asked).toBe(false)
  })
})
