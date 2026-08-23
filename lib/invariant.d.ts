import type { Context } from '@deepseek-ai/cordis';
/** Cordis plugin name for the package's invariant companion. */
export declare const name = "web-search-synthetic-invariant";
export declare const inject: string[];
/** Register package ownership; the provider has no independent runtime invariant. */
export declare function apply(ctx: Context): Promise<() => void>;
