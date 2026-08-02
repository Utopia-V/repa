export * as ContentRootNTFS from "./ntfs"

import type { TypeObject } from "koffi"
import { readdir } from "fs/promises"
import { dirname, win32 } from "path"
import { PathError, UnsupportedFilesystemError } from "./schema"

export const VERIFIER_VERSION = 1

export type Descriptor = {
  readonly platform: "windows_ntfs"
  readonly verifierVersion: number
  readonly canonicalPath: string
  readonly canonicalPathKey: string
  readonly volumeSerial: string
  readonly objectID: string
  readonly creationTime: string
  readonly changeTime: string
  readonly lastWriteTime: string
  readonly size: number
  readonly kind: "directory" | "file"
}

export type Verification =
  | { readonly status: "verified"; readonly descriptor: Descriptor }
  | { readonly status: "unavailable"; readonly detail: string }
  | { readonly status: "identity_mismatch"; readonly descriptor: Descriptor }
  | { readonly status: "unsupported"; readonly detail: string }

export type PreparedFile = {
  readonly result: "present"
  readonly relativePath: string
  readonly descriptor: Descriptor
  readonly bytes: Uint8Array
  readonly fingerprint: { readonly algorithm: "sha256"; readonly digest: string; readonly byteLength: number }
  readonly mediaType: string
  readonly timeObserved: number
}

export type PreparedMissing = {
  readonly result: "missing"
  readonly relativePath: string
  readonly timeObserved: number
}

export type MutationWriteResult = {
  readonly operation: "create" | "modify"
  readonly relativePath: string
  readonly descriptor: Descriptor
  readonly byteLength: number
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
  readonly flushFileBuffers: (handle: Handle) => boolean
  readonly closeHandle: (handle: Handle) => void
  readonly lastError: () => number
}

type Opened = { readonly handle: Handle; readonly descriptor: Descriptor }
type Chain = { readonly opened: Opened[]; readonly root: Opened; readonly current: Opened }

const FILE_ATTRIBUTE_DIRECTORY = 0x10
const FILE_ATTRIBUTE_REPARSE_POINT = 0x400
const FILE_READ_ATTRIBUTES = 0x80
const GENERIC_READ = 0x80000000
const GENERIC_WRITE = 0x40000000
const FILE_SHARE_READ = 0x1
const FILE_SHARE_WRITE = 0x2
const OPEN_EXISTING = 3
const CREATE_NEW = 1
const FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000
const FILE_FLAG_BACKUP_SEMANTICS = 0x02000000
const INVALID_HANDLE_VALUE = 0xffffffffffffffffn
const ERROR_FILE_NOT_FOUND = 2
const ERROR_PATH_NOT_FOUND = 3
const ERROR_ACCESS_DENIED = 5
const MAX_FINAL_PATH = 32768
const READ_CHUNK = 64 * 1024

let loaded: Promise<Bindings> | undefined

export async function inspectDirectory(input: string): Promise<Descriptor> {
  requireWindows(input)
  const chain = await openAbsolute(input, false)
  try {
    if (chain.current.descriptor.kind !== "directory") {
      throw pathError(input, "not_directory", "The approval candidate is not a directory")
    }
    return chain.current.descriptor
  } finally {
    await close(chain)
  }
}

export async function inspectExisting(input: string): Promise<Descriptor> {
  requireWindows(input)
  const chain = await openAbsolute(input, false)
  try {
    return chain.current.descriptor
  } finally {
    await close(chain)
  }
}

export async function requireSameObject(expected: Descriptor): Promise<Descriptor> {
  const current = await inspectExisting(expected.canonicalPath)
  if (!sameObject(expected, current)) {
    throw pathError(expected.canonicalPath, "identity_mismatch", "The exact authorized filesystem object changed")
  }
  return current
}

export async function requireUnchangedFile(expected: Descriptor): Promise<Descriptor> {
  const current = await requireSameObject(expected)
  if (expected.kind !== "file" || current.kind !== "file" || !sameStableMetadata(expected, current)) {
    throw pathError(expected.canonicalPath, "mutated", "The exact prepared local source changed before commit")
  }
  return current
}

