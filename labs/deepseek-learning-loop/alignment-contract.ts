import { z } from "zod"
import {
  alignmentRelations,
  annotationStatuses,
  benchmarkTasks,
  confidenceLevels,
  skillIds,
  skills,
  type BenchmarkCategory,
} from "./alignment-benchmark"

export const candidateAnnotationSchema = z.object({
  taskId: z.string().min(1).max(20),
  sourceRef: z.string().min(1).max(160),
  status: z.enum(annotationStatuses),
  confidence: z.enum(confidenceLevels),
  alignments: z
    .array(
      z.object({
        skillId: z.enum(skillIds),
        relation: z.enum(alignmentRelations),
      }),
    )
    .max(8),
  basis: z.string().min(1).max(600),
})

export function batchAnnotationSchema(expectedCount: number) {
  return z.object({
    annotations: z.array(candidateAnnotationSchema).length(expectedCount),
  })
}

export function annotationPolicy() {
  return `Produce untrusted candidate annotations about task artifacts.

Relations:
- teaches: the activity explicitly instructs or demonstrates the skill; learner performance is not scored.
- assesses: the scoring rule directly rewards or penalizes performance of the skill.
- requires: successful completion necessarily uses the skill, but the scoring rule does not assess that skill directly.

Status:
- resolved: source and rubric support a unique set of one or more alignments.
- none: source clearly has no substantive relationship to the listed skills; incidental words, filenames, titles, optional approaches, and mechanical copying do not count.
- ambiguous: the available source cannot distinguish plausible relations or skills. Return no alignments rather than guessing.

For none or ambiguous, alignments must be empty. Preserve taskId and sourceRef exactly. Do not infer learner ability or modify curriculum.`
}

function curriculumText() {
  return skills
    .map(
      (skill) =>
        `- ${skill.skillId}: ${skill.definition} Confusable with ${skill.confusableWith}.`,
    )
    .join("\n")
}

export function batchPrompt(category: BenchmarkCategory) {
  const tasks = benchmarkTasks
    .filter((item) => item.category === category)
    .map(({ taskId, sourceRef, text }) => ({ taskId, sourceRef, text }))
  return `Curriculum vocabulary:\n${curriculumText()}\n\nAnnotate this ${category} batch:\n${JSON.stringify(tasks, null, 2)}`
}

