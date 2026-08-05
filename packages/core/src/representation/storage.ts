export * as RepresentationStorage from "./storage"

import type { TypeObject } from "koffi"
import { randomBytes } from "node:crypto"
import { mkdir, readdir } from "node:fs/promises"
import { dirname, win32 } from "node:path"
import { InstallationChannel } from "../installation/version"
import type { RevisionID } from "./schema"
import { StorageError } from "./schema"

const keyBrand: unique symbol = Symbol("RepresentationStorage.Key")
const deletionStageKeyBrand: unique symbol = Symbol("RepresentationStorage.DeletionStageKey")

export type Key = string & { readonly [keyBrand]: true }
export type DeletionStageKey = string & { readonly [deletionStageKeyBrand]: true }

export type ExpectedObject = {
  readonly key: Key
  readonly digest: string
  readonly byteLength: number
}

export type ObjectIdentity = {
  readonly platform: "windows_ntfs"
  readonly verifierVersion: 1
  readonly volumeSerial: string
  readonly objectID: string
  readonly creationTime: string
  readonly changeTime: string
  readonly lastWriteTime: string
  readonly byteLength: number
}

export type HeldPublication = {
  readonly key: Key
  readonly digest: string
  readonly byteLength: number
  readonly object: ObjectIdentity
  readonly release: () => Promise<void>
}

export type ReadResult =
  | { readonly status: "verified"; readonly bytes: Uint8Array; readonly object: ObjectIdentity }
  | { readonly status: "missing" }
  | { readonly status: "integrity_mismatch"; readonly object?: ObjectIdentity }

export type RetainedReadResult =
  | {
      readonly status: "verified"
      readonly bytes: Uint8Array
      readonly object: ObjectIdentity
      readonly source: "canonical" | "deletion_stage"
    }
  | { readonly status: "missing"; readonly foreignDeletionStage: boolean }
  | {
      readonly status: "integrity_mismatch"
      readonly object?: ObjectIdentity
      readonly retainedExactDeletionStage: boolean
    }

export type DeletionPreparation =
  | {
      readonly status: "moved"
      readonly stageKey: DeletionStageKey
      readonly object: ObjectIdentity
      readonly release: () => Promise<void>
    }
  | { readonly status: "missing" }
  | { readonly status: "integrity_mismatch"; readonly object?: ObjectIdentity }

export type ReconciliationResult =
  | { readonly status: "available"; readonly object: ObjectIdentity; readonly foreignStage: boolean }
  | { readonly status: "externally_missing"; readonly foreignStage: boolean }
  | { readonly status: "integrity_mismatch"; readonly object?: ObjectIdentity; readonly retainedExactStage: boolean }

export type CommittedDeletionCleanup =
  | { readonly status: "removed" }
  | { readonly status: "absent" }
  | { readonly status: "foreign_stage"; readonly object?: ObjectIdentity }

export type CleanupResult = {
  readonly canonicalObjects: number
  readonly publicationStages: number
  readonly deletionStages: number
}

export class IntegrityCeilingExceededError extends Error {
  readonly requiredBytes: number
  readonly ceilingBytes: number

  constructor(requiredBytes: number, ceilingBytes: number) {
    super(
      `The complete Representation object requires ${requiredBytes} bytes but the integrity ceiling is ${ceilingBytes}`,
    )
    this.name = "RepresentationStorage.IntegrityCeilingExceededError"
    this.requiredBytes = requiredBytes
    this.ceilingBytes = ceilingBytes
  }
}

export type Store = {
  readonly namespaceID: string
  readonly publish: (revisionID: RevisionID, bytes: Uint8Array, digest: string) => Promise<HeldPublication>
  readonly read: (expected: ExpectedObject, integrityCeiling: number) => Promise<ReadResult>
  readonly readRetained: (expected: ExpectedObject, integrityCeiling: number) => Promise<RetainedReadResult>
  readonly prepareDeletion: (expected: ExpectedObject, integrityCeiling: number) => Promise<DeletionPreparation>
  readonly reconcileDeletion: (expected: ExpectedObject, integrityCeiling: number) => Promise<ReconciliationResult>
  readonly cleanupCommittedDeletion: (
    expected: ExpectedObject,
    integrityCeiling: number,
  ) => Promise<CommittedDeletionCleanup>
  readonly cleanup: (input: {
    readonly now: number
    readonly minimumAgeMs: number
    readonly referencedKeys: ReadonlySet<Key>
    readonly retainedDeletionKeys: ReadonlySet<Key>
  }) => Promise<CleanupResult>
}

type Handle = bigint
type FileIDInfo = { VolumeSerialNumber?: number | bigint; FileId?: { Identifier?: Uint8Array } }
type AttributeTagInfo = { FileAttributes?: number; ReparseTag?: number }
type BasicInfo = {
  CreationTime?: number | bigint
  LastAccessTime?: number | bigint
  LastWriteTime?: number | bigint
  ChangeTime?: number | bigint
  FileAttributes?: number
}
type StandardInfo = {
  AllocationSize?: number | bigint
  EndOfFile?: number | bigint
  NumberOfLinks?: number
  DeletePending?: number
  Directory?: number
}

type Bindings = {
  readonly koffi: (typeof import("koffi"))["default"]
  readonly fileIDInfo: TypeObject
  readonly attributeTagInfo: TypeObject
  readonly basicInfo: TypeObject
  readonly standardInfo: TypeObject
  readonly createFile: (path: string, access: number, share: number, creation: number, flags: number) => Handle
  readonly getFileID: (handle: Handle, output: FileIDInfo) => boolean
  readonly getAttributeTag: (handle: Handle, output: AttributeTagInfo) => boolean
  readonly getBasic: (handle: Handle, output: BasicInfo) => boolean
  readonly getStandard: (handle: Handle, output: StandardInfo) => boolean
  readonly getFinalPath: (handle: Handle, output: Buffer) => number
  readonly getVolumeFilesystem: (handle: Handle, output: Buffer) => boolean
  readonly readFile: (handle: Handle, output: Buffer, read: number[]) => boolean
  readonly writeFile: (handle: Handle, input: Uint8Array, written: number[]) => boolean
  readonly setEndOfFile: (handle: Handle) => boolean
  readonly setFilePointerStart: (handle: Handle) => boolean
  readonly setFileInformation: (handle: Handle, informationClass: number, input: Uint8Array) => boolean
  readonly flushFileBuffers: (handle: Handle) => boolean
  readonly moveFile: (source: string, target: string, flags: number) => boolean
  readonly closeHandle: (handle: Handle) => void
  readonly lastError: () => number
}

type Descriptor = ObjectIdentity & {
  readonly canonicalPath: string
  readonly canonicalPathKey: string
  readonly kind: "directory" | "file"
}

type Opened = { readonly handle: Handle; readonly descriptor: Descriptor }
type Directories = {
  readonly canonical: Descriptor
  readonly publication: Descriptor
  readonly deletion: Descriptor
}
type ParsedKey = {
  readonly key: Key
  readonly revisionID: string
  readonly digest: string
  readonly byteLength: number
  readonly nonce: string
  readonly filename: string
}
type Inspection =
  | { readonly status: "exact"; readonly opened: Opened; readonly bytes: Uint8Array; readonly object: ObjectIdentity }
  | { readonly status: "missing" }
  | { readonly status: "mismatch"; readonly opened?: Opened; readonly object?: ObjectIdentity }

