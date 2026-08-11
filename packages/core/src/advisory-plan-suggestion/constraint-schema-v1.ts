export * as AdvisoryPlanSuggestionConstraintSchema from "./constraint-schema-v1"

const immutable = [
  "advisory_plan_suggestion",
  "advisory_plan_suggestion_disposition",
  "advisory_plan_suggestion_capability_issue",
  "advisory_plan_suggestion_capability_settlement",
  "advisory_plan_suggestion_effect",
  "advisory_plan_suggestion_no_change_seal",
  "advisory_plan_suggestion_revision",
  "advisory_plan_suggestion_anchor",
  "advisory_plan_suggestion_basis",
  "advisory_plan_suggestion_commit_seal",
] as const

const durable = [
  "advisory_plan_suggestion",
  "advisory_plan_suggestion_effect",
  "advisory_plan_suggestion_no_change_seal",
  "advisory_plan_suggestion_revision",
  "advisory_plan_suggestion_anchor",
  "advisory_plan_suggestion_basis",
  "advisory_plan_suggestion_commit_seal",
] as const

function sealedInvocation(partID: string) {
  return `(EXISTS (
      SELECT 1
      FROM advisory_plan_suggestion_effect AS sealed_effect
      JOIN advisory_plan_suggestion_commit_seal AS sealed_commit ON sealed_commit.effect_id = sealed_effect.id
      WHERE sealed_effect.invocation_part_id = ${partID}
    ) OR EXISTS (
      SELECT 1 FROM advisory_plan_suggestion_no_change_seal AS sealed_no_change
      WHERE sealed_no_change.invocation_part_id = ${partID}
    ))`
}

function agentActionBinding(candidate: string, disposition: string, invocation: string) {
  return `json_type(${candidate}, '$.agentAction') = 'object'
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
    AND json_extract(${candidate}, '$.agentActionFingerprint') = ${disposition}.agent_action_fingerprint
    AND json(json_extract(${candidate}, '$.agentAction')) = json(${disposition}.agent_action)`
}

function snapshotMatchesIntent(materialized: string, intent: string) {
  const stored = `json_extract(${materialized}, '$.snapshot')`
  const proposed = `json_extract(${intent}, '$.snapshot')`
  return `json_extract(${stored}, '$.learnerVisibleScope') = json_extract(${proposed}, '$.learnerVisibleScope')
    AND json_extract(${stored}, '$.purpose') = json_extract(${proposed}, '$.purpose')
    AND json_extract(${stored}, '$.directorySummary') = json_extract(${proposed}, '$.directorySummary')
    AND json_extract(${stored}, '$.body') = json_extract(${proposed}, '$.body')
    AND json_extract(${stored}, '$.assumptionsAndUncertainty') IS
      json_extract(${proposed}, '$.assumptionsAndUncertainty')
    AND json_extract(${stored}, '$.retrievalScope.type') = json_extract(${proposed}, '$.retrievalScope.type')
    AND ((json_extract(${proposed}, '$.retrievalScope.type') = 'learner_home_fallback'
          AND json_extract(${stored}, '$.retrievalScope.reason') =
            json_extract(${proposed}, '$.retrievalScope.reason')
          AND json_type(${stored}, '$.retrievalScope.anchors') IS NULL)
      OR (json_extract(${proposed}, '$.retrievalScope.type') = 'anchored'
          AND json_type(${stored}, '$.retrievalScope.anchors') = 'array'
          AND json_array_length(${stored}, '$.retrievalScope.anchors') =
            json_array_length(${proposed}, '$.retrievalScope.anchors')
          AND NOT EXISTS (
            SELECT 1
            FROM json_each(${proposed}, '$.retrievalScope.anchors') AS proposed_anchor
            LEFT JOIN json_each(${stored}, '$.retrievalScope.anchors') AS stored_anchor
              ON stored_anchor.key = proposed_anchor.key
            WHERE json(json_extract(stored_anchor.value, '$.stableOwnerKey')) IS NOT
                json(json_extract(proposed_anchor.value, '$.stableOwnerKey'))
              OR json(json_extract(stored_anchor.value, '$.exactBound.ref')) IS NOT
                json(json_extract(proposed_anchor.value, '$.exactBoundRef'))
          )))
    AND json_type(${stored}, '$.exactBasis') = 'array'
    AND json_array_length(${stored}, '$.exactBasis') = json_array_length(${proposed}, '$.exactBasisRefs')
    AND NOT EXISTS (
      SELECT 1
      FROM json_each(${proposed}, '$.exactBasisRefs') AS proposed_basis
      LEFT JOIN json_each(${stored}, '$.exactBasis') AS stored_basis ON stored_basis.key = proposed_basis.key
      WHERE json(json_extract(stored_basis.value, '$.ref')) IS NOT json(proposed_basis.value)
    )`
}

