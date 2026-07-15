import { Database } from "@opencode-ai/core/database/database"
import { ManagedRuntime } from "effect"

const runtime = ManagedRuntime.make(Database.runtimeLayerFromPath(Database.path()))
try {
  await runtime.runPromise(Database.Service)
  process.stdout.write("ready\n")
  process.stdin.resume()
  await new Promise<void>((resolve) => process.stdin.once("end", resolve))
  await runtime.dispose()
} catch (error) {
  await runtime.dispose().catch(() => {})
  const tag = typeof error === "object" && error !== null && "_tag" in error ? String(error._tag) : "Error"
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${tag}: ${message}\n`)
  process.exitCode = 2
}
