export function counterSaleId(id: string): string
export function requiresCounterSync(operation: any): boolean
export function counterPaymentFingerprint(sale: any): string
export function validateCounterRetry(sale: any, previous: any): void
export function counterItems(order: any): Array<{ productId: string; productName: string; quantity: number; price: number }>
export function validateCounterPayment(sale: any, order: any, tillId?: string): void
export function validateCounterRecord(record: any, previous?: any, snapshot?: boolean): void
export function counterConflictRecord(conflict: any): any
export function handleCounter(options: any): Promise<any>
