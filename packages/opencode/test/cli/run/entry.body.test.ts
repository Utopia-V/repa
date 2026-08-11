import { describe, expect, test } from "bun:test"
import type { ToolPart } from "@opencode-ai/sdk/v2"
import { entryBody, entryCanStream, entryDone } from "@/cli/cmd/run/entry.body"
import type { StreamCommit, ToolSnapshot } from "@/cli/cmd/run/types"
import { toolInlineInfo } from "@/cli/cmd/run/tool"
import { LearningCommand } from "@opencode-ai/core/learning-command"
import { SemanticPresentation } from "@opencode-ai/core/semantic-presentation"

function commit(input: Partial<StreamCommit> & Pick<StreamCommit, "kind" | "text" | "phase" | "source">): StreamCommit {
  return input
}

function toolPart(tool: string, state: ToolPart["state"], id = `${tool}-1`, messageID = `msg-${tool}`): ToolPart {
  return {
    id,
    sessionID: "session-1",
    messageID,
    type: "tool",
    callID: `call-${id}`,
    tool,
    state,
  } as ToolPart
}

function toolCommit(input: {
  tool: string
  state: ToolPart["state"]
  phase?: StreamCommit["phase"]
  toolState?: StreamCommit["toolState"]
  text?: string
  id?: string
  messageID?: string
}) {
  return commit({
    kind: "tool",
    text: input.text ?? "",
    phase: input.phase ?? "final",
    source: "tool",
    tool: input.tool,
    toolState: input.toolState ?? "completed",
    part: toolPart(input.tool, input.state, input.id, input.messageID),
  })
}

function goalMeaning(outcome: string) {
  return {
    outcome,
    conditions: [`Demonstrate: ${outcome}`],
    scope: { type: "learner_home" as const },
    target: { type: "absent" as const },
    disposition: "active" as const,
    fieldBases: {
      outcome: { type: "accepted" as const },
      conditions: { type: "accepted" as const },
      scope: { type: "accepted" as const },
      target: { type: "accepted" as const },
      disposition: { type: "accepted" as const },
    },
  }
}

function structured(next: StreamCommit) {
  const body = entryBody(next)
  expect(body.type).toBe("structured")
  if (body.type !== "structured") {
    throw new Error("expected structured body")
  }

  return body.snapshot
}

