import type {} from '@deepseek-ai/dsh-invariants'
import type { Context } from '@deepseek-ai/cordis'

const PACKAGE_NAME = '@auggieteo/dsh-synthetic-web-search'

/** Cordis plugin name for the package's invariant companion. */
export const name = 'web-search-synthetic-invariant'

export const inject = ['invariants']

/** Register package ownership; the provider has no independent runtime invariant. */
export function apply(ctx: Context): Promise<() => void> {
  return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, () => {}))
}
