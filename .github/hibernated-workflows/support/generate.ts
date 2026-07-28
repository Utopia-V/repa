#!/usr/bin/env bun

import { $ } from "bun"

if (process.env.REPA_RUN_HIBERNATED_OPENCODE_AUTOMATION !== "1")
  throw new Error("Refusing to run hibernated upstream generation automation")

await $`bun ./packages/sdk/js/script/build.ts`

await $`bun dev generate > ../sdk/openapi.json`.cwd("packages/opencode")

await $`bun prettier --write packages/sdk/openapi.json`
