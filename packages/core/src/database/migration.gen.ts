import type { DatabaseMigration } from "./migration"

export const migrations = (
  await Promise.all([
    import("./migration/repa/20260714191244_course_view_authority"),
    import("./migration/repa/20260716045209_learning_command_settlement"),
    import("./migration/repa/20260716152016_source_artifact_authority"),
    import("./migration/repa/20260716191911_content_root_authority"),
    import("./migration/repa/20260717141402_readable_representation_lineage"),
    import("./migration/repa/20260718134404_gate12_durable_turn"),
    import("./migration/repa/20260719104356_material_map_alignment"),
    import("./migration/repa/20260719155243_learner_navigation"),
    import("./migration/repa/20260720113159_gate15_retained_steering"),
    import("./migration/repa/20260720200330_gate16_learner_goals"),
    import("./migration/repa/20260727121200_domain_neutral_learning_command_ledger"),
    import("./migration/repa/20260729144139_gate14_default_course_v2"),
    import("./migration/repa/20260730115237_gate14_agent_native_default_course"),
    import("./migration/repa/20260731120541_gate08_message_diff_projection"),
    import("./migration/repa/20260731144324_gate16_agent_native_learner_goals"),
  ])
).map((module) => module.default) satisfies DatabaseMigration.Migration[]