describe("run entry body", () => {
  test("fails closed when a consequential final result has no typed projection", () => {
    const part = toolPart("content_write", {
      status: "completed",
      input: { filePath: "C:\\course\\notes\\lesson.md" },
      output: "write completed",
      title: "lesson.md",
      metadata: {},
      time: { start: 1, end: 2 },
    })

    expect(toolInlineInfo(part)).toMatchObject({
      icon: "!",
      title: "Consequential result unavailable",
    })
    expect(
      entryBody(
        commit({
          kind: "tool",
          text: "",
          phase: "final",
          source: "tool",
          tool: "content_write",
          toolState: "completed",
          part,
        }),
      ),
    ).toEqual({
      type: "text",
      content: "Consequential result unavailable: Repa could not verify this result, so no success is inferred.",
    })
  })

  test("renders the durable learner Goal acknowledgement instead of generic completion or raw settlement", () => {
    const acknowledgement =
      "Stored 2 learner Goals: Operating systems exam readiness; Data structures exam readiness. You can correct either Goal with a later explicit learner direction."
    const presentation = SemanticPresentation.result({
      kind: "learner_goals_result",
      binding: {
        sessionID: "session-1",
        messageID: "msg-update_learner_goals",
        callID: "call-update_learner_goals-1",
        partID: "update_learner_goals-1",
      },
      settlement: { outcome: "applied" },
      authorizationBasis: "learner_acceptance",
      operations: [
        {
          ordinal: 0,
          operation: "create",
          result: "changed",
          goalID: "goal-internal-one",
          revisionID: "revision-internal-one",
          version: 1,
          meaning: goalMeaning("Operating systems exam readiness"),
        },
        {
          ordinal: 1,
          operation: "create",
          result: "changed",
          goalID: "goal-internal-two",
          revisionID: "revision-internal-two",
          version: 1,
          meaning: goalMeaning("Data structures exam readiness"),
        },
      ],
    })
    const projection = SemanticPresentation.projectResultBasis(presentation.basis)!
    const part = toolPart("update_learner_goals", {
      status: "completed",
      input: {
        authorization: "learner_acceptance",
        operations: [{ action: "create" }, { action: "create" }],
      },
      output: acknowledgement,
      title: projection.title,
      metadata: {
        command: "update_learner_goals",
        commandVersion: 1,
        outcome: "applied",
        durablySettled: true,
        truncated: false,
        ...SemanticPresentation.metadata(presentation),
      },
      time: { start: 1, end: 2 },
    })
    const final = entryBody(
      commit({
        kind: "tool",
        text: "",
        phase: "final",
        source: "tool",
        tool: "update_learner_goals",
        toolState: "completed",
        part,
      }),
    )

    expect(toolInlineInfo(part)).toEqual({
      icon: "◇",
      title: `${projection.title} — Committed`,
      mode: "block",
      body: [
        projection.summary,
        ...projection.facts.map((fact) => `${fact.label}: ${fact.value}`),
        "Durable settlement: yes",
      ].join("\n"),
    })
    expect(final).toEqual({
      type: "text",
      content: [
        projection.summary,
        ...projection.facts.map((fact) => `${fact.label}: ${fact.value}`),
        "Durable settlement: yes",
      ].join("\n"),
    })
    expect(JSON.stringify(final)).toContain("Operating systems exam readiness")
    expect(JSON.stringify(final)).not.toContain("goal-internal-one")
    expect(JSON.stringify(final)).not.toContain("completed")
    expect(JSON.stringify(final)).not.toContain('"outcome":"applied"')
  })

  test("renders the learning-bootstrap typed acknowledgement instead of raw settlement JSON", () => {
    const presentation = SemanticPresentation.result({
      kind: "learning_bootstrap_result",
      binding: {
        sessionID: "session-1",
        messageID: "msg-update_learning_course",
        callID: "call-update_learning_course-1",
        partID: "update_learning_course-1",
      },
      settlement: { outcome: "applied" },
      disposition: "candidate_v1",
      issuance: "root",
      capabilityOutcome: "policy_allow",
      acknowledgement: {
        schemaVersion: 1,
        outcome: "applied",
        course: { id: "cou_linear", title: "Linear algebra" },
        children: [
          { kind: "course", outcome: "changed", id: "cou_linear", detail: "created" },
          {
            kind: "material",
            key: "notes",
            outcome: "changed",
            id: "lca_notes",
            detail: "explicit material adoption committed",
            materialTarget: { type: "representation", representationRevisionID: "rrv_notes" },
          },
          { kind: "anchor", outcome: "no_change", detail: "route anchor preserved" },
        ],
        selectedRevisionID: null,
        anchor: { headID: null, target: null, usability: { usable: false, cause: "absent" } },
        correction: "Continue in ordinary language to correct this Course.",
      },
    })
    const projection = SemanticPresentation.projectResultBasis(presentation.basis)
    if (!projection) throw new Error("Expected a valid learning-bootstrap projection")
    const part = toolPart(LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY, {
      status: "completed",
      input: { course: { type: "new", title: "Linear algebra" } },
      output: JSON.stringify({ settlement: { outcome: "applied", effectID: "lbe_linear" } }),
      title: projection.title,
      metadata: {
        command: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
        commandVersion: 1,
        outcome: "applied",
        durablySettled: true,
        truncated: false,
        ...SemanticPresentation.metadata(presentation),
      },
      time: { start: 1, end: 2 },
    })
    const final = entryBody(
      commit({
        kind: "tool",
        text: "",
        phase: "final",
        source: "tool",
        tool: LearningCommand.UPDATE_LEARNING_COURSE_CAPABILITY,
        toolState: "completed",
        part,
      }),
    )

    expect(toolInlineInfo(part)).toMatchObject({
      icon: "◇",
      title: "Learning bootstrap settlement — Committed",
      body: expect.stringContaining(
        "Material 2: changed: explicit material adoption committed; Representation Revision rrv_notes; effect lca_notes",
      ),
    })
    expect(final).toEqual({
      type: "text",
      content: [
        projection.summary,
        ...projection.facts.map((fact) => `${fact.label}: ${fact.value}`),
        "Durable settlement: yes",
      ].join("\n"),
    })
    expect(JSON.stringify(final)).not.toContain("lbe_linear")
    expect(JSON.stringify(final)).not.toContain('"outcome":"applied"')
  })

  test("renders an advisory suggestion settlement instead of generic success or raw command output", () => {
    const presentation = SemanticPresentation.result({
      kind: "advisory_plan_suggestion_result",
      binding: {
        sessionID: "session-1",
        messageID: "msg-update_advisory_plan_suggestion",
        callID: "call-update_advisory_plan_suggestion-1",
        partID: "update_advisory_plan_suggestion-1",
      },
      settlement: { outcome: "applied" },
      disposition: "candidate_v1",
      issuance: "root",
      capabilityOutcome: "policy_allow",
      effect: {
        effectID: `ape_${"0".repeat(26)}`,
        receiptID: "lcr_advisory_run",
        intentResults: [
          {
            outcome: "changed",
            suggestionID: `aps_${"0".repeat(26)}`,
            revisionID: `apr_${"0".repeat(26)}`,
            version: 1,
            operation: "create",
            operationOrdinal: 0,
            disposition: "active",
          },
        ],
      },
    })
    const projection = SemanticPresentation.projectResultBasis(presentation.basis)
    if (!projection) throw new Error("Expected a valid advisory result projection")
    const part = toolPart(LearningCommand.UPDATE_ADVISORY_PLAN_SUGGESTION_CAPABILITY, {
      status: "completed",
      input: { hidden: "provider command must not become the learner-facing result" },
      output: JSON.stringify({ generic: "success", hiddenInternal: "must not render" }),
      title: projection.title,
      metadata: {
        command: LearningCommand.UPDATE_ADVISORY_PLAN_SUGGESTION_CAPABILITY,
        commandVersion: LearningCommand.UPDATE_ADVISORY_PLAN_SUGGESTION_VERSION,
        outcome: "applied",
        durablySettled: true,
        truncated: false,
        ...SemanticPresentation.metadata(presentation),
      },
      time: { start: 1, end: 2 },
    })
    const final = entryBody(
      commit({
        kind: "tool",
        text: "",
        phase: "final",
        source: "tool",
        tool: LearningCommand.UPDATE_ADVISORY_PLAN_SUGGESTION_CAPABILITY,
        toolState: "completed",
        part,
      }),
    )

    expect(toolInlineInfo(part)).toMatchObject({
      icon: "◇",
      title: "Advisory learning suggestion settlement — Committed",
      body: expect.stringContaining(`aps_${"0".repeat(26)}/apr_${"0".repeat(26)}`),
    })
    expect(final).toEqual({
      type: "text",
      content: [
        projection.summary,
        ...projection.facts.map((fact) => `${fact.label}: ${fact.value}`),
        "Durable settlement: yes",
      ].join("\n"),
    })
    expect(JSON.stringify(final)).not.toContain("hiddenInternal")
    expect(JSON.stringify(final)).not.toContain('"generic":"success"')
  })

  test("renders retained steering acknowledgement title and body instead of the generic tool fallback", () => {
    const presentation = SemanticPresentation.result({
      kind: "retained_learning_steering_result",
      binding: {
        sessionID: "session-1",
        messageID: "msg-update_retained_learning_steering",
        callID: "call-update_retained_learning_steering-1",
        partID: "update_retained_learning_steering-1",
      },
      settlement: { outcome: "applied" },
      action: "create",
      scope: "learning_wide",
      effect: {
        state: "operative",
        status: "operative_active",
        version: 1,
        operativeInstruction: "Do not quiz me; continue with explanation.",
        validUntilNormalized: "2026-07-21T00:00:00.000+08:00",
        boundaryTimeZone: "Asia/Shanghai",
        boundaryUtcOffsetMinutes: 480,
      },
      current: {
        state: "operative",
        status: "operative_active",
        version: 1,
        operativeInstruction: "Do not quiz me; continue with explanation.",
        validUntilNormalized: "2026-07-21T00:00:00.000+08:00",
        boundaryTimeZone: "Asia/Shanghai",
        boundaryUtcOffsetMinutes: 480,
      },
      relation: "active",
    })
    const projection = SemanticPresentation.projectResultBasis(presentation.basis)!
    const part = toolPart(LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY, {
      status: "completed",
      input: {
        action: "create",
        sourceExcerpt: "across all my learning today, do not quiz me",
        operativeInstruction: "Do not quiz me; continue with explanation.",
        validUntil: "2026-07-21T00:00:00+08:00",
      },
      output:
        "Learning-wide until 2026-07-21T00:00:00.000+08:00 [Asia/Shanghai]: Do not quiz me; continue with explanation. You can replace or retract this retained instruction with a later explicit learner direction.",
      title: projection.title,
      metadata: {
        command: LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        commandVersion: 1,
        outcome: "applied",
        durablySettled: true,
        truncated: false,
        ...SemanticPresentation.metadata(presentation),
      },
      time: { start: 1, end: 2 },
    })
    const final = entryBody(
      commit({
        kind: "tool",
        text: "",
        phase: "final",
        source: "tool",
        tool: LearningCommand.UPDATE_RETAINED_LEARNING_STEERING_CAPABILITY,
        toolState: "completed",
        part,
      }),
    )

    expect(toolInlineInfo(part)).toEqual({
      icon: "◇",
      title: `${projection.title} — Committed`,
      mode: "block",
      body: [
        projection.summary,
        ...projection.facts.map((fact) => `${fact.label}: ${fact.value}`),
        "Durable settlement: yes",
      ].join("\n"),
    })
    expect(final).toEqual({
      type: "text",
      content: [
        projection.summary,
        ...projection.facts.map((fact) => `${fact.label}: ${fact.value}`),
        "Durable settlement: yes",
      ].join("\n"),
    })
    expect(JSON.stringify(final)).not.toContain("completed")
    expect(JSON.stringify(final)).not.toContain('"outcome":"applied"')
  })

  test("renders assistant, reasoning, and user entries in their display formats", () => {
    expect(
      entryBody(
        commit({
          kind: "assistant",
          text: "# Title\n\nHello **world**",
          phase: "progress",
          source: "assistant",
          partID: "part-1",
        }),
      ),
    ).toEqual({
      type: "markdown",
      content: "# Title\n\nHello **world**",
    })

    const reasoning = entryBody(
      commit({
        kind: "reasoning",
        text: "Thinking: plan next steps",
        phase: "progress",
        source: "reasoning",
        partID: "reason-1",
      }),
    )
    expect(reasoning).toEqual({
      type: "code",
      filetype: "markdown",
      content: "_Thinking:_ plan next steps",
    })
    expect(
      entryCanStream(
        commit({
          kind: "reasoning",
          text: "Thinking: plan next steps",
          phase: "progress",
          source: "reasoning",
        }),
        reasoning,
      ),
    ).toBe(true)

    expect(
      entryBody(
        commit({
          kind: "user",
          text: "Inspect footer tabs",
          phase: "start",
          source: "system",
        }),
      ),
    ).toEqual({
      type: "text",
      content: "› Inspect footer tabs",
    })
  })

  for (const item of [
    {
      name: "keeps completed write tool finals structured",
      commit: toolCommit({
        tool: "write",
        state: {
          status: "completed",
          input: {
            filePath: "src/a.ts",
            content: "const x = 1\n",
          },
          output: "",
          title: "",
          metadata: {},
          time: { start: 1, end: 2 },
        },
      }),
      snapshot: {
        kind: "code",
        title: "# Wrote src/a.ts",
        content: "const x = 1\n",
        file: "src/a.ts",
      },
    },
    {
      name: "keeps completed edit tool finals structured",
      commit: toolCommit({
        tool: "edit",
        state: {
          status: "completed",
          input: {
            filePath: "src/a.ts",
          },
          output: "",
          title: "",
          metadata: {
            diff: "@@ -1 +1 @@\n-old\n+new\n",
          },
          time: { start: 1, end: 2 },
        },
      }),
      snapshot: {
        kind: "diff",
        items: [
          {
            title: "# Edited src/a.ts",
            diff: "@@ -1 +1 @@\n-old\n+new\n",
            file: "src/a.ts",
          },
        ],
      },
    },
    {
      name: "keeps completed apply_patch tool finals structured",
      commit: toolCommit({
        tool: "apply_patch",
        state: {
          status: "completed",
          input: {},
          output: "",
          title: "",
          metadata: {
            files: [
              {
                type: "update",
                filePath: "src/a.ts",
                relativePath: "src/a.ts",
                patch: "@@ -1 +1 @@\n-old\n+new\n",
              },
            ],
          },
          time: { start: 1, end: 2 },
        },
      }),
      snapshot: {
        kind: "diff",
        items: [
          {
            title: "# Patched src/a.ts",
            diff: "@@ -1 +1 @@\n-old\n+new\n",
            file: "src/a.ts",
            deletions: 0,
          },
        ],
      },
    },
  ] satisfies Array<{ name: string; commit: StreamCommit; snapshot: ToolSnapshot }>) {
    test(item.name, () => {
      expect(structured(item.commit)).toEqual(item.snapshot)
    })
  }

  test("rejects a legacy free-form semantic result instead of trusting its prose", () => {
    const result = {
      version: 1,
      phase: "result",
      basis: {
        capability: "write",
        title: "Learning artifact write",
        summary: "The exact learning artifact write committed.",
        facts: [{ label: "Path", value: "notes/lesson.md" }],
        outcome: "committed",
        durablySettled: true,
      },
    }
    const final = entryBody(
      toolCommit({
        tool: "write",
        state: {
          status: "completed",
          input: { filePath: "notes/lesson.md", content: "lesson" },
          output: "generic output",
          title: "lesson.md",
          metadata: {
            semanticPresentationRequired: true,
            semanticPresentationBasis: result,
          },
          time: { start: 1, end: 2 },
        },
      }),
    )

    expect(final).toEqual({
      type: "text",
      content: "Consequential result unavailable: Repa could not verify this result, so no success is inferred.",
    })
  })

  test("keeps running task tool state out of scrollback", () => {
    expect(
      entryBody(
        toolCommit({
          tool: "task",
          phase: "start",
          toolState: "running",
          text: "running inspect reducer",
          state: {
            status: "running",
            input: {
              description: "Inspect reducer",
              subagent_type: "explore",
            },
            time: { start: 1 },
          },
        }),
      ),
    ).toEqual({
      type: "none",
    })
  })

  test("promotes task results to markdown and falls back to structured task summaries", () => {
    expect(
      entryBody(
        toolCommit({
          tool: "task",
          state: {
            status: "completed",
            input: {
              description: "Inspect reducer",
              subagent_type: "explore",
            },
            title: "",
            output: [
              '<task id="child-1" state="completed">',
              "<task_result>",
              "# Findings\n\n- Footer stays live",
              "</task_result>",
              "</task>",
            ].join("\n"),
            metadata: {
              sessionId: "child-1",
            },
            time: { start: 1, end: 2 },
          },
        }),
      ),
    ).toEqual({
      type: "markdown",
      content: "# Findings\n\n- Footer stays live",
    })

    expect(
      structured(
        toolCommit({
          tool: "task",
          state: {
            status: "completed",
            input: {
              description: "Inspect reducer",
              subagent_type: "explore",
            },
            title: "",
            output: ['<task id="child-1" state="completed">', "<task_result>", "", "</task_result>", "</task>"].join(
              "\n",
            ),
            metadata: {
              sessionId: "child-1",
            },
            time: { start: 1, end: 2 },
          },
        }),
      ),
    ).toEqual({
      kind: "task",
      title: "# Explore Task",
      rows: ["Inspect reducer"],
      tail: "",
    })
  })

  test("streams tool progress text and treats completed progress as done", () => {
    const body = entryBody(
      commit({
        kind: "tool",
        text: "partial output",
        phase: "progress",
        source: "tool",
        tool: "bash",
        partID: "tool-2",
      }),
    )

    expect(body).toEqual({
      type: "text",
      content: "partial output",
    })
    expect(
      entryCanStream(
        commit({
          kind: "tool",
          text: "partial output",
          phase: "progress",
          source: "tool",
          tool: "bash",
        }),
        body,
      ),
    ).toBe(true)
    expect(
      entryDone(
        commit({
          kind: "tool",
          text: "output",
          phase: "progress",
          source: "tool",
          tool: "bash",
          toolState: "completed",
        }),
      ),
    ).toBe(true)
  })

  test("formats completed bash output with a blank line after the command and no trailing blank row", () => {
    expect(
      entryBody(
        toolCommit({
          tool: "bash",
          phase: "progress",
          toolState: "completed",
          text: ["/tmp/demo", "git status", "On branch demo", "nothing to commit, working tree clean", ""].join("\n"),
          state: {
            status: "completed",
            input: {
              command: "git status",
              workdir: "/tmp/demo",
            },
            output: ["/tmp/demo", "git status", "On branch demo", "nothing to commit, working tree clean", ""].join(
              "\n",
            ),
            title: "git status",
            metadata: {
              exitCode: 0,
            },
            time: { start: 1, end: 2 },
          },
        }),
      ),
    ).toEqual({
      type: "text",
      content: "\nOn branch demo\nnothing to commit, working tree clean",
    })
  })

  test("renders command-only bash starts without the shell header", () => {
    expect(
      entryBody(
        toolCommit({
          tool: "bash",
          phase: "start",
          toolState: "running",
          text: "running shell",
          state: {
            status: "running",
            input: {
              command: "ls",
            },
            time: { start: 1 },
          },
        }),
      ),
    ).toEqual({
      type: "text",
      content: "$ ls",
    })
  })

  test("renders direct shell commits without a synthetic shell header", () => {
    expect(
      entryBody(
        commit({
          kind: "tool",
          text: "running shell",
          phase: "start",
          source: "tool",
          tool: "bash",
          partID: "shell:call-1",
          toolState: "running",
          shell: {
            callID: "call-1",
            command: "pwd",
          },
        }),
      ),
    ).toEqual({
      type: "text",
      content: "$ pwd",
    })

    expect(
      entryBody(
        commit({
          kind: "tool",
          text: "/tmp/demo\n",
          phase: "progress",
          source: "tool",
          tool: "bash",
          partID: "shell:call-1",
          toolState: "completed",
          shell: {
            callID: "call-1",
            command: "pwd",
          },
        }),
      ),
    ).toEqual({
      type: "text",
      content: "\n/tmp/demo",
    })
  })

  test("falls back to patch summary when apply_patch has no visible diff items", () => {
    expect(
      entryBody(
        toolCommit({
          tool: "apply_patch",
          state: {
            status: "completed",
            input: {
              patchText: "*** Begin Patch\n*** End Patch",
            },
            output: "",
            title: "",
            metadata: {
              files: [
                {
                  type: "update",
                  filePath: "src/a.ts",
                  relativePath: "src/a.ts",
                  diff: "@@ -1 +1 @@\n-old\n+new\n",
                },
              ],
            },
            time: { start: 1, end: 2 },
          },
        }),
      ),
    ).toEqual({
      type: "text",
      content: "~ Patched src/a.ts",
    })
  })

  test("suppresses redundant patched rows when apply_patch also created a file", () => {
    expect(
      entryBody(
        toolCommit({
          tool: "apply_patch",
          state: {
            status: "completed",
            input: {
              patchText: "*** Begin Patch\n*** End Patch",
            },
            output: "",
            title: "",
            metadata: {
              files: [
                {
                  type: "update",
                  filePath: "src/a.ts",
                  relativePath: "src/a.ts",
                  diff: "@@ -1 +1 @@\n-old\n+new\n",
                },
                {
                  type: "add",
                  filePath: "README-demo.md",
                  relativePath: "README-demo.md",
                },
              ],
            },
            time: { start: 1, end: 2 },
          },
        }),
      ),
    ).toEqual({
      type: "text",
      content: "+ Created README-demo.md",
    })
  })

  test("renders glob failures as the raw error under the existing header", () => {
    expect(
      entryBody(
        toolCommit({
          tool: "glob",
          phase: "final",
          toolState: "error",
          state: {
            status: "error",
            input: {
              pattern: "**/*tool*",
              path: "/tmp/demo/run",
            },
            error: "No such file or directory: '/tmp/demo/run'",
            metadata: {},
            time: { start: 1, end: 2 },
          },
        }),
      ),
    ).toEqual({
      type: "text",
      content: "No such file or directory: '/tmp/demo/run'",
    })
  })

  test("renders interrupted assistant finals as text", () => {
    expect(
      entryBody(
        commit({
          kind: "assistant",
          text: "",
          phase: "final",
          source: "assistant",
          interrupted: true,
          partID: "part-1",
        }),
      ),
    ).toEqual({
      type: "text",
      content: "assistant interrupted",
    })
  })
})
