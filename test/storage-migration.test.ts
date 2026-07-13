import { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  admitUserTurn,
  createSession,
  finishTurn,
  readSessionItems,
} from "../src/interaction/records"
import { openRepaDatabase } from "../src/storage/open-database"

const temporaryDirectories: string[] = []
const openDatabases: Database[] = []

afterEach(async () => {
  for (const database of openDatabases.splice(0).reverse()) {
    try {
      database.close()
    } catch {
      // A fixture may close a handle before reopening the same file.
    }
  }
  Bun.gc(true)
  await Bun.sleep(40)
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 40 })
  }
})

describe("ordered schema migrations", () => {
  test("schema 1 interaction history survives every ordered migration through schema 6", () => {
    const databasePath = temporaryDatabasePath()
    const database = openRepaDatabase(databasePath)
    openDatabases.push(database)
    createSession(database, { sessionId: "session:v1", createdAt: 1 })
    admitUserTurn(database, {
      sessionId: "session:v1",
      turnId: "turn:v1",
      itemId: "item:user:v1",
      content: "preserve me",
      createdAt: 2,
    })
    finishTurn(database, { turnId: "turn:v1", outcome: "completed", finishedAt: 3 })
    downgradeFixtureToSchema1(database)
    database.close()
    openDatabases.splice(openDatabases.indexOf(database), 1)

    const migrated = openRepaDatabase(databasePath)
    openDatabases.push(migrated)
    expect((migrated.query("PRAGMA user_version").get() as { user_version: number }).user_version)
      .toBe(6)
    expect(readSessionItems(migrated, "session:v1").map((item) => item.content)).toEqual([
      "preserve me",
    ])
    expect(tableNames(migrated)).toContain("course_view_revision")
    expect(tableNames(migrated)).toContain("course_view_transition")
    expect(tableNames(migrated)).toContain("agenda_revisit")
    expect(tableNames(migrated)).toContain("agenda_revisit_transition")
    expect(tableNames(migrated)).toContain("agenda_assignment")
    expect(tableNames(migrated)).toContain("agenda_assignment_transition")
    expect(columnNames(migrated, "agenda_revisit")).toContain("learner_role_constraint")
  })

  test("a failed schema 2 migration rolls every newly created table back", () => {
    const databasePath = temporaryDatabasePath()
    const database = openRepaDatabase(databasePath)
    openDatabases.push(database)
    downgradeFixtureToSchema1(database)
    database.exec("CREATE TABLE course (wrong_shape TEXT)")
    database.close()
    openDatabases.splice(openDatabases.indexOf(database), 1)

    expect(() => openRepaDatabase(databasePath)).toThrow()

    const inspected = new Database(databasePath)
    openDatabases.push(inspected)
    expect((inspected.query("PRAGMA user_version").get() as { user_version: number }).user_version)
      .toBe(1)
    expect(tableNames(inspected)).not.toContain("learning_space")
    expect(tableNames(inspected)).not.toContain("material_artifact")
    expect(tableNames(inspected)).toContain("course")
  })

  test("schema 2 upgrades through the Course View ledger into schema 6", () => {
    const databasePath = temporaryDatabasePath()
    const database = openRepaDatabase(databasePath)
    openDatabases.push(database)
    downgradeFixtureToSchema2(database)
    database.close()
    openDatabases.splice(openDatabases.indexOf(database), 1)

    const migrated = openRepaDatabase(databasePath)
    openDatabases.push(migrated)
    expect((migrated.query("PRAGMA user_version").get() as { user_version: number }).user_version)
      .toBe(6)
    expect(tableNames(migrated)).toContain("course_view_transition")
    expect(tableNames(migrated)).toContain("agenda_revisit")
  })

  test("schema 3 upgrades through constrained Agenda once and remains reopenable", () => {
    const databasePath = temporaryDatabasePath()
    const database = openRepaDatabase(databasePath)
    openDatabases.push(database)
    downgradeFixtureToSchema3(database)
    database.close()
    openDatabases.splice(openDatabases.indexOf(database), 1)

    const migrated = openRepaDatabase(databasePath)
    openDatabases.push(migrated)
    expect((migrated.query("PRAGMA user_version").get() as { user_version: number }).user_version)
      .toBe(6)
    expect(tableNames(migrated)).toContain("agenda_revisit")
    expect(tableNames(migrated)).toContain("agenda_revisit_transition")
    expect(indexNames(migrated)).toContain("open_agenda_revisit_by_course_and_time")
    expect(columnNames(migrated, "agenda_revisit")).toContain("learner_role_constraint")
    migrated.close()
    openDatabases.splice(openDatabases.indexOf(migrated), 1)

    const reopened = openRepaDatabase(databasePath)
    openDatabases.push(reopened)
    expect((reopened.query("PRAGMA user_version").get() as { user_version: number }).user_version)
      .toBe(6)
    expect(tableNames(reopened).filter((name) => name.startsWith("agenda_revisit"))).toEqual([
      "agenda_revisit",
      "agenda_revisit_transition",
    ])
  })

  test("a failed schema 4 migration rolls both Agenda tables and its version back", () => {
    const databasePath = temporaryDatabasePath()
    const database = openRepaDatabase(databasePath)
    openDatabases.push(database)
    downgradeFixtureToSchema3(database)
    database.exec(`
      CREATE TABLE agenda_v4_migration_blocker (id INTEGER);
      CREATE INDEX open_agenda_revisit_by_course_and_time
        ON agenda_v4_migration_blocker(id);
    `)
    database.close()
    openDatabases.splice(openDatabases.indexOf(database), 1)

    expect(() => openRepaDatabase(databasePath)).toThrow()

    const inspected = new Database(databasePath)
    openDatabases.push(inspected)
    expect((inspected.query("PRAGMA user_version").get() as { user_version: number }).user_version)
      .toBe(3)
    expect(tableNames(inspected)).not.toContain("agenda_revisit")
    expect(tableNames(inspected)).not.toContain("agenda_revisit_transition")
    expect(tableNames(inspected)).toContain("agenda_v4_migration_blocker")
    expect(indexNames(inspected)).toContain("open_agenda_revisit_by_course_and_time")
  })

  test("schema 4 adds the optional learner-role constraint without backfill", () => {
    const databasePath = temporaryDatabasePath()
    const database = openRepaDatabase(databasePath)
    openDatabases.push(database)
    downgradeFixtureToSchema4(database)
    database.close()
    openDatabases.splice(openDatabases.indexOf(database), 1)

    const migrated = openRepaDatabase(databasePath)
    openDatabases.push(migrated)
    expect((migrated.query("PRAGMA user_version").get() as { user_version: number }).user_version)
      .toBe(6)
    expect(columnNames(migrated, "agenda_revisit")).toContain("learner_role_constraint")
  })

  test("a failed schema 5 migration retains schema 4", () => {
    const databasePath = temporaryDatabasePath()
    const database = openRepaDatabase(databasePath)
    openDatabases.push(database)
    downgradeFixtureToSchema4(database)
    database.exec("ALTER TABLE agenda_revisit ADD COLUMN learner_role_constraint INTEGER")
    database.close()
    openDatabases.splice(openDatabases.indexOf(database), 1)

    expect(() => openRepaDatabase(databasePath)).toThrow()

    const inspected = new Database(databasePath)
    openDatabases.push(inspected)
    expect((inspected.query("PRAGMA user_version").get() as { user_version: number }).user_version)
      .toBe(4)
    expect(columnNames(inspected, "agenda_revisit")).toContain("learner_role_constraint")
  })

  test("schema 5 reaches the retired Assignment compatibility tombstone and remains reopenable", () => {
    const databasePath = temporaryDatabasePath()
    const database = openRepaDatabase(databasePath)
    openDatabases.push(database)
    downgradeFixtureToSchema5(database)
    database.close()
    openDatabases.splice(openDatabases.indexOf(database), 1)

    const migrated = openRepaDatabase(databasePath)
    openDatabases.push(migrated)
    expect((migrated.query("PRAGMA user_version").get() as { user_version: number }).user_version)
      .toBe(6)
    expect(tableNames(migrated)).toContain("agenda_assignment")
    expect(tableNames(migrated)).toContain("agenda_assignment_transition")
    expect(indexNames(migrated)).toContain("open_agenda_assignment_by_deadline")
    expect(columnNames(migrated, "agenda_assignment")).not.toContain("course_id")
    expect(columnNames(migrated, "agenda_assignment")).toEqual(expect.arrayContaining([
      "creation_title",
      "creation_due_at",
      "creation_due_at_iso",
      "creation_interpretation_time_zone",
    ]))
    migrated.close()
    openDatabases.splice(openDatabases.indexOf(migrated), 1)

    const reopened = openRepaDatabase(databasePath)
    openDatabases.push(reopened)
    expect((reopened.query("PRAGMA user_version").get() as { user_version: number }).user_version)
      .toBe(6)
  })

  test("a failed compatibility-tombstone migration retains schema 5 without partial tables", () => {
    const databasePath = temporaryDatabasePath()
    const database = openRepaDatabase(databasePath)
    openDatabases.push(database)
    downgradeFixtureToSchema5(database)
    database.exec("CREATE TABLE agenda_assignment (wrong_shape TEXT)")
    database.close()
    openDatabases.splice(openDatabases.indexOf(database), 1)

    expect(() => openRepaDatabase(databasePath)).toThrow()

    const inspected = new Database(databasePath)
    openDatabases.push(inspected)
    expect((inspected.query("PRAGMA user_version").get() as { user_version: number }).user_version)
      .toBe(5)
    expect(tableNames(inspected)).not.toContain("agenda_assignment_transition")
    expect(tableNames(inspected)).toContain("agenda_assignment")
  })
})

function temporaryDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), "repa-migration-"))
  temporaryDirectories.push(directory)
  return join(directory, "repa.sqlite")
}

function downgradeFixtureToSchema1(database: Database) {
  database.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE agenda_assignment_transition;
    DROP TABLE agenda_assignment;
    DROP TABLE agenda_revisit_transition;
    DROP TABLE agenda_revisit;
    DROP TABLE course_view_transition;
    DROP TABLE current_learning_focus;
    DROP TABLE course_route_progress;
    DROP TABLE material_alignment;
    DROP TABLE active_course_view;
    DROP TABLE course_view_item;
    DROP TABLE course_item;
    DROP TABLE course_view_revision;
    DROP TABLE course;
    DROP TABLE material_revision;
    DROP TABLE material_artifact;
    DROP TABLE learning_space;
    PRAGMA user_version = 1;
    PRAGMA foreign_keys = ON;
  `)
}

function downgradeFixtureToSchema2(database: Database) {
  database.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE agenda_assignment_transition;
    DROP TABLE agenda_assignment;
    DROP TABLE agenda_revisit_transition;
    DROP TABLE agenda_revisit;
    DROP TABLE course_view_transition;
    PRAGMA user_version = 2;
    PRAGMA foreign_keys = ON;
  `)
}

function downgradeFixtureToSchema3(database: Database) {
  database.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE agenda_assignment_transition;
    DROP TABLE agenda_assignment;
    DROP TABLE agenda_revisit_transition;
    DROP TABLE agenda_revisit;
    PRAGMA user_version = 3;
    PRAGMA foreign_keys = ON;
  `)
}

function downgradeFixtureToSchema4(database: Database) {
  database.exec(`
    DROP TABLE agenda_assignment_transition;
    DROP TABLE agenda_assignment;
    ALTER TABLE agenda_revisit DROP COLUMN learner_role_constraint;
    PRAGMA user_version = 4;
  `)
}

function downgradeFixtureToSchema5(database: Database) {
  database.exec(`
    DROP TABLE agenda_assignment_transition;
    DROP TABLE agenda_assignment;
    PRAGMA user_version = 5;
  `)
}

function tableNames(database: Database) {
  const rows = database
    .query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as Array<{ name: string }>
  return rows.map((row) => row.name)
}

function indexNames(database: Database) {
  const rows = database
    .query("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
    .all() as Array<{ name: string }>
  return rows.map((row) => row.name)
}

function columnNames(database: Database, table: string) {
  const rows = database.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return rows.map((row) => row.name)
}