const VERIFIER_VERSION = 1 as const
const FILE_ATTRIBUTE_DIRECTORY = 0x10
const FILE_ATTRIBUTE_REPARSE_POINT = 0x400
const FILE_READ_ATTRIBUTES = 0x80
const GENERIC_READ = 0x80000000
const GENERIC_WRITE = 0x40000000
const DELETE = 0x00010000
const FILE_SHARE_READ = 0x1
const FILE_SHARE_WRITE = 0x2
const FILE_SHARE_DELETE = 0x4
const OPEN_EXISTING = 3
const CREATE_NEW = 1
const FILE_FLAG_WRITE_THROUGH = 0x80000000
const FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000
const FILE_FLAG_BACKUP_SEMANTICS = 0x02000000
const MOVEFILE_WRITE_THROUGH = 0x8
const FILE_RENAME_INFO = 3
const FILE_DISPOSITION_INFO = 4
const INVALID_HANDLE_VALUE = 0xffffffffffffffffn
const ERROR_FILE_NOT_FOUND = 2
const ERROR_PATH_NOT_FOUND = 3
const ERROR_ACCESS_DENIED = 5
const ERROR_SHARING_VIOLATION = 32
const ERROR_FILE_EXISTS = 80
const ERROR_ALREADY_EXISTS = 183
const MAX_FINAL_PATH = 32768
const READ_CHUNK = 64 * 1024
const FILETIME_UNIX_EPOCH = 116444736000000000n
const KEY_PATTERN = /^objects\/v1\/(rep_[0-9A-Za-z]{26})\.([0-9a-f]{64})\.([0-9]{1,16})\.([0-9a-f]{32})\.rpr$/
const DELETION_STAGE_PATTERN =
  /^deletion\/v1\/(rep_[0-9A-Za-z]{26}\.[0-9a-f]{64}\.[0-9]{1,16}\.[0-9a-f]{32}\.rpr)\.delete$/

let loaded: Promise<Bindings> | undefined

export function parseKey(input: string): Key {
  return parsedKey(input, "verify").key
}

export function parseDeletionStageKey(input: string): DeletionStageKey {
  const match = DELETION_STAGE_PATTERN.exec(input)
  if (!match) throw storageError("restore", "invalid_key", "The deletion-stage key is not a Gate 11 opaque key")
  parsedKey(`objects/v1/${match[1]}`, "restore")
  return input as DeletionStageKey
}

export async function open(databaseFilename: string): Promise<Store> {
  requireBaseline(databaseFilename)
  const api = await native()
  const database = await openPath(
    api,
    requireAbsoluteDatabase(databaseFilename),
    FILE_READ_ATTRIBUTES,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    OPEN_EXISTING,
    FILE_FLAG_OPEN_REPARSE_POINT,
  ).catch((error) => {
    throw mappedError("prepare", error, "The admitted LearnerHome database could not be inspected")
  })
  try {
    if (database.descriptor.kind !== "file") {
      throw storageError("prepare", "unsupported", "Representation storage requires an ordinary filesystem database")
    }
    if ((await volumeFilesystem(api, database)).toUpperCase() !== "NTFS") {
      throw storageError(
        "prepare",
        "unsupported",
        "Representation storage requires a positively identified local NTFS volume",
      )
    }

    const namespaceID = digestText(
      [
        "repa-representation-store-v1",
        InstallationChannel,
        database.descriptor.volumeSerial,
        database.descriptor.objectID,
        database.descriptor.creationTime,
      ].join("\0"),
    )
    const directories = await prepareDirectories(database.descriptor, namespaceID)
    return {
      namespaceID,
      publish: (revisionID, bytes, digest) => publish(directories, revisionID, bytes, digest),
      read: (expected, integrityCeiling) => read(directories, expected, integrityCeiling),
      readRetained: (expected, integrityCeiling) => readRetained(directories, expected, integrityCeiling),
      prepareDeletion: (expected, integrityCeiling) => prepareDeletion(directories, expected, integrityCeiling),
      reconcileDeletion: (expected, integrityCeiling) => reconcileDeletion(directories, expected, integrityCeiling),
      cleanupCommittedDeletion: (expected, integrityCeiling) =>
        cleanupCommittedDeletion(directories, expected, integrityCeiling),
      cleanup: (input) => cleanup(directories, input),
    }
  } finally {
    api.closeHandle(database.handle)
  }
}

async function publish(
  directories: Directories,
  revisionID: RevisionID,
  input: Uint8Array,
  expectedDigest: string,
): Promise<HeldPublication> {
  requireRevisionID(revisionID, "publish")
  requireDigest(expectedDigest, "publish")
  const bytes = Uint8Array.from(input)
  if (digestBytes(bytes) !== expectedDigest) {
    throw storageError("publish", "integrity_mismatch", "The parent result buffer does not match its declared digest")
  }
  const parsed = parsedKey(
    `objects/v1/${revisionID}.${expectedDigest}.${bytes.byteLength}.${randomBytes(16).toString("hex")}.rpr`,
    "publish",
  )
  const publicationName = `${parsed.filename}.publishing`
  const api = await native()
  const canonicalDirectory = await reopenDirectory(directories.canonical, "publish")
  let publicationDirectory: Opened | undefined
  let stage: Opened | undefined
  let held: Opened | undefined
  let retainCanonicalDirectory = false
  try {
    publicationDirectory = await reopenDirectory(directories.publication, "publish")
    stage = await openChild(
      api,
      publicationDirectory,
      publicationName,
      GENERIC_WRITE | FILE_READ_ATTRIBUTES,
      FILE_SHARE_READ,
      CREATE_NEW,
      FILE_FLAG_WRITE_THROUGH,
      "publish",
    )
    if (!stage || stage.descriptor.kind !== "file") {
      throw storageError("publish", "unreadable", "The publication stage is not an ordinary file")
    }
    await writeOpened(api, stage, bytes, "publish")
    const staged = await descriptor(api, stage.handle)
    if (!sameObject(stage.descriptor, staged) || staged.byteLength !== bytes.byteLength) {
      throw storageError("publish", "identity_mismatch", "The publication stage changed while it was written")
    }
    api.closeHandle(stage.handle)
    stage = undefined

    if (
      !api.moveFile(
        nativePath(staged.canonicalPath),
        nativePath(childPath(canonicalDirectory, parsed.filename)),
        MOVEFILE_WRITE_THROUGH,
      )
    ) {
      const code = api.lastError()
      if ([ERROR_FILE_EXISTS, ERROR_ALREADY_EXISTS].includes(code)) {
        throw storageError("publish", "already_exists", "The new canonical Representation key is already occupied")
      }
      throw storageError("publish", "unreadable", `The publication rename failed with Win32 code ${code}`)
    }

    held = await openChild(
      api,
      canonicalDirectory,
      parsed.filename,
      GENERIC_READ | FILE_READ_ATTRIBUTES,
      FILE_SHARE_READ,
      OPEN_EXISTING,
      0,
      "publish",
    )
    if (!held || !samePhysicalObject(staged, held.descriptor)) {
      throw storageError(
        "publish",
        "identity_mismatch",
        "The canonical key did not reopen the publication-stage object",
      )
    }
    const verified = await verifyOpened(api, held, expected(parsed), bytes.byteLength)
    if (verified.status !== "exact") {
      throw storageError(
        "publish",
        "integrity_mismatch",
        "The canonical object differs from the captured parent buffer",
      )
    }
    let released = false
    const retainedFile = held
    const retainedDirectory = canonicalDirectory
    held = undefined
    retainCanonicalDirectory = true
    return {
      key: parsed.key,
      digest: expectedDigest,
      byteLength: bytes.byteLength,
      object: verified.object,
      release: async () => {
        if (released) return
        released = true
        api.closeHandle(retainedFile.handle)
        api.closeHandle(retainedDirectory.handle)
      },
    }
  } catch (error) {
    if (error instanceof StorageError || error instanceof IntegrityCeilingExceededError) throw error
    throw mappedError("publish", error, "Representation publication failed")
  } finally {
    if (held) api.closeHandle(held.handle)
    if (stage) api.closeHandle(stage.handle)
    if (publicationDirectory) api.closeHandle(publicationDirectory.handle)
    if (!retainCanonicalDirectory) api.closeHandle(canonicalDirectory.handle)
  }
}

