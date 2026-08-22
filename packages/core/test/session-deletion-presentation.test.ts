import { describe, expect, test } from "bun:test"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { DatabaseMigration } from "@opencode-ai/core/database/migration"
import { ProjectV2 } from "@opencode-ai/core/project"
import { LearningInspection } from "@opencode-ai/core/learning-inspection"
import { LearningInspectionOwner } from "@opencode-ai/core/learning-inspection-owner"
import { LearningInspectionSchema } from "@opencode-ai/core/learning-inspection-schema"
import { SessionDeletion } from "@opencode-ai/core/session-deletion"
import { SessionDeletionControlReceiptTable } from "@opencode-ai/core/session-deletion/sql"
import { SessionPresentation } from "@opencode-ai/core/session-presentation"
import {
  SessionAdministrativeHistoryEmbeddedPartTable,
  SessionAdministrativeHistoryMessageTable,
  SessionAdministrativeHistoryPartTable,
  SessionAdministrativeHistoryTable,
  SessionPresentationFrontierTable,
} from "@opencode-ai/core/session-presentation/sql"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { MessageTable, PartTable, SessionTable } from "@opencode-ai/core/session/sql"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { TurnLineage } from "@opencode-ai/core/turn-lineage"
import { Turn } from "@opencode-ai/schema/turn"
import { Cause, Effect, Exit } from "effect"
import { eq, inArray, sql } from "drizzle-orm"
import type { SqlClient as SqlClientService } from "effect/unstable/sql/SqlClient"

const makeDb = EffectDrizzleSqlite.makeWithDefaults()
type TestDatabase = Effect.Success<typeof makeDb>

const run = <A, E>(effect: Effect.Effect<A, E, SqlClientService>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true })), Effect.scoped),
  )

function withDatabase(effect: (db: TestDatabase) => Effect.Effect<void, unknown>) {
  return run(
    Effect.gen(function* () {
      const db = yield* makeDb
      yield* db.run("PRAGMA foreign_keys = ON")
      yield* DatabaseMigration.apply(db)
      yield* db.run(sql`
        INSERT INTO project (id, worktree, time_created, time_updated, sandboxes)
        VALUES (${ProjectV2.ID.global}, '/', 1, 1, '[]')
      `)
      yield* effect(db)
    }),
  )
}

function insertSession(db: TestDatabase, sessionID: SessionSchema.ID, parentID?: SessionSchema.ID) {
  return db.run(sql`
    INSERT INTO session (id, project_id, parent_id, slug, directory, title, version, time_created, time_updated)
    VALUES (
      ${sessionID}, ${ProjectV2.ID.global}, ${parentID ?? null}, ${`session-${sessionID}`}, '/', 'Session', 'test', 10, 10
    )
  `)
}

function insertUserPresentation(db: TestDatabase, sessionID: SessionSchema.ID, time: number, text: string) {
  return Effect.gen(function* () {
    const messageID = SessionV1.MessageID.ascending()
    const partID = SessionV1.PartID.ascending()
    yield* db.run(sql`
      INSERT INTO message (id, session_id, time_created, time_updated, data)
      VALUES (
        ${messageID}, ${sessionID}, ${time}, ${time},
        ${JSON.stringify({
          role: "user",
          time: { created: time },
          agent: "repa",
          model: { providerID: "test", modelID: "test" },
        })}
      )
    `)
    yield* db.run(sql`
      INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
      VALUES (${partID}, ${messageID}, ${sessionID}, ${time}, ${time}, ${JSON.stringify({ type: "text", text })})
    `)
    return { messageID, partID }
  })
}

function deleteSessions(tx: Parameters<Parameters<TestDatabase["transaction"]>[0]>[0], sessionIDs: SessionSchema.ID[]) {
  return tx.delete(SessionTable).where(inArray(SessionTable.id, sessionIDs)).run().pipe(Effect.orDie, Effect.asVoid)
}

