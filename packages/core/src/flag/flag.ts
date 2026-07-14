import { Config } from "effect"

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

const copy = process.env["REPA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
const fff = process.env["REPA_DISABLE_FFF"]

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("REPA_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  REPA_AUTO_HEAP_SNAPSHOT: truthy("REPA_AUTO_HEAP_SNAPSHOT"),
  REPA_GIT_BASH_PATH: process.env["REPA_GIT_BASH_PATH"],
  REPA_CONFIG: process.env["REPA_CONFIG"],
  REPA_CONFIG_CONTENT: process.env["REPA_CONFIG_CONTENT"],
  REPA_DISABLE_PRUNE: truthy("REPA_DISABLE_PRUNE"),
  REPA_DISABLE_TERMINAL_TITLE: truthy("REPA_DISABLE_TERMINAL_TITLE"),
  REPA_SHOW_TTFD: truthy("REPA_SHOW_TTFD"),
  REPA_DISABLE_AUTOCOMPACT: truthy("REPA_DISABLE_AUTOCOMPACT"),
  REPA_DISABLE_MODELS_FETCH: truthy("REPA_DISABLE_MODELS_FETCH"),
  REPA_DISABLE_MOUSE: truthy("REPA_DISABLE_MOUSE"),
  REPA_FAKE_VCS: process.env["REPA_FAKE_VCS"],
  REPA_SERVER_PASSWORD: process.env["REPA_SERVER_PASSWORD"],
  REPA_SERVER_USERNAME: process.env["REPA_SERVER_USERNAME"],
  REPA_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("REPA_DISABLE_FFF"),

  // Experimental
  REPA_EXPERIMENTAL_FILEWATCHER: Config.boolean("REPA_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  REPA_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("REPA_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  REPA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("REPA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  REPA_MODELS_URL: process.env["REPA_MODELS_URL"],
  REPA_MODELS_PATH: process.env["REPA_MODELS_PATH"],
  REPA_DB: process.env["REPA_DB"],

  REPA_WORKSPACE_ID: process.env["REPA_WORKSPACE_ID"],
  REPA_EXPERIMENTAL_WORKSPACES: enabledByExperimental("REPA_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get REPA_DISABLE_PROJECT_CONFIG() {
    return truthy("REPA_DISABLE_PROJECT_CONFIG")
  },
  get REPA_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("REPA_EXPERIMENTAL_REFERENCES")
  },
  get REPA_TUI_CONFIG() {
    return process.env["REPA_TUI_CONFIG"]
  },
  get REPA_CONFIG_DIR() {
    return process.env["REPA_CONFIG_DIR"]
  },
  get REPA_PURE() {
    return truthy("REPA_PURE")
  },
  get REPA_PERMISSION() {
    return process.env["REPA_PERMISSION"]
  },
  get REPA_PLUGIN_META_FILE() {
    return process.env["REPA_PLUGIN_META_FILE"]
  },
  get REPA_CLIENT() {
    return process.env["REPA_CLIENT"] ?? "cli"
  },
}
