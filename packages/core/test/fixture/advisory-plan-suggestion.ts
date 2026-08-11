import { AdvisoryPlanSuggestion } from "@opencode-ai/core/advisory-plan-suggestion"
import { Database } from "@opencode-ai/core/database/database"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { ModelV2 } from "@opencode-ai/core/model"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { MessageTable, PartTable, SessionTable } from "@opencode-ai/core/session/sql"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { Effect } from "effect"
import { admitModelWithLearningContext } from "./model-admission"

const model = { modelID: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }

export function applyAdvisoryPlanSuggestionInvocation(
  db: Database.Interface["db"],
  invocation: AdvisoryPlanSuggestion.Invocation,
  time: number,
) {
  return Effect.gen(function* () {
    const reserved = yield* db.transaction((tx) =>
      AdvisoryPlanSuggestion.reserve(tx, { ...invocation, settlement: { time, order: 1 } }),
    )
    if (reserved.type !== "admitted") return reserved
    yield* db.transaction((tx) =>
      AdvisoryPlanSuggestion.settlePolicy(tx, {
        partID: invocation.envelope.partID,
        outcome: "policy_allow",
        policyBasis: { source: "advisory-owner-composition-test", rule: "allow" },
        time: time + 1,
        order: 2,
      }),
    )
    return yield* db.transaction((tx) =>
      AdvisoryPlanSuggestion.settle(tx, {
        partID: invocation.envelope.partID,
        settlement: { time: time + 2, order: 3 },
      }),
    )
  })
}

export function seedAdvisoryPlanSuggestionInvocation(
  db: Database.Interface["db"],
  suffix: string,
  command: AdvisoryPlanSuggestion.Command,
  userText: string,
  time: number,
) {
  return Effect.gen(function* () {
    const sessionID = SessionSchema.ID.make(`ses_aps_owner_${suffix}`)
    const userMessageID = SessionV1.MessageID.ascending(`msg_aps_owner_user_${suffix}`)
    const userPartID = SessionV1.PartID.ascending(`prt_aps_owner_user_${suffix}`)
    const assistantMessageID = SessionV1.MessageID.ascending(`msg_aps_owner_assistant_${suffix}`)
    const partID = SessionV1.PartID.ascending(`prt_aps_owner_tool_${suffix}`)
    const callID = `call-aps-owner-${suffix}`
    const turnID = Turn.ID.create()
    const inputID = Turn.InputID.create()
    yield* db
      .insert(ProjectTable)
      .values({
        id: Project.ID.global,
        worktree: AbsolutePath.make("C:\\project"),
        sandboxes: [],
        time_created: time,
        time_updated: time,
      })
      .onConflictDoNothing()
      .run()
    yield* db
      .insert(SessionTable)
      .values({
        id: sessionID,
        project_id: Project.ID.global,
        slug: sessionID,
        directory: "C:\\project",
        title: suffix,
        version: "test",
        time_created: time,
        time_updated: time,
      })
      .run()
    yield* db
      .insert(MessageTable)
      .values({
        id: userMessageID,
        session_id: sessionID,
        data: userData(time),
        time_created: time,
        time_updated: time,
      })
      .run()
    yield* db
      .insert(PartTable)
      .values({
        id: userPartID,
        session_id: sessionID,
        message_id: userMessageID,
        data: { type: "text", text: userText } as (typeof PartTable.$inferInsert)["data"],
        time_created: time,
        time_updated: time,
      })
      .run()
    const occurrence = yield* db.transaction((tx) =>
      Effect.gen(function* () {
        const admitted = yield* LearningCommand.Occurrence.admit(tx, {
          admission: LearningCommand.LearnerAdmission.interactive({ timeZone: "UTC" }),
          sessionID,
          messageID: userMessageID,
          timeAdmitted: time,
        })
        yield* TurnLifecycle.admit(tx, {
          kind: "learner",
          turnID,
          sessionID,
          inputID,
          messageID: userMessageID,
          occurrenceID: admitted.id,
          limits: { model: 4, tool: 4 },
          envelope: { command },
          policyBasis: { source: "advisory-owner-composition-test" },
          timeAdmitted: time,
        })
        return admitted
      }),
    )
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx
          .insert(MessageTable)
          .values({
            id: assistantMessageID,
            session_id: sessionID,
            data: assistantData(userMessageID, time + 1),
            time_created: time + 1,
            time_updated: time + 1,
          })
          .run()
        yield* tx
          .insert(PartTable)
          .values({
            id: partID,
            session_id: sessionID,
            message_id: assistantMessageID,
            data: {
              type: "tool",
              tool: AdvisoryPlanSuggestion.UPDATE_CAPABILITY,
              callID,
              state: { status: "pending", input: command, raw: JSON.stringify(command) },
            } as (typeof PartTable.$inferInsert)["data"],
            time_created: time + 1,
            time_updated: time + 1,
          })
          .run()
        yield* admitModelWithLearningContext(tx, {
          turnID,
          sessionID,
          assistantMessageID,
          requestEnvelope: { command },
          contextFingerprint: new Bun.CryptoHasher("sha256").update(`aps-owner-context:${suffix}`).digest("hex"),
          snapshotFrontier: yield* LearningFrontier.read(tx),
          timeAdmitted: time + 1,
        })
        yield* TurnLifecycle.sealCandidateSet(tx, {
          turnID,
          sessionID,
          assistantMessageID,
          candidates: [{ partID, callID, tool: AdvisoryPlanSuggestion.UPDATE_CAPABILITY, envelope: { command } }],
          timeSealed: time + 1,
        })
        yield* TurnLifecycle.settleModel(tx, {
          turnID,
          assistantMessageID,
          state: "completed",
          time: time + 1,
        })
        yield* TurnLifecycle.admitTool(tx, { turnID, sessionID, assistantMessageID, partID, timeAdmitted: time + 1 })
        yield* TurnLifecycle.consumeToolFrontier(tx, { partID, frontier: yield* LearningFrontier.read(tx) })
      }),
    )
    return {
      envelope: {
        occurrenceID: occurrence.id,
        turnID,
        inputID,
        sessionID,
        parentUserMessageID: userMessageID,
        assistantMessageID,
        partID,
        providerCallID: callID,
        emissionOrdinal: 0,
        capabilityIdentity: AdvisoryPlanSuggestion.UPDATE_CAPABILITY,
        capabilityVersion: AdvisoryPlanSuggestion.UPDATE_VERSION,
        authorizationBasis: "agent_action" as const,
        timeAdmitted: time + 1,
      },
      command,
    } satisfies AdvisoryPlanSuggestion.Invocation
  }).pipe(Effect.orDie)
}

function userData(time: number): Omit<SessionV1.User, "id" | "sessionID"> {
  return { role: "user", time: { created: time }, agent: "repa", model }
}

function assistantData(parentID: SessionV1.MessageID, time: number): Omit<SessionV1.Assistant, "id" | "sessionID"> {
  return {
    role: "assistant",
    time: { created: time },
    parentID,
    modelID: model.modelID,
    providerID: model.providerID,
    mode: "repa",
    agent: "repa",
    path: { cwd: "C:\\project", root: "C:\\project" },
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
  }
}
