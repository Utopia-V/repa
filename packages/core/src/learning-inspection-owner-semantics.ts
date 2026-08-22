export const INSPECTION_OWNER_SEMANTICS = {
  course_view: {
    meaning:
      "Course structure, immutable View revisions, and the separately selected working revision are distinct owner facts.",
    potentialEffects: ["Course Context", "eligible exact Course basis for goals, assignments, judgments, or advice"],
    correctionRoute:
      "Use the existing Course transitions: create or revise a View, select or clear its working revision, withdraw, or restore.",
  },
  learning_navigation: {
    meaning:
      "Learner-owned default-Course and route-anchor navigation is independent of Course structure and selection.",
    potentialEffects: ["startup Course resolution", "eligible navigation Context"],
    correctionRoute: "Use the default-Course or exact Course route-anchor owner transition.",
  },
  artifact: {
    meaning:
      "Artifact identity, observed revisions, attribution, binding, withdrawal, and backing availability remain distinct.",
    potentialEffects: ["Representation derivation", "Material Map targets", "source-bearing Context and owner bases"],
    correctionRoute: "Use Artifact observation, rebinding, lineage correction, withdrawal, or restore transitions.",
  },
  representation: {
    meaning: "A Representation revision is one immutable accepted derivation; it has no generic latest head.",
    potentialEffects: ["Material Map targets", "material Context", "source-bearing owner bases"],
    correctionRoute: "Create a new derivation or reconcile its availability or continued-use grant.",
  },
  material_map: {
    meaning:
      "Multiple immutable Material Maps may coexist; successor and disposition do not create a generic current Map.",
    potentialEffects: ["material Context", "learner-response evidence targets", "judgment and advice inputs"],
    correctionRoute: "Create an explicit Map successor or change the Map disposition.",
  },
  material_selector: {
    meaning: "A selector is an exact Map-scoped identity and is not a Course membership by itself.",
    potentialEffects: ["material Context", "response-evidence target", "optional explicit Course alignment"],
    correctionRoute: "Create the appropriate Map successor; do not rewrite an immutable selector in place.",
  },
  material_alignment: {
    meaning: "An alignment separately binds one exact Map selector to one exact Course membership.",
    potentialEffects: ["Course-aware material Context", "owner-native learning-material navigation"],
    correctionRoute: "Create an alignment successor or change its disposition.",
  },
  learner_goal: {
    meaning:
      "A Goal has immutable revisions, an exact current head, owner bases, and a separate lifecycle disposition.",
    potentialEffects: ["Goal Context", "judgment or advice basis", "eligible Tutor-choice input"],
    correctionRoute: "Use the Goal create, revise, resume, replace, or lifecycle command with the exact expected head.",
  },
  retained_steering: {
    meaning: "Retained learner steering is a bounded current constraint; unsupported history is not an empty history.",
    potentialEffects: ["future Context construction", "conditional current-purpose composition"],
    correctionRoute: "Use the retained-learning-steering owner command.",
  },
  learner_response_evidence: {
    meaning: "Learner-response evidence is fallible occurrence-bound supports/does_not_support evidence, not mastery.",
    potentialEffects: ["evidence Context", "judgment or advice basis", "Tutor interpretation"],
    correctionRoute: "Use the evidence revise or retract owner command.",
  },
  future_attention: {
    meaning:
      "A FutureAttention concern is an owner-defined future issue; command settlement and served/not_served finalization are separate.",
    potentialEffects: ["conditional current-purpose contribution", "eligible input to a later Tutor action selection"],
    correctionRoute: "Use the FutureAttention revise, dismiss, supersede, reopen, or finalization transition.",
  },
  assignment: {
    meaning:
      "An Assignment is a fallible obligation owner; completion is not learning and Goal remains a peer authority.",
    potentialEffects: ["learning-help Context", "judgment or advice basis", "registered exact citation"],
    correctionRoute: "Use the Assignment revise, complete, cancel, dismiss, reopen, or replace command.",
  },
  learner_state_judgment: {
    meaning: "A learner-state judgment is a fallible whole-record judgment, not a score or mastery certificate.",
    potentialEffects: ["teaching adaptation Context", "advisory-plan basis"],
    correctionRoute: "Use the learner-state judgment revise, retire, or restore command.",
  },
  advisory_plan_suggestion: {
    meaning: "An advisory suggestion is fallible advice, not a commitment, adherence record, or global schedule.",
    potentialEffects: ["near-term Tutor planning advice", "later learner/model reconsideration"],
    correctionRoute: "Use the advisory suggestion revise, retire, or restore command.",
  },
  learning_context: {
    meaning:
      "A Context cut is immutable and operation-bound; a later operation receives a new cut rather than a correction.",
    potentialEffects: ["provider input construction", "capacity and compaction", "deletion audit"],
    correctionRoute: "There is no Context correction; inspect or create a later operation cut.",
  },
  learning_interaction: {
    meaning:
      "Interaction history is Session/Turn/Input/model-operation presentation; imported history remains inert presentation-only.",
    potentialEffects: ["current conversation Context", "bounded prior-Interaction retrieval", "deletion audit"],
    correctionRoute:
      "Append correction provenance and correct the affected domain owner; Session deletion is a separate destructive choice.",
  },
} as const

export type InspectionOwnerArm = keyof typeof INSPECTION_OWNER_SEMANTICS
