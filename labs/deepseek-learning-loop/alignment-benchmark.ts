export const skillIds = [
  "recursion",
  "iteration",
  "testing",
  "debugging",
  "complexity-analysis",
  "benchmarking",
  "data-modeling",
  "serialization",
] as const

export const alignmentRelations = ["teaches", "assesses", "requires"] as const
export const annotationStatuses = ["resolved", "ambiguous", "none"] as const
export const confidenceLevels = ["high", "medium", "low"] as const
export const benchmarkCategories = [
  "obvious",
  "semantic_hidden",
  "keyword_trap",
  "ambiguous",
] as const

export type SkillId = (typeof skillIds)[number]
export type AlignmentRelation = (typeof alignmentRelations)[number]
export type AnnotationStatus = (typeof annotationStatuses)[number]
export type ConfidenceLevel = (typeof confidenceLevels)[number]
export type BenchmarkCategory = (typeof benchmarkCategories)[number]

export type Alignment = {
  skillId: SkillId
  relation: AlignmentRelation
}

export type CandidateAnnotation = {
  taskId: string
  sourceRef: string
  status: AnnotationStatus
  confidence: ConfidenceLevel
  alignments: Alignment[]
  basis: string
}

export type BenchmarkTask = {
  taskId: string
  sourceRef: string
  category: BenchmarkCategory
  text: string
  expected: {
    status: AnnotationStatus
    alignments: Alignment[]
  }
}

export const skills: Array<{
  skillId: SkillId
  definition: string
  confusableWith: SkillId
  lexicalAliases: string[]
}> = [
  {
    skillId: "recursion",
    definition: "Solve a problem through self-reference on smaller instances of the same problem.",
    confusableWith: "iteration",
    lexicalAliases: ["recursion", "recursive", "calls itself"],
  },
  {
    skillId: "iteration",
    definition: "Repeat computation by updating explicit loop state until a stopping condition holds.",
    confusableWith: "recursion",
    lexicalAliases: ["iteration", "iterative", "loop", "for-loop", "while-loop"],
  },
  {
    skillId: "testing",
    definition: "Design or execute checks that can reveal deviations from expected behavior.",
    confusableWith: "debugging",
    lexicalAliases: ["testing", "unit test", "test suite", "test case"],
  },
  {
    skillId: "debugging",
    definition: "Localize, explain, and repair the cause of an observed failure.",
    confusableWith: "testing",
    lexicalAliases: ["debugging", "debugger", "stack trace", "root cause", "fix bug"],
  },
  {
    skillId: "complexity-analysis",
    definition: "Reason analytically about how resource use grows as input size changes.",
    confusableWith: "benchmarking",
    lexicalAliases: ["complexity", "big-o", "asymptotic", "growth rate"],
  },
  {
    skillId: "benchmarking",
    definition: "Empirically measure runtime or resource behavior under specified workloads.",
    confusableWith: "complexity-analysis",
    lexicalAliases: ["benchmark", "benchmarking", "wall-clock", "throughput", "latency"],
  },
  {
    skillId: "data-modeling",
    definition: "Choose entities, identifiers, relationships, and constraints that represent a domain.",
    confusableWith: "serialization",
    lexicalAliases: ["data model", "data modeling", "schema", "entity", "relationship", "foreign key"],
  },
  {
    skillId: "serialization",
    definition: "Encode and decode information in an external representation while preserving meaning.",
    confusableWith: "data-modeling",
    lexicalAliases: ["serialization", "serialize", "deserialize", "encoding", "decoding", "json", "byte stream"],
  },
]

const edge = (skillId: SkillId, relation: AlignmentRelation): Alignment => ({
  skillId,
  relation,
})

function task(
  taskId: string,
  category: BenchmarkCategory,
  text: string,
  status: AnnotationStatus,
  alignments: Alignment[] = [],
): BenchmarkTask {
  return {
    taskId,
    sourceRef: `artifact:alignment-benchmark:${taskId}:v1`,
    category,
    text,
    expected: { status, alignments },
  }
}

