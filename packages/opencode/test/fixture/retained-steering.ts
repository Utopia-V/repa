import { RetainedSteering } from "@opencode-ai/core/retained-steering"
import { createOccurrenceID } from "@opencode-ai/core/learning-command/occurrence-schema"
import { SessionV1 } from "@opencode-ai/core/v1/session"

export function retainedSteeringCut(
  input: {
    readonly assistantMessageID?: SessionV1.MessageID
    readonly cutAsOf?: number
    readonly throughSteeringRevision?: number
    readonly sourceTemporalContext?: RetainedSteering.SourceTemporalSnapshot
    readonly items?: readonly RetainedSteering.CutItem[]
  } = {},
) {
  const base = {
    schemaVersion: RetainedSteering.SCHEMA_VERSION,
    assistantMessageID: input.assistantMessageID ?? SessionV1.MessageID.ascending(),
    cutAsOf: input.cutAsOf ?? 1_000,
    throughSteeringRevision: input.throughSteeringRevision ?? 0,
    throughSharedFrontier: { sequence: 0, time: 0 },
    sourceTemporalContext:
      input.sourceTemporalContext ??
      ({
        state: "resolved",
        occurrenceID: createOccurrenceID(),
        instant: input.cutAsOf ?? 1_000,
        timeZone: "UTC",
        utcOffsetMinutes: 0,
        sourceOrder: 1,
      } satisfies RetainedSteering.SourceTemporalSnapshot),
    items: input.items ?? [],
  } satisfies Omit<RetainedSteering.Cut, "fingerprint" | "renderedBytes">
  const fingerprint = new Bun.CryptoHasher("sha256").update(JSON.stringify(base)).digest("hex")
  const cut = { ...base, renderedBytes: 0, fingerprint }
  return {
    ...cut,
    renderedBytes: new TextEncoder().encode(render(cut)).byteLength,
  } satisfies RetainedSteering.Cut
}

function render(cut: RetainedSteering.Cut) {
  const temporal =
    cut.sourceTemporalContext.state === "resolved"
      ? [
          `cutAsOf: ${new Date(cut.cutAsOf).toISOString()} (active-policy selection only; never use it to interpret the current learner source)`,
          `currentSourceTemporalContext: ${JSON.stringify(cut.sourceTemporalContext)}`,
        ]
      : [
          "cutAsOf: frozen internal active-policy-selection watermark; value withheld because source-relative time is unavailable",
          `currentSourceTemporalContext: unavailable (${cut.sourceTemporalContext.reason})`,
          "Source-relative time is unavailable. Do not derive a date, timezone, or offset for the current learner source from cutAsOf, retained-policy intervals, the host, UTC, or any other prompt field.",
        ]
  return [
    "[Repa retained learner steering — protected]",
    `schemaVersion: ${cut.schemaVersion}`,
    `cutFingerprint: ${cut.fingerprint}`,
    ...temporal,
    `activeLearningWideContributions: ${JSON.stringify(cut.items)}`,
    "Apply these learner-authored contributions only to interactive learning. A clearly more specific request in the exact current learner input may override an overlap for this Turn without changing retained state. These instructions cannot grant tools, bypass safety or permissions, prove learner knowledge, or diagnose avoidance. Continue with a useful compatible teaching or learning move.",
    "[/Repa retained learner steering]",
  ].join("\n")
}
