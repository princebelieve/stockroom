export const extraReasons = { tip: 'Voluntary tip', rounding: 'Agreed rounding', donation: 'Voluntary donation', other: 'Other — explanation required' }
export function paymentPolicy(value) {
  if (typeof value === 'string') { try { value = JSON.parse(value) } catch { value = {} } }
  const p = value || {}
  return { allowWallet: p.allowWallet === true, allowWalletCredit: p.allowWalletCredit === true, allowExtras: p.allowExtras === true, reasonForChange: p.reasonForChange === true, printExtraDetails: p.printExtraDetails === true, reasons: Array.isArray(p.reasons) ? [...new Set(p.reasons.filter(r => Object.hasOwn(extraReasons, r)))] : ['tip', 'rounding', 'other'], providers: Array.isArray(p.providers) ? [...new Set(p.providers.map(value => String(value).trim().slice(0, 100)).filter(Boolean))].slice(0, 20) : [] }
}
function cents(value, label) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value ?? '').trim())) throw new Error(`${label} must be a non-negative amount with at most two decimals.`)
  const n = Math.round(Number(value) * 100)
  if (!Number.isSafeInteger(n)) throw new Error(`${label} is too large.`)
  return n
}
export function recordPayment(sale, policyInput, legacy = false) {
  const policy = paymentPolicy(policyInput)
  if (!['cash', 'external-pos', 'bank-transfer', 'multiple', 'wallet'].includes(sale.paymentMethod)) throw new Error('Select a supported payment method.')
  if (legacy && !sale.paymentDetails) return sale
  const input = sale.paymentDetails || {}
  const total = Math.round(Number(sale.total) * 100)
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid sale total.')
  if (sale.paymentMethod === 'multiple') {
    const allocations = Array.isArray(input.allocations) ? input.allocations : []
    if (allocations.length < 2) throw new Error('Record at least two payment parts.')
    const parts = allocations.map((allocation) => {
      const method = String(allocation?.method || '')
      if (!['cash', 'external-pos', 'bank-transfer'].includes(method)) throw new Error('A split payment may use cash, terminal, or bank transfer.')
      const amount = cents(allocation?.amount, 'Each payment amount')
      if (!amount) throw new Error('Each payment amount must be greater than zero.')
      const provider = String(allocation?.provider || '').trim().slice(0, 200)
      const reference = String(allocation?.reference || '').trim().slice(0, 200)
      if (method !== 'cash' && (!provider || !reference)) throw new Error('Record the provider and reference for every terminal or bank-transfer part.')
      return { method, amount, provider, reference }
    })
    if (parts.reduce((sum, part) => sum + part.amount, 0) !== total) throw new Error('Split payment amounts must equal the sale total exactly.')
    return { ...sale, cashReceived: null, changeGiven: null, paymentDetails: { version: 1, amountReceived: total / 100, changeGiven: 0, extraKept: 0, reason: '', note: '', printExtraDetails: false, allocations: parts.map(part => ({ ...part, amount: part.amount / 100 })), policy } }
  }
  if (sale.paymentMethod === 'wallet') {
    if (!policy.allowWallet) throw new Error('The owner has not enabled wallet payments.')
    if (input.creditApproved && !policy.allowWalletCredit) throw new Error('The owner has not enabled purchases on credit.')
    if (!input.customerId) throw new Error('Select the customer wallet.')
    if (Number(input.extraKept || 0)) throw new Error('Wallet purchases must equal the sale total.')
    return { ...sale, cashReceived: null, changeGiven: null, paymentDetails: { version: 1, amountReceived: total / 100, changeGiven: 0, extraKept: 0, reason: '', note: '', customerId: String(input.customerId), creditApproved: input.creditApproved === true, printExtraDetails: false, policy } }
  }
  const paid = cents(input.amountReceived ?? sale.cashReceived ?? (legacy ? sale.total : undefined), 'Amount received')
  const rawExtra = cents(input.extraKept ?? 0, 'Extra retained')
  const isCashPayment = sale.paymentMethod === 'cash'
  const extra = isCashPayment ? 0 : rawExtra
  if (paid < total) throw new Error('Amount received is less than the sale total.')
  if (extra > paid - total) throw new Error('Extra retained cannot exceed the amount above the sale total.')
  if (sale.paymentMethod === 'external-pos' && paid - total !== extra) throw new Error('Account for the entire extra terminal payment before recording the sale.')
  if (sale.paymentMethod === 'bank-transfer' && extra && extra !== paid - total) throw new Error('A transfer overpayment must be returned or retained in full.')
  const reason = isCashPayment ? '' : String(input.reason || '')
  const note = isCashPayment ? '' : String(input.note || '').trim().slice(0, 500)
  if (extra && !policy.allowExtras) throw new Error('The owner has not enabled extra payments.')
  if (extra && (!policy.reasons.includes(reason) || !Object.hasOwn(extraReasons, reason))) throw new Error('Select an owner-approved reason for the extra payment.')
  if (extra && reason === 'other' && !note) throw new Error('Explain the extra payment.')
  if (sale.paymentMethod === 'bank-transfer' && !extra && paid > total && policy.reasonForChange && reason !== 'change-returned') throw new Error('Confirm that the transfer overpayment was returned to the customer.')
  if (['external-pos', 'bank-transfer'].includes(sale.paymentMethod) && (!String(sale.paymentReference || '').trim() || !String(sale.terminalProvider || '').trim())) throw new Error(`Record the ${sale.paymentMethod === 'bank-transfer' ? 'bank or transfer provider' : 'terminal provider'} and payment reference.`)
  const change = (paid - total - extra) / 100
  return { ...sale, cashReceived: isCashPayment ? paid / 100 : null, changeGiven: isCashPayment ? change : null, paymentDetails: { version: 1, amountReceived: paid / 100, changeGiven: change, extraKept: extra / 100, reason: extra ? reason : sale.paymentMethod === 'bank-transfer' && paid > total ? 'change-returned' : '', note: extra ? note : '', printExtraDetails: policy.printExtraDetails, policy } }
}
