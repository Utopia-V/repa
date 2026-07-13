/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import type { GlobalEvent } from "@opencode-ai/sdk/v2"
import { tmpdir } from "../fixture/fixture"
import { mount, wait } from "../cli/cmd/tui/sync-fixture"

test("retains the event directory for manual permission and question requests before Session cache hydration", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const ctx = await mount(undefined, tmp.path)
  const requestDirectory = "/tmp/learning/cold-child"

  try {
    const permission: GlobalEvent = {
      directory: requestDirectory,
      project: "proj_test",
      payload: {
        id: "evt_permission_cold",
        type: "permission.asked",
        properties: {
          id: "perm_cold",
          sessionID: "ses_cold",
          permission: "read",
          patterns: ["*"],
          metadata: {},
          always: [],
        },
      },
    }
    ctx.emit(permission)
    await wait(() => ctx.sync.data.permission.ses_cold?.length === 1)

    expect(ctx.sync.session.get("ses_cold")).toBeUndefined()
    expect(ctx.sync.request.directory("perm_cold")).toBe(requestDirectory)

    const question: GlobalEvent = {
      directory: requestDirectory,
      project: "proj_test",
      payload: {
        id: "evt_question_cold",
        type: "question.asked",
        properties: {
          id: "que_cold",
          sessionID: "ses_cold",
          questions: [
            {
              header: "Scope",
              question: "Which chapter?",
              options: [{ label: "Chapter 3", description: "Current unit" }],
            },
          ],
        },
      },
    }
    ctx.emit(question)
    await wait(() => ctx.sync.data.question.ses_cold?.length === 1)

    expect(ctx.sync.request.directory("que_cold")).toBe(requestDirectory)
  } finally {
    ctx.app.renderer.destroy()
  }
})
