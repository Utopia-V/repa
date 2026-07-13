export const EXPLICIT_OFFSET_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:[zZ]|([+-])(\d{2}):(\d{2}))$/

export const EXPLICIT_OFFSET_TIMESTAMP_SUFFIX_PATTERN =
  /(?:[zZ]|[+-]\d{2}:\d{2})$/

const EXPLICIT_OFFSET_MINUTE_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?:[zZ]|([+-])(\d{2}):(\d{2}))$/

const EXPLICIT_OFFSET_SECOND_OR_MINUTE_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:[zZ]|([+-])(\d{2}):(\d{2}))$/

export type StrictOffsetTimestampErrorCode =
  | "invalid_format"
  | "invalid_precision"
  | "invalid_civil_time"
  | "invalid_instant"
  | "invalid_time_zone"
  | "offset_time_zone_mismatch"

export class StrictOffsetTimestampError extends Error {
  constructor(
    readonly code: StrictOffsetTimestampErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "StrictOffsetTimestampError"
  }
}

export function parseStrictOffsetTimestamp(
  value: string,
  options: {
    precision?: "second" | "minute" | "second-or-minute"
    timeZone?: string
    allowEndOfDay?: boolean
  } = {},
) {
  const precision = options.precision ?? "second"
  const pattern =
    precision === "minute"
      ? EXPLICIT_OFFSET_MINUTE_TIMESTAMP_PATTERN
      : precision === "second-or-minute"
        ? EXPLICIT_OFFSET_SECOND_OR_MINUTE_TIMESTAMP_PATTERN
        : EXPLICIT_OFFSET_TIMESTAMP_PATTERN
  const match = pattern.exec(value)
  if (!match) {
    if (precision === "minute" && EXPLICIT_OFFSET_TIMESTAMP_PATTERN.test(value)) {
      throw new StrictOffsetTimestampError(
        "invalid_precision",
        "Timestamp must use whole-minute precision without seconds",
      )
    }
    throw new StrictOffsetTimestampError(
      "invalid_format",
      precision === "minute"
        ? "Timestamp must be a whole-minute ISO-8601 timestamp with an explicit UTC offset"
        : "Timestamp must be an ISO-8601 timestamp with an explicit UTC offset",
    )
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = precision === "minute" ? 0 : Number(match[6] ?? 0)
  const fraction = precision === "second-or-minute"
    ? match[7]
    : /\.(\d{1,9})/.exec(value)?.[1]
  const offsetSignIndex = precision === "minute" ? 6 : precision === "second" ? 7 : 8
  const offsetHourIndex = precision === "minute" ? 7 : precision === "second" ? 8 : 9
  const offsetMinuteIndex = precision === "minute" ? 8 : precision === "second" ? 9 : 10
  const offsetHour =
    match[offsetHourIndex] === undefined ? 0 : Number(match[offsetHourIndex])
  const offsetMinute =
    match[offsetMinuteIndex] === undefined ? 0 : Number(match[offsetMinuteIndex])

  const validEndOfDay = options.allowEndOfDay === true &&
    hour === 24 &&
    minute === 0 &&
    second === 0 &&
    (fraction === undefined || /^0+$/.test(fraction))
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    (hour > 23 && !validEndOfDay) ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    throw new StrictOffsetTimestampError(
      "invalid_civil_time",
      "Timestamp contains an invalid civil date or time",
    )
  }

  const timestamp = Date.parse(value)
  if (!Number.isSafeInteger(timestamp)) {
    throw new StrictOffsetTimestampError(
      "invalid_instant",
      "Timestamp does not identify a representable instant",
    )
  }

  if (options.timeZone !== undefined) {
    const suppliedOffsetMinutes =
      (match[offsetSignIndex] === "-" ? -1 : 1) * (offsetHour * 60 + offsetMinute)
    const actualOffsetMinutes = offsetMinutesAt(timestamp, options.timeZone)
    if (suppliedOffsetMinutes !== actualOffsetMinutes) {
      throw new StrictOffsetTimestampError(
        "offset_time_zone_mismatch",
        `Timestamp offset ${formatOffset(suppliedOffsetMinutes)} does not agree with IANA time zone ${options.timeZone}`,
      )
    }
  }

  return timestamp
}

function daysInMonth(year: number, month: number) {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    return leap ? 29 : 28
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function offsetMinutesAt(timestamp: number, timeZone: string) {
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    })
  } catch {
    throw new StrictOffsetTimestampError(
      "invalid_time_zone",
      `Invalid IANA time zone: ${timeZone}`,
    )
  }
  const timeZoneName = formatter
    .formatToParts(new Date(timestamp))
    .find((part) => part.type === "timeZoneName")?.value
  if (timeZoneName === "GMT") return 0
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(timeZoneName ?? "")
  if (!match) {
    throw new StrictOffsetTimestampError(
      "invalid_time_zone",
      `Invalid IANA time zone offset for ${timeZone}`,
    )
  }
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return match[1] === "-" ? -minutes : minutes
}

function formatOffset(offsetMinutes: number) {
  const sign = offsetMinutes < 0 ? "-" : "+"
  const absolute = Math.abs(offsetMinutes)
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0")
  const minutes = String(absolute % 60).padStart(2, "0")
  return `${sign}${hours}:${minutes}`
}
