import { expect, test } from "bun:test"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { createGitWorktreeProjectCopy } from "../../src/component/prompt/move"
import { json } from "../fixture/tui-sdk"

test("routes project-copy naming and creation through the active directory before atomically starting its Session", async () => {
  const projectID = "project-course"
  const startupDirectory = "C:\\learning\\launcher"
  const activeDirectory = "C:\\learning\\course"
  const worktreeRoot = "C:\\learning\\.repa-worktrees"
  const copyDirectory = "C:\\learning\\.repa-worktrees\\projec\\chapter-review"
  const requests: Array<{ method: string; url: URL; body?: unknown }> = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const url = new URL(request.url)
    const body = request.body ? await request.clone().json() : undefined
    requests.push({ method: request.method, url, body })

    if (url.pathname === `/experimental/project/${projectID}/copy/generate-name`)
      return json({ name: "chapter-review" })
    if (url.pathname === `/experimental/project/${projectID}/copy`)
      return json({ directory: copyDirectory, strategy: "git_worktree" })
    if (url.pathname === "/path")
      return json({ home: "C:\\learning", state: "", config: "", worktree: copyDirectory, directory: copyDirectory })
    if (url.pathname === "/session/ses_local/turn")
      return json({
        id: "trn_local",
        sessionID: "ses_local",
        admissionKind: "learner",
        initialInputID: "tri_local",
        currentInputID: "tri_local",
        limits: { model: 64, tool: 256 },
        counters: { model: 0, tool: 0 },
        state: "running",
        depth: 0,
        timeAdmitted: 1,
        causalTime: 1,
      })
    throw new Error(`unexpected request: ${request.method} ${url.pathname}`)
  }) as typeof globalThis.fetch
  const sdk = createOpencodeClient({ baseUrl: "http://test", directory: startupDirectory, fetch })

  const directory = await createGitWorktreeProjectCopy({
    projectID,
    context: "review chapter 3",
    activeDirectory,
    worktreeRoot,
    generateName: (input) => sdk.experimental.projectCopy.generateName(input, { throwOnError: true }),
    createCopy: (input) => sdk.v2.projectCopy.create(input, { throwOnError: true }),
    bootstrapDirectory: (directory) => sdk.path.get({ directory }, { throwOnError: true }),
  })
  const turn = await sdk.session.start(
    {
      sessionID: "ses_local",
      turnID: "trn_local",
      inputID: "tri_local",
      messageID: "msg_local",
      directory,
      agent: "study",
      model: { providerID: "test", modelID: "test-model" },
      parts: [{ type: "text", text: "review chapter 3" }],
      session: {},
    },
    { throwOnError: true },
  )

  expect(directory).toBe(copyDirectory)
  expect(turn.data.id).toBe("trn_local")
  expect(requests.map((request) => request.url.pathname)).toEqual([
    `/experimental/project/${projectID}/copy/generate-name`,
    `/experimental/project/${projectID}/copy`,
    "/path",
    "/session/ses_local/turn",
  ])
  expect(requests[1]?.body).toMatchObject({ strategy: "git_worktree" })
  expect(requests[0]?.url.searchParams.get("directory")).toBe(activeDirectory)
  expect(requests[1]?.url.searchParams.get("location[directory]")).toBe(activeDirectory)
  expect(requests[2]?.url.searchParams.get("directory")).toBe(copyDirectory)
  expect(requests[3]?.url.searchParams.get("directory")).toBe(copyDirectory)
  expect(
    requests.some((request) =>
      ["/experimental/control-plane", "/experimental/workspace", "/sync"].some((prefix) =>
        request.url.pathname.startsWith(prefix),
      ),
    ),
  ).toBe(false)
  expect(requests.every((request) => !request.url.searchParams.has("workspace"))).toBe(true)
})
