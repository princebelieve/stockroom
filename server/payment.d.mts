export type PaymentPolicy = { allowExtras: boolean; reasonForChange: boolean; printExtraDetails: boolean; reasons: string[] }
export type PaymentDetails = { version: number; amountReceived: number; changeGiven: number; extraKept: number; reason: string; note: string; customerId?: string; printExtraDetails: boolean; policy?: PaymentPolicy }
export const extraReasons: Record<string, string>
export function paymentPolicy(value?: unknown): PaymentPolicy
export function recordPayment<T>(sale: T, policyInput?: unknown, legacy?: boolean): T & { cashReceived?: number | null; changeGiven?: number | null; paymentDetails: PaymentDetails }
