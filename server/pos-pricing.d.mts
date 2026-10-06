export type PosSettings = { taxEnabled: boolean; taxRate: number; taxRates: Record<string, number>; taxIncluded: boolean; taxLabel: string; loyaltyEnabled: boolean; loyaltyRate: number; offlineStockPoolsEnabled: boolean; stockPools: Record<string, string> }
export type Pricing = { addedTax?:number;includedTax?:number;subtotal: number; discount: number; tax: number; total: number; lines: Array<{ productId: string; quantity: number; subtotal: number; discount: number; tax: number; total: number }>; taxSettings: PosSettings }
export type PosSaleDetails = { tillId?: string; terminalRequestId?: string; customerId?: string; customerName?: string; registerId?: string; discountType?: string; discountValue?: number; tax?: PosSettings; pricing?: Pricing; note?: string; workspace?: 'oil'; loyaltyEarned?: number; loyaltyRedeemed?: number; loyaltyBeforeBalance?: number }
export function posSettings(value?: unknown): PosSettings
export function priceOrder(items: Array<{ productId: string; quantity: number; price: number }>, options?: PosSaleDetails): Pricing
export function validatePosSale<T>(sale: T): T
export function refundFor(sale: any, existing: any[], selections: any[]): { items: any[]; total: number }

export function loyaltyBalances(sales: any[], returns: any[]): Record<string, number>
export function validateLoyaltyBalance(sale: any, sales: any[], returns: any[]): void

export function validateCheckoutSettings(sale: any, value: unknown): void
