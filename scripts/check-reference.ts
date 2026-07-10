type ReferenceLock = {
  repository: string
  tag: string
  commit: string
  license: string
  checkout: string
  role: string
}

type ReferenceManifest = {
  opencode: ReferenceLock
}

export {}

const manifest = (await Bun.file("references.lock.json").json()) as ReferenceManifest
const reference = manifest.opencode

const result = Bun.spawnSync({
  cmd: ["git", "-C", reference.checkout, "rev-parse", "HEAD"],
  stdout: "pipe",
  stderr: "pipe",
})

if (result.exitCode !== 0) {
  const error = result.stderr.toString().trim()
  throw new Error(
    `OpenCode reference checkout is unavailable at ${reference.checkout}.${error ? `\n${error}` : ""}`,
  )
}

const actual = result.stdout.toString().trim()
if (actual !== reference.commit) {
  throw new Error(`OpenCode reference mismatch: expected ${reference.commit}, received ${actual}`)
}

console.log(`OpenCode reference verified: ${reference.tag} (${actual.slice(0, 12)})`)
