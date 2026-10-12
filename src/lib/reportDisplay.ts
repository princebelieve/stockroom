export function reportPeriodLabel(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now)
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value)
  const year = get('year'), month = get('month'), day = get('day')
  const monthName = new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)))
  const zoneName: Record<string, string> = { UTC: 'UTC', 'Africa/Lagos': 'Lagos time', 'Africa/Accra': 'Accra time', 'Africa/Nairobi': 'Nairobi time', 'Africa/Johannesburg': 'Johannesburg time', 'Africa/Cairo': 'Cairo time' }
  const location = zoneName[timeZone] || `${timeZone.split('/').at(-1)?.replaceAll('_', ' ') || 'Local'} time`
  const range = day === 1 ? `${monthName} 1, ${year}` : `${monthName} 1–${day}, ${year}`
  return `${range} · ${location}`
}