async function read(
  directories: Directories,
  expectedInput: ExpectedObject,
  integrityCeiling: number,
): Promise<ReadResult> {
  const value = requireExpected(expectedInput, "read")
  requireCeiling(integrityCeiling, "read")
  if (value.byteLength > integrityCeiling) throw new IntegrityCeilingExceededError(value.byteLength, integrityCeiling)
  const api = await native()
  const directory = await reopenDirectory(directories.canonical, "read")
  try {
    const inspection = await inspectChild(
      api,
      directory,
      parsedKey(value.key, "read").filename,
      value,
      integrityCeiling,
      false,
      "read",
    )
    if (inspection.status === "missing") return { status: "missing" }
    if (inspection.status === "mismatch") {
      if (inspection.opened) api.closeHandle(inspection.opened.handle)
      return { status: "integrity_mismatch", object: inspection.object }
    }
    api.closeHandle(inspection.opened.handle)
    return { status: "verified", bytes: inspection.bytes, object: inspection.object }
  } catch (error) {
    if (error instanceof IntegrityCeilingExceededError || error instanceof StorageError) throw error
    throw mappedError("read", error, "The canonical Representation object could not be read")
  } finally {
    api.closeHandle(directory.handle)
  }
}

async function readRetained(
  directories: Directories,
  expectedInput: ExpectedObject,
  integrityCeiling: number,
): Promise<RetainedReadResult> {
  const value = requireExpected(expectedInput, "read")
  requireCeiling(integrityCeiling, "read")
  if (value.byteLength > integrityCeiling) throw new IntegrityCeilingExceededError(value.byteLength, integrityCeiling)
  const parsed = parsedKey(value.key, "read")
  const api = await native()
  const canonicalDirectory = await reopenDirectory(directories.canonical, "read")
  let deletionDirectory: Opened | undefined
  let canonical: Inspection | undefined
  let stage: Inspection | undefined
  try {
    deletionDirectory = await reopenDirectory(directories.deletion, "read")
    canonical = await inspectChild(api, canonicalDirectory, parsed.filename, value, integrityCeiling, false, "read")
    stage = await inspectChild(api, deletionDirectory, deletionFilename(parsed), value, integrityCeiling, true, "read")
    if (canonical.status === "mismatch") {
      return {
        status: "integrity_mismatch",
        object: canonical.object,
        retainedExactDeletionStage: stage.status === "exact",
      }
    }
    if (canonical.status === "exact") {
      return {
        status: "verified",
        bytes: canonical.bytes,
        object: canonical.object,
        source: "canonical",
      }
    }
    if (stage.status === "exact") {
      return {
        status: "verified",
        bytes: stage.bytes,
        object: stage.object,
        source: "deletion_stage",
      }
    }
    return { status: "missing", foreignDeletionStage: stage.status === "mismatch" }
  } catch (error) {
    if (error instanceof IntegrityCeilingExceededError || error instanceof StorageError) throw error
    throw mappedError("read", error, "The retained Representation object could not be read")
  } finally {
    closeInspection(api, canonical)
    closeInspection(api, stage)
    if (deletionDirectory) api.closeHandle(deletionDirectory.handle)
    api.closeHandle(canonicalDirectory.handle)
  }
}

async function prepareDeletion(
  directories: Directories,
  expectedInput: ExpectedObject,
  integrityCeiling: number,
): Promise<DeletionPreparation> {
  const value = requireExpected(expectedInput, "delete")
  requireCeiling(integrityCeiling, "delete")
  if (value.byteLength > integrityCeiling) throw new IntegrityCeilingExceededError(value.byteLength, integrityCeiling)
  const parsed = parsedKey(value.key, "delete")
  const api = await native()
  const canonicalDirectory = await reopenDirectory(directories.canonical, "delete")
  let deletionDirectory: Opened | undefined
  let inspection: Inspection | undefined
  let retainHandles = false
  try {
    deletionDirectory = await reopenDirectory(directories.deletion, "delete")
    const occupiedStage = await openChild(
      api,
      deletionDirectory,
      deletionFilename(parsed),
      FILE_READ_ATTRIBUTES,
      FILE_SHARE_READ,
      OPEN_EXISTING,
      0,
      "delete",
      true,
    )
    if (occupiedStage) {
      api.closeHandle(occupiedStage.handle)
      throw storageError(
        "delete",
        "unresolved_recovery",
        "A prior deletion stage exists and must be reconciled before a new deletion prepare",
      )
    }

    inspection = await inspectChild(api, canonicalDirectory, parsed.filename, value, integrityCeiling, true, "delete")
    if (inspection.status === "missing") return { status: "missing" }
    if (inspection.status === "mismatch") {
      const object = inspection.object
      if (inspection.opened) api.closeHandle(inspection.opened.handle)
      inspection = undefined
      return { status: "integrity_mismatch", object }
    }
    const retainedFile = inspection.opened
    renameOpened(api, retainedFile, childPath(deletionDirectory, deletionFilename(parsed)), "delete")
    const moved = await descriptor(api, retainedFile.handle)
    if (!samePhysicalObject(retainedFile.descriptor, moved) || !isDirectChild(deletionDirectory, moved)) {
      throw storageError(
        "delete",
        "identity_mismatch",
        "The verified object did not remain the same deletion-stage object",
      )
    }
    inspection = undefined
    let released = false
    const retainedCanonicalDirectory = canonicalDirectory
    const retainedDeletionDirectory = deletionDirectory
    retainHandles = true
    return {
      status: "moved",
      stageKey: `deletion/v1/${deletionFilename(parsed)}` as DeletionStageKey,
      object: toObject(moved),
      release: async () => {
        if (released) return
        released = true
        api.closeHandle(retainedFile.handle)
        api.closeHandle(retainedDeletionDirectory.handle)
        api.closeHandle(retainedCanonicalDirectory.handle)
      },
    }
  } catch (error) {
    if (error instanceof StorageError || error instanceof IntegrityCeilingExceededError) throw error
    throw mappedError("delete", error, "Representation deletion prepare failed")
  } finally {
    if (inspection?.status === "exact" || inspection?.status === "mismatch") {
      if (inspection.opened) api.closeHandle(inspection.opened.handle)
    }
    if (!retainHandles && deletionDirectory) api.closeHandle(deletionDirectory.handle)
    if (!retainHandles) api.closeHandle(canonicalDirectory.handle)
  }
}

