import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { EventV2 } from "@opencode-ai/core/event"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { ProjectV2 } from "@opencode-ai/core/project"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceRef } from "@/effect/instance-ref"
import { testEffect } from "./lib/effect"

const Prepared = EventV2.define({
  type: "test.event-v2-bridge.prepared",
  durable: { version: 1, aggregate: "id" },
  schema: { id: Schema.String, value: Schema.String },
})

const it = testEffect(AppNodeBuilder.build(EventV2Bridge.node))

it.effect(
  "injects routed instance location into prepared durable events",
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    const committed = yield* events.transaction(() =>
      Effect.succeed({
        result: "settled" as const,
        event: {
          definition: Prepared,
          data: { id: "aggregate", value: "derived" },
        },
      }),
    )

    expect(committed.result).toBe("settled")
    expect(committed.event?.location?.directory).toBe(AbsolutePath.make("C:\\project"))
    expect((committed.event?.location as Location.Info | undefined)?.project).toEqual({
      id: ProjectV2.ID.global,
      directory: AbsolutePath.make("C:\\worktree"),
    })
  }).pipe(
    Effect.provideService(InstanceRef, {
      directory: "C:\\project",
      worktree: "C:\\worktree",
      project: {
        id: ProjectV2.ID.global,
        worktree: "C:\\worktree",
        time: { created: 0, updated: 0 },
        sandboxes: [],
      },
    }),
  ),
)

it.effect(
  "injects routed instance location into post-commit removal visibility",
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    const received: EventV2.Payload[] = []
    yield* events.listen((event) =>
      Effect.sync(() => {
        if (event.type === Prepared.type && (event.data as { value: string }).value === "deleted") {
          received.push(event)
        }
      }),
    )
    yield* events.publish(Prepared, { id: "aggregate", value: "seed" })

    yield* events.remove("aggregate", () => Effect.void, {
      definition: Prepared,
      data: { id: "aggregate", value: "deleted" },
    })

    expect(received).toHaveLength(1)
    expect(received[0]?.durable).toBeUndefined()
    expect(received[0]?.location?.directory).toBe(AbsolutePath.make("C:\\project"))
    expect((received[0]?.location as Location.Info | undefined)?.project).toEqual({
      id: ProjectV2.ID.global,
      directory: AbsolutePath.make("C:\\worktree"),
    })
  }).pipe(
    Effect.provideService(InstanceRef, {
      directory: "C:\\project",
      worktree: "C:\\worktree",
      project: {
        id: ProjectV2.ID.global,
        worktree: "C:\\worktree",
        time: { created: 0, updated: 0 },
        sandboxes: [],
      },
    }),
  ),
)
