import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import * as dshSettings from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';
import { SyntheticSearchProvider } from './provider.js';
/** Default Synthetic API origin. */
export const SYNTHETIC_DEFAULT_BASE_URL = 'https://api.synthetic.new';
/** Default credential reference, shared by the Settings card and launch environment. */
export const SYNTHETIC_DEFAULT_API_KEY_ENV = 'SYNTHETIC_API_KEY';
const settingsModule = dshSettings;
/** Validate and brand through the legacy helper when present; 0.1.2 validates inside register. */
function toSettingsNamespace(value) {
    const legacy = settingsModule.settingsNamespace;
    return typeof legacy === 'function' ? legacy(value) : value;
}
/** Namespace exposed to Settings > Plugins > Plugin configuration. */
export const SYNTHETIC_SETTINGS_NAMESPACE = toSettingsNamespace('web-search-synthetic');
export { SyntheticSearchProvider, SYNTHETIC_DEFAULT_ENDPOINT, SYNTHETIC_PROVIDER_ID, mapSyntheticResponse, mapSyntheticResult, } from './provider.js';
/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-synthetic';
/** The provider registers into the host-owned web capability seam. */
export const inject = ['web'];
/** Loader and Settings schema. Secret values are redacted from all Settings wire responses. */
export const Config = z.object({
    apiKey: z.string().role('secret'),
    apiKeyEnv: z.string().role('credential-ref').default(SYNTHETIC_DEFAULT_API_KEY_ENV),
    baseURL: z.string(),
});
/** Register Synthetic as a search provider and expose its persisted Settings section. */
export function apply(ctx, config) {
    let current = () => config;
    installSettingsSectionCompat(ctx, SYNTHETIC_SETTINGS_NAMESPACE, Config, config, {
        setSource: (source) => {
            current = source;
        },
        onChange: () => { },
    });
    ctx.web.registerSearchProvider(new SyntheticSearchProvider(() => resolveOptions(ctx, current())));
}
/**
 * Install the settings section on whichever settings seam the running harness
 * provides. Both paths share the semantics of the 0.1.1-rc.2 helper: the
 * composition entry is the base layer and the fallback, and the section rides
 * the settings service appearing.
 */
function installSettingsSectionCompat(ctx, ns, schema, entry, hooks) {
    const legacy = settingsModule.installSettingsSection;
    if (typeof legacy === 'function') {
        legacy(ctx, ns, schema, entry, hooks);
        return;
    }
    ctx.inject(['settings'], (settingsCtx) => {
        const provider = settingsCtx.settings;
        provider.installSection(ctx, ns, schema, entry, hooks);
    });
}
function resolveOptions(ctx, config) {
    const apiKeyEnv = config.apiKeyEnv ?? SYNTHETIC_DEFAULT_API_KEY_ENV;
    const ref = credentialRef(apiKeyEnv);
    return {
        apiKey: config.apiKey,
        apiKeyEnv,
        endpoint: searchEndpoint(config.baseURL ?? SYNTHETIC_DEFAULT_BASE_URL),
        resolveApiKey: async () => {
            const credential = await ctx.get('credentials')?.resolve(ref);
            return credential?.value ?? launchEnvironmentOf(ctx).get(apiKeyEnv)?.value;
        },
    };
}
function searchEndpoint(baseURL) {
    try {
        return new URL('/v2/search', baseURL).toString();
    }
    catch {
        return baseURL;
    }
}
