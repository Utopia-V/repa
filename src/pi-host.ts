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
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

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

export interface OpenPiHostOptions {
  learnerSpace: string;
  agentDir?: string;
  resume: boolean;
  trustExtensions: boolean;
  modelOverride?: PiModelOverride;
  onExtensionError: (message: string) => void;
}

export interface PiHostOpenDiagnostics {
  extensionErrors: string[];
  resourceWarnings: string[];
  modelFallbackMessage?: string;
}

export class PiConversationHost {
  readonly #session: AgentSession;
  readonly #settingsManager: SettingsManager;
  readonly #restored: boolean;
  #closed = false;

  private constructor(
    session: AgentSession,
    settingsManager: SettingsManager,
    restored: boolean,
    readonly diagnostics: PiHostOpenDiagnostics,
  ) {
    this.#session = session;
    this.#settingsManager = settingsManager;
    this.#restored = restored;
  }

  static async open(options: OpenPiHostOptions): Promise<PiConversationHost> {
    const sessionDirectory = path.join(options.learnerSpace, ".repa", "sessions");
    const agentDirectory = path.resolve(options.agentDir ?? getAgentDir());
    await mkdir(sessionDirectory, { recursive: true });
    await mkdir(agentDirectory, { recursive: true });

    const settingsManager = SettingsManager.create(options.learnerSpace, agentDirectory, {
      projectTrusted: options.trustExtensions,
    });
    const resourceLoader = new DefaultResourceLoader({
      cwd: options.learnerSpace,
      agentDir: agentDirectory,
      settingsManager,
      noExtensions: !options.trustExtensions,
      noSkills: !options.trustExtensions,
      noPromptTemplates: !options.trustExtensions,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: REPA_BASE_PROMPT,
      appendSystemPrompt: [],
    });
    await resourceLoader.reload({
      resolveProjectTrust: async () => options.trustExtensions,
    });

    const existingSessions = options.resume
      ? await SessionManager.list(options.learnerSpace, sessionDirectory)
      : [];
    const restored = existingSessions.length > 0;
    const sessionManager = restored
      ? SessionManager.continueRecent(options.learnerSpace, sessionDirectory)
      : SessionManager.create(options.learnerSpace, sessionDirectory);
    const readTool = await createSkillReadTool(options.learnerSpace, resourceLoader);

    const created = await createAgentSession({
      cwd: options.learnerSpace,
      agentDir: agentDirectory,
      model: options.modelOverride?.model,
      modelRuntime: options.modelOverride?.modelRuntime,
      resourceLoader,
      sessionManager,
      settingsManager,
      noTools: "builtin",
      customTools: [readTool],
    });

    await created.session.bindExtensions({
      mode: "json",
      onError: (error) => {
        options.onExtensionError(`${error.extensionPath} (${error.event}): ${error.error}`);
      },
    });

    const extensionErrors = created.extensionsResult.errors.map(
      (entry) => `${entry.path}: ${String(entry.error)}`,
    );
    const resourceWarnings = [
      ...resourceLoader.getSkills().diagnostics,
      ...resourceLoader.getPrompts().diagnostics,
    ].map((diagnostic) => diagnostic.message);

    return new PiConversationHost(created.session, settingsManager, restored, {
      extensionErrors,
      resourceWarnings,
      modelFallbackMessage: created.modelFallbackMessage,
    });
  }

  get sessionId(): string {
    return this.#session.sessionId;
  }

  get restored(): boolean {
    return this.#restored;
  }

  get hasModel(): boolean {
    return this.#session.model !== undefined;
  }

  subscribe(listener: (event: AgentSessionEvent) => void): () => void {
    return this.#session.subscribe(listener);
  }

  async send(text: string): Promise<void> {
    this.#assertOpen();
    await this.#session.prompt(text, { expandPromptTemplates: true });
  }

  async cancel(): Promise<void> {
    this.#assertOpen();
    await this.#session.abort();
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;

    let shutdownError: unknown;
    try {
      await this.#session.abort();
      await this.#session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    } catch (error) {
      shutdownError = error;
    } finally {
      this.#session.dispose();
      await this.#settingsManager.flush();
    }

    if (shutdownError) throw shutdownError;
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error("Repa Session 已关闭。");
  }
}
