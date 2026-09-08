import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Model } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  type AgentSession,
  type AgentSessionEvent,
  ModelRuntime,
  type SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { historyView, messageView, type Resources } from "./messages.js";
import type {
  Change,
  Interaction,
  Message,
  Notice,
  Reply,
  Run,
} from "./protocol.js";
import { RepaFault } from "./protocol.js";
import { createSkillReadTool } from "./skill-read-tool.js";

export const REPA_BASE_PROMPT = [
  "You are Repa, a general learning Agent.",
  "Help the learner with the current request using available learning resources and trusted tools when useful.",
  "Keep model knowledge distinct from material supplied by the learner.",
  "Do not force a fixed teaching workflow.",
].join("\n");
export interface PiModelOverride {
  modelRuntime: ModelRuntime;
  model: Model<any>;
}
export type Dialog = Pick<
  Interaction,
  "kind" | "title" | "message" | "options" | "initialValue"
>;
export interface DialogOptions {
  signal?: AbortSignal;
  timeout?: number;
}
export interface ConversationRuntime {
  send(
    text: string,
  ): Promise<{ status: "completed" | "cancelled" | "failed"; error?: string }>;
  cancel(): Promise<void>;
  close(): Promise<void>;
}
export type HostEvent =
  | { type: "title"; title: string | undefined }
  | { type: "message"; message: Message; replaces?: string }
  | {
      type: "delta";
      messageId: string;
      index: number;
      kind: "text" | "thinking";
      text: string;
    }
  | { type: "phase"; phase: Run["phase"] }
  | { type: "notice"; notice: Notice }
  | Pick<
      Extract<Change, { type: "tool" }>,
      "type" | "callId" | "name" | "status"
    >;
export interface OpenPiHostOptions {
  learnerSpace: string;
  agentDir?: string;
  sessionManager: SessionManager;
  trustExtensions: boolean;
  modelOverride?: PiModelOverride;
  resources: Resources;
  onEvent: (event: HostEvent) => void;
  ask: (dialog: Dialog, options?: DialogOptions) => Promise<Reply>;
}

