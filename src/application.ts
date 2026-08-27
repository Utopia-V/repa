import path from "node:path";

import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

import { AsyncEventChannel } from "./events.js";
import { PiConversationHost, type PiModelOverride } from "./pi-host.js";

export type RepaCommand =
  | { type: "send"; text: string }
  | { type: "cancel" }
  | { type: "close" };

export type RepaErrorCode =
  | "invalid_command"
  | "busy"
  | "configuration"
  | "provider"
  | "extension"
  | "session"
  | "compaction"
  | "internal";

export interface RepaErrorEvent {
  type: "error";
  code: RepaErrorCode;
  operation: "open" | "send" | "cancel" | "close" | "extension" | "compaction";
  message: string;
  recoverable: boolean;
}

export type RepaEvent =
  | {
      type: "session_opened";
      learnerSpace: string;
      sessionId: string;
      restored: boolean;
    }
  | {
      type: "extension_trust";
      message: string;
    }
  | {
      type: "warning";
      code: "model_fallback" | "resource";
      message: string;
    }
  | { type: "turn_started" }
  | { type: "assistant_text_delta"; delta: string }
  | { type: "tool_started"; callId: string; name: string }
  | {
      type: "tool_finished";
      callId: string;
      name: string;
      isError: boolean;
      output: string;
    }
  | { type: "generation_cancelled" }
  | { type: "turn_finished"; status: "completed" | "cancelled" | "failed" }
  | { type: "compaction_started"; reason: "threshold" | "overflow" | "manual" }
  | {
      type: "compaction_finished";
      reason: "threshold" | "overflow" | "manual";
      aborted: boolean;
    }
  | { type: "closed" }
  | RepaErrorEvent;

export interface OpenRepaOptions {
  learnerSpace: string;
  resume?: boolean;
  trustExtensions?: boolean;
  agentDir?: string;
}

export interface OpenRepaDependencies {
  modelOverride?: PiModelOverride;
}

export type OpenRepaResult =
  | { ok: true; application: RepaApplication }
  | { ok: false; error: RepaErrorEvent };

export interface RepaApplication {
  readonly events: AsyncIterable<RepaEvent>;
  command(command: RepaCommand): Promise<void>;
}

const EXTENSION_TRUST_MESSAGE =
  "已启用受信任的 Pi Package/Extension；其中的代码以 Repa 宿主进程的完整权限运行，并非沙箱。";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function classifyError(
  error: unknown,
  operation: RepaErrorEvent["operation"],
): RepaErrorEvent {
  const message = errorMessage(error);
  const lower = message.toLowerCase();

  if (operation === "open") {
    return { type: "error", code: "session", operation, message, recoverable: false };
  }
  if (operation === "extension") {
    return { type: "error", code: "extension", operation, message, recoverable: true };
  }
  if (operation === "compaction") {
    return { type: "error", code: "compaction", operation, message, recoverable: true };
  }
  if (
    lower.includes("model") ||
    lower.includes("provider") ||
    lower.includes("api key") ||
    lower.includes("authentication") ||
    lower.includes("network")
  ) {
    return { type: "error", code: "provider", operation, message, recoverable: true };
  }
  if (lower.includes("session") || lower.includes("jsonl")) {
    return { type: "error", code: "session", operation, message, recoverable: true };
  }
  return { type: "error", code: "internal", operation, message, recoverable: true };
}

function toolOutput(result: unknown): string {
  if (!result || typeof result !== "object" || !("content" in result)) return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";

  return content
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      if ((item as { type?: unknown }).type !== "text") return [];
      const text = (item as { text?: unknown }).text;
      return typeof text === "string" ? [text] : [];
    })
    .join("\n");
}

class RepaApplicationImpl implements RepaApplication {
  readonly #channel = new AsyncEventChannel<RepaEvent>();
  readonly #host: PiConversationHost;
  readonly #unsubscribe: () => void;
  #activeSend: Promise<void> | undefined;
  #cancelRequested = false;
  #cancelEventEmitted = false;
  #sendFailed = false;
  #providerErrorEmitted = false;
  #closed = false;
  #closing: Promise<void> | undefined;

