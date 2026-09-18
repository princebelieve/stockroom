export const extraReasons = { tip: 'Voluntary tip', rounding: 'Agreed rounding', donation: 'Voluntary donation', other: 'Other — explanation required' }
export function paymentPolicy(value) {
  if (typeof value === 'string') { try { value = JSON.parse(value) } catch { value = {} } }
  const p = value || {}
  return { allowExtras: p.allowExtras === true, reasonForChange: p.reasonForChange === true, printExtraDetails: p.printExtraDetails === true, reasons: Array.isArray(p.reasons) ? [...new Set(p.reasons.filter(r => Object.hasOwn(extraReasons, r)))] : ['tip', 'rounding', 'other'] }
}
function cents(value, label) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value ?? '').trim())) throw new Error(`${label} must be a non-negative amount with at most two decimals.`)
  const n = Math.round(Number(value) * 100)
  if (!Number.isSafeInteger(n)) throw new Error(`${label} is too large.`)
  return n
}
export function recordPayment(sale, policyInput, legacy = false) {
  const policy = paymentPolicy(policyInput)
  if (!['cash', 'external-pos', 'wallet'].includes(sale.paymentMethod)) throw new Error('Select a supported payment method.')
  if (legacy && !sale.paymentDetails) return sale
  const input = sale.paymentDetails || {}
  const total = Math.round(Number(sale.total) * 100)
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid sale total.')
  if (sale.paymentMethod === 'wallet') {
    if (!input.customerId) throw new Error('Select the customer wallet.')
    if (Number(input.extraKept || 0)) throw new Error('Wallet purchases must equal the sale total.')
    return { ...sale, cashReceived: null, changeGiven: null, paymentDetails: { version: 1, amountReceived: total / 100, changeGiven: 0, extraKept: 0, reason: '', note: '', customerId: String(input.customerId), printExtraDetails: false } }
  }
  const paid = cents(input.amountReceived ?? sale.cashReceived ?? (legacy ? sale.total : undefined), 'Amount received')
  const extra = cents(input.extraKept ?? 0, 'Extra retained')
  if (paid < total) throw new Error('Amount received is less than the sale total.')
  if (extra > paid - total) throw new Error('Extra retained cannot exceed the amount above the sale total.')
  if (sale.paymentMethod === 'external-pos' && paid - total !== extra) throw new Error('Account for the entire extra terminal payment. Refunds must be handled before recording the corrected payment.')
  const reason = String(input.reason || '')
  const note = String(input.note || '').trim().slice(0, 500)
  if (extra && !policy.allowExtras) throw new Error('The owner has not enabled extra payments.')
  if (extra && (!policy.reasons.includes(reason) || !Object.hasOwn(extraReasons, reason))) throw new Error('Select an owner-approved reason for the extra payment.')
  if (extra && reason === 'other' && !note) throw new Error('Explain the extra payment.')
  if (!extra && paid > total && policy.reasonForChange && reason !== 'change-returned') throw new Error('Select Change returned to account for the amount above the total.')
  if (sale.paymentMethod === 'external-pos' && (!String(sale.paymentReference || '').trim() || !String(sale.terminalProvider || '').trim())) throw new Error('Record the terminal provider and payment reference.')
  const change = (paid - total - extra) / 100
  return { ...sale, cashReceived: sale.paymentMethod === 'cash' ? paid / 100 : null, changeGiven: sale.paymentMethod === 'cash' ? change : null, paymentDetails: { version: 1, amountReceived: paid / 100, changeGiven: change, extraKept: extra / 100, reason: extra ? reason : paid > total ? 'change-returned' : '', note: extra ? note : '', printExtraDetails: policy.printExtraDetails, policy } }
}
