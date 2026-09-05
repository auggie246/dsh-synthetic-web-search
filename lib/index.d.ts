import * as dshSettings from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
/** Default Synthetic API origin. */
export declare const SYNTHETIC_DEFAULT_BASE_URL = "https://api.synthetic.new";
/** Default credential reference, shared by the Settings card and launch environment. */
export declare const SYNTHETIC_DEFAULT_API_KEY_ENV = "SYNTHETIC_API_KEY";
/** Namespace exposed to Settings > Plugins > Plugin configuration. */
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
/** Loader and Settings schema. Secret values are redacted from all Settings wire responses. */
export declare const Config: z<Schemastery.ObjectS<{
    apiKey: z<string, string>;
    apiKeyEnv: z<string, string>;
    baseURL: z<string, string>;
}>, Schemastery.ObjectT<{
    apiKey: z<string, string>;
    apiKeyEnv: z<string, string>;
    baseURL: z<string, string>;
}>>;
/** Register Synthetic as a search provider and expose its persisted Settings section. */
export declare function apply(ctx: Context, config: Config): void;
