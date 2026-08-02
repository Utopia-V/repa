import { afterAll, describe, expect, test } from "bun:test"
import { eq, sql } from "drizzle-orm"
import { Effect, Exit, Layer } from "effect"
import { mkdtempSync, rmSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Artifact } from "@opencode-ai/core/artifact"
import { ArtifactTable } from "@opencode-ai/core/artifact/sql"
import { ContentRoot } from "@opencode-ai/core/content-root"
import { Course } from "@opencode-ai/core/course"
import { CourseTable, CourseViewTable } from "@opencode-ai/core/course/sql"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { LearnerGoalRevisionTable } from "@opencode-ai/core/learner-goal/sql"
import { LearnerNavigation } from "@opencode-ai/core/learner-navigation"
import { DefaultCoursePreferenceTransitionTable } from "@opencode-ai/core/learner-navigation/sql"
import { LearningBootstrap } from "@opencode-ai/core/learning-bootstrap"
import {
  LearningBootstrapCommitSealTable,
  LearningBootstrapDispositionTable,
  LearningBootstrapEffectTable,
  LearningCourseMaterialAdoptionTable,
} from "@opencode-ai/core/learning-bootstrap/sql"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { LearningCommandInvocationTable, LearningCommandReceiptTable } from "@opencode-ai/core/learning-command/sql"
import { LearningFrontier } from "@opencode-ai/core/learning-frontier"
import { MaterialMap } from "@opencode-ai/core/material-map"
import { ModelV2 } from "@opencode-ai/core/model"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Representation } from "@opencode-ai/core/representation"
import { PDFTextProfile } from "@opencode-ai/core/representation/pdf-text-profile"
import { RetainedSteeringTransitionTable } from "@opencode-ai/core/retained-steering/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { MessageTable, PartTable, SessionTable } from "@opencode-ai/core/session/sql"
import { TurnLifecycle } from "@opencode-ai/core/turn/turn"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Turn } from "@opencode-ai/schema/turn"
import { testEffect } from "./lib/effect"

const database = Database.layerFromPath(":memory:").pipe(Layer.orDie)
const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      MaterialMap.node,
      MaterialMap.currentUseReaderNode,
      Course.node,
      Representation.node,
      Representation.currentUseReaderNode,
      Artifact.node,
      ContentRoot.node,
      Database.node,
    ]),
    [[Database.node, database]],
  ),
)
const representationDirectory = mkdtempSync(join(tmpdir(), "repa-bootstrap-representation-db-"))
const representationIt = testEffect(
  LayerNode.compile(
    LayerNode.group([
      MaterialMap.node,
      MaterialMap.currentUseReaderNode,
      Course.node,
      Representation.node,
      Representation.currentUseReaderNode,
      Artifact.node,
      ContentRoot.node,
      Database.node,
    ]),
    [[Database.node, Database.layerFromPath(join(representationDirectory, "learner-home.db")).pipe(Layer.orDie)]],
  ),
)
afterAll(() => rmSync(representationDirectory, { recursive: true, force: true }))
const model = { modelID: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }

