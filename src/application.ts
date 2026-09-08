import { randomUUID } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import {
  SessionManager,
  type ExtensionUIDialogOptions,
} from "@earendil-works/pi-coding-agent";
import { historyView, Resources } from "./messages.js";
import {
  PiConversationHost,
  type Dialog,
  type HostEvent,
  type PiModelOverride,
} from "./pi-host.js";
import {
  isTerminal,
  RepaFault,
  type Change,
  type Delivery,
  type Interaction,
  type Params,
  type Reply,
  type Run,
  type Scope,
  type SessionKey,
  type SessionView,
  type SessionSummary,
  type Snapshot,
  type Space,
} from "./protocol.js";
import { persistSession, RuntimeStore } from "./runtime-store.js";
import { applyChange, contains, relevant } from "./state.js";

export interface ApplicationOptions {
  agentDir?: string;
  trustExtensions?: boolean;
  eventBufferSize?: number;
  exitWhenDetached?: boolean;
  modelOverride?:
    | PiModelOverride
    | ((space: Space, sessionId: string) => Promise<PiModelOverride>);
}
interface ActiveRun {
  run: Run;
  controller: AbortController;
  done: Promise<void>;
}
interface SessionRecord {
  store: RuntimeStore;
  manager: SessionManager;
  view: SessionView;
  host?: PiConversationHost;
  opening?: Promise<PiConversationHost>;
  active?: ActiveRun;
  closing?: Promise<void>;
}
interface PendingReply {
  interaction: Interaction;
  resolve: (value: Reply) => void;
}
const keyOf = (key: SessionKey) => `${key.spaceId}/${key.sessionId}`;

