import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

interface PackageManifest {
  dsh?: {
    bundle?: {
      patch?: string
    }
  }
  files?: string[]
}

test('declares and publishes its DSH profile layer', async () => {
  const packageUrl = new URL('../package.json', import.meta.url)
  const manifest = JSON.parse(await readFile(packageUrl, 'utf8')) as PackageManifest
  const patch = manifest.dsh?.bundle?.patch

  assert.equal(patch, './cordis.patch.yml')
  assert.ok(manifest.files?.includes('cordis.patch.yml'))
  await access(new URL(`..${patch.slice(1)}`, import.meta.url))
})
