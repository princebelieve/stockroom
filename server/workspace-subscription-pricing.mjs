export const WORKSPACE_KEY_ORDER = ['productSales', 'oil', 'fastFood', 'restaurant', 'nightlifeOperations', 'hotelOperations']

export function normalizeWorkspaceKeys(keys) {
  if (!Array.isArray(keys)) return []
  const selected = new Set(keys.map(String))
  if ([...selected].some(key => !WORKSPACE_KEY_ORDER.includes(key))) throw new Error('Workspace selection contains an unsupported workspace.')
  return WORKSPACE_KEY_ORDER.filter(key => selected.has(key))
}

export function workspaceExtraPercent(keys, config = {}) {
  const ordered = normalizeWorkspaceKeys(keys)
  const rates = {
    productSales: Number(config.workspaceAddonPercent ?? 5),
    oil: Number(config.workspaceAddonPercent ?? 5),
    fastFood: Number(config.workspaceAddonPercent ?? 5),
    restaurant: Number(config.workspaceAddonPercent ?? 5),
    nightlifeOperations: Number(config.workspaceAddonPercent ?? 5),
    hotelOperations: Number(config.hotelWorkspaceAddonPercent ?? 10),
  }
  return ordered.slice(1).reduce((sum, key) => sum + rates[key], 0)
}

export function quoteWorkspacePlan(plan, keys, config = {}) {
  const workspaceKeys = normalizeWorkspaceKeys(keys)
  const extraPercent = workspaceExtraPercent(workspaceKeys, config)
  return { workspaceKeys, workspaceCount: workspaceKeys.length, extraPercent, amount: Math.round(Number(plan.amount) * (100 + extraPercent) / 100) }
}

export function workspaceBasePlanId(extraPercent, sponsor = false) {
  const basisPoints = Math.round(Number(extraPercent) * 100)
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 50000) throw new Error('Workspace price tier is invalid.')
  return `${sponsor ? 'sponsor-' : ''}extra-${basisPoints}`
}

export function allWorkspaceBasePlanIds(config = {}) {
  const tiers = new Set()
  const keys = WORKSPACE_KEY_ORDER
  for (let mask = 1; mask < (1 << keys.length); mask++) {
    const selected = keys.filter((_, index) => mask & (1 << index))
    tiers.add(workspaceBasePlanId(workspaceExtraPercent(selected, config)))
  }
  return [...tiers].sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]))
}
