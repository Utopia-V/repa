import { expect, test } from "bun:test"
import type { OpencodeClient } from "@opencode-ai/sdk/v2"
import { prepareForkDraft } from "../../src/util/fork-draft"

test("prepares a process-local fork draft from the exact durable source basis", async () => {
  const calls: Array<{ sessionID: string }> = []
  const client = {
    session: {
      forkBasis: async (input: { sessionID: string }) => {
        calls.push(input)
        return {
          data: {
            sourceSessionID: "ses_source",
            sourceEventSequence: 42,
          },
        }
      },
    },
  } as unknown as OpencodeClient

  const draft = await prepareForkDraft(client, "ses_source", "msg_cutoff")

  expect(calls).toEqual([{ sessionID: "ses_source" }])
  expect(draft).toMatchObject({
    sourceSessionID: "ses_source",
    sourceEventSequence: 42,
    cutoffMessageID: "msg_cutoff",
  })
  expect(draft.targetSessionID).toStartWith("ses_")
  expect(draft.targetSessionID).not.toBe(draft.sourceSessionID)
})
