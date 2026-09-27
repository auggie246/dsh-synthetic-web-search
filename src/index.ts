import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import * as dshSettings from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import { SyntheticSearchProvider } from './provider.js'
import type { SyntheticSearchProviderOptions } from './provider.js'

/** Default Synthetic API origin. */
export const SYNTHETIC_DEFAULT_BASE_URL = 'https://api.synthetic.new'

/** Default credential reference, shared by the Settings card and launch environment. */
export const SYNTHETIC_DEFAULT_API_KEY_ENV = 'SYNTHETIC_API_KEY'

/**
 * The settings seam moved twice, and each move is detected at runtime rather
 * than imported, because a static named import of a removed export fails at ESM
 * link time and takes the whole plugin down.
 *
 * - 0.1.1-rc.2 exposed the free `installSettingsSection`/`settingsNamespace` pair.
 * - 0.1.2-rc.1 through 0.1.5-rc.2 moved that to the `SettingsProvider.installSection`
 *   method and a validated plain namespace string.
 * - 0.1.7-rc.2 replaced namespace registration entirely with `SettingsForms`:
 *   a plugin's editable configuration is derived from the Config fields it
 *   marks `.volatile()`, keyed by profile entry id, and a plugin that ships its
 *   own configuration page suppresses the derived one with `configure`.
 *
 * Every shape is typed here against this package's own structural surface so the
 * file compiles against either dependency version.
 */
interface SettingsModuleCompat {
  /** 0.1.1-rc.2: waits for the settings service itself. */
  installSettingsSection?: (
    ctx: Context,
    ns: SettingsNamespace,
    schema: typeof Config,
    entry: ConfigFields,
    hooks: SettingsSectionHooks<ConfigFields>,
  ) => void
  /** 0.1.1-rc.2: validates and brands the namespace string. */
  settingsNamespace?: (value: string) => SettingsNamespace
}

/** 0.1.2-rc.1 owner-side registration on the settings service. */
interface SettingsProviderCompat {
  installSection?: (
    owner: Context,
    ns: SettingsNamespace,
    schema: typeof Config,
    entry: ConfigFields,
    hooks: SettingsSectionHooks<ConfigFields>,
  ) => void
}

/** 0.1.7-rc.2 Config-derived forms; the owner only suppresses the derived page. */
interface SettingsFormsCompat {
  configure?: (presentation: { auto?: boolean }, owner?: Context['fiber']) => () => void
}

/** Hooks a consumer handed to the pre-0.1.7 install seam (removed from its public types). */
interface SettingsSectionHooks<T> {
  /** Receive the active configuration source: the settings scope, or the composition entry. */
  setSource(current: () => T): void
  /** Re-judge derived facts after an attach, a detach, or a committed change. */
  onChange(): void
}

const settingsModule = dshSettings as unknown as SettingsModuleCompat

/** Validate and brand through the legacy helper when present; 0.1.2 validates inside register. */
function toSettingsNamespace(value: string): SettingsNamespace {
  const legacy = settingsModule.settingsNamespace
  return typeof legacy === 'function' ? legacy(value) : (value as SettingsNamespace)
}

/** Namespace exposed to the pre-0.1.7 Settings > Plugins > Plugin configuration surface. */
export const SYNTHETIC_SETTINGS_NAMESPACE = toSettingsNamespace('web-search-synthetic')

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

/**
 * One Config field as the running Loader delivers it: a plain value before
 * 0.1.7-rc.2, and a live reference (`config.field.get()`) from 0.1.7 on, where
 * `.volatile()` fields stay editable without remounting the fiber.
 */
export type ConfigField<T> = T | { get(): T }

/** The composition entry as delivered to `apply`, one {@link ConfigField} per declared key. */
export type ConfigFields = { [K in keyof Config]?: ConfigField<Config[K]> }

/**
 * Mark a field volatile (live-editable form field) when the installed
 * schemastery supports it. 0.1.7-rc.2 added `.volatile()`; harnesses before it
 * ship a schemastery without the method, and the field stays ordinary there.
 */
function volatileField<S>(field: S): S {
  const mark = (field as { volatile?: () => S }).volatile
  return typeof mark === 'function' ? mark.call(field) : field
}

/**
 * Loader and configuration schema. Secret values are redacted from all wire
 * responses. Every field is volatile so 0.1.7-rc.2 derives an editable form for
 * this entry; on older harnesses the marker is absent and the schema is the
 * plain one the settings namespace registered.
 */
export const Config = z.object({
  apiKey: volatileField(z.string().role('secret')),
  apiKeyEnv: volatileField(z.string().role('credential-ref').default(SYNTHETIC_DEFAULT_API_KEY_ENV)),
  baseURL: volatileField(z.string()),
})

/** Register Synthetic as a search provider and wire whichever settings seam is present. */
export function apply(ctx: Context, config: ConfigFields): void {
  let current = () => config
  installSettingsSectionCompat(ctx, SYNTHETIC_SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => {
      current = source
    },
    onChange: () => {},
  })

  ctx.web.registerSearchProvider(new SyntheticSearchProvider(() => resolveOptions(ctx, current())))
}

/**
 * Attach this entry's settings surface to whichever seam the running harness
 * provides: nothing to register before 0.1.7 (the Loader derives the form from
 * the volatile Config fields), and the pre-0.1.7 semantics otherwise — the
 * composition entry is the base layer and the fallback, and the section rides
 * the settings service appearing.
 */
function installSettingsSectionCompat(
  ctx: Context,
  ns: SettingsNamespace,
  schema: typeof Config,
  entry: ConfigFields,
  hooks: SettingsSectionHooks<ConfigFields>,
): void {
  const legacy = settingsModule.installSettingsSection
  if (typeof legacy === 'function') {
    legacy(ctx, ns, schema, entry as unknown as Config, hooks)
    return
  }

  ctx.inject(['settings'], (settingsCtx) => {
    const provider = settingsCtx.settings as unknown as SettingsProviderCompat
    if (typeof provider.installSection === 'function') {
      provider.installSection(ctx, ns, schema, entry as unknown as Config, hooks)
      return
    }

    const forms = settingsCtx.settings as unknown as SettingsFormsCompat
    const configure = forms.configure
    if (typeof configure !== 'function') return
    settingsCtx.effect(() => configure({ auto: false }, ctx.fiber))
  })
}

/** Read a plain or volatile-referenced Config field, falling back to a default. */
function readField<T>(field: ConfigField<T | undefined> | undefined, fallback: T): T {
  const value =
    field !== undefined && field !== null && typeof (field as { get?: unknown }).get === 'function'
      ? (field as { get(): T | undefined }).get()
      : (field as T | undefined)
  return value ?? fallback
}

function resolveOptions(ctx: Context, config: ConfigFields): SyntheticSearchProviderOptions {
  const apiKeyEnv = readField(config.apiKeyEnv, SYNTHETIC_DEFAULT_API_KEY_ENV)
  const ref = credentialRef(apiKeyEnv)

  return {
    apiKey: readField<string | undefined>(config.apiKey, undefined),
    apiKeyEnv,
    endpoint: searchEndpoint(readField(config.baseURL, SYNTHETIC_DEFAULT_BASE_URL)),
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
