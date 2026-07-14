import type { DatabaseMigration } from "./migration"

export const migrations = (await Promise.all([import("./migration/repa/20260714191244_course_view_authority")])).map(
  (module) => module.default,
) satisfies DatabaseMigration.Migration[]
