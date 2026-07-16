import type { DatabaseMigration } from "./migration"

export const migrations = (
  await Promise.all([
    import("./migration/repa/20260714191244_course_view_authority"),
    import("./migration/repa/20260716045209_learning_command_settlement"),
  ])
).map((module) => module.default) satisfies DatabaseMigration.Migration[]