function commandAndCandidateBinding(candidate: string, command: string, disposition: string, invocation: string) {
  return `json_type(${command}) = 'object'
    AND (SELECT count(*) FROM json_each(${command})) = 3
    AND json_extract(${command}, '$.schemaVersion') = 1
    AND json_type(${command}, '$.cause') = 'object'
    AND json_type(${command}, '$.intents') = 'array'
    AND json_array_length(${command}, '$.intents') BETWEEN 1 AND 8
    AND ((json_extract(${command}, '$.cause.type') = 'responsive_tutor_proposal'
          AND (SELECT count(*) FROM json_each(${command}, '$.cause')) = 3
          AND json_type(${command}, '$.cause.excerpt') = 'object'
          AND (SELECT count(*) FROM json_each(${command}, '$.cause.excerpt')) = 3)
      OR (json_extract(${command}, '$.cause.type') IN ('proactive_tutor_proposal', 'tutor_revision')
          AND (SELECT count(*) FROM json_each(${command}, '$.cause')) = 2)
      OR (json_extract(${command}, '$.cause.type') = 'learner_revision'
          AND (SELECT count(*) FROM json_each(${command}, '$.cause')) = 2
          AND json_type(${command}, '$.cause.excerpt') = 'object'
          AND (SELECT count(*) FROM json_each(${command}, '$.cause.excerpt')) = 3))
    AND json_type(${candidate}) = 'object'
    AND (SELECT count(*) FROM json_each(${candidate})) = 8
    AND json_extract(${candidate}, '$.kind') = 'candidate_v1'
    AND json_extract(${candidate}, '$.commandFingerprint') = ${disposition}.command_fingerprint
    AND json_extract(${candidate}, '$.semanticAddressFingerprint') = ${disposition}.semantic_address_fingerprint
    AND json(json_extract(${candidate}, '$.canonicalCommand')) = json(${command})
    AND json_type(${candidate}, '$.effectID') = 'text'
    AND length(json_extract(${candidate}, '$.effectID')) = 30
    AND substr(json_extract(${candidate}, '$.effectID'), 1, 4) = 'ape_'
    AND json_type(${candidate}, '$.materialized') = 'array'
    AND json_array_length(${candidate}, '$.materialized') = json_array_length(${command}, '$.intents')
    AND ${agentActionBinding(candidate, disposition, invocation)}
    AND NOT EXISTS (
      SELECT 1
      FROM json_each(${command}, '$.intents') AS intent
      LEFT JOIN json_each(${candidate}, '$.materialized') AS materialized ON materialized.key = intent.key
      WHERE json_type(intent.value) <> 'object'
        OR json_type(materialized.value) <> 'object'
        OR json_extract(intent.value, '$.operationOrdinal') <> CAST(intent.key AS INTEGER)
        OR json_extract(materialized.value, '$.operationOrdinal') <> CAST(intent.key AS INTEGER)
        OR json_extract(materialized.value, '$.operation') <> json_extract(intent.value, '$.operation')
        OR json_extract(materialized.value, '$.effectID') <> json_extract(${candidate}, '$.effectID')
        OR json_extract(materialized.value, '$.authorAndCause.type') <> json_extract(${command}, '$.cause.type')
        OR json_extract(materialized.value, '$.authorAndCause.rootModelOperationID') <> ${invocation}.assistant_message_id
        OR json_extract(materialized.value, '$.authorAndCause.mutationOccurrenceID') <> ${invocation}.occurrence_id
        OR json_extract(materialized.value, '$.authorAndCause.mutationPartID') <> ${invocation}.part_id
        OR json_extract(materialized.value, '$.outcome') NOT IN ('changed', 'no_change')
        OR json_extract(materialized.value, '$.disposition') NOT IN ('active', 'retired')
        OR (json_extract(intent.value, '$.operation') IN ('create', 'alternative')
          AND (json_extract(${command}, '$.cause.type') NOT IN ('responsive_tutor_proposal', 'proactive_tutor_proposal')
            OR json_extract(materialized.value, '$.outcome') <> 'changed'
            OR json_extract(materialized.value, '$.version') <> 1
            OR json_type(materialized.value, '$.previous') IS NOT NULL
            OR json_type(materialized.value, '$.predecessorRevisionID') IS NOT NULL
            OR json_extract(materialized.value, '$.createOrdinal') <> json_extract(intent.value, '$.createOrdinal')
            OR NOT (${snapshotMatchesIntent("materialized.value", "intent.value")})))
        OR (json_extract(intent.value, '$.operation') IN ('revise', 'retire', 'restore')
          AND (json_extract(${command}, '$.cause.type') NOT IN ('learner_revision', 'tutor_revision')
            OR json_extract(materialized.value, '$.suggestionID') <> json_extract(intent.value, '$.suggestionID')
            OR json_type(materialized.value, '$.previous') <> 'object'
            OR json_extract(materialized.value, '$.previous.id') <> json_extract(intent.value, '$.suggestionID')
            OR json_extract(materialized.value, '$.previous.current.id') <>
              json_extract(intent.value, '$.expectedHead.revisionID')
            OR json_extract(materialized.value, '$.previous.current.version') <>
              json_extract(intent.value, '$.expectedHead.version')
            OR json_extract(materialized.value, '$.predecessorRevisionID') <>
              json_extract(materialized.value, '$.previous.current.id')
            OR json_extract(materialized.value, '$.version') <>
              json_extract(materialized.value, '$.previous.current.version') + 1))
        OR (json_extract(intent.value, '$.operation') = 'alternative'
          AND json(json_extract(materialized.value, '$.alternativeToRevision')) <>
            json(json_extract(intent.value, '$.alternativeToRevision')))
        OR (json_extract(intent.value, '$.operation') <> 'alternative'
          AND json_type(materialized.value, '$.previous') IS NULL
          AND json_type(materialized.value, '$.alternativeToRevision') IS NOT NULL)
    )
    AND (SELECT count(*) FROM json_each(${command}, '$.intents')
          WHERE json_extract(value, '$.operation') IN ('create', 'alternative')) =
        (SELECT count(DISTINCT json_extract(value, '$.createOrdinal')) FROM json_each(${command}, '$.intents')
          WHERE json_extract(value, '$.operation') IN ('create', 'alternative'))
    AND COALESCE((SELECT max(json_extract(value, '$.createOrdinal')) FROM json_each(${command}, '$.intents')
          WHERE json_extract(value, '$.operation') IN ('create', 'alternative')), -1) =
        (SELECT count(*) - 1 FROM json_each(${command}, '$.intents')
          WHERE json_extract(value, '$.operation') IN ('create', 'alternative'))
    AND NOT EXISTS (
      SELECT 1 FROM json_each(${command}, '$.intents')
      WHERE json_extract(value, '$.suggestionID') IS NOT NULL
      GROUP BY json_extract(value, '$.suggestionID') HAVING count(*) > 1
    )`
}

