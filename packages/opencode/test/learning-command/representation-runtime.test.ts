import { Artifact } from "@opencode-ai/core/artifact"
import { ArtifactSchema } from "@opencode-ai/core/artifact/schema"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { ContentRootSchema } from "@opencode-ai/core/content-root/schema"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "@opencode-ai/core/learning-command/sql"
import { ModelV2 } from "@opencode-ai/core/model"
import { AppProcess } from "@opencode-ai/core/process"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Representation } from "@opencode-ai/core/representation"
import { RepresentationRevisionTable } from "@opencode-ai/core/representation/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { MessageTable, PartTable, SessionTable } from "@opencode-ai/core/session/sql"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { EventV2Bridge } from "@/event-v2-bridge"
import { RepresentationCommandRuntime } from "@/learning-command/representation-runtime"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Deferred, Effect, Fiber, Layer, ManagedRuntime, Schema } from "effect"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pdfFixture } from "../fixture/pdf"

const model = { modelID: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }
const permission = Layer.succeed(
  Permission.Service,
  Permission.Service.of({
    ask: (input) => {
      const denied = input.ruleset.findLast(
        (rule) =>
          (rule.permission === "*" || rule.permission === input.permission) &&
          (rule.pattern === "*" || input.patterns.includes(rule.pattern)),
      )
      if (denied?.action === "deny") return Effect.fail(new PermissionV1.DeniedError({ ruleset: input.ruleset }))
      return Effect.void
    },
    reply: () => Effect.void,
    list: () => Effect.succeed([]),
  }),
)

test("representation.convert publishes and settles one exact local Representation atomically", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "repa-representation-runtime-"))
  const sourceDirectory = path.join(directory, "source")
  const sourcePath = path.join(sourceDirectory, "lecture.pdf")
  const databasePath = path.join(directory, "repa.sqlite")
  await mkdir(sourceDirectory)
  await writeFile(sourcePath, pdfFixture([{ text: "Interactive readable page" }]))
  const runtime = ManagedRuntime.make(runtimeLayer(databasePath))
  try {
    await runtime.runPromise(
      Effect.gen(function* () {
        const database = yield* Database.Service
        const roots = yield* ContentRoot.Service
        const artifacts = yield* Artifact.Service
        const commands = yield* RepresentationCommandRuntime.Service
        const proposal = yield* roots.propose(sourceDirectory)
        const root = yield* roots.approve({
          proposal,
          approval: ContentRoot.LearnerApproval.contentRoot(proposal, "Interactive representation evidence"),
        })
        const read = yield* roots.read({ contentRootID: root.id, relativePath: "lecture.pdf", maxBytes: 1024 * 1024 })
        if (read.observation.result !== "present") return yield* Effect.die("Expected the exact PDF fixture")
        const artifact = yield* artifacts.admit({
          location: Artifact.CanonicalLocation.trusted(read.observation.descriptor.canonicalPath),
          observation: {
            result: "present",
            fingerprint: read.observation.fingerprint,
            mediaType: read.observation.mediaType,
            observer: Artifact.Observer.trusted(
              `content-root:${read.authorization.contentRootID}:${read.authorization.bindingID}:${read.authorization.grantEpisodeID}`,
              read.authorization.grantVersion,
            ),
            timeObserved: read.observation.timeObserved,
          },
          authority: Artifact.Admission.learnerInstruction("representation-runtime-test", 1),
        })
        const interaction = yield* seedInteraction(database.db, directory, "applied")
        const input = {
          effectiveArtifactID: artifact.id,
          sourceRevisionID: artifact.source.currentRevisionID!,
          contentRootID: root.id,
          relativePath: "lecture.pdf",
        }

        yield* commands.prepare(input, interaction.registration)
        const applied = yield* commands.execute(input, context(interaction.registration, artifact.id, "allow"))
        expect(JSON.parse(applied.output)).toMatchObject({
          outcome: "applied",
          effectiveArtifactID: artifact.id,
          sourceRevisionID: artifact.source.currentRevisionID,
          producerKind: "local_pdf",
        })
        expect(yield* exactPartResult(database.db, interaction.registration.partID)).toEqual(applied)
        expect(yield* database.db.select().from(RepresentationRevisionTable).all()).toHaveLength(1)
        expect(yield* database.db.select().from(LearningCommandReceiptTable).all()).toHaveLength(1)
        expect(yield* database.db.select().from(LearningCommandInvocationTable).all()).toMatchObject([
          {
            command_name: LearningCommand.REPRESENTATION_CONVERT_CAPABILITY,
            status: "applied",
            effect_id: null,
          },
        ])

        yield* commands.prepare(input, interaction.registration)
        expect(yield* commands.execute(input, context(interaction.registration, artifact.id, "deny"))).toEqual(applied)

        const duplicate = yield* insertAssistant(database.db, interaction, "duplicate")
        yield* commands.prepare(input, duplicate)
        const replay = yield* commands.execute(input, context(duplicate, artifact.id, "allow"))
        expect(JSON.parse(replay.output)).toMatchObject({
          outcome: "already_applied",
          effectID: JSON.parse(applied.output).effectID,
          representationRevisionID: JSON.parse(applied.output).representationRevisionID,
        })
        expect(yield* database.db.select().from(RepresentationRevisionTable).all()).toHaveLength(1)
        expect(yield* database.db.select().from(LearningCommandReceiptTable).all()).toHaveLength(1)
      }).pipe(Effect.scoped),
    )
  } finally {
    await runtime.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})

