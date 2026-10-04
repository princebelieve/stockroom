export function consumptionId(id: string): string
export function validateRecipe(recipe?: any[]): void
export function recipeRequirements(order: any): any[]
export function validateConsumption(record: any, order?: any, previous?: any): void
export function consumeRecipe(db: any, order: any, updatedAt: string, organizationId?: string): Promise<any>
export function applyConsumption(db: any, record: any, organizationId?: string): Promise<void>
export function applyConsumptionSync(db: any, record: any, organizationId?: string): void