function resultMatchesMaterialized(result: string, candidate: string) {
  return `json_type(${result}, '$.intentResults') = 'array'
    AND json_array_length(${result}, '$.intentResults') = json_array_length(${candidate}, '$.materialized')
    AND NOT EXISTS (
      SELECT 1
      FROM json_each(${candidate}, '$.materialized') AS materialized
      LEFT JOIN json_each(${result}, '$.intentResults') AS outcome ON outcome.key = materialized.key
      WHERE json_type(outcome.value) <> 'object'
        OR json_extract(outcome.value, '$.operationOrdinal') <> CAST(materialized.key AS INTEGER)
        OR json_extract(outcome.value, '$.outcome') <> json_extract(materialized.value, '$.outcome')
        OR json_extract(outcome.value, '$.suggestionID') <> json_extract(materialized.value, '$.suggestionID')
        OR json_extract(outcome.value, '$.operation') <> json_extract(materialized.value, '$.operation')
        OR json_extract(outcome.value, '$.revisionID') <> CASE
          WHEN json_extract(materialized.value, '$.outcome') = 'no_change'
            THEN json_extract(materialized.value, '$.previous.current.id')
          ELSE json_extract(materialized.value, '$.revisionID') END
        OR json_extract(outcome.value, '$.version') <> CASE
          WHEN json_extract(materialized.value, '$.outcome') = 'no_change'
            THEN json_extract(materialized.value, '$.previous.current.version')
          ELSE json_extract(materialized.value, '$.version') END
        OR json_extract(outcome.value, '$.disposition') <> CASE
          WHEN json_extract(materialized.value, '$.outcome') = 'no_change'
            THEN json_extract(materialized.value, '$.previous.current.disposition')
          ELSE json_extract(materialized.value, '$.disposition') END
        OR json(json_extract(outcome.value, '$.alternativeToRevision')) IS NOT
          json(json_extract(materialized.value, '$.alternativeToRevision'))
    )`
}