  private constructor(host: PiConversationHost) {
    this.#host = host;
    this.#unsubscribe = host.subscribe((event) => this.#onPiEvent(event));
  }

  static create(
    host: PiConversationHost,
    learnerSpace: string,
    trustExtensions: boolean,
  ): RepaApplicationImpl {
    const application = new RepaApplicationImpl(host);
    application.#channel.push({
      type: "session_opened",
      learnerSpace,
      sessionId: host.sessionId,
      restored: host.restored,
    });

    if (trustExtensions) {
      application.#channel.push({ type: "extension_trust", message: EXTENSION_TRUST_MESSAGE });
    }
    for (const message of host.diagnostics.extensionErrors) {
      application.#channel.push({
        type: "error",
        code: "extension",
        operation: "extension",
        message,
        recoverable: true,
      });
    }
    for (const message of host.diagnostics.resourceWarnings) {
      application.#channel.push({ type: "warning", code: "resource", message });
    }
    if (host.diagnostics.modelFallbackMessage) {
      if (host.hasModel) {
        application.#channel.push({
          type: "warning",
          code: "model_fallback",
          message: host.diagnostics.modelFallbackMessage,
        });
      } else {
        application.#channel.push({
          type: "error",
          code: "configuration",
          operation: "open",
          message: host.diagnostics.modelFallbackMessage,
          recoverable: true,
        });
      }
    }

    return application;
  }

  get events(): AsyncIterable<RepaEvent> {
    return this.#channel;
  }

  reportExtensionError(message: string): void {
    this.#channel.push({
      type: "error",
      code: "extension",
      operation: "extension",
      message,
      recoverable: true,
    });
  }

  async command(command: RepaCommand): Promise<void> {
    if (command.type === "close") {
      await this.#close();
      return;
    }

    if (this.#closed) {
      this.#channel.push({
        type: "error",
        code: "session",
        operation: command.type,
        message: "Repa Application 已关闭。",
        recoverable: false,
      });
      return;
    }

    if (command.type === "cancel") {
      await this.#cancel();
      return;
    }

    if (command.type === "send") {
      await this.#send(command.text);
      return;
    }

    const unreachable: never = command;
    this.#channel.push({
      type: "error",
      code: "invalid_command",
      operation: "send",
      message: `未知命令：${JSON.stringify(unreachable)}`,
      recoverable: true,
    });
  }

  async #send(text: string): Promise<void> {
    if (text.trim().length === 0) {
      this.#channel.push({
        type: "error",
        code: "invalid_command",
        operation: "send",
        message: "消息不能为空。",
        recoverable: true,
      });
      return;
    }
    if (this.#activeSend) {
      this.#channel.push({
        type: "error",
        code: "busy",
        operation: "send",
        message: "当前生成尚未结束；可以先发送 cancel。",
        recoverable: true,
      });
      return;
    }

    this.#cancelRequested = false;
    this.#cancelEventEmitted = false;
    this.#sendFailed = false;
    this.#providerErrorEmitted = false;
    const send = this.#runSend(text);
    this.#activeSend = send;
    try {
      await send;
    } finally {
      if (this.#activeSend === send) this.#activeSend = undefined;
    }
  }

  async #runSend(text: string): Promise<void> {
    this.#channel.push({ type: "turn_started" });
    let status: "completed" | "cancelled" | "failed" = "completed";
    try {
      await this.#host.send(text);
      if (this.#cancelRequested) status = "cancelled";
      else if (this.#sendFailed) status = "failed";
    } catch (error) {
      if (this.#cancelRequested) {
        status = "cancelled";
        this.#emitCancelled();
      } else {
        status = "failed";
        if (!this.#sendFailed) {
          this.#sendFailed = true;
          this.#channel.push(classifyError(error, "send"));
        }
      }
    } finally {
      this.#channel.push({ type: "turn_finished", status });
    }
  }

  async #cancel(): Promise<void> {
    if (!this.#activeSend) {
      this.#channel.push({
        type: "error",
        code: "busy",
        operation: "cancel",
        message: "当前没有正在进行的生成。",
        recoverable: true,
      });
      return;
    }

    this.#cancelRequested = true;
    try {
      await this.#host.cancel();
      this.#emitCancelled();
    } catch (error) {
      this.#channel.push(classifyError(error, "cancel"));
    }
  }

  async #close(): Promise<void> {
    if (this.#closing) {
      await this.#closing;
      return;
    }
    if (this.#closed) return;

    this.#closing = this.#runClose();
    await this.#closing;
  }

  async #runClose(): Promise<void> {
    this.#closed = true;
    if (this.#activeSend) {
      this.#cancelRequested = true;
      try {
        await this.#host.cancel();
        await this.#activeSend;
      } catch (error) {
        this.#channel.push(classifyError(error, "close"));
      }
    }

    try {
      await this.#host.close();
    } catch (error) {
      this.#channel.push(classifyError(error, "close"));
    } finally {
      this.#unsubscribe();
      this.#channel.push({ type: "closed" });
      this.#channel.close();
    }
  }

  #emitCancelled(): void {
    if (this.#cancelEventEmitted) return;
    this.#cancelEventEmitted = true;
    this.#channel.push({ type: "generation_cancelled" });
  }

  #onPiEvent(event: AgentSessionEvent): void {
    if (event.type === "message_update") {
      const update = event.assistantMessageEvent;
      if (update.type === "text_delta" && update.delta.length > 0) {
        this.#channel.push({ type: "assistant_text_delta", delta: update.delta });
      } else if (update.type === "error") {
        if (update.reason === "aborted") {
          this.#emitCancelled();
        } else {
          this.#emitProviderFailure(update.error.errorMessage ?? "Provider 请求失败。");
        }
      }
      return;
    }

    if (event.type === "message_end" && event.message.role === "assistant") {
      if (event.message.stopReason === "aborted") {
        this.#emitCancelled();
      } else if (event.message.stopReason === "error") {
        this.#emitProviderFailure(event.message.errorMessage ?? "Provider 请求失败。");
      }
      return;
    }

    if (event.type === "tool_execution_start") {
      this.#channel.push({
        type: "tool_started",
        callId: event.toolCallId,
        name: event.toolName,
      });
      return;
    }

    if (event.type === "tool_execution_end") {
      this.#channel.push({
        type: "tool_finished",
        callId: event.toolCallId,
        name: event.toolName,
        isError: event.isError,
        output: toolOutput(event.result),
      });
      return;
    }

    if (event.type === "compaction_start") {
      this.#channel.push({ type: "compaction_started", reason: event.reason });
      return;
    }

    if (event.type === "compaction_end") {
      this.#channel.push({
        type: "compaction_finished",
        reason: event.reason,
        aborted: event.aborted,
      });
      if (event.errorMessage) {
        this.#channel.push(classifyError(event.errorMessage, "compaction"));
      }
    }
  }

  #emitProviderFailure(message: string): void {
    this.#sendFailed = true;
    if (this.#providerErrorEmitted) return;
    this.#providerErrorEmitted = true;
    this.#channel.push(classifyError(message, "send"));
  }
}

export async function openRepa(
  options: OpenRepaOptions,
  dependencies: OpenRepaDependencies = {},
): Promise<OpenRepaResult> {
  if (options.learnerSpace.trim().length === 0) {
    return {
      ok: false,
      error: {
        type: "error",
        code: "session",
        operation: "open",
        message: "learnerSpace 不能为空。",
        recoverable: false,
      },
    };
  }

  const learnerSpace = path.resolve(options.learnerSpace);
  const trustExtensions = options.trustExtensions ?? false;
  let application: RepaApplicationImpl | undefined;
  const pendingExtensionErrors: string[] = [];
  try {
    const host = await PiConversationHost.open({
      learnerSpace,
      agentDir: options.agentDir,
      resume: options.resume ?? true,
      trustExtensions,
      modelOverride: dependencies.modelOverride,
      onExtensionError: (message) => {
        if (application) application.reportExtensionError(message);
        else pendingExtensionErrors.push(message);
      },
    });
    application = RepaApplicationImpl.create(host, learnerSpace, trustExtensions);
    for (const message of pendingExtensionErrors) application.reportExtensionError(message);
    return { ok: true, application };
  } catch (error) {
    return { ok: false, error: classifyError(error, "open") };
  }
}
