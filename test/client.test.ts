import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const PUBLIC_PACKAGE_ID = '@auggieteo/dsh-synthetic-web-search'
const LEGACY_PACKAGE_ID = '@deepseek-ai/dsh-web-search-synthetic'
const SETTINGS_NAMESPACE = 'web-search-synthetic'
const API_KEY_ENV = 'SYNTHETIC_API_KEY'

interface LoaderRegistration {
  id: string
  factory: (require: (id: string) => unknown) => {
    inject: string[]
    apply: (ctx: unknown) => void
    credentialsWire?: (ctx: unknown) => WireFace | undefined
  }
}

interface WireFace {
  kind: 'remote' | 'connection-api'
  describe(reference: string): Promise<{ configured?: boolean; writable?: boolean } | undefined>
  set(reference: string, value: string): Promise<void>
}

async function loadClientModule(): Promise<{ ids: string[]; factories: Array<LoaderRegistration['factory']> }> {
  const source = await readFile(new URL('../src/client.js', import.meta.url), 'utf8')
  const ids: string[] = []
  const factories: Array<LoaderRegistration['factory']> = []
  const window = {
    __ModuleLoader__: {
      load(registration: LoaderRegistration): void {
        ids.push(registration.id)
        factories.push(registration.factory)
      },
    },
  }

  vm.runInNewContext(source, { window })
  return { ids, factories }
}

test('registers the client factory for public and legacy graph row IDs', async () => {
  const { ids } = await loadClientModule()

  assert.ok(ids.includes(PUBLIC_PACKAGE_ID))
  assert.ok(
    ids.includes(LEGACY_PACKAGE_ID),
    `client-modules: bundle loaded without registering "${LEGACY_PACKAGE_ID}" via __ModuleLoader__.load`,
  )
})

test('client plugin declares the card on the settings.plugin.item slot', async () => {
  const { factories } = await loadClientModule()
  const plugin = factories[0]?.(() => ({}))
  assert.ok(plugin, 'factory returned no module')

  assert.deepEqual(JSON.parse(JSON.stringify(plugin.inject)), ['slots', 'settingsScope', 'connection'])

  const calls: { injectName?: string; spec?: unknown; component?: unknown } = {}
  const boundSpecs: unknown[] = []
  plugin.apply({
    get: () => undefined,
    settingsScope: { bind: (spec: unknown) => { boundSpecs.push(spec); return { getSnapshot: () => ({}) } } },
    connection: {},
    slots: {
      inject: (name: string, callback: () => () => void) => { calls.injectName = name; return callback() },
      register: (spec: unknown, component: unknown) => { calls.spec = spec; calls.component = component; return () => {} },
    },
  })

  assert.equal(calls.injectName, 'settings.plugin.item')
  assert.deepEqual(JSON.parse(JSON.stringify(boundSpecs)), [{ namespace: SETTINGS_NAMESPACE }])
  assert.deepEqual(JSON.parse(JSON.stringify(calls.spec)), { name: 'settings.plugin.item', key: SETTINGS_NAMESPACE })
  assert.equal(typeof calls.component, 'function')
})

test('credentialsWire prefers ctx.remote with positional args and an ok envelope', async () => {
  const { factories } = await loadClientModule()
  const plugin = factories[0]?.(() => ({}))
  assert.ok(plugin?.credentialsWire, 'credentialsWire is not exported')

  const describeCalls: unknown[] = []
  const setCalls: unknown[] = []
  const ctx = {
    get: (name: string) => (name === 'remote' ? {
      credentials: {
        describe: async (refs: string[]) => {
          describeCalls.push(refs)
          return { ok: true, value: { [API_KEY_ENV]: { configured: false, writable: true } } }
        },
        set: async (reference: string, value: string) => {
          setCalls.push([reference, value])
          return { ok: true }
        },
      },
    } : undefined),
    connection: {},
  }

  const wire = plugin.credentialsWire(ctx)
  assert.equal(wire?.kind, 'remote')

  assert.deepEqual(await wire.describe(API_KEY_ENV), { configured: false, writable: true })
  // Calls recorded from inside the vm realm carry that realm's prototypes;
  // JSON round-trips normalize them for structural comparison.
  assert.deepEqual(JSON.parse(JSON.stringify(describeCalls)), [[API_KEY_ENV]], 'remote describe must receive a positional refs array')

  await wire.set(API_KEY_ENV, 'secret-value')
  assert.deepEqual(JSON.parse(JSON.stringify(setCalls)), [[API_KEY_ENV, 'secret-value']], 'remote set must receive positional (ref, value)')

  const refused = plugin.credentialsWire({
    get: () => ({ credentials: { describe: async () => ({ ok: false, error: {} }) } }),
    connection: {},
  })
  assert.equal(await refused?.describe(API_KEY_ENV), undefined)
})

test('credentialsWire falls back to ctx.connection.api with result envelopes', async () => {
  const { factories } = await loadClientModule()
  const plugin = factories[0]?.(() => ({}))
  assert.ok(plugin?.credentialsWire, 'credentialsWire is not exported')

  const describeCalls: unknown[] = []
  const setCalls: unknown[] = []
  const ctx = {
    get: () => undefined,
    connection: {
      api: {
        credentials: {
          describe: async (payload: { refs: string[] }) => {
            describeCalls.push(payload)
            return {
              result: {
                ok: true,
                value: { credentials: { [API_KEY_ENV]: { configured: true, writable: false } } },
              },
            }
          },
          set: async (payload: { ref: string; value: string }) => {
            setCalls.push(payload)
            return { result: { ok: true, value: {} } }
          },
        },
      },
    },
  }

  const wire = plugin.credentialsWire(ctx)
  assert.equal(wire?.kind, 'connection-api')

  assert.deepEqual(await wire.describe(API_KEY_ENV), { configured: true, writable: false })
  assert.deepEqual(
    JSON.parse(JSON.stringify(describeCalls)),
    [{ refs: [API_KEY_ENV] }],
    'legacy describe must receive a { refs } payload',
  )

  await wire.set(API_KEY_ENV, 'secret-value')
  assert.deepEqual(
    JSON.parse(JSON.stringify(setCalls)),
    [{ ref: API_KEY_ENV, value: 'secret-value' }],
    'legacy set must receive a { ref, value } payload',
  )

  const refused = plugin.credentialsWire({
    get: () => undefined,
    connection: { api: { credentials: { describe: async () => ({ result: { ok: false } }) } } },
  })
  assert.equal(await refused?.describe(API_KEY_ENV), undefined)
})

test('credentialsWire returns undefined when the harness exposes neither face', async () => {
  const { factories } = await loadClientModule()
  const plugin = factories[0]?.(() => ({}))
  assert.ok(plugin?.credentialsWire, 'credentialsWire is not exported')

  assert.equal(plugin.credentialsWire({ get: () => undefined, connection: {} }), undefined)
})

test('card styles are plugin-owned and independent of upstream CSS hashes', async () => {
  const source = await readFile(new URL('../src/client.js', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /YyYd_a|At1oFq/, 'upstream hashed class names must not be referenced')
  assert.match(source, /synws_card/)
  assert.match(source, /data-plugin-style/)
  assert.match(
    source,
    /--dsw-alias-label-error,var\(--dsw-static-red-400/,
    'the error color needs a fallback because no shipped theme declares the alias',
  )
})
