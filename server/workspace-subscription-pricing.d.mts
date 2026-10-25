export const WORKSPACE_KEY_ORDER: string[]
export function normalizeWorkspaceKeys(keys: unknown): string[]
export function workspaceExtraPercent(keys: string[], config?: Record<string, number>): number
export function quoteWorkspacePlan(plan: { amount: number }, keys: string[], config?: Record<string, number>): { workspaceKeys: string[]; workspaceCount: number; extraPercent: number; amount: number }
export function workspaceBasePlanId(extraPercent: number, sponsor?: boolean): string
export function allWorkspaceBasePlanIds(config?: Record<string, number>): string[]
