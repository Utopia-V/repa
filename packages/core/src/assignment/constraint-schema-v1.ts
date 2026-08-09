export * as AssignmentConstraintSchema from "./constraint-schema-v1"

export const statements = [
  `CREATE TRIGGER IF NOT EXISTS assignment_identity_immutable
    BEFORE UPDATE ON assignment
    BEGIN
      SELECT RAISE(ABORT, 'Assignment identity is immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_identity_no_delete
    BEFORE DELETE ON assignment
    BEGIN
      SELECT RAISE(ABORT, 'Assignment identity cannot be deleted');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_disposition_immutable
    BEFORE UPDATE ON assignment_disposition
    BEGIN
      SELECT RAISE(ABORT, 'Assignment disposition evidence is immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_disposition_no_delete
    BEFORE DELETE ON assignment_disposition
    BEGIN
      SELECT RAISE(ABORT, 'Assignment disposition evidence cannot be deleted');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_capability_issue_immutable
    BEFORE UPDATE ON assignment_capability_issue
    BEGIN
      SELECT RAISE(ABORT, 'Assignment capability issue is immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_capability_issue_no_delete
    BEFORE DELETE ON assignment_capability_issue
    BEGIN
      SELECT RAISE(ABORT, 'Assignment capability issue cannot be deleted');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_capability_issue_late_insert_closed
    BEFORE INSERT ON assignment_capability_issue
    WHEN EXISTS (
      SELECT 1
      FROM assignment_effect AS effect
      JOIN assignment_commit_seal AS seal ON seal.effect_id = effect.id
      WHERE effect.invocation_part_id = NEW.invocation_part_id
      UNION ALL
      SELECT 1
      FROM assignment_no_change_seal AS seal
      WHERE seal.invocation_part_id = NEW.invocation_part_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'Assignment sealed invocation cannot receive a late capability issue');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_capability_settlement_immutable
    BEFORE UPDATE ON assignment_capability_settlement
    BEGIN
      SELECT RAISE(ABORT, 'Assignment capability settlement is immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_capability_settlement_no_delete
    BEFORE DELETE ON assignment_capability_settlement
    BEGIN
      SELECT RAISE(ABORT, 'Assignment capability settlement cannot be deleted');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_revision_insert_validate
    BEFORE INSERT ON assignment_revision
    BEGIN
      SELECT CASE WHEN NOT EXISTS (
        SELECT 1
        FROM assignment_effect AS effect
        WHERE effect.id = NEW.effect_id
          AND NEW.time_committed = effect.time_committed
          AND NEW.commit_order = effect.commit_order
          AND NEW.frontier_sequence = effect.frontier_sequence
          AND json_extract(NEW.mutation_authorship_basis, '$.type') = effect.cause_type
          AND json_extract(NEW.mutation_authorship_basis, '$.assistantMessageID') = effect.model_operation_id
          AND json_extract(NEW.mutation_authorship_basis, '$.occurrenceID') = effect.occurrence_id
          AND json_extract(NEW.mutation_authorship_basis, '$.invocationPartID') = effect.invocation_part_id
      ) THEN RAISE(ABORT, 'Assignment revision does not match its producing effect') END;

      SELECT CASE WHEN NOT (
        json_type(NEW.snapshot) = 'object'
        AND (SELECT count(*) FROM json_each(NEW.snapshot)) =
          CASE WHEN NEW.expiry_boundary IS NULL THEN 4 ELSE 5 END
        AND json_type(NEW.snapshot, '$.obligationSummary') = 'text'
        AND json_extract(NEW.snapshot, '$.obligationSummary') = NEW.obligation_summary
        AND json_type(NEW.snapshot, '$.learningContext') = 'text'
        AND json_extract(NEW.snapshot, '$.learningContext') = NEW.learning_context
        AND json_type(NEW.snapshot, '$.scope') = 'object'
        AND json_extract(NEW.snapshot, '$.scope.type') = NEW.scope_type
        AND ((NEW.scope_type = 'learner_home'
              AND (SELECT count(*) FROM json_each(json_extract(NEW.snapshot, '$.scope'))) = 1)
          OR (NEW.scope_type = 'courses'
              AND (SELECT count(*) FROM json_each(json_extract(NEW.snapshot, '$.scope'))) = 2
              AND json_type(NEW.snapshot, '$.scope.courseIDs') = 'array'
              AND json_array_length(NEW.snapshot, '$.scope.courseIDs') = NEW.scope_count
              AND (SELECT count(DISTINCT value) FROM json_each(NEW.snapshot, '$.scope.courseIDs')) = NEW.scope_count
              AND NOT EXISTS (
                SELECT 1 FROM json_each(NEW.snapshot, '$.scope.courseIDs') WHERE type <> 'text'
              )))
        AND json(NEW.due_basis) = json(json_extract(NEW.snapshot, '$.dueBasis'))
        AND ((NEW.expiry_boundary IS NULL AND json_type(NEW.snapshot, '$.expiryBoundary') IS NULL)
          OR (NEW.expiry_boundary IS NOT NULL
              AND json(NEW.expiry_boundary) = json(json_extract(NEW.snapshot, '$.expiryBoundary'))))
      ) THEN RAISE(ABORT, 'Assignment revision snapshot is not one exact complete value') END;

      SELECT CASE WHEN NOT (
        (json_extract(NEW.due_basis, '$.type') IN ('unresolved', 'explicitly_no_deadline')
          AND json_type(NEW.due_basis) = 'object'
          AND (SELECT count(*) FROM json_each(NEW.due_basis)) = 1)
        OR (json_extract(NEW.due_basis, '$.type') = 'local_date'
          AND json_type(NEW.due_basis) = 'object'
          AND (SELECT count(*) FROM json_each(NEW.due_basis)) = 4
          AND json_type(NEW.due_basis, '$.civilDate') = 'text'
          AND length(json_extract(NEW.due_basis, '$.civilDate')) = 10
          AND json_extract(NEW.due_basis, '$.civilDate') GLOB
            '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          AND COALESCE(
            date(json_extract(NEW.due_basis, '$.civilDate'), '+0 days')
              = json_extract(NEW.due_basis, '$.civilDate'),
            0
          )
          AND json_extract(NEW.due_basis, '$.comparator') IN ('inclusive', 'exclusive')
          AND json_type(NEW.due_basis, '$.resolvedZone') = 'object'
          AND ((json_extract(NEW.due_basis, '$.resolvedZone.type') = 'fixed_offset'
                AND (SELECT count(*) FROM json_each(json_extract(NEW.due_basis, '$.resolvedZone'))) = 2
                AND json_type(NEW.due_basis, '$.resolvedZone.offsetMinutes') = 'integer'
                AND json_extract(NEW.due_basis, '$.resolvedZone.offsetMinutes') BETWEEN -840 AND 840)
            OR (json_extract(NEW.due_basis, '$.resolvedZone.type') = 'iana'
                AND (SELECT count(*) FROM json_each(json_extract(NEW.due_basis, '$.resolvedZone'))) = 3
                AND json_type(NEW.due_basis, '$.resolvedZone.name') = 'text'
                AND length(json_extract(NEW.due_basis, '$.resolvedZone.name')) > 0
                AND json_extract(NEW.due_basis, '$.resolvedZone.releaseID') = 'iana-tzdb-2026c')))
        OR (json_extract(NEW.due_basis, '$.type') = 'instant'
          AND json_type(NEW.due_basis) = 'object'
          AND (SELECT count(*) FROM json_each(NEW.due_basis)) = 7
          AND json_type(NEW.due_basis, '$.sourceExpression') = 'text'
          AND length(json_extract(NEW.due_basis, '$.sourceExpression')) > 0
          AND json_type(NEW.due_basis, '$.localDateTime') = 'text'
          AND length(json_extract(NEW.due_basis, '$.localDateTime')) > 0
          AND json_type(NEW.due_basis, '$.normalizedInstant') = 'integer'
          AND json_extract(NEW.due_basis, '$.normalizedInstant') >= 0
          AND json_type(NEW.due_basis, '$.utcOffsetMinutes') = 'integer'
          AND json_extract(NEW.due_basis, '$.utcOffsetMinutes') BETWEEN -840 AND 840
          AND json_extract(NEW.due_basis, '$.comparator') IN ('inclusive', 'exclusive')
          AND json_type(NEW.due_basis, '$.resolvedZone') = 'object'
          AND ((json_extract(NEW.due_basis, '$.resolvedZone.type') = 'fixed_offset'
                AND (SELECT count(*) FROM json_each(json_extract(NEW.due_basis, '$.resolvedZone'))) = 2
                AND json_type(NEW.due_basis, '$.resolvedZone.offsetMinutes') = 'integer'
                AND json_extract(NEW.due_basis, '$.resolvedZone.offsetMinutes') BETWEEN -840 AND 840)
            OR (json_extract(NEW.due_basis, '$.resolvedZone.type') = 'iana'
                AND (SELECT count(*) FROM json_each(json_extract(NEW.due_basis, '$.resolvedZone'))) = 3
                AND json_type(NEW.due_basis, '$.resolvedZone.name') = 'text'
                AND length(json_extract(NEW.due_basis, '$.resolvedZone.name')) > 0
                AND json_extract(NEW.due_basis, '$.resolvedZone.releaseID') = 'iana-tzdb-2026c')))
      ) THEN RAISE(ABORT, 'Assignment due basis is not a closed temporal arm') END;

      SELECT CASE WHEN NEW.expiry_boundary IS NOT NULL AND NOT (
        (json_extract(NEW.expiry_boundary, '$.type') = 'local_date'
          AND json_type(NEW.expiry_boundary) = 'object'
          AND (SELECT count(*) FROM json_each(NEW.expiry_boundary)) = 4
          AND json_type(NEW.expiry_boundary, '$.civilDate') = 'text'
          AND length(json_extract(NEW.expiry_boundary, '$.civilDate')) = 10
          AND json_extract(NEW.expiry_boundary, '$.civilDate') GLOB
            '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          AND COALESCE(
            date(json_extract(NEW.expiry_boundary, '$.civilDate'), '+0 days')
              = json_extract(NEW.expiry_boundary, '$.civilDate'),
            0
          )
          AND json_extract(NEW.expiry_boundary, '$.comparator') IN ('inclusive', 'exclusive')
          AND json_type(NEW.expiry_boundary, '$.resolvedZone') = 'object'
          AND ((json_extract(NEW.expiry_boundary, '$.resolvedZone.type') = 'fixed_offset'
                AND (SELECT count(*) FROM json_each(json_extract(NEW.expiry_boundary, '$.resolvedZone'))) = 2
                AND json_type(NEW.expiry_boundary, '$.resolvedZone.offsetMinutes') = 'integer'
                AND json_extract(NEW.expiry_boundary, '$.resolvedZone.offsetMinutes') BETWEEN -840 AND 840)
            OR (json_extract(NEW.expiry_boundary, '$.resolvedZone.type') = 'iana'
                AND (SELECT count(*) FROM json_each(json_extract(NEW.expiry_boundary, '$.resolvedZone'))) = 3
                AND json_type(NEW.expiry_boundary, '$.resolvedZone.name') = 'text'
                AND length(json_extract(NEW.expiry_boundary, '$.resolvedZone.name')) > 0
                AND json_extract(NEW.expiry_boundary, '$.resolvedZone.releaseID') = 'iana-tzdb-2026c')))
        OR (json_extract(NEW.expiry_boundary, '$.type') = 'instant'
          AND json_type(NEW.expiry_boundary) = 'object'
          AND (SELECT count(*) FROM json_each(NEW.expiry_boundary)) = 7
          AND json_type(NEW.expiry_boundary, '$.sourceExpression') = 'text'
          AND length(json_extract(NEW.expiry_boundary, '$.sourceExpression')) > 0
          AND json_type(NEW.expiry_boundary, '$.localDateTime') = 'text'
          AND length(json_extract(NEW.expiry_boundary, '$.localDateTime')) > 0
          AND json_type(NEW.expiry_boundary, '$.normalizedInstant') = 'integer'
          AND json_extract(NEW.expiry_boundary, '$.normalizedInstant') >= 0
          AND json_type(NEW.expiry_boundary, '$.utcOffsetMinutes') = 'integer'
          AND json_extract(NEW.expiry_boundary, '$.utcOffsetMinutes') BETWEEN -840 AND 840
          AND json_extract(NEW.expiry_boundary, '$.comparator') IN ('inclusive', 'exclusive')
          AND json_type(NEW.expiry_boundary, '$.resolvedZone') = 'object'
          AND ((json_extract(NEW.expiry_boundary, '$.resolvedZone.type') = 'fixed_offset'
                AND (SELECT count(*) FROM json_each(json_extract(NEW.expiry_boundary, '$.resolvedZone'))) = 2
                AND json_type(NEW.expiry_boundary, '$.resolvedZone.offsetMinutes') = 'integer'
                AND json_extract(NEW.expiry_boundary, '$.resolvedZone.offsetMinutes') BETWEEN -840 AND 840)
            OR (json_extract(NEW.expiry_boundary, '$.resolvedZone.type') = 'iana'
                AND (SELECT count(*) FROM json_each(json_extract(NEW.expiry_boundary, '$.resolvedZone'))) = 3
                AND json_type(NEW.expiry_boundary, '$.resolvedZone.name') = 'text'
                AND length(json_extract(NEW.expiry_boundary, '$.resolvedZone.name')) > 0
                AND json_extract(NEW.expiry_boundary, '$.resolvedZone.releaseID') = 'iana-tzdb-2026c')))
      ) THEN RAISE(ABORT, 'Assignment expiry boundary is not a closed temporal arm') END;

      SELECT CASE WHEN NOT (
        (NEW.effective_source_type = 'learner_occurrence'
          AND json_extract(NEW.effective_source_basis, '$.type') = 'learner_occurrence'
          AND (SELECT count(*) FROM json_each(NEW.effective_source_basis)) = 10
          AND json_extract(NEW.effective_source_basis, '$.occurrenceID') = NEW.effective_occurrence_id
          AND json_type(NEW.effective_source_basis, '$.sourceOrder') = 'integer'
          AND json_extract(NEW.effective_source_basis, '$.sourceOrder') >= 1
          AND json_type(NEW.effective_source_basis, '$.sessionID') = 'text'
          AND json_type(NEW.effective_source_basis, '$.messageID') = 'text'
          AND json_type(NEW.effective_source_basis, '$.turnID') = 'text'
          AND json_type(NEW.effective_source_basis, '$.inputID') = 'text'
          AND json_type(NEW.effective_source_basis, '$.timeAdmitted') = 'integer'
          AND json_type(NEW.effective_source_basis, '$.excerpt') = 'object'
          AND (SELECT count(*) FROM json_each(json_extract(NEW.effective_source_basis, '$.excerpt'))) = 4
          AND json_type(NEW.effective_source_basis, '$.excerpt.text') = 'text'
          AND json_type(NEW.effective_source_basis, '$.excerpt.startByte') = 'integer'
          AND json_type(NEW.effective_source_basis, '$.excerpt.endByte') = 'integer'
          AND json_extract(NEW.effective_source_basis, '$.excerpt.startByte') >= 0
          AND json_extract(NEW.effective_source_basis, '$.excerpt.endByte') >
            json_extract(NEW.effective_source_basis, '$.excerpt.startByte')
          AND length(json_extract(NEW.effective_source_basis, '$.excerpt.sha256')) = 64
          AND json_type(NEW.effective_source_basis, '$.sourceTemporalContext') = 'object'
          AND ((json_extract(NEW.effective_source_basis, '$.sourceTemporalContext.state') = 'resolved'
                AND (SELECT count(*) FROM json_each(json_extract(
                  NEW.effective_source_basis, '$.sourceTemporalContext'))) = 4
                AND json_type(NEW.effective_source_basis, '$.sourceTemporalContext.instant') = 'integer'
                AND json_type(NEW.effective_source_basis, '$.sourceTemporalContext.timeZone') = 'text'
                AND json_type(NEW.effective_source_basis, '$.sourceTemporalContext.utcOffsetMinutes') = 'integer')
            OR (json_extract(NEW.effective_source_basis, '$.sourceTemporalContext.state') = 'unavailable'
                AND (SELECT count(*) FROM json_each(json_extract(
                  NEW.effective_source_basis, '$.sourceTemporalContext'))) = 3
                AND json_type(NEW.effective_source_basis, '$.sourceTemporalContext.instant') = 'integer'
                AND json_extract(NEW.effective_source_basis, '$.sourceTemporalContext.reason') =
                  'timezone_unavailable')))
        OR (NEW.effective_source_type = 'artifact_revision'
          AND json_extract(NEW.effective_source_basis, '$.type') = 'artifact_revision'
          AND (SELECT count(*) FROM json_each(NEW.effective_source_basis)) = 6
          AND json_type(NEW.effective_source_basis, '$.artifactID') = 'text'
          AND json_extract(NEW.effective_source_basis, '$.revisionID') = NEW.effective_artifact_revision_id
          AND json_type(NEW.effective_source_basis, '$.attribution') = 'object'
          AND json_type(NEW.effective_source_basis, '$.selector') = 'object'
          AND json_type(NEW.effective_source_basis, '$.selector.locator') = 'text'
          AND length(json_extract(NEW.effective_source_basis, '$.selector.locatorDigest')) = 64
          AND json_type(NEW.effective_source_basis, '$.admission') = 'object')
        OR (NEW.effective_source_type = 'representation_revision'
          AND json_extract(NEW.effective_source_basis, '$.type') = 'representation_revision'
          AND (SELECT count(*) FROM json_each(NEW.effective_source_basis)) = 4
          AND json_extract(NEW.effective_source_basis, '$.representationRevisionID') =
            NEW.effective_representation_revision_id
          AND json_type(NEW.effective_source_basis, '$.selector') = 'object'
          AND json_type(NEW.effective_source_basis, '$.selector.locator') = 'text'
          AND length(json_extract(NEW.effective_source_basis, '$.selector.locatorDigest')) = 64
          AND json_type(NEW.effective_source_basis, '$.admission') = 'object')
      ) THEN RAISE(ABORT, 'Assignment effective source basis is not a closed owner arm') END;

      SELECT CASE WHEN NOT (
        (NEW.version = 1
          AND NEW.source_basis_relation = 'corrected_with_new_exact_source'
          AND json(NEW.creation_source_basis) = json(NEW.effective_source_basis))
        OR (NEW.version > 1 AND EXISTS (
          SELECT 1
          FROM assignment_revision AS predecessor
          WHERE predecessor.id = NEW.predecessor_revision_id
            AND predecessor.assignment_id = NEW.assignment_id
            AND predecessor.version + 1 = NEW.version
            AND json(predecessor.creation_source_basis) = json(NEW.creation_source_basis)
            AND ((NEW.source_basis_relation = 'carried'
                  AND json(predecessor.effective_source_basis) = json(NEW.effective_source_basis))
              OR (NEW.source_basis_relation = 'corrected_with_new_exact_source'
                  AND json_extract(NEW.source_admission_basis, '$.type') <>
                    'assignment_owner_read'
                  AND json(json_extract(NEW.source_admission_basis, '$.basis')) =
                    json(NEW.effective_source_basis)))
        ))
      ) THEN RAISE(ABORT, 'Assignment source continuity is invalid') END;

      SELECT CASE WHEN NOT (
        json_type(NEW.source_admission_basis) = 'object'
        AND ((json_extract(NEW.source_admission_basis, '$.type') IN
              ('learner_occurrence', 'artifact_revision', 'representation_revision')
              AND (SELECT count(*) FROM json_each(NEW.source_admission_basis)) = 2
              AND json_type(NEW.source_admission_basis, '$.basis') = 'object'
              AND json_extract(NEW.source_admission_basis, '$.basis.type') =
                json_extract(NEW.source_admission_basis, '$.type'))
          OR (json_extract(NEW.source_admission_basis, '$.type') = 'assignment_owner_read'
              AND (SELECT count(*) FROM json_each(NEW.source_admission_basis)) = 2
              AND json_type(NEW.source_admission_basis, '$.ownerReads') = 'array'
              AND json_array_length(NEW.source_admission_basis, '$.ownerReads') BETWEEN 1 AND 16))
        AND json_type(NEW.mutation_authorship_basis) = 'object'
        AND ((json_extract(NEW.mutation_authorship_basis, '$.type') = 'agent_correction'
              AND (SELECT count(*) FROM json_each(NEW.mutation_authorship_basis)) = 5
              AND json_type(NEW.mutation_authorship_basis, '$.rationale') = 'text')
          OR (json_extract(NEW.mutation_authorship_basis, '$.type') IN
              ('interpreted_learner_report', 'interpreted_learner_direction',
               'interpreted_source_observation', 'interpreted_source_change')
              AND (SELECT count(*) FROM json_each(NEW.mutation_authorship_basis)) = 4))
      ) THEN RAISE(ABORT, 'Assignment source admission or authorship basis is invalid') END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_revision_sealed_effect_closed
    BEFORE INSERT ON assignment_revision
    WHEN EXISTS (
      SELECT 1 FROM assignment_commit_seal AS seal WHERE seal.effect_id = NEW.effect_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'Assignment sealed effect cannot receive another revision');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_revision_scope_sealed_effect_closed
    BEFORE INSERT ON assignment_revision_scope
    WHEN EXISTS (
      SELECT 1
      FROM assignment_revision AS revision
      JOIN assignment_commit_seal AS seal ON seal.effect_id = revision.effect_id
      WHERE revision.id = NEW.revision_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'Assignment sealed revision cannot receive another scope row');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_revision_immutable
    BEFORE UPDATE ON assignment_revision
    BEGIN
      SELECT RAISE(ABORT, 'Assignment revision is immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_revision_no_delete
    BEFORE DELETE ON assignment_revision
    BEGIN
      SELECT RAISE(ABORT, 'Assignment revision cannot be deleted');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_revision_scope_immutable
    BEFORE UPDATE ON assignment_revision_scope
    BEGIN
      SELECT RAISE(ABORT, 'Assignment revision scope is immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_revision_scope_no_delete
    BEFORE DELETE ON assignment_revision_scope
    BEGIN
      SELECT RAISE(ABORT, 'Assignment revision scope cannot be deleted');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_effect_immutable
    BEFORE UPDATE ON assignment_effect
    BEGIN
      SELECT RAISE(ABORT, 'Assignment effect is immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_effect_no_delete
    BEFORE DELETE ON assignment_effect
    BEGIN
      SELECT RAISE(ABORT, 'Assignment effect cannot be deleted');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_effect_address_owner_exclusive
    BEFORE INSERT ON assignment_effect
    WHEN EXISTS (
      SELECT 1 FROM assignment_no_change_seal AS no_change
      WHERE no_change.semantic_address_fingerprint = NEW.semantic_address_fingerprint
    )
    BEGIN
      SELECT RAISE(ABORT, 'Assignment semantic address already has a no-change owner');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_no_change_address_owner_exclusive
    BEFORE INSERT ON assignment_no_change_seal
    WHEN EXISTS (
      SELECT 1 FROM assignment_effect AS effect
      WHERE effect.semantic_address_fingerprint = NEW.semantic_address_fingerprint
    )
    BEGIN
      SELECT RAISE(ABORT, 'Assignment semantic address already has an effect owner');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_no_change_validate
    BEFORE INSERT ON assignment_no_change_seal
    BEGIN
      SELECT CASE WHEN NOT EXISTS (
        SELECT 1
        FROM learning_command_receipt AS receipt
        JOIN learning_command_invocation AS invocation ON invocation.part_id = NEW.invocation_part_id
        JOIN assignment_disposition AS disposition ON disposition.invocation_part_id = NEW.invocation_part_id
        JOIN assignment_capability_settlement AS capability ON capability.invocation_part_id = NEW.invocation_part_id
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
          AND invocation.command_name = 'update_assignment'
          AND invocation.command_version = 1
          AND invocation.capability_identity = 'update_assignment'
          AND invocation.capability_version = 1
          AND invocation.occurrence_id = NEW.occurrence_id
          AND invocation.assistant_message_id = NEW.model_operation_id
          AND disposition.disposition = 'candidate_v1'
          AND disposition.command_fingerprint = NEW.command_fingerprint
          AND disposition.semantic_address_fingerprint = NEW.semantic_address_fingerprint
          AND json(disposition.canonical_command) = json(NEW.canonical_command)
          AND json_extract(disposition.materialized_candidate, '$.commandFingerprint') = NEW.command_fingerprint
          AND json_extract(disposition.materialized_candidate, '$.semanticAddressFingerprint') =
            NEW.semantic_address_fingerprint
          AND json(json_extract(disposition.materialized_candidate, '$.canonicalCommand')) = json(NEW.canonical_command)
          AND capability.outcome IN ('policy_allow', 'prompted_allow')
          AND json_extract(NEW.canonical_command, '$.cause.type') = NEW.cause_type
          AND json_array_length(NEW.results) = json_array_length(NEW.canonical_command, '$.intents')
          AND (
            SELECT count(DISTINCT json_extract(result.value, '$.ordinal'))
            FROM json_each(NEW.results) AS result
          ) = json_array_length(NEW.canonical_command, '$.intents')
          AND NOT EXISTS (
            SELECT 1
            FROM json_each(NEW.results) AS result
            WHERE json_type(result.value) <> 'object'
              OR (SELECT count(*) FROM json_each(result.value)) <> 5
              OR json_type(result.value, '$.outcome') IS NOT 'text'
              OR json_extract(result.value, '$.outcome') IS NOT 'no_change'
              OR json_type(result.value, '$.operation') IS NOT 'text'
              OR json_extract(result.value, '$.operation') IS NOT 'revise'
              OR json_type(result.value, '$.ordinal') <> 'integer'
              OR json_extract(result.value, '$.ordinal') NOT BETWEEN 0 AND
                json_array_length(NEW.canonical_command, '$.intents') - 1
              OR json_type(result.value, '$.assignmentID') IS NOT 'text'
              OR json_type(result.value, '$.currentRevision') IS NOT 'object'
              OR (SELECT count(*) FROM json_each(result.value, '$.currentRevision')) <> 3
              OR json_type(result.value, '$.currentRevision.assignmentID') IS NOT 'text'
              OR json_type(result.value, '$.currentRevision.revisionID') IS NOT 'text'
              OR json_type(result.value, '$.currentRevision.version') IS NOT 'integer'
              OR json_extract(result.value, '$.operation') IS NOT
                json_extract(NEW.canonical_command,
                  '$.intents[' || json_extract(result.value, '$.ordinal') || '].type')
              OR json_extract(result.value, '$.assignmentID') IS NOT
                json_extract(NEW.canonical_command,
                  '$.intents[' || json_extract(result.value, '$.ordinal') || '].assignmentID')
              OR json_extract(result.value, '$.currentRevision.assignmentID') IS NOT
                json_extract(result.value, '$.assignmentID')
              OR json_extract(result.value, '$.currentRevision.revisionID') IS NOT
                json_extract(disposition.materialized_candidate,
                  '$.materialized[' || json_extract(result.value, '$.ordinal') || '].revisionID')
              OR json_extract(result.value, '$.currentRevision.version') IS NOT
                json_extract(disposition.materialized_candidate,
                  '$.materialized[' || json_extract(result.value, '$.ordinal') || '].current.current.version')
          )
      ) THEN RAISE(ABORT, 'Assignment no-change seal is not atomically settled') END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_no_change_immutable
    BEFORE UPDATE ON assignment_no_change_seal
    BEGIN
      SELECT RAISE(ABORT, 'Assignment no-change seal is immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_no_change_no_delete
    BEFORE DELETE ON assignment_no_change_seal
    BEGIN
      SELECT RAISE(ABORT, 'Assignment no-change seal cannot be deleted');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_commit_seal_immutable
    BEFORE UPDATE ON assignment_commit_seal
    BEGIN
      SELECT RAISE(ABORT, 'Assignment commit seal is immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_commit_seal_no_delete
    BEFORE DELETE ON assignment_commit_seal
    BEGIN
      SELECT RAISE(ABORT, 'Assignment commit seal cannot be deleted');
    END`,
  `CREATE TRIGGER IF NOT EXISTS assignment_commit_seal_validate
    BEFORE INSERT ON assignment_commit_seal
    BEGIN
      SELECT CASE WHEN NOT EXISTS (
        SELECT 1
        FROM assignment_effect AS effect
        JOIN learning_command_receipt AS receipt ON receipt.id = NEW.receipt_id
        JOIN learning_command_invocation AS invocation ON invocation.part_id = NEW.invocation_part_id
        JOIN assignment_disposition AS disposition ON disposition.invocation_part_id = NEW.invocation_part_id
        JOIN assignment_capability_settlement AS capability ON capability.invocation_part_id = NEW.invocation_part_id
        WHERE effect.id = NEW.effect_id
          AND effect.commit_seal_id = NEW.effect_id
          AND effect.physical_receipt_id = NEW.receipt_id
          AND effect.invocation_part_id = NEW.invocation_part_id
          AND effect.model_operation_id = invocation.assistant_message_id
          AND effect.model_operation_id = receipt.assistant_message_id
          AND effect.occurrence_id = invocation.occurrence_id
          AND effect.occurrence_id = receipt.occurrence_id
          AND effect.time_committed = receipt.time_committed
          AND effect.commit_order = receipt.commit_order
          AND receipt.invocation_part_id = NEW.invocation_part_id
          AND invocation.receipt_id = NEW.receipt_id
          AND invocation.status = 'applied'
          AND invocation.command_name = 'update_assignment'
          AND invocation.command_version = 1
          AND invocation.capability_identity = 'update_assignment'
          AND invocation.capability_version = 1
          AND json_extract(invocation.settlement, '$.effectID') = NEW.effect_id
          AND json_extract(invocation.settlement, '$.assignmentKind') = 'change_set'
          AND json_type(invocation.settlement, '$.changes') = 'array'
          AND json_type(invocation.settlement, '$.intentResults') = 'array'
          AND disposition.disposition = 'candidate_v1'
          AND disposition.command_fingerprint = effect.command_fingerprint
          AND disposition.semantic_address_fingerprint = effect.semantic_address_fingerprint
          AND json(disposition.canonical_command) = json(effect.canonical_command)
          AND json_extract(disposition.materialized_candidate, '$.effectID') = effect.id
          AND json_extract(disposition.materialized_candidate, '$.commandFingerprint') = effect.command_fingerprint
          AND json_extract(disposition.materialized_candidate, '$.semanticAddressFingerprint') =
            effect.semantic_address_fingerprint
          AND json(json_extract(disposition.materialized_candidate, '$.canonicalCommand')) =
            json(effect.canonical_command)
          AND json_extract(effect.canonical_command, '$.cause.type') = effect.cause_type
          AND capability.outcome IN ('policy_allow', 'prompted_allow')
      ) THEN RAISE(ABORT, 'Assignment commit is not atomically settled') END;

      SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM assignment_effect AS effect
        WHERE effect.id = NEW.effect_id
          AND (
            (SELECT count(*) FROM json_each(effect.results)) < 1
            OR (SELECT count(*) FROM json_each(effect.results)) <>
              json_array_length(effect.canonical_command, '$.intents')
            OR (SELECT count(*) FROM json_each(effect.results)) <>
              (SELECT count(DISTINCT json_extract(result.value, '$.ordinal')) FROM json_each(effect.results) AS result)
            OR EXISTS (
              SELECT 1
              FROM json_each(effect.results) AS result
              LEFT JOIN assignment_revision AS primary_revision
                ON primary_revision.effect_id = effect.id
               AND primary_revision.operation_ordinal = json_extract(result.value, '$.ordinal') * 2
              LEFT JOIN assignment_revision AS successor_revision
                ON successor_revision.effect_id = effect.id
               AND successor_revision.operation_ordinal = json_extract(result.value, '$.ordinal') * 2 + 1
              WHERE json_type(result.value) <> 'object'
                OR json_type(result.value, '$.ordinal') <> 'integer'
                OR json_extract(result.value, '$.ordinal') NOT BETWEEN 0 AND 15
                OR json_extract(result.value, '$.ordinal') >=
                  json_array_length(effect.canonical_command, '$.intents')
                OR json_extract(result.value, '$.outcome') NOT IN ('changed', 'no_change')
                OR json_type(result.value, '$.operation') <> 'text'
                OR json_type(result.value, '$.assignmentID') <> 'text'
                OR json_extract(result.value, '$.operation') <>
                  json_extract(effect.canonical_command,
                    '$.intents[' || json_extract(result.value, '$.ordinal') || '].type')
                OR (json_extract(result.value, '$.operation') <> 'create'
                  AND json_extract(result.value, '$.assignmentID') <>
                    json_extract(effect.canonical_command,
                      '$.intents[' || json_extract(result.value, '$.ordinal') || '].assignmentID'))
                OR (json_extract(result.value, '$.outcome') = 'changed' AND (
                  json_type(result.value, '$.revisionID') <> 'text'
                  OR json_type(result.value, '$.currentRevisionID') IS NOT NULL
                  OR json_type(result.value, '$.currentRevisionVersion') IS NOT NULL
                  OR (SELECT count(*) FROM json_each(result.value)) <>
                    5 + (json_type(result.value, '$.successorAssignmentID') IS NOT NULL)
                      + (json_type(result.value, '$.successorRevisionID') IS NOT NULL)
                  OR primary_revision.id IS NULL
                  OR primary_revision.operation <> json_extract(result.value, '$.operation')
                  OR primary_revision.assignment_id <> json_extract(result.value, '$.assignmentID')
                  OR primary_revision.id <> json_extract(result.value, '$.revisionID')
                  OR primary_revision.time_committed <> effect.time_committed
                  OR primary_revision.commit_order <> effect.commit_order
                  OR primary_revision.frontier_sequence <> effect.frontier_sequence
                  OR (json_type(result.value, '$.successorAssignmentID') IS NOT NULL
                    AND (primary_revision.operation <> 'replace'
                      OR primary_revision.supersession_target_assignment_id <>
                        json_extract(result.value, '$.successorAssignmentID')))
                  OR (json_type(result.value, '$.successorRevisionID') IS NULL AND successor_revision.id IS NOT NULL)
                  OR (json_type(result.value, '$.successorRevisionID') IS NOT NULL
                    AND (json_type(result.value, '$.successorAssignmentID') <> 'text'
                      OR successor_revision.id IS NULL
                      OR successor_revision.assignment_id <> json_extract(result.value, '$.successorAssignmentID')
                      OR successor_revision.id <> json_extract(result.value, '$.successorRevisionID')
                      OR successor_revision.version <> 1
                      OR successor_revision.time_committed <> effect.time_committed
                      OR successor_revision.commit_order <> effect.commit_order
                      OR successor_revision.frontier_sequence <> effect.frontier_sequence))))
                OR (json_extract(result.value, '$.outcome') = 'no_change' AND (
                  json_extract(result.value, '$.operation') <> 'revise'
                  OR (SELECT count(*) FROM json_each(result.value)) <> 6
                  OR json_type(result.value, '$.revisionID') IS NOT NULL
                  OR json_type(result.value, '$.successorAssignmentID') IS NOT NULL
                  OR json_type(result.value, '$.successorRevisionID') IS NOT NULL
                  OR json_type(result.value, '$.currentRevisionID') <> 'text'
                  OR json_type(result.value, '$.currentRevisionVersion') <> 'integer'
                  OR json_extract(result.value, '$.currentRevisionVersion') < 1
                  OR primary_revision.id IS NOT NULL
                  OR successor_revision.id IS NOT NULL
                  OR NOT EXISTS (
                    SELECT 1
                    FROM assignment_revision AS current_revision
                    JOIN assignment_effect AS current_effect ON current_effect.id = current_revision.effect_id
                    JOIN assignment_commit_seal AS current_seal ON current_seal.effect_id = current_effect.id
                    WHERE current_revision.assignment_id = json_extract(result.value, '$.assignmentID')
                      AND current_revision.id = json_extract(result.value, '$.currentRevisionID')
                      AND current_revision.version = json_extract(result.value, '$.currentRevisionVersion')
                  )))
            )
            OR (SELECT count(*) FROM assignment_revision AS revision WHERE revision.effect_id = effect.id) <>
              (SELECT coalesce(sum(
                CASE
                  WHEN json_extract(result.value, '$.outcome') = 'no_change' THEN 0
                  WHEN json_type(result.value, '$.successorRevisionID') IS NULL THEN 1
                  ELSE 2
                END
              ), 0) FROM json_each(effect.results) AS result)
          )
      ) THEN RAISE(ABORT, 'Assignment effect results do not seal the exact revision set') END;

      SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM assignment_effect AS effect
        JOIN learning_command_invocation AS invocation ON invocation.part_id = effect.invocation_part_id
        WHERE effect.id = NEW.effect_id
          AND (json_array_length(invocation.settlement, '$.intentResults') <>
                json_array_length(effect.results)
            OR EXISTS (
              SELECT 1
              FROM json_each(effect.results) AS stored
              LEFT JOIN json_each(invocation.settlement, '$.intentResults') AS projected
                ON json_extract(projected.value, '$.ordinal') = json_extract(stored.value, '$.ordinal')
              WHERE projected.value IS NULL
                OR json_extract(projected.value, '$.outcome') <> json_extract(stored.value, '$.outcome')
                OR json_extract(projected.value, '$.operation') <> json_extract(stored.value, '$.operation')
                OR json_extract(projected.value, '$.assignmentID') <> json_extract(stored.value, '$.assignmentID')
                OR (json_extract(stored.value, '$.outcome') = 'changed'
                  AND (json_extract(projected.value, '$.committedRevision.revisionID') <>
                        json_extract(stored.value, '$.revisionID')
                    OR coalesce(json_extract(projected.value, '$.successorRevision.revisionID'), '') <>
                      coalesce(json_extract(stored.value, '$.successorRevisionID'), '')))
                OR (json_extract(stored.value, '$.outcome') = 'no_change'
                  AND (json_extract(projected.value, '$.currentRevision.revisionID') <>
                        json_extract(stored.value, '$.currentRevisionID')
                    OR json_extract(projected.value, '$.currentRevision.version') <>
                      json_extract(stored.value, '$.currentRevisionVersion')))
            ))
      ) THEN RAISE(ABORT, 'Assignment physical intent results do not match the sealed effect') END;

      SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM learning_command_invocation AS invocation
        JOIN assignment_effect AS effect ON effect.invocation_part_id = invocation.part_id
        WHERE effect.id = NEW.effect_id
          AND (
            json_array_length(invocation.settlement, '$.changes') <>
              (SELECT count(*) FROM assignment_revision AS revision WHERE revision.effect_id = effect.id)
            OR json_array_length(invocation.settlement, '$.changes') <>
              (SELECT count(DISTINCT json_extract(change.value, '$.committedRevision.revisionID'))
               FROM json_each(invocation.settlement, '$.changes') AS change)
            OR EXISTS (
              SELECT 1
              FROM json_each(invocation.settlement, '$.changes') AS change
              LEFT JOIN assignment_revision AS revision
                ON revision.effect_id = effect.id
               AND revision.id = json_extract(change.value, '$.committedRevision.revisionID')
              WHERE revision.id IS NULL
                OR revision.assignment_id <> json_extract(change.value, '$.assignmentID')
                OR revision.assignment_id <> json_extract(change.value, '$.committedRevision.assignmentID')
                OR revision.version <> json_extract(change.value, '$.committedRevision.version')
                OR revision.operation <> json_extract(change.value, '$.operation')
                OR CAST(revision.operation_ordinal / 2 AS INTEGER) <> json_extract(change.value, '$.ordinal')
            )
          )
      ) THEN RAISE(ABORT, 'Assignment physical settlement does not seal the exact revision set') END;

      SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM assignment_revision AS revision
        WHERE revision.effect_id = NEW.effect_id
          AND ((revision.scope_type = 'learner_home' AND EXISTS (
                  SELECT 1 FROM assignment_revision_scope AS scope WHERE scope.revision_id = revision.id
                ))
            OR (revision.scope_type = 'courses' AND revision.scope_count <> (
                  SELECT count(*) FROM assignment_revision_scope AS scope WHERE scope.revision_id = revision.id
                ))
            OR (revision.scope_type = 'courses' AND EXISTS (
                  SELECT 1
                  FROM json_each(revision.snapshot, '$.scope.courseIDs') AS expected
                  LEFT JOIN assignment_revision_scope AS scope
                    ON scope.revision_id = revision.id
                   AND scope.ordinal = CAST(expected.key AS INTEGER)
                  WHERE scope.course_id IS NULL OR scope.course_id <> expected.value
                )))
      ) THEN RAISE(ABORT, 'Assignment revision scope rows do not match the complete snapshot') END;

      SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM assignment_revision AS revision
        LEFT JOIN assignment_revision AS predecessor ON predecessor.id = revision.predecessor_revision_id
        WHERE revision.effect_id = NEW.effect_id
          AND revision.version > 1
          AND (predecessor.id IS NULL OR predecessor.assignment_id <> revision.assignment_id
            OR predecessor.version + 1 <> revision.version)
      ) THEN RAISE(ABORT, 'Assignment revision lineage is invalid') END;

      SELECT CASE WHEN EXISTS (
        SELECT head.assignment_id
        FROM assignment_revision AS head
        WHERE NOT EXISTS (
          SELECT 1 FROM assignment_revision AS successor
          WHERE successor.predecessor_revision_id = head.id
        )
        GROUP BY head.assignment_id
        HAVING count(*) <> 1
      ) THEN RAISE(ABORT, 'Assignment current head is not unique') END;

      SELECT CASE WHEN EXISTS (
        SELECT target.assignment_id
        FROM assignment_revision AS head
        JOIN assignment_revision AS target
          ON target.assignment_id = head.supersession_target_assignment_id
         AND target.id = head.supersession_target_revision_id
         AND target.version = head.supersession_target_version
        WHERE head.disposition = 'superseded'
          AND NOT EXISTS (
            SELECT 1 FROM assignment_revision AS successor
            WHERE successor.predecessor_revision_id = head.id
          )
        GROUP BY target.assignment_id
        HAVING count(*) > 1
      ) THEN RAISE(ABORT, 'Assignment current supersession target has duplicate incoming edges') END;

      SELECT CASE WHEN EXISTS (
        WITH RECURSIVE current_edge(source_id, target_id, origin_id) AS (
          SELECT head.assignment_id, head.supersession_target_assignment_id, head.assignment_id
          FROM assignment_revision AS head
          WHERE head.disposition = 'superseded'
            AND NOT EXISTS (
              SELECT 1 FROM assignment_revision AS successor
              WHERE successor.predecessor_revision_id = head.id
            )
          UNION ALL
          SELECT edge.target_id, next.supersession_target_assignment_id, edge.origin_id
          FROM current_edge AS edge
          JOIN assignment_revision AS next ON next.assignment_id = edge.target_id
          WHERE next.disposition = 'superseded'
            AND NOT EXISTS (
              SELECT 1 FROM assignment_revision AS successor
              WHERE successor.predecessor_revision_id = next.id
            )
            AND edge.target_id <> edge.origin_id
        )
        SELECT 1 FROM current_edge WHERE target_id = origin_id LIMIT 1
      ) THEN RAISE(ABORT, 'Assignment current supersession graph contains a cycle') END;
    END`,
]
