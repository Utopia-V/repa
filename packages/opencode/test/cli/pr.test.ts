import { chmod, mkdir } from "node:fs/promises"
import path from "node:path"
import { expect } from "bun:test"
import { Effect } from "effect"
import { cliIt } from "../lib/cli-process"

async function fakeExecutable(directory: string, name: string, windows: string, posix: string) {
  const file = path.join(directory, process.platform === "win32" ? `${name}.cmd` : name)
  await Bun.write(file, process.platform === "win32" ? windows : posix)
  if (process.platform !== "win32") await chmod(file, 0o755)
}

cliIt.live(
  "checks out a PR and launches Repa without importing hosted share links",
  ({ home, opencode: repa }) =>
    Effect.gen(function* () {
      const init = Bun.spawn(["git", "init"], { cwd: home, stdout: "ignore", stderr: "ignore" })
      expect(yield* Effect.promise(() => init.exited)).toBe(0)

      const bin = path.join(home, "fake-bin")
      const trace = path.join(home, "pr-trace.txt")
      yield* Effect.promise(() => mkdir(bin, { recursive: true }))
      yield* Effect.promise(() =>
        fakeExecutable(
          bin,
          "gh",
          [
            "@echo off",
            'echo gh %*>>"%REPA_PR_TRACE%"',
            'if "%1"=="pr" if "%2"=="view" echo {"headRepository":null,"headRepositoryOwner":null,"isCrossRepository":false,"headRefName":"feature"}',
            "exit /b 0",
          ].join("\r\n"),
          [
            "#!/usr/bin/env sh",
            'printf "gh %s\\n" "$*" >> "$REPA_PR_TRACE"',
            'if [ "$1" = "pr" ] && [ "$2" = "view" ]; then',
            "  printf '%s\\n' '{\"headRepository\":null,\"headRepositoryOwner\":null,\"isCrossRepository\":false,\"headRefName\":\"feature\"}'",
            "fi",
          ].join("\n"),
        ),
      )
      yield* Effect.promise(() =>
        fakeExecutable(
          bin,
          "repa",
          ["@echo off", 'echo repa %*>>"%REPA_PR_TRACE%"', "exit /b 0"].join("\r\n"),
          ["#!/usr/bin/env sh", 'printf "repa %s\\n" "$*" >> "$REPA_PR_TRACE"'].join("\n"),
        ),
      )

      const result = yield* repa.spawn(["pr", "42"], {
        env: {
          PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
          REPA_PR_TRACE: trace,
        },
      })
      const calls = (yield* Effect.promise(() => Bun.file(trace).text()))
        .split(/\r?\n/)
        .map((line) => line.replaceAll('"', "").trim())
        .filter(Boolean)

      expect(result.exitCode).toBe(0)
      expect(result.stdout + result.stderr).toContain("Successfully checked out PR #42")
      expect(calls).toEqual([
        "gh pr checkout 42 --branch pr/42 --force",
        "gh pr view 42 --json headRepository,headRepositoryOwner,isCrossRepository,headRefName",
        "repa",
      ])
      expect(calls.join(" ")).not.toContain("import")
      expect(calls.join(" ")).not.toContain("opncd.ai")
    }),
  60_000,
)
