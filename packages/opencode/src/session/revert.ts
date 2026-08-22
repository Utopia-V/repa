import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer, Context, Schema } from "effect"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Snapshot } from "../snapshot"
import { Storage } from "@/storage/storage"
import { Session } from "./session"
import { MessageV2 } from "./message-v2"
import { SessionID, MessageID, PartID } from "./schema"
import { SessionRunState } from "./run-state"
import { SessionSummary } from "./summary"
import { Database } from "@opencode-ai/core/database/database"
import { SessionPresentation } from "@opencode-ai/core/session-presentation"

export const RevertInput = Schema.Struct({
  sessionID: SessionID,
  messageID: MessageID,
  partID: Schema.optional(PartID),
})
export type RevertInput = Schema.Schema.Type<typeof RevertInput>

export interface Interface {
  readonly revert: (
    input: RevertInput,
  ) => Effect.Effect<
    Session.Info,
    | Session.BusyError
    | SessionPresentation.AdministrativeHistoryIntegrityError
    | SessionPresentation.HistoricalPresentationNotRevertibleError
  >
  readonly unrevert: (
    input: { sessionID: SessionID },
  ) => Effect.Effect<
    Session.Info,
    | Session.BusyError
    | SessionPresentation.AdministrativeHistoryIntegrityError
    | SessionPresentation.HistoricalPresentationNotRevertibleError
  >
  readonly cleanup: (
    session: Session.Info,
  ) => Effect.Effect<
    void,
    | Session.BusyError
    | SessionPresentation.AdministrativeHistoryIntegrityError
    | SessionPresentation.HistoricalPresentationNotRevertibleError
  >
  readonly withCleanAdmission: <A, E, R>(
    sessionID: SessionID,
    use: (session: Session.Info) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<
    A,
    | E
    | Session.NotFound
    | Session.BusyError
    | SessionPresentation.AdministrativeHistoryIntegrityError
    | SessionPresentation.HistoricalPresentationNotRevertibleError,
    R
  >
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionRevert") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const snap = yield* Snapshot.Service
    const storage = yield* Storage.Service
    const events = yield* EventV2Bridge.Service
    const summary = yield* SessionSummary.Service
    const state = yield* SessionRunState.Service
    const { db } = yield* Database.Service

    const inspectBoundary = Effect.fn("SessionRevert.inspectBoundary")(function* (input: {
      sessionID: SessionID
      messageID: MessageID
      partID?: PartID
    }) {
      return yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* SessionPresentation.assertAdministrativeHistoryIntegrity(tx, input.sessionID)
            yield* SessionPresentation.assertPresentationRevertible(tx, {
              sessionID: input.sessionID,
              presentationID: input.messageID,
            })
            if (input.partID) {
              yield* SessionPresentation.assertPresentationRevertible(tx, {
                sessionID: input.sessionID,
                presentationID: input.partID,
              })
            }
            return yield* SessionPresentation.canonicalLocalSuffix(tx, {
              sessionID: input.sessionID,
              targetMessageID: input.messageID,
            })
          }),
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
    })

    const inspectHistory = Effect.fn("SessionRevert.inspectHistory")(function* (sessionID: SessionID) {
      yield* db
        .transaction((tx) => SessionPresentation.assertAdministrativeHistoryIntegrity(tx, sessionID))
        .pipe(Effect.catchTag("SqlError", Effect.die))
    })

    const revertUnlocked = Effect.fn("SessionRevert.revertUnlocked")(function* (input: RevertInput) {
      const all = yield* sessions.messages({ sessionID: input.sessionID }).pipe(Effect.orDie)
      let lastUser: SessionV1.User | undefined
      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)

      let rev: Session.Info["revert"]
      const patches: Snapshot.Patch[] = []
      for (const msg of all) {
        if (msg.info.role === "user") lastUser = msg.info
        const remaining = []
        for (const part of msg.parts) {
          if (rev) {
            if (part.type === "patch") patches.push(part)
            continue
          }

          if (!rev) {
            if ((msg.info.id === input.messageID && !input.partID) || part.id === input.partID) {
              const partID = remaining.some((item) => ["text", "tool"].includes(item.type)) ? input.partID : undefined
              rev = {
                messageID: !partID && lastUser ? lastUser.id : msg.info.id,
                partID,
              }
            }
            remaining.push(part)
          }
        }
      }

      if (!rev) return session

      const suffix = yield* inspectBoundary({
        sessionID: input.sessionID,
        messageID: rev.messageID,
        ...(rev.partID ? { partID: rev.partID } : {}),
      })
      const suffixIDs = new Set(suffix)

      rev.snapshot = session.revert?.snapshot ?? (yield* snap.track())
      if (session.revert?.snapshot) yield* snap.restore(session.revert.snapshot)
      yield* snap.revert(patches)
      if (rev.snapshot) rev.diff = yield* snap.diff(rev.snapshot)
      const range = all.filter((msg) => suffixIDs.has(msg.info.id))
      const diffs = yield* summary.computeDiff({ messages: range })
      yield* storage.write(["session_diff", input.sessionID], diffs).pipe(Effect.ignore)
      yield* events.publish(Session.Event.Diff, { sessionID: input.sessionID, diff: diffs })
      yield* sessions.setRevert({
        sessionID: input.sessionID,
        revert: rev,
        summary: {
          additions: diffs.reduce((sum, x) => sum + x.additions, 0),
          deletions: diffs.reduce((sum, x) => sum + x.deletions, 0),
          files: diffs.length,
        },
      })
      return yield* sessions.get(input.sessionID).pipe(Effect.orDie)
    })

    const revert: Interface["revert"] = Effect.fn("SessionRevert.revert")((input: RevertInput) =>
      state.idle(input.sessionID, revertUnlocked(input)),
    )

    const unrevertUnlocked = Effect.fn("SessionRevert.unrevertUnlocked")(function* (input: { sessionID: SessionID }) {
      yield* Effect.logInfo("unreverting", { sessionID: input.sessionID })
      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
      if (!session.revert) return session
      yield* inspectBoundary({
        sessionID: input.sessionID,
        messageID: session.revert.messageID,
        ...(session.revert.partID ? { partID: session.revert.partID } : {}),
      })
      if (session.revert.snapshot) yield* snap.restore(session.revert.snapshot)
      yield* sessions.clearRevert(input.sessionID)
      return yield* sessions.get(input.sessionID).pipe(Effect.orDie)
    })

    const unrevert: Interface["unrevert"] = Effect.fn("SessionRevert.unrevert")((input: { sessionID: SessionID }) =>
      state.idle(input.sessionID, unrevertUnlocked(input)),
    )

    const cleanupUnlocked = Effect.fn("SessionRevert.cleanupUnlocked")(function* (session: Session.Info) {
      const revert = session.revert
      if (!revert) return
      const sessionID = session.id
      const msgs = yield* sessions.messages({ sessionID }).pipe(Effect.orDie)
      const messageID = revert.messageID
      const suffix = yield* inspectBoundary({
        sessionID,
        messageID,
        ...(revert.partID ? { partID: revert.partID } : {}),
      })
      const suffixIDs = new Set(suffix)
      const remove = [] as SessionV1.WithParts[]
      let target: SessionV1.WithParts | undefined
      for (const msg of msgs) {
        if (!suffixIDs.has(msg.info.id)) continue
        if (msg.info.id !== messageID) {
          remove.push(msg)
          continue
        }
        if (revert.partID) {
          target = msg
          continue
        }
        remove.push(msg)
      }
      const parts: { messageID: MessageID; partID: PartID }[] = []
      if (revert.partID && target) {
        const partID = revert.partID
        const idx = target.parts.findIndex((part) => part.id === partID)
        if (idx >= 0) {
          parts.push(...target.parts.slice(idx).map((part) => ({ messageID: target.info.id, partID: part.id })))
        }
      }
      yield* sessions.removeTranscript({
        sessionID,
        messageIDs: remove.map((message) => message.info.id),
        parts,
        clearRevert: { timeUpdated: Date.now() },
      })
    })

    const cleanup: Interface["cleanup"] = Effect.fn("SessionRevert.cleanup")((session: Session.Info) =>
      session.revert ? state.idle(session.id, cleanupUnlocked(session)) : Effect.void,
    )

    const withCleanAdmission: Interface["withCleanAdmission"] = (sessionID, use) =>
      Effect.gen(function* () {
        const inspected = yield* state.admit(
          sessionID,
          Effect.gen(function* () {
            const session = yield* sessions.get(sessionID)
            if (session.revert) {
              yield* inspectBoundary({
                sessionID,
                messageID: session.revert.messageID,
                ...(session.revert.partID ? { partID: session.revert.partID } : {}),
              })
              return { type: "cleanup" as const }
            }
            yield* inspectHistory(sessionID)
            return { type: "complete" as const, value: yield* use(session) }
          }),
        )
        if (inspected.type === "complete") return inspected.value
        return yield* state.mutateThenAdmit(
          sessionID,
          Effect.gen(function* () {
            const current = yield* sessions.get(sessionID)
            if (current.revert) yield* cleanupUnlocked(current)
            const session = yield* sessions.get(sessionID)
            yield* inspectHistory(sessionID)
            return use(session)
          }),
        )
      })

    return Service.of({ revert, unrevert, cleanup, withCleanAdmission })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [
    Session.node,
    Snapshot.node,
    Storage.node,
    EventV2Bridge.node,
    SessionSummary.node,
    SessionRunState.node,
    Database.node,
  ],
})

export * as SessionRevert from "./revert"