describe("learning bootstrap", () => {
  test("canonicalizes one closed bounded change set and rejects administrative or widened payloads", () => {
    expect(LearningBootstrap.canonicalizeCommand({ course: { type: "new", title: "  Linear algebra  " } })).toEqual({
      schemaVersion: 1,
      course: { type: "new", title: "Linear algebra" },
      selection: { type: "preserve" },
      materials: [],
      maps: [],
      alignments: [],
      anchor: { type: "preserve" },
    })

    const invalid = [
      { course: { type: "existing", courseID: "course" } },
      { course: { type: "new", title: "Topic" }, time: 1 },
      { course: { type: "new", title: "Topic" }, schemaVersion: 1 },
      {
        course: { type: "new", title: "Topic" },
        route: {
          type: "new_view",
          key: "route",
          name: "Tutor proposal",
          authorship: "tutor_initiated",
          revision: { items: [{ key: "one", title: "One" }] },
        },
        selection: { type: "set", target: { type: "route" } },
      },
      {
        course: { type: "new", title: "Topic" },
        materials: [
          { type: "local", key: "a", path: "a.txt", authority: { type: "active_workspace" } },
          { type: "local", key: "b", path: "b.txt", authority: { type: "active_workspace" } },
        ],
      },
      {
        course: { type: "new", title: "Topic" },
        materials: [
          { type: "local", key: "a", path: "a.txt", authority: { type: "one_operation" } },
          {
            type: "artifact",
            key: "b",
            artifactID: "artifact",
            revisionID: "revision",
            attribution: { type: "recorded" },
            read: { path: "b.txt", authority: { type: "one_operation" } },
          },
        ],
      },
      {
        course: { type: "new", title: "Topic" },
        materials: [{ type: "read", key: "transient", path: "notes.txt" }],
      },
      {
        course: { type: "new", title: "Topic" },
        materials: [{ type: "search", key: "transient", query: "linear algebra" }],
      },
      {
        course: { type: "new", title: "Topic" },
        materials: [{ type: "attachment", key: "transient", attachmentID: "attachment" }],
      },
      {
        course: { type: "new", title: "Topic" },
        materials: [{ type: "web", key: "transient", url: "https://example.invalid/material" }],
      },
      {
        course: { type: "new", title: "Topic" },
        materials: [{ type: "local", key: "source", path: "a.txt", authority: { type: "active_workspace" } }],
        maps: [
          {
            key: "map",
            materialKey: "source",
            authorship: "learner_requested",
            outline: [
              {
                key: "root",
                title: "Root",
                selectors: [{ key: "all", coordinate: { kind: "whole_target.v1", generatedID: "forbidden" } }],
              },
            ],
          },
        ],
      },
    ]
    for (const command of invalid) {
      expect(() => LearningBootstrap.canonicalizeCommand(command as never)).toThrow()
    }
  })

  it.effect("commits Course-only creation, then orders physical replay before semantic duplicate and conflict", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const artifacts = yield* Artifact.Service
      const roots = yield* ContentRoot.Service
      const maps = yield* MaterialMap.Service
      const command = { course: { type: "new" as const, title: "Operating systems" } }
      const conflictCommand = { course: { type: "new" as const, title: "Distributed systems" } }
      const invocations = yield* seedAgentTurn(db, "replay", [command, command, conflictCommand], 1_000)
      const first = invocations[0]!

      const reserved = yield* db.transaction((tx) =>
        LearningBootstrap.reserve(tx, { ...first, settlement: { time: 1_002, order: 1 } }),
      )
      expect(reserved).toMatchObject({
        type: "admitted",
        candidate: { agentAction: { kind: "root", lineage: [] }, materialized: { course: { type: "new" } } },
      })
      if (reserved.type !== "admitted") return yield* Effect.die("Expected admitted bootstrap")
      expect(
        yield* db.transaction((tx) =>
          LearningBootstrap.reserve(tx, { ...first, settlement: { time: 1_002, order: 1 } }),
        ),
      ).toEqual(reserved)
      const physicalConflict = yield* db
        .transaction((tx) =>
          LearningBootstrap.reserve(tx, {
            ...first,
            command: conflictCommand,
            settlement: { time: 1_002, order: 1 },
          }),
        )
        .pipe(Effect.exit)
      expect(Exit.isFailure(physicalConflict)).toBe(true)

      yield* db.transaction((tx) =>
        LearningBootstrap.settlePolicy(tx, {
          partID: first.envelope.partID,
          outcome: "policy_allow",
          policyBasis: { source: "test", rule: "allow" },
          time: 1_003,
          order: 2,
        }),
      )
      const prepared = yield* LearningBootstrap.prepareExecution(reserved.candidate, {
        database: db,
        contentRoots: roots,
        artifacts,
        maps,
      })
      const settled = yield* db.transaction((tx) =>
        LearningBootstrap.settle(tx, {
          partID: first.envelope.partID,
          prepared,
          owners: { courses, maps },
          settlement: { time: 1_004, order: 3 },
        }),
      )
      expect(settled).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "applied",
          bootstrapKind: "learning_bootstrap",
          schemaVersion: 1,
          children: [
            { kind: "course", outcome: "changed", detail: "created" },
            { kind: "selection", outcome: "no_change", selectedRevisionID: null },
            { kind: "anchor", outcome: "no_change" },
          ],
          acknowledgement: {
            outcome: "applied",
            course: { title: "Operating systems" },
            anchor: { headID: null, target: null, usability: { usable: false, cause: "absent" } },
          },
          frontierSequence: 1,
        },
      })
      if (settled.settlement.outcome !== "applied") return yield* Effect.die("Expected applied bootstrap")
      expect(yield* courses.listViews(settled.settlement.courseID as Course.CourseID)).toMatchObject({
        items: [],
      })
      expect(
        yield* db.transaction((tx) =>
          LearningBootstrap.reserve(tx, { ...first, settlement: { time: 1_004, order: 3 } }),
        ),
      ).toEqual({ type: "replay", settlement: settled.settlement, candidate: reserved.candidate })

      yield* db.transaction((tx) =>
        TurnLifecycle.settleTool(tx, {
          turnID: first.envelope.turnID,
          partID: first.envelope.partID,
          state: "completed",
          time: 1_004,
        }),
      )
      yield* admitNextTool(db, invocations[1]!, 1_005)
      const duplicate = yield* db.transaction((tx) =>
        LearningBootstrap.reserve(tx, { ...invocations[1]!, settlement: { time: 1_005, order: 4 } }),
      )
      expect(duplicate).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "already_applied",
          effectID: settled.settlement.effectID,
          receiptID: settled.settlement.receiptID,
          settlementTime: 1_005,
          settlementOrder: 4,
        },
        semanticTerminal: { outcome: "already_applied", existingEffectID: settled.settlement.effectID },
      })
      yield* db.transaction((tx) =>
        TurnLifecycle.settleTool(tx, {
          turnID: invocations[1]!.envelope.turnID,
          partID: invocations[1]!.envelope.partID,
          state: "completed",
          time: 1_005,
        }),
      )
      yield* admitNextTool(db, invocations[2]!, 1_006)
      const conflict = yield* db.transaction((tx) =>
        LearningBootstrap.reserve(tx, { ...invocations[2]!, settlement: { time: 1_006, order: 5 } }),
      )
      expect(conflict).toMatchObject({
        type: "settled",
        settlement: { outcome: "error", code: "semantic_conflict", settlementTime: 1_006 },
        semanticTerminal: { outcome: "semantic_conflict", existingEffectID: settled.settlement.effectID },
      })

      expect(yield* db.select().from(LearningBootstrapEffectTable).all()).toHaveLength(1)
      expect(yield* db.select().from(LearningCommandReceiptTable).all()).toHaveLength(1)
      expect(yield* db.select().from(LearningBootstrapCommitSealTable).all()).toHaveLength(1)
      expect(yield* db.transaction((tx) => LearningFrontier.read(tx))).toEqual({ sequence: 1, time: 1_004 })
      expect(yield* db.select().from(CourseViewTable).all()).toEqual([])
      expect(yield* db.select().from(ArtifactTable).all()).toEqual([])
      expect(yield* db.select().from(LearningCourseMaterialAdoptionTable).all()).toEqual([])
      expect(yield* db.select().from(DefaultCoursePreferenceTransitionTable).all()).toEqual([])
      expect(yield* db.select().from(LearnerGoalRevisionTable).all()).toEqual([])
      expect(yield* db.select().from(RetainedSteeringTransitionTable).all()).toEqual([])
      expect(yield* db.all(sql.raw("PRAGMA foreign_key_check"))).toEqual([])

      expect(
        yield* db.transaction((tx) =>
          LearningBootstrap.readInvocationVersion(tx, {
            partID: first.envelope.partID,
            assistantMessageID: first.envelope.assistantMessageID,
            providerCallID: first.envelope.providerCallID,
          }),
        ),
      ).toMatchObject({
        version: 1,
        disposition: "candidate_v1",
        status: "applied",
        capabilityOutcome: "policy_allow",
      })
    }),
  )

  it.effect("preserves all-current no-change and composes route, selection, anchor, and correction mappings", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const artifacts = yield* Artifact.Service
      const roots = yield* ContentRoot.Service
      const maps = yield* MaterialMap.Service
      const base = Date.now() + 1_000
      const course = yield* courses.createCourse({ title: "Graph algorithms" })
      const initialFrontier = yield* db.transaction((tx) => LearningFrontier.read(tx))

      const unchangedInvocation = (yield* seedAgentTurn(
        db,
        "no-change",
        [{ course: { type: "existing", courseID: course.id, title: course.title } }],
        base,
      ))[0]!
      const unchanged = yield* reserveAllowed(db, unchangedInvocation, base + 2, 1)
      const unchangedPrepared = yield* LearningBootstrap.prepareExecution(unchanged, {
        database: db,
        contentRoots: roots,
        artifacts,
        maps,
      })
      const unchangedResult = yield* db.transaction((tx) =>
        LearningBootstrap.settle(tx, {
          partID: unchangedInvocation.envelope.partID,
          prepared: unchangedPrepared,
          owners: { courses, maps },
          settlement: { time: base + 4, order: 3 },
        }),
      )
      expect(unchangedResult).toMatchObject({
        type: "settled",
        settlement: {
          outcome: "no_change",
          courseID: course.id,
          acknowledgement: {
            outcome: "no_change",
            anchor: { usability: { usable: false, cause: "absent" } },
          },
        },
      })
      expect(yield* db.select().from(LearningBootstrapEffectTable).all()).toEqual([])
      expect(yield* db.transaction((tx) => LearningFrontier.read(tx))).toEqual(initialFrontier)

      const routeCommand = {
        course: { type: "existing" as const, courseID: course.id, title: course.title },
        route: {
          type: "new_view" as const,
          key: "main",
          name: "Main route",
          authorship: "learner_requested" as const,
          revision: {
            items: [
              { key: "root", title: "Graph foundations" },
              { key: "search", title: "Graph search", parentKey: "root" },
              { key: "shortest", title: "Shortest paths", parentKey: "root" },
            ],
          },
        },
        selection: { type: "set" as const, target: { type: "route" as const } },
        anchor: { type: "set" as const, target: { type: "route_item" as const, itemKey: "shortest" } },
      }
      const routeInvocation = (yield* seedAgentTurn(db, "route", [routeCommand], base + 10))[0]!
      const routeCandidate = yield* reserveAllowed(db, routeInvocation, base + 12, 4)
      const routePrepared = yield* LearningBootstrap.prepareExecution(routeCandidate, {
        database: db,
        contentRoots: roots,
        artifacts,
        maps,
      })
      const routeResult = yield* db.transaction((tx) =>
        LearningBootstrap.settle(tx, {
          partID: routeInvocation.envelope.partID,
          prepared: routePrepared,
          owners: { courses, maps },
          settlement: { time: base + 14, order: 6 },
        }),
      )
      expect(routeResult).toMatchObject({
        settlement: {
          outcome: "applied",
          acknowledgement: {
            view: { name: "Main route", authorship: "learner_requested" },
            anchor: { usability: { usable: true } },
          },
          children: [
            { kind: "course", outcome: "no_change" },
            { kind: "route", outcome: "changed", authorship: "learner_requested" },
            { kind: "selection", outcome: "changed" },
            { kind: "anchor", outcome: "changed" },
          ],
        },
      })
      if (routeResult.settlement.outcome !== "applied" || !("bootstrapKind" in routeResult.settlement)) {
        return yield* Effect.die("Expected route bootstrap")
      }
      const routeAcknowledgement = routeResult.settlement.acknowledgement as LearningBootstrap.Acknowledgement
      const routeView = routeAcknowledgement.view!
      const firstItems = yield* courses.listRevisionItems(course.id, routeView.id, routeView.revisionID)
      const firstByTitle = new Map(firstItems.items.map((item) => [item.title, item.itemID]))
      expect(yield* db.transaction((tx) => LearnerNavigation.readCurrentAnchor(tx, course.id))).toMatchObject({
        target: { revisionID: routeView.revisionID, itemID: firstByTitle.get("Shortest paths") },
        usability: { usable: true },
      })

      const splitCommand = {
        course: { type: "existing" as const, courseID: course.id },
        route: {
          type: "successor_revision" as const,
          key: "main-v2",
          viewID: routeView.id,
          predecessorRevisionID: routeView.revisionID,
          authorship: "learner_requested" as const,
          revision: {
            items: [
              { key: "root-v2", title: "Graph foundations" },
              { key: "search-v2", title: "Graph search" },
              { key: "shortest-basic", title: "Single-source shortest paths" },
              { key: "shortest-all", title: "All-pairs shortest paths" },
            ],
            mappings: [
              {
                kind: "preserve" as const,
                sourceItemIDs: [firstByTitle.get("Graph foundations")!],
                targetKeys: ["root-v2"],
              },
              {
                kind: "preserve" as const,
                sourceItemIDs: [firstByTitle.get("Graph search")!],
                targetKeys: ["search-v2"],
              },
              {
                kind: "split" as const,
                sourceItemIDs: [firstByTitle.get("Shortest paths")!],
                targetKeys: ["shortest-basic", "shortest-all"],
              },
            ],
          },
        },
        selection: { type: "set" as const, target: { type: "route" as const } },
        anchor: { type: "preserve" as const },
      }
      const splitInvocation = (yield* seedAgentTurn(db, "split", [splitCommand], base + 20))[0]!
      const splitCandidate = yield* reserveAllowed(db, splitInvocation, base + 22, 7)
      const splitPrepared = yield* LearningBootstrap.prepareExecution(splitCandidate, {
        database: db,
        contentRoots: roots,
        artifacts,
        maps,
      })
      const splitResult = yield* db.transaction((tx) =>
        LearningBootstrap.settle(tx, {
          partID: splitInvocation.envelope.partID,
          prepared: splitPrepared,
          owners: { courses, maps },
          settlement: { time: base + 24, order: 9 },
        }),
      )
      expect(splitResult).toMatchObject({
        settlement: {
          outcome: "applied",
          acknowledgement: { anchor: { usability: { usable: false, cause: "working_selection_mismatch" } } },
        },
      })
      if (splitResult.settlement.outcome !== "applied" || !("bootstrapKind" in splitResult.settlement)) {
        return yield* Effect.die("Expected split bootstrap")
      }
      const splitView = (splitResult.settlement.acknowledgement as LearningBootstrap.Acknowledgement).view!
      expect(
        (yield* courses.listMappingGroups(course.id, splitView.id, splitView.revisionID)).items.map(
          (group) => group.kind,
        ),
      ).toEqual(["preserve", "preserve", "split"])
      const splitItems = yield* courses.listRevisionItems(course.id, splitView.id, splitView.revisionID)
      const splitByTitle = new Map(splitItems.items.map((item) => [item.title, item.itemID]))

      const mergeCommand = {
        course: { type: "existing" as const, courseID: course.id },
        route: {
          type: "successor_revision" as const,
          key: "main-v3",
          viewID: splitView.id,
          predecessorRevisionID: splitView.revisionID,
          authorship: "learner_supplied" as const,
          revision: {
            items: [
              { key: "root-v3", title: "Graph foundations" },
              { key: "combined", title: "Search and single-source paths" },
              { key: "shortest-all-v3", title: "All-pairs shortest paths" },
            ],
            mappings: [
              {
                kind: "preserve" as const,
                sourceItemIDs: [splitByTitle.get("Graph foundations")!],
                targetKeys: ["root-v3"],
              },
              {
                kind: "merge" as const,
                sourceItemIDs: [splitByTitle.get("Graph search")!, splitByTitle.get("Single-source shortest paths")!],
                targetKeys: ["combined"],
              },
              {
                kind: "preserve" as const,
                sourceItemIDs: [splitByTitle.get("All-pairs shortest paths")!],
                targetKeys: ["shortest-all-v3"],
              },
            ],
          },
        },
        selection: { type: "set" as const, target: { type: "route" as const } },
      }
      const mergeInvocation = (yield* seedAgentTurn(db, "merge", [mergeCommand], base + 30))[0]!
      const mergeCandidate = yield* reserveAllowed(db, mergeInvocation, base + 32, 10)
      const mergePrepared = yield* LearningBootstrap.prepareExecution(mergeCandidate, {
        database: db,
        contentRoots: roots,
        artifacts,
        maps,
      })
      const mergeResult = yield* db.transaction((tx) =>
        LearningBootstrap.settle(tx, {
          partID: mergeInvocation.envelope.partID,
          prepared: mergePrepared,
          owners: { courses, maps },
          settlement: { time: base + 34, order: 12 },
        }),
      )
      if (mergeResult.settlement.outcome !== "applied" || !("bootstrapKind" in mergeResult.settlement)) {
        return yield* Effect.die("Expected merge bootstrap")
      }
      const mergeView = (mergeResult.settlement.acknowledgement as LearningBootstrap.Acknowledgement).view!
      expect(
        (yield* courses.listMappingGroups(course.id, mergeView.id, mergeView.revisionID)).items.map(
          (group) => group.kind,
        ),
      ).toEqual(["preserve", "merge", "preserve"])

      const tutorCommand = {
        course: { type: "existing" as const, courseID: course.id },
        route: {
          type: "new_view" as const,
          key: "examples",
          name: "Tutor-proposed examples route",
          authorship: "tutor_initiated" as const,
          revision: { items: [{ key: "worked", title: "Worked graph examples" }] },
        },
      }
      const tutorInvocation = (yield* seedAgentTurn(db, "tutor-view", [tutorCommand], base + 40))[0]!
      const tutorCandidate = yield* reserveAllowed(db, tutorInvocation, base + 42, 13)
      const tutorPrepared = yield* LearningBootstrap.prepareExecution(tutorCandidate, {
        database: db,
        contentRoots: roots,
        artifacts,
        maps,
      })
      const tutorResult = yield* db.transaction((tx) =>
        LearningBootstrap.settle(tx, {
          partID: tutorInvocation.envelope.partID,
          prepared: tutorPrepared,
          owners: { courses, maps },
          settlement: { time: base + 44, order: 15 },
        }),
      )
      expect(tutorResult).toMatchObject({
        settlement: {
          outcome: "applied",
          children: [
            { kind: "course", outcome: "no_change" },
            { kind: "route", outcome: "changed", authorship: "tutor_initiated" },
            { kind: "selection", outcome: "no_change", selectedRevisionID: mergeView.revisionID },
            { kind: "anchor", outcome: "no_change" },
          ],
          acknowledgement: {
            view: { name: "Tutor-proposed examples route", authorship: "tutor_initiated" },
            selectedRevisionID: mergeView.revisionID,
          },
        },
      })
      expect((yield* courses.listViews(course.id)).items).toHaveLength(2)
      expect((yield* courses.getCourse(course.id)).selection.revisionID).toBe(mergeView.revisionID)
      expect(yield* db.select().from(LearningBootstrapEffectTable).all()).toHaveLength(4)
      expect(yield* db.transaction((tx) => LearningFrontier.read(tx))).toEqual({
        sequence: initialFrontier.sequence + 4,
        time: base + 44,
      })
      expect(yield* db.all(sql.raw("PRAGMA foreign_key_check"))).toEqual([])
    }),
  )

  it.effect("settles allow, ask, deny, correction, cancellation, and crash recovery without invented effects", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const artifacts = yield* Artifact.Service
      const roots = yield* ContentRoot.Service
      const maps = yield* MaterialMap.Service
      const base = Date.now() + 2_000
      const cases: readonly Readonly<{
        name: string
        capability: LearningBootstrap.CapabilityOutcome
        code: string
        recover: boolean
        issue: boolean
        allow: boolean
      }>[] = [
        {
          name: "policy-deny",
          capability: "policy_deny",
          code: "permission_rejected",
          recover: false,
          issue: false,
          allow: false,
        },
        {
          name: "prompt-deny",
          capability: "prompted_deny",
          code: "permission_rejected",
          recover: false,
          issue: true,
          allow: false,
        },
        {
          name: "prompt-correct",
          capability: "prompted_correct",
          code: "permission_corrected",
          recover: false,
          issue: true,
          allow: false,
        },
        {
          name: "prompt-cancel",
          capability: "prompted_cancel",
          code: "cancelled",
          recover: false,
          issue: true,
          allow: false,
        },
        {
          name: "recover-no-issue",
          capability: "not_evaluated",
          code: "interrupted",
          recover: true,
          issue: false,
          allow: false,
        },
        {
          name: "recover-prompt",
          capability: "prompted_abort",
          code: "interrupted",
          recover: true,
          issue: true,
          allow: false,
        },
        {
          name: "recover-allow",
          capability: "policy_allow",
          code: "interrupted",
          recover: true,
          issue: false,
          allow: true,
        },
      ]

      yield* Effect.forEach(
        cases,
        (item, index) =>
          Effect.gen(function* () {
            const time = base + index * 20
            const invocation = (yield* seedAgentTurn(
              db,
              `capability-${item.name}`,
              [{ course: { type: "new", title: `Course ${item.name}` } }],
              time,
            ))[0]!
            const reserved = yield* db.transaction((tx) =>
              LearningBootstrap.reserve(tx, { ...invocation, settlement: { time: time + 2, order: index * 10 + 1 } }),
            )
            if (reserved.type !== "admitted") return yield* Effect.die(`Expected ${item.name} candidate`)
            const requestID = PermissionV1.ID.ascending()
            if (item.capability === "policy_deny" || item.allow) {
              yield* db.transaction((tx) =>
                LearningBootstrap.settlePolicy(tx, {
                  partID: invocation.envelope.partID,
                  outcome: item.allow ? "policy_allow" : "policy_deny",
                  policyBasis: { source: "test", case: item.name },
                  time: time + 3,
                  order: index * 10 + 2,
                }),
              )
            } else if (item.issue || item.capability.startsWith("prompted_")) {
              yield* db.transaction((tx) =>
                LearningBootstrap.issueCapabilityPrompt(tx, {
                  partID: invocation.envelope.partID,
                  requestID,
                  policyBasis: { source: "test", case: item.name },
                  shownScope: { course: `Course ${item.name}` },
                  time: time + 3,
                  order: index * 10 + 2,
                }),
              )
              if (!item.recover) {
                yield* db.transaction((tx) =>
                  LearningBootstrap.settlePrompt(tx, {
                    partID: invocation.envelope.partID,
                    requestID,
                    outcome: item.capability as
                      | "prompted_allow"
                      | "prompted_deny"
                      | "prompted_correct"
                      | "prompted_cancel",
                    reply:
                      item.capability === "prompted_cancel"
                        ? { requestID, reply: "cancel" }
                        : item.capability === "prompted_correct"
                          ? { requestID, reply: "reject", message: "Teach without saving" }
                          : { requestID, reply: "reject" },
                    time: time + 4,
                    order: index * 10 + 3,
                  }),
                )
              }
            }

            const result = item.recover
              ? yield* db.transaction((tx) =>
                  LearningBootstrap.recover(tx, {
                    partID: invocation.envelope.partID,
                    settlement: { time: time + 6, order: index * 10 + 5 },
                  }),
                )
              : yield* Effect.gen(function* () {
                  const prepared = yield* LearningBootstrap.prepareExecution(reserved.candidate, {
                    database: db,
                    contentRoots: roots,
                    artifacts,
                    maps,
                  })
                  return yield* db.transaction((tx) =>
                    LearningBootstrap.settle(tx, {
                      partID: invocation.envelope.partID,
                      prepared,
                      owners: { courses, maps },
                      settlement: { time: time + 6, order: index * 10 + 5 },
                    }),
                  )
                })
            expect(result).toMatchObject({
              type: "settled",
              settlement: { outcome: "error", code: item.code },
            })
            expect(
              yield* db.transaction((tx) =>
                LearningBootstrap.readInvocationVersion(tx, {
                  partID: invocation.envelope.partID,
                  assistantMessageID: invocation.envelope.assistantMessageID,
                  providerCallID: invocation.envelope.providerCallID,
                }),
              ),
            ).toMatchObject({
              disposition: "candidate_v1",
              status: "error",
              capabilityOutcome: item.capability,
              ...(item.issue ? { permissionRequestID: requestID } : {}),
            })
          }),
        { discard: true },
      )

      expect(yield* db.select().from(CourseTable).all()).toEqual([])
      expect(yield* db.select().from(LearningBootstrapEffectTable).all()).toEqual([])
      expect(yield* db.select().from(LearningCommandReceiptTable).all()).toEqual([])
      expect(yield* db.transaction((tx) => LearningFrontier.read(tx))).toEqual({ sequence: 0, time: 0 })
      expect(yield* db.all(sql.raw("PRAGMA foreign_key_check"))).toEqual([])
    }),
  )

  it.effect(
    "atomically adopts one local source through each exact Gate 10 authority arm and composes Map alignment",
    () =>
      Effect.gen(function* () {
        if (process.platform !== "win32") return
        const directory = yield* Effect.acquireRelease(
          Effect.promise(() => mkdtemp(join(tmpdir(), "repa-bootstrap-"))),
          (path) => Effect.promise(() => rm(path, { recursive: true, force: true })).pipe(Effect.ignore),
        )
        const rootedPath = join(directory, "rooted.txt")
        const workspacePath = join(directory, "workspace.txt")
        const operationPath = join(directory, "operation.txt")
        yield* Effect.promise(() =>
          Promise.all([
            writeFile(rootedPath, "Rooted bootstrap material"),
            writeFile(workspacePath, "Workspace bootstrap material"),
            writeFile(operationPath, "One-operation bootstrap material"),
          ]),
        )
        const db = (yield* Database.Service).db
        const courses = yield* Course.Service
        const artifacts = yield* Artifact.Service
        const roots = yield* ContentRoot.Service
        const maps = yield* MaterialMap.Service
        const base = Date.now() + 3_000
        const proposal = yield* roots.propose(directory)
        const root = yield* roots.approve({
          proposal,
          approval: ContentRoot.LearnerApproval.contentRoot(proposal, "Gate 17 explicit material root"),
        })

        const rootedCommand = {
          course: { type: "new" as const, title: "Rooted learning" },
          route: {
            type: "new_view" as const,
            key: "route",
            name: "Material route",
            authorship: "learner_requested" as const,
            revision: { items: [{ key: "item", title: "Study the source" }] },
          },
          selection: { type: "set" as const, target: { type: "route" as const } },
          materials: [
            {
              type: "local" as const,
              key: "source",
              path: rootedPath,
              authority: { type: "content_root" as const, contentRootID: root.id },
            },
          ],
          maps: [
            {
              key: "map",
              materialKey: "source",
              authorship: "learner_requested" as const,
              outline: [
                {
                  key: "root",
                  title: "Whole source",
                  selectors: [{ key: "all", coordinate: { kind: "whole_target.v1" as const } }],
                },
              ],
            },
          ],
          alignments: [
            {
              key: "alignment",
              mapKey: "map",
              selectorKey: "all",
              authorship: "learner_requested" as const,
              course: { type: "route_item" as const, itemKey: "item" },
              reason: "The learner explicitly attached this exact source to the route item",
            },
          ],
          anchor: { type: "set" as const, target: { type: "route_item" as const, itemKey: "item" } },
        }
        const rootedInvocation = (yield* seedAgentTurn(db, "rooted-local", [rootedCommand], base))[0]!
        const rootedCandidate = yield* reserveAllowed(db, rootedInvocation, base + 2, 1)
        const rootedPrepared = yield* LearningBootstrap.prepareExecution(rootedCandidate, {
          database: db,
          contentRoots: roots,
          artifacts,
          maps,
        })
        const rootedResult = yield* db.transaction((tx) =>
          LearningBootstrap.settle(tx, {
            partID: rootedInvocation.envelope.partID,
            prepared: rootedPrepared,
            owners: { courses, maps },
            settlement: { time: base + 4, order: 3 },
          }),
        )
        expect(rootedResult).toMatchObject({
          settlement: {
            outcome: "applied",
            children: [
              { kind: "course", outcome: "changed" },
              { kind: "route", outcome: "changed" },
              { kind: "selection", outcome: "changed" },
              {
                kind: "material",
                key: "source",
                outcome: "changed",
                materialTarget: {
                  type: "artifact",
                  sourceAuthority: {
                    kind: "content_root",
                    relativePath: "rooted.txt",
                    contentRoot: { contentRootID: root.id },
                  },
                },
              },
              { kind: "map", key: "map", outcome: "changed" },
              { kind: "alignment", key: "alignment", outcome: "changed" },
              { kind: "anchor", outcome: "changed" },
            ],
            acknowledgement: { anchor: { usability: { usable: true } } },
          },
        })
        if (rootedResult.settlement.outcome !== "applied" || !("bootstrapKind" in rootedResult.settlement)) {
          return yield* Effect.die("Expected rooted bootstrap")
        }
        const rootedChildren = rootedResult.settlement.children as readonly LearningBootstrap.ChildResult[]
        const material = rootedChildren.find((child) => child.kind === "material")!
        const map = rootedChildren.find((child) => child.kind === "map")!
        const alignment = rootedChildren.find((child) => child.kind === "alignment")!
        expect(yield* maps.getMap(map.id as MaterialMap.MapID)).toMatchObject({
          id: map.id,
          target: {
            type: "artifact",
            effectiveArtifactID:
              material.materialTarget?.type === "artifact" ? material.materialTarget.artifactID : undefined,
            authorization: { kind: "content_root", contentRoot: { contentRootID: root.id } },
          },
        })
        expect(yield* maps.getAlignment(alignment.id as MaterialMap.AlignmentID)).toMatchObject({
          id: alignment.id,
          mapID: map.id,
          projection: { status: "content_unverified" },
        })

        const authorityCases = [
          {
            suffix: "workspace-local",
            title: "Workspace learning",
            path: workspacePath,
            authority: { type: "active_workspace" as const },
            preparation: {
              activeWorkspace: ContentRoot.ActiveWorkspaceRead.trusted(directory, "workspace-gate17-test"),
            },
            expected: { kind: "active_workspace", workspaceIdentity: "workspace-gate17-test" },
          },
          {
            suffix: "operation-local",
            title: "Operation learning",
            path: operationPath,
            authority: { type: "one_operation" as const },
            preparation: {
              oneOperation: ContentRoot.OneOperationRead.trusted(
                operationPath,
                "operation-gate17-test",
                "learner allowed this exact operation",
              ),
            },
            expected: { kind: "one_operation", operationIdentity: "operation-gate17-test" },
          },
        ] as const
        yield* Effect.forEach(
          authorityCases,
          (item, index) =>
            Effect.gen(function* () {
              const invocation = (yield* seedAgentTurn(
                db,
                item.suffix,
                [
                  {
                    course: { type: "new", title: item.title },
                    materials: [{ type: "local", key: "source", path: item.path, authority: item.authority }],
                  },
                ],
                base + 20 + index * 20,
              ))[0]!
              const candidate = yield* reserveAllowed(db, invocation, base + 22 + index * 20, 4 + index * 3)
              if (item.authority.type === "one_operation") {
                const mismatch = yield* LearningBootstrap.prepareExecution(candidate, {
                  database: db,
                  contentRoots: roots,
                  artifacts,
                  maps,
                  oneOperation: ContentRoot.OneOperationRead.trusted(
                    workspacePath,
                    "wrong-operation",
                    "wrong exact path",
                  ),
                }).pipe(Effect.exit)
                expect(Exit.isFailure(mismatch)).toBe(true)
              }
              const prepared = yield* LearningBootstrap.prepareExecution(candidate, {
                database: db,
                contentRoots: roots,
                artifacts,
                maps,
                ...item.preparation,
              })
              const result = yield* db.transaction((tx) =>
                LearningBootstrap.settle(tx, {
                  partID: invocation.envelope.partID,
                  prepared,
                  owners: { courses, maps },
                  settlement: { time: base + 24 + index * 20, order: 6 + index * 3 },
                }),
              )
              expect(result).toMatchObject({
                settlement: {
                  outcome: "applied",
                  children: [
                    { kind: "course", outcome: "changed" },
                    { kind: "selection", outcome: "no_change" },
                    {
                      kind: "material",
                      materialTarget: { type: "artifact", sourceAuthority: item.expected },
                    },
                    { kind: "anchor", outcome: "no_change" },
                  ],
                },
              })
            }),
          { discard: true },
        )

        expect(yield* db.select().from(ArtifactTable).all()).toHaveLength(3)
        expect(yield* db.select().from(LearningCourseMaterialAdoptionTable).all()).toHaveLength(3)
        expect(yield* db.select().from(LearningBootstrapEffectTable).all()).toHaveLength(3)
        expect(yield* db.all(sql.raw("PRAGMA foreign_key_check"))).toEqual([])
      }),
  )

  it.effect("rolls back the closed set on source mutation, child fault, and stale Course ownership", () =>
    Effect.gen(function* () {
      if (process.platform !== "win32") return
      const directory = yield* Effect.acquireRelease(
        Effect.promise(() => mkdtemp(join(tmpdir(), "repa-bootstrap-rollback-"))),
        (path) => Effect.promise(() => rm(path, { recursive: true, force: true })).pipe(Effect.ignore),
      )
      const sourcePath = join(directory, "source.txt")
      yield* Effect.promise(() => writeFile(sourcePath, "Initial exact source"))
      const db = (yield* Database.Service).db
      const courses = yield* Course.Service
      const artifacts = yield* Artifact.Service
      const roots = yield* ContentRoot.Service
      const maps = yield* MaterialMap.Service
      const base = Date.now() + 6_000
      const proposal = yield* roots.propose(directory)
      const root = yield* roots.approve({
        proposal,
        approval: ContentRoot.LearnerApproval.contentRoot(proposal, "Gate 17 rollback material root"),
      })
      const localCommand = (title: string) =>
        ({
          course: { type: "new", title },
          materials: [
            {
              type: "local",
              key: "source",
              path: sourcePath,
              authority: { type: "content_root", contentRootID: root.id },
            },
          ],
          maps: [
            {
              key: "map",
              materialKey: "source",
              authorship: "learner_requested",
              outline: [
                {
                  key: "whole",
                  title: "Whole source",
                  selectors: [{ key: "all", coordinate: { kind: "whole_target.v1" } }],
                },
              ],
            },
          ],
        }) satisfies LearningBootstrap.Command

      const sourceInvocation = (yield* seedAgentTurn(db, "source-race", [localCommand("Source race")], base))[0]!
      const sourceCandidate = yield* reserveAllowed(db, sourceInvocation, base + 2, 1)
      const sourcePrepared = yield* LearningBootstrap.prepareExecution(sourceCandidate, {
        database: db,
        contentRoots: roots,
        artifacts,
        maps,
      })
      yield* Effect.promise(() => writeFile(sourcePath, "Changed bytes that invalidate the prepared observation"))
      const sourceFailure = yield* db
        .transaction((tx) =>
          LearningBootstrap.settle(tx, {
            partID: sourceInvocation.envelope.partID,
            prepared: sourcePrepared,
            owners: { courses, maps },
            settlement: { time: base + 4, order: 3 },
          }),
        )
        .pipe(Effect.flip)
      expect(sourceFailure).toMatchObject({ _tag: "ContentRoot.PathError", reason: "mutated" })
      const sourceTerminal = yield* db.transaction((tx) =>
        LearningBootstrap.settleFailure(tx, {
          partID: sourceInvocation.envelope.partID,
          error: sourceFailure,
          settlement: { time: base + 5, order: 4 },
        }),
      )
      expect(sourceTerminal).toMatchObject({ settlement: { outcome: "error", code: "source_unavailable" } })
      expect(
        yield* db.get(sql`SELECT
          (SELECT count(*) FROM course) AS courses,
          (SELECT count(*) FROM artifact) AS artifacts,
          (SELECT count(*) FROM learning_course_material_adoption) AS adoptions,
          (SELECT count(*) FROM material_map) AS maps,
          (SELECT count(*) FROM learning_bootstrap_effect) AS effects`),
      ).toEqual({ courses: 0, artifacts: 0, adoptions: 0, maps: 0, effects: 0 })

      yield* Effect.promise(() => writeFile(sourcePath, "Stable source for injected fault"))
      const faultInvocation = (yield* seedAgentTurn(db, "child-fault", [localCommand("Child fault")], base + 20))[0]!
      const faultCandidate = yield* reserveAllowed(db, faultInvocation, base + 22, 5)
      const faultPrepared = yield* LearningBootstrap.prepareExecution(faultCandidate, {
        database: db,
        contentRoots: roots,
        artifacts,
        maps,
      })
      const beforeFault = yield* db.transaction((tx) => LearningFrontier.read(tx))
      const injected = new MaterialMap.InvalidTransitionError({ detail: "injected Map commit boundary fault" })
      const failingMaps = {
        ...maps,
        commitMapInTransaction: () => Effect.fail(injected),
      } satisfies MaterialMap.Interface
      const childFailure = yield* db
        .transaction((tx) =>
          LearningBootstrap.settle(tx, {
            partID: faultInvocation.envelope.partID,
            prepared: faultPrepared,
            owners: { courses, maps: failingMaps },
            settlement: { time: base + 24, order: 7 },
          }),
        )
        .pipe(Effect.flip)
      expect(childFailure).toBe(injected)
      expect(yield* db.transaction((tx) => LearningFrontier.read(tx))).toEqual(beforeFault)
      expect(
        yield* db.get(sql`SELECT
          (SELECT count(*) FROM course) AS courses,
          (SELECT count(*) FROM artifact) AS artifacts,
          (SELECT count(*) FROM learning_course_material_adoption) AS adoptions,
          (SELECT count(*) FROM material_map) AS maps,
          (SELECT count(*) FROM learning_bootstrap_effect) AS effects`),
      ).toEqual({ courses: 0, artifacts: 0, adoptions: 0, maps: 0, effects: 0 })
      expect(
        yield* db.transaction((tx) =>
          LearningBootstrap.settleFailure(tx, {
            partID: faultInvocation.envelope.partID,
            error: childFailure,
            settlement: { time: base + 25, order: 8 },
          }),
        ),
      ).toMatchObject({ settlement: { outcome: "error", code: "validation_error" } })

      const current = yield* courses.createCourse({ title: "Current Course" })
      const staleCommand = {
        course: { type: "existing" as const, courseID: current.id, title: "Bootstrap correction" },
      }
      const staleInvocation = (yield* seedAgentTurn(db, "stale-course", [staleCommand], base + 40))[0]!
      const staleCandidate = yield* reserveAllowed(db, staleInvocation, base + 42, 9)
      const stalePrepared = yield* LearningBootstrap.prepareExecution(staleCandidate, {
        database: db,
        contentRoots: roots,
        artifacts,
        maps,
      })
      yield* courses.correctCourse({
        courseID: current.id,
        title: "Learner correction won",
        expectedCourseVersion: current.stateVersion,
      })
      const staleFailure = yield* db
        .transaction((tx) =>
          LearningBootstrap.settle(tx, {
            partID: staleInvocation.envelope.partID,
            prepared: stalePrepared,
            owners: { courses, maps },
            settlement: { time: base + 44, order: 11 },
          }),
        )
        .pipe(Effect.flip)
      expect(staleFailure).toMatchObject({ _tag: "Course.ConflictError" })
      expect(
        yield* db.transaction((tx) =>
          LearningBootstrap.settleFailure(tx, {
            partID: staleInvocation.envelope.partID,
            error: staleFailure,
            settlement: { time: base + 45, order: 12 },
          }),
        ),
      ).toMatchObject({ settlement: { outcome: "error", code: "stale" } })
      expect(yield* courses.getCourse(current.id)).toMatchObject({ title: "Learner correction won", stateVersion: 1 })
      expect(yield* db.select().from(LearningBootstrapEffectTable).all()).toEqual([])
      expect(yield* db.all(sql.raw("PRAGMA foreign_key_check"))).toEqual([])
    }),
  )

  representationIt.effect(
    "adopts exact Artifact and Representation revisions while separately committed preparation stays truthful",
    () =>
      Effect.gen(function* () {
        if (process.platform !== "win32") return
        const directory = yield* Effect.acquireRelease(
          Effect.promise(() => mkdtemp(join(tmpdir(), "repa-bootstrap-staging-"))),
          (path) => Effect.promise(() => rm(path, { recursive: true, force: true })).pipe(Effect.ignore),
        )
        const sourcePath = join(directory, "source.pdf")
        yield* Effect.promise(() => writeFile(sourcePath, "Original PDF-like source bytes"))
        const db = (yield* Database.Service).db
        const courses = yield* Course.Service
        const artifacts = yield* Artifact.Service
        const roots = yield* ContentRoot.Service
        const maps = yield* MaterialMap.Service
        const representations = yield* Representation.Service
        const base = Date.now() + 9_000
        const proposal = yield* roots.propose(directory)
        const root = yield* roots.approve({
          proposal,
          approval: ContentRoot.LearnerApproval.contentRoot(proposal, "Gate 17 staged representation root"),
        })
        const firstRead = yield* roots.read({ contentRootID: root.id, relativePath: "source.pdf" })
        if (firstRead.observation.result !== "present") return yield* Effect.die("Expected source fixture")
        const presentFirstRead = { ...firstRead, observation: firstRead.observation }
        const artifact = yield* artifacts.admit({
          location: Artifact.CanonicalLocation.trusted(presentFirstRead.observation.descriptor.canonicalPath),
          observation: {
            result: "present",
            fingerprint: presentFirstRead.observation.fingerprint,
            mediaType: presentFirstRead.observation.mediaType,
            observer: Artifact.Observer.trusted("gate17-separate-artifact-stage", 1),
            timeObserved: presentFirstRead.observation.timeObserved,
          },
          authority: Artifact.Admission.learnerInstruction("gate17-separate-artifact-stage", 1),
        })
        if (!artifact.source.currentRevisionID || !artifact.source.revisionAttribution || !artifact.source.descriptor) {
          return yield* Effect.die("Expected exact admitted Artifact Revision")
        }
        const firstRevision = yield* artifacts.getRevision(
          artifact.id,
          artifact.source.currentRevisionID,
          artifact.source.revisionAttribution,
        )
        const profile = PDFTextProfile.encode([
          { page: 1, items: [{ text: "First readable page", lineBreakAfter: true }] },
          { page: 2, items: [{ text: "Second readable page", lineBreakAfter: false }] },
        ])
        if (!profile.ok) return yield* Effect.die("Expected readable profile fixture")
        const acceptRepresentation = (
          currentArtifact: Artifact.ArtifactInfo,
          revision: Artifact.RevisionInfo,
          read: ContentRoot.ReadResult & {
            readonly observation: Extract<ContentRoot.ReadResult["observation"], { readonly result: "present" }>
          },
          suffix: string,
        ) =>
          representations.accept({
            effectiveArtifactID: currentArtifact.id,
            sourceRevisionID: revision.id,
            attribution: revision.attribution,
            recipe: Representation.localPDFRecipe,
            authority: Representation.ConversionAuthority.deterministic(
              `gate17-representation:${suffix}`,
              "learner requested readable material before bootstrap",
            ),
            candidateRevisionID: Representation.createRevisionID(),
            sourceProof: {
              ordinary: {
                effectiveArtifactID: currentArtifact.id,
                dispositionVersion: currentArtifact.dispositionVersion,
                currentRevisionID: revision.id,
                attribution: revision.attribution,
                lineageVersion: currentArtifact.lineageVersion,
                fingerprint: revision.fingerprint,
                mediaType: currentArtifact.source.descriptor!.mediaType,
              },
              sourceVersion: currentArtifact.source.sourceVersion,
              authorization: read.authorization,
              relativePath: "source.pdf",
              descriptor: read.observation.descriptor,
              timeObserved: read.observation.timeObserved,
            },
            candidate: {
              kind: "local_pdf",
              runIdentity: `gate17-representation-run:${suffix}`,
              provenance: Representation.localPDFRecipe,
              input: revision.fingerprint,
              bytes: profile.value.bytes,
              diagnostics: [],
              usage: {
                kind: "local_pdf",
                pageCount: 2,
                textItemCount: 2,
                operatorCount: 0,
                imagePaintOperations: 0,
                signalPageCount: 0,
                profileByteLength: profile.value.bytes.byteLength,
              },
            },
            timeAccepted: read.observation.timeObserved + 1,
          })
        const firstRepresentation = yield* acceptRepresentation(artifact, firstRevision, presentFirstRead, "first")

        const representationCommand = {
          course: { type: "new" as const, title: "Readable representation" },
          materials: [
            {
              type: "representation" as const,
              key: "readable",
              representationRevisionID: firstRepresentation.id,
            },
          ],
          maps: [
            {
              key: "pages",
              materialKey: "readable",
              authorship: "learner_requested" as const,
              outline: [
                {
                  key: "page-one",
                  title: "First page",
                  selectors: [
                    {
                      key: "page-one-selector",
                      coordinate: { kind: "pdf_page_range.v1" as const, startPage: 1, endPage: 1 },
                    },
                  ],
                },
              ],
            },
          ],
        }
        const representationInvocation = (yield* seedAgentTurn(
          db,
          "representation-adoption",
          [representationCommand],
          base,
        ))[0]!
        const representationCandidate = yield* reserveAllowed(db, representationInvocation, base + 2, 1)
        const representationPrepared = yield* LearningBootstrap.prepareExecution(representationCandidate, {
          database: db,
          contentRoots: roots,
          artifacts,
          maps,
        })
        const representationResult = yield* db.transaction((tx) =>
          LearningBootstrap.settle(tx, {
            partID: representationInvocation.envelope.partID,
            prepared: representationPrepared,
            owners: { courses, maps },
            settlement: { time: base + 4, order: 3 },
          }),
        )
        expect(representationResult).toMatchObject({
          settlement: {
            outcome: "applied",
            children: [
              { kind: "course", outcome: "changed" },
              { kind: "selection", outcome: "no_change" },
              {
                kind: "material",
                materialTarget: { type: "representation", representationRevisionID: firstRepresentation.id },
              },
              { kind: "map", outcome: "changed" },
              { kind: "anchor", outcome: "no_change" },
            ],
          },
        })

        yield* Effect.promise(() => writeFile(sourcePath, "New bytes at the already admitted exact location"))
        const localCommand = {
          course: { type: "new" as const, title: "Fresh same-path observation" },
          materials: [
            {
              type: "local" as const,
              key: "fresh",
              path: sourcePath,
              authority: { type: "content_root" as const, contentRootID: root.id },
            },
          ],
        }
        const localInvocation = (yield* seedAgentTurn(db, "same-path-observation", [localCommand], base + 20))[0]!
        const localCandidate = yield* reserveAllowed(db, localInvocation, base + 22, 4)
        const localPrepared = yield* LearningBootstrap.prepareExecution(localCandidate, {
          database: db,
          contentRoots: roots,
          artifacts,
          maps,
        })
        const localResult = yield* db.transaction((tx) =>
          LearningBootstrap.settle(tx, {
            partID: localInvocation.envelope.partID,
            prepared: localPrepared,
            owners: { courses, maps },
            settlement: { time: base + 24, order: 6 },
          }),
        )
        expect(localResult).toMatchObject({
          settlement: {
            outcome: "applied",
            children: [
              { kind: "course", outcome: "changed" },
              { kind: "selection", outcome: "no_change" },
              {
                kind: "material",
                outcome: "changed",
                materialTarget: { type: "artifact", artifactID: artifact.id },
              },
              { kind: "anchor", outcome: "no_change" },
            ],
          },
        })
        const refreshed = yield* artifacts.getArtifact(artifact.id)
        if (
          !refreshed.source.currentRevisionID ||
          !refreshed.source.revisionAttribution ||
          !refreshed.source.descriptor
        ) {
          return yield* Effect.die("Expected refreshed Artifact Revision")
        }
        expect(refreshed.source.currentRevisionID).not.toBe(firstRevision.id)

        const historicalCommand = {
          course: { type: "new" as const, title: "Exact historical revision" },
          materials: [
            {
              type: "artifact" as const,
              key: "historical",
              artifactID: artifact.id,
              revisionID: firstRevision.id,
              attribution: firstRevision.attribution,
            },
          ],
        }
        const historicalInvocation = (yield* seedAgentTurn(
          db,
          "historical-revision",
          [historicalCommand],
          base + 40,
        ))[0]!
        const historicalCandidate = yield* reserveAllowed(db, historicalInvocation, base + 42, 7)
        const historicalPrepared = yield* LearningBootstrap.prepareExecution(historicalCandidate, {
          database: db,
          contentRoots: roots,
          artifacts,
          maps,
        })
        expect(
          yield* db.transaction((tx) =>
            LearningBootstrap.settle(tx, {
              partID: historicalInvocation.envelope.partID,
              prepared: historicalPrepared,
              owners: { courses, maps },
              settlement: { time: base + 44, order: 9 },
            }),
          ),
        ).toMatchObject({
          settlement: {
            outcome: "applied",
            children: [
              { kind: "course", outcome: "changed" },
              { kind: "selection", outcome: "no_change" },
              {
                kind: "material",
                materialTarget: {
                  type: "artifact",
                  artifactID: artifact.id,
                  revisionID: firstRevision.id,
                  attribution: firstRevision.attribution,
                },
              },
              { kind: "anchor", outcome: "no_change" },
            ],
          },
        })

        const secondRead = yield* roots.read({ contentRootID: root.id, relativePath: "source.pdf" })
        if (secondRead.observation.result !== "present") return yield* Effect.die("Expected refreshed source fixture")
        const presentSecondRead = { ...secondRead, observation: secondRead.observation }
        const currentRevision = yield* artifacts.getRevision(
          refreshed.id,
          refreshed.source.currentRevisionID,
          refreshed.source.revisionAttribution,
        )
        const secondRepresentation = yield* acceptRepresentation(
          refreshed,
          currentRevision,
          presentSecondRead,
          "second",
        )
        const existing = yield* courses.createCourse({ title: "Staged result remains" })
        const failingCommand = {
          course: { type: "existing" as const, courseID: existing.id, title: "Bootstrap should lose" },
          materials: [
            {
              type: "representation" as const,
              key: "staged",
              representationRevisionID: secondRepresentation.id,
            },
          ],
        }
        const failingInvocation = (yield* seedAgentTurn(db, "staged-failure", [failingCommand], base + 60))[0]!
        const failingCandidate = yield* reserveAllowed(db, failingInvocation, base + 62, 10)
        const failingPrepared = yield* LearningBootstrap.prepareExecution(failingCandidate, {
          database: db,
          contentRoots: roots,
          artifacts,
          maps,
        })
        yield* courses.correctCourse({
          courseID: existing.id,
          title: "Learner correction won before bootstrap",
          expectedCourseVersion: existing.stateVersion,
        })
        const failure = yield* db
          .transaction((tx) =>
            LearningBootstrap.settle(tx, {
              partID: failingInvocation.envelope.partID,
              prepared: failingPrepared,
              owners: { courses, maps },
              settlement: { time: base + 64, order: 12 },
            }),
          )
          .pipe(Effect.flip)
        expect(failure).toMatchObject({ _tag: "Course.ConflictError" })
        expect(
          yield* db.transaction((tx) =>
            LearningBootstrap.settleFailure(tx, {
              partID: failingInvocation.envelope.partID,
              error: failure,
              settlement: { time: base + 65, order: 13 },
            }),
          ),
        ).toMatchObject({ settlement: { outcome: "error", code: "stale" } })
        expect(yield* representations.get(secondRepresentation.id)).toMatchObject({
          id: secondRepresentation.id,
          availability: { disposition: "available" },
        })
        expect(
          yield* db.get(sql`SELECT
          (SELECT count(*) FROM artifact) AS artifacts,
          (SELECT count(*) FROM representation_revision) AS representations,
          (SELECT count(*) FROM learning_course_material_adoption) AS adoptions,
          (SELECT count(*) FROM learning_course_material_adoption WHERE course_id = ${existing.id}) AS failedAdoptions,
          (SELECT count(*) FROM material_map) AS maps,
          (SELECT count(*) FROM learning_bootstrap_effect) AS effects`),
        ).toEqual({ artifacts: 1, representations: 2, adoptions: 3, failedAdoptions: 0, maps: 1, effects: 3 })
        expect(yield* db.all(sql.raw("PRAGMA foreign_key_check"))).toEqual([])
      }),
  )
})

