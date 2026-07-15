import { afterAll } from "bun:test"
import os from "node:os"
import path from "node:path"
import fs from "node:fs/promises"

const database = path.join(os.tmpdir(), `repa-core-test-${process.pid}-${Date.now()}.db`)
process.env.REPA_DB = database
process.env.REPA_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.REPA_DISABLE_MODELS_FETCH = "true"

afterAll(async () => {
  await Promise.all(["", "-journal", "-wal", "-shm"].map((suffix) => fs.rm(database + suffix, { force: true })))
})
