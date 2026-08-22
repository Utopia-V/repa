export * as LearningInspectionOwner from "./learning-inspection-owner"

import { INSPECTION_OWNER_SEMANTICS } from "./learning-inspection-owner-semantics"
import { INSPECTION_OWNER_KIND, type LearningInspectionSchema } from "./learning-inspection-schema"

type Owner = Omit<LearningInspectionSchema.Projection["owner"], "kind" | "capabilityID" | "action" | "records">

export function inspectionOwner(
  arm: LearningInspectionSchema.OwnerArm,
  relation: string,
  facts: readonly LearningInspectionSchema.Fact[] = [],
): Owner {
  return { arm, relation, ...INSPECTION_OWNER_SEMANTICS[arm], facts }
}

export const INSPECTION_OWNER_ARMS = Object.keys(
  INSPECTION_OWNER_SEMANTICS,
) as readonly LearningInspectionSchema.OwnerArm[]

export function inspectionOwnerKind(arm: LearningInspectionSchema.OwnerArm) {
  return INSPECTION_OWNER_KIND[arm]
}