async function reconcileDeletion(
  directories: Directories,
  expectedInput: ExpectedObject,
  integrityCeiling: number,
): Promise<ReconciliationResult> {
  const value = requireExpected(expectedInput, "restore")
  requireCeiling(integrityCeiling, "restore")
  if (value.byteLength > integrityCeiling) throw new IntegrityCeilingExceededError(value.byteLength, integrityCeiling)
  const parsed = parsedKey(value.key, "restore")
  const api = await native()
  const canonicalDirectory = await reopenDirectory(directories.canonical, "restore")
  let deletionDirectory: Opened | undefined
  let canonical: Inspection | undefined
  let stage: Inspection | undefined
  try {
    deletionDirectory = await reopenDirectory(directories.deletion, "restore")
    canonical = await inspectChild(api, canonicalDirectory, parsed.filename, value, integrityCeiling, false, "restore")
    stage = await inspectChild(
      api,
      deletionDirectory,
      deletionFilename(parsed),
      value,
      integrityCeiling,
      true,
      "restore",
    )

    if (canonical.status === "mismatch") {
      return {
        status: "integrity_mismatch",
        object: canonical.object,
        retainedExactStage: stage.status === "exact",
      }
    }
    if (canonical.status === "exact") {
      if (stage.status === "exact") {
        deleteOpened(api, stage.opened, "restore")
        api.closeHandle(stage.opened.handle)
        stage = undefined
      }
      return {
        status: "available",
        object: canonical.object,
        foreignStage: stage?.status === "mismatch",
      }
    }
    if (stage.status === "missing") return { status: "externally_missing", foreignStage: false }
    if (stage.status === "mismatch") return { status: "externally_missing", foreignStage: true }

    const staged = stage.opened
    renameOpened(api, staged, childPath(canonicalDirectory, parsed.filename), "restore")
    const moved = await descriptor(api, staged.handle)
    if (!samePhysicalObject(staged.descriptor, moved) || !isDirectChild(canonicalDirectory, moved)) {
      throw storageError(
        "restore",
        "unresolved_recovery",
        "The deletion stage did not become the same canonical object",
      )
    }
    stage = { ...stage, opened: { handle: staged.handle, descriptor: moved } }
    const restored = await verifyOpened(api, stage.opened, value, integrityCeiling)
    if (restored.status !== "exact") {
      throw storageError(
        "restore",
        "unresolved_recovery",
        "The deletion stage could not be reverified at the canonical key",
      )
    }
    return { status: "available", object: restored.object, foreignStage: false }
  } catch (error) {
    if (error instanceof IntegrityCeilingExceededError) throw error
    if (error instanceof StorageError && error.reason === "unresolved_recovery") throw error
    throw storageError(
      "restore",
      "unresolved_recovery",
      `Deletion reconciliation could not prove a safe state${errorCodeSuffix(error)}`,
    )
  } finally {
    closeInspection(api, canonical)
    closeInspection(api, stage)
    if (deletionDirectory) api.closeHandle(deletionDirectory.handle)
    api.closeHandle(canonicalDirectory.handle)
  }
}

async function cleanupCommittedDeletion(
  directories: Directories,
  expectedInput: ExpectedObject,
  integrityCeiling: number,
): Promise<CommittedDeletionCleanup> {
  const value = requireExpected(expectedInput, "cleanup")
  requireCeiling(integrityCeiling, "cleanup")
  if (value.byteLength > integrityCeiling) throw new IntegrityCeilingExceededError(value.byteLength, integrityCeiling)
  const parsed = parsedKey(value.key, "cleanup")
  const api = await native()
  const directory = await reopenDirectory(directories.deletion, "cleanup")
  let stage: Inspection | undefined
  try {
    stage = await inspectChild(api, directory, deletionFilename(parsed), value, integrityCeiling, true, "cleanup")
    if (stage.status === "missing") return { status: "absent" }
    if (stage.status === "mismatch") return { status: "foreign_stage", object: stage.object }
    deleteOpened(api, stage.opened, "cleanup")
    api.closeHandle(stage.opened.handle)
    stage = undefined
    return { status: "removed" }
  } catch (error) {
    if (error instanceof IntegrityCeilingExceededError || error instanceof StorageError) throw error
    throw mappedError("cleanup", error, "The committed deletion stage could not be cleaned")
  } finally {
    closeInspection(api, stage)
    api.closeHandle(directory.handle)
  }
}

async function cleanup(
  directories: Directories,
  input: {
    readonly now: number
    readonly minimumAgeMs: number
    readonly referencedKeys: ReadonlySet<Key>
    readonly retainedDeletionKeys: ReadonlySet<Key>
  },
): Promise<CleanupResult> {
  requireCleanupInput(input)
  const canonicalObjects = await cleanupCanonical(directories.canonical, input)
  const publicationStages = await cleanupPublicationStages(directories.publication, input)
  const deletionStages = await cleanupDeletionStages(directories.deletion, input)
  return { canonicalObjects, publicationStages, deletionStages }
}

async function cleanupCanonical(
  descriptor: Descriptor,
  input: {
    readonly now: number
    readonly minimumAgeMs: number
    readonly referencedKeys: ReadonlySet<Key>
  },
) {
  const api = await native()
  const directory = await reopenDirectory(descriptor, "cleanup")
  let removed = 0
  try {
    for (const name of await names(directory, "cleanup")) {
      const key = candidateKey(name)
      if (!key || input.referencedKeys.has(key.key)) continue
      const expectedObject = expected(key)
      const inspection = await inspectChild(
        api,
        directory,
        name,
        expectedObject,
        expectedObject.byteLength,
        true,
        "cleanup",
      )
      try {
        if (inspection.status !== "exact" || !oldEnough(inspection.object, input)) continue
        deleteOpened(api, inspection.opened, "cleanup")
        removed++
      } finally {
        closeInspection(api, inspection)
      }
    }
    return removed
  } finally {
    api.closeHandle(directory.handle)
  }
}

async function cleanupPublicationStages(
  descriptor: Descriptor,
  input: { readonly now: number; readonly minimumAgeMs: number },
) {
  const api = await native()
  const directory = await reopenDirectory(descriptor, "cleanup")
  let removed = 0
  try {
    for (const name of await names(directory, "cleanup")) {
      if (!name.endsWith(".publishing")) continue
      const key = candidateKey(name.slice(0, -".publishing".length))
      if (!key) continue
      const opened = await openChild(
        api,
        directory,
        name,
        GENERIC_READ | DELETE | FILE_READ_ATTRIBUTES,
        FILE_SHARE_READ,
        OPEN_EXISTING,
        0,
        "cleanup",
        true,
      ).catch((error) => {
        if (error instanceof NativeFault && error.reason === "unverifiable") return undefined
        throw error
      })
      if (!opened) continue
      try {
        if (opened.descriptor.kind !== "file" || !oldEnough(toObject(opened.descriptor), input)) continue
        deleteOpened(api, opened, "cleanup")
        removed++
      } finally {
        api.closeHandle(opened.handle)
      }
    }
    return removed
  } finally {
    api.closeHandle(directory.handle)
  }
}

