import { afterEach, describe, expect, test } from "bun:test"
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import {
  IntegrityCeilingExceededError,
  open,
  parseKey,
  type ExpectedObject,
  type Key,
  type Store,
} from "../src/representation/storage"
import { createRevisionID, StorageError } from "../src/representation/schema"

const temporary: string[] = []

afterEach(async () => {
  for (const directory of temporary.splice(0)) await rm(directory, { recursive: true, force: true })
})

describe("Gate 11 managed Representation storage", () => {
  test("publishes the exact parent buffer and excludes write, delete, and replacement through release", async () => {
    const fixture = await createStore()
    const bytes = new TextEncoder().encode('{"type":"document","text":"exact representation"}\n')
    const digest = sha256(bytes)
    const held = await fixture.store.publish(createRevisionID(), bytes, digest)
    const canonical = await findFile(fixture.directory, filename(held.key))

    expect(held.object).toMatchObject({
      platform: "windows_ntfs",
      verifierVersion: 1,
      byteLength: bytes.byteLength,
    })
    expect(held.object.volumeSerial).toMatch(/^[0-9a-f]{16}$/)
    expect(held.object.objectID).toMatch(/^[0-9a-f]{32}$/)
    await expect(writeFile(canonical, "replacement")).rejects.toThrow()
    await expect(rename(canonical, `${canonical}.moved`)).rejects.toThrow()

    const concurrentRead = await fixture.store.read(expected(held), bytes.byteLength)
    expect(concurrentRead.status).toBe("verified")
    if (concurrentRead.status === "verified") expect(concurrentRead.bytes).toEqual(bytes)

    await held.release()
    await held.release()
    expect((await fixture.store.read(expected(held), bytes.byteLength)).status).toBe("verified")
  })

  test("separates scan ceilings, absence, exact restoration, and integrity mismatch", async () => {
    const fixture = await createStore()
    const bytes = new TextEncoder().encode("bounded complete object")
    const held = await fixture.store.publish(createRevisionID(), bytes, sha256(bytes))
    const value = expected(held)
    const canonical = await findFile(fixture.directory, filename(held.key))
    const displaced = join(fixture.directory, "externally-displaced")
    await held.release()

    await expect(fixture.store.read(value, bytes.byteLength - 1)).rejects.toBeInstanceOf(IntegrityCeilingExceededError)
    await rename(canonical, displaced)
    expect((await fixture.store.read(value, bytes.byteLength)).status).toBe("missing")
    expect((await fixture.store.prepareDeletion(value, bytes.byteLength)).status).toBe("missing")
    await rename(displaced, canonical)
    expect((await fixture.store.read(value, bytes.byteLength)).status).toBe("verified")
    await writeFile(canonical, "different bytes")
    expect((await fixture.store.read(value, bytes.byteLength)).status).toBe("integrity_mismatch")
    expect((await fixture.store.prepareDeletion(value, bytes.byteLength)).status).toBe("integrity_mismatch")
    expect(await readFile(canonical, "utf8")).toBe("different bytes")

    expect(() => parseKey("../learner/source.pdf")).toThrow(StorageError)
    try {
      parseKey("../learner/source.pdf")
      throw new Error("expected opaque-key rejection")
    } catch (error) {
      expect(error).toBeInstanceOf(StorageError)
      if (error instanceof StorageError) expect(error.reason).toBe("invalid_key")
    }
  })

  test("reports a sharing conflict as operational busy rather than false absence", async () => {
    const fixture = await createStore()
    const held = await publish(fixture.store, "temporarily busy object")
    const canonical = await findFile(fixture.directory, filename(held.key))
    const fileSystem = await import("node:fs/promises")
    const externalWriter = await fileSystem.open(canonical, "r+")
    try {
      await expect(fixture.store.read(expected(held), held.byteLength)).rejects.toMatchObject({
        _tag: "Representation.StorageError",
        reason: "busy",
      })
    } finally {
      await externalWriter.close()
    }
    expect((await fixture.store.read(expected(held), held.byteLength)).status).toBe("verified")
  })

  test("does not let a replacement database at the same pathname adopt the prior managed namespace", async () => {
    const fixture = await createStore()
    const held = await publish(fixture.store, "database-scoped bytes")
    const canonical = await findFile(fixture.directory, filename(held.key))
    await rm(fixture.database)
    await writeFile(fixture.database, "replacement database fixture")
    const replacement = await open(fixture.database)

    expect(replacement.namespaceID).not.toBe(fixture.store.namespaceID)
    expect((await replacement.read(expected(held), held.byteLength)).status).toBe("missing")
    expect(await readFile(canonical, "utf8")).toBe("database-scoped bytes")
  })

  test("classifies a reparse occupant as mismatch and never traverses or cleans its target", async () => {
    const fixture = await createStore()
    const held = await publish(fixture.store, "accepted before reparse")
    const value = expected(held)
    const canonical = await findFile(fixture.directory, filename(held.key))
    await rename(canonical, join(fixture.directory, "displaced-exact-object"))
    const outside = join(fixture.directory, "outside-target")
    await mkdir(outside)
    await writeFile(join(outside, "survivor.txt"), "outside survivor")
    await symlink(outside, canonical, "junction")

    expect((await fixture.store.read(value, held.byteLength)).status).toBe("integrity_mismatch")
    expect((await fixture.store.prepareDeletion(value, held.byteLength)).status).toBe("integrity_mismatch")
    expect(
      await fixture.store.cleanup({
        now: Date.now() + 10_000,
        minimumAgeMs: 1_000,
        referencedKeys: new Set<Key>(),
        retainedDeletionKeys: new Set<Key>(),
      }),
    ).toEqual({ canonicalObjects: 0, publicationStages: 0, deletionStages: 0 })
    expect(await readFile(join(outside, "survivor.txt"), "utf8")).toBe("outside survivor")
  })

  test("uses a handle-bound deletion move and restores an uncommitted exact stage", async () => {
    const fixture = await createStore()
    const bytes = new TextEncoder().encode("recoverable deletion bytes")
    const held = await fixture.store.publish(createRevisionID(), bytes, sha256(bytes))
    const value = expected(held)
    const canonical = await findFile(fixture.directory, filename(held.key))
    await held.release()

    const prepared = await fixture.store.prepareDeletion(value, bytes.byteLength)
    expect(prepared.status).toBe("moved")
    if (prepared.status !== "moved") throw new Error("expected moved deletion stage")
    const stage = await findFile(fixture.directory, `${filename(held.key)}.delete`)
    await expect(stat(canonical)).rejects.toThrow()
    await expect(writeFile(stage, "replacement")).rejects.toThrow()
    await prepared.release()

    const fileSystem = await import("node:fs/promises")
    const externalWriter = await fileSystem.open(stage, "r+")
    try {
      await expect(fixture.store.reconcileDeletion(value, bytes.byteLength)).rejects.toMatchObject({
        _tag: "Representation.StorageError",
        reason: "unresolved_recovery",
      })
    } finally {
      await externalWriter.close()
    }

    const reconciled = await fixture.store.reconcileDeletion(value, bytes.byteLength)
    expect(reconciled.status).toBe("available")
    expect((await fixture.store.read(value, bytes.byteLength)).status).toBe("verified")
    await expect(stat(stage)).rejects.toThrow()

    await copyFile(canonical, stage)
    expect(await fixture.store.reconcileDeletion(value, bytes.byteLength)).toMatchObject({
      status: "available",
      foreignStage: false,
    })
    await expect(stat(stage)).rejects.toThrow()

    await rm(canonical)
    expect(await fixture.store.reconcileDeletion(value, bytes.byteLength)).toEqual({
      status: "externally_missing",
      foreignStage: false,
    })
  })

  test("retains an exact deletion stage when an unexpected canonical occupant wins", async () => {
    const fixture = await createStore()
    const bytes = new TextEncoder().encode("accepted deletion target")
    const held = await fixture.store.publish(createRevisionID(), bytes, sha256(bytes))
    const value = expected(held)
    const canonical = await findFile(fixture.directory, filename(held.key))
    await held.release()
    const prepared = await fixture.store.prepareDeletion(value, bytes.byteLength)
    if (prepared.status !== "moved") throw new Error("expected moved deletion stage")
    const stage = await findFile(fixture.directory, `${filename(held.key)}.delete`)
    await prepared.release()
    await writeFile(canonical, "foreign canonical occupant")

    const reconciled = await fixture.store.reconcileDeletion(value, bytes.byteLength)
    expect(reconciled).toMatchObject({ status: "integrity_mismatch", retainedExactStage: true })
    expect(await readFile(canonical, "utf8")).toBe("foreign canonical occupant")
    expect(new Uint8Array(await readFile(stage))).toEqual(bytes)
  })

  test("committed deletion cleanup removes only the exact stage and leaves a later foreign canonical object", async () => {
    const fixture = await createStore()
    const bytes = new TextEncoder().encode("terminal deletion target")
    const held = await fixture.store.publish(createRevisionID(), bytes, sha256(bytes))
    const value = expected(held)
    const canonical = await findFile(fixture.directory, filename(held.key))
    await held.release()
    const prepared = await fixture.store.prepareDeletion(value, bytes.byteLength)
    if (prepared.status !== "moved") throw new Error("expected moved deletion stage")
    const stage = await findFile(fixture.directory, `${filename(held.key)}.delete`)
    await prepared.release()
    await writeFile(canonical, "post-commit foreign occupant")

    expect(await fixture.store.cleanupCommittedDeletion(value, bytes.byteLength)).toEqual({ status: "removed" })
    await expect(stat(stage)).rejects.toThrow()
    expect(await readFile(canonical, "utf8")).toBe("post-commit foreign occupant")
    expect((await fixture.store.read(value, bytes.byteLength)).status).toBe("integrity_mismatch")
  })

  test("cleanup is scoped by database identity, installation channel, age, references, and retained recovery", async () => {
    const first = await createStore()
    const second = await createStore()
    const accepted = await publish(first.store, "accepted")
    const orphan = await publish(first.store, "orphan")
    const retained = await publish(first.store, "retained deletion")
    const reclaimable = await publish(first.store, "reclaimable deletion")
    const foreign = await publish(first.store, "replace me")
    const otherDatabase = await publish(second.store, "other database")
    const acceptedPath = await findFile(first.directory, filename(accepted.key))
    const orphanPath = await findFile(first.directory, filename(orphan.key))
    const otherPath = await findFile(second.directory, filename(otherDatabase.key))
    const foreignPath = await findFile(first.directory, filename(foreign.key))
    await writeFile(foreignPath, "foreign canonical bytes")

    const retainedPrepare = await first.store.prepareDeletion(expected(retained), retained.byteLength)
    const reclaimablePrepare = await first.store.prepareDeletion(expected(reclaimable), reclaimable.byteLength)
    if (retainedPrepare.status !== "moved" || reclaimablePrepare.status !== "moved") {
      throw new Error("expected deletion stages")
    }
    await retainedPrepare.release()
    await reclaimablePrepare.release()
    const retainedStage = await findFile(first.directory, `${filename(retained.key)}.delete`)
    const reclaimableStage = await findFile(first.directory, `${filename(reclaimable.key)}.delete`)

    const publicationDirectory = join(dirname(dirname(acceptedPath)), "..", "staging", "publication")
    const abandonedStage = join(publicationDirectory, `${filename(orphan.key)}.publishing`)
    await writeFile(abandonedStage, "partial publication")
    const learnerFile = join(first.directory, "learner-source.txt")
    await writeFile(learnerFile, "learner bytes")
    const siblingChannel = join(
      dirname(dirname(dirname(dirname(dirname(acceptedPath))))),
      "foreign-installation-channel",
    )
    const siblingSentinel = join(siblingChannel, "sentinel.txt")
    await mkdir(siblingChannel)
    await writeFile(siblingSentinel, "sibling channel bytes")

    expect(
      await first.store.cleanup({
        now: Date.now(),
        minimumAgeMs: 60_000,
        referencedKeys: new Set<Key>([accepted.key]),
        retainedDeletionKeys: new Set<Key>([retained.key]),
      }),
    ).toEqual({ canonicalObjects: 0, publicationStages: 0, deletionStages: 0 })
    expect(await readFile(orphanPath, "utf8")).toBe("orphan")
    expect(await readFile(reclaimableStage, "utf8")).toBe("reclaimable deletion")
    expect(await readFile(abandonedStage, "utf8")).toBe("partial publication")

    const result = await first.store.cleanup({
      now: Date.now() + 10_000,
      minimumAgeMs: 1_000,
      referencedKeys: new Set<Key>([accepted.key]),
      retainedDeletionKeys: new Set<Key>([retained.key]),
    })

    expect(result).toEqual({ canonicalObjects: 1, publicationStages: 1, deletionStages: 1 })
    expect(await readFile(acceptedPath, "utf8")).toBe("accepted")
    await expect(stat(orphanPath)).rejects.toThrow()
    expect(await readFile(otherPath, "utf8")).toBe("other database")
    expect(await readFile(foreignPath, "utf8")).toBe("foreign canonical bytes")
    expect(await readFile(retainedStage, "utf8")).toBe("retained deletion")
    await expect(stat(reclaimableStage)).rejects.toThrow()
    await expect(stat(abandonedStage)).rejects.toThrow()
    expect(await readFile(learnerFile, "utf8")).toBe("learner bytes")
    expect(await readFile(siblingSentinel, "utf8")).toBe("sibling channel bytes")
  })
})

async function createStore() {
  const directory = await mkdtemp(join(tmpdir(), "repa-representation-storage-"))
  temporary.push(directory)
  const database = join(directory, "repa.db")
  await writeFile(database, "admitted database fixture")
  return { directory, database, store: await open(database) }
}

async function publish(store: Store, text: string) {
  const bytes = new TextEncoder().encode(text)
  const held = await store.publish(createRevisionID(), bytes, sha256(bytes))
  await held.release()
  return held
}

function expected(input: { readonly key: Key; readonly digest: string; readonly byteLength: number }): ExpectedObject {
  return { key: input.key, digest: input.digest, byteLength: input.byteLength }
}

function filename(key: Key) {
  return basename(key.replaceAll("/", "\\"))
}

async function findFile(directory: string, name: string) {
  const paths = await Array.fromAsync(
    new Bun.Glob("**/*").scan({ cwd: directory, absolute: true, onlyFiles: true, dot: true }),
  )
  const match = paths.find((path) => basename(path) === name)
  if (!match) throw new Error(`Could not find managed fixture ${name}`)
  return match
}

function sha256(bytes: Uint8Array) {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(bytes)
  return hasher.digest("hex")
}
