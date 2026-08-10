export * as LearnerStateJudgmentConstraintSchema from "./constraint-schema-v1"

const immutable = [
  "learner_state_judgment",
  "learner_state_judgment_disposition",
  "learner_state_judgment_capability_issue",
  "learner_state_judgment_capability_settlement",
  "learner_state_judgment_effect",
  "learner_state_judgment_no_change_seal",
  "learner_state_judgment_revision",
  "learner_state_judgment_anchor",
  "learner_state_judgment_basis",
  "learner_state_judgment_commit_seal",
] as const

const durable = [
  "learner_state_judgment",
  "learner_state_judgment_effect",
  "learner_state_judgment_no_change_seal",
  "learner_state_judgment_revision",
  "learner_state_judgment_anchor",
  "learner_state_judgment_basis",
  "learner_state_judgment_commit_seal",
] as const

function sealedInvocation(partID: string) {
  return `(EXISTS (
      SELECT 1
      FROM learner_state_judgment_effect AS sealed_effect
      JOIN learner_state_judgment_commit_seal AS sealed_commit ON sealed_commit.effect_id = sealed_effect.id
      WHERE sealed_effect.invocation_part_id = ${partID}
    ) OR EXISTS (
      SELECT 1 FROM learner_state_judgment_no_change_seal AS sealed_no_change
      WHERE sealed_no_change.invocation_part_id = ${partID}
    ))`
}

