import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web';
/** Stable id used by the Harness web-provider registry. */
export declare const SYNTHETIC_PROVIDER_ID = "synthetic";
/** Synthetic's documented web-search endpoint. */
export declare const SYNTHETIC_DEFAULT_ENDPOINT = "https://api.synthetic.new/v2/search";
export interface SyntheticSearchProviderOptions {
    /** Optional literal API key from the composition layer. */
    apiKey?: string;
    /** Resolves the API key held by DSH credentials or the launch environment. */
    resolveApiKey?: () => Promise<string | undefined>;
    /** The credential reference shown in missing-key errors. */
    apiKeyEnv?: string;
    /** Complete Synthetic search endpoint. */
    endpoint: string;
}
interface SyntheticSearchResult {
    url: string;
    title?: string;
    text?: string;
    published?: string;
}
interface SyntheticSearchResponse {
    results: SyntheticSearchResult[];
}
/** Convert a Synthetic result into the web seam's portable source shape. */
export declare function mapSyntheticResult(result: SyntheticSearchResult): WebSearchSource | undefined;
/** Convert a validated Synthetic response into the Harness result shape. */
export declare function mapSyntheticResponse(response: SyntheticSearchResponse): WebSearchResult;
/** A Synthetic-backed implementation of the Harness WebSearchProvider contract. */
export declare class SyntheticSearchProvider implements WebSearchProvider {
    readonly id = "synthetic";
    private readonly resolveOptions;
    constructor(options: SyntheticSearchProviderOptions | (() => SyntheticSearchProviderOptions));
    available(): boolean;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
    private apiKey;
}
export {};
