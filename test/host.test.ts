import assert from 'node:assert/strict'
import test from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import * as plugin from '../src/index.js'

// Runs the host plugin against the installed (legacy, 0.1.1-rc.2) settings
// seam with a real cordis context, faking the `web` seam. The 0.1.2-rc.1
// settings seam exposes the same registration as `SettingsProvider.installSection`.

test('registers the Synthetic provider and its settings section on a real cordis context', async () => {
  const root = new Context()
  const searchProviders: string[] = []
  let providerAvailable: boolean | undefined
  const sections: Array<{ ns: string; hasBase: boolean }> = []

  class FakeWeb extends Service {
    static inject = []
    constructor(ctx: Context) {
      super(ctx, 'web')
    }
    registerSearchProvider(provider: { id: string; available(): boolean }): () => void {
      searchProviders.push(provider.id)
      providerAvailable = provider.available()
      return () => {}
    }
  }

  class FakeSettings extends Service {
    static inject = []
    constructor(ctx: Context) {
      super(ctx, 'settings')
    }
    register(ns: string, schema: unknown, options: { base?: object }): { get(): object; watch(): () => void } {
      sections.push({ ns: String(ns), hasBase: options?.base !== undefined })
      return { get: () => ({ ...options?.base }), watch: () => () => {} }
    }
  }

  await root.plugin(FakeWeb)
  await root.plugin(FakeSettings)
  await root.plugin(plugin, { apiKeyEnv: 'SYNTHETIC_API_KEY' })

  assert.deepEqual(searchProviders, ['synthetic'])
  assert.equal(providerAvailable, true, 'usable configuration: the credential resolver and endpoint both resolve')
  assert.deepEqual(sections, [{ ns: 'web-search-synthetic', hasBase: true }])
  assert.equal(plugin.SYNTHETIC_SETTINGS_NAMESPACE, 'web-search-synthetic')
  assert.deepEqual(plugin.SYNTHETIC_DEFAULT_API_KEY_ENV, 'SYNTHETIC_API_KEY')
})
