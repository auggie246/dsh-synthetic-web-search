import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** Required client services for the Synthetic Settings card. */
export declare const inject: string[]

/** Register the Synthetic card in Settings > Plugins > Plugin configuration. */
export declare function apply(ctx: ClientContext): void
