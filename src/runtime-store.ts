import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import lockfile from "proper-lockfile";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { Check } from "typebox/value";
import {
  isTerminal,
  RepaFault,
  RunSchema,
  type Run,
  type Space,
} from "./protocol.js";

function durableWrite(file: string, text: string, flag: "a" | "wx"): void {
  const fd = openSync(file, flag, 0o600);
  try {
    writeFileSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Pi deliberately defers empty sessions. Repa creates the header before exposing their identity. */
export function persistSession(manager: SessionManager): SessionManager {
  const file = manager.getSessionFile();
  if (!file) throw new Error("会话缺少持久保存位置。");
  if (!existsSync(file)) {
    durableWrite(
      file,
      [manager.getHeader(), ...manager.getEntries()]
        .map((x) => JSON.stringify(x))
        .join("\n") + "\n",
      "wx",
    );
  }
  return SessionManager.open(file, manager.getSessionDir(), manager.getCwd());
}

export class RuntimeStore {
  readonly space: Space;
  readonly sessionDirectory: string;
  readonly runs = new Map<string, Run>();
  readonly #directory: string;
  readonly #unlock: () => void;
  #compromised: Error | undefined;
  #released = false;

  constructor(directory: string, onCompromised: (error: Error) => void) {
    mkdirSync(directory, { recursive: true });
    directory = realpathSync(directory);
    this.#directory = path.join(directory, ".repa", "runtime");
    this.sessionDirectory = path.join(directory, ".repa", "sessions");
    mkdirSync(this.#directory, { recursive: true });
    mkdirSync(this.sessionDirectory, { recursive: true });
    try {
      this.#unlock = lockfile.lockSync(this.#directory, {
        lockfilePath: path.join(this.#directory, "owner.lock"),
        onCompromised: (error) => {
          this.#compromised = error;
          onCompromised(error);
        },
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ELOCKED")
        throw new RepaFault(
          "space_in_use",
          "学习空间已由另一个后端占用，或中断后的锁尚未过期。请连接已有后端，或稍后重试。",
        );
      throw error;
    }
    try {
      const identity = path.join(this.#directory, "space.json");
      if (!existsSync(identity))
        durableWrite(
          identity,
          JSON.stringify({ id: randomUUID() }) + "\n",
          "wx",
        );
      const saved = JSON.parse(readFileSync(identity, "utf8"));
      if (
        typeof saved.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(saved.id)
      )
        throw new Error("学习空间身份记录无效。");
      this.space = { id: saved.id, path: directory };
      const journal = path.join(this.#directory, "runs.jsonl");
      if (existsSync(journal)) {
        const bytes = readFileSync(journal);
        const end = bytes.lastIndexOf(10) + 1;
        // Only an unterminated tail can be a torn append; complete invalid records are errors.
        for (const line of bytes
          .subarray(0, end)
          .toString("utf8")
          .split("\n")
          .filter(Boolean)) {
          const run: unknown = JSON.parse(line);
          if (!Check(RunSchema, run) || run.spaceId !== this.space.id)
            throw new Error("任务记录无效；请检查学习空间的运行记录。");
          this.runs.set(run.id, run);
        }
        if (end < bytes.length) truncateSync(journal, end);
      }
      for (const run of this.runs.values()) {
        if (!isTerminal(run))
          this.saveRun({
            ...run,
            status: "interrupted",
            phase: "idle",
            finishedAt: Date.now(),
            error: {
              code: "interrupted",
              message:
                "此前后端进程已中断，操作结果需要核对；任务未自动重新执行。",
            },
          });
      }
    } catch (error) {
      this.release();
      throw error;
    }
  }

  assertOwned(): void {
    if (this.#released || this.#compromised)
      throw new RepaFault("space_lock_lost", "学习空间的独占访问已经结束。");
  }

  saveRun(run: Run): void {
    this.assertOwned();
    durableWrite(
      path.join(this.#directory, "runs.jsonl"),
      JSON.stringify(run) + "\n",
      "a",
    );
    this.runs.set(run.id, structuredClone(run));
  }

  createSession(): SessionManager {
    this.assertOwned();
    return persistSession(
      SessionManager.create(this.space.path, this.sessionDirectory),
    );
  }

  release(): void {
    if (this.#released) return;
    this.#released = true;
    if (!this.#compromised) this.#unlock();
  }
}
