export async function fetchPinnedText(
  url: string,
  options: { timeoutMs?: number; retries?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? 20_000
  const retries = options.retries ?? 1
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
      if (response.ok) return await response.text()
      const error = new Error(`Pinned course material returned HTTP ${response.status}`)
      if (response.status < 500 || attempt === retries) throw error
      lastError = error
    } catch (error) {
      lastError = error
      if (attempt === retries) throw error
    }
    await Bun.sleep(250 * (attempt + 1))
  }

  throw lastError
}
