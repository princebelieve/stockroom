import { useEffect, useMemo, useState } from 'react'

const common = ['UTC', 'Africa/Lagos', 'Africa/Accra', 'Africa/Nairobi', 'Africa/Johannesburg', 'Africa/Cairo', 'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Sao_Paulo', 'Australia/Sydney', 'Pacific/Auckland']
const names: Record<string, string> = { UTC: 'UTC / Greenwich Mean Time', 'Africa/Lagos': 'Nigeria / Lagos', 'Africa/Accra': 'Ghana / Accra', 'Africa/Nairobi': 'Kenya / Nairobi', 'Africa/Johannesburg': 'South Africa / Johannesburg', 'Africa/Cairo': 'Egypt / Cairo', 'Europe/London': 'United Kingdom / London', 'Europe/Paris': 'France / Paris', 'Asia/Dubai': 'United Arab Emirates / Dubai', 'Asia/Kolkata': 'India / Kolkata', 'Asia/Calcutta': 'India / Kolkata', 'Asia/Shanghai': 'China / Shanghai', 'Asia/Tokyo': 'Japan / Tokyo', 'America/New_York': 'United States / New York', 'America/Chicago': 'United States / Chicago', 'America/Denver': 'United States / Denver', 'America/Los_Angeles': 'United States / Los Angeles', 'America/Toronto': 'Canada / Toronto', 'America/Sao_Paulo': 'Brazil / Sao Paulo', 'Australia/Sydney': 'Australia / Sydney', 'Pacific/Auckland': 'New Zealand / Auckland' }

function supported(zone: string) { try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true } catch { return false } }
function label(zone: string) {
  const location = names[zone] || zone.replaceAll('_', ' ').replaceAll('/', ' / ')
  try {
    const offset = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value || 'GMT'
    const formatted = offset === 'GMT' ? 'UTC+00:00' : offset.replace(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/, (_, sign: string, hours: string, minutes: string) => `UTC${sign}${hours.padStart(2, '0')}:${minutes || '00'}`)
    return `${location} (${formatted})`
  } catch { return location }
}

export function TimeZoneSelect({ value, onChange }: { value: string; onChange: (zone: string) => void }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60000); return () => window.clearInterval(timer) }, [])
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const options = useMemo(() => {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
    let available: string[] = []
    try { available = intl.supportedValuesOf?.('timeZone') || [] } catch { /* Older devices use common choices. */ }
    return [...new Set([...common, ...available, value, deviceZone])].filter(supported).map(zone => ({ zone, group: zone === 'UTC' ? 'UTC' : zone.includes('/') ? zone.split('/')[0] : 'Other timezones', label: label(zone).replace(/^([^/]+) \/ (.+)/, '$2 — $1') })).sort((a, b) => a.label.localeCompare(b.label))
  }, [value, deviceZone])
  const groups = [...new Set(options.map(option => option.group))].sort((a, b) => a === 'UTC' ? 1 : b === 'UTC' ? -1 : a.localeCompare(b))
  const time = (zone: string) => new Intl.DateTimeFormat(undefined, { timeZone: zone, dateStyle: 'medium', timeStyle: 'medium' }).format(now)
  return <div>
    <label htmlFor="reporting-timezone">Business timezone</label>
    <select id="reporting-timezone" value={value} onChange={event => { onChange(event.target.value); setNow(new Date()) }}>{groups.map(group => <optgroup key={group} label={group}>{options.filter(option => option.group === group).map(option => <option key={option.zone} value={option.zone}>{option.zone === 'UTC' ? 'UTC' : option.label}</option>)}</optgroup>)}</select>
    <p>Choose a city in your business’s timezone, such as Africa → Lagos. City timezones handle daylight-saving changes automatically. Save reporting timezone to apply your selection to reports on every device.</p>
    <p>UTC time: <time aria-label="UTC time" dateTime={now.toISOString()}>{time('UTC')}</time><br />Local time for your selection: <time aria-label="Selected local time" dateTime={now.toISOString()}>{time(value)}</time></p>
  </div>
}
