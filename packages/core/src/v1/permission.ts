export * as PermissionV1 from "./permission"

import { Schema } from "effect"
export * from "@opencode-ai/schema/permission-v1"
import { ID, type Request } from "@opencode-ai/schema/permission-v1"

// Permission.Service owns this transport constraint. It does not grant domain authority.
export const PROMPT_REQUIRED_METADATA_KEY = "permissionPromptRequired"
export const EXACT_REPLY_METADATA_KEY = "permissionExactReply"

export function promptRequired(request: Pick<Request, "metadata">) {
  return request.metadata[PROMPT_REQUIRED_METADATA_KEY] === true
}

export function exactReplyRequired(request: Pick<Request, "metadata">) {
  return request.metadata[EXACT_REPLY_METADATA_KEY] === true
}

export class RejectedError extends Schema.TaggedErrorClass<RejectedError>()("PermissionRejectedError", {}) {
  override get message() {
    return "The user rejected permission to use this specific tool call."
  }
}

export class CancelledError extends Schema.TaggedErrorClass<CancelledError>()("PermissionCancelledError", {}) {
  override get message() {
    return "The user cancelled this permission request."
  }
}

export class CorrectedError extends Schema.TaggedErrorClass<CorrectedError>()("PermissionCorrectedError", {
  feedback: Schema.String,
}) {
  override get message() {
    return `The user rejected permission to use this specific tool call with the following feedback: ${this.feedback}`
  }
}

export class DeniedError extends Schema.TaggedErrorClass<DeniedError>()("PermissionDeniedError", {
  ruleset: Schema.Any,
}) {
  override get message() {
    return `The user has specified a rule which prevents you from using this specific tool call. Here are some of the relevant rules ${JSON.stringify(this.ruleset)}`
  }
}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("Permission.NotFoundError", {
  requestID: ID,
}) {}

export type Error = DeniedError | RejectedError | CorrectedError | CancelledError