function candidateCommandBinding(candidate: string, command: string, disposition: string, invocation: string) {
  return `json_type(${candidate}) = 'object'
    AND (SELECT count(*) FROM json_each(${candidate})) = 7
    AND json_type(${command}) = 'object'
    AND ((json_extract(${command}, '$.operation') = 'create'
          AND (SELECT count(*) FROM json_each(${command})) = 4)
      OR (json_extract(${command}, '$.operation') = 'revise'
          AND (SELECT count(*) FROM json_each(${command})) = 7)
      OR (json_extract(${command}, '$.operation') = 'retire'
          AND (SELECT count(*) FROM json_each(${command})) = 6)
      OR (json_extract(${command}, '$.operation') = 'restore'
          AND (SELECT count(*) FROM json_each(${command})) =
            CASE WHEN json_type(${command}, '$.snapshot') IS NULL THEN 6 ELSE 7 END))
    AND json_type(${command}, '$.cause') = 'object'
    AND (SELECT count(*) FROM json_each(${command}, '$.cause')) = 2
    AND json_extract(${candidate}, '$.kind') = 'candidate_v1'
    AND json_extract(${candidate}, '$.commandFingerprint') = ${disposition}.command_fingerprint
    AND json_extract(${candidate}, '$.semanticAddressFingerprint') = ${disposition}.semantic_address_fingerprint
    AND json_extract(${candidate}, '$.agentActionFingerprint') = ${disposition}.agent_action_fingerprint
    AND json(json_extract(${candidate}, '$.canonicalCommand')) = json(${command})
    AND json(json_extract(${candidate}, '$.agentAction')) = json(${disposition}.agent_action)
    AND json_type(${candidate}, '$.agentAction') = 'object'
    AND (SELECT count(*) FROM json_each(${candidate}, '$.agentAction')) = 13
    AND json_extract(${candidate}, '$.agentAction.schemaVersion') = 1
    AND json_extract(${candidate}, '$.agentAction.kind') = 'root'
    AND json_extract(${candidate}, '$.agentAction.occurrenceID') = ${invocation}.occurrence_id
    AND json_extract(${candidate}, '$.agentAction.sessionID') = ${invocation}.session_id
    AND json_extract(${candidate}, '$.agentAction.turnID') = ${invocation}.turn_id
    AND json_extract(${candidate}, '$.agentAction.inputID') = ${invocation}.input_id
    AND json_extract(${candidate}, '$.agentAction.assistantMessageID') = ${invocation}.assistant_message_id
    AND json_extract(${candidate}, '$.agentAction.invocationPartID') = ${invocation}.part_id
    AND json_extract(${candidate}, '$.agentAction.providerCallID') = ${invocation}.provider_call_id
    AND json_extract(${candidate}, '$.agentAction.emissionOrdinal') = ${invocation}.emission_ordinal
    AND json_extract(${candidate}, '$.agentAction.capabilityIdentity') = ${invocation}.capability_identity
    AND json_extract(${candidate}, '$.agentAction.capabilityVersion') = ${invocation}.capability_version
    AND json_type(${candidate}, '$.agentAction.lineage') = 'array'
    AND json_array_length(${candidate}, '$.agentAction.lineage') = 0
    AND json_type(${candidate}, '$.agentAction.effectiveDelegatedCapability') IS NULL
    AND json_type(${candidate}, '$.materialized') = 'object'
    AND ((json_extract(${command}, '$.operation') = 'create'
          AND (SELECT count(*) FROM json_each(${candidate}, '$.materialized')) = 9)
      OR (json_extract(${command}, '$.operation') IN ('revise', 'retire', 'restore')
          AND (SELECT count(*) FROM json_each(${candidate}, '$.materialized')) = 11
          AND json_type(${candidate}, '$.materialized.previous') = 'object'
          AND (SELECT count(*) FROM json_each(${candidate}, '$.materialized.previous')) = 3
          AND json_type(${candidate}, '$.materialized.previous.current') = 'object'
          AND (SELECT count(*) FROM json_each(${candidate}, '$.materialized.previous.current')) =
            CASE WHEN json_type(${candidate}, '$.materialized.previous.current.predecessorRevisionID') IS NULL
              THEN 11 ELSE 12 END))
    AND json_extract(${candidate}, '$.materialized.operation') = json_extract(${command}, '$.operation')
    AND json_extract(${candidate}, '$.materialized.authorAndCause.type') = json_extract(${command}, '$.cause.type')
    AND json_extract(${candidate}, '$.materialized.authorAndCause.rootModelOperationID') = ${invocation}.assistant_message_id
    AND json_extract(${candidate}, '$.materialized.authorAndCause.mutationOccurrenceID') = ${invocation}.occurrence_id
    AND json_extract(${candidate}, '$.materialized.authorAndCause.mutationPartID') = ${invocation}.part_id
    AND ((json_extract(${command}, '$.cause.type') IN ('interpreted_learner_report', 'learner_correction')
          AND json_extract(${candidate}, '$.materialized.authorAndCause.source.type') = 'learner_occurrence'
          AND json_extract(${candidate}, '$.materialized.authorAndCause.source.occurrenceID') = ${invocation}.occurrence_id
          AND json_extract(${candidate}, '$.materialized.authorAndCause.source.sessionID') = ${invocation}.session_id
          AND json_extract(${candidate}, '$.materialized.authorAndCause.source.turnID') = ${invocation}.turn_id
          AND json_extract(${candidate}, '$.materialized.authorAndCause.source.inputID') = ${invocation}.input_id
          AND json(json_extract(${candidate}, '$.materialized.authorAndCause.source.excerpt')) =
            json_patch(json_extract(${command}, '$.cause.excerpt'), json_object(
              'sha256', json_extract(${candidate}, '$.materialized.authorAndCause.source.excerpt.sha256')
            ))
          AND length(json_extract(${candidate}, '$.materialized.authorAndCause.source.excerpt.sha256')) = 64
          AND json_extract(${candidate}, '$.materialized.authorAndCause.source.excerpt.sha256')
            NOT GLOB '*[^0-9a-f]*')
      OR (json_extract(${command}, '$.cause.type') IN ('tutor_model_judgment', 'exact_owner_observation')
          AND json_extract(${candidate}, '$.materialized.authorAndCause.source.type') = 'model_operation'
          AND json_extract(${candidate}, '$.materialized.authorAndCause.source.assistantMessageID') =
            ${invocation}.assistant_message_id
          AND json_extract(${candidate}, '$.materialized.authorAndCause.source.sessionID') = ${invocation}.session_id
          AND json_extract(${candidate}, '$.materialized.authorAndCause.source.turnID') = ${invocation}.turn_id
          AND json_extract(${candidate}, '$.materialized.authorAndCause.source.inputID') = ${invocation}.input_id
          AND json_extract(${candidate}, '$.materialized.authorAndCause.source.occurrenceID') = ${invocation}.occurrence_id
          AND length(json_extract(${candidate}, '$.materialized.authorAndCause.source.learningContextFingerprint')) = 64
          AND json_extract(${candidate}, '$.materialized.authorAndCause.source.learningContextFingerprint')
            NOT GLOB '*[^0-9a-f]*'
          AND json_extract(${candidate}, '$.materialized.authorAndCause.source.rationale') =
            json_extract(${command}, '$.cause.rationale')))
    AND ((json_extract(${command}, '$.operation') = 'create'
          AND json_type(${command}, '$.judgmentID') IS NULL
          AND json_type(${command}, '$.expectedHead') IS NULL
          AND json_type(${candidate}, '$.materialized.previous') IS NULL
          AND json_type(${candidate}, '$.materialized.predecessorRevisionID') IS NULL
          AND json_extract(${candidate}, '$.materialized.version') = 1
          AND json_extract(${candidate}, '$.materialized.disposition') = 'active')
      OR (json_extract(${command}, '$.operation') IN ('revise', 'retire', 'restore')
          AND json_extract(${command}, '$.judgmentID') = json_extract(${candidate}, '$.materialized.judgmentID')
          AND json_extract(${command}, '$.expectedHead.revisionID') =
            json_extract(${candidate}, '$.materialized.previous.current.id')
          AND json_extract(${command}, '$.expectedHead.version') =
            json_extract(${candidate}, '$.materialized.previous.current.version')
          AND length(json_extract(${command}, '$.expectedHead.ownerCutFingerprint')) = 64
          AND json_extract(${command}, '$.expectedHead.ownerCutFingerprint') NOT GLOB '*[^0-9a-f]*'
          AND json_extract(${candidate}, '$.materialized.predecessorRevisionID') =
            json_extract(${candidate}, '$.materialized.previous.current.id')
          AND json_extract(${candidate}, '$.materialized.version') =
            json_extract(${candidate}, '$.materialized.previous.current.version') + 1))
    AND ((json_extract(${command}, '$.operation') IN ('retire', 'restore')
          AND json_type(${command}, '$.snapshot') IS NULL
          AND json(json_extract(${candidate}, '$.materialized.snapshot')) =
            json(json_extract(${candidate}, '$.materialized.previous.current.snapshot')))
      OR (json_type(${command}, '$.snapshot') = 'object'
          AND json_extract(${candidate}, '$.materialized.snapshot.subject.label') =
            json_extract(${command}, '$.snapshot.subject.label')
          AND json_extract(${candidate}, '$.materialized.snapshot.subject.scope.type') =
            json_extract(${command}, '$.snapshot.subject.scope.type')
          AND json_extract(${candidate}, '$.materialized.snapshot.judgmentBody') =
            json_extract(${command}, '$.snapshot.judgmentBody')
          AND json_extract(${candidate}, '$.materialized.snapshot.uncertaintyAndLimits') IS
            json_extract(${command}, '$.snapshot.uncertaintyAndLimits')
          AND json_extract(${candidate}, '$.materialized.snapshot.basisScope') = 'whole_judgment'
          AND json_extract(${command}, '$.snapshot.basisScope') = 'whole_judgment'
          AND ((json_extract(${command}, '$.snapshot.subject.scope.type') = 'learner_home'
                AND json_type(${candidate}, '$.materialized.snapshot.subject.scope.anchors') IS NULL)
            OR (json_extract(${command}, '$.snapshot.subject.scope.type') = 'anchored'
                AND json_type(${command}, '$.snapshot.subject.scope.anchors') = 'array'
                AND json_array_length(${candidate}, '$.materialized.snapshot.subject.scope.anchors') =
                  json_array_length(${command}, '$.snapshot.subject.scope.anchors')
                AND NOT EXISTS (
                  SELECT 1 FROM json_each(${command}, '$.snapshot.subject.scope.anchors') AS intended_anchor
                  WHERE json(json_extract(${candidate}, '$.materialized.snapshot.subject.scope.anchors[' ||
                    intended_anchor.key || '].ref')) <> json(intended_anchor.value)
                )))
          AND json_type(${command}, '$.snapshot.exactBasisRefs') = 'array'
          AND json_array_length(${candidate}, '$.materialized.snapshot.exactBasis') =
            json_array_length(${command}, '$.snapshot.exactBasisRefs')
          AND NOT EXISTS (
            SELECT 1 FROM json_each(${command}, '$.snapshot.exactBasisRefs') AS intended_basis
            WHERE json(json_extract(${candidate}, '$.materialized.snapshot.exactBasis[' || intended_basis.key || '].ref')) <>
              json(intended_basis.value)
          )))`
}

