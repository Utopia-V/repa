import type { ResolvedZoneV2, TargetIntentV2, TargetValueV2, TimeZoneIntentV2 } from "./schema"
import {
  DATA_SHA256,
  ENGINE,
  TIME_ZONE_RELEASE_ID,
  TZDB_VERSION,
  isSupportedTimeZone as isSupportedCivilTimeZone,
  localDateAt as localDateAtCivilZone,
  localDateAtResolvedZone as localDateAtCivilResolvedZone,
  resolveLocalInstant,
  resolveZone,
  supportedNames as supportedCivilTimeNames,
} from "../civil-time"

export { DATA_SHA256, ENGINE, TIME_ZONE_RELEASE_ID, TZDB_VERSION }

export function supportedNames() {
  return supportedCivilTimeNames()
}

export function isSupportedTimeZone(value: string) {
  return isSupportedCivilTimeZone(value)
}

export function localDateAt(instant: number, timeZone: string) {
  return localDateAtCivilZone(instant, timeZone)
}

export type SourceZoneV2 =
  | Readonly<{ state: "resolved"; timeZone: string; utcOffsetMinutes: number }>
  | Readonly<{ state: "unavailable"; reason: "timezone_unavailable" }>

export function resolveTargetIntentV2(intent: TargetIntentV2, source: SourceZoneV2): TargetValueV2 {
  if (intent.type === "absent") return intent
  const zone = resolveZone(intent.timeZone, source, "Goal") as ResolvedZoneV2
  if (intent.type === "local_date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(intent.date) || new Date(`${intent.date}T00:00:00.000Z`).toISOString().slice(0, 10) !== intent.date) {
      throw new RangeError("Invalid Goal local-date target")
    }
    return { type: "local_date", date: intent.date, resolvedZone: zone }
  }
  const resolved = resolveLocalInstant(intent.localDateTime, zone, "Goal")
  return {
    type: "instant",
    instant: resolved.instant,
    utcOffsetMinutes: resolved.utcOffsetMinutes,
    resolvedZone: zone,
  }
}

export function localDateAtResolvedZone(instant: number, zone: ResolvedZoneV2) {
  return localDateAtCivilResolvedZone(instant, zone, "Goal")
}