test("representation.convert denial and recovery settle without starting or resuming a producer", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "repa-representation-runtime-terminal-"))
  const databasePath = path.join(directory, "repa.sqlite")
  const runtime = ManagedRuntime.make(runtimeLayer(databasePath))
  try {
    await runtime.runPromise(
      Effect.gen(function* () {
        const database = yield* Database.Service
        const commands = yield* RepresentationCommandRuntime.Service
        const artifactID = ArtifactSchema.createArtifactID()
        const denied = yield* seedInteraction(database.db, directory, "denied")
        const deniedInput = {
          effectiveArtifactID: artifactID,
          sourceRevisionID: ArtifactSchema.createRevisionID(),
          contentRootID: ContentRootSchema.createContentRootID(),
          relativePath: "unread.pdf",
        }
        yield* commands.prepare(deniedInput, denied.registration)
        expect(
          JSON.parse((yield* commands.execute(deniedInput, context(denied.registration, artifactID, "deny"))).output),
        ).toMatchObject({ outcome: "error", code: "permission_rejected" })
        expect(yield* database.db.select().from(RepresentationRevisionTable).all()).toHaveLength(0)

        const interrupted = yield* seedInteraction(database.db, directory, "interrupted")
        yield* commands.prepare(deniedInput, interrupted.registration)
        expect(yield* commands.interrupt(interrupted.registration)).toBeTrue()
        expect(JSON.parse((yield* exactPartResult(database.db, interrupted.registration.partID)).output)).toMatchObject(
          {
            outcome: "error",
            code: "interrupted",
          },
        )

        const missing = yield* seedInteraction(database.db, directory, "missing")
        yield* commands.prepare(deniedInput, missing.registration)
        expect(
          JSON.parse((yield* commands.execute(deniedInput, context(missing.registration, artifactID, "allow"))).output),
        ).toMatchObject({ outcome: "error", code: "source_unavailable" })
        yield* RepresentationCommandRuntime.recoverAdmitted(yield* EventV2Bridge.Service)
        expect(yield* database.db.select().from(RepresentationRevisionTable).all()).toHaveLength(0)
      }).pipe(Effect.scoped),
    )
  } finally {
    await runtime.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})