export const benchmarkTasks: BenchmarkTask[] = [
  task(
    "O01",
    "obvious",
    "Instructor demonstration: recursive traversal of a tree, with each recursive call explained. No learner score is produced.",
    "resolved",
    [edge("recursion", "teaches")],
  ),
  task(
    "O02",
    "obvious",
    "Quiz: write a for-loop that visits every array element exactly once. The rubric awards all points for the loop logic.",
    "resolved",
    [edge("iteration", "assesses")],
  ),
  task(
    "O03",
    "obvious",
    "The application submission must include a unit test suite. The rubric scores only application behavior and does not score test quality.",
    "resolved",
    [edge("testing", "requires")],
  ),
  task(
    "O04",
    "obvious",
    "Debugging exam: locate the root cause of the failing request and repair it. Points are awarded for localization and the valid fix.",
    "resolved",
    [edge("debugging", "assesses")],
  ),
  task(
    "O05",
    "obvious",
    "Exam question: derive the Big-O complexity of the supplied algorithm. The derivation and bound are graded.",
    "resolved",
    [edge("complexity-analysis", "assesses")],
  ),
  task(
    "O06",
    "obvious",
    "Tutorial: the instructor demonstrates a benchmarking harness and explains warm-up, repeated samples, and workload control.",
    "resolved",
    [edge("benchmarking", "teaches")],
  ),
  task(
    "O07",
    "obvious",
    "Design a database schema for a library. The rubric scores entities, relationships, keys, and constraints.",
    "resolved",
    [edge("data-modeling", "assesses")],
  ),
  task(
    "O08",
    "obvious",
    "The API submission must serialize and deserialize JSON. The rubric scores only business behavior, not the serialization design.",
    "resolved",
    [edge("serialization", "requires")],
  ),
  task(
    "O09",
    "obvious",
    "Worked example: the instructor compares recursive and iterative traversals step by step. There is no learner assessment.",
    "resolved",
    [edge("recursion", "teaches"), edge("iteration", "teaches")],
  ),
  task(
    "O10",
    "obvious",
    "Assignment: design a test suite for the parser. The rubric scores fault-revealing cases and coverage of boundary behavior.",
    "resolved",
    [edge("testing", "assesses")],
  ),

  task(
    "H01",
    "semantic_hidden",
    "Build a report generator for an arbitrarily nested single-child container. To obtain its value, a container is either a number or exactly one smaller container; for the smaller container, invoke the same procedure. Extraction must work, but the rubric awards points only for report layout and does not score the extraction method.",
    "resolved",
    [edge("recursion", "requires")],
  ),
  task(
    "H02",
    "semantic_hidden",
    "Consume sensor readings one at a time until end-of-file, carrying forward an accumulator after each reading. The rubric awards points for the state update after each reading and for applying the stopping condition correctly.",
    "resolved",
    [edge("iteration", "assesses")],
  ),
  task(
    "H03",
    "semantic_hidden",
    "Before implementation, propose input/output pairs that expose boundary faults. The rubric scores how effectively the submitted cases reveal defects.",
    "resolved",
    [edge("testing", "assesses")],
  ),
  task(
    "H04",
    "semantic_hidden",
    "A service fails only on its second request. Determine the causal statement and submit a repair. Points are awarded for localization and correction.",
    "resolved",
    [edge("debugging", "assesses")],
  ),
  task(
    "H05",
    "semantic_hidden",
    "For n approaching infinity, rank n log n, n squared, and 2 to the n. The rubric scores the ordering and mathematical justification.",
    "resolved",
    [edge("complexity-analysis", "assesses")],
  ),
  task(
    "H06",
    "semantic_hidden",
    "Run both implementations on three workload sizes, record observed durations over thirty repetitions, and explain the variance. The experimental method is graded.",
    "resolved",
    [edge("benchmarking", "assesses")],
  ),
  task(
    "H07",
    "semantic_hidden",
    "Choose the records, identifiers, cardinalities, and integrity rules needed to represent authors lending books. The rubric scores fidelity to the domain.",
    "resolved",
    [edge("data-modeling", "assesses")],
  ),
  task(
    "H08",
    "semantic_hidden",
    "Transform an object graph into a portable sequence and reconstruct an equivalent graph. The rubric scores round-trip preservation.",
    "resolved",
    [edge("serialization", "assesses")],
  ),
  task(
    "H09",
    "semantic_hidden",
    "The instructor traces a nested-expression evaluator that handles every child expression by applying the same evaluator to that child. No learner score is produced.",
    "resolved",
    [edge("recursion", "teaches")],
  ),
  task(
    "H10",
    "semantic_hidden",
    "The current command task depends on a previously authored converter that maps external key-value text to an in-memory record and back. That converter must work for the command to run, but this rubric awards points only for command routing and exit codes and does not rescore the converter.",
    "resolved",
    [edge("serialization", "requires")],
  ),

  task(
    "K01",
    "keyword_trap",
    "Read the catalog entry titled 'Recursion and Iteration in Modern Poetry' and copy its ISBN. No programming or algorithm work occurs.",
    "none",
  ),
  task(
    "K02",
    "keyword_trap",
    "Rename the configuration flag debuggingEnabled to diagnosticsEnabled. The task is a spelling-only refactor with no failure investigation.",
    "none",
  ),
  task(
    "K03",
    "keyword_trap",
    "Copy the provided unit test suite unchanged into the archive. It is neither run nor graded, and the learner designs no checks.",
    "none",
  ),
  task(
    "K04",
    "keyword_trap",
    "The worksheet title is 'Complexity Analysis'. The only task is to submit today's attendance code; no technical response is requested.",
    "none",
  ),
  task(
    "K05",
    "keyword_trap",
    "For the event named Benchmarking Day, write down the speaker's room number. No software measurement activity occurs.",
    "none",
  ),
  task(
    "K06",
    "keyword_trap",
    "For the video file data-modeling-lecture.mp4, change playback speed to 1.25x. Do not answer questions about its content.",
    "none",
  ),
  task(
    "K07",
    "keyword_trap",
    "Translate the user-interface message 'serialization failed' into Chinese. No program representation is designed or executed.",
    "none",
  ),
  task(
    "K08",
    "keyword_trap",
    "Open iteration 2 of the design document and correct one spelling error. Here iteration is only a document version label.",
    "none",
  ),
  task(
    "K09",
    "keyword_trap",
    "Implement the supplied function using either a recursive or iterative solution of your choice. The rubric scores only final outputs; neither individual approach is mandated, but one of the two must be chosen.",
    "ambiguous",
  ),
  task(
    "K10",
    "keyword_trap",
    "Instructor demonstration: debugging a failing program by narrowing the cause and applying a repair. Learners are not scored.",
    "resolved",
    [edge("debugging", "teaches")],
  ),

  task(
    "A01",
    "ambiguous",
    "Create a directory-size utility. The implementation method and grading rubric are not supplied.",
    "ambiguous",
  ),
  task(
    "A02",
    "ambiguous",
    "Make the parser reliable. No required artifacts, evaluation criteria, or activity format are stated.",
    "ambiguous",
  ),
  task(
    "A03",
    "ambiguous",
    "Improve a slow endpoint. The record does not state whether to reason analytically, measure workloads, or locate a defect.",
    "ambiguous",
  ),
  task(
    "A04",
    "ambiguous",
    "Store user profiles for offline use. Representation, domain constraints, and rubric are unspecified.",
    "ambiguous",
  ),
  task(
    "A05",
    "ambiguous",
    "Exam item: analyze program performance. No code, measurements, input model, or scoring details are provided.",
    "ambiguous",
  ),
  task(
    "A06",
    "ambiguous",
    "Quality lab: improve the failing code. The record gives no distinction between finding the cause and constructing checks.",
    "ambiguous",
  ),
  task(
    "A07",
    "ambiguous",
    "Module 4 mentions recursion and iteration, but the activity type, learner action, and rubric are omitted.",
    "ambiguous",
  ),
  task(
    "A08",
    "ambiguous",
    "Design the backend for a library service. Persistence format, domain constraints, and evaluation targets are not stated.",
    "ambiguous",
  ),
  task(
    "A09",
    "ambiguous",
    "Investigate why behavior changes at larger scale. The record contains no indication of analytical, empirical, or fault-localization work.",
    "ambiguous",
  ),
  task(
    "A10",
    "ambiguous",
    "Submit a robust import feature. Input representation, expected checks, failure symptoms, and grading criteria are not described.",
    "ambiguous",
  ),
]

