import { expect, test } from "bun:test"
import { Schema } from "effect"
import { PermissionV1 } from "../src/v1/permission"

test("permission v1 carries explicit cancellation without inventing an abort reply", () => {
  const decode = Schema.decodeUnknownSync(PermissionV1.ReplyBody)

  expect(decode({ reply: "cancel" })).toEqual({ reply: "cancel" })
  expect(() => decode({ reply: "abort" })).toThrow()
})
