export type SubscriptionAccess = { businessId?: string; testMode?: boolean; expiresAt?: string | null; planId?: string | null; graceMonths?: number; graceDays?: number; graceEndsAt?: string | null; portalUrl?: string; blocked: boolean; status: string; reason: string }
export function graceEndsAt(expiresAt: string | Date, months?: number): string | null
export function graceDaysEndsAt(expiresAt: string | Date, days?: number): string | null
export function subscriptionAccess(snapshot?: Partial<SubscriptionAccess> | null, now?: number): SubscriptionAccess
export function referralPercentages(input: { firstReferralPercent?: number; recurringReferralPercent?: number }): { firstReferralPercent: number; recurringReferralPercent: number }
