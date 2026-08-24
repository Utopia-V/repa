import rootPkg from "../../../package.json"
import pkg from "../package.json"

if (rootPkg.version !== pkg.version) {
  throw new Error(`Repa product/package version mismatch: ${rootPkg.version} != ${pkg.version}`)
}
if (!rootPkg.repa.channel) {
  throw new Error("Repa development channel is unavailable")
}

Object.assign(globalThis as typeof globalThis & { REPA_CHANNEL: string; REPA_VERSION: string }, {
  REPA_CHANNEL: rootPkg.repa.channel,
  REPA_VERSION: rootPkg.version,
})

await import("../src/index")
