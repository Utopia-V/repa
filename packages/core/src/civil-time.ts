import { TzDatabase } from "timezonecomplete"
import timeZoneData from "tzdata"

export const TIME_ZONE_RELEASE_ID = "iana-tzdb-2026c"
export const TZDB_VERSION = "2026c"
export const ENGINE = "timezonecomplete@5.15.1+tzdata@1.0.50"
export const DATA_SHA256 = "a4220c6c6efab292e7aac7dbe8d771cfc619e99b9235ed3e54d17445c232f995"

export type ResolvedZone =
  | Readonly<{ type: "iana"; name: string; releaseID: string }>
  | Readonly<{ type: "fixed_offset"; offsetMinutes: number }>

export type ZoneIntent =
  | Readonly<{ type: "source" }>
  | Readonly<{ type: "iana"; name: string }>
  | Readonly<{ type: "fixed_offset"; offsetMinutes: number }>

export type SourceZone =
  | Readonly<{ state: "resolved"; timeZone: string; utcOffsetMinutes: number }>
  | Readonly<{ state: "unavailable"; reason: "timezone_unavailable" }>

const dataFingerprint = new Bun.CryptoHasher("sha256").update(JSON.stringify(timeZoneData)).digest("hex")

if (timeZoneData.version !== TZDB_VERSION || dataFingerprint !== DATA_SHA256) {
  throw new Error(`Expected ${ENGINE} data ${TZDB_VERSION}, received ${timeZoneData.version ?? "none"}`)
}

TzDatabase.init(timeZoneData)
const database = TzDatabase.instance()
const names = Object.freeze(database.zoneNames())
const zones = new Set(names)

if (names.length !== 598 || !zones.has("Asia/Kolkata") || !zones.has("America/Coyhaique")) {
  throw new Error(`The ${TIME_ZONE_RELEASE_ID} time-zone catalog is incomplete`)
}

export function supportedNames() {
  return names
}

export function isSupportedTimeZone(value: string) {
  return zones.has(value)
}

export function resolveZone(intent: ZoneIntent, source: SourceZone, owner: string): ResolvedZone {
  if (intent.type === "fixed_offset") {
    if (!Number.isInteger(intent.offsetMinutes) || intent.offsetMinutes < -840 || intent.offsetMinutes > 840) {
      throw new RangeError(`Invalid ${owner} fixed offset`)
    }
    return intent
  }
  const name = intent.type === "iana" ? intent.name : source.state === "resolved" ? source.timeZone : undefined
  if (!name || !zones.has(name)) throw new RangeError(`${owner} source time zone is unavailable`)
  return { type: "iana", name, releaseID: TIME_ZONE_RELEASE_ID }
}

export function resolveLocalInstant(localDateTime: string, zone: ResolvedZone, owner: string) {
  const local = localEpoch(localDateTime, owner)
  if (zone.type === "fixed_offset") {
    const instant = local - zone.offsetMinutes * 60_000
    if (instant < 0) throw new RangeError(`${owner} instant target predates the supported epoch`)
    return { instant, utcOffsetMinutes: zone.offsetMinutes }
  }
  if (zone.releaseID !== TIME_ZONE_RELEASE_ID) {
    throw new RangeError(`Unsupported ${owner} time-zone release: ${zone.releaseID}`)
  }
  const year = new Date(local).getUTCFullYear()
  const offsets = new Set(
    database.getTransitionsTotalOffsets(zone.name, year - 1, year + 1).map((transition) => transition.offset.minutes()),
  )
  const candidates = Array.from(offsets).flatMap((offsetMinutes) => {
    const instant = local - offsetMinutes * 60_000
    const actual = database.totalOffset(zone.name, instant).minutes()
    return Number.isInteger(actual) && actual === offsetMinutes && instant + actual * 60_000 === local
      ? [{ instant, utcOffsetMinutes: offsetMinutes }]
      : []
  })
  if (candidates.length !== 1) throw new RangeError(`${owner} local time is ambiguous or does not exist`)
  if (candidates[0]!.instant < 0) throw new RangeError(`${owner} instant target predates the supported epoch`)
  return candidates[0]!
}