export class RepaApplication {
  readonly id = randomUUID();
  readonly resources = new Resources();
  readonly closed: Promise<void>;
  readonly #options: ApplicationOptions;
  readonly #state: Snapshot = {
    lifecycle: "running",
    spaces: [],
    sessions: [],
  };
  readonly #spaces = new Map<string, RuntimeStore>();
  readonly #openingSpaces = new Map<string, Promise<Space>>();
  readonly #sessions = new Map<string, SessionRecord>();
  readonly #pending = new Map<string, PendingReply>();
  readonly #watchers = new Set<{
    scope: Scope;
    send: (value: Delivery) => void;
  }>();
  readonly #log: { sequence: number; change: Change }[] = [];
  readonly #clients = new Set<string>();
  #sequence = 0;
  #explicitShutdown = false;
  #finishing = false;
  #resolveClosed!: () => void;
  #rejectClosed!: (error: Error) => void;

  constructor(options: ApplicationOptions = {}) {
    if (
      options.eventBufferSize !== undefined &&
      (!Number.isInteger(options.eventBufferSize) ||
        options.eventBufferSize < 1)
    )
      throw new Error("事件缓存大小必须为正整数。");
    this.#options = options;
    this.closed = new Promise((resolve, reject) => {
      this.#resolveClosed = resolve;
      this.#rejectClosed = reject;
    });
  }

  attach(id: string): void {
    if (this.#finishing || this.#state.lifecycle === "stopped")
      throw new RepaFault("closed", "后端已经退出。");
    this.#clients.add(id);
    if (!this.#explicitShutdown && this.#state.lifecycle === "draining")
      this.#emit({ type: "lifecycle", lifecycle: "running" });
  }
  detach(id: string): void {
    if (!this.#clients.delete(id)) return;
    if (
      this.#options.exitWhenDetached &&
      this.#clients.size === 0 &&
      this.#state.lifecycle === "running"
    )
      this.#emit({ type: "lifecycle", lifecycle: "draining" });
    this.#finishIfReady();
  }

  async openSpace(directory: string): Promise<Space> {
    this.#assertAccepting();
    await mkdir(path.resolve(directory), { recursive: true });
    directory = await realpath(directory);
    const existing = [...this.#spaces.values()].find(
      (x) => x.space.path === directory,
    );
    if (existing) return structuredClone(existing.space);
    const opening = this.#openingSpaces.get(directory);
    if (opening) return opening;
    const promise = this.#openSpace(directory);
    this.#openingSpaces.set(directory, promise);
    try {
      return await promise;
    } finally {
      this.#openingSpaces.delete(directory);
      this.#finishIfReady();
    }
  }
  async #openSpace(directory: string): Promise<Space> {
    const store = new RuntimeStore(directory, (error) => {
      for (const record of this.#sessions.values())
        if (record.store.space.path === directory)
          this.#notice(record, "space_lock_lost", error.message);
      this.shutdown("cancel");
    });
    try {
      if (this.#spaces.has(store.space.id))
        throw new RepaFault(
          "space_identity_conflict",
          "两个目录拥有相同的学习空间身份。",
        );
      const sessions = await SessionManager.list(
        directory,
        store.sessionDirectory,
      );
      this.#assertAccepting();
      this.#spaces.set(store.space.id, store);
      this.#emit({ type: "space", space: store.space });
      for (const session of sessions)
        this.#register(
          store,
          SessionManager.open(session.path, store.sessionDirectory, directory),
        );
      return structuredClone(store.space);
    } catch (error) {
      store.release();
      throw error;
    }
  }
  listSpaces(): Space[] {
    return structuredClone(this.#state.spaces);
  }

  #store(id: string): RuntimeStore {
    const store = this.#spaces.get(id);
    if (!store) throw new RepaFault("not_found", "学习空间尚未打开。");
    return store;
  }
  #record(key: SessionKey): SessionRecord {
    const record = this.#sessions.get(keyOf(key));
    if (!record)
      throw new RepaFault("not_found", "会话不存在或所属学习空间尚未打开。");
    return record;
  }
  #register(store: RuntimeStore, manager: SessionManager): SessionRecord {
    const key = { spaceId: store.space.id, sessionId: manager.getSessionId() };
    const existing = this.#sessions.get(keyOf(key));
    if (existing) return existing;
    const messages = historyView(manager.getBranch(), this.resources);
    const firstUser = messages
      .find((x) => x.role === "user")
      ?.content.find((x) => x.type === "text");
    const runs = [...store.runs.values()].filter(
      (x) => x.sessionId === key.sessionId,
    );
    const createdAt =
      Date.parse(manager.getHeader()?.timestamp ?? "") || Date.now();
    const view: SessionView = {
      ...key,
      title:
        manager.getSessionName() ??
        (firstUser?.type === "text"
          ? firstUser.text.slice(0, 120)
          : (runs[0]?.text.slice(0, 120) ?? "新会话")),
      createdAt,
      updatedAt: runs.reduce(
        (latest, run) => Math.max(latest, run.finishedAt ?? run.createdAt),
        messages.reduce(
          (latest, message) => Math.max(latest, message.timestamp),
          createdAt,
        ),
      ),
      runtime: "unloaded",
      messages,
      runs,
      interactions: [],
      notices: [],
    };
    const record: SessionRecord = { store, manager, view };
    this.#sessions.set(keyOf(key), record);
    this.#emit({ type: "session", session: view });
    return record;
  }

  createSession(spaceId: string): SessionView {
    this.#assertAccepting();
    const store = this.#store(spaceId);
    return structuredClone(this.#register(store, store.createSession()).view);
  }
  listSessions(spaceId: string): SessionSummary[] {
    this.#store(spaceId);
    return structuredClone(
      this.#state.sessions
        .filter((x) => x.spaceId === spaceId)
        .sort(
          (a, b) =>
            b.updatedAt - a.updatedAt ||
            b.createdAt - a.createdAt ||
            a.sessionId.localeCompare(b.sessionId),
        )
        .map(
          ({
            spaceId,
            sessionId,
            title,
            createdAt,
            updatedAt,
            runtime,
            runs,
          }) => {
            const activeRun = runs.findLast((run) => !isTerminal(run));
            return {
              spaceId,
              sessionId,
              title,
              createdAt,
              updatedAt,
              runtime,
              ...(activeRun ? { activeRun } : {}),
            };
          },
        ),
    );
  }
  getSession(key: SessionKey): SessionView {
    return structuredClone(this.#record(key).view);
  }
  branchSession(params: Params<"session.branch">): SessionView {
    this.#assertAccepting();
    const source = this.#record(params);
    source.store.assertOwned();
    // A separate manager preserves the source runtime, including an ongoing Agent run.
    const manager = SessionManager.open(
      source.manager.getSessionFile()!,
      source.store.sessionDirectory,
      source.store.space.path,
    );
    const entry = manager.getEntry(params.messageId);
    if (
      !entry ||
      !source.view.messages.some(
        (x) => x.id === params.messageId && !x.streaming,
      )
    )
      throw new RepaFault("invalid_branch_point", "请选择已经保存的历史消息。");
    const pending = new Set<string>();
    for (const item of manager.getBranch(entry.id)) {
      if (item.type !== "message") continue;
      if (item.message.role === "assistant")
        for (const part of item.message.content) {
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
    return structuredClone(
      this.#register(source.store, persistSession(manager)).view,
    );
  }

  submit(params: Params<"run.submit">): Run {
    const store = this.#store(params.spaceId);
    const old = store.runs.get(params.requestId);
    if (old) {
      if (old.sessionId !== params.sessionId || old.text !== params.text)
        throw new RepaFault(
          "request_conflict",
          "相同请求标识已用于另一项请求。",
        );
      return this.getRun(params.spaceId, params.requestId) as Run;
    }
    this.#assertAccepting();
    if (!params.text.trim())
      throw new RepaFault("invalid_input", "消息不能为空。");
    const record = this.#record(params);
    if (record.active || record.closing)
      throw new RepaFault("busy", "该会话仍有任务正在运行或关闭。");
    const run: Run = {
      id: params.requestId,
      spaceId: params.spaceId,
      sessionId: params.sessionId,
      text: params.text,
      status: "accepted",
      phase: "preparing",
      createdAt: Date.now(),
    };
    store.saveRun(run);
    record.view.updatedAt = run.createdAt;
    if (!record.view.messages.length && !record.view.runs.length)
      record.view.title = params.text.slice(0, 120);
    const active: ActiveRun = {
      run,
      controller: new AbortController(),
      done: Promise.resolve(),
    };
    record.active = active;
    active.done = Promise.resolve().then(() => this.#execute(record, active));
    this.#emit({ type: "session", session: record.view });
    this.#emit({ type: "run", run });
    return structuredClone(run);
  }
  getRun(
    spaceId: string,
    requestId: string,
  ): Run | { id: string; status: "unknown" } {
    const store = this.#store(spaceId);
    const saved = store.runs.get(requestId);
    if (!saved) return { id: requestId, status: "unknown" };
    return structuredClone(
      this.#sessions
        .get(keyOf(saved))
        ?.view.runs.find((x) => x.id === requestId) ?? saved,
    );
  }
  cancelRun(spaceId: string, requestId: string): Run {
    const run = this.getRun(spaceId, requestId);
    if (run.status === "unknown")
      throw new RepaFault("unknown_request", "无法确认该请求的执行状态。");
    if (isTerminal(run)) return run;
    const record = this.#record(run);
    const active = record.active;
    if (!active || active.run.id !== requestId) return run;
    active.controller.abort();
    this.#updateRun(active, { status: "cancelling" });
    if (record.host)
      void record.host
        .cancel()
        .catch((error) => this.#notice(record, "cancel", String(error)));
    return structuredClone(active.run);
  }

  async #execute(record: SessionRecord, active: ActiveRun): Promise<void> {
    let result: Partial<Run> = { status: "cancelled" };
    try {
      if (!active.controller.signal.aborted) {
        this.#updateRun(active, { status: "running" });
        if (!record.host) {
          record.view.runtime = "loading";
          this.#emit({ type: "session", session: record.view });
          record.opening = this.#openHost(record);
          try {
            record.host = await record.opening;
          } finally {
            record.opening = undefined;
          }
          record.view.runtime = "ready";
          this.#emit({ type: "session", session: record.view });
        }
        if (!active.controller.signal.aborted) {
          const outcome = await record.host.send(active.run.text);
          result = {
            status: outcome.status,
            ...(outcome.error
              ? { error: { code: "provider", message: outcome.error } }
              : {}),
          };
        }
      }
    } catch (error) {
      result = active.controller.signal.aborted
        ? { status: "cancelled" }
        : {
            status: "failed",
            error: {
              code: error instanceof RepaFault ? error.code : "runtime",
              message: error instanceof Error ? error.message : String(error),
            },
          };
      if (!record.host) record.view.runtime = "unloaded";
    } finally {
      active.controller.abort();
      const finished: Run = {
        ...active.run,
        ...result,
        phase: "idle",
        finishedAt: Date.now(),
      };
      try {
        record.store.saveRun(finished);
      } catch (error) {
        finished.status = "interrupted";
        finished.error = {
          code: "storage",
          message: `执行结果未能保存：${String(error)}`,
        };
      }
      active.run = finished;
      record.view.updatedAt = finished.finishedAt!;
      this.#emit({ type: "run", run: finished });
      record.active = undefined;
      this.#emit({ type: "session", session: record.view });
      this.#finishIfReady();
    }
  }
  async #openHost(record: SessionRecord): Promise<PiConversationHost> {
    const modelOverride =
      typeof this.#options.modelOverride === "function"
        ? await this.#options.modelOverride(
            record.store.space,
            record.view.sessionId,
          )
        : this.#options.modelOverride;
    return PiConversationHost.open({
      learnerSpace: record.store.space.path,
      agentDir: this.#options.agentDir,
      trustExtensions: this.#options.trustExtensions ?? false,
      sessionManager: record.manager,
      modelOverride,
      resources: this.resources,
      onEvent: (event) => this.#hostEvent(record, event),
      ask: (dialog, options) => this.#ask(record, dialog, options),
    });
  }
  #hostEvent(record: SessionRecord, event: HostEvent): void {
    const key = {
      spaceId: record.view.spaceId,
      sessionId: record.view.sessionId,
    };
    if (event.type === "title") {
      const first = record.view.messages
        .find((x) => x.role === "user")
        ?.content.find((x) => x.type === "text");
      record.view.title =
        event.title ??
        (first?.type === "text"
          ? first.text.slice(0, 120)
          : (record.view.runs[0]?.text.slice(0, 120) ?? "新会话"));
      this.#emit({ type: "session", session: record.view });
    } else if (event.type === "phase") {
      if (record.active) this.#updateRun(record.active, { phase: event.phase });
    } else if (event.type === "tool") {
      if (record.active)
        this.#emit({ ...event, ...key, runId: record.active.run.id });
    } else this.#emit({ ...event, ...key });
  }
  #updateRun(active: ActiveRun, update: Partial<Run>): void {
    active.run = { ...active.run, ...update };
    this.#emit({ type: "run", run: active.run });
  }
  #notice(record: SessionRecord, code: string, message: string): void {
    this.#emit({
      type: "notice",
      spaceId: record.view.spaceId,
      sessionId: record.view.sessionId,
      notice: { id: randomUUID(), code, message, level: "error" },
    });
  }
  #ask(
    record: SessionRecord,
    dialog: Dialog,
    options?: ExtensionUIDialogOptions,
  ): Promise<Reply> {
    const active = record.active;
    if (!active || active.controller.signal.aborted || options?.signal?.aborted)
      return Promise.resolve(null);
    const id = randomUUID();
    const interaction: Interaction = {
      ...dialog,
      id,
      spaceId: record.view.spaceId,
      sessionId: record.view.sessionId,
      runId: active.run.id,
      ...(options?.timeout !== undefined
        ? { expiresAt: Date.now() + options.timeout }
        : {}),
    };
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (value: Reply) => {
        if (!this.#pending.delete(id)) return;
        clearTimeout(timer);
        active.controller.signal.removeEventListener("abort", abort);
        options?.signal?.removeEventListener("abort", abort);
        this.#emit({
          type: "interaction",
          spaceId: interaction.spaceId,
          sessionId: interaction.sessionId,
          id,
          interaction: null,
        });
        if (active.run.status === "waiting" && !record.view.interactions.length)
          this.#updateRun(active, { status: "running" });
        resolve(value);
      };
      const abort = () => finish(null);
      this.#pending.set(id, { interaction, resolve: finish });
      active.controller.signal.addEventListener("abort", abort, { once: true });
      options?.signal?.addEventListener("abort", abort, { once: true });
      if (options?.timeout !== undefined)
        timer = setTimeout(abort, options.timeout);
      this.#updateRun(active, { status: "waiting" });
      this.#emit({
        type: "interaction",
        spaceId: interaction.spaceId,
        sessionId: interaction.sessionId,
        id,
        interaction,
      });
    });
  }
  reply(params: Params<"interaction.reply">): void {
    const pending = this.#pending.get(params.id);
    if (!pending || !contains(params, pending.interaction))
      throw new RepaFault(
        "interaction_expired",
        "该交互已经回答、取消或过期。",
      );
    const question = pending.interaction;
    if (
      params.value !== null &&
      (question.kind === "confirm"
        ? typeof params.value !== "boolean"
        : typeof params.value !== "string" ||
          (question.kind === "select" &&
            !question.options?.includes(params.value)))
    )
      throw new RepaFault(
        "invalid_reply",
        "回复不符合该交互的选项或数据类型。",
      );
    pending.resolve(params.value);
  }

  async closeSession(key: SessionKey): Promise<void> {
    const record = this.#record(key);
    if (record.closing) return record.closing;
    record.closing = (async () => {
      if (record.active) {
        this.cancelRun(key.spaceId, record.active.run.id);
        await record.active?.done;
      }
      try {
        await record.host?.close();
      } finally {
        record.host = undefined;
        record.view.runtime = "unloaded";
        this.#emit({ type: "session", session: record.view });
      }
    })();
    try {
      await record.closing;
    } finally {
      record.closing = undefined;
    }
  }

  snapshot(scope: Scope): Snapshot {
    return structuredClone({
      lifecycle: this.#state.lifecycle,
      spaces: this.#state.spaces.filter(
        (x) => !("spaceId" in scope) || x.id === scope.spaceId,
      ),
      sessions: this.#state.sessions.filter((x) => contains(scope, x)),
    });
  }
  watch(
    scope: Scope,
    cursor: string | undefined,
    send: (delivery: Delivery) => void,
  ): () => void {
    const watcher = { scope, send };
    this.#watchers.add(watcher);
    const suffix = cursor?.startsWith(`${this.id}:`)
      ? Number(cursor.slice(this.id.length + 1))
      : NaN;
    if (
      Number.isSafeInteger(suffix) &&
      suffix >= (this.#log[0]?.sequence ?? this.#sequence + 1) - 1 &&
      suffix <= this.#sequence
    ) {
      send({
        type: "changes",
        cursor: this.#cursor(),
        changes: this.#log
          .filter((x) => x.sequence > suffix && relevant(scope, x.change))
          .map((x) => structuredClone(x.change)),
      });
    } else
      send({
        type: "snapshot",
        cursor: this.#cursor(),
        snapshot: this.snapshot(scope),
      });
    return () => {
      this.#watchers.delete(watcher);
    };
  }
  #cursor(): string {
    return `${this.id}:${this.#sequence}`;
  }
  #emit(change: Change): void {
    applyChange(this.#state, change);
    this.#log.push({
      sequence: ++this.#sequence,
      change: structuredClone(change),
    });
    if (this.#log.length > (this.#options.eventBufferSize ?? 1024))
      this.#log.shift();
    for (const watcher of this.#watchers) {
      if (!relevant(watcher.scope, change)) continue;
      try {
        watcher.send({
          type: "changes",
          cursor: this.#cursor(),
          changes: [structuredClone(change)],
        });
      } catch {
        this.#watchers.delete(watcher);
      }
    }
  }
  #assertAccepting(): void {
    if (this.#state.lifecycle !== "running")
      throw new RepaFault("shutting_down", "后端正在退出，暂不受理新任务。");
  }
  shutdown(mode: "drain" | "cancel"): void {
    if (this.#state.lifecycle === "stopped" || this.#finishing) return;
    this.#explicitShutdown = true;
    this.#emit({
      type: "lifecycle",
      lifecycle: mode === "cancel" ? "stopping" : "draining",
    });
    if (mode === "cancel")
      for (const record of this.#sessions.values()) {
        if (record.active)
          this.cancelRun(record.view.spaceId, record.active.run.id);
      }
    this.#finishIfReady();
  }
  #finishIfReady(): void {
    if (
      this.#finishing ||
      this.#state.lifecycle === "running" ||
      this.#state.lifecycle === "stopped" ||
      this.#openingSpaces.size ||
      [...this.#sessions.values()].some((x) => x.active)
    )
      return;
    this.#finishing = true;
    void (async () => {
      const errors: unknown[] = [];
      for (const record of this.#sessions.values()) {
        try {
          await this.closeSession(record.view);
        } catch (error) {
          errors.push(error);
          this.#notice(record, "shutdown", String(error));
        }
      }
      for (const store of this.#spaces.values()) {
        try {
          store.release();
        } catch (error) {
          errors.push(error);
        }
      }
      this.#emit({ type: "lifecycle", lifecycle: "stopped" });
      this.#watchers.clear();
      this.resources.clear();
      if (errors.length)
        this.#rejectClosed(
          new AggregateError(errors, "后端退出时有资源未能正常清理。"),
        );
      else this.#resolveClosed();
    })();
  }
}
