import path from "path"

process.env.REPA_DB = ":memory:"
process.env.REPA_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.REPA_DISABLE_MODELS_FETCH = "true"
