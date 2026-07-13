import { expect, test } from "bun:test"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { createGitWorktreeProjectCopy } from "../../src/component/prompt/move"
import { json } from "../fixture/tui-sdk"

test("creates a git worktree copy and then creates the Session in its returned directory", async () => {
  const projectID = "project-course"
  const baseDirectory = "C:\\learning\\course"
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
    if (url.pathname === "/session")
      return json({
        id: "ses_local",
        slug: "local",
        projectID,
        directory: copyDirectory,
        title: "New session",
        version: "test",
        time: { created: 1, updated: 1 },
      })
    throw new Error(`unexpected request: ${request.method} ${url.pathname}`)
  }) as typeof globalThis.fetch
  const sdk = createOpencodeClient({ baseUrl: "http://test", directory: baseDirectory, fetch })

  const directory = await createGitWorktreeProjectCopy({
    projectID,
    context: "review chapter 3",
    sdkDirectory: baseDirectory,
    worktreeRoot,
    generateName: (input) => sdk.experimental.projectCopy.generateName(input, { throwOnError: true }),
    createCopy: (input) => sdk.v2.projectCopy.create(input, { throwOnError: true }),
    bootstrapDirectory: (directory) => sdk.path.get({ directory }, { throwOnError: true }),
  })
  const session = await sdk.session.create(
    {
      directory,
      agent: "study",
      model: { providerID: "test", id: "test-model" },
    },
    { throwOnError: true },
  )

  expect(directory).toBe(copyDirectory)
  expect(session.data.id).toBe("ses_local")
  expect(requests.map((request) => request.url.pathname)).toEqual([
    `/experimental/project/${projectID}/copy/generate-name`,
    `/experimental/project/${projectID}/copy`,
    "/path",
    "/session",
  ])
  expect(requests[1]?.body).toMatchObject({ strategy: "git_worktree" })
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
