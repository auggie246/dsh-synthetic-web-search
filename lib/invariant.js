const PACKAGE_NAME = '@deepseek-ai/dsh-web-search-synthetic';
/** Cordis plugin name for the package's invariant companion. */
export const name = 'web-search-synthetic-invariant';
export const inject = ['invariants'];
/** Register package ownership; the provider has no independent runtime invariant. */
export function apply(ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, () => { }));
}