async function cleanupDeletionStages(
  descriptor: Descriptor,
  input: {
    readonly now: number
    readonly minimumAgeMs: number
    readonly retainedDeletionKeys: ReadonlySet<Key>
  },
) {
  const api = await native()
  const directory = await reopenDirectory(descriptor, "cleanup")
  let removed = 0
  try {
    for (const name of await names(directory, "cleanup")) {
      if (!name.endsWith(".delete")) continue
      const key = candidateKey(name.slice(0, -".delete".length))
      if (!key || input.retainedDeletionKeys.has(key.key)) continue
      const expectedObject = expected(key)
      const inspection = await inspectChild(
        api,
        directory,
        name,
        expectedObject,
        expectedObject.byteLength,
        true,
        "cleanup",
      )
      try {
        if (inspection.status !== "exact" || !oldEnough(inspection.object, input)) continue
        deleteOpened(api, inspection.opened, "cleanup")
        removed++
      } finally {
        closeInspection(api, inspection)
      }
    }
    return removed
  } finally {
    api.closeHandle(directory.handle)
  }
}

async function prepareDirectories(database: Descriptor, namespaceID: string): Promise<Directories> {
  const base = database.canonicalPath
  const parentPath = dirname(base)
  const parent = await openDirectoryPath(parentPath, "prepare")
  const managed: Opened[] = []
  try {
    if (parent.descriptor.volumeSerial !== database.volumeSerial) {
      throw storageError("prepare", "unsupported", "The managed namespace is not on the database's NTFS volume")
    }
    const channel = digestText(InstallationChannel).slice(0, 24)
    const root = await ensureDirectory(parent, ".repa-managed", "prepare")
    managed.push(root)
    const version = await ensureDirectory(root, "representations-v1", "prepare")
    managed.push(version)
    const installation = await ensureDirectory(version, channel, "prepare")
    managed.push(installation)
    const databaseRoot = await ensureDirectory(installation, namespaceID, "prepare")
    managed.push(databaseRoot)
    const objects = await ensureDirectory(databaseRoot, "objects", "prepare")
    managed.push(objects)
    const objectsVersion = await ensureDirectory(objects, "v1", "prepare")
    managed.push(objectsVersion)
    const staging = await ensureDirectory(databaseRoot, "staging", "prepare")
    managed.push(staging)
    const publication = await ensureDirectory(staging, "publication", "prepare")
    managed.push(publication)
    const deletion = await ensureDirectory(staging, "deletion", "prepare")
    managed.push(deletion)
    return {
      canonical: objectsVersion.descriptor,
      publication: publication.descriptor,
      deletion: deletion.descriptor,
    }
  } finally {
    const api = await native()
    for (const opened of managed.toReversed()) api.closeHandle(opened.handle)
    api.closeHandle(parent.handle)
  }
}

async function ensureDirectory(parent: Opened, name: string, operation: StorageError["operation"]) {
  const target = childPath(parent, name)
  await mkdir(target).catch((error) => {
    if (errorCode(error) === "EEXIST") return
    throw mappedError(operation, error, "The managed Representation directory could not be created")
  })
  const opened = await openDirectoryPath(target, operation)
  if (!isDirectChild(parent, opened.descriptor) || opened.descriptor.volumeSerial !== parent.descriptor.volumeSerial) {
    ;(await native()).closeHandle(opened.handle)
    throw storageError(operation, "identity_mismatch", "A managed directory escaped its verified NTFS parent")
  }
  return opened
}

async function openDirectoryPath(path: string, operation: StorageError["operation"]) {
  const api = await native()
  const opened = await openPath(
    api,
    path,
    FILE_READ_ATTRIBUTES,
    FILE_SHARE_READ | FILE_SHARE_WRITE,
    OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
  ).catch((error) => {
    throw mappedError(operation, error, "The managed Representation directory could not be opened")
  })
  if (opened.descriptor.kind !== "directory") {
    api.closeHandle(opened.handle)
    throw storageError(operation, "identity_mismatch", "A managed Representation path is not a directory")
  }
  return opened
}

async function reopenDirectory(expected: Descriptor, operation: StorageError["operation"]) {
  const opened = await openDirectoryPath(expected.canonicalPath, operation)
  if (!sameObject(expected, opened.descriptor)) {
    ;(await native()).closeHandle(opened.handle)
    throw storageError(operation, "identity_mismatch", "The managed Representation directory identity changed")
  }
  return opened
}

async function inspectChild(
  api: Bindings,
  directory: Opened,
  name: string,
  expectedObject: ExpectedObject,
  integrityCeiling: number,
  deleteAccess: boolean,
  operation: StorageError["operation"],
): Promise<Inspection> {
  let opened: Opened | undefined
  try {
    opened = await openChild(
      api,
      directory,
      name,
      GENERIC_READ | FILE_READ_ATTRIBUTES | (deleteAccess ? DELETE : 0),
      FILE_SHARE_READ,
      OPEN_EXISTING,
      0,
      operation,
      true,
    )
    if (!opened) return { status: "missing" }
    if (opened.descriptor.kind !== "file") {
      return { status: "mismatch", opened, object: toObject(opened.descriptor) }
    }
    const verified = await verifyOpened(api, opened, expectedObject, integrityCeiling)
    if (verified.status === "mismatch") return { status: "mismatch", opened, object: verified.object }
    return { status: "exact", opened, bytes: verified.bytes, object: verified.object }
  } catch (error) {
    if (error instanceof NativeFault && error.reason === "unverifiable") {
      if (opened) api.closeHandle(opened.handle)
      return { status: "mismatch" }
    }
    if (opened) api.closeHandle(opened.handle)
    throw error
  }
}

async function verifyOpened(
  api: Bindings,
  opened: Opened,
  expectedObject: ExpectedObject,
  integrityCeiling: number,
): Promise<
  | { readonly status: "exact"; readonly bytes: Uint8Array; readonly object: ObjectIdentity }
  | { readonly status: "mismatch"; readonly object: ObjectIdentity }
> {
  if (expectedObject.byteLength > integrityCeiling) {
    throw new IntegrityCeilingExceededError(expectedObject.byteLength, integrityCeiling)
  }
  if (opened.descriptor.byteLength !== expectedObject.byteLength) {
    return { status: "mismatch", object: toObject(opened.descriptor) }
  }
  const before = await descriptor(api, opened.handle)
  const bytes = await readOpened(api, opened, integrityCeiling)
  const after = await descriptor(api, opened.handle)
  if (!sameStableObject(before, after) || bytes.byteLength !== expectedObject.byteLength) {
    return { status: "mismatch", object: toObject(after) }
  }
  if (digestBytes(bytes) !== expectedObject.digest) return { status: "mismatch", object: toObject(after) }
  return { status: "exact", bytes, object: toObject(after) }
}

