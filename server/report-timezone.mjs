export function reportTimeZone(value = 'UTC') {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) throw new Error('Enter a valid reporting timezone, such as Africa/Lagos.')
  try { return new Intl.DateTimeFormat('en', { timeZone: value.trim() }).resolvedOptions().timeZone }
  catch { throw new Error('Enter a valid reporting timezone, such as Africa/Lagos.') }
}

// Compare calendar dates in the business zone without host timezone or DST assumptions.
export function reportCalendar(timeZone, instant) {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: reportTimeZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit' })
  return value => {
    if (typeof value !== 'string') return ''
    const milliseconds = Date.parse(value)
    if (!Number.isFinite(milliseconds)) return ''
    // An explicitly entered expense date is already a business calendar date.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
    if (milliseconds > instant.getTime()) return ''
    const parts = Object.fromEntries(formatter.formatToParts(new Date(milliseconds)).map(part => [part.type, part.value]))
    return `${parts.year}-${parts.month}-${parts.day}`
  }
}

export function businessDate(value, timeZone = 'UTC') {
  return reportCalendar(timeZone, new Date(8640000000000000))(value instanceof Date ? value.toISOString() : value)
}
export function nextBusinessDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0,10) !== date) throw new Error('Enter a valid calendar date.')
  return new Date(Date.parse(date) + 86400000).toISOString().slice(0,10)
}
// Find the first instant of a calendar day, including DST and midnight offsets.
export function businessDayStart(date, timeZone = 'UTC') {
  nextBusinessDate(date)
  let low = Date.parse(date) - 36 * 3600000, high = Date.parse(date) + 36 * 3600000
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (businessDate(new Date(middle), timeZone) < date) low = middle + 1
    else high = middle
  }
  return new Date(low).toISOString()
}
