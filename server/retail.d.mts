export const retailMigrations: Array<{ version: number; sql: string }>
export function migrateRetail(db: any): Promise<void>
export function retailRecords(db: any, scope: string): Promise<any[]>
export function retailStatements(record: any, scope: string, organizationId?: string): Array<[string, any[]]>
export function applyRetailRecord(db: any, scope: string, record: any, organizationId?: string): Promise<boolean>
export function handleRetail(options: any): Promise<any>

export function validateRetailRecord(record: any): any
