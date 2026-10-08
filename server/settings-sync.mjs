// A device can save several settings snapshots in the same millisecond. Each
// saved version must still be strictly newer than its preceding local version.
export function nextSettingsTimestamp(previous, clock = Date.now()) {
  const prior = Date.parse(previous || '')
  return new Date(Math.max(clock, Number.isFinite(prior) ? prior + 1 : 0)).toISOString()
}
