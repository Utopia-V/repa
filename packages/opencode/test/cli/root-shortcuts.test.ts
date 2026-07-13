import { expect, test } from "bun:test"
import path from "path"

test("root shortcuts expose the terminal baseline but not dormant product surfaces", async () => {
  const manifest = await Bun.file(path.resolve(import.meta.dir, "../../../../package.json")).json()
  const scripts = manifest.scripts as Record<string, string>

  expect({
    dormant: Object.fromEntries(
      ["dev:desktop", "dev:web", "dev:console", "dev:stats", "dev:storybook", "sso", "translate:app"].map((name) => [
        name,
        name in scripts,
      ]),
    ),
    retained: {
      dev: scripts.dev,
      typecheck: scripts.typecheck,
      upgradeTui: scripts["upgrade-opentui"],
    },
  }).toEqual({
    dormant: {
      "dev:desktop": false,
      "dev:web": false,
      "dev:console": false,
      "dev:stats": false,
      "dev:storybook": false,
      sso: false,
      "translate:app": false,
    },
    retained: {
      dev: "bun run --cwd packages/opencode --conditions=browser src/index.ts",
      typecheck: "bun turbo typecheck",
      upgradeTui: "bun run script/upgrade-opentui.ts",
    },
  })
})