function permissionBinding(
  candidate: string,
  disposition: string,
  capability: string,
  issue: string,
  commitTime: string,
  commitOrder: string,
) {
  return `${capability}.agent_action_fingerprint = ${disposition}.agent_action_fingerprint
    AND ${capability}.time_settled >= ${disposition}.time_disposed
    AND (${capability}.time_settled < ${commitTime}
      OR (${capability}.time_settled = ${commitTime} AND ${capability}.settlement_order <= ${commitOrder}))
    AND ((${capability}.outcome = 'policy_allow'
          AND ${capability}.permission_request_id IS NULL
          AND ${issue}.invocation_part_id IS NULL)
      OR (${capability}.outcome = 'prompted_allow'
          AND ${issue}.invocation_part_id = ${disposition}.invocation_part_id
          AND ${issue}.permission_request_id = ${capability}.permission_request_id
          AND ${issue}.agent_action_fingerprint = ${disposition}.agent_action_fingerprint
          AND ${issue}.time_issued >= ${disposition}.time_disposed
          AND (${issue}.time_issued < ${capability}.time_settled
            OR (${issue}.time_issued = ${capability}.time_settled
              AND ${issue}.issue_order <= ${capability}.settlement_order))
          AND json(json_extract(${issue}.shown_scope, '$.agentAction')) = json(${disposition}.agent_action)
          AND json(json_extract(${issue}.shown_scope, '$.scope.command')) =
            json(${disposition}.canonical_command)
          AND json_extract(${issue}.shown_scope, '$.scope.materialized.outcome') =
            json_extract(${candidate}, '$.materialized.outcome')
          AND json_extract(${issue}.shown_scope, '$.scope.materialized.judgmentID') =
            json_extract(${candidate}, '$.materialized.judgmentID')
          AND json_extract(${issue}.shown_scope, '$.scope.materialized.revisionID') =
            json_extract(${candidate}, '$.materialized.revisionID')
          AND json_extract(${issue}.shown_scope, '$.scope.materialized.effectID') =
            json_extract(${candidate}, '$.materialized.effectID')
          AND json_extract(${issue}.shown_scope, '$.scope.materialized.previousRevisionID') IS
            json_extract(${candidate}, '$.materialized.predecessorRevisionID')
          AND json_extract(${issue}.shown_scope, '$.scope.materialized.version') =
            json_extract(${candidate}, '$.materialized.version')
          AND json_extract(${issue}.shown_scope, '$.scope.materialized.operation') =
            json_extract(${candidate}, '$.materialized.operation')
          AND json_extract(${issue}.shown_scope, '$.scope.materialized.disposition') =
            json_extract(${candidate}, '$.materialized.disposition')
          AND json(json_extract(${issue}.shown_scope, '$.scope.materializedSnapshot')) =
            json(json_extract(${candidate}, '$.materialized.snapshot'))
          AND json(json_extract(${issue}.shown_scope, '$.scope.authorAndCause')) =
            json(json_extract(${candidate}, '$.materialized.authorAndCause'))))`
}

function invalidExactBinding(row: string) {
  return `json_type(${row}.binding) IS NOT 'object'
    OR (SELECT count(*) FROM json_each(${row}.binding)) <> 6
    OR json_type(${row}.binding, '$.ref') IS NOT 'object'
    OR json_extract(${row}.binding, '$.ref.type') IS NOT ${row}.ref_type
    OR json_extract(${row}.binding, '$.refFingerprint') IS NOT ${row}.ref_fingerprint
    OR json_type(${row}.binding, '$.admission') IS NOT 'object'
    OR (SELECT count(*) FROM json_each(${row}.binding, '$.admission')) <> 4
    OR json_extract(${row}.binding, '$.admission.type') IS NOT ${row}.ref_type
    OR json_extract(${row}.binding, '$.admission.refFingerprint') IS NOT ${row}.ref_fingerprint
    OR json_type(${row}.binding, '$.admission.observedCanonicalBytes') IS NOT 'integer'
    OR json_extract(${row}.binding, '$.admission.observedCanonicalBytes') < 1
    OR length(json_extract(${row}.binding, '$.admission.observedFingerprint')) <> 64
    OR json_extract(${row}.binding, '$.admission.observedFingerprint') GLOB '*[^0-9a-f]*'
    OR length(json_extract(${row}.binding, '$.admissionFingerprint')) <> 64
    OR json_extract(${row}.binding, '$.admissionFingerprint') GLOB '*[^0-9a-f]*'
    OR json_extract(${row}.binding, '$.firstBoundRevisionID') IS NOT ${row}.first_bound_revision_id
    OR json_type(${row}.binding, '$.firstBoundAt') IS NOT 'integer'
    OR json_extract(${row}.binding, '$.firstBoundAt') < 0
    OR NOT (((${row}.ref_type = 'course_membership'
          AND (SELECT count(*) FROM json_each(${row}.binding, '$.ref')) = 2
          AND json_type(${row}.binding, '$.ref.endpoint') = 'object')
      OR (${row}.ref_type = 'material_selector'
          AND (SELECT count(*) FROM json_each(${row}.binding, '$.ref')) = 3
          AND json_type(${row}.binding, '$.ref.mapID') = 'text'
          AND json_type(${row}.binding, '$.ref.selectorID') = 'text')
      OR (${row}.ref_type = 'goal_revision'
          AND (SELECT count(*) FROM json_each(${row}.binding, '$.ref')) = 4
          AND json_type(${row}.binding, '$.ref.goalID') = 'text'
          AND json_type(${row}.binding, '$.ref.revisionID') = 'text'
          AND json_type(${row}.binding, '$.ref.version') = 'integer'
          AND json_extract(${row}.binding, '$.ref.version') >= 1)
      OR (${row}.ref_type = 'assignment_revision'
          AND (SELECT count(*) FROM json_each(${row}.binding, '$.ref')) = 4
          AND json_type(${row}.binding, '$.ref.assignmentID') = 'text'
          AND json_type(${row}.binding, '$.ref.revisionID') = 'text'
          AND json_type(${row}.binding, '$.ref.version') = 'integer'
          AND json_extract(${row}.binding, '$.ref.version') >= 1)
      OR (${row}.ref_type = 'learner_response_evidence_revision'
          AND (SELECT count(*) FROM json_each(${row}.binding, '$.ref')) = 4
          AND json_type(${row}.binding, '$.ref.recordID') = 'text'
          AND json_type(${row}.binding, '$.ref.revisionID') = 'text'
          AND json_type(${row}.binding, '$.ref.version') = 'integer'
          AND json_extract(${row}.binding, '$.ref.version') >= 0)
      OR (${row}.ref_type = 'interaction'
          AND (SELECT count(*) FROM json_each(${row}.binding, '$.ref')) = 2
          AND json_type(${row}.binding, '$.ref.locator') = 'object')))`
}

