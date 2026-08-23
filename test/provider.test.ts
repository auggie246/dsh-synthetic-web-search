import assert from 'node:assert/strict'
import test from 'node:test'
import { WebError } from '@deepseek-ai/dsh-web'
import {
  SYNTHETIC_DEFAULT_ENDPOINT,
  SyntheticSearchProvider,
  mapSyntheticResponse,
  mapSyntheticResult,
} from '../src/provider.js'

test('maps documented Synthetic result fields to portable sources', () => {
  assert.deepEqual(mapSyntheticResult({
    url: 'https://example.com/article',
    title: 'Example article',
    text: 'A useful search snippet.',
    published: '2025-11-05T00:00:00.000Z',
  }), {
    url: 'https://example.com/article',
    title: 'Example article',
    snippet: 'A useful search snippet.',
    publishedAt: '2025-11-05T00:00:00.000Z',
  })
})

test('drops malformed URLs while preserving valid title-only sources', () => {
  assert.equal(mapSyntheticResult({ url: 'not a URL' }), undefined)
  assert.deepEqual(mapSyntheticResponse({
    results: [
      { url: 'not a URL', text: 'ignored' },
      { url: 'https://example.com', title: 'Example' },
    ],
  }), {
    sources: [{ url: 'https://example.com', title: 'Example' }],
    truncated: false,
  })
})

test('marks only locally usable configuration as available', () => {
  assert.equal(new SyntheticSearchProvider({ apiKey: '', endpoint: SYNTHETIC_DEFAULT_ENDPOINT }).available(), false)
  assert.equal(new SyntheticSearchProvider({ apiKey: 'key', endpoint: 'not a URL' }).available(), false)
  assert.equal(new SyntheticSearchProvider({ apiKey: 'key', endpoint: SYNTHETIC_DEFAULT_ENDPOINT }).available(), true)
})

test('sends the documented authenticated POST request and maps the response', async () => {
  const originalFetch = globalThis.fetch
  let captured: RequestInit | undefined
  let capturedUrl: string | undefined

  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input)
    captured = init
    return Response.json({
      results: [{
        url: 'https://example.com',
        title: 'Example',
        text: 'Result text',
        published: '2025-11-05T00:00:00.000Z',
      }],
    })
  }

  try {
    const provider = new SyntheticSearchProvider({
      apiKey: 'synthetic-key',
      endpoint: SYNTHETIC_DEFAULT_ENDPOINT,
    })

    assert.deepEqual(await provider.search({ query: 'example query' }), {
      sources: [{
        url: 'https://example.com',
        title: 'Example',
        snippet: 'Result text',
        publishedAt: '2025-11-05T00:00:00.000Z',
      }],
      truncated: false,
    })
    assert.equal(capturedUrl, SYNTHETIC_DEFAULT_ENDPOINT)
    assert.equal(captured?.method, 'POST')
    assert.equal(captured?.headers && new Headers(captured.headers).get('authorization'), 'Bearer synthetic-key')
    assert.equal(captured?.body, JSON.stringify({ query: 'example query' }))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('surfaces non-success responses as a provider error', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ message: 'Invalid key' }, { status: 401 })

  try {
    const provider = new SyntheticSearchProvider({ apiKey: 'bad', endpoint: SYNTHETIC_DEFAULT_ENDPOINT })
    await assert.rejects(provider.search({ query: 'example' }), (error: unknown) => {
      assert.ok(error instanceof WebError)
      assert.equal(error.message, 'Invalid key')
      return true
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('rejects malformed successful response envelopes', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ unexpected: [] })

  try {
    const provider = new SyntheticSearchProvider({ apiKey: 'key', endpoint: SYNTHETIC_DEFAULT_ENDPOINT })
    await assert.rejects(provider.search({ query: 'example' }), (error: unknown) => {
      assert.ok(error instanceof WebError)
      assert.match(error.message, /unprocessable response body/)
      return true
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('resolves the configured credential for each search', async () => {
  const originalFetch = globalThis.fetch
  const headers: string[] = []
  let key = 'first-key'
  globalThis.fetch = async (_input, init) => {
    headers.push(new Headers(init?.headers).get('authorization') ?? '')
    return Response.json({ results: [] })
  }

  try {
    const provider = new SyntheticSearchProvider(() => ({
      endpoint: SYNTHETIC_DEFAULT_ENDPOINT,
      apiKeyEnv: 'SYNTHETIC_API_KEY',
      resolveApiKey: async () => key,
    }))
    assert.equal(provider.available(), true)
    await provider.search({ query: 'first' })
    key = 'replacement-key'
    await provider.search({ query: 'second' })
    assert.deepEqual(headers, ['Bearer first-key', 'Bearer replacement-key'])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('reports the Settings path when no credential resolves', async () => {
  const provider = new SyntheticSearchProvider({
    endpoint: SYNTHETIC_DEFAULT_ENDPOINT,
    apiKeyEnv: 'SYNTHETIC_API_KEY',
    resolveApiKey: async () => undefined,
  })

  await assert.rejects(provider.search({ query: 'example' }), (error: unknown) => {
    assert.ok(error instanceof WebError)
    assert.equal(error.code, 'WEB_PROVIDER_CREDENTIAL_MISSING')
    assert.match(error.message, /Settings > Plugins > Plugin configuration/)
    return true
  })
})
