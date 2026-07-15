import { SessionV2 } from "@opencode-ai/core/session"
import { ConflictError, ServiceUnavailableError, SessionNotFoundError } from "@opencode-ai/protocol/errors"
import { makeHibernatedSessionExecutionGroup } from "@opencode-ai/protocol/groups/session-execution"
import { Effect } from "effect"
import { HttpApi, HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { SessionLocationMiddleware } from "../middleware/session-location"

const HibernatedSessionExecutionApi = HttpApi.make("hibernated").add(
  makeHibernatedSessionExecutionGroup(SessionLocationMiddleware),
)

export const HibernatedSessionExecutionHandler = HttpApiBuilder.group(
  HibernatedSessionExecutionApi,
  "hibernated.session.execution",
  (handlers) =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service

      return handlers
        .handle(
          "session.active",
          Effect.fn(function* () {
            return {
              data: Object.fromEntries(
                Array.from(yield* session.active, (sessionID) => [sessionID, { type: "running" as const }]),
              ),
            }
          }),
        )
        .handle(
          "session.prompt",
          Effect.fn(function* (ctx) {
            return {
              data: yield* session
                .prompt({
                  sessionID: ctx.params.sessionID,
                  id: ctx.payload.id,
                  prompt: ctx.payload.prompt,
                  delivery: ctx.payload.delivery,
                  resume: ctx.payload.resume,
                })
                .pipe(
                  Effect.catchTag("Session.NotFoundError", (error) =>
                    Effect.fail(
                      new SessionNotFoundError({
                        sessionID: error.sessionID,
                        message: `Session not found: ${error.sessionID}`,
                      }),
                    ),
                  ),
                  Effect.catchTag("Session.PromptConflictError", (error) =>
                    Effect.fail(
                      new ConflictError({
                        message: `Prompt message ID conflicts with an existing durable record: ${error.messageID}`,
                        resource: error.messageID,
                      }),
                    ),
                  ),
                ),
            }
          }),
        )
        .handle(
          "session.compact",
          Effect.fn(function* (ctx) {
            yield* session.compact({ sessionID: ctx.params.sessionID }).pipe(
              Effect.catchTag("Session.NotFoundError", (error) =>
                Effect.fail(
                  new SessionNotFoundError({
                    sessionID: error.sessionID,
                    message: `Session not found: ${error.sessionID}`,
                  }),
                ),
              ),
              Effect.catchTag("Session.OperationUnavailableError", (error) =>
                Effect.fail(
                  new ServiceUnavailableError({
                    message: `Session ${error.operation} is not available yet`,
                    service: `session.${error.operation}`,
                  }),
                ),
              ),
            )
            return HttpApiSchema.NoContent.make()
          }),
        )
        .handle(
          "session.wait",
          Effect.fn(function* (ctx) {
            yield* session.wait(ctx.params.sessionID).pipe(
              Effect.catchTag("Session.NotFoundError", (error) =>
                Effect.fail(
                  new SessionNotFoundError({
                    sessionID: error.sessionID,
                    message: `Session not found: ${error.sessionID}`,
                  }),
                ),
              ),
              Effect.catchTag("Session.OperationUnavailableError", (error) =>
                Effect.fail(
                  new ServiceUnavailableError({
                    message: `Session ${error.operation} is not available yet`,
                    service: `session.${error.operation}`,
                  }),
                ),
              ),
            )
            return HttpApiSchema.NoContent.make()
          }),
        )
        .handle(
          "session.interrupt",
          Effect.fn(function* (ctx) {
            yield* session.interrupt(ctx.params.sessionID)
            return HttpApiSchema.NoContent.make()
          }),
        )
    }),
)
