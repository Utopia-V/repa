export * as LearnerGoalConstraintSchemaV2 from "./constraint-schema-v2"

import { Effect } from "effect"
import type { Database } from "../database/database"

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

function quote(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function exactObject(value: string, keys: readonly string[]) {
  return `(json_type(${value}) = 'object'
    AND (SELECT count(*) FROM json_each(${value})) = ${keys.length}
    AND NOT EXISTS (
      SELECT 1 FROM json_each(${value})
      WHERE key NOT IN (${keys.map(quote).join(", ")})
    ))`
}

function textArray(value: string, minimum: number, maximum: number) {
  return `(json_type(${value}) = 'array'
    AND json_array_length(${value}) BETWEEN ${minimum} AND ${maximum}
    AND NOT EXISTS (
      SELECT 1 FROM json_each(${value}) AS item
      WHERE item.type <> 'text' OR length(trim(item.value)) = 0
    ))`
}

function sha256Shape(value: string) {
  return `(typeof(${value}) = 'text'
    AND length(${value}) = 64
    AND ${value} NOT GLOB '*[^0-9a-f]*')`
}

function permissionRuleArrayShape(value: string) {
  return `(json_type(${value}) = 'array'
    AND NOT EXISTS (
      SELECT 1 FROM json_each(${value}) AS rule
      WHERE NOT COALESCE((
        ${exactObject("rule.value", ["permission", "pattern", "action"])}
        AND json_type(rule.value, '$.permission') = 'text'
        AND length(json_extract(rule.value, '$.permission')) > 0
        AND json_type(rule.value, '$.pattern') = 'text'
        AND json_extract(rule.value, '$.action') IN ('allow', 'deny', 'ask')
      ), 0)
    ))`
}

function inheritedPermissionRuleShape(value: string) {
  return `(json_type(${value}) = 'array'
    AND NOT EXISTS (
      SELECT 1 FROM json_each(${value}) AS inherited
      WHERE inherited.type <> 'array'
        OR NOT ${permissionRuleArrayShape("inherited.value")}
    ))`
}

function timeZoneIntentShape(value: string) {
  return `((${exactObject(value, ["type"])} AND json_extract(${value}, '$.type') = 'source')
    OR (${exactObject(value, ["type", "name"])}
      AND json_extract(${value}, '$.type') = 'iana'
      AND json_type(${value}, '$.name') = 'text'
      AND length(json_extract(${value}, '$.name')) > 0)
    OR (${exactObject(value, ["type", "offsetMinutes"])}
      AND json_extract(${value}, '$.type') = 'fixed_offset'
      AND json_type(${value}, '$.offsetMinutes') = 'integer'
      AND json_extract(${value}, '$.offsetMinutes') BETWEEN -840 AND 840))`
}

function targetIntentShape(value: string) {
  const zone = `json_extract(${value}, '$.timeZone')`
  return `((${exactObject(value, ["type"])} AND json_extract(${value}, '$.type') = 'absent')
    OR (${exactObject(value, ["type", "localDateTime", "timeZone"])}
      AND json_extract(${value}, '$.type') = 'instant'
      AND json_type(${value}, '$.localDateTime') = 'text'
      AND length(json_extract(${value}, '$.localDateTime')) BETWEEN 19 AND 23
      AND ${timeZoneIntentShape(zone)})
    OR (${exactObject(value, ["type", "date", "timeZone"])}
      AND json_extract(${value}, '$.type') = 'local_date'
      AND json_type(${value}, '$.date') = 'text'
      AND json_extract(${value}, '$.date') GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND date(json_extract(${value}, '$.date')) = json_extract(${value}, '$.date')
      AND ${timeZoneIntentShape(zone)}))`
}

function scopeIntentShape(value: string) {
  const courseIDs = `json_extract(${value}, '$.courseIDs')`
  return `((${exactObject(value, ["type"])} AND json_extract(${value}, '$.type') = 'learner_home')
    OR (${exactObject(value, ["type", "courseIDs"])}
      AND json_extract(${value}, '$.type') = 'courses'
      AND ${textArray(courseIDs, 1, 16)}
      AND (SELECT count(DISTINCT item.value) FROM json_each(${courseIDs}) AS item) = json_array_length(${courseIDs})))`
}

function fieldIntentShape(value: string, name: string, setShape: string) {
  const field = `json_extract(${value}, '$.${name}')`
  return `((${exactObject(field, ["type"])} AND json_extract(${field}, '$.type') = 'carry')
    OR (${exactObject(field, ["type", "value"])}
      AND json_extract(${field}, '$.type') = 'set'
      AND ${setShape}))`
}

function canonicalPatchShape(value: string) {
  return `(${exactObject(value, ["outcome", "conditions", "scope", "target", "disposition"])}
    AND ${fieldIntentShape(
      value,
      "outcome",
      `json_type(${value}, '$.outcome.value') = 'text' AND length(trim(json_extract(${value}, '$.outcome.value'))) > 0`,
    )}
    AND ${fieldIntentShape(value, "conditions", textArray(`json_extract(${value}, '$.conditions.value')`, 0, 16))}
    AND ${fieldIntentShape(value, "scope", scopeIntentShape(`json_extract(${value}, '$.scope.value')`))}
    AND ${fieldIntentShape(value, "target", targetIntentShape(`json_extract(${value}, '$.target.value')`))}
    AND ${fieldIntentShape(
      value,
      "disposition",
      `json_extract(${value}, '$.disposition.value') IN ('active', 'achieved', 'abandoned')`,
    )})`
}

function createOperationShape(value: string, kind: "create" | "new") {
  return `(${exactObject(value, ["type", "outcome", "conditions", "scope", "target", "disposition"])}
    AND json_extract(${value}, '$.type') = '${kind}'
    AND json_type(${value}, '$.outcome') = 'text'
    AND length(trim(json_extract(${value}, '$.outcome'))) > 0
    AND ${textArray(`json_extract(${value}, '$.conditions')`, 0, 16)}
    AND ${scopeIntentShape(`json_extract(${value}, '$.scope')`)}
    AND ${targetIntentShape(`json_extract(${value}, '$.target')`)}
    AND json_extract(${value}, '$.disposition') IN ('active', 'achieved', 'abandoned'))`
}

function canonicalCommandShape(value: string) {
  const operations = `json_extract(${value}, '$.operations')`
  const operation = "operation.value"
  const patch = `json_extract(${operation}, '$.patch')`
  const target = `json_extract(${operation}, '$.target')`
  return `(${exactObject(value, ["operations"])}
    AND json_type(${value}, '$.operations') = 'array'
    AND json_array_length(${value}, '$.operations') BETWEEN 1 AND 8
    AND NOT EXISTS (
      SELECT 1 FROM json_each(${operations}) AS operation
      WHERE NOT COALESCE((
        ${createOperationShape(operation, "create")}
        OR (${exactObject(operation, ["type", "goalID", "headRevisionID", "patch"])}
          AND json_extract(${operation}, '$.type') = 'update'
          AND json_type(${operation}, '$.goalID') = 'text'
          AND json_type(${operation}, '$.headRevisionID') = 'text'
          AND ${canonicalPatchShape(patch)})
        OR (${exactObject(operation, ["type", "goalID", "headRevisionID", "patch", "target"])}
          AND json_extract(${operation}, '$.type') = 'replace'
          AND json_type(${operation}, '$.goalID') = 'text'
          AND json_type(${operation}, '$.headRevisionID') = 'text'
          AND ${canonicalPatchShape(patch)}
          AND ((${exactObject(target, ["type", "goalID", "headRevisionID"])}
              AND json_extract(${target}, '$.type') = 'existing'
              AND json_type(${target}, '$.goalID') = 'text'
              AND json_type(${target}, '$.headRevisionID') = 'text')
            OR ${createOperationShape(target, "new")}))
      ), 0)
    ))`
}

function resolvedZoneShape(value: string) {
  return `((${exactObject(value, ["type", "name", "releaseID"])}
      AND json_extract(${value}, '$.type') = 'iana'
      AND json_type(${value}, '$.name') = 'text'
      AND length(json_extract(${value}, '$.name')) > 0
      AND json_type(${value}, '$.releaseID') = 'text'
      AND length(json_extract(${value}, '$.releaseID')) > 0)
    OR (${exactObject(value, ["type", "offsetMinutes"])}
      AND json_extract(${value}, '$.type') = 'fixed_offset'
      AND json_type(${value}, '$.offsetMinutes') = 'integer'
      AND json_extract(${value}, '$.offsetMinutes') BETWEEN -840 AND 840))`
}

function targetValueShape(value: string) {
  const zone = `json_extract(${value}, '$.resolvedZone')`
  return `((${exactObject(value, ["type"])} AND json_extract(${value}, '$.type') = 'absent')
    OR (${exactObject(value, ["type", "instant", "utcOffsetMinutes", "resolvedZone"])}
      AND json_extract(${value}, '$.type') = 'instant'
      AND json_type(${value}, '$.instant') = 'integer'
      AND json_extract(${value}, '$.instant') >= 0
      AND json_type(${value}, '$.utcOffsetMinutes') = 'integer'
      AND json_extract(${value}, '$.utcOffsetMinutes') BETWEEN -840 AND 840
      AND ${resolvedZoneShape(zone)})
    OR (${exactObject(value, ["type", "date", "resolvedZone"])}
      AND json_extract(${value}, '$.type') = 'local_date'
      AND json_type(${value}, '$.date') = 'text'
      AND json_extract(${value}, '$.date') GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND date(json_extract(${value}, '$.date')) = json_extract(${value}, '$.date')
      AND ${resolvedZoneShape(zone)}))`
}

function availabilityShape(value: string) {
  return `((${exactObject(value, ["state", "title"])}
      AND json_extract(${value}, '$.state') = 'available'
      AND json_type(${value}, '$.title') = 'text')
    OR ((${exactObject(value, ["state", "cause"])} OR ${exactObject(value, ["state", "cause", "title"])})
      AND json_extract(${value}, '$.state') = 'unavailable'
      AND json_extract(${value}, '$.cause') IN ('course_not_found', 'course_withdrawn')
      AND (json_type(${value}, '$.title') IS NULL OR json_type(${value}, '$.title') = 'text')))`
}

function storedScopeShape(value: string, boundKind: "new" | "bound") {
  const courses = `json_extract(${value}, '$.courses')`
  const course = "course.value"
  const admission = `json_extract(${course}, '$.admission')`
  const availability = `json_extract(${course}, '$.availability')`
  return `((${exactObject(value, ["type"])} AND json_extract(${value}, '$.type') = 'learner_home')
    OR (${exactObject(value, ["type", "courses"])}
      AND json_extract(${value}, '$.type') = 'courses'
      AND json_type(${courses}) = 'array'
      AND json_array_length(${courses}) BETWEEN 1 AND 16
      AND NOT EXISTS (
        SELECT 1 FROM json_each(${courses}) AS course
        WHERE NOT COALESCE((
          ${exactObject(course, ["courseID", "courseTitle", "admission", "availability"])}
          AND json_type(${course}, '$.courseID') = 'text'
          AND json_type(${course}, '$.courseTitle') = 'text'
          AND ((${exactObject(admission, ["type", "courseVersion", "courseTimeUpdated"])}
              AND json_extract(${admission}, '$.type') = '${boundKind}'
              AND json_type(${admission}, '$.courseVersion') = 'integer'
              AND json_extract(${admission}, '$.courseVersion') >= 0
              AND json_type(${admission}, '$.courseTimeUpdated') = 'integer'
              AND json_extract(${admission}, '$.courseTimeUpdated') >= 0)
            OR (${exactObject(admission, ["type", "predecessorRevisionID"])}
              AND json_extract(${admission}, '$.type') = 'carried'
              AND json_type(${admission}, '$.predecessorRevisionID') = 'text'))
          AND ${availabilityShape(availability)}
        ), 0)
      )))`
}

function legacyTargetShape(value: string) {
  return `((${exactObject(value, ["type"])} AND json_extract(${value}, '$.type') = 'absent')
    OR (${exactObject(value, ["type", "instant", "sourceExpression", "normalized", "utcOffsetMinutes", "normalizationBasis"])}
      AND json_extract(${value}, '$.type') = 'instant'
      AND json_type(${value}, '$.instant') = 'integer'
      AND json_type(${value}, '$.sourceExpression') = 'text'
      AND json_type(${value}, '$.normalized') = 'text'
      AND json_type(${value}, '$.utcOffsetMinutes') = 'integer'
      AND json_extract(${value}, '$.normalizationBasis') = 'explicit_offset')
    OR (${exactObject(value, ["type", "date", "timeZone", "sourceExpression", "normalizationBasis"])}
      AND json_extract(${value}, '$.type') = 'local_date'
      AND json_type(${value}, '$.date') = 'text'
      AND json_type(${value}, '$.timeZone') = 'text'
      AND json_type(${value}, '$.sourceExpression') = 'text'
      AND json_extract(${value}, '$.normalizationBasis') IN ('explicit_date', 'source_temporal_context')))`
}

function dispositionShape(value: string) {
  return `((${exactObject(value, ["type"])}
      AND json_extract(${value}, '$.type') IN ('active', 'achieved', 'abandoned'))
    OR (${exactObject(value, ["type", "targetGoalID", "targetRevisionID"])}
      AND json_extract(${value}, '$.type') = 'superseded'
      AND json_type(${value}, '$.targetGoalID') = 'text'
      AND json_type(${value}, '$.targetRevisionID') = 'text'))`
}

function revisionSnapshotShape(value: string) {
  const scope = `json_extract(${value}, '$.scope')`
  const target = `json_extract(${value}, '$.target')`
  return `(${exactObject(value, [
    "schemaVersion",
    "revisionID",
    "goalID",
    "version",
    "outcome",
    "conditions",
    "scope",
    "target",
    "disposition",
  ])}
    AND json_type(${value}, '$.revisionID') = 'text'
    AND json_type(${value}, '$.goalID') = 'text'
    AND json_type(${value}, '$.version') = 'integer'
    AND json_extract(${value}, '$.version') >= 1
    AND json_type(${value}, '$.outcome') = 'text'
    AND length(trim(json_extract(${value}, '$.outcome'))) > 0
    AND ${textArray(`json_extract(${value}, '$.conditions')`, 0, 16)}
    AND ${dispositionShape(`json_extract(${value}, '$.disposition')`)}
    AND ((json_extract(${value}, '$.schemaVersion') = 1
        AND ${storedScopeShape(scope, "new")}
        AND ${legacyTargetShape(target)})
      OR (json_extract(${value}, '$.schemaVersion') = 2
        AND ${storedScopeShape(scope, "bound")}
        AND ${targetValueShape(target)})))`
}

function materializedShape(value: string) {
  const operations = `json_extract(${value}, '$.operations')`
  const operation = "operation.value"
  const before = `json_extract(${operation}, '$.before')`
  const after = `json_extract(${operation}, '$.after')`
  const replacement = `json_extract(${operation}, '$.replacementTarget')`
  const replacementBefore = `json_extract(${replacement}, '$.before')`
  const replacementAfter = `json_extract(${replacement}, '$.after')`
  const temporal = `json_extract(${value}, '$.sourceTemporalContext')`
  const frontiers = `json_extract(${value}, '$.consumedFrontiers')`
  return `(${exactObject(value, [
    "schemaVersion",
    "canonicalCommand",
    "operations",
    "sourceTemporalContext",
    "revisionSequenceBefore",
    "consumedFrontiers",
    "timeFloor",
  ])}
    AND json_extract(${value}, '$.schemaVersion') = 2
    AND ${canonicalCommandShape(`json_extract(${value}, '$.canonicalCommand')`)}
    AND json_type(${operations}) = 'array'
    AND json_array_length(${operations}) BETWEEN 1 AND 8
    AND NOT EXISTS (
      SELECT 1 FROM json_each(${operations}) AS operation
      WHERE NOT COALESCE((
        json_extract(${operation}, '$.ordinal') = CAST(operation.key AS INTEGER)
        AND json_extract(${operation}, '$.operation') IN ('create', 'update', 'replace')
        AND json_extract(${operation}, '$.result') IN ('changed', 'no_change')
        AND ${revisionSnapshotShape(after)}
        AND (
          (json_extract(${operation}, '$.operation') = 'create'
            AND json_extract(${operation}, '$.result') = 'changed'
            AND ${exactObject(operation, ["ordinal", "operation", "result", "after"])})
          OR (json_extract(${operation}, '$.operation') = 'update'
            AND ${exactObject(operation, ["ordinal", "operation", "result", "before", "after"])}
            AND ${revisionSnapshotShape(before)}
            AND (json_extract(${operation}, '$.result') = 'changed' OR json(${before}) = json(${after})))
          OR (json_extract(${operation}, '$.operation') = 'replace'
            AND json_extract(${operation}, '$.result') = 'changed'
            AND ${exactObject(operation, ["ordinal", "operation", "result", "before", "after", "replacementTarget"])}
            AND ${revisionSnapshotShape(before)}
            AND ((json_extract(${replacement}, '$.type') = 'existing'
                AND ${exactObject(replacement, ["type", "before", "after"])}
                AND ${revisionSnapshotShape(replacementBefore)})
              OR (json_extract(${replacement}, '$.type') = 'new'
                AND ${exactObject(replacement, ["type", "after"])}))
            AND ${revisionSnapshotShape(replacementAfter)})
        )
      ), 0)
    )
    AND ((${exactObject(temporal, ["state", "timeZone", "utcOffsetMinutes"])}
        AND json_extract(${temporal}, '$.state') = 'resolved'
        AND json_type(${temporal}, '$.timeZone') = 'text'
        AND length(trim(json_extract(${temporal}, '$.timeZone'))) > 0
        AND json_type(${temporal}, '$.utcOffsetMinutes') = 'integer'
        AND json_extract(${temporal}, '$.utcOffsetMinutes') BETWEEN -840 AND 840)
      OR (${exactObject(temporal, ["state", "reason"])}
        AND json_extract(${temporal}, '$.state') = 'unavailable'
        AND json_extract(${temporal}, '$.reason') = 'timezone_unavailable'))
    AND json_type(${value}, '$.revisionSequenceBefore') = 'integer'
    AND json_extract(${value}, '$.revisionSequenceBefore') >= 0
    AND json_type(${frontiers}) = 'array'
    AND json_array_length(${frontiers}) >= 1
    AND NOT EXISTS (
      SELECT 1 FROM json_each(${frontiers}) AS frontier
      WHERE NOT COALESCE((
        ${exactObject("frontier.value", ["sequence", "time"])}
        AND json_type(frontier.value, '$.sequence') = 'integer'
        AND json_extract(frontier.value, '$.sequence') >= 0
        AND json_type(frontier.value, '$.time') = 'integer'
        AND json_extract(frontier.value, '$.time') >= 0
      ), 0)
    )
    AND json_type(${value}, '$.timeFloor') = 'integer'
    AND json_extract(${value}, '$.timeFloor') >= 0)`
}

const agentActionShape = `(
  json_valid(NEW.agent_action_provenance)
  AND json_type(NEW.agent_action_provenance) = 'object'
  AND json_type(NEW.agent_action_provenance, '$.schemaVersion') = 'integer'
  AND json_extract(NEW.agent_action_provenance, '$.schemaVersion') = 1
  AND json_type(NEW.agent_action_provenance, '$.occurrenceID') = 'text'
  AND json_extract(NEW.agent_action_provenance, '$.occurrenceID') = invocation.occurrence_id
  AND json_type(NEW.agent_action_provenance, '$.causalRootOccurrenceID') = 'text'
  AND json_extract(NEW.agent_action_provenance, '$.causalRootOccurrenceID') = invocation.occurrence_id
  AND json_type(NEW.agent_action_provenance, '$.sessionID') = 'text'
  AND json_extract(NEW.agent_action_provenance, '$.sessionID') = invocation.session_id
  AND json_type(NEW.agent_action_provenance, '$.turnID') = 'text'
  AND json_extract(NEW.agent_action_provenance, '$.turnID') = invocation.turn_id
  AND json_type(NEW.agent_action_provenance, '$.inputID') = 'text'
  AND json_extract(NEW.agent_action_provenance, '$.inputID') = invocation.input_id
  AND json_type(NEW.agent_action_provenance, '$.assistantMessageID') = 'text'
  AND json_extract(NEW.agent_action_provenance, '$.assistantMessageID') = invocation.assistant_message_id
  AND json_type(NEW.agent_action_provenance, '$.invocationPartID') = 'text'
  AND json_extract(NEW.agent_action_provenance, '$.invocationPartID') = invocation.part_id
  AND json_type(NEW.agent_action_provenance, '$.providerCallID') = 'text'
  AND json_extract(NEW.agent_action_provenance, '$.providerCallID') = invocation.provider_call_id
  AND json_type(NEW.agent_action_provenance, '$.emissionOrdinal') = 'integer'
  AND json_extract(NEW.agent_action_provenance, '$.emissionOrdinal') = invocation.emission_ordinal
  AND json_extract(NEW.agent_action_provenance, '$.capabilityIdentity') = 'update_learner_goals'
  AND json_type(NEW.agent_action_provenance, '$.capabilityVersion') = 'integer'
  AND json_extract(NEW.agent_action_provenance, '$.capabilityVersion') = 2
  AND (
    (
      json_extract(NEW.agent_action_provenance, '$.kind') = 'root'
      AND json_type(NEW.agent_action_provenance, '$.lineage') = 'array'
      AND json_array_length(NEW.agent_action_provenance, '$.lineage') = 0
      AND json_remove(
        NEW.agent_action_provenance,
        '$.schemaVersion', '$.kind', '$.occurrenceID', '$.causalRootOccurrenceID',
        '$.sessionID', '$.turnID', '$.inputID', '$.assistantMessageID',
        '$.invocationPartID', '$.providerCallID', '$.emissionOrdinal',
        '$.capabilityIdentity', '$.capabilityVersion', '$.lineage'
      ) = '{}'
    )
    OR (
      json_extract(NEW.agent_action_provenance, '$.kind') = 'delegated'
      AND json_type(NEW.agent_action_provenance, '$.lineage') = 'array'
      AND json_array_length(NEW.agent_action_provenance, '$.lineage') > 0
      AND json_type(NEW.agent_action_provenance, '$.effectiveDelegatedCapability') = 'object'
      AND json_remove(
        NEW.agent_action_provenance,
        '$.schemaVersion', '$.kind', '$.occurrenceID', '$.causalRootOccurrenceID',
        '$.sessionID', '$.turnID', '$.inputID', '$.assistantMessageID',
        '$.invocationPartID', '$.providerCallID', '$.emissionOrdinal',
        '$.capabilityIdentity', '$.capabilityVersion', '$.lineage',
        '$.effectiveDelegatedCapability'
      ) = '{}'
      AND json_remove(
        json_extract(NEW.agent_action_provenance, '$.effectiveDelegatedCapability'),
        '$.identity', '$.version', '$.projectionVersion', '$.fingerprint'
      ) = '{}'
      AND json_extract(NEW.agent_action_provenance, '$.effectiveDelegatedCapability.identity') =
          'update_learner_goals'
      AND json_extract(NEW.agent_action_provenance, '$.effectiveDelegatedCapability.version') = 2
      AND json_extract(NEW.agent_action_provenance, '$.effectiveDelegatedCapability.projectionVersion') = 2
      AND ${sha256Shape("json_extract(NEW.agent_action_provenance, '$.effectiveDelegatedCapability.fingerprint')")}
      AND NOT EXISTS (
        SELECT 1 FROM json_each(NEW.agent_action_provenance, '$.lineage') AS edge
        WHERE NOT COALESCE((
          edge.type = 'object'
          AND json_remove(
            edge.value,
            '$.childTurnID', '$.childSessionID', '$.childDepth',
            '$.parentTurnID', '$.parentSessionID', '$.parentDepth',
            '$.parentTaskPartID', '$.parentModelMessageID',
            '$.delegatedCapability', '$.delegatedCapabilityFingerprint'
          ) = '{}'
          AND json_type(edge.value, '$.childTurnID') = 'text'
          AND length(json_extract(edge.value, '$.childTurnID')) > 0
          AND json_type(edge.value, '$.childSessionID') = 'text'
          AND length(json_extract(edge.value, '$.childSessionID')) > 0
          AND json_type(edge.value, '$.childDepth') = 'integer'
          AND json_extract(edge.value, '$.childDepth') = CAST(edge.key AS INTEGER) + 1
          AND json_type(edge.value, '$.parentTurnID') = 'text'
          AND length(json_extract(edge.value, '$.parentTurnID')) > 0
          AND json_type(edge.value, '$.parentSessionID') = 'text'
          AND length(json_extract(edge.value, '$.parentSessionID')) > 0
          AND json_type(edge.value, '$.parentDepth') = 'integer'
          AND json_extract(edge.value, '$.parentDepth') = CAST(edge.key AS INTEGER)
          AND json_type(edge.value, '$.parentTaskPartID') = 'text'
          AND length(json_extract(edge.value, '$.parentTaskPartID')) > 0
          AND json_type(edge.value, '$.parentModelMessageID') = 'text'
          AND length(json_extract(edge.value, '$.parentModelMessageID')) > 0
          AND json_type(edge.value, '$.delegatedCapability') = 'object'
          AND json_remove(
            json_extract(edge.value, '$.delegatedCapability'),
            '$.version', '$.parent', '$.inherited', '$.profile', '$.explicit'
          ) = '{}'
          AND json_extract(edge.value, '$.delegatedCapability.version') = 2
          AND ${permissionRuleArrayShape("json_extract(edge.value, '$.delegatedCapability.parent')")}
          AND ${inheritedPermissionRuleShape("json_extract(edge.value, '$.delegatedCapability.inherited')")}
          AND ${permissionRuleArrayShape("json_extract(edge.value, '$.delegatedCapability.profile')")}
          AND ${permissionRuleArrayShape("json_extract(edge.value, '$.delegatedCapability.explicit')")}
          AND ${sha256Shape("json_extract(edge.value, '$.delegatedCapabilityFingerprint')")}
        ), 0)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM json_each(NEW.agent_action_provenance, '$.lineage') AS current
        JOIN json_each(NEW.agent_action_provenance, '$.lineage') AS previous
          ON CAST(current.key AS INTEGER) = CAST(previous.key AS INTEGER) + 1
        WHERE json_extract(current.value, '$.parentTurnID') <>
                json_extract(previous.value, '$.childTurnID')
           OR json_extract(current.value, '$.parentSessionID') <>
                json_extract(previous.value, '$.childSessionID')
           OR json_extract(current.value, '$.parentDepth') <>
                json_extract(previous.value, '$.childDepth')
      )
      AND json_extract(NEW.agent_action_provenance, '$.turnID') = (
        SELECT json_extract(edge.value, '$.childTurnID')
        FROM json_each(NEW.agent_action_provenance, '$.lineage') AS edge
        ORDER BY CAST(edge.key AS INTEGER) DESC LIMIT 1
      )
      AND json_extract(NEW.agent_action_provenance, '$.sessionID') = (
        SELECT json_extract(edge.value, '$.childSessionID')
        FROM json_each(NEW.agent_action_provenance, '$.lineage') AS edge
        ORDER BY CAST(edge.key AS INTEGER) DESC LIMIT 1
      )
      AND json_extract(
        NEW.agent_action_provenance,
        '$.effectiveDelegatedCapability.fingerprint'
      ) = (
        SELECT json_extract(edge.value, '$.delegatedCapabilityFingerprint')
        FROM json_each(NEW.agent_action_provenance, '$.lineage') AS edge
        ORDER BY CAST(edge.key AS INTEGER) DESC LIMIT 1
      )
    )
  )
)`

export const authorityStatements = [
  `CREATE TRIGGER IF NOT EXISTS learner_goal_disposition_validate_insert_v16
   BEFORE INSERT ON learner_goal_disposition_v2
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_disposition_invalid_v16')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learning_command_invocation AS invocation
       WHERE invocation.part_id = NEW.invocation_part_id
         AND invocation.command_name = 'update_learner_goals'
         AND invocation.capability_identity = 'update_learner_goals'
         AND invocation.status = 'admitted'
         AND (
           (
             NEW.disposition = 'legacy_v1'
             AND invocation.command_version = 1
             AND invocation.capability_version = 1
             AND NEW.legacy_command_part_id = invocation.part_id
             AND EXISTS (
               SELECT 1 FROM learner_goal_command AS command
               WHERE command.invocation_part_id = invocation.part_id
                 AND command.semantic_fingerprint = NEW.command_fingerprint
             )
           )
           OR (
             NEW.disposition = 'semantic_terminal_v2'
             AND invocation.command_version = 2
             AND invocation.capability_version = 2
             AND invocation.authorization_basis = 'agent_action'
             AND NEW.command_fingerprint = NEW.incoming_intent_fingerprint
             AND ${canonicalCommandShape("NEW.canonical_command")}
             AND ${exactObject("NEW.semantic_address", ["occurrenceID", "slot"])}
             AND json_extract(NEW.semantic_address, '$.occurrenceID') = invocation.occurrence_id
             AND json_extract(NEW.semantic_address, '$.slot') = 'learner_goal_change_set'
             AND EXISTS (
               SELECT 1
               FROM learner_goal_effect AS effect
               JOIN learner_goal_commit_seal AS seal ON seal.effect_id = effect.id
               JOIN learning_command_invocation AS applied ON applied.part_id = seal.invocation_part_id
               WHERE effect.id = NEW.existing_effect_id
                 AND effect.occurrence_id = invocation.occurrence_id
                 AND effect.semantic_fingerprint = NEW.existing_intent_fingerprint
                 AND applied.status = 'applied'
             )
             AND ((NEW.semantic_outcome = 'already_applied'
                    AND NEW.command_fingerprint = NEW.existing_intent_fingerprint)
               OR (NEW.semantic_outcome = 'semantic_conflict'
                    AND NEW.command_fingerprint <> NEW.existing_intent_fingerprint))
           )
           OR (
             NEW.disposition = 'candidate_v2'
             AND invocation.command_version = 2
             AND invocation.capability_version = 2
             AND invocation.authorization_basis = 'agent_action'
             AND NEW.command_fingerprint = NEW.incoming_intent_fingerprint
             AND ${canonicalCommandShape("NEW.canonical_command")}
             AND ${exactObject("NEW.semantic_address", ["occurrenceID", "slot"])}
             AND json_extract(NEW.semantic_address, '$.occurrenceID') = invocation.occurrence_id
             AND json_extract(NEW.semantic_address, '$.slot') = 'learner_goal_change_set'
             AND ${materializedShape("NEW.materialized_snapshot")}
             AND json(NEW.canonical_command) =
                 json(json_extract(NEW.materialized_snapshot, '$.canonicalCommand'))
             AND ${agentActionShape}
             AND NOT EXISTS (
               SELECT 1 FROM learner_goal_effect AS effect
               JOIN learner_goal_commit_seal AS seal ON seal.effect_id = effect.id
               JOIN learning_command_invocation AS applied ON applied.part_id = seal.invocation_part_id
               WHERE effect.occurrence_id = invocation.occurrence_id AND applied.status = 'applied'
             )
           )
         )
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_capability_issue_validate_insert_v16
   BEFORE INSERT ON learner_goal_capability_issue_v2
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_capability_issue_invalid_v16')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_goal_disposition_v2 AS disposition
       JOIN learning_command_invocation AS invocation
         ON invocation.part_id = disposition.invocation_part_id
       WHERE disposition.invocation_part_id = NEW.invocation_part_id
         AND disposition.disposition = 'candidate_v2'
         AND disposition.agent_action_fingerprint = NEW.agent_action_fingerprint
         AND invocation.status = 'admitted'
         AND json_type(NEW.policy_basis) = 'object'
         AND json_type(NEW.shown_scope) = 'object'
     )
     OR EXISTS (
       SELECT 1 FROM learner_goal_capability_settlement_v2 AS settlement
       WHERE settlement.invocation_part_id = NEW.invocation_part_id
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_capability_settlement_validate_insert_v16
   BEFORE INSERT ON learner_goal_capability_settlement_v2
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_capability_settlement_invalid_v16')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_goal_disposition_v2 AS disposition
       JOIN learning_command_invocation AS invocation
         ON invocation.part_id = disposition.invocation_part_id
       WHERE disposition.invocation_part_id = NEW.invocation_part_id
         AND disposition.disposition = 'candidate_v2'
         AND disposition.agent_action_fingerprint = NEW.agent_action_fingerprint
         AND invocation.status = 'admitted'
         AND (NEW.policy_basis IS NULL OR json_type(NEW.policy_basis) = 'object')
         AND (NEW.reply IS NULL OR json_type(NEW.reply) = 'object')
     )
     OR (NEW.outcome LIKE 'prompted_%' AND NEW.outcome <> 'prompted_abort' AND NOT EXISTS (
       SELECT 1 FROM learner_goal_capability_issue_v2 AS issue
       WHERE issue.invocation_part_id = NEW.invocation_part_id
         AND issue.permission_request_id = NEW.permission_request_id
         AND issue.agent_action_fingerprint = NEW.agent_action_fingerprint
     ));
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_effect_validate_insert_v16
   BEFORE INSERT ON learner_goal_effect
   WHEN NEW.schema_version = 2
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_effect_invalid_v16')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_goal_disposition_v2 AS disposition
       JOIN learner_goal_capability_settlement_v2 AS capability
         ON capability.invocation_part_id = disposition.invocation_part_id
       JOIN learning_command_invocation AS invocation
         ON invocation.part_id = disposition.invocation_part_id
       JOIN learning_admitted_occurrence AS occurrence
         ON occurrence.id = invocation.occurrence_id
       WHERE disposition.invocation_part_id = NEW.agent_action_part_id
         AND disposition.disposition = 'candidate_v2'
         AND disposition.command_fingerprint = NEW.semantic_fingerprint
         AND ${canonicalCommandShape("NEW.command")}
         AND ${materializedShape("NEW.materialized_snapshot")}
         AND json(disposition.canonical_command) = json(NEW.command)
         AND json(disposition.materialized_snapshot) = json(NEW.materialized_snapshot)
         AND capability.agent_action_fingerprint = disposition.agent_action_fingerprint
         AND capability.outcome IN ('policy_allow', 'prompted_allow')
         AND invocation.status = 'admitted'
         AND invocation.occurrence_id = NEW.occurrence_id
         AND occurrence.source_order = NEW.source_order
     )
     OR EXISTS (
       SELECT 1 FROM learner_goal_effect AS existing
       JOIN learner_goal_commit_seal AS seal ON seal.effect_id = existing.id
       WHERE existing.occurrence_id = NEW.occurrence_id
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_revision_validate_insert_v16
   BEFORE INSERT ON learner_goal_revision
   WHEN NEW.schema_version = 2
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_revision_invalid_v16')
     WHERE NOT EXISTS (
       SELECT 1 FROM learner_goal_effect AS effect
       WHERE effect.id = NEW.effect_id
         AND effect.schema_version = 2
         AND effect.occurrence_id = NEW.occurrence_id
         AND effect.source_order = NEW.source_order
         AND effect.time_committed = NEW.time_committed
         AND effect.commit_order = NEW.commit_order
         AND effect.frontier_sequence = NEW.frontier_sequence
         AND ${targetValueShape("NEW.target_value_v2")}
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_effect_operation_validate_insert_v16
   BEFORE INSERT ON learner_goal_effect_operation
   WHEN NEW.schema_version = 2
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_effect_operation_invalid_v16')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       WHERE effect.id = NEW.effect_id
         AND effect.schema_version = 2
         AND (
           (NEW.result_kind = 'changed' AND EXISTS (
             SELECT 1
             FROM learner_goal_revision AS revision
             WHERE revision.id = NEW.revision_id
               AND revision.effect_id = effect.id
               AND revision.goal_id = NEW.goal_id
               AND revision.version = NEW.version
               AND revision.operation_ordinal = NEW.ordinal
               AND revision.revision_role = 'source'
               AND revision.disposition = NEW.disposition
           ))
           OR (NEW.result_kind = 'no_change' AND EXISTS (
             SELECT 1
             FROM json_each(effect.materialized_snapshot, '$.operations') AS operation
             JOIN learner_goal_revision AS revision ON revision.id = NEW.revision_id
             WHERE CAST(operation.key AS INTEGER) = NEW.ordinal
               AND json_extract(operation.value, '$.ordinal') = NEW.ordinal
               AND json_extract(operation.value, '$.operation') = 'update'
               AND json_extract(operation.value, '$.result') = 'no_change'
               AND json(json_extract(operation.value, '$.before')) =
                   json(json_extract(operation.value, '$.after'))
               AND json_extract(operation.value, '$.after.revisionID') = NEW.revision_id
               AND json_extract(operation.value, '$.after.goalID') = NEW.goal_id
               AND json_extract(operation.value, '$.after.version') = NEW.version
               AND json_extract(operation.value, '$.after.disposition.type') = NEW.disposition
               AND revision.goal_id = NEW.goal_id
               AND revision.version = NEW.version
               AND revision.disposition = NEW.disposition
           ))
         )
     );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_commit_seal_validate_insert_v16
   BEFORE INSERT ON learner_goal_commit_seal
   WHEN (SELECT schema_version FROM learner_goal_effect WHERE id = NEW.effect_id) = 2
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_commit_seal_invalid_v16')
     WHERE NOT EXISTS (
       SELECT 1
       FROM learner_goal_effect AS effect
       JOIN learner_goal_disposition_v2 AS disposition
         ON disposition.invocation_part_id = effect.agent_action_part_id
       JOIN learner_goal_capability_settlement_v2 AS capability
         ON capability.invocation_part_id = disposition.invocation_part_id
       JOIN learning_command_receipt AS receipt ON receipt.id = NEW.receipt_id
       JOIN learning_command_invocation AS invocation ON invocation.part_id = NEW.invocation_part_id
       WHERE effect.id = NEW.effect_id
         AND effect.agent_action_part_id = NEW.invocation_part_id
         AND disposition.disposition = 'candidate_v2'
         AND capability.outcome IN ('policy_allow', 'prompted_allow')
         AND receipt.invocation_part_id = invocation.part_id
         AND receipt.occurrence_id = effect.occurrence_id
         AND receipt.capability_identity = 'update_learner_goals'
         AND receipt.capability_version = 2
         AND receipt.authorization_basis = 'agent_action'
         AND receipt.time_committed = effect.time_committed
         AND receipt.commit_order = effect.commit_order
         AND invocation.status = 'admitted'
         AND invocation.command_version = 2
         AND invocation.receipt_id IS NULL
         AND (SELECT count(*) FROM learner_goal_effect_operation AS operation
              WHERE operation.effect_id = effect.id) = effect.operation_count
         AND (SELECT count(*) FROM learner_goal_effect_operation AS operation
              WHERE operation.effect_id = effect.id AND operation.result_kind = 'changed') = effect.change_count
         AND NOT EXISTS (
           SELECT 1 FROM learner_goal_revision AS revision
           JOIN learner_goal_field_basis AS basis ON basis.revision_id = revision.id
           WHERE revision.effect_id = effect.id
         )
     );
   END`,
] as const

export const learningCommandStatements = [
  `CREATE TRIGGER IF NOT EXISTS learner_goal_state_validate_update_v16
   BEFORE UPDATE OF singleton, revision_sequence ON learner_goal_state
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_state_transition_invalid_v16')
     WHERE NEW.singleton <> OLD.singleton
        OR NEW.revision_sequence <= OLD.revision_sequence
        OR NOT EXISTS (
          SELECT 1
          FROM learner_goal_effect AS effect
          JOIN learner_goal_commit_seal AS seal ON seal.effect_id = effect.id
          JOIN learning_command_invocation AS invocation ON invocation.part_id = seal.invocation_part_id
          WHERE effect.schema_version = 2
            AND invocation.status = 'admitted'
            AND (SELECT min(revision_order) FROM learner_goal_revision
                 WHERE effect_id = effect.id) = OLD.revision_sequence + 1
            AND (SELECT max(revision_order) FROM learner_goal_revision
                 WHERE effect_id = effect.id) = NEW.revision_sequence
            AND (SELECT count(*) FROM learner_goal_revision
                 WHERE effect_id = effect.id) = NEW.revision_sequence - OLD.revision_sequence
        );
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_learning_command_terminal_validate_v16
   BEFORE UPDATE OF status, receipt_id, settlement, time_settled, settlement_order
   ON learning_command_invocation
   WHEN OLD.status = 'admitted' AND OLD.command_name = 'update_learner_goals'
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_learning_command_terminal_invalid_v16')
     WHERE NOT COALESCE((
       (
         OLD.command_version = 1
         AND NEW.status = 'error'
         AND json_extract(NEW.settlement, '$.outcome') = 'error'
         AND json_extract(NEW.settlement, '$.code') = 'interrupted'
       )
       OR (
         OLD.command_version = 2
         AND OLD.authorization_basis = 'agent_action'
         AND json_extract(NEW.settlement, '$.goalKind') = 'learner_goal'
         AND json_extract(NEW.settlement, '$.schemaVersion') = 2
         AND (
           (
             NEW.status = 'applied'
             AND EXISTS (
               SELECT 1
               FROM learner_goal_commit_seal AS seal
               JOIN learner_goal_effect AS effect ON effect.id = seal.effect_id
               WHERE seal.invocation_part_id = OLD.part_id
                 AND seal.receipt_id = NEW.receipt_id
                 AND effect.id = json_extract(NEW.settlement, '$.effectID')
             )
           )
           OR (
             NEW.status = 'no_change'
             AND EXISTS (
               SELECT 1 FROM learner_goal_disposition_v2 AS disposition
               JOIN learner_goal_capability_settlement_v2 AS capability
                 ON capability.invocation_part_id = disposition.invocation_part_id
               WHERE disposition.invocation_part_id = OLD.part_id
                 AND disposition.disposition = 'candidate_v2'
                 AND capability.outcome IN ('policy_allow', 'prompted_allow')
             )
           )
           OR NEW.status = 'already_applied'
         )
       )
       OR (
         OLD.command_version = 2
         AND NEW.status = 'error'
         AND json_extract(NEW.settlement, '$.outcome') = 'error'
         AND json_extract(NEW.settlement, '$.code') IN (
           'semantic_conflict', 'context_refresh_required', 'permission_rejected',
           'permission_corrected', 'cancelled', 'interrupted', 'source_unavailable',
           'temporal_context_unavailable', 'capacity_exceeded', 'stale', 'inactive',
           'validation_error'
         )
       )
     ), 0);
   END`,
  `CREATE TRIGGER IF NOT EXISTS learner_goal_learning_command_no_effect_validate_v16
   BEFORE UPDATE OF status ON learning_command_invocation
   WHEN OLD.status = 'admitted'
     AND OLD.command_name = 'update_learner_goals'
     AND NEW.status IN ('no_change', 'error')
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_learning_command_no_effect_invalid_v16')
     WHERE EXISTS (
       SELECT 1 FROM learner_goal_effect AS effect
       JOIN learner_goal_commit_seal AS seal ON seal.effect_id = effect.id
       WHERE effect.occurrence_id = OLD.occurrence_id
         AND seal.invocation_part_id = OLD.part_id
     );
   END`,
] as const

export const immutableStatements = [
  "learner_goal_disposition_v2",
  "learner_goal_capability_issue_v2",
  "learner_goal_capability_settlement_v2",
].map(
  (table) =>
    `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_v16 BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_immutable_v16'); END`,
)

export const deletionStatements = [
  `CREATE TRIGGER IF NOT EXISTS learner_goal_disposition_v2_delete_forbidden_v16
   BEFORE DELETE ON learner_goal_disposition_v2
   WHEN EXISTS (
     SELECT 1 FROM learning_command_invocation
     WHERE part_id = OLD.invocation_part_id
   )
   BEGIN
     SELECT RAISE(ABORT, 'learner_goal_disposition_v2_delete_forbidden_v16');
   END`,
  ...["learner_goal_capability_issue_v2", "learner_goal_capability_settlement_v2"].map(
    (table) =>
      `CREATE TRIGGER IF NOT EXISTS ${table}_delete_forbidden_v16
       BEFORE DELETE ON ${table}
       WHEN EXISTS (
         SELECT 1 FROM learner_goal_disposition_v2
         WHERE invocation_part_id = OLD.invocation_part_id
       )
       BEGIN
         SELECT RAISE(ABORT, '${table}_delete_forbidden_v16');
       END`,
  ),
] as const

export const statements = [
  ...authorityStatements,
  ...learningCommandStatements,
  ...immutableStatements,
  ...deletionStatements,
] as const

export function install(tx: Transaction) {
  return Effect.forEach(statements, (statement) => tx.run(statement).pipe(Effect.orDie), { discard: true })
}
