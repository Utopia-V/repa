import { describe, expect, test } from "bun:test"
import {
  resolveLocalInstant,
  TIME_ZONE_RELEASE_ID,
  validateSourceExpression,
  type ResolvedZone,
} from "../src/civil-time"

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

  test("disambiguates a named-zone fold only with its exact offset and never invents a gap instant", () => {
    const zone = {
      type: "iana",
      name: "America/New_York",
      releaseID: TIME_ZONE_RELEASE_ID,
    } satisfies ResolvedZone
    const fold = "2036-11-02T01:30:00"
    expect(() => resolveLocalInstant(fold, zone, "test fold")).toThrow(RangeError)
    const daylight = resolveLocalInstant(fold, zone, "test fold", -240)
    const standard = resolveLocalInstant(fold, zone, "test fold", -300)
    expect(standard.instant - daylight.instant).toBe(60 * 60 * 1_000)
    expect(daylight.utcOffsetMinutes).toBe(-240)
    expect(standard.utcOffsetMinutes).toBe(-300)
    expect(() => resolveLocalInstant(fold, zone, "test fold", -360)).toThrow(RangeError)
    expect(() =>
      validateSourceExpression(
        "2036-11-02T01:30:00-04:00[America/New_York]",
        fold,
        zone,
        daylight,
        "test fold",
      ),
    ).not.toThrow()
    expect(() =>
      validateSourceExpression(
        "2036-11-02T01:30:00-05:00[America/New_York]",
        fold,
        zone,
        daylight,
        "test fold",
      ),
    ).toThrow(RangeError)
    expect(() => resolveLocalInstant("2036-03-09T02:30:00", zone, "test gap", -300)).toThrow(RangeError)
  })
})
