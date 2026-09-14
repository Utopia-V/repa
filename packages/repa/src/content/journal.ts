import { lstat, mkdir, readFile, readdir, realpath, rm, rmdir } from "node:fs/promises";
import path from "node:path";
import { Type, type Static } from "typebox";
import { Check } from "typebox/value";
import { RepaFault } from "../errors.js";
import { object, IdSchema, literals } from "../schema.js";
import { atomicWrite, syncDirectory, writeJson } from "../storage/atomic.js";
import { BlobStore, digest } from "../storage/blobs.js";
import { ContentChangeResultSchema, type ContentChangeResult, type ContentOperation } from "./schema.js";

const ImageSchema = Type.Union([
  object({ kind: Type.Literal("absent") }),
  object({ kind: Type.Literal("directory"), mode: Type.Number() }),
  object({ kind: Type.Literal("file"), hash: Type.String({ pattern: "^[a-f0-9]{64}$" }), mode: Type.Number() }),
]);
export type FileImage = Static<typeof ImageSchema>;
export interface FileMutation { path: string; before: FileImage; after: FileImage }
const EntrySchema = object({
  version: Type.Literal(1),
  operationId: IdSchema,
  requestHash: Type.String(),
  status: literals(["prepared", "committed", "rolled_back", "needs_recovery", "reconciled"]),
  createdAt: Type.Number(),
  files: Type.Array(object({ path: Type.String(), before: ImageSchema, after: ImageSchema })),
  affectedIds: Type.Array(IdSchema),
  result: ContentChangeResultSchema,
  conflicts: Type.Array(Type.String()),
  error: Type.Optional(Type.String()),
  errorCode: Type.Optional(Type.String()),
  repairedBy: Type.Optional(IdSchema),
});
export type JournalEntry = Static<typeof EntrySchema>;
export const sameImage = (a: FileImage, b: FileImage): boolean =>
  a.kind === b.kind && (a.kind !== "file" || (b.kind === "file" && a.hash === b.hash)) &&
  (a.kind === "absent" || (b.kind !== "absent" && a.mode === b.mode));

/** 只拥有文件效果与恢复记录；调用者负责空间内的串行协调和内容语义。 */
export class FileJournal {
  readonly entries = new Map<string, JournalEntry>();
  constructor(readonly root: string, readonly directory: string, readonly blobs: BlobStore) {}

  async open(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    for (const name of await readdir(this.directory)) {
      if (!name.endsWith(".json")) continue;
      const raw: unknown = JSON.parse(await readFile(path.join(this.directory, name), "utf8"));
      if (!Check(EntrySchema, raw) || name !== `${raw.operationId}.json`)
        throw new RepaFault("invalid_storage", "内容操作记录无法解析，原文件保持不变。", { name });
      // 历史记录只验证命名空间；已完成操作的旧路径变化不阻止打开整个空间。
      for (const file of raw.files) this.#relativePath(file.path);
      this.entries.set(raw.operationId, raw);
    }
    for (const entry of [...this.entries.values()].sort((a, b) => a.createdAt - b.createdAt)) {
      if (entry.status === "prepared") await this.rollback(entry, "保存过程被中断。");
    }
  }

