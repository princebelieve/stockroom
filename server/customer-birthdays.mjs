import { businessDate } from './report-timezone.mjs'
export function birthdayValue(value) {
  const text=String(value || '').trim()
  if(!text)return ''
  if(!/^\d{2}-\d{2}$/.test(text) || (!Number.isFinite(Date.parse('2000-'+text+'T12:00:00Z')) || new Date('2000-'+text+'T12:00:00Z').toISOString().slice(5,10)!==text))throw new Error('Enter a valid birthday month and day (MM-DD).')
  return text
}
export function birthdayCustomers(customers, now=new Date(), timeZone='UTC') {
  const today=businessDate(now,timeZone).slice(5)
  return customers.filter(customer=>customer.birthdayReminders===true || customer.birthdayReminders===1).filter(customer=>customer.birthday===today)
}
