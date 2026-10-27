/**
 * Node's `fetch` rejects with a bare "fetch failed" and hides the reason
 * (DNS, refused connection, TLS) in `cause`. Surface it, and the host, so a
 * failed step says what actually went wrong.
 */
export function networkError(what: string, url: string, error: unknown): Error {
  let reason = error instanceof Error ? error.message : String(error)
  const cause = error instanceof Error ? error.cause : undefined
  if (cause instanceof Error) {
    const code = (cause as { code?: unknown }).code
    reason =
      typeof code === 'string' && !cause.message.includes(code)
        ? `${code}: ${cause.message}`
        : cause.message
  }
  let host = url
  try {
    host = new URL(url).host
  } catch {
    // Not a URL; name it as given.
  }
  return new Error(`${what}: could not reach ${host} (${reason})`, {
    cause: error
  })
}
