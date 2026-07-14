import { LearnerHomeOwnership } from "../../src/learner-home/ownership"

try {
  const ownership = await LearnerHomeOwnership.acquire()
  process.stdout.write("ready\n")
  process.stdin.resume()
  await new Promise<void>((resolve) => process.stdin.once("end", resolve))
  await ownership.release()
} catch (error) {
  const tag = typeof error === "object" && error !== null && "_tag" in error ? String(error._tag) : "Error"
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${tag}: ${message}\n`)
  process.exitCode = 2
}
