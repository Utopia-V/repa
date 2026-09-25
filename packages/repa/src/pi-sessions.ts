import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { historyView, type Resources } from "./messages.js";
import {
  PiConversationHost,
  type ConversationRuntime,
  type OpenPiHostOptions,
} from "./pi-host.js";
import { RepaFault, type Message } from "./protocol.js";

export interface StoredSessionSnapshot {
  name: string | undefined;
  createdAt: number;
  messages: Message[];
}
type RuntimeOptions = Omit<
  OpenPiHostOptions,
  "sessionManager" | "learnerSpace" | "resources"
>;
export interface StoredSession {
  readonly id: string;
  snapshot(): StoredSessionSnapshot;
  branch(messageId: string): StoredSession;
  openRuntime(options: RuntimeOptions): Promise<ConversationRuntime>;
}

/** Repa publishes empty session identities; Pi normally defers their files until the first reply. */
function persistSession(manager: SessionManager): SessionManager {
  const file = manager.getSessionFile();
  if (!file) throw new Error("会话缺少持久保存位置。");
  if (!existsSync(file)) {
    writeFileSync(
      file,
      [manager.getHeader(), ...manager.getEntries()]
        .map((entry) => JSON.stringify(entry))
        .join("\n") + "\n",
      { flag: "wx", mode: 0o600, flush: true },
    );
  }
  return SessionManager.open(file, manager.getSessionDir(), manager.getCwd());
}

/** Owns the Pi session format and tree semantics, without opening an Agent runtime for reads. */
class PiStoredSession implements StoredSession {
  readonly #manager: SessionManager;
  readonly #resources: Resources;

  constructor(manager: SessionManager, resources: Resources) {
    this.#manager = manager;
    this.#resources = resources;
  }

  get id(): string {
    return this.#manager.getSessionId();
  }

  snapshot(): StoredSessionSnapshot {
    return {
      name: this.#manager.getSessionName(),
      createdAt:
        Date.parse(this.#manager.getHeader()?.timestamp ?? "") || Date.now(),
      messages: historyView(this.#manager.getBranch(), this.#resources),
    };
  }

  branch(messageId: string): StoredSession {
    // Branch through a separate manager so an existing runtime keeps its identity and tree position.
    const manager = SessionManager.open(
      this.#manager.getSessionFile()!,
      this.#manager.getSessionDir(),
      this.#manager.getCwd(),
    );
    const entry = manager.getEntry(messageId);
    if (
      !entry ||
      !historyView(manager.getBranch(), this.#resources).some(
        (message) => message.id === messageId,
      )
    ) {
      throw new RepaFault("invalid_branch_point", "请选择已经保存的历史消息。");
    }
    const pending = new Set<string>();
    for (const item of manager.getBranch(entry.id)) {
      if (item.type !== "message") continue;
      if (item.message.role === "assistant") {
        for (const part of item.message.content)
          if (part.type === "toolCall") pending.add(part.id);
      }
      if (item.message.role === "toolResult")
        pending.delete(item.message.toolCallId);
    }
    if (pending.size)
      throw new RepaFault(
        "invalid_branch_point",
        "该位置仍有未配对的工具调用，请选择工具结果之后的消息。",
      );
    manager.createBranchedSession(entry.id);
    return new PiStoredSession(persistSession(manager), this.#resources);
  }

  openRuntime(options: RuntimeOptions): Promise<ConversationRuntime> {
    return PiConversationHost.open({
      ...options,
      learnerSpace: this.#manager.getCwd(),
      sessionManager: this.#manager,
      resources: this.#resources,
    });
  }
}

export class PiSessionStore {
  readonly #cwd: string;
  readonly #directory: string;
  readonly #resources: Resources;

  constructor(cwd: string, resources: Resources) {
    this.#cwd = cwd;
    this.#directory = path.join(cwd, ".repa", "sessions");
    this.#resources = resources;
    mkdirSync(this.#directory, { recursive: true });
  }

  async list(): Promise<StoredSession[]> {
    const sessions = await SessionManager.list(this.#cwd, this.#directory);
    return sessions.map(
      (session) =>
        new PiStoredSession(
          SessionManager.open(session.path, this.#directory, this.#cwd),
          this.#resources,
        ),
    );
  }

  create(): StoredSession {
    return new PiStoredSession(
      persistSession(SessionManager.create(this.#cwd, this.#directory)),
      this.#resources,
    );
  }
}