function edgeKey(value: Alignment) {
  return `${value.skillId}:${value.relation}`
}

function equalSets(left: Set<string>, right: Set<string>) {
  return left.size === right.size && [...left].every((value) => right.has(value))
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 1 : numerator / denominator
}

function rounded(value: number) {
  return Number(value.toFixed(4))
}

function f1(precision: number, recall: number) {
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
}

export function expectedCandidates(): CandidateAnnotation[] {
  return benchmarkTasks.map((item) => ({
    taskId: item.taskId,
    sourceRef: item.sourceRef,
    status: item.expected.status,
    confidence: "high",
    alignments: item.expected.alignments,
    basis: "benchmark oracle",
  }))
}

export function lexicalBaseline(): CandidateAnnotation[] {
  const ambiguityCues = /not supplied|does not state|unspecified|no required|no distinction|omitted|not stated|not described/i
  const teachCues = /instructor|tutorial|demonstration|worked example/i
  const assessCues = /quiz|exam|rubric|points|graded|scores|scoring/i
  const requireCues = /must|required|submission|submit/i

  return benchmarkTasks.map((item) => {
    if (ambiguityCues.test(item.text)) {
      return {
        taskId: item.taskId,
        sourceRef: item.sourceRef,
        status: "ambiguous",
        confidence: "medium",
        alignments: [],
        basis: "lexical ambiguity cue",
      }
    }
    const normalized = item.text.toLowerCase()
    const matched = skills.filter((skill) =>
      skill.lexicalAliases.some((alias) => normalized.includes(alias)),
    )
    if (matched.length === 0) {
      return {
        taskId: item.taskId,
        sourceRef: item.sourceRef,
        status: "none",
        confidence: "medium",
        alignments: [],
        basis: "no lexical skill alias",
      }
    }
    const relation: AlignmentRelation = teachCues.test(item.text)
      ? "teaches"
      : assessCues.test(item.text)
        ? "assesses"
        : requireCues.test(item.text)
          ? "requires"
          : "assesses"
    return {
      taskId: item.taskId,
      sourceRef: item.sourceRef,
      status: "resolved",
      confidence: "medium",
      alignments: matched.map((skill) => edge(skill.skillId, relation)),
      basis: "lexical alias and nearby activity cue",
    }
  })
}

