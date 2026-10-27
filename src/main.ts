import * as core from '@actions/core'
import { checkVersion, install } from './install.js'
import { defaultAudience, exchange, type Scope } from './oidc.js'
import { targetFor } from './platform.js'

/** Read by `dbginfo` itself (apps/cli, spec C3). */
const ENV = {
  apikey: 'DEBUGINFO_DEV_APIKEY',
  org: 'DEBUGINFO_DEV_ORG',
  url: 'DEBUGINFO_DEV_URL'
} as const

function optional(name: string): string | undefined {
  return core.getInput(name) || undefined
}

function scopeInput(): Scope {
  const scope = core.getInput('scope') || 'write'
  if (scope !== 'write' && scope !== 'read') {
    throw new Error(`scope must be 'write' or 'read', got '${scope}'`)
  }
  return scope
}

/**
 * The GitHub token is sent only to github.com. On GitHub Enterprise Server
 * the default `github.token` belongs to that server, and `dbginfo` is
 * released on github.com.
 */
function githubToken(apiUrl: string): string | undefined {
  const token = optional('github-token')
  if (!token) return undefined
  const server = process.env.GITHUB_SERVER_URL
  const onDotCom = !server || new URL(server).hostname === 'github.com'
  const toDotCom = new URL(apiUrl).hostname === 'api.github.com'
  return onDotCom || !toDotCom ? token : undefined
}

async function authenticate(url: string): Promise<void> {
  const apikey = optional('apikey')
  if (apikey) {
    core.setSecret(apikey)
    core.exportVariable(ENV.apikey, apikey)
    core.setOutput('authenticated', 'true')
    core.info('Authenticated with the given API key')
    return
  }

  if (!core.getBooleanInput('authenticate')) {
    core.setOutput('authenticated', 'false')
    return
  }

  if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
    throw new Error(
      'GitHub OIDC is not available to this job. Grant it with `permissions: id-token: write`, ' +
        'pass `apikey`, or set `authenticate: false`. (Pull requests from forks never receive an ID token.)'
    )
  }

  const audience = optional('audience') ?? defaultAudience(url)
  const exchanged = await exchange({
    url,
    audience,
    org: optional('org'),
    project: optional('project'),
    scope: scopeInput(),
    getIDToken: (aud) => core.getIDToken(aud)
  })

  core.setSecret(exchanged.token)
  core.exportVariable(ENV.apikey, exchanged.token)
  core.exportVariable(ENV.org, exchanged.org)
  core.setOutput('authenticated', 'true')
  core.setOutput('org', exchanged.org)
  core.setOutput('project', exchanged.project)
  core.setOutput('expires-at', exchanged.expiresAt)
  core.setOutput('credential-id', exchanged.credentialId)
  core.info(
    `Authenticated to ${exchanged.org}/${exchanged.project} (${exchanged.scope}) until ${exchanged.expiresAt}`
  )
}

export async function run(): Promise<void> {
  try {
    const url = core.getInput('url') || 'https://api.debuginfo.dev'
    const apiUrl = core.getInput('github-api-url') || 'https://api.github.com'

    if (core.getInput('install') !== 'false') {
      const bin = await install({
        repository: core.getInput('repository') || 'elide-dev/debuginfo.dev',
        version: core.getInput('version') || 'latest',
        apiUrl,
        token: githubToken(apiUrl),
        target: targetFor(process.platform, process.arch)
      })
      await checkVersion(bin)
      core.addPath(bin.dir)
      core.setOutput('version', bin.version)
      core.setOutput('path', bin.path)
      core.info(
        `dbginfo ${bin.version} ${bin.cached ? 'restored from the tool cache' : 'installed'} at ${bin.path}`
      )
    }

    core.exportVariable(ENV.url, url)
    const org = optional('org')
    if (org) core.exportVariable(ENV.org, org)

    // After the install, so the token's 15 minutes are spent on the job.
    await authenticate(url)
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}
