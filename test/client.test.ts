import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const PUBLIC_PACKAGE_ID = '@auggieteo/dsh-synthetic-web-search'
const LEGACY_PACKAGE_ID = '@deepseek-ai/dsh-web-search-synthetic'

async function registeredClientIds(): Promise<string[]> {
  const source = await readFile(new URL('../src/client.js', import.meta.url), 'utf8')
  const ids: string[] = []
  const window = {
    __ModuleLoader__: {
      load(registration: { id: string }): void {
        ids.push(registration.id)
      },
    },
  }

  vm.runInNewContext(source, { window })
  return ids
}

test('registers the client factory for public and legacy graph row IDs', async () => {
  const ids = await registeredClientIds()

  assert.ok(ids.includes(PUBLIC_PACKAGE_ID))
  assert.ok(
    ids.includes(LEGACY_PACKAGE_ID),
    `client-modules: bundle loaded without registering "${LEGACY_PACKAGE_ID}" via __ModuleLoader__.load`,
  )
})
