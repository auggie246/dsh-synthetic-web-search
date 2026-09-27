import assert from 'node:assert/strict'
import test from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import * as plugin from '../src/index.js'

// The host plugin detects the settings seam at runtime, because the seam moved
// across harness releases: 0.1.2-0.1.5 register a namespace through
// `SettingsProvider.installSection`, 0.1.7-rc.2 replaced that with Config-derived
// forms whose owner only declines the schema-generated page, and a deployment
// may compose no settings service at all. Each shape is faked here on a real
// cordis context; the `web` seam is faked throughout.

interface WebRecord {
  searchProviders: string[]
  providerAvailable: boolean | undefined
}

function recordWeb(record: WebRecord): typeof Service {
  return class FakeWeb extends Service {
    static inject: string[] = []
    constructor(ctx: Context) {
      super(ctx, 'web')
    }
    registerSearchProvider(provider: { id: string; available(): boolean }): () => void {
      record.searchProviders.push(provider.id)
      record.providerAvailable = provider.available()
      return () => {}
    }
  }
}

test('registers the provider and its namespace on the 0.1.2-0.1.5 installSection seam', async () => {
  const root = new Context()
  const record: WebRecord = { searchProviders: [], providerAvailable: undefined }
  const sections: Array<{ ns: string; hasBase: boolean }> = []

  class FakeSettings extends Service {
    static inject: string[] = []
    constructor(ctx: Context) {
      super(ctx, 'settings')
    }
    installSection(_owner: Context, ns: string, _schema: unknown, entry: object): void {
      sections.push({ ns: String(ns), hasBase: entry !== undefined })
    }
  }

  await root.plugin(recordWeb(record))
  await root.plugin(FakeSettings)
  await root.plugin(plugin, { apiKeyEnv: 'SYNTHETIC_API_KEY' })

  assert.deepEqual(record.searchProviders, ['synthetic'])
  assert.equal(record.providerAvailable, true, 'usable configuration: the credential resolver and endpoint both resolve')
  assert.deepEqual(sections, [{ ns: 'web-search-synthetic', hasBase: true }])
  assert.equal(plugin.SYNTHETIC_SETTINGS_NAMESPACE, 'web-search-synthetic')
  assert.deepEqual(plugin.SYNTHETIC_DEFAULT_API_KEY_ENV, 'SYNTHETIC_API_KEY')
})

test('declines the generated page on the 0.1.7 SettingsForms seam', async () => {
  const root = new Context()
  const record: WebRecord = { searchProviders: [], providerAvailable: undefined }
  const configured: Array<{ auto?: boolean; owner: unknown }> = []

  class FakeSettingsForms extends Service {
    static inject: string[] = []
    constructor(ctx: Context) {
      super(ctx, 'settings')
    }
    configure(presentation: { auto?: boolean }, owner?: unknown): () => void {
      configured.push({ auto: presentation.auto, owner })
      return () => {}
    }
  }

  await root.plugin(recordWeb(record))
  await root.plugin(FakeSettingsForms)
  await root.plugin(plugin, { apiKeyEnv: 'SYNTHETIC_API_KEY' })

  assert.deepEqual(record.searchProviders, ['synthetic'])
  assert.equal(record.providerAvailable, true)
  assert.equal(configured.length, 1, 'the shipped card owns this entry, so the derived page must be declined')
  assert.equal(configured[0]?.auto, false)
  assert.notEqual(configured[0]?.owner, undefined, 'the policy belongs to this plugin instance fiber')
})

test('reads live volatile config references delivered from 0.1.7 on', async () => {
  const root = new Context()
  const record: WebRecord = { searchProviders: [], providerAvailable: undefined }

  class FakeSettingsForms extends Service {
    static inject: string[] = []
    constructor(ctx: Context) {
      super(ctx, 'settings')
    }
    configure(): () => void {
      return () => {}
    }
  }

  await root.plugin(recordWeb(record))
  // The Loader resolves a volatile Config entry into live references before it
  // calls apply, so the references are handed over directly: cordis's own
  // config validation sees plain values, not the refs the Loader builds.
  await root.plugin({
    inject: ['web'],
    apply: (ctx: Context) => {
      plugin.apply(ctx, {
        apiKey: { get: () => 'sk-live' },
        apiKeyEnv: { get: () => 'SYNTHETIC_API_KEY' },
        baseURL: { get: () => 'https://api.synthetic.new' },
      })
    },
  })

  assert.deepEqual(record.searchProviders, ['synthetic'])
  assert.equal(record.providerAvailable, true, 'volatile references are unwrapped rather than read as objects')
})

test('registers the provider when no settings service is composed', async () => {
  const root = new Context()
  const record: WebRecord = { searchProviders: [], providerAvailable: undefined }

  await root.plugin(recordWeb(record))
  await root.plugin(plugin, { apiKeyEnv: 'SYNTHETIC_API_KEY' })

  assert.deepEqual(record.searchProviders, ['synthetic'])
  assert.equal(record.providerAvailable, true)
})
