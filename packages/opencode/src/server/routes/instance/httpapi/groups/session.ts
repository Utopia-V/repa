import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Permission } from "@/permission"
import { SessionV1 } from "@opencode-ai/core/v1/session"

import { Session } from "@/session/session"
import { MessageV2 } from "@/session/message-v2"
import { SessionPrompt } from "@/session/prompt"
import { SessionRevert } from "@/session/revert"
import { SessionStatus } from "@/session/status"
import { SessionSummary } from "@/session/summary"
import { Todo } from "@/session/todo"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { Snapshot } from "@/snapshot"
import { Schema, Struct } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import {
  WorkspaceRoutingMiddleware,
  WorkspaceRoutingQuery,
  WorkspaceRoutingQueryFields,
} from "../middleware/workspace-routing"
import {
  ApiNotFoundError,
  InvalidRequestError,
  PermissionNotFoundError,
  SessionBusyError,
  SessionTreeBusyError,
  TurnActiveMismatchError,
  TurnAdmissionConflictError,
  TurnAlreadyRunningError,
  TurnIntegrityError,
  TurnNoActiveError,
  TurnNotFoundError,
  TurnNotSteerableError,
  TurnSessionMismatchError,
  TurnSourceUnavailableError,
  TurnTreeChangedError,
} from "../errors"
import { described } from "./metadata"
import { QueryBoolean } from "./query"
import { Turn } from "@opencode-ai/schema/turn"

const root = "/session"
export const ListQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  scope: Schema.optional(Schema.Literals(["project"])),
  path: Schema.optional(Schema.String),
  roots: Schema.optional(QueryBoolean),
  start: Schema.optional(Schema.NumberFromString),
  search: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.NumberFromString),
})
export const DiffQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  ...Struct.omit(SessionSummary.DiffInput.fields, ["sessionID"]),
})
export const MessagesQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  limit: Schema.optional(Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
  before: Schema.optional(Schema.String),
})
export const StatusMap = Schema.Record(Schema.String, SessionStatus.Info)
export const UpdatePayload = Schema.Struct({
  title: Schema.optional(Schema.String),
  metadata: Schema.optional(Session.Metadata),
  permission: Schema.optional(PermissionV1.Ruleset),
  time: Schema.optional(
    Schema.Struct({
      archived: Schema.optional(Session.ArchivedTimestamp),
    }),
  ),
})
export const StartPayload = Schema.Struct(Struct.omit(SessionPrompt.StartInput.fields, ["sessionID"]))
export const SteerPayload = Schema.Struct(Struct.omit(SessionPrompt.SteerInput.fields, ["sessionID", "expectedTurnID"]))
export const ForkBasis = Schema.Struct({
  sourceSessionID: SessionID,
  sourceEventSequence: Schema.Int,
})
export const ShellPayload = Schema.Struct(Struct.omit(SessionPrompt.ShellInput.fields, ["sessionID"]))
export const RevertPayload = Schema.Struct(Struct.omit(SessionRevert.RevertInput.fields, ["sessionID"]))
export const PermissionResponsePayload = Schema.Struct({
  response: PermissionV1.Reply,
})

const TurnErrors = [
  TurnAdmissionConflictError,
  TurnAlreadyRunningError,
  TurnNotFoundError,
  TurnSessionMismatchError,
  TurnNoActiveError,
  TurnActiveMismatchError,
  TurnNotSteerableError,
  TurnSourceUnavailableError,
  SessionTreeBusyError,
  TurnTreeChangedError,
  TurnIntegrityError,
] as const

export const SessionPaths = {
  list: root,
  status: `${root}/status`,
  get: `${root}/:sessionID`,
  children: `${root}/:sessionID/children`,
  todo: `${root}/:sessionID/todo`,
  diff: `${root}/:sessionID/diff`,
  messages: `${root}/:sessionID/message`,
  message: `${root}/:sessionID/message/:messageID`,
  remove: `${root}/:sessionID`,
  update: `${root}/:sessionID`,
  forkBasis: `${root}/:sessionID/fork-basis`,
  start: `${root}/:sessionID/turn`,
  turns: `${root}/:sessionID/turn`,
  activeTurn: `${root}/:sessionID/turn/active`,
  getTurn: `${root}/:sessionID/turn/:turnID`,
  awaitTurn: `${root}/:sessionID/turn/:turnID/await`,
  steer: `${root}/:sessionID/turn/:turnID/steer`,
  interruptTurn: `${root}/:sessionID/turn/:turnID/interrupt`,
  shell: `${root}/:sessionID/shell`,
  revert: `${root}/:sessionID/revert`,
  unrevert: `${root}/:sessionID/unrevert`,
  permissions: `${root}/:sessionID/permissions/:permissionID`,
  deleteMessage: `${root}/:sessionID/message/:messageID`,
  deletePart: `${root}/:sessionID/message/:messageID/part/:partID`,
  updatePart: `${root}/:sessionID/message/:messageID/part/:partID`,
} as const

