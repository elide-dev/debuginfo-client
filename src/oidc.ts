import { networkError } from './errors.js'

/**
 * The GitHub OIDC credential exchange (debuginfo.dev, proposed D24:
 * docs/superpowers/specs/2026-09-22-github-oidc-exchange-design.md, section 3).
 *
 * The runner's ID token goes in the request BODY. `Authorization` is the
 * debuginfo credential slot (D21), and the edge would try to resolve a GitHub
 * JWT there as one of its own signed tokens.
 */

export const EXCHANGE_PATH = '/auth/github/oidc'

export type Scope = 'write' | 'read'

export interface ExchangeRequest {
  /** Service base URL, e.g. `https://api.debuginfo.dev`. */
  url: string
  audience: string
  org?: string
  project?: string
  scope: Scope
  getIDToken: (audience: string) => Promise<string>
  fetch?: typeof fetch
}

export interface Exchanged {
  token: string
  org: string
  project: string
  scope: string
  expiresAt: string
  credentialId: string
}

/** The service origin: one audience per environment, so a staging token cannot be replayed against prod. */
export function defaultAudience(url: string): string {
  return new URL(url).origin
}

export function exchangeUrl(url: string): string {
  return url.replace(/\/+$/, '') + EXCHANGE_PATH
}

/**
 * Fallbacks for a refusal that arrives with no message. The server's own
 * text is more specific (it names the subject a 403 saw, for one), so it
 * wins, except that only the action knows about its `apikey` input.
 */
const HINTS: Record<number, string> = {
  401: 'the service rejected the GitHub ID token; check that `audience` matches the service',
  403: 'this repository is not linked to a debuginfo.dev project, or its OIDC subject pattern does not match this workflow run',
  409: 'this repository is linked in more than one org; set the `org` input',
  501: 'this debuginfo.dev deployment does not support OIDC exchange; pass `apikey` instead'
}

export async function exchange(request: ExchangeRequest): Promise<Exchanged> {
  const doFetch = request.fetch ?? fetch
  const idToken = await request.getIDToken(request.audience)

  const body: Record<string, string> = {
    token: idToken,
    scope: request.scope
  }
  if (request.org) body.org = request.org
  if (request.project) body.project = request.project

  const url = exchangeUrl(request.url)
  let response: Response
  try {
    response = await doFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'setup-debuginfo'
      },
      body: JSON.stringify(body)
    })
  } catch (error) {
    throw networkError('OIDC exchange failed', url, error)
  }

  if (!response.ok) {
    const text = (await response.text()).trim().slice(0, 500)
    const hint =
      !text || response.status === 501 ? HINTS[response.status] : undefined
    throw new Error(
      `OIDC exchange with ${request.url} failed: HTTP ${response.status}` +
        (text ? `: ${text}` : '') +
        (hint ? ` (${hint})` : '')
    )
  }

  const json = (await response.json()) as Record<string, unknown>
  const field = (name: string): string => {
    const value = json[name]
    if (typeof value !== 'string' || value === '') {
      throw new Error(
        `OIDC exchange with ${request.url} returned no \`${name}\``
      )
    }
    return value
  }
  return {
    token: field('token'),
    org: field('org'),
    project: field('project'),
    scope: field('scope'),
    expiresAt: field('expires_at'),
    credentialId: field('credential_id')
  }
}