describe("Session deletion settlement", () => {
  test("distinguishes missing/live truth and binds deletion to the exact displayed subtree", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const missing = SessionSchema.ID.create()
        expect(yield* db.transaction((tx) => SessionDeletion.readProjection(tx, missing))).toEqual({
          schemaVersion: 1,
          state: "missing",
        })

        const root = SessionSchema.ID.create()
        const child = SessionSchema.ID.create()
        yield* insertSession(db, root)
        expect(yield* db.transaction((tx) => SessionDeletion.readProjection(tx, root))).toEqual({
          schemaVersion: 1,
          state: "live",
        })
        const stale = yield* db.transaction((tx) =>
          SessionDeletion.prepareProposal(tx, {
            requestID: SessionDeletion.createRequestID(),
            rootSessionID: root,
            mode: "full",
          }),
        )
        yield* insertSession(db, child, root)
        const changed = yield* db
          .transaction((tx) =>
            SessionDeletion.commit(
              tx,
              {
                proposal: stale,
                permissionDecisionFingerprint: SessionDeletion.permissionDecisionFingerprint(stale),
                deletionTime: 20,
              },
              () => deleteSessions(tx, [root, child]),
            ),
          )
          .pipe(Effect.exit)
        expect(Exit.isFailure(changed)).toBeTrue()
        expect(yield* db.all(sql`SELECT id FROM session WHERE id IN (${root}, ${child}) ORDER BY id`)).toHaveLength(2)
        expect(yield* db.all(sql`SELECT request_id FROM session_deletion_control_receipt`)).toEqual([])
      }),
    )
  })

  test("keeps a body-free immutable full-deletion receipt for replay, conflict, and root retirement", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const root = SessionSchema.ID.create()
        const child = SessionSchema.ID.create()
        yield* insertSession(db, root)
        yield* insertSession(db, child, root)
        const sentinel = "body-must-not-survive-the-deletion-control-receipt"
        yield* insertUserPresentation(db, child, 11, sentinel)
        const proposal = yield* db.transaction((tx) =>
          SessionDeletion.prepareProposal(tx, {
            requestID: SessionDeletion.createRequestID(),
            rootSessionID: root,
            mode: "full",
          }),
        )
        const permission = SessionDeletion.permissionDecisionFingerprint(proposal)
        const applied = yield* db.transaction((tx) =>
          SessionDeletion.commit(tx, { proposal, permissionDecisionFingerprint: permission, deletionTime: 30 }, () =>
            deleteSessions(tx, [root, child]),
          ),
        )
        expect(applied.type).toBe("applied")
        expect(applied.auditAvailable).toBe(false)
        expect(applied.settlementBytes).not.toContain(sentinel)
        expect(yield* db.all(sql`SELECT id FROM session WHERE id IN (${root}, ${child})`)).toEqual([])

        const replay = yield* db.transaction((tx) =>
          SessionDeletion.commit(tx, { proposal, permissionDecisionFingerprint: permission, deletionTime: 999 }, () =>
            Effect.die("physical replay attempted body deletion"),
          ),
        )
        expect(replay).toMatchObject({
          type: "replayed",
          settlement: { deletionTime: 30, mode: "full" },
          settlementBytes: applied.settlementBytes,
          auditAvailable: false,
        })

        const conflictProposal = {
          ...proposal,
          requestID: SessionDeletion.createRequestID(),
          mode: "minimal_audit" as const,
          requestFingerprint: SessionDeletion.requestFingerprint({
            rootSessionID: proposal.rootSessionID,
            targets: proposal.targets,
            mode: "minimal_audit",
          }),
        }
        const conflict = yield* db.transaction((tx) =>
          SessionDeletion.commit(
            tx,
            {
              proposal: conflictProposal,
              permissionDecisionFingerprint: SessionDeletion.permissionDecisionFingerprint(conflictProposal),
              deletionTime: 40,
            },
            () => Effect.die("address conflict attempted body deletion"),
          ),
        )
        expect(conflict).toMatchObject({ type: "deletion_mode_conflict", settlementBytes: applied.settlementBytes })

        const retired = yield* db
          .transaction((tx) => SessionDeletion.assertSessionIDAvailable(tx, root))
          .pipe(Effect.exit)
        expect(Exit.isFailure(retired)).toBeTrue()
        if (Exit.isFailure(retired)) {
          expect(retired.cause.toString()).toContain("SessionIDRetiredError")
        }
        const recreated = yield* insertSession(db, root).pipe(Effect.exit)
        expect(Exit.isFailure(recreated)).toBeTrue()
        expect(yield* db.select().from(SessionDeletionControlReceiptTable).all().pipe(Effect.orDie)).toHaveLength(1)
      }),
    )
  })

  test("creates and later purges only the selected minimal audit without releasing the root address", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const root = SessionSchema.ID.create()
        yield* insertSession(db, root)
        const sentinel = "minimal-audit-must-not-retain-transcript-bodies"
        yield* insertUserPresentation(db, root, 11, sentinel)
        const proposal = yield* db.transaction((tx) =>
          SessionDeletion.prepareProposal(tx, {
            requestID: SessionDeletion.createRequestID(),
            rootSessionID: root,
            mode: "minimal_audit",
          }),
        )
        const applied = yield* db.transaction((tx) =>
          SessionDeletion.commit(
            tx,
            {
              proposal,
              permissionDecisionFingerprint: SessionDeletion.permissionDecisionFingerprint(proposal),
              deletionTime: 50,
            },
            () => deleteSessions(tx, [root]),
          ),
        )
        expect(applied).toMatchObject({ type: "applied", auditAvailable: true })
        const retained = yield* db.transaction((tx) => SessionDeletion.readProjection(tx, root))
        expect(retained).toMatchObject({
          state: "deleted_minimal_audit",
          auditAvailable: true,
          audit: { operationCount: 0, relationCount: 0, deletionTime: 50, sessionBodiesDeleted: true },
        })
        expect(JSON.stringify(retained)).not.toContain(sentinel)
        const readProjection = TurnLineage.readProjection("learning_interaction_read", {
          sessionID: root,
          turnID: "trn_deleted_audit",
          terminalState: "completed",
        })
        const inspect = (deletionRootSessionID?: SessionSchema.ID) =>
          db.transaction((tx) =>
            LearningInspection.composeRead(tx, {
              source: {
                partID: SessionV1.PartID.make("prt_audit_inspection"),
                tool: "learning_interaction_read",
                action: "read_range",
                assistantMessageID: SessionV1.MessageID.make("msg_audit_inspection"),
                turnID: Turn.ID.make("trn_audit_inspection"),
                inputID: Turn.InputID.make("tri_audit_inspection"),
              },
              readProjection,
              limit: 16,
              ...(deletionRootSessionID ? { deletionRootSessionID } : {}),
              owner: LearningInspectionOwner.inspectionOwner(
                "learning_interaction",
                "exact deleted Session audit scope",
              ),
            }),
          )
        expect((yield* inspect()).deletionAudit.status).toBe("unknown")
        const rootProjection = yield* inspect(root)
        const rootAudit: LearningInspectionSchema.Projection["deletionAudit"] = rootProjection.deletionAudit
        expect(rootAudit).toMatchObject({
          status: "not_found",
          scope: { rootSessionID: root, deletionTime: 50 },
          items: [],
          omitted: false,
        })
        if (!rootAudit.scope) return yield* Effect.die("Expected the retained deletion-audit scope")
        const otherRoot = SessionSchema.ID.create()
        yield* insertSession(db, otherRoot)
        const otherProposal = yield* db.transaction((tx) =>
          SessionDeletion.prepareProposal(tx, {
            requestID: SessionDeletion.createRequestID(),
            rootSessionID: otherRoot,
            mode: "minimal_audit",
          }),
        )
        yield* db.transaction((tx) =>
          SessionDeletion.commit(
            tx,
            {
              proposal: otherProposal,
              permissionDecisionFingerprint: SessionDeletion.permissionDecisionFingerprint(otherProposal),
              deletionTime: 55,
            },
            () => deleteSessions(tx, [otherRoot]),
          ),
        )
        const predecessorSessionID = SessionSchema.ID.create()
        const predecessorMessageID = SessionV1.MessageID.ascending()
        const predecessorPartID = SessionV1.PartID.ascending()
        yield* insertSession(db, predecessorSessionID)
        const conflictingCursor = LearningInspectionSchema.createPageCursor(
          "deletion_audit",
          predecessorPartID,
          readProjection.records,
          JSON.stringify({
            time: rootAudit.scope.deletionTime,
            rootSessionID: root,
            bundleID: rootAudit.scope.bundleID,
            operationID: "dao_page_1",
          }),
        )
        const storedProjection: LearningInspectionSchema.Projection = {
          ...rootProjection,
          source: {
            ...rootProjection.source,
            partID: predecessorPartID,
            tool: "learning_interaction_read",
            assistantMessageID: predecessorMessageID,
          },
          deletionAudit: {
            status: "partial",
            scope: rootAudit.scope,
            items: [
              {
                rootSessionID: root,
                bundleID: rootAudit.scope.bundleID,
                operationID: "dao_page_1",
                record: readProjection.records[0]!,
                contextClassification: "not_entered",
                exactRead: false,
                typedCitation: false,
                terminalStatus: "completed",
                deletionTime: rootAudit.scope.deletionTime,
                bodyDeleted: true,
              },
            ],
            omitted: true,
            cursor: conflictingCursor,
          },
        }
        expect(LearningInspectionSchema.isProjection(storedProjection)).toBeTrue()
        yield* db.run(sql`
          INSERT INTO message (id, session_id, time_created, time_updated, data)
          VALUES (
            ${predecessorMessageID}, ${predecessorSessionID}, 56, 56,
            ${JSON.stringify({ role: "assistant", time: { created: 56, completed: 56 } })}
          )
        `)
        yield* db.run(sql`
          INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
          VALUES (
            ${predecessorPartID}, ${predecessorMessageID}, ${predecessorSessionID}, 56, 56,
            ${JSON.stringify({
              type: "tool",
              callID: "call_audit_predecessor",
              tool: "learning_interaction_read",
              state: {
                status: "completed",
                input: { action: "read_range" },
                output: "typed predecessor",
                title: "Deletion audit predecessor",
                metadata: { [LearningInspectionSchema.METADATA_KEY]: storedProjection },
                time: { start: 56, end: 56 },
              },
            })}
          )
        `)
        const conflict = yield* db.transaction((tx) =>
          LearningInspection.composeRead(tx, {
            source: {
              partID: SessionV1.PartID.make("prt_audit_scope_conflict"),
              tool: "learning_interaction_read",
              action: "read_range",
              assistantMessageID: SessionV1.MessageID.make("msg_audit_scope_conflict"),
              turnID: Turn.ID.make("trn_audit_scope_conflict"),
              inputID: Turn.InputID.make("tri_audit_scope_conflict"),
            },
            readProjection,
            limit: 16,
            cursor: conflictingCursor,
            deletionRootSessionID: otherRoot,
            owner: LearningInspectionOwner.inspectionOwner("learning_interaction", "exact deleted Session audit scope"),
          }),
        )
        expect(conflict).toMatchObject({
          status: "stale_inspection",
          deletionAudit: {
            status: "cursor_scope_conflict",
            scope: { rootSessionID: otherRoot, deletionTime: 55 },
            items: [],
            omitted: false,
          },
        })
        const forgedPosition = LearningInspectionSchema.createPageCursor(
          "deletion_audit",
          predecessorPartID,
          readProjection.records,
          JSON.stringify({
            time: rootAudit.scope.deletionTime,
            rootSessionID: root,
            bundleID: rootAudit.scope.bundleID,
            operationID: "zzzz_fabricated_high_position",
          }),
        )
        expect(
          yield* db.transaction((tx) =>
            LearningInspection.composeRead(tx, {
              source: {
                partID: SessionV1.PartID.make("prt_audit_position_conflict"),
                tool: "learning_interaction_read",
                action: "read_range",
                assistantMessageID: SessionV1.MessageID.make("msg_audit_position_conflict"),
                turnID: Turn.ID.make("trn_audit_position_conflict"),
                inputID: Turn.InputID.make("tri_audit_position_conflict"),
              },
              readProjection,
              limit: 16,
              cursor: forgedPosition,
              deletionRootSessionID: root,
              owner: LearningInspectionOwner.inspectionOwner(
                "learning_interaction",
                "exact deleted Session audit scope",
              ),
            }),
          ),
        ).toMatchObject({ status: "cursor_predecessor_conflict", deletionAudit: { status: "unknown" } })

        const purge = yield* db.transaction((tx) =>
          SessionDeletion.preparePurgeProposal(tx, {
            requestID: SessionDeletion.createPurgeRequestID(),
            rootSessionID: root,
          }),
        )
        const purged = yield* db.transaction((tx) => SessionDeletion.purgeAudit(tx, { proposal: purge, purgeTime: 60 }))
        expect(purged.type).toBe("applied")
        const replay = yield* db.transaction((tx) =>
          SessionDeletion.purgeAudit(tx, { proposal: purge, purgeTime: 999 }),
        )
        expect(replay).toMatchObject({ type: "replayed", settlementBytes: purged.settlementBytes })
        expect(yield* db.transaction((tx) => SessionDeletion.readProjection(tx, root))).toMatchObject({
          state: "deleted_minimal_audit_purged",
          auditAvailable: false,
          settlement: { deletionTime: 50 },
        })
        expect(Exit.isFailure(yield* insertSession(db, root).pipe(Effect.exit))).toBeTrue()
      }),
    )
  })

  test("rolls back both the receipt and body deletion when the destructive transaction fails", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const root = SessionSchema.ID.create()
        yield* insertSession(db, root)
        const proposal = yield* db.transaction((tx) =>
          SessionDeletion.prepareProposal(tx, {
            requestID: SessionDeletion.createRequestID(),
            rootSessionID: root,
            mode: "full",
          }),
        )
        const failed = yield* db
          .transaction((tx) =>
            SessionDeletion.commit(
              tx,
              {
                proposal,
                permissionDecisionFingerprint: SessionDeletion.permissionDecisionFingerprint(proposal),
                deletionTime: 70,
              },
              () => deleteSessions(tx, [root]).pipe(Effect.andThen(Effect.fail("injected failure"))),
            ),
          )
          .pipe(Effect.exit)
        expect(Exit.isFailure(failed)).toBeTrue()
        expect(yield* db.get(sql`SELECT id FROM session WHERE id = ${root}`)).toEqual({ id: root })
        expect(yield* db.all(sql`SELECT request_id FROM session_deletion_control_receipt`)).toEqual([])
      }),
    )
  })
})

