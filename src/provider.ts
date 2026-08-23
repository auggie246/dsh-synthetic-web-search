import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'

/** Stable id used by the Harness web-provider registry. */
export const SYNTHETIC_PROVIDER_ID = 'synthetic'

/** Synthetic's documented web-search endpoint. */
export const SYNTHETIC_DEFAULT_ENDPOINT = 'https://api.synthetic.new/v2/search'

const USER_AGENT = 'deepseek-harness-synthetic/0.1.0'

export interface SyntheticSearchProviderOptions {
  /** Optional literal API key from the composition layer. */
  apiKey?: string
  /** Resolves the API key held by DSH credentials or the launch environment. */
  resolveApiKey?: () => Promise<string | undefined>
  /** The credential reference shown in missing-key errors. */
  apiKeyEnv?: string
  /** Complete Synthetic search endpoint. */
  endpoint: string
}

interface SyntheticSearchResult {
  url: string
  title?: string
  text?: string
  published?: string
}

interface SyntheticSearchResponse {
  results: SyntheticSearchResult[]
}

/** Convert a Synthetic result into the web seam's portable source shape. */
export function mapSyntheticResult(result: SyntheticSearchResult): WebSearchSource | undefined {
  if (result.url.trim().length === 0 || !URL.canParse(result.url)) return undefined

  return {
    url: result.url,
    ...(nonBlankString(result.title) ? { title: result.title } : {}),
    ...(nonBlankString(result.text) ? { snippet: result.text } : {}),
    ...(nonBlankString(result.published) ? { publishedAt: result.published } : {}),
  }
}

/** Convert a validated Synthetic response into the Harness result shape. */
export function mapSyntheticResponse(response: SyntheticSearchResponse): WebSearchResult {
  return {
    sources: response.results
      .map(mapSyntheticResult)
      .filter((source): source is WebSearchSource => source !== undefined),
    truncated: false,
  }
}

/** A Synthetic-backed implementation of the Harness WebSearchProvider contract. */
export class SyntheticSearchProvider implements WebSearchProvider {
  readonly id = SYNTHETIC_PROVIDER_ID
  private readonly resolveOptions: () => SyntheticSearchProviderOptions

  constructor(options: SyntheticSearchProviderOptions | (() => SyntheticSearchProviderOptions)) {
    this.resolveOptions = typeof options === 'function' ? options : () => options
  }

  available(): boolean {
    const options = this.resolveOptions()
    return (
      ((options.apiKey?.trim().length ?? 0) > 0 || options.resolveApiKey !== undefined) &&
      URL.canParse(options.endpoint)
    )
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const options = this.resolveOptions()
    const apiKey = await this.apiKey(options, signal)
    throwIfAborted(signal)

    let response: Response
    try {
      response = await fetch(options.endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
          'content-type': 'application/json',
          'user-agent': USER_AGENT,
        },
        body: JSON.stringify({ query: request.query }),
        ...(signal === undefined ? {} : { signal }),
      })
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)
      throw new WebError(`Synthetic search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }

    if (!response.ok) throw new WebError(await errorMessage(response, signal), 'WEB_PROVIDER_ERROR')

    try {
      return mapSyntheticResponse(parseResponse(await response.json()))
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)
      if (error instanceof WebError) throw error
      throw new WebError(`Synthetic returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }

  private async apiKey(options: SyntheticSearchProviderOptions, signal?: AbortSignal): Promise<string> {
    throwIfAborted(signal)
    if (nonBlankString(options.apiKey)) return options.apiKey

    let resolved: string | undefined
    try {
      resolved = await abortable(options.resolveApiKey?.() ?? Promise.resolve(undefined), signal)
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)
      throw new WebError(`Synthetic search credential resolution failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }

    if (nonBlankString(resolved)) return resolved
    throw new WebError(
      `Synthetic search has no API key for "${options.apiKeyEnv ?? 'SYNTHETIC_API_KEY'}"; configure it in Settings > Plugins > Plugin configuration, export it in the launching environment, or set a literal "apiKey" in the web-search-synthetic config`,
      'WEB_PROVIDER_CREDENTIAL_MISSING',
    )
  }
}

function nonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseResponse(value: unknown): SyntheticSearchResponse {
  if (!isRecord(value) || !Array.isArray(value.results)) {
    throw new Error('response must contain a results array')
  }

  return {
    results: value.results.flatMap((result) => {
      if (!isRecord(result) || typeof result.url !== 'string') return []
      return [{
        url: result.url,
        ...(typeof result.title === 'string' ? { title: result.title } : {}),
        ...(typeof result.text === 'string' ? { text: result.text } : {}),
        ...(typeof result.published === 'string' ? { published: result.published } : {}),
      }]
    }),
  }
}

async function errorMessage(response: Response, signal?: AbortSignal): Promise<string> {
  const fallback = `Synthetic API error (HTTP ${response.status})`

  try {
    const body: unknown = await response.json()
    if (!isRecord(body)) return fallback

    for (const key of ['error', 'message', 'detail']) {
      if (nonBlankString(body[key])) return body[key]
    }
  } catch (error) {
    if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)
  }

  return fallback
}

function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return operation
  if (signal.aborted) return Promise.reject(aborted(signal))

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(aborted(signal))
    signal.addEventListener('abort', onAbort, { once: true })
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw aborted(signal)
}

function aborted(signal?: AbortSignal, fallback?: unknown): WebError {
  return new WebError('Synthetic search aborted', 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
