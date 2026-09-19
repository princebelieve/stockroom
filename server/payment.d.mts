export type PaymentPolicy = { allowWallet: boolean; allowWalletCredit: boolean; allowExtras: boolean; reasonForChange: boolean; printExtraDetails: boolean; reasons: string[]; providers: string[] }
export type PaymentAllocation = { method: 'cash' | 'external-pos' | 'bank-transfer'; amount: number; provider: string; reference: string }
export type PaymentDetails = { version: number; amountReceived: number; changeGiven: number; extraKept: number; reason: string; note: string; customerId?: string; creditApproved?: boolean; printExtraDetails: boolean; allocations?: PaymentAllocation[]; policy?: PaymentPolicy }
export const extraReasons: Record<string, string>
export function paymentPolicy(value?: unknown): PaymentPolicy
export function recordPayment<T>(sale: T, policyInput?: unknown, legacy?: boolean): T & { cashReceived?: number | null; changeGiven?: number | null; paymentDetails: PaymentDetails }