export const statements = [
  ...immutable.map(
    (table) =>
      `CREATE TRIGGER IF NOT EXISTS ${table}_immutable
      BEFORE UPDATE ON ${table}
      BEGIN
        SELECT RAISE(ABORT, 'Learner-state judgment evidence is immutable');
      END`,
  ),
  ...durable.map(
    (table) =>
      `CREATE TRIGGER IF NOT EXISTS ${table}_no_delete
      BEFORE DELETE ON ${table}
      BEGIN
        SELECT RAISE(ABORT, 'Learner-state judgment evidence cannot be deleted');
      END`,
  ),
  `CREATE TRIGGER IF NOT EXISTS learner_state_judgment_disposition_sealed_no_delete
    BEFORE DELETE ON learner_state_judgment_disposition
    WHEN ${sealedInvocation("OLD.invocation_part_id")}
    BEGIN
      SELECT RAISE(ABORT, 'Sealed learner-state disposition cannot be deleted');
    END`,
  `CREATE TRIGGER IF NOT EXISTS learner_state_judgment_capability_issue_sealed_no_delete
    BEFORE DELETE ON learner_state_judgment_capability_issue
    WHEN ${sealedInvocation("OLD.invocation_part_id")}
    BEGIN
      SELECT RAISE(ABORT, 'Sealed learner-state capability issue cannot be deleted');
    END`,
  `CREATE TRIGGER IF NOT EXISTS learner_state_judgment_capability_settlement_sealed_no_delete
    BEFORE DELETE ON learner_state_judgment_capability_settlement
    WHEN ${sealedInvocation("OLD.invocation_part_id")}
    BEGIN
      SELECT RAISE(ABORT, 'Sealed learner-state capability settlement cannot be deleted');
    END`,
  `CREATE TRIGGER IF NOT EXISTS learner_state_judgment_disposition_late_insert_closed
    BEFORE INSERT ON learner_state_judgment_disposition
    WHEN ${sealedInvocation("NEW.invocation_part_id")}
    BEGIN
      SELECT RAISE(ABORT, 'Sealed learner-state invocation cannot receive a late disposition');
    END`,
  `CREATE TRIGGER IF NOT EXISTS learner_state_judgment_capability_issue_late_insert_closed
    BEFORE INSERT ON learner_state_judgment_capability_issue
    WHEN EXISTS (
      SELECT 1 FROM learner_state_judgment_effect AS effect
      JOIN learner_state_judgment_commit_seal AS seal ON seal.effect_id = effect.id
      WHERE effect.invocation_part_id = NEW.invocation_part_id
      UNION ALL
      SELECT 1 FROM learner_state_judgment_no_change_seal AS seal
      WHERE seal.invocation_part_id = NEW.invocation_part_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'Sealed learner-state invocation cannot receive a late capability issue');
    END`,
  `CREATE TRIGGER IF NOT EXISTS learner_state_judgment_capability_settlement_late_insert_closed
    BEFORE INSERT ON learner_state_judgment_capability_settlement
    WHEN ${sealedInvocation("NEW.invocation_part_id")}
    BEGIN
      SELECT RAISE(ABORT, 'Sealed learner-state invocation cannot receive a late capability settlement');
    END`,
  `CREATE TRIGGER IF NOT EXISTS learner_state_judgment_effect_address_owner_exclusive
    BEFORE INSERT ON learner_state_judgment_effect
    WHEN EXISTS (
      SELECT 1 FROM learner_state_judgment_no_change_seal AS no_change
      WHERE no_change.semantic_address_fingerprint = NEW.semantic_address_fingerprint
    )
    BEGIN
      SELECT RAISE(ABORT, 'Learner-state semantic address already has a no-change owner');
    END`,
  `CREATE TRIGGER IF NOT EXISTS learner_state_judgment_no_change_address_owner_exclusive
    BEFORE INSERT ON learner_state_judgment_no_change_seal
    WHEN EXISTS (
      SELECT 1 FROM learner_state_judgment_effect AS effect
      WHERE effect.semantic_address_fingerprint = NEW.semantic_address_fingerprint
    )
    BEGIN
      SELECT RAISE(ABORT, 'Learner-state semantic address already has an effect owner');
    END`,
  `CREATE TRIGGER IF NOT EXISTS learner_state_judgment_revision_insert_validate
    BEFORE INSERT ON learner_state_judgment_revision
    BEGIN
      SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM learner_state_judgment_effect AS effect
        WHERE effect.id = NEW.effect_id
          AND effect.cause_type = NEW.author_class
          AND effect.time_committed = NEW.time_committed
          AND effect.commit_order = NEW.commit_order
          AND effect.frontier_sequence = NEW.frontier_sequence
          AND json_extract(NEW.author_and_cause, '$.type') = effect.cause_type
          AND json_extract(NEW.author_and_cause, '$.rootModelOperationID') = effect.model_operation_id
          AND json_extract(NEW.author_and_cause, '$.mutationOccurrenceID') = effect.occurrence_id
          AND json_extract(NEW.author_and_cause, '$.mutationPartID') = effect.invocation_part_id
      ) THEN RAISE(ABORT, 'Learner-state revision does not match its producing effect') END;

      SELECT CASE WHEN NOT (
        json_type(NEW.snapshot) = 'object'
        AND json_extract(NEW.snapshot, '$.subject.label') = NEW.subject_label
        AND json_extract(NEW.snapshot, '$.subject.scope.type') = NEW.scope_type
        AND json_extract(NEW.snapshot, '$.judgmentBody') = NEW.judgment_body
        AND json_extract(NEW.snapshot, '$.basisScope') = 'whole_judgment'
        AND json_array_length(NEW.snapshot, '$.exactBasis') = NEW.basis_count
        AND ((NEW.scope_type = 'learner_home'
              AND json_type(NEW.snapshot, '$.subject.scope.anchors') IS NULL
              AND NEW.anchor_count = 0)
          OR (NEW.scope_type = 'anchored'
              AND json_type(NEW.snapshot, '$.subject.scope.anchors') = 'array'
              AND json_array_length(NEW.snapshot, '$.subject.scope.anchors') = NEW.anchor_count))
        AND ((NEW.uncertainty_and_limits IS NULL
              AND json_type(NEW.snapshot, '$.uncertaintyAndLimits') IS NULL)
          OR json_extract(NEW.snapshot, '$.uncertaintyAndLimits') = NEW.uncertainty_and_limits)
        AND ((NEW.version = 1 AND NEW.predecessor_revision_id IS NULL AND NEW.operation = 'create')
          OR (NEW.version > 1 AND EXISTS (
            SELECT 1 FROM learner_state_judgment_revision AS predecessor
            WHERE predecessor.id = NEW.predecessor_revision_id
              AND predecessor.judgment_id = NEW.judgment_id
              AND predecessor.version + 1 = NEW.version
          )))
      ) THEN RAISE(ABORT, 'Learner-state revision is not one complete exact value') END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS learner_state_judgment_revision_sealed_effect_closed
    BEFORE INSERT ON learner_state_judgment_revision
    WHEN EXISTS (
      SELECT 1 FROM learner_state_judgment_commit_seal AS seal WHERE seal.effect_id = NEW.effect_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'Sealed learner-state effect cannot receive another revision');
    END`,
  `CREATE TRIGGER IF NOT EXISTS learner_state_judgment_anchor_sealed_revision_closed
    BEFORE INSERT ON learner_state_judgment_anchor
    WHEN EXISTS (
      SELECT 1 FROM learner_state_judgment_commit_seal AS seal WHERE seal.revision_id = NEW.revision_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'Sealed learner-state revision cannot receive another anchor');
    END`,
  `CREATE TRIGGER IF NOT EXISTS learner_state_judgment_basis_sealed_revision_closed
    BEFORE INSERT ON learner_state_judgment_basis
    WHEN EXISTS (
      SELECT 1 FROM learner_state_judgment_commit_seal AS seal WHERE seal.revision_id = NEW.revision_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'Sealed learner-state revision cannot receive another basis');
    END`,
  `CREATE TRIGGER IF NOT EXISTS learner_state_judgment_no_change_validate
    BEFORE INSERT ON learner_state_judgment_no_change_seal
    BEGIN
      SELECT CASE WHEN NOT EXISTS (
        SELECT 1
        FROM learning_command_receipt AS receipt
        JOIN learning_command_invocation AS invocation ON invocation.part_id = NEW.invocation_part_id
        JOIN learner_state_judgment_disposition AS disposition
          ON disposition.invocation_part_id = NEW.invocation_part_id
        JOIN learner_state_judgment_capability_settlement AS capability
          ON capability.invocation_part_id = NEW.invocation_part_id
        LEFT JOIN learner_state_judgment_capability_issue AS issue
          ON issue.invocation_part_id = NEW.invocation_part_id
        WHERE receipt.id = NEW.receipt_id
          AND receipt.invocation_part_id = NEW.invocation_part_id
          AND receipt.occurrence_id = NEW.occurrence_id
          AND receipt.assistant_message_id = NEW.model_operation_id
          AND receipt.capability_identity = invocation.capability_identity
          AND receipt.capability_version = invocation.capability_version
          AND receipt.authorization_basis = invocation.authorization_basis
          AND receipt.time_committed = NEW.time_committed
          AND receipt.commit_order = NEW.commit_order
          AND invocation.status = 'admitted'
          AND invocation.command_name = 'update_learner_state_judgment'
          AND invocation.command_version = 1
          AND invocation.capability_identity = 'update_learner_state_judgment'
          AND invocation.capability_version = 1
          AND invocation.occurrence_id = NEW.occurrence_id
          AND invocation.assistant_message_id = NEW.model_operation_id
          AND disposition.disposition = 'candidate_v1'
          AND disposition.command_fingerprint = NEW.command_fingerprint
          AND disposition.semantic_address_fingerprint = NEW.semantic_address_fingerprint
          AND json(disposition.canonical_command) = json(NEW.canonical_command)
          AND ${candidateCommandBinding(
            "disposition.materialized_candidate",
            "disposition.canonical_command",
            "disposition",
            "invocation",
          )}
          AND json_extract(disposition.materialized_candidate, '$.materialized.outcome') = 'no_change'
          AND json_extract(disposition.materialized_candidate, '$.materialized.operation') = 'revise'
          AND json(NEW.materialized_candidate) = json(disposition.materialized_candidate)
          AND ${permissionBinding(
            "disposition.materialized_candidate",
            "disposition",
            "capability",
            "issue",
            "NEW.time_committed",
            "NEW.commit_order",
          )}
          AND NEW.cause_type = json_extract(NEW.canonical_command, '$.cause.type')
          AND EXISTS (
            SELECT 1
            FROM learner_state_judgment AS identity
            JOIN learner_state_judgment_revision AS previous_revision
              ON previous_revision.judgment_id = identity.id
            JOIN learner_state_judgment_commit_seal AS previous_seal
              ON previous_seal.revision_id = previous_revision.id
            WHERE identity.id = json_extract(NEW.materialized_candidate, '$.materialized.judgmentID')
              AND identity.id = json_extract(NEW.materialized_candidate, '$.materialized.previous.id')
              AND identity.time_created = json_extract(NEW.materialized_candidate, '$.materialized.previous.timeCreated')
              AND previous_revision.id =
                json_extract(NEW.materialized_candidate, '$.materialized.previous.current.id')
              AND previous_revision.judgment_id =
                json_extract(NEW.materialized_candidate, '$.materialized.previous.current.judgmentID')
              AND previous_revision.version =
                json_extract(NEW.materialized_candidate, '$.materialized.previous.current.version')
              AND previous_revision.predecessor_revision_id IS
                json_extract(NEW.materialized_candidate, '$.materialized.previous.current.predecessorRevisionID')
              AND previous_revision.operation =
                json_extract(NEW.materialized_candidate, '$.materialized.previous.current.operation')
              AND previous_revision.disposition =
                json_extract(NEW.materialized_candidate, '$.materialized.previous.current.disposition')
              AND json(previous_revision.snapshot) =
                json(json_extract(NEW.materialized_candidate, '$.materialized.previous.current.snapshot'))
              AND json(previous_revision.author_and_cause) =
                json(json_extract(NEW.materialized_candidate, '$.materialized.previous.current.authorAndCause'))
              AND previous_revision.effect_id =
                json_extract(NEW.materialized_candidate, '$.materialized.previous.current.effectID')
              AND previous_revision.time_committed =
                json_extract(NEW.materialized_candidate, '$.materialized.previous.current.timeCommitted')
              AND previous_revision.commit_order =
                json_extract(NEW.materialized_candidate, '$.materialized.previous.current.commitOrder')
              AND previous_revision.frontier_sequence =
                json_extract(NEW.materialized_candidate, '$.materialized.previous.current.frontierSequence')
              AND previous_revision.id =
                json_extract(NEW.materialized_candidate, '$.materialized.predecessorRevisionID')
              AND previous_revision.version + 1 =
                json_extract(NEW.materialized_candidate, '$.materialized.version')
              AND previous_revision.disposition =
                json_extract(NEW.materialized_candidate, '$.materialized.disposition')
              AND json(previous_revision.snapshot) =
                json(json_extract(NEW.materialized_candidate, '$.materialized.snapshot'))
              AND NOT EXISTS (
                SELECT 1 FROM learner_state_judgment_revision AS later_revision
                WHERE later_revision.predecessor_revision_id = previous_revision.id
              )
          )
          AND json_type(NEW.result) = 'object'
          AND (SELECT count(*) FROM json_each(NEW.result)) = 8
          AND json_extract(NEW.result, '$.outcome') = 'no_change'
          AND json_extract(NEW.result, '$.learnerStateJudgmentKind') = 'revision'
          AND json_extract(NEW.result, '$.existingOutcome') = 'materialized_no_change'
          AND json_extract(NEW.result, '$.judgmentID') =
            json_extract(NEW.materialized_candidate, '$.materialized.judgmentID')
          AND json_extract(NEW.result, '$.revisionID') =
            json_extract(NEW.materialized_candidate, '$.materialized.previous.current.id')
          AND json_extract(NEW.result, '$.version') =
            json_extract(NEW.materialized_candidate, '$.materialized.previous.current.version')
          AND json_extract(NEW.result, '$.settlementTime') = NEW.time_committed
          AND json_extract(NEW.result, '$.settlementOrder') = NEW.commit_order
      ) THEN RAISE(ABORT, 'Learner-state no-change seal is not atomically settled') END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS learner_state_judgment_commit_seal_validate
    BEFORE INSERT ON learner_state_judgment_commit_seal
    BEGIN
      SELECT CASE WHEN NOT EXISTS (
        SELECT 1
        FROM learner_state_judgment_effect AS effect
        JOIN learner_state_judgment_revision AS revision ON revision.effect_id = effect.id
        JOIN learning_command_receipt AS receipt ON receipt.id = NEW.receipt_id
        JOIN learning_command_invocation AS invocation ON invocation.part_id = NEW.invocation_part_id
        JOIN learner_state_judgment_disposition AS disposition
          ON disposition.invocation_part_id = NEW.invocation_part_id
        JOIN learner_state_judgment_capability_settlement AS capability
          ON capability.invocation_part_id = NEW.invocation_part_id
        LEFT JOIN learner_state_judgment_capability_issue AS issue
          ON issue.invocation_part_id = NEW.invocation_part_id
        WHERE effect.id = NEW.effect_id
          AND revision.id = NEW.revision_id
          AND effect.physical_receipt_id = NEW.receipt_id
          AND effect.invocation_part_id = NEW.invocation_part_id
          AND receipt.invocation_part_id = NEW.invocation_part_id
          AND receipt.occurrence_id = effect.occurrence_id
          AND receipt.assistant_message_id = effect.model_operation_id
          AND receipt.capability_identity = invocation.capability_identity
          AND receipt.capability_version = invocation.capability_version
          AND receipt.authorization_basis = invocation.authorization_basis
          AND receipt.time_committed = effect.time_committed
          AND receipt.commit_order = effect.commit_order
          AND invocation.status = 'applied'
          AND invocation.receipt_id = NEW.receipt_id
          AND invocation.command_name = 'update_learner_state_judgment'
          AND invocation.command_version = 1
          AND invocation.capability_identity = 'update_learner_state_judgment'
          AND invocation.capability_version = 1
          AND invocation.occurrence_id = effect.occurrence_id
          AND invocation.assistant_message_id = effect.model_operation_id
          AND json_extract(invocation.settlement, '$.effectID') = effect.id
          AND json_extract(invocation.settlement, '$.revisionID') = revision.id
          AND disposition.disposition = 'candidate_v1'
          AND disposition.command_fingerprint = effect.command_fingerprint
          AND disposition.semantic_address_fingerprint = effect.semantic_address_fingerprint
          AND json(disposition.canonical_command) = json(effect.canonical_command)
          AND json(effect.admission_projection) = json(disposition.materialized_candidate)
          AND ${candidateCommandBinding(
            "disposition.materialized_candidate",
            "disposition.canonical_command",
            "disposition",
            "invocation",
          )}
          AND json_extract(disposition.materialized_candidate, '$.materialized.outcome') = 'changed'
          AND json_extract(disposition.materialized_candidate, '$.materialized.effectID') = effect.id
          AND json_extract(disposition.materialized_candidate, '$.materialized.revisionID') = revision.id
          AND json_extract(disposition.materialized_candidate, '$.materialized.judgmentID') = revision.judgment_id
          AND json_extract(disposition.materialized_candidate, '$.materialized.version') = revision.version
          AND json_extract(disposition.materialized_candidate, '$.materialized.predecessorRevisionID')
            IS revision.predecessor_revision_id
          AND json_extract(disposition.materialized_candidate, '$.materialized.operation') = revision.operation
          AND json_extract(disposition.materialized_candidate, '$.materialized.disposition') = revision.disposition
          AND json(json_extract(disposition.materialized_candidate, '$.materialized.snapshot')) = json(revision.snapshot)
          AND json(json_extract(disposition.materialized_candidate, '$.materialized.authorAndCause')) =
            json(revision.author_and_cause)
          AND revision.author_class = effect.cause_type
          AND revision.judgment_id = json_extract(effect.result, '$.judgmentID')
          AND revision.id = json_extract(effect.result, '$.revisionID')
          AND revision.version = json_extract(effect.result, '$.version')
          AND revision.operation = json_extract(effect.result, '$.operation')
          AND revision.disposition = json_extract(effect.result, '$.disposition')
          AND json_type(effect.result) = 'object'
          AND (SELECT count(*) FROM json_each(effect.result)) = 5
          AND json_extract(invocation.settlement, '$.outcome') = 'applied'
          AND json_extract(invocation.settlement, '$.learnerStateJudgmentKind') = 'revision'
          AND json_extract(invocation.settlement, '$.receiptID') = receipt.id
          AND json_type(invocation.settlement) = 'object'
          AND (SELECT count(*) FROM json_each(invocation.settlement)) = 12
          AND json_extract(invocation.settlement, '$.effectID') = effect.id
          AND json_extract(invocation.settlement, '$.judgmentID') = revision.judgment_id
          AND json_extract(invocation.settlement, '$.revisionID') = revision.id
          AND json_extract(invocation.settlement, '$.version') = revision.version
          AND json_extract(invocation.settlement, '$.operation') = revision.operation
          AND json_extract(invocation.settlement, '$.disposition') = revision.disposition
          AND json_extract(invocation.settlement, '$.settlementTime') = effect.time_committed
          AND json_extract(invocation.settlement, '$.settlementOrder') = effect.commit_order
          AND json_extract(invocation.settlement, '$.frontierSequence') = revision.frontier_sequence
          AND ${permissionBinding(
            "disposition.materialized_candidate",
            "disposition",
            "capability",
            "issue",
            "effect.time_committed",
            "effect.commit_order",
          )}
          AND NEW.time_sealed = effect.time_committed
          AND NEW.seal_order = effect.commit_order
          AND revision.time_committed = effect.time_committed
          AND revision.commit_order = effect.commit_order
          AND revision.frontier_sequence = effect.frontier_sequence
          AND EXISTS (
            SELECT 1 FROM learner_state_judgment AS identity
            WHERE identity.id = revision.judgment_id
              AND ((revision.operation = 'create'
                    AND identity.time_created = effect.time_committed
                    AND revision.version = 1
                    AND revision.predecessor_revision_id IS NULL
                    AND revision.disposition = 'active'
                    AND json_type(disposition.materialized_candidate, '$.materialized.previous') IS NULL)
                OR (revision.operation <> 'create'
                    AND identity.time_created =
                      json_extract(disposition.materialized_candidate, '$.materialized.previous.timeCreated')))
          )
          AND (
            revision.operation = 'create'
            OR EXISTS (
              SELECT 1 FROM learner_state_judgment_revision AS predecessor
              WHERE predecessor.id = revision.predecessor_revision_id
                AND predecessor.judgment_id = revision.judgment_id
                AND predecessor.version + 1 = revision.version
                AND json_extract(disposition.materialized_candidate, '$.materialized.previous.id') =
                  predecessor.judgment_id
                AND json_extract(disposition.materialized_candidate, '$.materialized.previous.current.id') =
                  predecessor.id
                AND json_extract(disposition.materialized_candidate, '$.materialized.previous.current.version') =
                  predecessor.version
                AND json_extract(disposition.materialized_candidate, '$.materialized.previous.current.judgmentID') =
                  predecessor.judgment_id
                AND json_extract(disposition.materialized_candidate, '$.materialized.previous.current.predecessorRevisionID')
                  IS predecessor.predecessor_revision_id
                AND json_extract(disposition.materialized_candidate, '$.materialized.previous.current.operation') =
                  predecessor.operation
                AND json_extract(disposition.materialized_candidate, '$.materialized.previous.current.disposition') =
                  predecessor.disposition
                AND json(json_extract(
                  disposition.materialized_candidate,
                  '$.materialized.previous.current.snapshot'
                )) = json(predecessor.snapshot)
                AND json(json_extract(
                  disposition.materialized_candidate,
                  '$.materialized.previous.current.authorAndCause'
                )) = json(predecessor.author_and_cause)
                AND json_extract(disposition.materialized_candidate, '$.materialized.previous.current.effectID') =
                  predecessor.effect_id
                AND json_extract(disposition.materialized_candidate, '$.materialized.previous.current.timeCommitted') =
                  predecessor.time_committed
                AND json_extract(disposition.materialized_candidate, '$.materialized.previous.current.commitOrder') =
                  predecessor.commit_order
                AND json_extract(disposition.materialized_candidate, '$.materialized.previous.current.frontierSequence') =
                  predecessor.frontier_sequence
                AND ((revision.operation = 'revise' AND revision.disposition = predecessor.disposition)
                  OR (revision.operation = 'retire' AND predecessor.disposition = 'active'
                    AND revision.disposition = 'retired' AND json(revision.snapshot) = json(predecessor.snapshot))
                  OR (revision.operation = 'restore' AND predecessor.disposition = 'retired'
                    AND revision.disposition = 'active'))
            )
          )
      ) THEN RAISE(ABORT, 'Learner-state commit is not atomically settled') END;

      SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM learner_state_judgment_revision AS revision
        WHERE revision.id = NEW.revision_id
          AND revision.anchor_count = (
            SELECT count(*) FROM learner_state_judgment_anchor AS anchor
            WHERE anchor.revision_id = revision.id
          )
          AND revision.basis_count = (
            SELECT count(*) FROM learner_state_judgment_basis AS basis
            WHERE basis.revision_id = revision.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM learner_state_judgment_anchor AS anchor
            WHERE anchor.revision_id = revision.id
              AND (${invalidExactBinding("anchor")}
                OR anchor.ordinal >= revision.anchor_count
                OR anchor.ref_type NOT IN (
                  'course_membership', 'material_selector', 'goal_revision', 'assignment_revision'
                )
                OR anchor.ref_type <> json_extract(revision.snapshot,
                  '$.subject.scope.anchors[' || anchor.ordinal || '].ref.type')
                OR anchor.ref_fingerprint <> json_extract(revision.snapshot,
                  '$.subject.scope.anchors[' || anchor.ordinal || '].refFingerprint')
                OR anchor.first_bound_revision_id <> json_extract(revision.snapshot,
                  '$.subject.scope.anchors[' || anchor.ordinal || '].firstBoundRevisionID')
                OR json(anchor.binding) <> json(json_extract(revision.snapshot,
                  '$.subject.scope.anchors[' || anchor.ordinal || ']'))
                OR NOT EXISTS (
                  SELECT 1
                  FROM learner_state_judgment_revision AS first_bound
                  JOIN learner_state_judgment_effect AS first_effect ON first_effect.id = first_bound.effect_id
                  JOIN learning_command_invocation AS first_invocation
                    ON first_invocation.part_id = first_effect.invocation_part_id
                  WHERE first_bound.id = anchor.first_bound_revision_id
                    AND first_bound.judgment_id = revision.judgment_id
                    AND first_bound.version <= revision.version
                    AND json_extract(anchor.binding, '$.firstBoundAt') = first_invocation.time_admitted
                )
                OR (anchor.first_bound_revision_id = revision.id
                  AND revision.predecessor_revision_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1 FROM learner_state_judgment_revision AS predecessor
                    JOIN json_each(predecessor.snapshot, '$.subject.scope.anchors') AS prior
                    WHERE predecessor.id = revision.predecessor_revision_id
                      AND json_extract(prior.value, '$.refFingerprint') = anchor.ref_fingerprint
                  ))
                OR (anchor.first_bound_revision_id <> revision.id AND NOT EXISTS (
                  SELECT 1 FROM learner_state_judgment_revision AS predecessor
                  WHERE predecessor.id = revision.predecessor_revision_id
                    AND predecessor.scope_type = 'anchored'
                    AND EXISTS (
                      SELECT 1 FROM json_each(predecessor.snapshot, '$.subject.scope.anchors') AS prior
                      WHERE json_extract(prior.value, '$.refFingerprint') = anchor.ref_fingerprint
                        AND json(prior.value) = json(anchor.binding)
                    )
                )))
          )
          AND NOT EXISTS (
            SELECT 1 FROM learner_state_judgment_basis AS basis
            WHERE basis.revision_id = revision.id
              AND (${invalidExactBinding("basis")}
                OR basis.ordinal >= revision.basis_count
                OR basis.ref_type NOT IN (
                  'course_membership', 'material_selector', 'goal_revision', 'assignment_revision',
                  'learner_response_evidence_revision', 'interaction'
                )
                OR basis.ref_type <> json_extract(revision.snapshot,
                  '$.exactBasis[' || basis.ordinal || '].ref.type')
                OR basis.ref_fingerprint <> json_extract(revision.snapshot,
                  '$.exactBasis[' || basis.ordinal || '].refFingerprint')
                OR basis.first_bound_revision_id <> json_extract(revision.snapshot,
                  '$.exactBasis[' || basis.ordinal || '].firstBoundRevisionID')
                OR json(basis.binding) <> json(json_extract(revision.snapshot,
                  '$.exactBasis[' || basis.ordinal || ']'))
                OR NOT EXISTS (
                  SELECT 1
                  FROM learner_state_judgment_revision AS first_bound
                  JOIN learner_state_judgment_effect AS first_effect ON first_effect.id = first_bound.effect_id
                  JOIN learning_command_invocation AS first_invocation
                    ON first_invocation.part_id = first_effect.invocation_part_id
                  WHERE first_bound.id = basis.first_bound_revision_id
                    AND first_bound.judgment_id = revision.judgment_id
                    AND first_bound.version <= revision.version
                    AND json_extract(basis.binding, '$.firstBoundAt') = first_invocation.time_admitted
                )
                OR (basis.first_bound_revision_id = revision.id
                  AND revision.predecessor_revision_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1 FROM learner_state_judgment_revision AS predecessor
                    JOIN json_each(predecessor.snapshot, '$.exactBasis') AS prior
                    WHERE predecessor.id = revision.predecessor_revision_id
                      AND json_extract(prior.value, '$.refFingerprint') = basis.ref_fingerprint
                  ))
                OR (basis.first_bound_revision_id <> revision.id AND NOT EXISTS (
                  SELECT 1 FROM learner_state_judgment_revision AS predecessor
                  WHERE predecessor.id = revision.predecessor_revision_id
                    AND EXISTS (
                      SELECT 1 FROM json_each(predecessor.snapshot, '$.exactBasis') AS prior
                      WHERE json_extract(prior.value, '$.refFingerprint') = basis.ref_fingerprint
                        AND json(prior.value) = json(basis.binding)
                    )
                )))
          )
      ) THEN RAISE(ABORT, 'Learner-state revision bindings are incomplete') END;
    END`,
]