export async function readAbsoluteFile(input: string, maxBytes: number): Promise<Uint8Array> {
  requireWindows(input)
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw pathError(input, "budget_exceeded", "The bootstrap read limit must be a positive safe integer")
  }
  const chain = await openAbsolute(input, true)
  try {
    const before = chain.current.descriptor
    if (before.kind !== "file") throw pathError(input, "not_file", "The bootstrap config candidate is not a file")
    if (before.size > maxBytes)
      throw pathError(input, "budget_exceeded", `The config candidate exceeds ${maxBytes} bytes`)
    const bytes = await readOpened(chain.current, maxBytes)
    const after = await descriptor(await native(), chain.current.handle)
    if (!sameStableMetadata(before, after) || bytes.byteLength !== before.size) {
      throw pathError(input, "mutated", "The config candidate changed during its bounded read")
    }
    const reopened = await openAbsolute(before.canonicalPath, false)
    try {
      if (!sameObject(before, reopened.current.descriptor)) {
        throw pathError(input, "stale", "The config path changed after its bounded read")
      }
    } finally {
      await close(reopened)
    }
    return bytes
  } finally {
    await close(chain)
  }
}

export async function verifyDirectory(expected: Descriptor): Promise<Verification> {
  if (expected.verifierVersion !== VERIFIER_VERSION) {
    return {
      status: "unsupported",
      detail: `ContentRoot verifier version ${expected.verifierVersion} is unsupported; identity migration or reapproval is required`,
    }
  }
  if (process.platform !== "win32") {
    return { status: "unsupported", detail: `ContentRoot verification is unsupported on ${process.platform}` }
  }
  try {
    const current = await inspectDirectory(expected.canonicalPath)
    if (!sameObject(expected, current)) return { status: "identity_mismatch", descriptor: current }
    return { status: "verified", descriptor: current }
  } catch (error) {
    if (error instanceof UnsupportedFilesystemError) return { status: "unsupported", detail: error.detail }
    if (error instanceof PathError) {
      if (["not_found", "unreadable"].includes(error.reason)) return { status: "unavailable", detail: error.detail }
      if (["identity_mismatch", "stale", "reparse_point"].includes(error.reason)) {
        return { status: "identity_mismatch", descriptor: expected }
      }
    }
    throw error
  }
}

export async function inspectRelative(expected: Descriptor, relativePath: string): Promise<Descriptor> {
  const parts = relativeParts(relativePath)
  const chain = await openRelative(expected, parts, false)
  try {
    return chain.current.descriptor
  } finally {
    await close(chain)
  }
}

export async function listDirectory(expected: Descriptor, relativePath: string): Promise<string[]> {
  const parts = relativePath === "." || relativePath === "" ? [] : relativeParts(relativePath)
  const chain = await openRelative(expected, parts, false)
  try {
    if (chain.current.descriptor.kind !== "directory") {
      throw pathError(relativePath, "not_directory", "Inventory traversal reached a non-directory")
    }
    const before = chain.current.descriptor
    const entries = await readdir(before.canonicalPath)
    const after = await descriptor(await native(), chain.current.handle)
    if (!sameStableMetadata(before, after)) {
      throw pathError(relativePath, "mutated", "The directory changed while it was being enumerated")
    }
    return entries.sort(compareNames)
  } catch (error) {
    if (error instanceof PathError || error instanceof UnsupportedFilesystemError) throw error
    throw pathError(relativePath, "unreadable", `Could not enumerate the directory: ${errorText(error)}`)
  } finally {
    await close(chain)
  }
}

