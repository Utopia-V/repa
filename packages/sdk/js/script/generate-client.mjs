import { createClient } from "@hey-api/openapi-ts"
import path from "node:path"
import { fileURLToPath } from "node:url"

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

await createClient({
  input: path.join(dir, "openapi.json"),
  output: {
    path: path.join(dir, "src/v2/gen"),
    tsConfigPath: path.join(dir, "tsconfig.json"),
    clean: true,
  },
  plugins: [
    { name: "@hey-api/typescript", exportFromIndex: false },
    { name: "@hey-api/sdk", instance: "OpencodeClient", exportFromIndex: false, auth: false, paramsStructure: "flat" },
    { name: "@hey-api/client-fetch", exportFromIndex: false, baseUrl: "http://localhost:4096" },
  ],
})
