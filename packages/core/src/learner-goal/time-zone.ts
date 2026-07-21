import { TzDatabase } from "timezonecomplete"
import timeZoneData from "tzdata"

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