export function validateSourceExpression(
  sourceExpression: string,
  localDateTime: string,
  zone: ResolvedZone,
  resolved: Readonly<{ instant: number; utcOffsetMinutes: number }>,
  owner: string,
) {
  const exactLocal = String.raw`\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?`
  const offsetExpression = new RegExp(`^(${exactLocal})([Zz]|[+-]\\d{2}:\\d{2})(?:\\[([^\\]]+)\\])?$`).exec(
    sourceExpression,
  )
  if (offsetExpression) {
    const offsetMinutes = parseOffset(offsetExpression[2]!, owner)
    const namedZone = offsetExpression[3]
    const expressionInstant = resolveLocalInstant(
      sourceLocalDateTime(offsetExpression[1]!, owner),
      { type: "fixed_offset", offsetMinutes },
      owner,
    )
    if (
      sourceLocalEpoch(offsetExpression[1]!, owner) !== localEpoch(localDateTime, owner) ||
      expressionInstant.instant !== resolved.instant ||
      offsetMinutes !== resolved.utcOffsetMinutes
    ) {
      throw new RangeError(`${owner} source expression contradicts the normalized instant`)
    }
    if (namedZone) {
      if (zone.type !== "iana" || namedZone !== zone.name) {
        throw new RangeError(`${owner} source expression names a different time zone`)
      }
      return
    }
    if (zone.type !== "fixed_offset" || zone.offsetMinutes !== offsetMinutes) {
      throw new RangeError(`${owner} offset expression requires a fixed-offset basis`)
    }
    return
  }

  const namedLocal = new RegExp(`^(${exactLocal})\\[([^\\]]+)\\]$`).exec(sourceExpression)
  if (namedLocal) {
    if (
      zone.type !== "iana" ||
      namedLocal[2] !== zone.name ||
      sourceLocalEpoch(namedLocal[1]!, owner) !== localEpoch(localDateTime, owner)
    ) {
      throw new RangeError(`${owner} source expression contradicts the named civil time`)
    }
    return
  }

  const localOnly = new RegExp(`^(${exactLocal})$`).exec(sourceExpression)
  if (localOnly) {
    if (sourceLocalEpoch(localOnly[1]!, owner) !== localEpoch(localDateTime, owner)) {
      throw new RangeError(`${owner} source expression contradicts the normalized civil time`)
    }
    return
  }

  if (!/\s/.test(sourceExpression) && /^\d{4}-\d{2}-\d{2}(?:[Tt]|$)/.test(sourceExpression)) {
    throw new RangeError(`Invalid exact ${owner} source expression`)
  }
}

export function localDateAt(instant: number, timeZone: string) {
  if (!zones.has(timeZone)) throw new RangeError(`Unsupported ${TIME_ZONE_RELEASE_ID} time zone: ${timeZone}`)
  return new Date(instant + database.totalOffset(timeZone, instant).milliseconds()).toISOString().slice(0, 10)
}

export function localDateAtResolvedZone(instant: number, zone: ResolvedZone, owner: string) {
  if (zone.type === "fixed_offset") return new Date(instant + zone.offsetMinutes * 60_000).toISOString().slice(0, 10)
  if (zone.releaseID !== TIME_ZONE_RELEASE_ID) {
    throw new RangeError(`Unsupported ${owner} time-zone release: ${zone.releaseID}`)
  }
  return localDateAt(instant, zone.name)
}

export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
}

function localEpoch(value: string, owner: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(value)
  if (!match) throw new RangeError(`Invalid ${owner} local date-time`)
  const parts = match.slice(1, 7).map(Number)
  const millisecond = Number((match[7] ?? "0").padEnd(3, "0"))
  return epoch(parts, millisecond, owner)
}

function sourceLocalDateTime(value: string, owner: string) {
  const match = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}:\d{2}:\d{2})(?:\.(\d+))?$/.exec(value)
  if (!match) throw new RangeError(`Invalid exact ${owner} source expression`)
  const fraction = match[3] ?? ""
  if (fraction.length > 3 && /[1-9]/.test(fraction.slice(3))) {
    throw new RangeError(`${owner} source-expression precision is not representable`)
  }
  return `${match[1]}T${match[2]}${fraction ? `.${fraction.slice(0, 3)}` : ""}`
}

function sourceLocalEpoch(value: string, owner: string) {
  return localEpoch(sourceLocalDateTime(value, owner), owner)
}

function epoch(parts: number[], millisecond: number, owner: string) {
  const date = new Date(0)
  date.setUTCFullYear(parts[0]!, parts[1]! - 1, parts[2]!)
  date.setUTCHours(parts[3]!, parts[4]!, parts[5]!, millisecond)
  if (
    date.getUTCFullYear() !== parts[0] ||
    date.getUTCMonth() !== parts[1]! - 1 ||
    date.getUTCDate() !== parts[2] ||
    date.getUTCHours() !== parts[3] ||
    date.getUTCMinutes() !== parts[4] ||
    date.getUTCSeconds() !== parts[5] ||
    date.getUTCMilliseconds() !== millisecond
  ) {
    throw new RangeError(`Invalid ${owner} local date-time`)
  }
  return date.getTime()
}

function parseOffset(value: string, owner: string) {
  if (value === "Z" || value === "z") return 0
  if (value === "-00:00") throw new RangeError(`${owner} source-expression offset is unknown`)
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(value)
  const minutes = match ? Number(match[2]) * 60 + Number(match[3]) : NaN
  if (!match || !Number.isInteger(minutes) || minutes > 840 || Number(match[3]) > 59) {
    throw new RangeError(`Invalid ${owner} source-expression offset`)
  }
  return match[1] === "-" ? -minutes : minutes
}
