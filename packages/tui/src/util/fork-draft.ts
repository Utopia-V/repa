import { Identifier } from "@opencode-ai/core/id/id"
import type { OpencodeClient } from "@opencode-ai/sdk/v2"

export type ForkDraft = {
  targetSessionID: string
  sourceSessionID: string
  sourceEventSequence: number
  cutoffMessageID?: string
}

export async function prepareForkDraft(client: OpencodeClient, sourceSessionID: string, cutoffMessageID?: string) {
  const basis = await client.session.forkBasis({ sessionID: sourceSessionID }, { throwOnError: true })
  return {
    targetSessionID: Identifier.ascending("session"),
    ...basis.data,
    ...(cutoffMessageID ? { cutoffMessageID } : {}),
  } satisfies ForkDraft
}
