type ReferenceLock = {
  repository: string
  tag: string
  commit: string
  license: string
  checkout: string
  role: string
}

type ReferenceName = "opencode" | "codex"
type ReferenceManifest = Record<ReferenceName, ReferenceLock>

export {}

const manifest = (await Bun.file("references.lock.json").json()) as ReferenceManifest

for (const name of ["opencode", "codex"] satisfies ReferenceName[]) {
  const reference = manifest[name]
  const result = Bun.spawnSync({
    cmd: ["git", "-C", reference.checkout, "rev-parse", "HEAD"],
    stdout: "pipe",
    stderr: "pipe",
  })

  if (result.exitCode !== 0) {
    const error = result.stderr.toString().trim()
    throw new Error(
      `${name} reference checkout is unavailable at ${reference.checkout}.${error ? `\n${error}` : ""}`,
    )
  }

  const actual = result.stdout.toString().trim()
  if (actual !== reference.commit) {
    throw new Error(`${name} reference mismatch: expected ${reference.commit}, received ${actual}`)
  }

  console.log(`${name} reference verified: ${reference.tag} (${actual.slice(0, 12)})`)
}
