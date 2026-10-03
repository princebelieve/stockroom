export type PosSettings = { taxEnabled: boolean; taxRate: number; taxIncluded: boolean; taxLabel: string; loyaltyEnabled: boolean; loyaltyRate: number }
export type Pricing = { subtotal: number; discount: number; tax: number; total: number; lines: Array<{ productId: string; quantity: number; subtotal: number; discount: number; tax: number; total: number }>; taxSettings: PosSettings }
export type PosSaleDetails = { terminalRequestId?: string; customerId?: string; customerName?: string; registerId?: string; discountType?: string; discountValue?: number; tax?: PosSettings; pricing?: Pricing; note?: string; loyaltyEarned?: number }
export function posSettings(value?: unknown): PosSettings
export function priceOrder(items: Array<{ productId: string; quantity: number; price: number }>, options?: PosSaleDetails): Pricing
export function validatePosSale<T>(sale: T): T
export function refundFor(sale: any, existing: any[], selections: any[]): { items: any[]; total: number }
