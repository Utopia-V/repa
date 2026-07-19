import { describe, expect, test } from "bun:test"
import { captureVisibleTurn, dispatchVisibleTurn } from "../../src/util/visible-turn"

describe("visible Turn action target", () => {
  test("steer and interrupt keep the Turn visible when the learner acted", async () => {
    let visibleTurnID = "trn_a"
    const steerTarget = captureVisibleTurn("ses_test", visibleTurnID)
    const interruptTarget = captureVisibleTurn("ses_test", visibleTurnID)

    visibleTurnID = "trn_b"
    const calls: Array<{ action: "steer" | "interrupt"; turnID: string }> = []
    await dispatchVisibleTurn(steerTarget, async (target) => {
      calls.push({ action: "steer", turnID: target.turnID })
    })
    await dispatchVisibleTurn(interruptTarget, async (target) => {
      calls.push({ action: "interrupt", turnID: target.turnID })
    })

    expect({ visibleTurnID, calls }).toEqual({
      visibleTurnID: "trn_b",
      calls: [
        { action: "steer", turnID: "trn_a" },
        { action: "interrupt", turnID: "trn_a" },
      ],
    })
  })

  test("an action with no visible Turn does not dispatch", async () => {
    let calls = 0
    await dispatchVisibleTurn(undefined, async () => {
      calls += 1
    })
    expect(calls).toBe(0)
  })
})
