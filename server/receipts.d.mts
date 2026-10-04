export type ReceiptSettings = { businessName: string; address: string; phone: string; email: string; footer: string; taxEnabled: boolean; taxRate: number; taxIncluded: boolean; taxLabel: string }
export type ReceiptSnapshot = { address: string; phone: string; email: string; footer: string; number: string; transactionType: string; cardType: string }
export function receiptSettings(input?: any): ReceiptSettings
export function receiptSnapshot(input: any): ReceiptSnapshot
export function receiptText(sale: any): string
