import type { CommandModule } from "yargs"
import { OpenApi } from "effect/unstable/httpapi"
import { PublicApi } from "../../server/routes/instance/httpapi/public"

type Args = {}

export const GenerateCommand = {
  command: "generate",
  builder: (yargs) => yargs,
  handler: async () => {
    const json = await openapiJson()

    // Wait for stdout to finish writing before process.exit() is called
    await new Promise<void>((resolve, reject) => {
      process.stdout.write(json, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  },
} satisfies CommandModule<object, Args>

export async function openapiJson(options: { formatted?: boolean } = {}) {
  const specs = OpenApi.fromApi(PublicApi) as {
    paths: Record<string, Record<string, any>>
  }
  for (const item of Object.values(specs.paths)) {
    for (const method of ["get", "post", "put", "delete", "patch"] as const) {
      const operation = item[method]
      if (!operation?.operationId) continue
      operation["x-codeSamples"] = [
        {
          lang: "js",
          source: [
            `import { createOpencodeClient } from "@opencode-ai/sdk`,
            ``,
            `const client = createOpencodeClient()`,
            `await client.${operation.operationId}({`,
            `  ...`,
            `})`,
          ].join("\n"),
        },
      ]
    }
  }
  if (options.formatted === false) return JSON.stringify(specs)
  const prettier = await import("prettier")
  const babel = await import("prettier/plugins/babel")
  const estree = await import("prettier/plugins/estree")
  const format = prettier.format ?? prettier.default?.format
  return format(JSON.stringify(specs, null, 2), {
    parser: "json",
    plugins: [babel.default ?? babel, estree.default ?? estree],
    printWidth: 120,
  })
}