describe("Session administrative presentation", () => {
  test("rejects unsupported classifier and order versions before classification writes", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const sessionID = SessionSchema.ID.create()
        const messageID = SessionV1.MessageID.ascending()
        const partID = SessionV1.PartID.ascending()
        yield* insertSession(db, sessionID)
        const seal = SessionPresentation.createAdministrativeHistorySeal({
          kind: "offline_exact_restore",
          sourceFileFingerprint: "b".repeat(64),
          messages: [{ messageID, ordinal: 0, timeCreated: 10, parts: [{ partID, ordinal: 0 }] }],
        })

        for (const unsupported of [
          { ...seal, bundleVersion: 2 },
          { ...seal, classifierVersion: 2 },
          { ...seal, orderVersion: 2 },
        ]) {
          const result = yield* db
            .transaction((tx) =>
              SessionPresentation.beginAdministrativeHistory(
                tx,
                sessionID,
                unsupported as unknown as SessionPresentation.AdministrativeHistorySeal,
              ),
            )
            .pipe(Effect.exit)
          expect(Exit.isFailure(result)).toBeTrue()
          if (Exit.isFailure(result)) {
            expect(Cause.squash(result.cause)).toMatchObject({ reason: "unsupported_history_seal" })
          }
        }

        expect(yield* db.select().from(SessionAdministrativeHistoryTable).all().pipe(Effect.orDie)).toEqual([])
        expect(yield* db.select().from(SessionAdministrativeHistoryMessageTable).all().pipe(Effect.orDie)).toEqual([])
        expect(yield* db.select().from(SessionAdministrativeHistoryPartTable).all().pipe(Effect.orDie)).toEqual([])
      }),
    )
  })

  test("rolls back the Session and partial classification when final seal validation fails", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const sessionID = SessionSchema.ID.create()
        const messageID = SessionV1.MessageID.ascending()
        const partID = SessionV1.PartID.ascending()
        const seal = SessionPresentation.createAdministrativeHistorySeal({
          kind: "offline_exact_restore",
          sourceFileFingerprint: "c".repeat(64),
          messages: [{ messageID, ordinal: 0, timeCreated: 10, parts: [{ partID, ordinal: 0 }] }],
        })
        const result = yield* db
          .transaction((tx) =>
            Effect.gen(function* () {
              yield* tx.run(sql`
                INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
                VALUES (${sessionID}, ${ProjectV2.ID.global}, 'partial-seal', '/', 'Partial seal', 'test', 10, 10)
              `)
              yield* SessionPresentation.beginAdministrativeHistory(tx, sessionID, seal)
              yield* tx.run(sql`
                INSERT INTO message (id, session_id, time_created, time_updated, data)
                VALUES (
                  ${messageID}, ${sessionID}, 10, 10,
                  ${JSON.stringify({
                    role: "user",
                    time: { created: 10 },
                    agent: "repa",
                    model: { providerID: "test", modelID: "test" },
                  })}
                )
              `)
              yield* SessionPresentation.sealAdministrativeHistory(tx, sessionID, seal)
            }),
          )
          .pipe(Effect.exit)
        expect(Exit.isFailure(result)).toBeTrue()
        if (Exit.isFailure(result)) {
          expect(Cause.squash(result.cause)).toMatchObject({ reason: "history_membership_mismatch" })
        }
        expect(
          yield* db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get().pipe(Effect.orDie),
        ).toBeUndefined()
        expect(
          yield* db.select().from(MessageTable).where(eq(MessageTable.id, messageID)).get().pipe(Effect.orDie),
        ).toBeUndefined()
        expect(yield* db.select().from(SessionAdministrativeHistoryTable).all().pipe(Effect.orDie)).toEqual([])
        expect(
          yield* db
            .select()
            .from(SessionPresentationFrontierTable)
            .where(eq(SessionPresentationFrontierTable.session_id, sessionID))
            .get()
            .pipe(Effect.orDie),
        ).toBeUndefined()
      }),
    )
  })

  test("seals imported history as inert canonical presentation and reserves strict successor blocks", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const sessionID = SessionSchema.ID.create()
        const messageID = SessionV1.MessageID.ascending()
        const partID = SessionV1.PartID.ascending()
        const attachmentID = SessionV1.PartID.ascending()
        yield* insertSession(db, sessionID)
        const seal = SessionPresentation.createAdministrativeHistorySeal({
          kind: "offline_exact_restore",
          sourceFileFingerprint: "a".repeat(64),
          historyFrontierTime: 9_000_000_000_000,
          messages: [
            {
              messageID,
              ordinal: 0,
              timeCreated: 9_000_000_000_000,
              sourceTimeCreated: 9_000_000_000_000,
              parts: [{ partID, ordinal: 0, embeddedParts: [{ partID: attachmentID, ordinal: 0 }] }],
            },
          ],
        })
        yield* db.transaction((tx) => SessionPresentation.beginAdministrativeHistory(tx, sessionID, seal))
        yield* db.run(sql`
          INSERT INTO message (id, session_id, time_created, time_updated, data)
          VALUES (
            ${messageID}, ${sessionID}, 9000000000000, 9000000000000,
            ${JSON.stringify({
              role: "user",
              time: { created: 9_000_000_000_000 },
              agent: "repa",
              model: { providerID: "test", modelID: "test" },
            })}
          )
        `)
        yield* db.run(sql`
          INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
          VALUES (
            ${partID}, ${messageID}, ${sessionID}, 9000000000000, 9000000000000,
            ${JSON.stringify({
              type: "tool",
              callID: "sealed-history-tool",
              tool: "read",
              state: {
                status: "completed",
                input: {},
                output: "sealed history",
                title: "Historical read",
                metadata: {},
                time: { start: 9_000_000_000_000, end: 9_000_000_000_000 },
                attachments: [
                  {
                    id: attachmentID,
                    sessionID,
                    messageID,
                    type: "file",
                    mime: "text/plain",
                    filename: "history.txt",
                    url: "data:text/plain,sealed",
                  },
                ],
              },
            })}
          )
        `)
        yield* db.transaction((tx) => SessionPresentation.sealAdministrativeHistory(tx, sessionID, seal))
        yield* db.transaction((tx) => SessionPresentation.assertAdministrativeHistoryIntegrity(tx, sessionID))
        expect(
          yield* db
            .select()
            .from(SessionAdministrativeHistoryEmbeddedPartTable)
            .where(eq(SessionAdministrativeHistoryEmbeddedPartTable.part_id, attachmentID))
            .get()
            .pipe(Effect.orDie),
        ).toMatchObject({ parent_part_id: partID, embedded_ordinal: 0 })

        const times = yield* db.transaction((tx) =>
          SessionPresentation.reserveMessageBlock(tx, { sessionID, count: 3, floor: 1 }),
        )
        expect(times).toEqual([9_000_000_000_001, 9_000_000_000_002, 9_000_000_000_003])
        const localMessageID = SessionV1.MessageID.ascending()
        yield* db.run(sql`
          INSERT INTO message (id, session_id, time_created, time_updated, data)
          VALUES (
            ${localMessageID}, ${sessionID}, ${times[0]!}, ${times[0]!},
            ${JSON.stringify({
              role: "user",
              time: { created: times[0]! },
              agent: "repa",
              model: { providerID: "test", modelID: "test" },
            })}
          )
        `)
        expect(
          yield* db
            .select()
            .from(SessionPresentationFrontierTable)
            .where(eq(SessionPresentationFrontierTable.session_id, sessionID))
            .get()
            .pipe(Effect.orDie),
        ).toMatchObject({
          frontier_time: times[0],
          message_count: 2,
        })

        const changedImportedTime = yield* db
          .update(MessageTable)
          .set({ time_created: 1 })
          .where(eq(MessageTable.id, messageID))
          .run()
          .pipe(Effect.exit)
        expect(Exit.isFailure(changedImportedTime)).toBeTrue()
        expect(
          Exit.isFailure(
            yield* db
              .run(
                sql`
                INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
                VALUES (
                  ${attachmentID}, ${localMessageID}, ${sessionID}, ${times[0]!}, ${times[0]!},
                  ${JSON.stringify({ type: "text", text: "must not reuse an embedded imported identity" })}
                )
              `,
              )
              .pipe(Effect.exit),
          ),
        ).toBeTrue()
        expect(
          Exit.isFailure(yield* db.delete(PartTable).where(eq(PartTable.id, partID)).run().pipe(Effect.exit)),
        ).toBeTrue()
        yield* db.delete(MessageTable).where(eq(MessageTable.id, localMessageID)).run().pipe(Effect.orDie)
        expect(
          yield* db
            .select()
            .from(SessionPresentationFrontierTable)
            .where(eq(SessionPresentationFrontierTable.session_id, sessionID))
            .get()
            .pipe(Effect.orDie),
        ).toMatchObject({ frontier_time: times[0], message_count: 1 })
        yield* db.transaction((tx) => SessionPresentation.assertAdministrativeHistoryIntegrity(tx, sessionID))
        yield* db.delete(SessionTable).where(eq(SessionTable.id, sessionID)).run().pipe(Effect.orDie)
        expect(yield* db.select().from(SessionAdministrativeHistoryTable).all().pipe(Effect.orDie)).toEqual([])
      }),
    )
  })

  test("returns a typed no-effect failure when the successor frontier is exhausted", async () => {
    await withDatabase((db) =>
      Effect.gen(function* () {
        const sessionID = SessionSchema.ID.create()
        yield* insertSession(db, sessionID)
        yield* db
          .update(SessionPresentationFrontierTable)
          .set({ frontier_time: Number.MAX_SAFE_INTEGER })
          .where(eq(SessionPresentationFrontierTable.session_id, sessionID))
          .run()
          .pipe(Effect.orDie)
        const before = yield* db
          .select()
          .from(SessionPresentationFrontierTable)
          .where(eq(SessionPresentationFrontierTable.session_id, sessionID))
          .get()
          .pipe(Effect.orDie)
        const result = yield* db
          .transaction((tx) => SessionPresentation.reserveMessageBlock(tx, { sessionID, count: 1 }))
          .pipe(Effect.exit)
        expect(Exit.isFailure(result)).toBeTrue()
        if (Exit.isFailure(result)) expect(result.cause.toString()).toContain("FrontierUnrepresentableError")
        expect(
          yield* db
            .select()
            .from(SessionPresentationFrontierTable)
            .where(eq(SessionPresentationFrontierTable.session_id, sessionID))
            .get()
            .pipe(Effect.orDie),
        ).toEqual(before)
        expect(yield* db.all(sql`SELECT id FROM message WHERE session_id = ${sessionID}`)).toEqual([])
      }),
    )
  })
})
