import { Installation } from "@/installation"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { GlobalBus } from "@/bus/global"

export type UpgradePolicy = {
  mode: boolean | "notify"
  alwaysNotify?: boolean
}

/** Hibernated updater logic. A future release owner must supply policy explicitly. */
export async function upgrade(policy: UpgradePolicy) {
  if (policy.mode === false) return
  const method = await Installation.method()
  const latest = await Installation.latest(method).catch(() => {})
  if (!latest) return

  if (policy.alwaysNotify) {
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: Installation.Event.UpdateAvailable.type,
        properties: { version: latest },
      },
    })
    return
  }

  if (InstallationVersion === latest) return

  const kind = Installation.getReleaseType(InstallationVersion, latest)

  if (policy.mode === "notify" || kind !== "patch") {
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: Installation.Event.UpdateAvailable.type,
        properties: { version: latest },
      },
    })
    return
  }

  if (method === "unknown") return
  await Installation.upgrade(method, latest)
    .then(() =>
      GlobalBus.emit("event", {
        directory: "global",
        payload: {
          type: Installation.Event.Updated.type,
          properties: { version: latest },
        },
      }),
    )
    .catch(() => {})
}