export async function prepareFile(
  expected: Descriptor,
  relativePath: string,
  maxBytes: number,
): Promise<PreparedFile | PreparedMissing> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw pathError(relativePath, "budget_exceeded", "The file byte budget must be a non-negative safe integer")
  }
  const parts = relativeParts(relativePath)
  const parent = await openRelative(expected, parts.slice(0, -1), false)
  const name = parts.at(-1)!
  let opened: Opened | undefined
  try {
    opened = await openChild(parent, name, true, true)
    if (!opened) {
      const second = await openRelative(expected, parts.slice(0, -1), false)
      try {
        const appeared = await openChild(second, name, false, true)
        if (appeared) {
          await closeOpened(appeared)
          throw pathError(relativePath, "stale", "The file appeared between absence checks")
        }
        return { result: "missing", relativePath: normalizedRelative(parts), timeObserved: Date.now() }
      } finally {
        await close(second)
      }
    }
    if (opened.descriptor.kind !== "file") {
      throw pathError(relativePath, "not_file", "The selected source is not a regular file")
    }
    if (opened.descriptor.size > maxBytes) {
      throw pathError(relativePath, "budget_exceeded", `The file exceeds the ${maxBytes}-byte observation limit`)
    }

    const before = opened.descriptor
    const bytes = await readOpened(opened, maxBytes)
    const after = await descriptor(await native(), opened.handle)
    if (!sameStableMetadata(before, after) || bytes.byteLength !== before.size) {
      throw pathError(relativePath, "mutated", "The file changed while its bytes were being read")
    }
    const rootAfter = await descriptor(await native(), parent.root.handle)
    if (!sameObject(expected, rootAfter)) {
      throw pathError(relativePath, "identity_mismatch", "The ContentRoot binding changed during the read")
    }

    const reopenedParent = await openRelative(expected, parts.slice(0, -1), false)
    try {
      const reopened = await openChild(reopenedParent, name, false, false)
      try {
        if (!reopened || !sameObject(before, reopened.descriptor)) {
          throw pathError(relativePath, "stale", "The authorized path no longer resolves to the file that was read")
        }
      } finally {
        if (reopened) await closeOpened(reopened)
      }
    } finally {
      await close(reopenedParent)
    }

    const hasher = new Bun.CryptoHasher("sha256")
    hasher.update(bytes)
    return {
      result: "present",
      relativePath: normalizedRelative(parts),
      descriptor: before,
      bytes,
      fingerprint: { algorithm: "sha256", digest: hasher.digest("hex"), byteLength: bytes.byteLength },
      mediaType: detectMediaType(before.canonicalPath),
      timeObserved: Date.now(),
    }
  } finally {
    if (opened) await closeOpened(opened)
    await close(parent)
  }
}

export async function writeFile(
  expected: Descriptor,
  relativePath: string,
  bytes: Uint8Array,
  rights: { readonly create: boolean; readonly modify: boolean },
  expectedTarget?: Descriptor,
): Promise<MutationWriteResult> {
  const parts = relativeParts(relativePath)
  const parent = await openRelative(expected, parts.slice(0, -1), false)
  const name = parts.at(-1)!
  let opened: Opened | undefined
  try {
    const target = win32.join(parent.current.descriptor.canonicalPath, name)
    let operation: "create" | "modify"
    try {
      opened = await openOneMode(await native(), target, GENERIC_WRITE | FILE_READ_ATTRIBUTES, OPEN_EXISTING)
      operation = "modify"
    } catch (error) {
      if (!(error instanceof NativeOpenError) || ![ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND].includes(error.code)) {
        throw mapOpenError(target, error)
      }
      if (!rights.create) {
        throw pathError(relativePath, "outside_scope", "The mutation grant does not allow creation")
      }
      opened = await openOneMode(await native(), target, GENERIC_WRITE | FILE_READ_ATTRIBUTES, CREATE_NEW)
      operation = "create"
    }
    if (operation === "modify" && !rights.modify) {
      throw pathError(relativePath, "outside_scope", "The mutation grant does not allow modification")
    }
    if (opened.descriptor.kind !== "file") {
      throw pathError(relativePath, "not_file", "The mutation target is not a regular file")
    }
    if (win32.dirname(opened.descriptor.canonicalPath).toLowerCase() !== parent.current.descriptor.canonicalPathKey) {
      throw pathError(relativePath, "outside_scope", "The mutation target did not remain under its verified parent")
    }
    if (opened.descriptor.volumeSerial !== parent.root.descriptor.volumeSerial) {
      throw pathError(relativePath, "outside_scope", "The mutation target crossed the authorized NTFS volume")
    }
    if (expectedTarget && !sameObject(expectedTarget, opened.descriptor)) {
      throw pathError(relativePath, "stale", "The exact mutation target changed after authorization")
    }
    if (!expectedTarget && operation === "modify" && rights.create && !rights.modify) {
      throw pathError(relativePath, "stale", "A file appeared after create-only authorization")
    }

    const api = await native()
    let offset = 0
    while (offset < bytes.byteLength) {
      const chunk = bytes.subarray(offset, Math.min(offset + READ_CHUNK, bytes.byteLength))
      const written = [0]
      if (!api.writeFile(opened.handle, chunk, written) || written[0] !== chunk.byteLength) {
        throw pathError(relativePath, "unreadable", `Win32 WriteFile failed (${api.lastError()})`)
      }
      offset += written[0]!
    }
    if (!api.setEndOfFile(opened.handle) || !api.flushFileBuffers(opened.handle)) {
      throw pathError(relativePath, "unreadable", `Win32 could not finalize the mediated write (${api.lastError()})`)
    }
    const after = await descriptor(api, opened.handle)
    if (after.size !== bytes.byteLength || !sameObject(opened.descriptor, after)) {
      throw pathError(relativePath, "mutated", "The mutation target changed while the write was being finalized")
    }
    const rootAfter = await descriptor(api, parent.root.handle)
    if (!sameObject(expected, rootAfter)) {
      throw pathError(relativePath, "identity_mismatch", "The mutation anchor changed during the write")
    }
    return { operation, relativePath: normalizedRelative(parts), descriptor: after, byteLength: bytes.byteLength }
  } finally {
    if (opened) await closeOpened(opened)
    await close(parent)
  }
}

