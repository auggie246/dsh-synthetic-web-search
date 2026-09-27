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

/**
 * Minimal React shim: enough state, effects, and elements to mount the card and
 * drive its controls. `beginRender` restarts the hook cursor exactly as React
 * does between renders of one component instance; the state store survives, so
 * an edit followed by a re-render is observable.
 */
function fakeReact() {
  const state: unknown[] = []
  let cursor = 0
  return {
    useState(initial: unknown) {
      const index = cursor++
      if (!(index in state)) state[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial
      return [
        state[index],
        (next: unknown) => {
          state[index] = typeof next === 'function' ? (next as (prev: unknown) => unknown)(state[index]) : next
        },
      ] as const
    },
    useEffect(): void {},
    createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) {
      return { type, props: { ...(props ?? {}), children } }
    },
    beginRender(): void {
      cursor = 0
    },
  }
}

interface Element {
  type: (props: Record<string, unknown>) => Element | null
  props: Record<string, unknown> & { children?: unknown[] }
}

/** Mount the registered card and return the page view's inner form element. */
function renderForm(React: ReturnType<typeof fakeReact>, Card: (props: Record<string, unknown>) => Element | null, form: unknown): Element {
  const wrapper = Card({ view: 'page', form })
  assert.ok(wrapper, 'the page view must render the form')
  React.beginRender()
  const tree = wrapper.type(wrapper.props)
  assert.ok(tree, 'the form must render')
  return tree
}

/** Every element whose props satisfy the predicate. */
function findAll(node: unknown, predicate: (props: Record<string, unknown>) => boolean): Element[] {
  if (node === null || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, predicate))
  const element = node as Element
  const hit = element.props !== undefined && predicate(element.props) ? [element] : []
  return [...hit, ...findAll(element.props?.children ?? [], predicate)]
}

const BUNDLE_KEY = '@auggieteo/dsh-synthetic-web-search'

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

  assert.deepEqual(JSON.parse(JSON.stringify(plugin.inject)), ['slots', 'connection'])

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

/** The 0.1.7 card over `ctx.configForms`, with a form fake recording every write. */
function configFormsHarness() {
  const React = fakeReact()
  const mutateCalls: Array<{ ops: unknown; revision: unknown }> = []
  const setCalls: unknown[] = []
  const configureCalls: unknown[] = []
  const registered: { slot?: string; spec?: unknown; component?: Element['type'] } = {}
  const fiber = { id: 'plugin-fiber' }
  let snapshot: Record<string, unknown> = {
    status: 'ready',
    value: { apiKeyEnv: 'SYNTHETIC_API_KEY', baseURL: '' },
    revision: 7,
    writable: true,
  }
  const form = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    mutate: async (ops: unknown, revision: unknown) => {
      mutateCalls.push({ ops, revision })
      return true
    },
  }
  const ctx = {
    fiber,
    get: (name: string) => {
      if (name === 'configForms') return { get: () => form }
      if (name === 'settings') {
        return {
          configure: (presentation: unknown, owner: unknown) => {
            configureCalls.push({ presentation, owner })
            return () => {}
          },
        }
      }
      if (name === 'remote') {
        return {
          credentials: {
            describe: async () => ({ ok: true, value: { SYNTHETIC_API_KEY: { configured: false, writable: true } } }),
            set: async (reference: string, value: string) => {
              setCalls.push([reference, value])
              return { ok: true }
            },
          },
        }
      }
      return undefined
    },
    effect: (callback: () => unknown) => {
      const dispose = callback()
      return () => {
        if (typeof dispose === 'function') dispose()
      }
    },
    slots: {
      inject: (name: string, callback: () => () => void) => {
        registered.slot = name
        return callback()
      },
      register: (spec: unknown, component: Element['type']) => {
        registered.spec = spec
        registered.component = component
        return () => {}
      },
    },
  }
  return {
    React, ctx, form, registered, mutateCalls, setCalls, configureCalls, fiber,
    setSnapshot: (next: Record<string, unknown>) => { snapshot = next },
  }
}

async function loadConfigFormsPlugin() {
  const { factories } = await loadClientModule()
  return factories[0]?.(() => ({})) as {
    inject: string[]
    apply: (ctx: unknown) => void
    credentialsWire?: (ctx: unknown) => unknown
  }
}

test('0.1.7: registers a bundle configuration card and declines the generated page', async () => {
  const harness = configFormsHarness()
  const { factories } = await loadClientModule()
  const plugin = factories[0]?.((id: string) => (id === 'react' ? harness.React : {}))
  assert.ok(plugin, 'factory returned no module')

  plugin.apply(harness.ctx)

  assert.equal(harness.registered.slot, 'plugins.bundle.config')
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.registered.spec)),
    { name: 'plugins.bundle.config', key: BUNDLE_KEY },
  )
  assert.equal(typeof harness.registered.component, 'function')
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.configureCalls)),
    [{ presentation: { auto: false }, owner: harness.fiber }],
    'the shipped card owns the entry, so the settings-derived page must be declined',
  )
})

