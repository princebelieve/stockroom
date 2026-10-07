import { reportTimeZone, businessDayStart, nextBusinessDate } from './report-timezone.mjs'

export function reservationLocalTime(instant, timeZone) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:reportTimeZone(timeZone),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant)).map(part=>[part.type,part.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
// Search the actual business calendar day, which may contain 23 or 25 hours.
// This avoids using the device's timezone or guessing an offset during DST.
export function reservationInstant(value,timeZone,occurrence='earlier') {
  if(typeof value!=='string'|| !/^(20\d{2}|21\d{2})-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !['earlier','later'].includes(occurrence))throw new Error('Enter a valid reservation date and time.')
  const date=value.slice(0,10),next=nextBusinessDate(date),zone=reportTimeZone(timeZone)
  const start=Date.parse(businessDayStart(date,zone)),end=Date.parse(businessDayStart(next,zone))
  const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
  const matches=[]
  for(let t=start;t<end;t+=60000){const p=Object.fromEntries(formatter.formatToParts(new Date(t)).map(part=>[part.type,part.value]));if(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`===value)matches.push(t)}
  if(!matches.length)throw new Error('This local time does not exist in the business timezone. Choose another time.')
  return new Date(occurrence==='later'?matches.at(-1):matches[0]).toISOString()
}
