export type LearningActivityAuthority =
  | { kind: "ordinary_reference" }
  | { kind: "formal_assessment"; taskId: string; attemptId: string }

export function assertFormalAssessmentAuthority(authority: LearningActivityAuthority) {
  if (authority.kind !== "formal_assessment") {
    throw new Error(
      "NoActiveFormalAssessment: retrieved material cannot create assessment authority; no effect occurred",
    )
  }
  return authority
}