test('0.1.7: a bundle card summary view renders nothing', async () => {
  const harness = configFormsHarness()
  const { factories } = await loadClientModule()
  const plugin = factories[0]?.((id: string) => (id === 'react' ? harness.React : {}))
  plugin?.apply(harness.ctx)

  assert.equal(harness.registered.component?.({ view: 'summary', form: harness.form }), null)
})

test('0.1.7: saving writes changed fields with one mutate and the key through credentials', async () => {
  const harness = configFormsHarness()
  const { factories } = await loadClientModule()
  const plugin = factories[0]?.((id: string) => (id === 'react' ? harness.React : {}))
  plugin?.apply(harness.ctx)

  const tree = renderForm(harness.React, harness.registered.component as Element['type'], harness.form)
  const inputs = findAll(tree, (props) => props.className === 'synws-input')
  const keyInput = inputs.find((element) => element.props.type === 'password')
  const urlInput = inputs.find((element) => element.props.type === 'url')
  assert.ok(keyInput && urlInput, 'the card renders a secret input and an endpoint input')

  keyInput.props.onChange?.({ target: { value: 'sk-staged' } })
  urlInput.props.onChange?.({ target: { value: 'https://example.test' } })

  const rerendered = renderForm(harness.React, harness.registered.component as Element['type'], harness.form)
  const save = findAll(rerendered, (props) => props.className === 'synws-save')[0]
  assert.ok(save, 'the card renders a save control')
  await (save.props.onClick as () => Promise<void>)()

  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.mutateCalls)),
    [{ ops: [{ op: 'set', path: ['baseURL'], value: 'https://example.test' }], revision: 7 }],
    'one mutate carries only the fields the user changed',
  )
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.setCalls)),
    [['SYNTHETIC_API_KEY', 'sk-staged']],
    'the staged key is written through the credentials domain, never through the settings form',
  )
})

test('0.1.7: clearing an overridden field unsets it so it re-inherits the default', async () => {
  const harness = configFormsHarness()
  harness.setSnapshot({
    status: 'ready',
    value: { apiKeyEnv: 'SYNTHETIC_API_KEY', baseURL: 'https://old.test' },
    revision: 9,
    writable: true,
  })
  const { factories } = await loadClientModule()
  const plugin = factories[0]?.((id: string) => (id === 'react' ? harness.React : {}))
  plugin?.apply(harness.ctx)

  const tree = renderForm(harness.React, harness.registered.component as Element['type'], harness.form)
  const urlInput = findAll(tree, (props) => props.className === 'synws-input')
    .find((element) => element.props.type === 'url')
  urlInput?.props.onChange?.({ target: { value: '' } })

  const rerendered = renderForm(harness.React, harness.registered.component as Element['type'], harness.form)
  const save = findAll(rerendered, (props) => props.className === 'synws-save')[0]
  await (save?.props.onClick as () => Promise<void>)()

  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.mutateCalls)),
    [{ ops: [{ op: 'unset', path: ['baseURL'] }], revision: 9 }],
  )
})

test('client plugin falls back to the pre-0.1.7 settings scope card when configForms is absent', async () => {
  const { factories } = await loadClientModule()
  const plugin = factories[0]?.(() => ({}))
  assert.ok(plugin, 'factory returned no module')

  const registered: { slot?: string; spec?: unknown } = {}
  plugin.apply({
    get: () => undefined,
    connection: {},
    effect: () => () => {},
    slots: {
      inject: (name: string, callback: () => () => void) => {
        registered.slot = name
        return callback()
      },
      register: (spec: unknown) => {
        registered.spec = spec
        return () => {}
      },
    },
    settingsScope: { bind: () => ({ getSnapshot: () => ({}) }) },
  })

  assert.equal(registered.slot, 'settings.plugin.item')
  assert.deepEqual(JSON.parse(JSON.stringify(registered.spec)), { name: 'settings.plugin.item', key: 'web-search-synthetic' })
})

test('client plugin stays inert when neither settings face is composed', async () => {
  const { factories } = await loadClientModule()
  const plugin = factories[0]?.(() => ({}))
  let registered = false
  plugin?.apply({
    get: () => undefined,
    connection: {},
    effect: () => () => {},
    slots: {
      inject: () => () => {},
      register: () => {
        registered = true
        return () => {}
      },
    },
  })
  assert.equal(registered, false)
})
