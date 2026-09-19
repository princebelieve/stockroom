// Calendar-month grace in UTC, clamped for shorter months (Jan 31 -> Feb 28/29).
export function graceEndsAt(expiresAt) {
  const date = new Date(expiresAt)
  if (!Number.isFinite(+date)) return null
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + 1)
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, lastDay))
  return date.toISOString()
}

export function subscriptionAccess(snapshot, now = Date.now()) {
  if (!snapshot) return { blocked: true, reason: 'Connect to the internet to check subscription access.', status: 'unknown' }
  if (snapshot.testMode === true) return { ...snapshot, blocked: false, status: 'test', reason: 'Developer test mode is on. Subscription blocks are disabled.' }
  if (!snapshot.expiresAt) return { ...snapshot, blocked: true, status: 'unpaid', reason: 'A subscription is required. Ask the owner to renew.' }
  const end = graceEndsAt(snapshot.expiresAt)
  if (!end) return { ...snapshot, blocked: true, status: 'unknown', reason: 'Connect to refresh subscription access.' }
  const active = now < +new Date(snapshot.expiresAt)
  const blocked = now >= +new Date(end)
  return { ...snapshot, graceEndsAt: end, blocked, status: active ? 'active' : blocked ? 'expired' : 'grace', reason: active ? 'Subscription active.' : blocked ? 'The one-month grace period has ended. Ask the owner to renew to use POS.' : `Subscription expired. POS remains available until ${end.slice(0, 10)} (UTC).` }
}

export function referralPercentages(input) {
  const firstReferralPercent = Number(input.firstReferralPercent ?? 0)
  const recurringReferralPercent = Number(input.recurringReferralPercent ?? 0)
  for (const value of [firstReferralPercent, recurringReferralPercent]) {
    if (!Number.isFinite(value) || value < 0 || value > 100 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) throw new Error('Referral percentages must be between 0 and 100 with at most two decimal places.')
  }
  return { firstReferralPercent, recurringReferralPercent }
}
