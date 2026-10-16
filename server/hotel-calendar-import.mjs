import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import https from 'node:https'

const MAX_BYTES = 1_000_000
const MAX_EVENTS = 5000

function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number)
    const c = Number(address.split('.')[2])
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 0 || b === 168 || b === 88 && c === 99 || b === 0 && c === 2) || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113 || a === 100 && b >= 64 && b <= 127)
  }
  if (isIP(address) === 6) {
    const value = address.toLowerCase()
    return /^[23]/.test(value) && !(value.startsWith('2001:db8:') || value === '2001:db8' || value.startsWith('2001:0:') || value.startsWith('2001:10:') || value.startsWith('2001:20:') || value.startsWith('2001:2:') || value.startsWith('2002:'))
  }
  return false
}

export function validateHotelCalendarUrl(value) {
  const raw = String(value || '').trim()
  if (!raw || raw.length > 2048) throw new Error('Enter a calendar link no longer than 2,048 characters.')
  let url
  try { url = new URL(raw) } catch { throw new Error('Enter a valid HTTPS iCalendar link.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port && url.port !== '443' || !url.hostname || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local')) throw new Error('Calendar links must use a public HTTPS address.')
  return url.toString()
}

function property(event, key) {
  const line = event.find(row => row.slice(0, row.indexOf(':') < 0 ? row.length : row.indexOf(':')).split(';')[0].toUpperCase() === key)
  if (!line) return ''
  const colon = line.indexOf(':')
  return colon < 0 ? '' : line.slice(colon + 1).trim()
}

function eventDate(event, key) {
  const line = event.find(row => row.slice(0, row.indexOf(':') < 0 ? row.length : row.indexOf(':')).split(';')[0].toUpperCase() === key)
  if (!line) return ''
  const colon = line.indexOf(':')
  const raw = line.slice(colon + 1).trim()
  const date = raw.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!date) return ''
  const result = `${date[1]}-${date[2]}-${date[3]}`
  const parsed = new Date(`${result}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result ? '' : result
}

export function parseHotelCalendarIcs(input) {
  const text = String(input || '').replace(/\r?\n[ \t]/g, '').replace(/\r?\n/g, '\n')
  if (!/^BEGIN:VCALENDAR(?:\n|$)/i.test(text)) throw new Error('The partner link did not return a valid iCalendar feed.')
  const events = []
  let current = null
  for (const line of text.split('\n')) {
    if (/^BEGIN:VEVENT\s*$/i.test(line)) { if (current) throw new Error('The calendar contains a malformed event.'); current = []; continue }
    if (/^END:VEVENT\s*$/i.test(line)) { if (current) events.push(current); current = null; if (events.length > MAX_EVENTS) throw new Error('The calendar has more than 5,000 events.'); continue }
    if (current) current.push(line)
  }
  const blocks = []
  for (const event of events) {
    if (property(event, 'STATUS').toUpperCase() === 'CANCELLED') continue
    const start = eventDate(event, 'DTSTART')
    const end = eventDate(event, 'DTEND')
    if (!start || !end || end <= start) continue
    const uid = property(event, 'UID') || `${start}/${end}/${blocks.length}`
    blocks.push({ id: createHash('sha256').update(uid).digest('hex').slice(0, 32), checkIn: start, checkOut: end })
  }
  return blocks
}

export async function fetchHotelCalendar(urlValue) {
  const url = new URL(validateHotelCalendarUrl(urlValue))
  const addresses = await lookup(url.hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(row => !publicAddress(row.address))) throw new Error('The calendar host must resolve to a public internet address.')
  const chosen = addresses[0]
  const body = await new Promise((resolve, reject) => {
    const request = https.request(url, { method: 'GET', headers: { Accept: 'text/calendar, text/plain;q=0.9', 'User-Agent': 'Stockroom-Hotel-Calendar/1.0' }, lookup: (_hostname, _options, callback) => callback(null, chosen.address, chosen.family), timeout: 12_000 }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`Partner calendar returned HTTP ${response.statusCode || 'error'}.`)); return }
      if (response.headers.location) { response.resume(); reject(new Error('Calendar redirects are not supported. Copy the final partner calendar link instead.')); return }
      const chunks = []; let size = 0
      response.on('data', chunk => { size += chunk.length; if (size > MAX_BYTES) { request.destroy(new Error('Partner calendar is larger than 1 MB.')); return } chunks.push(chunk) })
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      response.on('error', reject)
    })
    request.on('timeout', () => request.destroy(new Error('Partner calendar request timed out.')))
    request.on('error', reject)
    request.end()
  })
  return parseHotelCalendarIcs(body)
}
