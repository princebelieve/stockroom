export const posSchema: string
export function ensurePos(db: any): Promise<void>
export function posRecords(db: any, scope: string, kind: string, branch?: string): Promise<any[]>
export function savePosRecord(db: any, scope: string, record: any): Promise<void>
export function applyPosRecord(db: any, scope: string, record: any, organizationId?: string): Promise<void>
export function handlePos(options: any): Promise<any>
