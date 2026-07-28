## project

> **Status — inherited OpenCode design note, not Repa product authority.** This file is retained as evidence about multi-project and worktree mechanics. Its goals and API sketch do not define Repa's learning-space, Session, runtime, or roadmap boundaries; consult root `AGENTS.md`, accepted Repa ADRs/Gates, and `docs/README.md` before applying it.
> Current Repa authority is indexed by the [documentation map](../docs/README.md).

The goal is to let a single instance of OpenCode run sessions for multiple projects and different worktrees per project.

### api

```
GET /project -> Project[]

POST /project/init -> Project


GET /project/:projectID/session -> Session[]

GET /project/:projectID/session/:sessionID -> Session

POST /project/:projectID/session -> Session
{
  id?: string
  parentID?: string
  directory: string
}

DELETE /project/:projectID/session/:sessionID

POST /project/:projectID/session/:sessionID/init

POST /project/:projectID/session/:sessionID/abort

POST /project/:projectID/session/:sessionID/share

DELETE /project/:projectID/session/:sessionID/share

POST /project/:projectID/session/:sessionID/compact

GET /project/:projectID/session/:sessionID/message -> { info: Message, parts: Part[] }[]

GET /project/:projectID/session/:sessionID/message/:messageID -> { info: Message, parts: Part[] }

POST /project/:projectID/session/:sessionID/message -> { info: Message, parts: Part[] }

POST /project/:projectID/session/:sessionID/revert -> Session

POST /project/:projectID/session/:sessionID/unrevert -> Session

POST /project/:projectID/session/:sessionID/permission/:permissionID -> Session

GET /project/:projectID/session/:sessionID/find/file -> string[]

GET /project/:projectID/session/:sessionID/file -> { type: "raw" | "patch", content: string }

GET /project/:projectID/session/:sessionID/file/status -> File[]

POST /log

// These are awkward

GET /provider?directory=<resolve path> -> Provider
GET /config?directory=<resolve path> -> Config // think only tui uses this?

GET /project/:projectID/agent?directory=<resolve path> -> Agent
GET /project/:projectID/find/file?directory=<resolve path> -> File

```