export function sameObject(left: Descriptor, right: Descriptor) {
  return (
    left.platform === right.platform &&
    left.verifierVersion === right.verifierVersion &&
    left.canonicalPathKey === right.canonicalPathKey &&
    left.volumeSerial === right.volumeSerial &&
    left.objectID === right.objectID &&
    left.creationTime === right.creationTime &&
    left.kind === right.kind
  )
}

export function containsPath(root: Descriptor, relativePath: string) {
  const parts = relativePath === "." || relativePath === "" ? [] : relativeParts(relativePath)
  return win32.join(root.canonicalPath, ...parts)
}

export function normalizeRelativePath(relativePath: string) {
  return normalizedRelative(relativeParts(relativePath))
}

export function detectMediaType(input: string) {
  const extension = win32.extname(input).toLowerCase()
  const known: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".json": "application/json",
    ".jsonc": "application/json",
    ".csv": "text/csv",
    ".tsv": "text/tab-separated-values",
    ".html": "text/html",
    ".htm": "text/html",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".epub": "application/epub+zip",
  }
  return known[extension] ?? "application/octet-stream"
}

function requireWindows(input: string) {
  if (process.platform === "win32") return
  throw new UnsupportedFilesystemError({
    path: input,
    platform: process.platform,
    detail: `Gate 10 ContentRoot authority currently supports only local Windows NTFS volumes`,
  })
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
  const handle = koffi.pointer("REPA_CONTENT_ROOT_HANDLE", koffi.opaque())
  const fileID128 = koffi.struct("REPA_CONTENT_ROOT_FILE_ID_128", {
    Identifier: koffi.array("uint8_t", 16, "Typed"),
  })
  const fileIDInfo = koffi.struct("REPA_CONTENT_ROOT_FILE_ID_INFO", {
    VolumeSerialNumber: "uint64_t",
    FileId: fileID128,
  })
  const attributeTagInfo = koffi.struct("REPA_CONTENT_ROOT_ATTRIBUTE_TAG_INFO", {
    FileAttributes: "uint32_t",
    ReparseTag: "uint32_t",
  })
  const basicInfo = koffi.struct("REPA_CONTENT_ROOT_BASIC_INFO", {
    CreationTime: "int64_t",
    LastAccessTime: "int64_t",
    LastWriteTime: "int64_t",
    ChangeTime: "int64_t",
    FileAttributes: "uint32_t",
  })
  const standardInfo = koffi.struct("REPA_CONTENT_ROOT_STANDARD_INFO", {
    AllocationSize: "int64_t",
    EndOfFile: "int64_t",
    NumberOfLinks: "uint32_t",
    DeletePending: "uint8_t",
    Directory: "uint8_t",
  })
  const create = kernel.func(
    "REPA_CONTENT_ROOT_HANDLE __stdcall CreateFileW(const char16_t *path, uint32_t access, uint32_t share, void *security, uint32_t creation, uint32_t flags, REPA_CONTENT_ROOT_HANDLE templateFile)",
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
    "uint32_t __stdcall GetFinalPathNameByHandleW(REPA_CONTENT_ROOT_HANDLE file, _Out_ char16_t *path, uint32_t length, uint32_t flags)",
  )
  const getVolumeRaw = kernel.func(
    "bool __stdcall GetVolumeInformationByHandleW(REPA_CONTENT_ROOT_HANDLE file, void *volumeName, uint32_t volumeNameLength, void *serial, void *maxComponent, void *flags, _Out_ char16_t *filesystemName, uint32_t filesystemNameLength)",
  )
  const readRaw = kernel.func(
    "bool __stdcall ReadFile(REPA_CONTENT_ROOT_HANDLE file, _Out_ uint8_t *buffer, uint32_t length, _Out_ uint32_t *read, void *overlapped)",
  )
  const writeRaw = kernel.func(
    "bool __stdcall WriteFile(REPA_CONTENT_ROOT_HANDLE file, const uint8_t *buffer, uint32_t length, _Out_ uint32_t *written, void *overlapped)",
  )
  const setEndRaw = kernel.func("bool __stdcall SetEndOfFile(REPA_CONTENT_ROOT_HANDLE file)")
  const flushRaw = kernel.func("bool __stdcall FlushFileBuffers(REPA_CONTENT_ROOT_HANDLE file)")
  const closeRaw = kernel.func("bool __stdcall CloseHandle(REPA_CONTENT_ROOT_HANDLE file)")
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
    flushFileBuffers(handleValue) {
      return Boolean(flushRaw(handleValue))
    },
    closeHandle(handleValue) {
      closeRaw(handleValue)
    },
    lastError() {
      return Number(lastErrorRaw())
    },
  }
}

