# Inherited Control-Plane Development Simulator

> **Status — retained source-local test harness, not Repa deployment architecture.** This plugin simulates an inherited remote-workspace flow for focused maintenance. It does not establish a Repa control plane, background service, remote execution product, startup path, build target, or release surface; an accepted Repa ADR or Gate must explicitly admit any such boundary.
> Current Repa authority is indexed by the [documentation map](../../../../../docs/README.md).

For explicit source-local investigation of this retained harness, add the
plugin to a temporary Repa config such as `.repa/repa.jsonc`:

```json
  "plugin": ["../packages/opencode/src/control-plane/dev/debug-workspace-plugin.ts"],
```

The inherited workflow then ran a separate OpenCode server in another terminal. It acts as a local stand-in for a remote server while the local instance proxies requests to it:

```
./packages/opencode/script/run-workspace-server
```

When intentionally exercising this harness, OpenCode can create a `debug` workspace type that talks to the second workspace server started above.

How this works:

- The workspace server needs to know the workspace id and port to run. It waits for this information to be written to a file and starts the server when the data is written.
- The debug plugin writes this information in the `create` call to the workspace. So create a `debug` workspace will always kick off a new external server.
- The server script watches for file changes, so whenver you create a new `debug` workspace it will restart with the new information. This means that there is only ever one working `debug` workspace at a time; when you create a new one all previous sessions will show that it can't connect because previous debug workspaces do not exist.
