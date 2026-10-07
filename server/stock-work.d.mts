export function isStockWork(record: any): boolean
export function requiresStockWorkSync(operation: any): boolean
export function validateStockWork(record: any, previous?: any, job?: any): any
export function applyStockWork(db: any, record: any, organizationId?: string): Promise<void>
export function applyStockWorkSync(db: any, record: any, organizationId?: string): void
export function handleStockWork(options: any): Promise<any>