test("representation.convert durably preserves cancellation, timeout, and invalid producer output", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "repa-representation-runtime-failures-"))
  const sourceDirectory = path.join(directory, "source")
  const sourcePath = path.join(sourceDirectory, "lecture.pdf")
  const databasePath = path.join(directory, "repa.sqlite")
  await mkdir(sourceDirectory)
  await writeFile(sourcePath, pdfFixture([{ text: "Failure classification source" }]))
  const processControl: { run: AppProcess.Interface["run"] } = {
    run: () => Effect.die("The test must select one process result"),
  }
  const controlledRun: AppProcess.Interface["run"] = (command, options) =>
    Effect.suspend(() => processControl.run(command, options))
  const processLayer = Layer.succeed(
    AppProcess.Service,
    AppProcess.Service.of({
      run: controlledRun,
    } as unknown as AppProcess.Interface),
  )
  const runtime = ManagedRuntime.make(runtimeLayer(databasePath, processLayer))
  try {
    await runtime.runPromise(
      Effect.gen(function* () {
        const database = yield* Database.Service
        const roots = yield* ContentRoot.Service
        const artifacts = yield* Artifact.Service
        const commands = yield* RepresentationCommandRuntime.Service
        const proposal = yield* roots.propose(sourceDirectory)
        const root = yield* roots.approve({
          proposal,
          approval: ContentRoot.LearnerApproval.contentRoot(proposal, "Producer failure evidence"),
        })
        const read = yield* roots.read({ contentRootID: root.id, relativePath: "lecture.pdf", maxBytes: 1024 * 1024 })
        if (read.observation.result !== "present") return yield* Effect.die("Expected the exact PDF fixture")
        const artifact = yield* artifacts.admit({
          location: Artifact.CanonicalLocation.trusted(read.observation.descriptor.canonicalPath),
          observation: {
            result: "present",
            fingerprint: read.observation.fingerprint,
            mediaType: read.observation.mediaType,
            observer: Artifact.Observer.trusted(
              `content-root:${read.authorization.contentRootID}:${read.authorization.bindingID}:${read.authorization.grantEpisodeID}`,
              read.authorization.grantVersion,
            ),
            timeObserved: read.observation.timeObserved,
          },
          authority: Artifact.Admission.learnerInstruction("representation-runtime-failure-test", 1),
        })
        const input = {
          effectiveArtifactID: artifact.id,
          sourceRevisionID: artifact.source.currentRevisionID!,
          contentRootID: root.id,
          relativePath: "lecture.pdf",
        }

        const cancelled = yield* seedInteraction(database.db, directory, "cancelled")
        const cancellationStarted = yield* Deferred.make<void>()
        const controller = new AbortController()
        processControl.run = (_command, options) =>
          Deferred.succeed(cancellationStarted, undefined).pipe(
            Effect.andThen(
              Effect.gen(function* () {
                while (!options?.signal?.aborted) yield* Effect.sleep("1 millis")
                return yield* Effect.fail(
                  new AppProcess.AppProcessError({
                    command: "repa-pdf-worker",
                    cause: new Error("cancelled by caller"),
                  }),
                )
              }),
            ),
          )
        yield* commands.prepare(input, cancelled.registration)
        const cancellation = yield* commands
          .execute(input, context(cancelled.registration, artifact.id, "allow", controller.signal))
          .pipe(Effect.forkChild)
        yield* Deferred.await(cancellationStarted)
        controller.abort()
        expect(JSON.parse((yield* Fiber.join(cancellation)).output)).toMatchObject({
          outcome: "error",
          code: "cancelled",
        })

        const timedOut = yield* seedInteraction(database.db, directory, "producer-timeout")
        processControl.run = () =>
          Effect.fail(
            new AppProcess.AppProcessError({
              command: "repa-pdf-worker",
              cause: new AppProcess.AppProcessTimeoutError("Timed out"),
            }),
          )
        yield* commands.prepare(input, timedOut.registration)
        const timeoutResult = yield* commands.execute(
          input,
          context(timedOut.registration, artifact.id, "allow"),
        )
        expect(JSON.parse(timeoutResult.output)).toMatchObject({ outcome: "error", code: "producer_timeout" })
        yield* commands.prepare(input, timedOut.registration)
        expect(yield* commands.execute(input, context(timedOut.registration, artifact.id, "deny"))).toEqual(
          timeoutResult,
        )

        const invalid = yield* seedInteraction(database.db, directory, "invalid-producer-output")
        processControl.run = () =>
          Effect.succeed({
            command: "repa-pdf-worker",
            exitCode: 0,
            stdout: Buffer.from("not-a-framed-worker-result"),
            stderr: Buffer.alloc(0),
            stdoutTruncated: false,
            stderrTruncated: false,
          })
        yield* commands.prepare(input, invalid.registration)
        const invalidResult = yield* commands.execute(input, context(invalid.registration, artifact.id, "allow"))
        expect(JSON.parse(invalidResult.output)).toMatchObject({
          outcome: "error",
          code: "invalid_producer_output",
        })

        const failed = yield* seedInteraction(database.db, directory, "producer-failed")
        processControl.run = () =>
          Effect.fail(
            new AppProcess.AppProcessError({
              command: "repa-pdf-worker",
              cause: new Error("worker spawn failed"),
            }),
          )
        yield* commands.prepare(input, failed.registration)
        expect(
          JSON.parse((yield* commands.execute(input, context(failed.registration, artifact.id, "allow"))).output),
        ).toMatchObject({ outcome: "error", code: "producer_failed" })
        expect(yield* database.db.select().from(RepresentationRevisionTable).all()).toHaveLength(0)
        expect(yield* database.db.select().from(LearningCommandReceiptTable).all()).toHaveLength(0)
      }).pipe(Effect.scoped),
    )
  } finally {
    await runtime.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)