async function openAbsolute(input: string, readFinal: boolean): Promise<Chain> {
  const path = absolutePath(input)
  const parsed = win32.parse(path)
  const segments = path.slice(parsed.root.length).split(/[\\/]/).filter(Boolean)
  const targets = [parsed.root, ...segments.map((_, index) => win32.join(parsed.root, ...segments.slice(0, index + 1)))]
  const api = await native()
  const opened: Opened[] = []
  try {
    for (const [index, target] of targets.entries()) {
      const current = await openOne(api, target, readFinal && index === targets.length - 1)
      opened.push(current)
      if (current.descriptor.kind !== "directory" && index < targets.length - 1) {
        throw pathError(target, "not_directory", "An absolute path component is not a directory")
      }
      const parent = opened.at(-2)
      if (
        parent &&
        win32.dirname(current.descriptor.canonicalPath).toLowerCase() !== parent.descriptor.canonicalPathKey
      ) {
        throw pathError(target, "outside_scope", "A path component did not remain under its opened parent")
      }
    }
    const filesystem = await volumeFilesystem(api, opened[0]!)
    if (filesystem !== "NTFS") {
      throw new UnsupportedFilesystemError({
        path,
        platform: "win32",
        filesystem,
        detail: `Gate 10 requires a positively identified local NTFS volume`,
      })
    }
    return { opened, root: opened.at(-1)!, current: opened.at(-1)! }
  } catch (error) {
    await closeMany(api, opened)
    throw error
  }
}

async function openRelative(expected: Descriptor, parts: string[], readFinal: boolean): Promise<Chain> {
  const absolute = await openAbsolute(expected.canonicalPath, false)
  if (!sameObject(expected, absolute.current.descriptor)) {
    await close(absolute)
    throw pathError(
      expected.canonicalPath,
      "identity_mismatch",
      "The current path does not name the approved directory object",
    )
  }
  const opened = [...absolute.opened]
  const root = absolute.current
  let current = root
  try {
    for (const [index, part] of parts.entries()) {
      const child = await openChild({ opened, root, current }, part, readFinal && index === parts.length - 1, false)
      if (!child) throw pathError(part, "not_found", "The requested path does not exist")
      opened.push(child)
      current = child
      if (current.descriptor.kind !== "directory" && index < parts.length - 1) {
        throw pathError(part, "not_directory", "A relative path component is not a directory")
      }
    }
    return { opened, root, current }
  } catch (error) {
    await closeMany(await native(), opened)
    throw error
  }
}

