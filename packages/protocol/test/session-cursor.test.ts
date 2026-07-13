import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { LocationQuery } from "../src/groups/location"
import { SessionCreatePayload, SessionHistoryQuery, SessionsCursor, SessionsQuery } from "../src/groups/session"
import { Session } from "@opencode-ai/schema/session"

describe("SessionsCursor", () => {
  test("round trips without Node globals", async () => {
    const input = {
      search: "protocol",
      order: "desc" as const,
      anchor: { id: Session.ID.make("ses_test"), time: 1, direction: "next" as const },
    }
    const cursor = SessionsCursor.make(input)

    expect(await Effect.runPromise(SessionsCursor.parse(cursor))).toEqual(input)
  })
})

describe("directory-only selectors", () => {
  test("drops the retired workspace selector from public location queries", async () => {
    const location = await Effect.runPromise(
      Schema.decodeUnknownEffect(LocationQuery)({
        location: { directory: "/tmp/course", workspace: "wrk_retired" },
      }),
    )

    expect(location).toEqual({ location: { directory: "/tmp/course" } })
  })

  test("drops the retired workspace selector from public session queries", async () => {
    const sessions = await Effect.runPromise(
      Schema.decodeUnknownEffect(SessionsQuery)({
        directory: "/tmp/course",
        workspace: "wrk_retired",
        search: "protocol",
      }),
    )

    expect(String(sessions.directory)).toBe("/tmp/course")
    expect(sessions.search).toBe("protocol")
    expect("workspace" in sessions).toBe(false)
  })

  test("drops retired workspace placement from session creation", async () => {
    const payload = await Effect.runPromise(
      Schema.decodeUnknownEffect(SessionCreatePayload)({
        location: { directory: "/tmp/course", workspaceID: "wrk_retired" },
      }),
    )

    expect(String(payload.location?.directory)).toBe("/tmp/course")
    expect(payload.location && "workspaceID" in payload.location).toBe(false)
  })
})

describe("SessionHistoryQuery", () => {
  test("decodes numeric paging inputs", async () => {
    const query = await Effect.runPromise(Schema.decodeUnknownEffect(SessionHistoryQuery)({ after: "3", limit: "10" }))

    expect(query).toEqual({ after: 3, limit: 10 })
  })
})
