import { describe, expect, test } from "bun:test"
import {
  EXPLICIT_OFFSET_TIMESTAMP_PATTERN,
  EXPLICIT_OFFSET_TIMESTAMP_SUFFIX_PATTERN,
  parseStrictOffsetTimestamp,
} from "../src/time/strict-offset-timestamp"

describe("strict explicit-offset timestamps", () => {
  test("parses valid second-precision instants and rejects impossible civil dates", () => {
    expect(parseStrictOffsetTimestamp("2024-02-29T12:34:56+08:00")).toBe(
      Date.parse("2024-02-29T04:34:56Z"),
    )
    expect(parseStrictOffsetTimestamp("1970-01-01T00:00:00.050Z")).toBe(50)

    expect(() => parseStrictOffsetTimestamp("2026-02-29T12:34:56+08:00")).toThrow(
      "invalid civil date or time",
    )
    expect(() => parseStrictOffsetTimestamp("2026-04-31T12:34:56+08:00")).toThrow(
      "invalid civil date or time",
    )
  })

  test("timed steering keeps strict minute-or-second ISO input and ISO end-of-day", () => {
    expect(
      parseStrictOffsetTimestamp("2026-07-14T20:00+08:00", {
        precision: "second-or-minute",
      }),
    ).toBe(Date.parse("2026-07-14T12:00:00Z"))
    expect(
      parseStrictOffsetTimestamp("2026-07-14T20:00:30.250+08:00", {
        precision: "second-or-minute",
      }),
    ).toBe(Date.parse("2026-07-14T12:00:30.250Z"))
    expect(
      parseStrictOffsetTimestamp("2026-07-14T24:00:00+08:00", {
        allowEndOfDay: true,
        precision: "second-or-minute",
      }),
    ).toBe(Date.parse("2026-07-14T16:00:00Z"))
    expect(() =>
      parseStrictOffsetTimestamp("2026-07-14T24:00:01+08:00", {
        allowEndOfDay: true,
        precision: "second-or-minute",
      }),
    ).toThrow("invalid civil date or time")
  })

  test("normalizes equivalent offset spellings to the same instant", () => {
    const shanghai = parseStrictOffsetTimestamp("2026-07-14T20:00+08:00", {
      precision: "second-or-minute",
    })
    const utc = parseStrictOffsetTimestamp("2026-07-14T12:00Z", {
      precision: "second-or-minute",
    })
    const western = parseStrictOffsetTimestamp("2026-07-14T07:00-05:00", {
      precision: "second-or-minute",
    })

    expect(shanghai).toBe(utc)
    expect(western).toBe(utc)
  })

  test("keeps the v2/v3 provider-visible timestamp regexes byte-equivalent", () => {
    expect(EXPLICIT_OFFSET_TIMESTAMP_PATTERN.source).toBe(
      "^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})(?:\\.\\d{1,9})?(?:[zZ]|([+-])(\\d{2}):(\\d{2}))$",
    )
    expect(EXPLICIT_OFFSET_TIMESTAMP_SUFFIX_PATTERN.source).toBe(
      "(?:[zZ]|[+-]\\d{2}:\\d{2})$",
    )
  })
})
