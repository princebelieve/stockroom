export function isBranchOperation(path: string): boolean
export function hasActiveBranchAccess(user: {id: string; role: string}, branches: {isActive?: boolean | number; assignedUserIds?: string[]}[]): boolean