function runtimeLayer(filename: string, process?: Layer.Layer<AppProcess.Service>) {
  const nodes = LayerNode.group([
    RepresentationCommandRuntime.node,
    Session.node,
    Artifact.node,
    ContentRoot.node,
    Representation.node,
    AppProcess.node,
    Database.node,
    EventV2Bridge.node,
    SessionProjector.node,
  ])
  if (process) {
    return LayerNode.compile(nodes, [
      [Database.node, Database.layerFromPath(filename).pipe(Layer.orDie)],
      [Permission.node, permission],
      [AppProcess.node, process],
    ])
  }
  return LayerNode.compile(nodes, [
    [Database.node, Database.layerFromPath(filename).pipe(Layer.orDie)],
    [Permission.node, permission],
  ])
}

function context(
  registration: RepresentationCommandRuntime.Registration,
  artifactID: Artifact.ArtifactID,
  action: "allow" | "deny",
  abort = new AbortController().signal,
) {
  return {
    sessionID: registration.sessionID,
    messageID: registration.assistantMessageID,
    callID: registration.callID,
    abort,
    extra: {
      toolCall: registration,
      permissionRuleset: [
        {
          permission: LearningCommand.REPRESENTATION_CONVERT_CAPABILITY,
          pattern: artifactID,
          action,
        },
      ],
    },
  } satisfies RepresentationCommandRuntime.ExecuteContext
}

function seedInteraction(db: Database.Interface["db"], directory: string, suffix: string) {
  return Effect.gen(function* () {
    const time = Date.now()
    const sessionID = SessionSchema.ID.make(`ses_representation_runtime_${suffix}`)
    const userMessageID = SessionV1.MessageID.ascending(`msg_representation_runtime_user_${suffix}`)
    const userPartID = SessionV1.PartID.ascending(`prt_representation_runtime_user_${suffix}`)
    yield* db
      .insert(ProjectTable)
      .values({
        id: Project.ID.global,
        worktree: AbsolutePath.make(directory),
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
        directory,
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
        data: {
          type: "text",
          text: "Please preserve readable access to this exact material",
        } as (typeof PartTable.$inferInsert)["data"],
        time_created: time,
        time_updated: time,
      })
      .run()
    yield* db.transaction((tx) =>
      LearningCommand.Occurrence.admit(tx, {
        admission: LearningCommand.LearnerAdmission.interactive(),
        sessionID,
        messageID: userMessageID,
        timeAdmitted: time,
      }),
    )
    const interaction = { sessionID, userMessageID }
    return { ...interaction, registration: yield* insertAssistant(db, interaction, suffix) }
  }).pipe(Effect.orDie)
}

function insertAssistant(
  db: Database.Interface["db"],
  interaction: { sessionID: SessionSchema.ID; userMessageID: SessionV1.MessageID },
  suffix: string,
) {
  return Effect.gen(function* () {
    const time = Date.now()
    const assistantMessageID = SessionV1.MessageID.ascending(`msg_representation_runtime_assistant_${suffix}`)
    yield* db
      .insert(MessageTable)
      .values({
        id: assistantMessageID,
        session_id: interaction.sessionID,
        data: assistantData(interaction.userMessageID, time),
        time_created: time,
        time_updated: time,
      })
      .run()
    return Object.freeze({
      partID: SessionV1.PartID.ascending(`prt_representation_runtime_tool_${suffix}`),
      callID: `call-representation-runtime-${suffix}`,
      emissionOrdinal: 0,
      sessionID: interaction.sessionID,
      parentUserMessageID: interaction.userMessageID,
      assistantMessageID,
    }) satisfies RepresentationCommandRuntime.Registration
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
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }
}

function exactPartResult(db: Database.Interface["db"], partID: SessionV1.PartID) {
  return db
    .select()
    .from(PartTable)
    .where(eq(PartTable.id, partID))
    .get()
    .pipe(
      Effect.orDie,
      Effect.map((row) => {
        if (!row) throw new Error(`Expected exact completed learning Part ${partID}`)
        const part = Schema.decodeUnknownSync(SessionV1.ToolPart)({
          ...row.data,
          id: row.id,
          messageID: row.message_id,
          sessionID: row.session_id,
        })
        if (part.state.status !== "completed") throw new Error(`Expected completed learning Part ${partID}`)
        return { title: part.state.title, metadata: part.state.metadata, output: part.state.output }
      }),
    )
}
