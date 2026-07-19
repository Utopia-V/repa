import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import type { LearningCommand } from "@opencode-ai/core/learning-command"
import { Effect } from "effect"
import type { Permission } from "@/permission"

export function ask(
  permission: Permission.Interface,
  input: Permission.AskInput,
  abort: AbortSignal,
): Effect.Effect<LearningCommand.PermissionOutcome> {
  if (abort.aborted) return Effect.succeed({ type: "abort" })
  const requested = permission.ask(input).pipe(
    Effect.match({
      onFailure: (error): LearningCommand.PermissionOutcome => {
        if (error instanceof PermissionV1.DeniedError) return { type: "deny" }
        if (error instanceof PermissionV1.CorrectedError) return { type: "correct" }
        return { type: "cancel" }
      },
      onSuccess: (): LearningCommand.PermissionOutcome => ({ type: "allow" }),
    }),
  )
  const cancelled = Effect.callback<LearningCommand.PermissionOutcome>((resume) => {
    if (abort.aborted) {
      resume(Effect.succeed({ type: "abort" }))
      return Effect.void
    }
    const onAbort = () => resume(Effect.succeed({ type: "abort" }))
    abort.addEventListener("abort", onAbort, { once: true })
    return Effect.sync(() => abort.removeEventListener("abort", onAbort))
  })
  return Effect.raceFirst(requested, cancelled)
}

export * as LearningCommandPermission from "./permission"
