const escapeIcs = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
const dateStamp = value => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '19700101T000000Z'
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export function hotelCalendarIcs(room, stays, generatedAt = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Stockroom Business App//Hotel Room Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(room.roomName || 'Room availability')}`,
  ]
  for (const stay of stays) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(stay.checkIn || '') || !/^\d{4}-\d{2}-\d{2}$/.test(stay.checkOut || '') || stay.checkOut <= stay.checkIn) continue
    lines.push(
      'BEGIN:VEVENT',
      `UID:${encodeURIComponent(stay.id)}@stockroom`,
      `DTSTAMP:${dateStamp(stay.updatedAt || generatedAt)}`,
      `DTSTART;VALUE=DATE:${stay.checkIn.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${stay.checkOut.replace(/-/g, '')}`,
      'SUMMARY:Reserved',
      'TRANSP:OPAQUE',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return `${lines.join('\r\n')}\r\n`
}