async function openChild(
  api: Bindings,
  directory: Opened,
  name: string,
  access: number,
  share: number,
  creation: number,
  flags: number,
  operation: StorageError["operation"],
  allowMissing = false,
) {
  requireComponent(name, operation)
  try {
    const opened = await openPath(
      api,
      childPath(directory, name),
      access,
      share,
      creation,
      flags | FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS,
    )
    if (
      !isDirectChild(directory, opened.descriptor) ||
      opened.descriptor.volumeSerial !== directory.descriptor.volumeSerial
    ) {
      api.closeHandle(opened.handle)
      throw new NativeFault("unverifiable", 0)
    }
    return opened
  } catch (error) {
    if (
      allowMissing &&
      error instanceof NativeFault &&
      error.reason === "open" &&
      [ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND].includes(error.code)
    ) {
      return undefined
    }
    if (error instanceof NativeFault && error.reason === "unverifiable") throw error
    throw mappedError(operation, error, "The managed Representation object could not be opened")
  }
}

async function openPath(
  api: Bindings,
  path: string,
  access: number,
  share: number,
  creation: number,
  flags: number,
): Promise<Opened> {
  const handle = api.createFile(nativePath(path), access >>> 0, share, creation, flags >>> 0)
  if (BigInt.asUintN(64, handle) === INVALID_HANDLE_VALUE) throw new NativeFault("open", api.lastError())
  try {
    return { handle, descriptor: await descriptor(api, handle) }
  } catch (error) {
    api.closeHandle(handle)
    throw error
  }
}

async function descriptor(api: Bindings, handle: Handle): Promise<Descriptor> {
  const id: FileIDInfo = {}
  const tag: AttributeTagInfo = {}
  const basic: BasicInfo = {}
  const standard: StandardInfo = {}
  if (
    !api.getFileID(handle, id) ||
    !api.getAttributeTag(handle, tag) ||
    !api.getBasic(handle, basic) ||
    !api.getStandard(handle, standard)
  ) {
    throw new NativeFault("metadata", api.lastError())
  }
  if ((tag.FileAttributes ?? 0) & FILE_ATTRIBUTE_REPARSE_POINT) throw new NativeFault("unverifiable", 0)
  if (standard.DeletePending) throw new NativeFault("unverifiable", 0)
  const canonicalPath = await finalPath(api, handle)
  const identifier = id.FileId?.Identifier
  if (!identifier || identifier.byteLength !== 16 || id.VolumeSerialNumber === undefined) {
    throw new NativeFault("metadata", api.lastError())
  }
  const byteLength = Number(toBigInt(standard.EndOfFile))
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) throw new NativeFault("metadata", 0)
  return {
    platform: "windows_ntfs",
    verifierVersion: VERIFIER_VERSION,
    canonicalPath,
    canonicalPathKey: canonicalPath.toLowerCase(),
    volumeSerial: toBigInt(id.VolumeSerialNumber).toString(16).padStart(16, "0"),
    objectID: Buffer.from(identifier).toString("hex"),
    creationTime: toBigInt(basic.CreationTime).toString(),
    changeTime: toBigInt(basic.ChangeTime).toString(),
    lastWriteTime: toBigInt(basic.LastWriteTime).toString(),
    byteLength,
    kind: (tag.FileAttributes ?? basic.FileAttributes ?? 0) & FILE_ATTRIBUTE_DIRECTORY ? "directory" : "file",
  }
}

async function finalPath(api: Bindings, handle: Handle) {
  const output = Buffer.alloc(MAX_FINAL_PATH * 2)
  const length = api.getFinalPath(handle, output)
  if (length === 0 || length >= MAX_FINAL_PATH) throw new NativeFault("metadata", api.lastError())
  const value = output.toString("utf16le", 0, length * 2)
  if (!value.startsWith("\\\\?\\") || value.startsWith("\\\\?\\UNC\\")) throw new NativeFault("unverifiable", 0)
  return win32.normalize(value.slice(4))
}

async function volumeFilesystem(api: Bindings, opened: Opened) {
  const output = Buffer.alloc(64 * 2)
  if (!api.getVolumeFilesystem(opened.handle, output)) throw new NativeFault("metadata", api.lastError())
  return output.toString("utf16le").replace(/\0.*$/s, "")
}

async function writeOpened(api: Bindings, opened: Opened, bytes: Uint8Array, operation: StorageError["operation"]) {
  let offset = 0
  while (offset < bytes.byteLength) {
    const chunk = bytes.subarray(offset, Math.min(offset + READ_CHUNK, bytes.byteLength))
    const written = [0]
    if (!api.writeFile(opened.handle, chunk, written) || written[0] !== chunk.byteLength) {
      throw storageError(operation, "unreadable", `Win32 could not write the publication stage (${api.lastError()})`)
    }
    offset += written[0]!
  }
  if (!api.setEndOfFile(opened.handle) || !api.flushFileBuffers(opened.handle)) {
    throw storageError(
      operation,
      "unreadable",
      `Win32 could not durably flush the publication stage (${api.lastError()})`,
    )
  }
}

async function readOpened(api: Bindings, opened: Opened, ceiling: number) {
  if (!api.setFilePointerStart(opened.handle)) throw new NativeFault("read", api.lastError())
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const output = Buffer.alloc(Math.min(READ_CHUNK, Math.max(1, ceiling - total + 1)))
    const read = [0]
    if (!api.readFile(opened.handle, output, read)) throw new NativeFault("read", api.lastError())
    if (read[0] === 0) break
    total += read[0]!
    if (total > ceiling) throw new IntegrityCeilingExceededError(total, ceiling)
    chunks.push(output.subarray(0, read[0]))
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function renameOpened(api: Bindings, opened: Opened, target: string, operation: StorageError["operation"]) {
  const name = Buffer.from(`${target}\0`, "utf16le")
  const input = Buffer.alloc(20 + name.byteLength)
  input.writeUInt8(0, 0)
  input.writeBigUInt64LE(0n, 8)
  input.writeUInt32LE(name.byteLength - 2, 16)
  name.copy(input, 20)
  if (!api.setFileInformation(opened.handle, FILE_RENAME_INFO, input)) {
    const code = api.lastError()
    const reason = [ERROR_FILE_EXISTS, ERROR_ALREADY_EXISTS].includes(code) ? "already_exists" : "unresolved_recovery"
    throw storageError(operation, reason, `The handle-bound NTFS rename failed with Win32 code ${code}`)
  }
}

function deleteOpened(api: Bindings, opened: Opened, operation: StorageError["operation"]) {
  if (!api.setFileInformation(opened.handle, FILE_DISPOSITION_INFO, Uint8Array.of(1))) {
    throw storageError(
      operation,
      "unreadable",
      `The handle-bound NTFS deletion failed with Win32 code ${api.lastError()}`,
    )
  }
}

function closeInspection(api: Bindings, inspection: Inspection | undefined) {
  if (inspection?.status === "exact" || inspection?.status === "mismatch") {
    if (inspection.opened) api.closeHandle(inspection.opened.handle)
  }
}

async function names(directory: Opened, operation: StorageError["operation"]) {
  try {
    return (await readdir(directory.descriptor.canonicalPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile() || entry.isSymbolicLink() || entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, "en"))
  } catch (error) {
    throw mappedError(operation, error, "The managed Representation namespace could not be enumerated")
  }
}

function parsedKey(input: string, operation: StorageError["operation"]): ParsedKey {
  const match = KEY_PATTERN.exec(input)
  if (!match) throw storageError(operation, "invalid_key", "The storage key is not a Gate 11 opaque key")
  const byteLength = Number(match[3])
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw storageError(operation, "invalid_key", "The storage key contains an invalid byte length")
  }
  return {
    key: input as Key,
    revisionID: match[1]!,
    digest: match[2]!,
    byteLength,
    nonce: match[4]!,
    filename: input.slice("objects/v1/".length),
  }
}

