import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

/**
 * Parses `sha256sum` output: `<64 hex>  <name>` per line, with `*<name>` for
 * binary mode. The release's `SHA256SUMS` is generated from inside the asset
 * directory, so names are bare.
 */
export function parseChecksums(text: string): Map<string, string> {
  const sums = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line.trim())
    if (match) sums.set(match[2], match[1].toLowerCase())
  }
  return sums
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export async function verifyChecksum(
  path: string,
  name: string,
  sums: Map<string, string>
): Promise<void> {
  const expected = sums.get(name)
  if (!expected) throw new Error(`SHA256SUMS has no entry for ${name}`)
  const actual = await sha256File(path)
  if (actual !== expected) {
    throw new Error(
      `checksum mismatch for ${name}: expected ${expected}, got ${actual}`
    )
  }
}
