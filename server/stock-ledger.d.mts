export const stockSchema: string
export function expiryDate(value: string): string
export function allocateStock(lots: any[], amount: number, today: string, allowExpired?: boolean): any[]
export function stockChangeSync(db: any, input: any): any
export function stockChange(db: any, input: any): Promise<any>
export function batchReport(db: any, branchId: string, today?: string, days?: number): Promise<any>

export function stockTransferSync(db: any, input: any): any[]
export function stockTransfer(db: any, input: any): Promise<any[]>

export function applySyncedSale(db:any,payload:any,operation:any,walletDebit:any):Promise<void>
