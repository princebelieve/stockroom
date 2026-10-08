// Shared by the desktop API and local browser/Android data layer.
// Account and branch configuration stay reachable when access needs repair.
export function isBranchOperation(path) {
  return /^\/api\/(?:products|sales|retail|pos|stocktakes|movements|customers|expenses|reports|branch-transfers)(?:\/|$)/.test(path.split('?')[0])
}

export function hasActiveBranchAccess(user, branches) {
  return branches.some(branch => Boolean(branch.isActive) && (user.role === 'owner' || !branch.assignedUserIds?.length || branch.assignedUserIds.includes(user.id)))
}
