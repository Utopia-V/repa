declare global {
  const REPA_VERSION: string
  const REPA_CHANNEL: string
}

export const InstallationVersion = typeof REPA_VERSION === "string" ? REPA_VERSION : "local"
export const InstallationChannel = typeof REPA_CHANNEL === "string" ? REPA_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
