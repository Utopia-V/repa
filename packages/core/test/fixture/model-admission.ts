import { LearningContext } from "@opencode-ai/core/learning-context"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { RetainedSteering } from "@opencode-ai/core/retained-steering"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import {
  TurnInputTable,
  TurnModelOperationTable,
  TurnModelPresentationTable,
  TurnTable,
} from "@opencode-ai/core/turn/sql"
import { eq } from "drizzle-orm"
import { Effect } from "effect"

type Input = Omit<TurnLifecycle.ModelAdmission, "learningContextBasis"> & {
  readonly learningContextBasis?: LearningContext.CapabilityBasis
}

export function admitModelWithLearningContext(tx: Parameters<typeof TurnLifecycle.admitModel>[0], input: Input) {
  return TurnLifecycle.admitModel(tx, {
    ...input,
    learningContextBasis: input.learningContextBasis ?? LearningContext.unavailableCapabilityBasis(),
  })
}

export function admitLegacyModelWithoutLearningContext(
  tx: Parameters<typeof TurnLifecycle.admitModel>[0],
  input: Omit<TurnLifecycle.ModelAdmission, "learningContextBasis">,
) {
  return Effect.gen(function* () {
    const turn = yield* tx.select().from(TurnTable).where(eq(TurnTable.id, input.turnID)).get().pipe(Effect.orDie)
    if (!turn || turn.session_id !== input.sessionID || turn.state !== "running") {
      return yield* Effect.die("Legacy model fixture requires one exact running Turn")
    }
    const current = yield* tx
      .select()
      .from(TurnInputTable)
      .where(eq(TurnInputTable.id, turn.current_input_id))
      .get()
      .pipe(Effect.orDie)
    if (!current || current.turn_id !== input.turnID || turn.model_count >= turn.model_limit) {
      return yield* Effect.die("Legacy model fixture requires one admissible exact Turn input")
    }
    const observed = LearningFrontier.merge(input.snapshotFrontier, yield* LearningFrontier.read(tx))
    const cut = yield* RetainedSteering.prepareCut(tx, {
      turnID: input.turnID,
      assistantMessageID: input.assistantMessageID,
      trustedTime: input.timeAdmitted,
    })
    if (
      cut.sourceTemporalContext.occurrenceID !== current.occurrence_id ||
      cut.throughSharedFrontier.sequence !== observed.sequence ||
      cut.throughSharedFrontier.time !== observed.time
    ) {
      return yield* Effect.die("Legacy model fixture retained-steering cut does not match the Turn")
    }
    const baseEnvelope = {
      request: input.requestEnvelope,
      contextFingerprint: input.contextFingerprint,
      snapshotFrontier: input.snapshotFrontier,
    }
    yield* tx
      .insert(TurnModelOperationTable)
      .values({
        assistant_message_id: input.assistantMessageID,
        turn_id: input.turnID,
        session_id: input.sessionID,
        input_id: current.id,
        causal_occurrence_id: current.occurrence_id,
        ordinal: turn.model_count,
        state: "running",
        request_fingerprint: TurnLifecycle.envelopeFingerprint({
          ...baseEnvelope,
          retainedSteeringCutFingerprint: cut.fingerprint,
        }),
        context_fingerprint: TurnLifecycle.envelopeFingerprint({
          baseContextFingerprint: input.contextFingerprint,
          retainedSteeringCutFingerprint: cut.fingerprint,
        }),
        snapshot_frontier_sequence: input.snapshotFrontier.sequence,
        snapshot_frontier_time: input.snapshotFrontier.time,
        observed_shared_frontier_sequence: observed.sequence,
        observed_shared_frontier_time: observed.time,
        time_admitted: cut.cutAsOf,
        retained_steering_cut: cut,
        retained_steering_cut_fingerprint: cut.fingerprint,
        retained_steering_cut_as_of: cut.cutAsOf,
      })
      .run()
      .pipe(Effect.orDie)
    yield* tx
      .insert(TurnModelPresentationTable)
      .values({ assistant_message_id: input.assistantMessageID, session_id: input.sessionID })
      .run()
      .pipe(Effect.orDie)
    yield* RetainedSteering.commitCut(tx, cut)
  })
}
