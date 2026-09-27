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
/** Namespace exposed to the pre-0.1.7 Settings > Plugins > Plugin configuration surface. */
export const SYNTHETIC_SETTINGS_NAMESPACE = toSettingsNamespace('web-search-synthetic');
export { SyntheticSearchProvider, SYNTHETIC_DEFAULT_ENDPOINT, SYNTHETIC_PROVIDER_ID, mapSyntheticResponse, mapSyntheticResult, } from './provider.js';
/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-synthetic';
/** The provider registers into the host-owned web capability seam. */
export const inject = ['web'];
/**
 * Mark a field volatile (live-editable form field) when the installed
 * schemastery supports it. 0.1.7-rc.2 added `.volatile()`; harnesses before it
 * ship a schemastery without the method, and the field stays ordinary there.
 */
function volatileField(field) {
    const mark = field.volatile;
    return typeof mark === 'function' ? mark.call(field) : field;
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
});
/** Register Synthetic as a search provider and wire whichever settings seam is present. */
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
 * Attach this entry's settings surface to whichever seam the running harness
 * provides: nothing to register before 0.1.7 (the Loader derives the form from
 * the volatile Config fields), and the pre-0.1.7 semantics otherwise — the
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
        if (typeof provider.installSection === 'function') {
            provider.installSection(ctx, ns, schema, entry, hooks);
            return;
        }
        const forms = settingsCtx.settings;
        const configure = forms.configure;
        if (typeof configure !== 'function')
            return;
        settingsCtx.effect(() => configure({ auto: false }, ctx.fiber));
    });
}
/** Read a plain or volatile-referenced Config field, falling back to a default. */
function readField(field, fallback) {
    const value = field !== undefined && field !== null && typeof field.get === 'function'
        ? field.get()
        : field;
    return value ?? fallback;
}
function resolveOptions(ctx, config) {
    const apiKeyEnv = readField(config.apiKeyEnv, SYNTHETIC_DEFAULT_API_KEY_ENV);
    const ref = credentialRef(apiKeyEnv);
    return {
        apiKey: readField(config.apiKey, undefined),
        apiKeyEnv,
        endpoint: searchEndpoint(readField(config.baseURL, SYNTHETIC_DEFAULT_BASE_URL)),
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
