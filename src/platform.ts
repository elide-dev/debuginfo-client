/**
 * Maps the runner's platform to one of the five targets `dbginfo` is released
 * for (debuginfo.dev `release.yml`, the `cli` matrix). Linux builds are
 * musl-static, so one binary covers every distribution with no glibc floor.
 */

export interface Target {
  /** Rust target triple, as it appears in the release asset name. */
  triple: string
  /** Archive format of the release asset. */
  archive: 'tar.gz' | 'zip'
  /** File name of the binary inside the archive. */
  binary: string
}

const TRIPLES: Record<string, string> = {
  'linux-x64': 'x86_64-unknown-linux-musl',
  'linux-arm64': 'aarch64-unknown-linux-musl',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc'
}

export function targetFor(platform: string, arch: string): Target {
  const triple = TRIPLES[`${platform}-${arch}`]
  if (!triple) {
    const supported = Object.keys(TRIPLES).join(', ')
    throw new Error(
      `dbginfo is not released for ${platform}-${arch} (supported: ${supported})`
    )
  }
  const windows = platform === 'win32'
  return {
    triple,
    archive: windows ? 'zip' : 'tar.gz',
    binary: windows ? 'dbginfo.exe' : 'dbginfo'
  }
}

/** The release asset name, `dbginfo-<version>-<triple>.<ext>`. */
export function assetName(version: string, target: Target): string {
  return `dbginfo-${version}-${target.triple}.${target.archive}`
}