function seedAgentTurn(
  db: Database.Interface["db"],
  suffix: string,
  commands: readonly LearningBootstrap.Command[],
  time: number,
) {
  return Effect.gen(function* () {
    const sessionID = SessionSchema.ID.make(`ses_bootstrap_${suffix}`)
    const userMessageID = SessionV1.MessageID.ascending(`msg_bootstrap_user_${suffix}`)
    const userPartID = SessionV1.PartID.ascending(`prt_bootstrap_user_${suffix}`)
    const assistantMessageID = SessionV1.MessageID.ascending(`msg_bootstrap_assistant_${suffix}`)
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
        data: { type: "text", text: `ordinary learner request ${suffix}` } as (typeof PartTable.$inferInsert)["data"],
        time_created: time,
        time_updated: time,
      })
      .run()
    const occurrence = yield* db.transaction((tx) =>
      Effect.gen(function* () {
        const admitted = yield* LearningCommand.Occurrence.admit(tx, {
          admission: LearningCommand.LearnerAdmission.interactive(),
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
          limits: { model: 1, tool: commands.length },
          envelope: { kind: "ordinary_agent", text: `ordinary learner request ${suffix}` },
          policyBasis: { source: "learning-bootstrap-test" },
          timeAdmitted: time,
        })
        return admitted
      }),
    )
    yield* db
      .insert(MessageTable)
      .values({
        id: assistantMessageID,
        session_id: sessionID,
        data: assistantData(userMessageID, time + 1),
        time_created: time + 1,
        time_updated: time + 1,
      })
      .run()
    const candidates = commands.map((command, index) => ({
      partID: SessionV1.PartID.ascending(`prt_bootstrap_tool_${suffix}_${index}`),
      callID: `call-bootstrap-${suffix}-${index}`,
      tool: LearningBootstrap.UPDATE_LEARNING_COURSE_CAPABILITY,
      envelope: { command },
    }))
    yield* Effect.forEach(
      candidates,
      (candidate, index) =>
        db
          .insert(PartTable)
          .values({
            id: candidate.partID,
            session_id: sessionID,
            message_id: assistantMessageID,
            data: {
              type: "tool",
              tool: candidate.tool,
              callID: candidate.callID,
              state: { status: "pending", input: commands[index], raw: JSON.stringify(commands[index]) },
            } as (typeof PartTable.$inferInsert)["data"],
            time_created: time + 1,
            time_updated: time + 1,
          })
          .run(),
      { discard: true },
    )
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* TurnLifecycle.admitModel(tx, {
          turnID,
          sessionID,
          assistantMessageID,
          requestEnvelope: { kind: "ordinary_agent" },
          contextFingerprint: new Bun.CryptoHasher("sha256").update(`context:${suffix}`).digest("hex"),
          snapshotFrontier: yield* LearningFrontier.read(tx),
          timeAdmitted: time + 1,
        })
        yield* TurnLifecycle.sealCandidateSet(tx, {
          turnID,
          sessionID,
          assistantMessageID,
          candidates,
          timeSealed: time + 1,
        })
        yield* TurnLifecycle.settleModel(tx, {
          turnID,
          assistantMessageID,
          state: "completed",
          time: time + 1,
        })
        yield* Effect.forEach(
          candidates.slice(0, 1),
          (candidate) =>
            Effect.gen(function* () {
              yield* TurnLifecycle.admitTool(tx, {
                turnID,
                sessionID,
                assistantMessageID,
                partID: candidate.partID,
                timeAdmitted: time + 1,
              })
              yield* TurnLifecycle.consumeToolFrontier(tx, {
                partID: candidate.partID,
                frontier: yield* LearningFrontier.read(tx),
              })
            }),
          { discard: true },
        )
      }),
    )
    return commands.map(
      (command, index) =>
        ({
          envelope: {
            occurrenceID: occurrence.id,
            turnID,
            inputID,
            sessionID,
            parentUserMessageID: userMessageID,
            assistantMessageID,
            partID: candidates[index]!.partID,
            providerCallID: candidates[index]!.callID,
            emissionOrdinal: index,
            capabilityIdentity: LearningBootstrap.UPDATE_LEARNING_COURSE_CAPABILITY,
            capabilityVersion: LearningBootstrap.UPDATE_LEARNING_COURSE_VERSION,
            authorizationBasis: "agent_action",
            timeAdmitted: time + 1,
          },
          command,
        }) satisfies LearningBootstrap.Invocation,
    )
  }).pipe(Effect.orDie)
}

