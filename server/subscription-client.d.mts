import type { SubscriptionAccess } from './subscription-policy.mjs'
export function loadSubscriptionAccess(options: { config: { url: string; token: string; businessId: string } | null; read: (key: string) => Promise<string>; write: (key: string, value: string) => Promise<void>; fetcher?: typeof fetch; force?: boolean; cacheOnly?: boolean }): Promise<SubscriptionAccess>