export class PiConversationHost implements ConversationRuntime {
  readonly #session: AgentSession;
  readonly #settings: SettingsManager;
  readonly #options: OpenPiHostOptions;
  readonly #unsubscribe: () => void;
  #liveId: string | undefined;
  #lastResult: {
    status: "completed" | "cancelled" | "failed";
    error?: string;
  } = { status: "completed" };
  #closed = false;
  #cancelled = false;

  private constructor(
    session: AgentSession,
    settings: SettingsManager,
    options: OpenPiHostOptions,
  ) {
    this.#session = session;
    this.#settings = settings;
    this.#options = options;
    this.#unsubscribe = session.subscribe((event) => this.#onEvent(event));
  }

  static async open(options: OpenPiHostOptions): Promise<PiConversationHost> {
    const agentDir = path.resolve(options.agentDir ?? getAgentDir());
    await mkdir(agentDir, { recursive: true });
    const settings = SettingsManager.create(options.learnerSpace, agentDir, {
      projectTrusted: options.trustExtensions,
    });
    const loader = new DefaultResourceLoader({
      cwd: options.learnerSpace,
      agentDir,
      settingsManager: settings,
      noExtensions: !options.trustExtensions,
      noSkills: !options.trustExtensions,
      noPromptTemplates: !options.trustExtensions,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: REPA_BASE_PROMPT,
      appendSystemPrompt: [],
    });
    await loader.reload({
      resolveProjectTrust: async () => options.trustExtensions,
    });
    const readTool = await createSkillReadTool(options.learnerSpace, loader);
    const created = await createAgentSession({
      cwd: options.learnerSpace,
      agentDir,
      model: options.modelOverride?.model,
      modelRuntime: options.modelOverride?.modelRuntime,
      resourceLoader: loader,
      sessionManager: options.sessionManager,
      settingsManager: settings,
      noTools: "builtin",
      customTools: [readTool],
    });
    const host = new PiConversationHost(created.session, settings, options);
    try {
      await created.session.bindExtensions({
        mode: "rpc",
        uiContext: {
          ...created.session.extensionRunner.getUIContext(),
          select: async (title, choices, opts) => {
            const value = await options.ask(
              { kind: "select", title, options: choices },
              opts,
            );
            return typeof value === "string" ? value : undefined;
          },
          confirm: async (title, message, opts) =>
            (await options.ask({ kind: "confirm", title, message }, opts)) ===
            true,
          input: async (title, placeholder, opts) => {
            const value = await options.ask(
              { kind: "input", title, initialValue: placeholder },
              opts,
            );
            return typeof value === "string" ? value : undefined;
          },
          editor: async (title, prefill) => {
            const value = await options.ask({
              kind: "editor",
              title,
              initialValue: prefill,
            });
            return typeof value === "string" ? value : undefined;
          },
          notify: (message, level = "info") =>
            host.#notice("extension", message, level),
          setStatus: (key, value) =>
            host.#notice(`status:${key}`, value ?? "", "info", `status:${key}`),
          setWidget: (key, value) => {
            if (Array.isArray(value))
              host.#notice(
                `widget:${key}`,
                value.join("\n"),
                "info",
                `widget:${key}`,
              );
          },
          setEditorText: (value) =>
            host.#notice("editor_suggestion", value, "info"),
        },
        abortHandler: () => {
          void host.cancel();
        },
        onError: (error) =>
          host.#notice(
            "extension",
            `${error.extensionPath} (${error.event}): ${error.error}`,
            "error",
          ),
      });
      if (options.trustExtensions)
        host.#notice(
          "extension_trust",
          "已启用受信任的 Pi Package/Extension；代码以宿主进程权限运行。",
          "warning",
        );
      for (const error of created.extensionsResult.errors)
        host.#notice(
          "extension",
          `${error.path}: ${String(error.error)}`,
          "error",
        );
      for (const diagnostic of [
        ...loader.getSkills().diagnostics,
        ...loader.getPrompts().diagnostics,
      ])
        host.#notice("resource", diagnostic.message, "warning");
      if (created.modelFallbackMessage)
        host.#notice(
          created.session.model ? "model_fallback" : "configuration",
          created.modelFallbackMessage,
          "warning",
        );
      return host;
    } catch (error) {
      await host.close();
      throw error;
    }
  }

  #notice(
    code: string,
    message: string,
    level: Notice["level"],
    id: string = randomUUID(),
  ): void {
    this.#options.onEvent({
      type: "notice",
      notice: { id, code, message, level },
    });
  }

  async send(
    text: string,
  ): Promise<{ status: "completed" | "cancelled" | "failed"; error?: string }> {
    if (this.#closed) throw new Error("会话运行实例已关闭。");
    if (!this.#session.model)
      throw new RepaFault(
        "configuration",
        "没有可用模型，请配置模型连接后重试。",
      );
    this.#lastResult = { status: "completed" };
    this.#cancelled = false;
    await this.#session.prompt(text, { expandPromptTemplates: true });
    await this.#session.waitForIdle();
    return this.#cancelled ? { status: "cancelled" } : this.#lastResult;
  }

  async cancel(): Promise<void> {
    if (!this.#session.isIdle) this.#cancelled = true;
    await this.#session.abort();
  }
  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    try {
      await this.#session.abort();
      await this.#session.extensionRunner.emit({
        type: "session_shutdown",
        reason: "quit",
      });
    } finally {
      this.#unsubscribe();
      this.#session.dispose();
      await this.#settings.flush();
    }
  }

  #onEvent(event: AgentSessionEvent): void {
    const emit = this.#options.onEvent;
    if (event.type === "message_start" && event.message.role === "assistant") {
      this.#liveId = `live-${randomUUID()}`;
      emit({ type: "phase", phase: "model" });
      emit({
        type: "message",
        message: {
          ...messageView(this.#liveId, event.message, this.#options.resources),
          streaming: true,
        },
      });
    } else if (event.type === "message_update" && this.#liveId) {
      const update = event.assistantMessageEvent;
      if (update.type === "text_delta" || update.type === "thinking_delta") {
        emit({
          type: "delta",
          messageId: this.#liveId,
          index: update.contentIndex,
          kind: update.type === "text_delta" ? "text" : "thinking",
          text: update.delta,
        });
      } else if (update.type.startsWith("toolcall_")) {
        emit({
          type: "message",
          message: {
            ...messageView(
              this.#liveId,
              event.message,
              this.#options.resources,
            ),
            streaming: true,
          },
        });
      }
    } else if (event.type === "message_end") {
      const replaces =
        event.message.role === "assistant" ? this.#liveId : undefined;
      if (event.message.role === "assistant") {
        this.#liveId = undefined;
        this.#lastResult =
          event.message.stopReason === "aborted"
            ? { status: "cancelled" }
            : event.message.stopReason === "error"
              ? {
                  status: "failed",
                  error: event.message.errorMessage ?? "Provider 请求失败。",
                }
              : { status: "completed" };
      }
      // Pi emits message_end before appending its entry. Reconcile the live message with that persisted identity.
      queueMicrotask(() => {
        const entries = this.#options.sessionManager.getEntries();
        const entry = entries.findLast(
          (x) =>
            (x.type === "message" && x.message === event.message) ||
            (x.type === "custom_message" &&
              event.message.role === "custom" &&
              x.content === event.message.content),
        );
        if (entry) {
          const message = historyView([entry], this.#options.resources)[0];
          if (message)
            emit({
              type: "message",
              message,
              ...(replaces ? { replaces } : {}),
            });
        }
      });
    } else if (event.type === "session_info_changed") {
      emit({ type: "title", title: event.name });
    } else if (event.type === "entry_appended") {
      for (const message of historyView([event.entry], this.#options.resources))
        emit({ type: "message", message });
    } else if (
      event.type === "tool_execution_start" ||
      event.type === "tool_execution_end"
    ) {
      emit({ type: "phase", phase: "tool" });
      emit({
        type: "tool",
        callId: event.toolCallId,
        name: event.toolName,
        status:
          event.type === "tool_execution_start"
            ? "running"
            : event.isError
              ? "failed"
              : "completed",
      });
    } else if (event.type === "auto_retry_start") {
      emit({ type: "phase", phase: "retry" });
      this.#notice("retry", event.errorMessage, "info");
    } else if (event.type === "compaction_start") {
      emit({ type: "phase", phase: "compaction" });
    } else if (event.type === "compaction_end") {
      if (event.errorMessage)
        this.#notice("compaction", event.errorMessage, "error");
      emit({ type: "phase", phase: "model" });
      for (const message of historyView(
        this.#options.sessionManager.getBranch(),
        this.#options.resources,
      ).filter((x) => x.role === "context"))
        emit({ type: "message", message });
    }
  }
}
