import { expect, test } from "bun:test"
import { embedResearchWebUI } from "../../script/research-options"

test("Web assets require the explicit research-only build flag", () => {
  expect(embedResearchWebUI(["bun", "script/build.ts"])).toBe(false)
  expect(embedResearchWebUI(["bun", "script/build.ts", "--skip-embed-web-ui"])).toBe(false)
  expect(embedResearchWebUI(["bun", "script/build.ts", "--research-embed-web-ui"])).toBe(true)
})