export function scoreAnnotations(candidates: CandidateAnnotation[]) {
  const expectedById = new Map(benchmarkTasks.map((item) => [item.taskId, item]))
  const candidateById = new Map<string, CandidateAnnotation>()
  const duplicateTaskIds: string[] = []
  const unknownTaskIds: string[] = []
  for (const candidate of candidates) {
    if (!expectedById.has(candidate.taskId)) unknownTaskIds.push(candidate.taskId)
    if (candidateById.has(candidate.taskId)) duplicateTaskIds.push(candidate.taskId)
    else candidateById.set(candidate.taskId, candidate)
  }
  const missingTaskIds = benchmarkTasks
    .filter((item) => !candidateById.has(item.taskId))
    .map((item) => item.taskId)
  const sourceMismatches: string[] = []
  const statusShapeMismatches: string[] = []
  let exactRecords = 0
  let edgeTruePositive = 0
  let edgeFalsePositive = 0
  let edgeFalseNegative = 0
  let highConfidenceErrors = 0
  const relationCounts = Object.fromEntries(
    alignmentRelations.map((relation) => [relation, { truePositive: 0, falsePositive: 0, falseNegative: 0 }]),
  ) as Record<AlignmentRelation, { truePositive: number; falsePositive: number; falseNegative: number }>
  const categoryCounts = Object.fromEntries(
    benchmarkCategories.map((category) => [category, { records: 0, exact: 0, edgeTruePositive: 0, edgeFalseNegative: 0 }]),
  ) as Record<BenchmarkCategory, { records: number; exact: number; edgeTruePositive: number; edgeFalseNegative: number }>

  for (const item of benchmarkTasks) {
    const candidate = candidateById.get(item.taskId)
    const expectedEdges = new Set(item.expected.alignments.map(edgeKey))
    const predictedEdges = new Set((candidate?.alignments ?? []).map(edgeKey))
    const sourceCorrect = candidate?.sourceRef === item.sourceRef
    if (candidate && !sourceCorrect) sourceMismatches.push(item.taskId)
    const shapeCorrect =
      candidate === undefined ||
      (candidate.status === "resolved"
        ? candidate.alignments.length > 0
        : candidate.alignments.length === 0)
    if (!shapeCorrect) statusShapeMismatches.push(item.taskId)
    const exact =
      candidate !== undefined &&
      sourceCorrect &&
      candidate.status === item.expected.status &&
      equalSets(expectedEdges, predictedEdges)
    if (exact) exactRecords += 1
    if (!exact && candidate?.confidence === "high") highConfidenceErrors += 1

    const category = categoryCounts[item.category]
    category.records += 1
    if (exact) category.exact += 1
    for (const expectedEdge of item.expected.alignments) {
      if (predictedEdges.has(edgeKey(expectedEdge))) {
        edgeTruePositive += 1
        relationCounts[expectedEdge.relation].truePositive += 1
        category.edgeTruePositive += 1
      } else {
        edgeFalseNegative += 1
        relationCounts[expectedEdge.relation].falseNegative += 1
        category.edgeFalseNegative += 1
      }
    }
    for (const predictedEdge of candidate?.alignments ?? []) {
      if (!expectedEdges.has(edgeKey(predictedEdge))) {
        edgeFalsePositive += 1
        relationCounts[predictedEdge.relation].falsePositive += 1
      }
    }
  }

  const precision = ratio(edgeTruePositive, edgeTruePositive + edgeFalsePositive)
  const recall = ratio(edgeTruePositive, edgeTruePositive + edgeFalseNegative)
  const emptyTrapTasks = benchmarkTasks.filter(
    (item) => item.category === "keyword_trap" && item.expected.alignments.length === 0,
  )
  const trapFalsePositiveRecords = emptyTrapTasks.filter(
    (item) => (candidateById.get(item.taskId)?.alignments.length ?? 0) > 0,
  ).length
  const ambiguousTasks = benchmarkTasks.filter((item) => item.expected.status === "ambiguous")
  const ambiguousCorrect = ambiguousTasks.filter(
    (item) => candidateById.get(item.taskId)?.status === "ambiguous",
  ).length

  return {
    records: benchmarkTasks.length,
    transport: {
      valid:
        candidates.length === benchmarkTasks.length &&
        duplicateTaskIds.length === 0 &&
        unknownTaskIds.length === 0 &&
        missingTaskIds.length === 0 &&
        sourceMismatches.length === 0 &&
        statusShapeMismatches.length === 0,
      candidateCount: candidates.length,
      duplicateTaskIds,
      unknownTaskIds,
      missingTaskIds,
      sourceMismatches,
      statusShapeMismatches,
    },
    exactRecords,
    exactRecordAccuracy: rounded(ratio(exactRecords, benchmarkTasks.length)),
    edges: {
      truePositive: edgeTruePositive,
      falsePositive: edgeFalsePositive,
      falseNegative: edgeFalseNegative,
      precision: rounded(precision),
      recall: rounded(recall),
      f1: rounded(f1(precision, recall)),
    },
    relations: Object.fromEntries(
      alignmentRelations.map((relation) => {
        const counts = relationCounts[relation]
        const relationPrecision = ratio(counts.truePositive, counts.truePositive + counts.falsePositive)
        const relationRecall = ratio(counts.truePositive, counts.truePositive + counts.falseNegative)
        return [
          relation,
          {
            ...counts,
            precision: rounded(relationPrecision),
            recall: rounded(relationRecall),
            f1: rounded(f1(relationPrecision, relationRecall)),
          },
        ]
      }),
    ),
    categories: Object.fromEntries(
      benchmarkCategories.map((category) => {
        const counts = categoryCounts[category]
        return [
          category,
          {
            ...counts,
            exactAccuracy: rounded(ratio(counts.exact, counts.records)),
            edgeRecall: rounded(ratio(counts.edgeTruePositive, counts.edgeTruePositive + counts.edgeFalseNegative)),
          },
        ]
      }),
    ),
    ambiguousRecall: rounded(ratio(ambiguousCorrect, ambiguousTasks.length)),
    keywordTrapFalsePositiveRecords: trapFalsePositiveRecords,
    keywordTrapFalsePositiveRate: rounded(ratio(trapFalsePositiveRecords, emptyTrapTasks.length)),
    highConfidenceErrors,
  }
}

export const candidateSignalThresholds = {
  minimumExactRecordGainOverLexicalBaseline: 0.2,
  minimumSemanticHiddenEdgeRecall: 0.8,
  maximumKeywordTrapFalsePositiveRate: 0.2,
  minimumAmbiguousRecall: 0.6,
} as const

export function meetsCandidateSignal(
  score: ReturnType<typeof scoreAnnotations>,
  baseline: ReturnType<typeof scoreAnnotations>,
) {
  return (
    score.transport.valid &&
    score.exactRecordAccuracy - baseline.exactRecordAccuracy >=
      candidateSignalThresholds.minimumExactRecordGainOverLexicalBaseline &&
    score.categories.semantic_hidden!.edgeRecall >=
      candidateSignalThresholds.minimumSemanticHiddenEdgeRecall &&
    score.keywordTrapFalsePositiveRate <=
      candidateSignalThresholds.maximumKeywordTrapFalsePositiveRate &&
    score.ambiguousRecall >= candidateSignalThresholds.minimumAmbiguousRecall
  )
}