async function openChild(chain: Chain, name: string, read: boolean, allowMissing: boolean) {
  const target = win32.join(chain.current.descriptor.canonicalPath, name)
  try {
    const opened = await openOne(await native(), target, read)
    if (win32.dirname(opened.descriptor.canonicalPath).toLowerCase() !== chain.current.descriptor.canonicalPathKey) {
      await closeOpened(opened)
      throw pathError(target, "outside_scope", "The opened child did not remain under its verified parent")
    }
    if (opened.descriptor.volumeSerial !== chain.root.descriptor.volumeSerial) {
      await closeOpened(opened)
      throw pathError(target, "outside_scope", "The opened child crossed the approved NTFS volume")
    }
    return opened
  } catch (error) {
    if (
      allowMissing &&
      error instanceof NativeOpenError &&
      [ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND].includes(error.code)
    ) {
      return undefined
    }
    throw mapOpenError(target, error)
  }
}

async function openOne(api: Bindings, path: string, read: boolean): Promise<Opened> {
  return openOneMode(api, path, (FILE_READ_ATTRIBUTES | (read ? GENERIC_READ : 0)) >>> 0, OPEN_EXISTING)
}

async function openOneMode(api: Bindings, path: string, access: number, creation: number): Promise<Opened> {
  const handle = api.createFile(
    nativePath(path),
    access >>> 0,
    FILE_SHARE_READ | FILE_SHARE_WRITE,
    creation,
    FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS,
  )
  if (BigInt.asUintN(64, handle) === INVALID_HANDLE_VALUE) throw new NativeOpenError(api.lastError())
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
  if (!api.getFileID(handle, id) || !api.getAttributeTag(handle, tag) || !api.getBasic(handle, basic)) {
    throw pathError("<opened handle>", "unreadable", `Win32 could not read stable object metadata (${api.lastError()})`)
  }
  if (!api.getStandard(handle, standard)) {
    throw pathError("<opened handle>", "unreadable", `Win32 could not read file size metadata (${api.lastError()})`)
  }
  if ((tag.FileAttributes ?? 0) & FILE_ATTRIBUTE_REPARSE_POINT) {
    throw pathError(
      "<opened handle>",
      "reparse_point",
      `Reparse tag 0x${(tag.ReparseTag ?? 0).toString(16)} is unsupported`,
    )
  }
  if (standard.DeletePending) {
    throw pathError("<opened handle>", "stale", "The opened object is pending deletion")
  }
  const canonicalPath = await finalPath(api, handle)
  const identifier = id.FileId?.Identifier
  if (!identifier || identifier.byteLength !== 16 || id.VolumeSerialNumber === undefined) {
    throw pathError(canonicalPath, "unreadable", "NTFS did not return a stable 128-bit file identity")
  }
  const size = Number(toBigInt(standard.EndOfFile))
  if (!Number.isSafeInteger(size) || size < 0) {
    throw pathError(canonicalPath, "budget_exceeded", "The opened object size cannot be represented safely")
  }
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
    size,
    kind: (tag.FileAttributes ?? basic.FileAttributes ?? 0) & FILE_ATTRIBUTE_DIRECTORY ? "directory" : "file",
  }
}

async function finalPath(api: Bindings, handle: Handle) {
  const output = Buffer.alloc(MAX_FINAL_PATH * 2)
  const length = api.getFinalPath(handle, output)
  if (length === 0 || length >= MAX_FINAL_PATH) {
    throw pathError("<opened handle>", "unreadable", `Win32 could not return a canonical DOS path (${api.lastError()})`)
  }
  const value = output.toString("utf16le", 0, length * 2)
  if (!value.startsWith("\\\\?\\") || value.startsWith("\\\\?\\UNC\\")) {
    throw new UnsupportedFilesystemError({
      path: value,
      platform: "win32",
      detail: "UNC, network, and non-DOS path namespaces are unsupported",
    })
  }
  return win32.normalize(value.slice(4))
}

async function volumeFilesystem(api: Bindings, opened: Opened) {
  const output = Buffer.alloc(64 * 2)
  if (!api.getVolumeFilesystem(opened.handle, output)) {
    throw new UnsupportedFilesystemError({
      path: opened.descriptor.canonicalPath,
      platform: "win32",
      detail: `Win32 could not classify the opened volume (${api.lastError()})`,
    })
  }
  return output.toString("utf16le").replace(/\0.*$/s, "")
}

