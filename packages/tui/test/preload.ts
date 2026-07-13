import { afterAll } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"

const root = path.join(os.tmpdir(), `repa-tui-test-${process.pid}`)
await fs.mkdir(root, { recursive: true })

process.env.XDG_DATA_HOME = path.join(root, "data")
process.env.XDG_CACHE_HOME = path.join(root, "cache")
process.env.XDG_CONFIG_HOME = path.join(root, "config")
process.env.XDG_STATE_HOME = path.join(root, "state")
process.env.REPA_TEST_HOME = path.join(root, "home")

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
})
