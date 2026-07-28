import type {
  ErrorSettlement,
  RepresentationAlreadyAppliedSettlement,
  RepresentationAppliedSettlement,
} from "../learning-command/schema"
import {
  hasShape,
  isID,
  isNonNegativeInteger,
  isRecord,
} from "../learning-command/settlement-validation"
import {
  representationFailureCodesV12,
  type RepresentationFailureCode,
} from "./learning-command-failure-code-v12"

export type { RepresentationFailureCode } from "./learning-command-failure-code-v12"

export type RepresentationSettlement =
  | RepresentationAppliedSettlement
  | RepresentationAlreadyAppliedSettlement
  | ErrorSettlement

const errorCodes: ReadonlySet<string> = new Set(representationFailureCodesV12)

export function requireRepresentationSettlement(value: unknown): RepresentationSettlement {
  if (!isRepresentationSettlement(value)) throw new Error("Stored Representation learning settlement is invalid")
  return value
}

export function isRepresentationSettlement(value: unknown): value is RepresentationSettlement {
  if (!isRecord(value) || !validMetadata(value)) return false
  if (value.outcome === "error") {
    return (
      hasShape(value, ["outcome", "code", "settlementTime", "settlementOrder"]) &&
      typeof value.code === "string" &&
      errorCodes.has(value.code)
    )
  }
  return (
    (value.outcome === "applied" || value.outcome === "already_applied") &&
    hasShape(value, [
      "outcome",
      "receiptID",
      "effectID",
      "representationRevisionID",
      "effectiveArtifactID",
      "sourceRevisionID",
      "producerKind",
      "settlementTime",
      "settlementOrder",
    ]) &&
    isID(value.receiptID, "lcr") &&
    isID(value.effectID, "rfx") &&
    isID(value.representationRevisionID, "rep") &&
    isID(value.effectiveArtifactID, "art") &&
    isID(value.sourceRevisionID, "arv") &&
    (value.producerKind === "local_pdf" || value.producerKind === "configured_model")
  )
}

function validMetadata(value: Record<string, unknown>) {
  return isNonNegativeInteger(value.settlementTime) && isNonNegativeInteger(value.settlementOrder)
}
