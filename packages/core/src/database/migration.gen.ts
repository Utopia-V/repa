import type { DatabaseMigration } from "./migration"

export const migrations = (
  await Promise.all([
    import("./migration/repa/20260714191244_course_view_authority"),
    import("./migration/repa/20260716045209_learning_command_settlement"),
    import("./migration/repa/20260716152016_source_artifact_authority"),
    import("./migration/repa/20260716191911_content_root_authority"),
    import("./migration/repa/20260717141402_readable_representation_lineage"),
  ])
).map((module) => module.default) satisfies DatabaseMigration.Migration[]
