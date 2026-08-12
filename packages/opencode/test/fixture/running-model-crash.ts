import { Database } from "@opencode-ai/core/database/database"
import { EventSequenceTable } from "@opencode-ai/core/event/sql"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceStore } from "@/project/instance-store"
import { MessageID } from "@/session/schema"
import { Session } from "@/session/session"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { admitModelWithLearningContext } from "./model-admission"
import { materializeTestSession } from "./session"

if (process.argv[2] !== "seed") throw new Error("usage: running-model-crash seed")

const model = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

const seeded = await AppRuntime.runPromise(
  InstanceStore.Service.use((instances) =>
    instances.provide(
      { directory: process.cwd() },
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const database = yield* Database.Service
        const admitted = yield* materializeTestSession({
          title: "Process restart continuity",
          text: "Leave this model operation running across a process crash.",
          settle: false,
          limits: { model: 2, tool: 0 },
        })
        const assistant: SessionV1.Assistant = {
          id: MessageID.ascending(),
          role: "assistant",
          parentID: admitted.user.id,
          sessionID: admitted.info.id,
          mode: "repa",
          agent: "repa",
          cost: 0,
          path: { cwd: process.cwd(), root: process.cwd() },
          tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          modelID: model.modelID,
          providerID: model.providerID,
          time: { created: Date.now() },
        }
        yield* sessions.updateMessage(assistant)
        const operation = yield* database.db
          .transaction((tx) =>
            Effect.gen(function* () {
              const frontier = yield* LearningFrontier.read(tx)
              return yield* admitModelWithLearningContext(tx, {
                turnID: admitted.turn.id,
                sessionID: admitted.info.id,
                assistantMessageID: assistant.id,
                requestEnvelope: { purpose: "process-restart-test" },
                contextFingerprint: TurnLifecycle.envelopeFingerprint({ context: "process-restart-test" }),
                snapshotFrontier: frontier,
                timeAdmitted: Date.now(),
              })
            }),
          )
          .pipe(Effect.orDie)
        if (operation.type !== "admitted") return yield* Effect.die("Crash fixture model operation was not admitted")
        const eventSequence = yield* database.db
          .select({ sequence: EventSequenceTable.seq })
          .from(EventSequenceTable)
          .where(eq(EventSequenceTable.aggregate_id, admitted.info.id))
          .get()
          .pipe(Effect.orDie)
        return {
          sessionID: admitted.info.id,
          turnID: admitted.turn.id,
          inputID: admitted.turn.initialInputID,
          userMessageID: admitted.user.id,
          assistantMessageID: assistant.id,
          eventSequence: eventSequence?.sequence ?? 0,
          modelOperationState: operation.operation.state,
          contextFingerprint: operation.learningContextCut.fingerprint,
          rendererVersion: operation.learningContextCut.rendererVersion,
        }
      }),
    ),
  ),
)

if (seeded.modelOperationState !== "running" || seeded.rendererVersion !== 7) {
  throw new Error(`Crash fixture did not persist a current running model operation: ${JSON.stringify(seeded)}`)
}

process.stdout.write(`REPA_RUNNING_MODEL_READY ${JSON.stringify(seeded)}\n`)
process.stdin.resume()
