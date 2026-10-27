import { networkError } from './errors.js'

/**
 * Resolves a `dbginfo` release through the GitHub REST API.
 *
 * Assets are downloaded through their API URL (`Accept: application/octet-stream`)
 * rather than `browser_download_url`, because only the API form accepts a
 * token, which is what lets the same code read a private or internal
 * repository's releases.
 */

export interface ReleaseAsset {
  name: string
  /** REST API URL of the asset. */
  url: string
}

export interface Release {
  tag: string
  /** The tag without its leading `v`; what `dbginfo --version` prints. */
  version: string
  assets: ReleaseAsset[]
}

export interface ReleaseQuery {
  /** `owner/name` of the repository publishing `dbginfo`. */
  repository: string
  /** `latest`, or an exact version with or without a leading `v`. */
  version: string
  apiUrl: string
  token?: string
  fetch?: typeof fetch
}

/** `v0.1.0` -> `0.1.0`; `latest` is passed through. */
export function normalizeVersion(version: string): string {
  const trimmed = version.trim()
  if (trimmed === '' || trimmed === 'latest') return 'latest'
  return trimmed.replace(/^v/, '')
}

export function githubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'setup-debuginfo'
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export async function fetchRelease(query: ReleaseQuery): Promise<Release> {
  const doFetch = query.fetch ?? fetch
  const version = normalizeVersion(query.version)
  const base = query.apiUrl.replace(/\/+$/, '')
  const path =
    version === 'latest'
      ? `releases/latest`
      : `releases/tags/v${encodeURIComponent(version)}`
  const url = `${base}/repos/${query.repository}/${path}`

  let response: Response
  try {
    response = await doFetch(url, { headers: githubHeaders(query.token) })
  } catch (error) {
    throw networkError(
      `could not look up ${query.repository} releases`,
      url,
      error
    )
  }
  if (!response.ok) {
    const what =
      version === 'latest' ? 'the latest release' : `release v${version}`
    let hint = ''
    if (response.status === 404) {
      hint = query.token
        ? ' (the release does not exist, or the token cannot read that repository)'
        : ' (the release does not exist, or the repository is private and no token was given)'
    }
    throw new Error(
      `could not find ${what} of ${query.repository}: HTTP ${response.status}${hint}`
    )
  }

  const body = (await response.json()) as {
    tag_name?: unknown
    assets?: { name?: unknown; url?: unknown }[]
  }
  if (typeof body.tag_name !== 'string') {
    throw new Error(`release of ${query.repository} has no tag_name`)
  }
  const assets = (body.assets ?? []).flatMap((a) =>
    typeof a.name === 'string' && typeof a.url === 'string'
      ? [{ name: a.name, url: a.url }]
      : []
  )
  return {
    tag: body.tag_name,
    version: body.tag_name.replace(/^v/, ''),
    assets
  }
}

export function findAsset(release: Release, name: string): ReleaseAsset {
  const asset = release.assets.find((a) => a.name === name)
  if (!asset) {
    const have = release.assets.map((a) => a.name).join(', ') || 'none'
    throw new Error(
      `release ${release.tag} has no asset named ${name} (assets: ${have})`
    )
  }
  return asset
}