function candidateKey(filename: string) {
  try {
    return parsedKey(`objects/v1/${filename}`, "cleanup")
  } catch (error) {
    if (error instanceof StorageError && error.reason === "invalid_key") return undefined
    throw error
  }
}

function expected(parsed: ParsedKey): ExpectedObject {
  return { key: parsed.key, digest: parsed.digest, byteLength: parsed.byteLength }
}

function requireExpected(input: ExpectedObject, operation: StorageError["operation"]) {
  const parsed = parsedKey(input.key, operation)
  requireDigest(input.digest, operation)
  if (!Number.isSafeInteger(input.byteLength) || input.byteLength < 0) {
    throw storageError(operation, "invalid_key", "The expected object length is invalid")
  }
  if (parsed.digest !== input.digest || parsed.byteLength !== input.byteLength) {
    throw storageError(operation, "invalid_key", "The expected descriptor does not match its opaque storage key")
  }
  return input
}

function requireRevisionID(input: string, operation: StorageError["operation"]) {
  if (!/^rep_[0-9A-Za-z]{26}$/.test(input)) {
    throw storageError(operation, "invalid_key", "The Representation Revision ID is invalid")
  }
}

function requireDigest(input: string, operation: StorageError["operation"]) {
  if (!/^[0-9a-f]{64}$/.test(input)) {
    throw storageError(operation, "invalid_key", "The SHA-256 digest is invalid")
  }
}

function requireCeiling(input: number, operation: StorageError["operation"]) {
  if (!Number.isSafeInteger(input) || input < 0) {
    throw storageError(operation, "unreadable", "The integrity ceiling must be a non-negative safe integer")
  }
}

function requireCleanupInput(input: {
  readonly now: number
  readonly minimumAgeMs: number
  readonly referencedKeys: ReadonlySet<Key>
  readonly retainedDeletionKeys: ReadonlySet<Key>
}) {
  if (
    !Number.isSafeInteger(input.now) ||
    input.now < 0 ||
    !Number.isSafeInteger(input.minimumAgeMs) ||
    input.minimumAgeMs < 0
  ) {
    throw storageError("cleanup", "unreadable", "Cleanup time and age guard must be non-negative safe integers")
  }
  for (const key of [...input.referencedKeys, ...input.retainedDeletionKeys]) parsedKey(key, "cleanup")
}

function requireComponent(input: string, operation: StorageError["operation"]) {
  if (!input || input === "." || input === ".." || /[\\/:<>"|?*\u0000-\u001f]/.test(input) || /[ .]$/.test(input)) {
    throw storageError(operation, "invalid_key", "The managed object name is invalid")
  }
}

function requireBaseline(input: string) {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw storageError(
      "prepare",
      "unsupported",
      `Gate 11 managed Representation storage currently supports only Windows x64 NTFS, not ${process.platform}/${process.arch}`,
    )
  }
  if (input === ":memory:") {
    throw storageError("prepare", "unsupported", "In-memory databases do not have a managed Representation namespace")
  }
}

function requireAbsoluteDatabase(input: string) {
  if (input.includes("\0") || input.startsWith("\\\\") || input.startsWith("\\\\?\\") || !win32.isAbsolute(input)) {
    throw storageError(
      "prepare",
      "unsupported",
      "Representation storage requires an admitted local absolute database path",
    )
  }
  return win32.normalize(input)
}

function deletionFilename(parsed: ParsedKey) {
  return `${parsed.filename}.delete`
}

function childPath(parent: Opened, name: string) {
  return win32.join(parent.descriptor.canonicalPath, name)
}

function isDirectChild(parent: Opened, child: Descriptor) {
  return win32.dirname(child.canonicalPath).toLowerCase() === parent.descriptor.canonicalPathKey
}

function sameObject(left: Descriptor, right: Descriptor) {
  return samePhysicalObject(left, right) && left.canonicalPathKey === right.canonicalPathKey
}

function samePhysicalObject(left: Descriptor, right: Descriptor) {
  return (
    left.platform === right.platform &&
    left.verifierVersion === right.verifierVersion &&
    left.volumeSerial === right.volumeSerial &&
    left.objectID === right.objectID &&
    left.creationTime === right.creationTime &&
    left.kind === right.kind
  )
}

function sameStableObject(left: Descriptor, right: Descriptor) {
  return (
    samePhysicalObject(left, right) &&
    left.canonicalPathKey === right.canonicalPathKey &&
    left.changeTime === right.changeTime &&
    left.lastWriteTime === right.lastWriteTime &&
    left.byteLength === right.byteLength
  )
}

function toObject(input: Descriptor): ObjectIdentity {
  return {
    platform: input.platform,
    verifierVersion: input.verifierVersion,
    volumeSerial: input.volumeSerial,
    objectID: input.objectID,
    creationTime: input.creationTime,
    changeTime: input.changeTime,
    lastWriteTime: input.lastWriteTime,
    byteLength: input.byteLength,
  }
}

function oldEnough(object: ObjectIdentity, input: { readonly now: number; readonly minimumAgeMs: number }) {
  const observed = Number((BigInt(object.lastWriteTime) - FILETIME_UNIX_EPOCH) / 10000n)
  return Number.isSafeInteger(observed) && input.now - observed >= input.minimumAgeMs
}

function digestBytes(input: Uint8Array) {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(input)
  return hasher.digest("hex")
}

function digestText(input: string) {
  return digestBytes(new TextEncoder().encode(input))
}

function nativePath(input: string) {
  return `\\\\?\\${input}`
}

function toBigInt(input: number | bigint | undefined) {
  if (input === undefined) return 0n
  return BigInt(input)
}

async function native() {
  loaded ??= loadBindings()
  return loaded
}

