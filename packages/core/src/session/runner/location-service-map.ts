export * as SessionRunnerLocationServiceMap from "./location-service-map"

import { Context, Effect, Layer, LayerMap } from "effect"
import { LayerNode } from "../../effect/layer-node"
import { Node } from "../../effect/app-node"
import { Location } from "../../location"
import { locationServices } from "../../location-services"
import { SessionRunnerLLM } from "./llm"
import { SessionRunnerModel } from "./model"

const services = LayerNode.group([locationServices, SessionRunnerModel.node, SessionRunnerLLM.node])

type Services = LayerNode.Output<typeof services>
type Error = LayerNode.Error<typeof services>

/** Hibernated Location map for direct preview-v2 runner composition. */
export class Service extends Context.Service<Service, LayerMap.LayerMap<Location.Ref, Services, Error>>()(
  "@opencode/v2/SessionRunnerLocationServiceMap",
) {}

export const node = LayerNode.unbound(Service, Node.tags.values.global)

export function build(replacements: LayerNode.Replacements = []): Layer.Layer<Service> {
  return Layer.effect(
    Service,
    LayerMap.make(
      (ref: Location.Ref) => {
        const allReplacements = replacements.concat([[Location.node, Location.boundNode(ref)]])
        const location = LayerNode.hoist(services, Node.tags.values.global, allReplacements)

        return LayerNode.compile(location.node).pipe(
          Layer.fresh,
          Layer.tap(() =>
            Effect.logInfo("booting hibernated session runner location services", {
              directory: ref.directory,
              workspaceID: ref.workspaceID,
            }),
          ),
          Layer.provide(LayerNode.compile(location.hoisted)),
        )
      },
      { idleTimeToLive: "60 minutes" },
    ),
  )
}
