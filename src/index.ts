import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import { SyntheticSearchProvider } from './provider.js'
import type { SyntheticSearchProviderOptions } from './provider.js'

/** Default Synthetic API origin. */
export const SYNTHETIC_DEFAULT_BASE_URL = 'https://api.synthetic.new'

/** Default credential reference, shared by the Settings card and launch environment. */
export const SYNTHETIC_DEFAULT_API_KEY_ENV = 'SYNTHETIC_API_KEY'

/** Namespace exposed to Settings > Plugins > Plugin configuration. */
export const SYNTHETIC_SETTINGS_NAMESPACE = settingsNamespace('web-search-synthetic')

export {
  SyntheticSearchProvider,
  SYNTHETIC_DEFAULT_ENDPOINT,
  SYNTHETIC_PROVIDER_ID,
  mapSyntheticResponse,
  mapSyntheticResult,
} from './provider.js'
export type { SyntheticSearchProviderOptions } from './provider.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-synthetic'

/** The provider registers into the host-owned web capability seam. */
export const inject = ['web']

export interface Config {
  /** Optional literal API key. Settings stores keys in the credentials domain instead. */
  apiKey?: string
  /** Credential reference used by Settings and the launch environment. */
  apiKeyEnv?: string
  /** Synthetic API origin. The provider appends `/v2/search`. */
  baseURL?: string
}

/** Loader and Settings schema. Secret values are redacted from all Settings wire responses. */
export const Config = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref').default(SYNTHETIC_DEFAULT_API_KEY_ENV),
  baseURL: z.string(),
})

/** Register Synthetic as a search provider and expose its persisted Settings section. */
export function apply(ctx: Context, config: Config): void {
  let current = () => config
  installSettingsSection(ctx, SYNTHETIC_SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => {
      current = source
    },
    onChange: () => {},
  })

  ctx.web.registerSearchProvider(new SyntheticSearchProvider(() => resolveOptions(ctx, current())))
}

function resolveOptions(ctx: Context, config: Config): SyntheticSearchProviderOptions {
  const apiKeyEnv = config.apiKeyEnv ?? SYNTHETIC_DEFAULT_API_KEY_ENV
  const ref = credentialRef(apiKeyEnv)

  return {
    apiKey: config.apiKey,
    apiKeyEnv,
    endpoint: searchEndpoint(config.baseURL ?? SYNTHETIC_DEFAULT_BASE_URL),
    resolveApiKey: async () => {
      const credential = await ctx.get('credentials')?.resolve(ref)
      return credential?.value ?? launchEnvironmentOf(ctx).get(apiKeyEnv)?.value
    },
  }
}

function searchEndpoint(baseURL: string): string {
  try {
    return new URL('/v2/search', baseURL).toString()
  } catch {
    return baseURL
  }
}