async function loadBindings(): Promise<Bindings> {
  const runtime = process as typeof process & { resourcesPath?: string }
  const resourcesPath = runtime.resourcesPath
  runtime.resourcesPath ??= dirname(process.execPath)
  const koffiModule = await import("koffi").finally(() => {
    if (resourcesPath === undefined) delete runtime.resourcesPath
  })
  const koffi = koffiModule.default
  const kernel = koffi.load("kernel32.dll")
  const handle = koffi.pointer("REPA_REPRESENTATION_HANDLE", koffi.opaque())
  const fileID128 = koffi.struct("REPA_REPRESENTATION_FILE_ID_128", {
    Identifier: koffi.array("uint8_t", 16, "Typed"),
  })
  const fileIDInfo = koffi.struct("REPA_REPRESENTATION_FILE_ID_INFO", {
    VolumeSerialNumber: "uint64_t",
    FileId: fileID128,
  })
  const attributeTagInfo = koffi.struct("REPA_REPRESENTATION_ATTRIBUTE_TAG_INFO", {
    FileAttributes: "uint32_t",
    ReparseTag: "uint32_t",
  })
  const basicInfo = koffi.struct("REPA_REPRESENTATION_BASIC_INFO", {
    CreationTime: "int64_t",
    LastAccessTime: "int64_t",
    LastWriteTime: "int64_t",
    ChangeTime: "int64_t",
    FileAttributes: "uint32_t",
  })
  const standardInfo = koffi.struct("REPA_REPRESENTATION_STANDARD_INFO", {
    AllocationSize: "int64_t",
    EndOfFile: "int64_t",
    NumberOfLinks: "uint32_t",
    DeletePending: "uint8_t",
    Directory: "uint8_t",
  })
  const create = kernel.func(
    "REPA_REPRESENTATION_HANDLE __stdcall CreateFileW(const char16_t *path, uint32_t access, uint32_t share, void *security, uint32_t creation, uint32_t flags, REPA_REPRESENTATION_HANDLE templateFile)",
  )
  const info = (type: TypeObject) =>
    kernel.func("__stdcall", "GetFileInformationByHandleEx", "bool", [
      handle,
      "int",
      koffi.out(koffi.pointer(type)),
      "uint32_t",
    ])
  const getFileIDRaw = info(fileIDInfo)
  const getAttributeTagRaw = info(attributeTagInfo)
  const getBasicRaw = info(basicInfo)
  const getStandardRaw = info(standardInfo)
  const getFinalRaw = kernel.func(
    "uint32_t __stdcall GetFinalPathNameByHandleW(REPA_REPRESENTATION_HANDLE file, _Out_ char16_t *path, uint32_t length, uint32_t flags)",
  )
  const getVolumeRaw = kernel.func(
    "bool __stdcall GetVolumeInformationByHandleW(REPA_REPRESENTATION_HANDLE file, void *volumeName, uint32_t volumeNameLength, void *serial, void *maxComponent, void *flags, _Out_ char16_t *filesystemName, uint32_t filesystemNameLength)",
  )
  const readRaw = kernel.func(
    "bool __stdcall ReadFile(REPA_REPRESENTATION_HANDLE file, _Out_ uint8_t *buffer, uint32_t length, _Out_ uint32_t *read, void *overlapped)",
  )
  const writeRaw = kernel.func(
    "bool __stdcall WriteFile(REPA_REPRESENTATION_HANDLE file, const uint8_t *buffer, uint32_t length, _Out_ uint32_t *written, void *overlapped)",
  )
  const setEndRaw = kernel.func("bool __stdcall SetEndOfFile(REPA_REPRESENTATION_HANDLE file)")
  const setPointerRaw = kernel.func(
    "bool __stdcall SetFilePointerEx(REPA_REPRESENTATION_HANDLE file, int64_t distance, void *newPointer, uint32_t method)",
  )
  const setInformationRaw = kernel.func(
    "bool __stdcall SetFileInformationByHandle(REPA_REPRESENTATION_HANDLE file, int informationClass, const uint8_t *input, uint32_t length)",
  )
  const flushRaw = kernel.func("bool __stdcall FlushFileBuffers(REPA_REPRESENTATION_HANDLE file)")
  const moveRaw = kernel.func(
    "bool __stdcall MoveFileExW(const char16_t *source, const char16_t *target, uint32_t flags)",
  )
  const closeRaw = kernel.func("bool __stdcall CloseHandle(REPA_REPRESENTATION_HANDLE file)")
  const lastErrorRaw = kernel.func("uint32_t __stdcall GetLastError()")
  return {
    koffi,
    fileIDInfo,
    attributeTagInfo,
    basicInfo,
    standardInfo,
    createFile(path, access, share, creation, flags) {
      return BigInt(create(path, access, share, null, creation, flags, null))
    },
    getFileID(handleValue, output) {
      return Boolean(getFileIDRaw(handleValue, 18, output, koffi.sizeof(fileIDInfo)))
    },
    getAttributeTag(handleValue, output) {
      return Boolean(getAttributeTagRaw(handleValue, 9, output, koffi.sizeof(attributeTagInfo)))
    },
    getBasic(handleValue, output) {
      return Boolean(getBasicRaw(handleValue, 0, output, koffi.sizeof(basicInfo)))
    },
    getStandard(handleValue, output) {
      return Boolean(getStandardRaw(handleValue, 1, output, koffi.sizeof(standardInfo)))
    },
    getFinalPath(handleValue, output) {
      return Number(getFinalRaw(handleValue, output, output.byteLength / 2, 0))
    },
    getVolumeFilesystem(handleValue, output) {
      return Boolean(getVolumeRaw(handleValue, null, 0, null, null, null, output, output.byteLength / 2))
    },
    readFile(handleValue, output, read) {
      return Boolean(readRaw(handleValue, output, output.byteLength, read, null))
    },
    writeFile(handleValue, input, written) {
      return Boolean(writeRaw(handleValue, input, input.byteLength, written, null))
    },
    setEndOfFile(handleValue) {
      return Boolean(setEndRaw(handleValue))
    },
    setFilePointerStart(handleValue) {
      return Boolean(setPointerRaw(handleValue, 0n, null, 0))
    },
    setFileInformation(handleValue, informationClass, input) {
      return Boolean(setInformationRaw(handleValue, informationClass, input, input.byteLength))
    },
    flushFileBuffers(handleValue) {
      return Boolean(flushRaw(handleValue))
    },
    moveFile(source, target, flags) {
      return Boolean(moveRaw(source, target, flags))
    },
    closeHandle(handleValue) {
      closeRaw(handleValue)
    },
    lastError() {
      return Number(lastErrorRaw())
    },
  }
}

class NativeFault extends Error {
  constructor(
    readonly reason: "open" | "metadata" | "read" | "unverifiable",
    readonly code: number,
  ) {
    super(`Win32 ${reason} failed (${code})`)
  }
}

function mappedError(operation: StorageError["operation"], error: unknown, detail: string) {
  if (error instanceof StorageError) return error
  if (!(error instanceof NativeFault))
    return storageError(operation, "unreadable", `${detail}${errorCodeSuffix(error)}`)
  if (error.reason === "unverifiable") return storageError(operation, "integrity_mismatch", detail)
  if ([ERROR_SHARING_VIOLATION, ERROR_ACCESS_DENIED].includes(error.code)) {
    return storageError(operation, "busy", `${detail} (Win32 code ${error.code})`)
  }
  if ([ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND].includes(error.code)) {
    return storageError(operation, "missing", `${detail} (Win32 code ${error.code})`)
  }
  return storageError(operation, "unreadable", `${detail} (Win32 code ${error.code})`)
}

function storageError(operation: StorageError["operation"], reason: StorageError["reason"], detail: string) {
  return new StorageError({ operation, reason, detail })
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined
  return String(error.code)
}

function errorCodeSuffix(error: unknown) {
  const code = errorCode(error)
  return code ? ` (${code})` : ""
}