const statements = [
  ...immutable.map(
    (table) => `CREATE TRIGGER IF NOT EXISTS ${table}_immutable
      BEFORE UPDATE ON ${table}
      BEGIN SELECT RAISE(ABORT, 'Advisory-suggestion rows are immutable'); END`,
  ),
  ...durable.map(
    (table) => `CREATE TRIGGER IF NOT EXISTS ${table}_no_delete
      BEFORE DELETE ON ${table}
      BEGIN SELECT RAISE(ABORT, 'Durable advisory-suggestion rows cannot be deleted'); END`,
  ),
  ...[
    "advisory_plan_suggestion_disposition",
    "advisory_plan_suggestion_capability_issue",
    "advisory_plan_suggestion_capability_settlement",
  ].map(
    (table) => `CREATE TRIGGER IF NOT EXISTS ${table}_sealed_no_delete
      BEFORE DELETE ON ${table}
      WHEN ${sealedInvocation("OLD.invocation_part_id")}
      BEGIN SELECT RAISE(ABORT, 'Sealed advisory-suggestion evidence cannot be deleted'); END`,
  ),
  `CREATE TRIGGER IF NOT EXISTS advisory_plan_suggestion_disposition_validate
    BEFORE INSERT ON advisory_plan_suggestion_disposition
    WHEN NEW.disposition = 'candidate_v1' AND NOT EXISTS (
      SELECT 1 FROM learning_command_invocation AS invocation
      WHERE invocation.part_id = NEW.invocation_part_id
        AND invocation.command_name = 'update_advisory_plan_suggestion'
        AND invocation.command_version = 1
        AND invocation.status = 'admitted'
        AND ${commandAndCandidateBinding("NEW.materialized_candidate", "NEW.canonical_command", "NEW", "invocation")}
    )
    BEGIN SELECT RAISE(ABORT, 'Invalid advisory-suggestion candidate'); END`,
  `CREATE TRIGGER IF NOT EXISTS advisory_plan_suggestion_disposition_terminal_validate
    BEFORE INSERT ON advisory_plan_suggestion_disposition
    WHEN NEW.disposition = 'semantic_terminal_v1' AND NOT (
      NEW.semantic_outcome IN ('same_effect', 'same_no_change', 'semantic_conflict')
      AND NEW.agent_action_fingerprint IS NULL AND NEW.agent_action IS NULL AND NEW.materialized_candidate IS NULL
      AND ((NEW.existing_effect_id IS NOT NULL AND NEW.existing_no_change_part_id IS NULL)
        OR (NEW.existing_effect_id IS NULL AND NEW.existing_no_change_part_id IS NOT NULL))
    )
    BEGIN SELECT RAISE(ABORT, 'Invalid advisory-suggestion semantic terminal'); END`,
  `CREATE TRIGGER IF NOT EXISTS advisory_plan_suggestion_disposition_late_insert
    BEFORE INSERT ON advisory_plan_suggestion_disposition
    WHEN ${sealedInvocation("NEW.invocation_part_id")}
    BEGIN SELECT RAISE(ABORT, 'Cannot add disposition after advisory-suggestion seal'); END`,
  `CREATE TRIGGER IF NOT EXISTS advisory_plan_suggestion_capability_issue_late_insert
    BEFORE INSERT ON advisory_plan_suggestion_capability_issue
    WHEN ${sealedInvocation("NEW.invocation_part_id")}
    BEGIN SELECT RAISE(ABORT, 'Cannot add capability issue after advisory-suggestion seal'); END`,
  `CREATE TRIGGER IF NOT EXISTS advisory_plan_suggestion_capability_settlement_late_insert
    BEFORE INSERT ON advisory_plan_suggestion_capability_settlement
    WHEN ${sealedInvocation("NEW.invocation_part_id")}
    BEGIN SELECT RAISE(ABORT, 'Cannot add capability settlement after advisory-suggestion seal'); END`,
  `CREATE TRIGGER IF NOT EXISTS advisory_plan_suggestion_identity_validate
    BEFORE INSERT ON advisory_plan_suggestion
    WHEN NOT EXISTS (
      SELECT 1
      FROM advisory_plan_suggestion_effect AS effect
      JOIN advisory_plan_suggestion_disposition AS disposition
        ON disposition.invocation_part_id = effect.invocation_part_id
      JOIN json_each(disposition.materialized_candidate, '$.materialized') AS materialized
        ON json_extract(materialized.value, '$.suggestionID') = NEW.id
      WHERE json_extract(materialized.value, '$.outcome') = 'changed'
        AND json_type(materialized.value, '$.previous') IS NULL
        AND NEW.time_created = effect.time_committed
        AND json_extract(materialized.value, '$.alternativeToRevision.suggestionID') IS
          NEW.alternative_target_suggestion_id
        AND json_extract(materialized.value, '$.alternativeToRevision.revisionID') IS
          NEW.alternative_target_revision_id
        AND json_extract(materialized.value, '$.alternativeToRevision.version') IS NEW.alternative_target_version
        AND (NEW.alternative_target_revision_id IS NULL OR EXISTS (
          SELECT 1
          FROM advisory_plan_suggestion_revision AS target
          JOIN advisory_plan_suggestion_commit_seal AS target_seal ON target_seal.effect_id = target.effect_id
          WHERE target.id = NEW.alternative_target_revision_id
            AND target.suggestion_id = NEW.alternative_target_suggestion_id
            AND target.version = NEW.alternative_target_version
            AND target.frontier_sequence < effect.frontier_sequence
            AND NOT EXISTS (
              SELECT 1 FROM advisory_plan_suggestion_revision AS successor
              JOIN advisory_plan_suggestion_commit_seal AS successor_seal
                ON successor_seal.effect_id = successor.effect_id
              WHERE successor.predecessor_revision_id = target.id
                AND successor.frontier_sequence <= effect.frontier_sequence
            )
        ))
    )
    BEGIN SELECT RAISE(ABORT, 'Invalid advisory-suggestion identity'); END`,
  `CREATE TRIGGER IF NOT EXISTS advisory_plan_suggestion_effect_validate
    BEFORE INSERT ON advisory_plan_suggestion_effect
    WHEN NOT EXISTS (
      SELECT 1
      FROM advisory_plan_suggestion_disposition AS disposition
      JOIN learning_command_invocation AS invocation ON invocation.part_id = disposition.invocation_part_id
      JOIN learning_command_receipt AS receipt ON receipt.id = NEW.physical_receipt_id
      WHERE disposition.invocation_part_id = NEW.invocation_part_id
        AND disposition.disposition = 'candidate_v1'
        AND json(disposition.materialized_candidate) = json(NEW.admission_projection)
        AND json(disposition.canonical_command) = json(NEW.canonical_command)
        AND disposition.command_fingerprint = NEW.command_fingerprint
        AND disposition.semantic_address_fingerprint = NEW.semantic_address_fingerprint
        AND json_extract(disposition.materialized_candidate, '$.effectID') = NEW.id
        AND receipt.invocation_part_id = NEW.invocation_part_id
        AND NEW.cause_type = json_extract(NEW.canonical_command, '$.cause.type')
        AND NEW.semantic_slot = 'suggestion_change_set'
        AND ${resultMatchesMaterialized("NEW.result", "NEW.admission_projection")}
        AND EXISTS (SELECT 1 FROM json_each(NEW.admission_projection, '$.materialized')
          WHERE json_extract(value, '$.outcome') = 'changed')
    )
    BEGIN SELECT RAISE(ABORT, 'Invalid advisory-suggestion effect'); END`,
  `CREATE TRIGGER IF NOT EXISTS advisory_plan_suggestion_revision_validate
    BEFORE INSERT ON advisory_plan_suggestion_revision
    WHEN NOT EXISTS (
      SELECT 1
      FROM advisory_plan_suggestion_effect AS effect
      JOIN advisory_plan_suggestion_disposition AS disposition
        ON disposition.invocation_part_id = effect.invocation_part_id
      JOIN advisory_plan_suggestion AS identity ON identity.id = NEW.suggestion_id
      JOIN json_each(disposition.materialized_candidate, '$.materialized') AS materialized
        ON CAST(materialized.key AS INTEGER) = NEW.operation_ordinal
      WHERE effect.id = NEW.effect_id
        AND disposition.disposition = 'candidate_v1'
        AND json_extract(materialized.value, '$.outcome') = 'changed'
        AND json_extract(materialized.value, '$.revisionID') = NEW.id
        AND json_extract(materialized.value, '$.suggestionID') = NEW.suggestion_id
        AND json_extract(materialized.value, '$.version') = NEW.version
        AND json_extract(materialized.value, '$.predecessorRevisionID') IS NEW.predecessor_revision_id
        AND json_extract(materialized.value, '$.operation') = NEW.operation
        AND json_extract(materialized.value, '$.disposition') = NEW.disposition
        AND json(json_extract(materialized.value, '$.snapshot')) = json(NEW.snapshot)
        AND json(json_extract(materialized.value, '$.authorAndCause')) = json(NEW.author_and_cause)
        AND json_extract(materialized.value, '$.alternativeToRevision.suggestionID') IS
          NEW.alternative_target_suggestion_id
        AND json_extract(materialized.value, '$.alternativeToRevision.revisionID') IS
          NEW.alternative_target_revision_id
        AND json_extract(materialized.value, '$.alternativeToRevision.version') IS NEW.alternative_target_version
        AND identity.alternative_target_suggestion_id IS NEW.alternative_target_suggestion_id
        AND identity.alternative_target_revision_id IS NEW.alternative_target_revision_id
        AND identity.alternative_target_version IS NEW.alternative_target_version
        AND NEW.time_committed = effect.time_committed
        AND NEW.commit_order = effect.commit_order
        AND NEW.frontier_sequence = effect.frontier_sequence
    )
    BEGIN SELECT RAISE(ABORT, 'Invalid advisory-suggestion revision'); END`,
  `CREATE TRIGGER IF NOT EXISTS advisory_plan_suggestion_revision_late_insert
    BEFORE INSERT ON advisory_plan_suggestion_revision
    WHEN EXISTS (SELECT 1 FROM advisory_plan_suggestion_commit_seal WHERE effect_id = NEW.effect_id)
    BEGIN SELECT RAISE(ABORT, 'Cannot add revision after advisory-suggestion seal'); END`,
  `CREATE TRIGGER IF NOT EXISTS advisory_plan_suggestion_anchor_validate
    BEFORE INSERT ON advisory_plan_suggestion_anchor
    WHEN NOT EXISTS (
      SELECT 1 FROM advisory_plan_suggestion_revision AS revision
      WHERE revision.id = NEW.revision_id
        AND revision.retrieval_scope_type = 'anchored'
        AND NEW.ordinal < revision.retrieval_anchor_count
        AND json(json_extract(revision.snapshot, '$.retrievalScope.anchors[' || NEW.ordinal || ']')) = json(NEW.binding)
        AND json_extract(NEW.binding, '$.stableOwnerKey.type') = NEW.key_type
        AND json_extract(NEW.binding, '$.exactBound.ref.type') = NEW.exact_ref_type
        AND json_extract(NEW.binding, '$.exactBound.refFingerprint') = NEW.exact_ref_fingerprint
        AND json_extract(NEW.binding, '$.exactBound.firstBoundRevisionID') = NEW.first_bound_revision_id
        AND ((NEW.first_bound_revision_id = NEW.revision_id
              AND (revision.predecessor_revision_id IS NULL OR NOT EXISTS (
                SELECT 1 FROM advisory_plan_suggestion_anchor AS previous
                WHERE previous.revision_id = revision.predecessor_revision_id
                  AND previous.exact_ref_fingerprint = NEW.exact_ref_fingerprint
              )))
          OR (NEW.first_bound_revision_id <> NEW.revision_id
              AND revision.predecessor_revision_id IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM advisory_plan_suggestion_anchor AS previous
                WHERE previous.revision_id = revision.predecessor_revision_id
                  AND previous.exact_ref_fingerprint = NEW.exact_ref_fingerprint
                  AND previous.first_bound_revision_id = NEW.first_bound_revision_id
                  AND json(previous.binding) = json(NEW.binding)
              )))
    )
    BEGIN SELECT RAISE(ABORT, 'Invalid advisory-suggestion retrieval anchor'); END`,
  `CREATE TRIGGER IF NOT EXISTS advisory_plan_suggestion_basis_validate
    BEFORE INSERT ON advisory_plan_suggestion_basis
    WHEN NOT EXISTS (
      SELECT 1 FROM advisory_plan_suggestion_revision AS revision
      WHERE revision.id = NEW.revision_id
        AND NEW.ordinal < revision.basis_count
        AND json(json_extract(revision.snapshot, '$.exactBasis[' || NEW.ordinal || ']')) = json(NEW.binding)
        AND json_extract(NEW.binding, '$.ref.type') = NEW.ref_type
        AND json_extract(NEW.binding, '$.refFingerprint') = NEW.ref_fingerprint
        AND json_extract(NEW.binding, '$.firstBoundRevisionID') = NEW.first_bound_revision_id
        AND ((NEW.first_bound_revision_id = NEW.revision_id
              AND (revision.predecessor_revision_id IS NULL OR NOT EXISTS (
                SELECT 1 FROM advisory_plan_suggestion_basis AS previous
                WHERE previous.revision_id = revision.predecessor_revision_id
                  AND previous.ref_fingerprint = NEW.ref_fingerprint
              )))
          OR (NEW.first_bound_revision_id <> NEW.revision_id
              AND revision.predecessor_revision_id IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM advisory_plan_suggestion_basis AS previous
                WHERE previous.revision_id = revision.predecessor_revision_id
                  AND previous.ref_fingerprint = NEW.ref_fingerprint
                  AND previous.first_bound_revision_id = NEW.first_bound_revision_id
                  AND json(previous.binding) = json(NEW.binding)
              )))
    )
    BEGIN SELECT RAISE(ABORT, 'Invalid advisory-suggestion basis'); END`,
  `CREATE TRIGGER IF NOT EXISTS advisory_plan_suggestion_no_change_validate
    BEFORE INSERT ON advisory_plan_suggestion_no_change_seal
    WHEN NOT EXISTS (
      SELECT 1
      FROM advisory_plan_suggestion_disposition AS disposition
      JOIN advisory_plan_suggestion_capability_settlement AS capability
        ON capability.invocation_part_id = disposition.invocation_part_id
      JOIN learning_command_receipt AS receipt ON receipt.id = NEW.receipt_id
      WHERE disposition.invocation_part_id = NEW.invocation_part_id
        AND disposition.disposition = 'candidate_v1'
        AND capability.outcome IN ('policy_allow', 'prompted_allow')
        AND capability.agent_action_fingerprint = disposition.agent_action_fingerprint
        AND receipt.invocation_part_id = NEW.invocation_part_id
        AND NEW.time_committed = receipt.time_committed
        AND NEW.commit_order = receipt.commit_order
        AND NEW.semantic_address_fingerprint = disposition.semantic_address_fingerprint
        AND NEW.command_fingerprint = disposition.command_fingerprint
        AND json(NEW.canonical_command) = json(disposition.canonical_command)
        AND json(NEW.materialized_candidate) = json(disposition.materialized_candidate)
        AND json_extract(NEW.result, '$.outcome') = 'no_change'
        AND json_extract(NEW.result, '$.advisoryPlanSuggestionKind') = 'change_set'
        AND json_extract(NEW.result, '$.existingOutcome') = 'materialized_no_change'
        AND ${resultMatchesMaterialized("NEW.result", "NEW.materialized_candidate")}
        AND NOT EXISTS (SELECT 1 FROM json_each(NEW.materialized_candidate, '$.materialized')
          WHERE json_extract(value, '$.outcome') <> 'no_change'
            OR json_extract(value, '$.operation') <> 'revise')
        AND NOT EXISTS (SELECT 1 FROM advisory_plan_suggestion_effect
          WHERE semantic_address_fingerprint = NEW.semantic_address_fingerprint)
    )
    BEGIN SELECT RAISE(ABORT, 'Invalid advisory-suggestion no-change seal'); END`,
  `CREATE TRIGGER IF NOT EXISTS advisory_plan_suggestion_commit_seal_validate
    BEFORE INSERT ON advisory_plan_suggestion_commit_seal
    WHEN NOT EXISTS (
      SELECT 1
      FROM advisory_plan_suggestion_effect AS effect
      JOIN advisory_plan_suggestion_disposition AS disposition
        ON disposition.invocation_part_id = effect.invocation_part_id
      JOIN advisory_plan_suggestion_capability_settlement AS capability
        ON capability.invocation_part_id = effect.invocation_part_id
      JOIN learning_command_invocation AS invocation ON invocation.part_id = effect.invocation_part_id
      JOIN learning_command_receipt AS receipt ON receipt.id = effect.physical_receipt_id
      WHERE effect.id = NEW.effect_id
        AND disposition.disposition = 'candidate_v1'
        AND capability.outcome IN ('policy_allow', 'prompted_allow')
        AND capability.agent_action_fingerprint = disposition.agent_action_fingerprint
        AND invocation.part_id = NEW.invocation_part_id
        AND invocation.status = 'applied'
        AND invocation.receipt_id = NEW.receipt_id
        AND receipt.id = NEW.receipt_id
        AND receipt.invocation_part_id = NEW.invocation_part_id
        AND NEW.time_sealed = effect.time_committed
        AND NEW.seal_order = effect.commit_order
        AND json_extract(invocation.settlement, '$.outcome') = 'applied'
        AND json_extract(invocation.settlement, '$.advisoryPlanSuggestionKind') = 'change_set'
        AND json_extract(invocation.settlement, '$.effectID') = effect.id
        AND json_extract(invocation.settlement, '$.receiptID') = receipt.id
        AND json(json_extract(invocation.settlement, '$.intentResults')) =
          json(json_extract(effect.result, '$.intentResults'))
        AND json_extract(invocation.settlement, '$.frontierSequence') = effect.frontier_sequence
        AND (SELECT count(*) FROM advisory_plan_suggestion_revision AS revision
          WHERE revision.effect_id = effect.id) =
          (SELECT count(*) FROM json_each(disposition.materialized_candidate, '$.materialized')
            WHERE json_extract(value, '$.outcome') = 'changed')
        AND NOT EXISTS (
          SELECT 1 FROM json_each(disposition.materialized_candidate, '$.materialized') AS materialized
          WHERE json_extract(materialized.value, '$.outcome') = 'changed'
            AND NOT EXISTS (
              SELECT 1 FROM advisory_plan_suggestion_revision AS revision
              WHERE revision.effect_id = effect.id
                AND revision.operation_ordinal = CAST(materialized.key AS INTEGER)
                AND revision.id = json_extract(materialized.value, '$.revisionID')
                AND (SELECT count(*) FROM advisory_plan_suggestion_anchor WHERE revision_id = revision.id) =
                  revision.retrieval_anchor_count
                AND (SELECT count(*) FROM advisory_plan_suggestion_basis WHERE revision_id = revision.id) =
                  revision.basis_count
            )
        )
    )
    BEGIN SELECT RAISE(ABORT, 'Invalid advisory-suggestion commit seal'); END`,
]

export { statements }