async function readOpened(opened: Opened, maxBytes: number) {
  const api = await native()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const output = Buffer.alloc(Math.min(READ_CHUNK, Math.max(1, maxBytes - total + 1)))
    const read = [0]
    if (!api.readFile(opened.handle, output, read)) {
      throw pathError(opened.descriptor.canonicalPath, "unreadable", `Win32 ReadFile failed (${api.lastError()})`)
    }
    if (read[0] === 0) break
    total += read[0]!
    if (total > maxBytes) {
      throw pathError(opened.descriptor.canonicalPath, "budget_exceeded", "The file grew beyond its byte budget")
    }
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

function absolutePath(input: string) {
  requireWindows(input)
  requireUnicode(input)
  if (input.includes("\0") || input.startsWith("\\\\") || input.startsWith("\\\\?\\")) {
    throw pathError(input, "invalid_path", "UNC, device, and NUL-containing paths are unsupported")
  }
  const normalized = win32.normalize(win32.resolve(input))
  if (!/^[A-Za-z]:\\/.test(normalized)) {
    throw pathError(input, "invalid_path", "A local absolute DOS path is required")
  }
  for (const part of normalized.slice(3).split("\\").filter(Boolean)) requireComponent(part, input)
  return normalized
}

function relativeParts(input: string) {
  requireUnicode(input)
  if (!input || input === "." || input.includes("\0") || win32.isAbsolute(input)) {
    throw pathError(input, "invalid_path", "A non-empty authority-relative file path is required")
  }
  const parts = input.split(/[\\/]/)
  for (const part of parts) requireComponent(part, input)
  return parts
}

function requireComponent(part: string, input: string) {
  if (!part || part === "." || part === ".." || /[<>:"|?*\u0000-\u001f]/.test(part) || /[ .]$/.test(part)) {
    throw pathError(input, "invalid_path", `Invalid or ambiguous Windows path component: ${part}`)
  }
  const stem = part.split(".")[0]!.toUpperCase()
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) {
    throw pathError(input, "invalid_path", `Reserved Windows path component: ${part}`)
  }
}

function requireUnicode(input: string) {
  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) throw pathError(input, "invalid_path", "The path contains invalid Unicode")
      index++
      continue
    }
    if (code >= 0xdc00 && code <= 0xdfff) throw pathError(input, "invalid_path", "The path contains invalid Unicode")
  }
}

function normalizedRelative(parts: string[]) {
  return parts.join("/")
}

function nativePath(input: string) {
  return `\\\\?\\${input}`
}

function sameStableMetadata(left: Descriptor, right: Descriptor) {
  return (
    sameObject(left, right) &&
    left.changeTime === right.changeTime &&
    left.lastWriteTime === right.lastWriteTime &&
    left.size === right.size
  )
}

function toBigInt(value: number | bigint | undefined) {
  if (value === undefined) return 0n
  return BigInt(value)
}

function compareNames(left: string, right: string) {
  const insensitive = left.toLowerCase().localeCompare(right.toLowerCase(), "en")
  return insensitive || left.localeCompare(right, "en")
}

async function close(chain: Chain) {
  await closeMany(await native(), chain.opened)
}

async function closeOpened(opened: Opened) {
  ;(await native()).closeHandle(opened.handle)
}

async function closeMany(api: Bindings, opened: Opened[]) {
  for (const item of opened.toReversed()) api.closeHandle(item.handle)
}

class NativeOpenError extends Error {
  constructor(readonly code: number) {
    super(`Win32 CreateFileW failed (${code})`)
  }
}

function mapOpenError(path: string, error: unknown) {
  if (error instanceof PathError || error instanceof UnsupportedFilesystemError) return error
  if (!(error instanceof NativeOpenError)) return pathError(path, "unreadable", errorText(error))
  if ([ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND].includes(error.code)) {
    return pathError(path, "not_found", `The path does not exist (${error.code})`)
  }
  if (error.code === ERROR_ACCESS_DENIED) return pathError(path, "unreadable", "Access was denied")
  return pathError(path, "unreadable", `Win32 could not open the path (${error.code})`)
}

function pathError(path: string, reason: PathError["reason"], detail: string) {
  return new PathError({ path, reason, detail })
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