export const SessionApi = HttpApi.make("session")
  .add(
    HttpApiGroup.make("session")
      .add(
        HttpApiEndpoint.get("list", SessionPaths.list, {
          query: ListQuery,
          success: described(Schema.Array(Session.Info), "List of sessions"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.list",
            summary: "List sessions",
            description: "Get a list of all Repa sessions, sorted by most recently updated.",
          }),
        ),
        HttpApiEndpoint.get("status", SessionPaths.status, {
          query: WorkspaceRoutingQuery,
          success: described(StatusMap, "Get session status"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.status",
            summary: "Get session status",
            description: "Retrieve the current status of all sessions, including active, idle, and completed states.",
          }),
        ),
        HttpApiEndpoint.get("get", SessionPaths.get, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(Session.Info, "Get session"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.get",
            summary: "Get session",
            description: "Retrieve detailed information about a specific Repa session.",
          }),
        ),
        HttpApiEndpoint.get("children", SessionPaths.children, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Session.Info), "List of children"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.children",
            summary: "Get session children",
            description: "Retrieve all child sessions that were forked from the specified parent session.",
          }),
        ),
        HttpApiEndpoint.get("todo", SessionPaths.todo, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Todo.Info), "Todo list"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.todo",
            summary: "Get session todos",
            description: "Retrieve the todo list associated with a specific session, showing tasks and action items.",
          }),
        ),
        HttpApiEndpoint.get("diff", SessionPaths.diff, {
          params: { sessionID: SessionID },
          query: DiffQuery,
          success: described(Schema.Array(Snapshot.FileDiff), "Successfully retrieved diff"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.diff",
            summary: "Get message diff",
            description: "Get the file changes (diff) that resulted from a specific user message in the session.",
          }),
        ),
        HttpApiEndpoint.get("messages", SessionPaths.messages, {
          params: { sessionID: SessionID },
          query: MessagesQuery,
          success: described(Schema.Array(SessionV1.WithParts), "List of messages"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.messages",
            summary: "Get session messages",
            description: "Retrieve all messages in a session, including user prompts and AI responses.",
          }),
        ),
        HttpApiEndpoint.get("message", SessionPaths.message, {
          params: { sessionID: SessionID, messageID: MessageID },
          query: WorkspaceRoutingQuery,
          success: described(SessionV1.WithParts, "Message"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.message",
            summary: "Get message",
            description: "Retrieve a specific message from a session by its message ID.",
          }),
        ),
        HttpApiEndpoint.delete("remove", SessionPaths.remove, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Boolean, "Successfully deleted session"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, SessionBusyError, SessionTreeBusyError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.delete",
            summary: "Delete session",
            description: "Delete a session and permanently remove all associated data, including messages and history.",
          }),
        ),
        HttpApiEndpoint.patch("update", SessionPaths.update, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          payload: UpdatePayload,
          success: described(Session.Info, "Successfully updated session"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, SessionBusyError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.update",
            summary: "Update session",
            description: "Update properties of an existing session, such as title or other metadata.",
          }),
        ),
        HttpApiEndpoint.get("forkBasis", SessionPaths.forkBasis, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(ForkBasis, "Exact durable source frontier for a process-local fork draft"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.fork_basis",
            summary: "Read fork basis",
            description:
              "Read the exact source Session frontier for a process-local fork draft. This call creates no target Session.",
          }),
        ),
        HttpApiEndpoint.post("start", SessionPaths.start, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          payload: StartPayload,
          success: described(Turn.Info, "Admitted root Turn"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, InvalidRequestError, SessionBusyError, ...TurnErrors],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.start",
            summary: "Start exact Turn",
            description:
              "Admit one new root Turn using stable identities. This never becomes a steer; fork materialization is an atomic start variant.",
          }),
        ),
        HttpApiEndpoint.get("listTurns", SessionPaths.turns, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Turn.Info), "Turns in durable admission order"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, InvalidRequestError, SessionBusyError, ...TurnErrors],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.turns",
            summary: "List Session Turns",
            description:
              "Inspect every available durable Turn in one Session without reconstructing state from messages.",
          }),
        ),
        HttpApiEndpoint.get("activeTurn", SessionPaths.activeTurn, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(Schema.NullOr(Turn.Info), "Active Turn, or null when the Session is idle"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, InvalidRequestError, SessionBusyError, ...TurnErrors],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.active_turn",
            summary: "Get active Turn",
            description: "Read the exact durable active Turn and its matching live owner state.",
          }),
        ),
        HttpApiEndpoint.get("getTurn", SessionPaths.getTurn, {
          params: { sessionID: SessionID, turnID: Turn.ID },
          query: WorkspaceRoutingQuery,
          success: described(Turn.Info, "Exact Turn"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, InvalidRequestError, SessionBusyError, ...TurnErrors],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.get_turn",
            summary: "Get exact Turn",
            description: "Read one exact Turn without retargeting a replacement active Turn.",
          }),
        ),
        HttpApiEndpoint.get("awaitTurn", SessionPaths.awaitTurn, {
          params: { sessionID: SessionID, turnID: Turn.ID },
          query: WorkspaceRoutingQuery,
          success: described(Turn.Info, "Terminal exact Turn"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, InvalidRequestError, SessionBusyError, ...TurnErrors],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.await_turn",
            summary: "Await exact Turn",
            description: "Wait for one exact Turn to reach a durable terminal outcome.",
          }),
        ),
        HttpApiEndpoint.post("steer", SessionPaths.steer, {
          params: { sessionID: SessionID, turnID: Turn.ID },
          query: WorkspaceRoutingQuery,
          payload: SteerPayload,
          success: described(Turn.Input, "Promoted input of the exact Turn"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, InvalidRequestError, SessionBusyError, ...TurnErrors],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.steer",
            summary: "Steer exact Turn",
            description:
              "Promote one stable learner input into the named active Turn at its next safe boundary. This never moves to another Turn.",
          }),
        ),
        HttpApiEndpoint.post("interruptTurn", SessionPaths.interruptTurn, {
          params: { sessionID: SessionID, turnID: Turn.ID },
          query: WorkspaceRoutingQuery,
          success: described(Turn.Info, "Interrupted or already-terminal exact Turn"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, InvalidRequestError, SessionBusyError, ...TurnErrors],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.interrupt_turn",
            summary: "Interrupt exact Turn",
            description: "Interrupt the named Turn and its live descendant subtree; terminal replay is idempotent.",
          }),
        ),
        HttpApiEndpoint.post("shell", SessionPaths.shell, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          payload: ShellPayload,
          success: described(SessionV1.WithParts, "Created message"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, SessionBusyError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.shell",
            summary: "Run shell command",
            description: "Execute a shell command within the session context and return the AI's response.",
          }),
        ),
        HttpApiEndpoint.post("revert", SessionPaths.revert, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          payload: RevertPayload,
          success: described(Session.Info, "Updated session"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, SessionBusyError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.revert",
            summary: "Revert message",
            description:
              "Revert a specific message in a session, undoing its effects and restoring the previous state.",
          }),
        ),
        HttpApiEndpoint.post("unrevert", SessionPaths.unrevert, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(Session.Info, "Updated session"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, SessionBusyError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.unrevert",
            summary: "Restore reverted messages",
            description: "Restore all previously reverted messages in a session.",
          }),
        ),
        HttpApiEndpoint.post("permissionRespond", SessionPaths.permissions, {
          params: { sessionID: SessionID, permissionID: PermissionV1.ID },
          query: WorkspaceRoutingQuery,
          payload: PermissionResponsePayload,
          success: described(Schema.Boolean, "Permission processed successfully"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, PermissionNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "permission.respond",
            summary: "Respond to permission",
            description: "Approve, deny, or cancel a permission request from the AI assistant.",
            deprecated: true,
          }),
        ),
        HttpApiEndpoint.delete("deleteMessage", SessionPaths.deleteMessage, {
          params: { sessionID: SessionID, messageID: MessageID },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Boolean, "Successfully deleted message"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, SessionBusyError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.deleteMessage",
            summary: "Delete message",
            description:
              "Permanently delete a specific message and all of its parts from a session without reverting file changes.",
          }),
        ),
        HttpApiEndpoint.delete("deletePart", SessionPaths.deletePart, {
          params: { sessionID: SessionID, messageID: MessageID, partID: PartID },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Boolean, "Successfully deleted part"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, SessionBusyError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "part.delete",
            description: "Delete a part from a message.",
          }),
        ),
        HttpApiEndpoint.patch("updatePart", SessionPaths.updatePart, {
          params: { sessionID: SessionID, messageID: MessageID, partID: PartID },
          query: WorkspaceRoutingQuery,
          payload: SessionV1.Part,
          success: described(SessionV1.Part, "Successfully updated part"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, SessionBusyError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "part.update",
            description: "Update a part in a message.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "session",
          description: "Experimental HttpApi session routes.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "Repa experimental HttpApi",
      version: "0.0.1",
      description: "Experimental HttpApi surface for selected instance routes.",
    }),
  )