function admitNextTool(db: Database.Interface["db"], invocation: LearningBootstrap.Invocation, time: number) {
  return db.transaction((tx) =>
    Effect.gen(function* () {
      yield* TurnLifecycle.admitTool(tx, {
        turnID: invocation.envelope.turnID,
        sessionID: invocation.envelope.sessionID,
        assistantMessageID: invocation.envelope.assistantMessageID,
        partID: invocation.envelope.partID,
        timeAdmitted: time,
      })
      yield* TurnLifecycle.consumeToolFrontier(tx, {
        partID: invocation.envelope.partID,
        frontier: yield* LearningFrontier.read(tx),
      })
    }),
  )
}

function reserveAllowed(
  db: Database.Interface["db"],
  invocation: LearningBootstrap.Invocation,
  time: number,
  order: number,
) {
  return Effect.gen(function* () {
    const reserved = yield* db.transaction((tx) =>
      LearningBootstrap.reserve(tx, { ...invocation, settlement: { time, order } }),
    )
    if (reserved.type !== "admitted") return yield* Effect.die("Expected admitted bootstrap candidate")
    yield* db.transaction((tx) =>
      LearningBootstrap.settlePolicy(tx, {
        partID: invocation.envelope.partID,
        outcome: "policy_allow",
        policyBasis: { source: "test", rule: "allow" },
        time: time + 1,
        order: order + 1,
      }),
    )
    return reserved.candidate
  })
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
