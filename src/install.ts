import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as tc from '@actions/tool-cache'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseChecksums, verifyChecksum } from './checksum.js'
import { assetName, type Target } from './platform.js'
import {
  fetchRelease,
  findAsset,
  normalizeVersion,
  type ReleaseAsset
} from './release.js'

const TOOL = 'dbginfo'

export interface InstallOptions {
  repository: string
  version: string
  apiUrl: string
  token?: string
  target: Target
}

export interface Installed {
  version: string
  /** Directory holding the binary; the one added to PATH. */
  dir: string
  /** Full path of the binary. */
  path: string
  cached: boolean
}

async function download(
  asset: ReleaseAsset,
  token: string | undefined
): Promise<string> {
  return tc.downloadTool(
    asset.url,
    undefined,
    token ? `Bearer ${token}` : undefined,
    { accept: 'application/octet-stream' }
  )
}

/**
 * Installs `dbginfo` into the runner's tool cache, verifying the archive
 * against the release's `SHA256SUMS`. An exact version already in the cache
 * costs no network at all; `latest` has to ask GitHub which version that is.
 */
export async function install(options: InstallOptions): Promise<Installed> {
  const { target } = options
  const requested = normalizeVersion(options.version)

  if (requested !== 'latest') {
    const hit = tc.find(TOOL, requested, target.triple)
    if (hit) return installed(requested, hit, target, true)
  }

  const release = await fetchRelease({
    repository: options.repository,
    version: requested,
    apiUrl: options.apiUrl,
    token: options.token
  })
  const version = release.version

  if (requested === 'latest') {
    const hit = tc.find(TOOL, version, target.triple)
    if (hit) return installed(version, hit, target, true)
  }

  const name = assetName(version, target)
  const archive = findAsset(release, name)
  const sums = findAsset(release, 'SHA256SUMS')

  core.info(`Downloading ${name} from ${options.repository}@${release.tag}`)
  const [archivePath, sumsPath] = await Promise.all([
    download(archive, options.token),
    download(sums, options.token)
  ])
  await verifyChecksum(
    archivePath,
    name,
    parseChecksums(await readFile(sumsPath, 'utf8'))
  )

  const extracted =
    target.archive === 'zip'
      ? await tc.extractZip(archivePath)
      : await tc.extractTar(archivePath)
  const dir = await tc.cacheDir(extracted, TOOL, version, target.triple)
  return installed(version, dir, target, false)
}

function installed(
  version: string,
  dir: string,
  target: Target,
  cached: boolean
): Installed {
  return { version, dir, path: join(dir, target.binary), cached }
}

/**
 * The release workflow's own check: a binary that reports another version is
 * a stale or mislabelled build, and should not be trusted with a credential.
 */
export async function checkVersion(bin: Installed): Promise<void> {
  const { stdout } = await exec.getExecOutput(bin.path, ['--version'], {
    silent: true,
    // `--version` sends nothing today; this keeps it that way if it ever did.
    env: { ...process.env, DO_NOT_TRACK: '1' } as Record<string, string>
  })
  const reported = stdout.trim()
  if (reported !== bin.version) {
    throw new Error(
      `dbginfo --version printed '${reported}', expected '${bin.version}'`
    )
  }
}
