import type { Effect, Stream } from "effect"
import type { Endpoint } from "../endpoint"
import type { Auth } from "../auth"
import type { Interface as RequestExecutorInterface } from "../executor"
import type { Interface as WebSocketExecutorInterface } from "./websocket"
import type { LLMError, LLMRequest } from "../../schema"

export interface TransportRuntime {
  readonly http: RequestExecutorInterface
  readonly webSocket?: WebSocketExecutorInterface
}

export type Descriptor =
  | Readonly<{ kind: "http"; method: string; url: string }>
  | Readonly<{ kind: "websocket"; method: "WEBSOCKET"; url: string }>

export interface Transport<Body, Prepared, Frame> {
  readonly id: string
  readonly prepare: (input: TransportPrepareInput<Body>) => Effect.Effect<Prepared, LLMError>
  /** In-memory final transport identity; callers must sanitize credentials before persistence. */
  readonly describe: (prepared: Prepared) => Descriptor
  readonly frames: (
    prepared: Prepared,
    request: LLMRequest,
    runtime: TransportRuntime,
  ) => Stream.Stream<Frame, LLMError>
}

export interface TransportPrepareInput<Body> {
  readonly body: Body
  readonly request: LLMRequest
  readonly endpoint: Endpoint<Body>
  readonly auth: Auth
  readonly encodeBody: (body: Body) => string
  readonly headers?: (input: { readonly request: LLMRequest }) => Record<string, string>
}

export * as HttpTransport from "./http"
export { WebSocketExecutor, WebSocketTransport } from "./websocket"
