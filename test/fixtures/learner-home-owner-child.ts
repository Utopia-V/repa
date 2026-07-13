import { acquireLearnerHomeWriteOwnership } from "../../src/storage/learner-home-owner"

const databasePath = Bun.argv[2]
const behavior = Bun.argv[3]
if (!databasePath || (behavior !== "hold-then-exit" && behavior !== "acquire-and-release")) {
  throw new Error("Usage: learner-home-owner-child <database-path> <behavior>")
}

try {
  const ownership = acquireLearnerHomeWriteOwnership({ databasePath })
  process.stdout.write("ACQUIRED\n")
  if (behavior === "hold-then-exit") {
    await Bun.sleep(500)
    // Deliberately skip release: the OS/SQLite connection teardown must clear ownership.
    process.exit(17)
  }
  ownership.release()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(23)
}
