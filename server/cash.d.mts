export function cashPayment(total: number, received: unknown): { cashReceived: number; changeGiven: number }
export function normalizeCashSale<T extends { paymentMethod?: unknown; total?: unknown; cashReceived?: unknown }>(sale: T): T & { cashReceived: number | null; changeGiven: number | null }
