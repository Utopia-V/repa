import { TzDatabase } from "timezonecomplete"
import timeZoneData from "tzdata"
import type { ResolvedZoneV2, TargetIntentV2, TargetValueV2, TimeZoneIntentV2 } from "./schema"

export const TIME_ZONE_RELEASE_ID = "iana-tzdb-2026c"
export const TZDB_VERSION = "2026c"
export const ENGINE = "timezonecomplete@5.15.1+tzdata@1.0.50"
export const DATA_SHA256 = "a4220c6c6efab292e7aac7dbe8d771cfc619e99b9235ed3e54d17445c232f995"

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

export function localDateAt(instant: number, timeZone: string) {
  if (!zones.has(timeZone)) throw new RangeError(`Unsupported ${TIME_ZONE_RELEASE_ID} time zone: ${timeZone}`)
  return new Date(instant + database.totalOffset(timeZone, instant).milliseconds()).toISOString().slice(0, 10)
}

export type SourceZoneV2 =
  | Readonly<{ state: "resolved"; timeZone: string; utcOffsetMinutes: number }>
  | Readonly<{ state: "unavailable"; reason: "timezone_unavailable" }>

export function resolveTargetIntentV2(intent: TargetIntentV2, source: SourceZoneV2): TargetValueV2 {
  if (intent.type === "absent") return intent
  const zone = resolveZoneV2(intent.timeZone, source)
  if (intent.type === "local_date") {
    if (!validDate(intent.date)) throw new RangeError("Invalid Goal local-date target")
    return { type: "local_date", date: intent.date, resolvedZone: zone }
  }
  const local = localEpoch(intent.localDateTime)
  if (zone.type === "fixed_offset") {
    const instant = local - zone.offsetMinutes * 60_000
    if (instant < 0) throw new RangeError("Goal instant target predates the supported epoch")
    return {
      type: "instant",
      instant,
      utcOffsetMinutes: zone.offsetMinutes,
      resolvedZone: zone,
    }
  }
  const candidates = Array.from({ length: 1_681 }, (_, index) => index - 840).flatMap((offsetMinutes) => {
    const instant = local - offsetMinutes * 60_000
    const actual = database.totalOffset(zone.name, instant).minutes()
    return Number.isInteger(actual) && actual === offsetMinutes && instant + actual * 60_000 === local
      ? [{ instant, offsetMinutes }]
      : []
  })
  if (candidates.length !== 1) throw new RangeError("Goal local time is ambiguous or does not exist")
  if (candidates[0]!.instant < 0) throw new RangeError("Goal instant target predates the supported epoch")
  return {
    type: "instant",
    instant: candidates[0]!.instant,
    utcOffsetMinutes: candidates[0]!.offsetMinutes,
    resolvedZone: zone,
  }
}

export function localDateAtResolvedZone(instant: number, zone: ResolvedZoneV2) {
  if (zone.type === "fixed_offset") return new Date(instant + zone.offsetMinutes * 60_000).toISOString().slice(0, 10)
  if (zone.releaseID !== TIME_ZONE_RELEASE_ID)
    throw new RangeError(`Unsupported Goal time-zone release: ${zone.releaseID}`)
  return localDateAt(instant, zone.name)
}

function resolveZoneV2(intent: TimeZoneIntentV2, source: SourceZoneV2): ResolvedZoneV2 {
  if (intent.type === "fixed_offset") {
    if (!Number.isInteger(intent.offsetMinutes) || intent.offsetMinutes < -840 || intent.offsetMinutes > 840) {
      throw new RangeError("Invalid Goal fixed offset")
    }
    return intent
  }
  const name = intent.type === "iana" ? intent.name : source.state === "resolved" ? source.timeZone : undefined
  if (!name || !zones.has(name)) throw new RangeError("Goal source time zone is unavailable")
  return { type: "iana", name, releaseID: TIME_ZONE_RELEASE_ID }
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
}

function localEpoch(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(value)
  if (!match) throw new RangeError("Invalid Goal local date-time")
  const parts = match.slice(1, 7).map(Number)
  const millisecond = Number((match[7] ?? "0").padEnd(3, "0"))
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
    throw new RangeError("Invalid Goal local date-time")
  }
  return date.getTime()
}
