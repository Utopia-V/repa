export type VisibleTurnTarget = {
  sessionID: string
  turnID: string
}

export function captureVisibleTurn(sessionID: string | undefined, turnID: string | undefined) {
  if (!sessionID || !turnID) return
  return { sessionID, turnID } satisfies VisibleTurnTarget
}

export function dispatchVisibleTurn<T>(
  target: VisibleTurnTarget | undefined,
  dispatch: (target: VisibleTurnTarget) => Promise<T>,
) {
  if (!target) return Promise.resolve(undefined)
  return dispatch(target)
}
