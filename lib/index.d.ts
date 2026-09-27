import * as dshSettings from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
/** Default Synthetic API origin. */
export declare const SYNTHETIC_DEFAULT_BASE_URL = "https://api.synthetic.new";
/** Default credential reference, shared by the Settings card and launch environment. */
export declare const SYNTHETIC_DEFAULT_API_KEY_ENV = "SYNTHETIC_API_KEY";
/** Namespace exposed to the pre-0.1.7 Settings > Plugins > Plugin configuration surface. */
export declare const SYNTHETIC_SETTINGS_NAMESPACE: dshSettings.SettingsNamespace;
export { SyntheticSearchProvider, SYNTHETIC_DEFAULT_ENDPOINT, SYNTHETIC_PROVIDER_ID, mapSyntheticResponse, mapSyntheticResult, } from './provider.js';
export type { SyntheticSearchProviderOptions } from './provider.js';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "web-search-synthetic";
/** The provider registers into the host-owned web capability seam. */
export declare const inject: string[];
export interface Config {
    /** Optional literal API key. Settings stores keys in the credentials domain instead. */
    apiKey?: string;
    /** Credential reference used by Settings and the launch environment. */
    apiKeyEnv?: string;
    /** Synthetic API origin. The provider appends `/v2/search`. */
    baseURL?: string;
}
/**
 * One Config field as the running Loader delivers it: a plain value before
 * 0.1.7-rc.2, and a live reference (`config.field.get()`) from 0.1.7 on, where
 * `.volatile()` fields stay editable without remounting the fiber.
 */
export type ConfigField<T> = T | {
    get(): T;
};
/** The composition entry as delivered to `apply`, one {@link ConfigField} per declared key. */
export type ConfigFields = {
    [K in keyof Config]?: ConfigField<Config[K]>;
};
/**
 * Loader and configuration schema. Secret values are redacted from all wire
 * responses. Every field is volatile so 0.1.7-rc.2 derives an editable form for
 * this entry; on older harnesses the marker is absent and the schema is the
 * plain one the settings namespace registered.
 */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    apiKey: z<string, string, "plain">;
    apiKeyEnv: z<string, string, "defined">;
    baseURL: z<string, string, "plain">;
}>>, Schemastery.ObjectT<NoInfer<{
    apiKey: z<string, string, "plain">;
    apiKeyEnv: z<string, string, "defined">;
    baseURL: z<string, string, "plain">;
}>>, "plain">;
/** Register Synthetic as a search provider and wire whichever settings seam is present. */
export declare function apply(ctx: Context, config: ConfigFields): void;
