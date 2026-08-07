import { describe, expect, test } from "bun:test"
import { resolveLocalInstant, validateSourceExpression, type ResolvedZone } from "../src/civil-time"

function validate(sourceExpression: string, localDateTime: string, offsetMinutes: number) {
  const zone = { type: "fixed_offset", offsetMinutes } satisfies ResolvedZone
  validateSourceExpression(
    sourceExpression,
    localDateTime,
    zone,
    resolveLocalInstant(localDateTime, zone, "test instant"),
    "test instant",
  )
}

describe("civil-time source expressions", () => {
  test.each([
    ["2036-02-29t10:00:00.123000z", "2036-02-29T10:00:00.123", 0],
    ["2036-08-07T10:00:00+00:00", "2036-08-07T10:00:00", 0],
    ["2036-08-07T10:00:00+14:00", "2036-08-07T10:00:00", 840],
    ["2036-08-07T10:00:00+00:00 from the source", "2036-08-07T10:00:00", 0],
    ["at 2036-08-07T10:00:00+00:00", "2036-08-07T10:00:00", 0],
  ] as const)("accepts exact representable or descriptive expression %s", (source, local, offset) => {
    expect(() => validate(source, local, offset)).not.toThrow()
  })

  test.each([
    ["2036-08-07T10:00:00.123001+00:00", "2036-08-07T10:00:00.123", 0],
    ["2036-08-07T10:00:00-00:00", "2036-08-07T10:00:00", 0],
    ["2035-02-29T10:00:00+00:00", "2035-02-28T10:00:00", 0],
    ["2036-08-07T24:00:00+00:00", "2036-08-07T10:00:00", 0],
    ["2036-08-07T10:00:00+14:01", "2036-08-07T10:00:00", 840],
    ["2036-08-07T10:00:00.Z", "2036-08-07T10:00:00", 0],
    ["2036-08-07T10:00:00+5:30", "2036-08-07T10:00:00", 330],
    ["2036-08-07", "2036-08-07T10:00:00", 0],
  ] as const)("rejects contradictory or malformed exact expression %s", (source, local, offset) => {
    expect(() => validate(source, local, offset)).toThrow(RangeError)
  })
})