  #relativePath(relative: string): string {
    const absolute = path.resolve(this.root, relative);
    const within = path.relative(this.root, absolute);
    if (path.isAbsolute(relative) || !within || within.startsWith(`..${path.sep}`) || within === ".." || path.isAbsolute(within) ||
      (within.split(path.sep)[0] === ".repa" && within !== path.join(".repa", "content", "catalog.json")))
      throw new RepaFault("permission_required", "目标不属于可修改的空间内容。", { path: relative });
    return absolute;
  }
  async filePath(relative: string): Promise<string> {
    const absolute = this.#relativePath(relative);
    let parent = path.dirname(absolute);
    for (;;) {
      try {
        if (await realpath(parent) !== parent)
          throw new RepaFault("revision_conflict", "目标目录的位置已改变，请重新确认。", { path: relative });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        parent = path.dirname(parent);
      }
    }
    return absolute;
  }

  async image(relative: string, retain = true): Promise<FileImage> {
    const file = await this.filePath(relative);
    try {
      const stat = await lstat(file);
      if (stat.isSymbolicLink())
        throw new RepaFault("revision_conflict", "目标已成为符号链接，请重新确认。", { path: relative });
      const mode = stat.mode & 0o777;
      if (stat.isDirectory()) return { kind: "directory", mode };
      if (!stat.isFile()) throw new RepaFault("unsupported_content", "目标不是普通文件。", { path: relative });
      const bytes = await readFile(file);
      return { kind: "file", hash: retain ? await this.blobs.put(bytes) : digest(bytes), mode };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "absent" };
      throw error;
    }
  }

  async addParents(files: FileMutation[]): Promise<FileMutation[]> {
    const result: FileMutation[] = [];
    const included = new Set(files.map((file) => file.path));
    const parents = new Set<string>();
    for (const file of files) {
      if (file.after.kind === "absent") continue;
      let current = path.dirname(file.path);
      while (current !== "." && !included.has(current)) {
        if (current === path.join(".repa", "content")) break;
        const image = await this.image(current);
        if (image.kind === "directory") break;
        if (image.kind !== "absent") throw new RepaFault("revision_conflict", "父级位置不是目录。", { path: current });
        parents.add(current);
        current = path.dirname(current);
      }
    }
    for (const parent of [...parents].sort((a, b) => a.split(path.sep).length - b.split(path.sep).length))
      result.push({ path: parent, before: { kind: "absent" }, after: { kind: "directory", mode: 0o755 } });
    return [...result, ...files];
  }

  previous(id: string, requestHash: string): ContentChangeResult | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.requestHash !== requestHash)
      throw new RepaFault("operation_id_conflict", "相同操作标识已经用于另一项修改。", { operationId: id });
    if (entry.status === "committed") return structuredClone(entry.result);
    throw new RepaFault(entry.status === "needs_recovery" ? "recovery_required" : entry.errorCode ?? "operation_failed",
      entry.error ?? "该操作未完成。", { operationId: id, conflicts: entry.conflicts });
  }

  async commit(input: {
    operationId: string; requestHash: string; files: FileMutation[];
    affectedIds: string[]; result: ContentChangeResult;
  }): Promise<ContentChangeResult> {
    const files = await this.addParents(input.files.filter((file) => !sameImage(file.before, file.after)));
    for (const file of files)
      if (!sameImage(await this.image(file.path, false), file.before))
        throw new RepaFault("revision_conflict", "文件在保存准备期间发生变化。", { path: file.path });
    const entry: JournalEntry = {
      ...input, files, version: 1, status: "prepared", createdAt: Date.now(), conflicts: [],
    };
    await this.persist(entry);
    this.entries.set(entry.operationId, entry);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        if (!sameImage(await this.image(file.path, false), file.before))
          throw new RepaFault("revision_conflict", "文件在应用修改前发生变化。", { path: file.path });
        await this.restore(file.path, file.after, this.temporary(entry, i));
      }
      entry.status = "committed";
      await this.persist(entry);
      return structuredClone(entry.result);
    } catch (error) {
      entry.errorCode = error instanceof RepaFault ? error.code : "storage";
      await this.rollback(entry, error instanceof Error ? error.message : String(error));
      throw new RepaFault(entry.status === "needs_recovery" ? "recovery_required" : entry.errorCode,
        entry.error!, { operationId: entry.operationId, conflicts: entry.conflicts });
    }
  }

  async rollback(entry: JournalEntry, reason: string): Promise<void> {
    entry.error = reason;
    entry.conflicts = [];
    // Our completed staging files must be removed before newly-created parents can be removed.
    for (let i = 0; i < entry.files.length; i++) {
      const image = entry.files[i]!.after;
      if (image.kind !== "file") continue;
      try {
        await this.filePath(entry.files[i]!.path);
        const temp = this.temporary(entry, i);
        if (digest(await readFile(temp)) === image.hash) {
          await rm(temp);
          await syncDirectory(path.dirname(temp));
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") entry.conflicts.push(entry.files[i]!.path);
      }
    }
    for (const file of entry.files) {
      try {
        const current = await this.image(file.path, false);
        if (!sameImage(current, file.before) && !sameImage(current, file.after)) entry.conflicts.push(file.path);
      } catch { entry.conflicts.push(file.path); }
    }
    if (!entry.conflicts.length) {
      for (let i = entry.files.length - 1; i >= 0; i--) {
        const file = entry.files[i]!;
        try {
          const current = await this.image(file.path, false);
          if (!sameImage(current, file.before)) {
            if (!sameImage(current, file.after)) { entry.conflicts.push(file.path); continue; }
            await this.restore(file.path, file.before);
          }
        } catch { entry.conflicts.push(file.path); }
      }
    }
    entry.status = entry.conflicts.length ? "needs_recovery" : "rolled_back";
    await this.persist(entry);
  }

  async persist(entry: JournalEntry): Promise<void> {
    if (!Check(EntrySchema, entry)) throw new RepaFault("invalid_storage", "内容操作记录无效。");
    await writeJson(path.join(this.directory, `${entry.operationId}.json`), entry);
  }
  view(entry: JournalEntry): ContentOperation {
    return structuredClone({
      operationId: entry.operationId, status: entry.status, createdAt: entry.createdAt,
      result: entry.result, conflicts: entry.conflicts,
      ...(entry.error ? { error: entry.error } : {}),
      ...(entry.repairedBy ? { repairedBy: entry.repairedBy } : {}),
    });
  }
  private temporary(entry: JournalEntry, index: number): string {
    return path.join(path.dirname(path.join(this.root, entry.files[index]!.path)), `.repa-${entry.operationId}-${index}.tmp`);
  }
  private async restore(relative: string, image: FileImage, temporary?: string): Promise<void> {
    const file = await this.filePath(relative);
    if (image.kind === "file") await atomicWrite(file, await this.blobs.get(image.hash), image.mode, temporary);
    else if (image.kind === "directory") await mkdir(file, { mode: image.mode });
    else {
      const stat = await lstat(file).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      });
      if (stat?.isDirectory()) await rmdir(file);
      else if (stat) await rm(file);
      await syncDirectory(path.dirname(file));
    }
  }
}
