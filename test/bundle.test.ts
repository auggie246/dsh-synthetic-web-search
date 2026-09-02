import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'
import { load } from 'js-yaml'

interface PackageManifest {
  dsh?: {
    bundle?: {
      patch?: string
    }
  }
  files?: string[]
}

interface InsertRow {
  id?: string
  name?: string
  config?: unknown
}

interface PatchEntry {
  id?: string
  config?: unknown
  insert?: InsertRow[]
}

const PACKAGE_NAME = '@auggieteo/dsh-synthetic-web-search'
/** The id existing manual profile rows already use; any other id mounts the plugin twice. */
const PROFILE_ROW_ID = 'synthetic-web-search'

test('declares and publishes its DSH profile layer', async () => {
  const packageUrl = new URL('../package.json', import.meta.url)
  const manifest = JSON.parse(await readFile(packageUrl, 'utf8')) as PackageManifest
  const patch = manifest.dsh?.bundle?.patch

  assert.equal(patch, './cordis.patch.yml')
  assert.ok(manifest.files?.includes('cordis.patch.yml'))
  await access(new URL(`..${patch.slice(1)}`, import.meta.url))
})

test('bundle patch mounts Synthetic and selects it as the web search provider', async () => {
  const source = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const entries = load(source) as PatchEntry[]

  assert.ok(Array.isArray(entries))
  assert.equal(entries.length, 2)

  const rows = entries[0]?.insert
  assert.ok(Array.isArray(rows))
  assert.equal(rows.length, 1)

  const row = rows[0] ?? {}
  // The id must equal the id users already have in their manual profile rows.
  assert.equal(row.id, PROFILE_ROW_ID)
  // The name must equal the dependency key the profile resolves.
  assert.equal(row.name, PACKAGE_NAME)
  assert.equal(row.config, undefined)

  // The bundled layer follows DSH's base layer and replaces its
  // `deepseek-official` provider selection during installation.
  assert.equal(entries[1]?.id, 'web')
  assert.deepEqual(entries[1]?.config, { searchProvider: 'synthetic' })
})
