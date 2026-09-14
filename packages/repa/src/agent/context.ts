import { isDeepStrictEqual } from "node:util";
import {
  formatSkillsForPrompt,
  sessionEntryToContextMessages,
  type BuildSystemPromptOptions,
  type ContextEvent,
  type SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Check } from "typebox/value";
import type { PromptSettings } from "../configuration/schema.js";
import { ContextViewSchema, type ContextView } from "../content/schema.js";

export type WorkingMessage = ContextEvent["messages"][number];
export const CONTEXT_MESSAGE_TYPE = "repa.learning-context";

/** 装配由 Repa 选择的来源，包括显式为空的基础提示。 */
export function assembleSystemPrompt(
  options: BuildSystemPromptOptions,
  settings: PromptSettings,
): string {
  const sections = [settings.base, ...settings.append];
  if (settings.projectInstructions && options.contextFiles?.length) {
    sections.push(
      [
        "<project_context>",
        "Project-specific instructions and guidelines:",
        ...options.contextFiles.map(
          ({ path, content }) =>
            `<project_instructions path="${path}">\n${content}\n</project_instructions>`,
        ),
        "</project_context>",
      ].join("\n\n"),
    );
  }
  if (
    settings.skillCatalog &&
    (!options.selectedTools || options.selectedTools.includes("read"))
  ) {
    sections.push(formatSkillsForPrompt(options.skills ?? []).trim());
  }
  if (settings.environment) {
    sections.push(`Current working directory: ${options.cwd.replace(/\\/g, "/")}`);
  }
  return sections.filter((section) => section.length > 0).join("\n\n");
}

function contextContent(view: ContextView): string {
  const source = JSON.stringify({ revision: view.revision, sources: view.sources });
  return [
    "<repa_learning_context>",
    "学习空间中持续维护的学习背景，以下为本次完整视图。",
    `来源与修订：${source}`,
    "",
    view.text,
    "</repa_learning_context>",
  ].join("\n");
}

export function makeContextMessage(
  view: ContextView,
  timestamp: number = Date.now(),
): WorkingMessage {
  return {
    role: "custom",
    customType: CONTEXT_MESSAGE_TYPE,
    content: contextContent(view),
    display: false,
    details: structuredClone(view),
    timestamp,
  };
}

export function contextSnapshot(message: WorkingMessage): ContextView | undefined {
  if (
    message.role !== "custom" ||
    message.customType !== CONTEXT_MESSAGE_TYPE ||
    !Check(ContextViewSchema, message.details)
  ) {
    return undefined;
  }
  // details 不能将已被其他处理改写或截断的正文当作完整模型输入。
  return message.content === contextContent(message.details)
    ? message.details
    : undefined;
}

/** 只投影模型工作视图；会话记录及其分支结构继续由 Pi 持有。 */
export function projectContext(
  messages: WorkingMessage[],
  manager: SessionManager,
  enabled: boolean,
): WorkingMessage[] {
  if (!enabled) {
    return messages.filter(
      (message) =>
        message.role !== "custom" || message.customType !== CONTEXT_MESSAGE_TYPE,
    );
  }

  const contextEntries = manager.buildContextEntries();
  const compaction = contextEntries[0];
  if (compaction?.type !== "compaction") return messages;

  // 查询该压缩点的祖先，后续快照和其他分支不能改变边界时的背景。
  const branch = manager.getBranch(compaction.id);
  for (let index = branch.length - 2; index >= 0; index--) {
    const entry = branch[index]!;
    const snapshot = sessionEntryToContextMessages(entry).findLast(
      (message) => contextSnapshot(message) !== undefined,
    );
    if (!snapshot) continue;
    if (contextEntries.some((kept) => kept.id === entry.id)) return messages;

    const summaryIndex = messages.findIndex(
      (message) =>
        message.role === "compactionSummary" &&
        message.summary === compaction.summary &&
        message.tokensBefore === compaction.tokensBefore &&
        message.timestamp === Date.parse(compaction.timestamp),
    );
    if (summaryIndex < 0) return messages;
    if (isDeepStrictEqual(messages[summaryIndex + 1], snapshot)) return messages;
    return [
      ...messages.slice(0, summaryIndex + 1),
      snapshot,
      ...messages.slice(summaryIndex + 1),
    ];
  }
  return messages;
}
