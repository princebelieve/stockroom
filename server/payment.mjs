import { customerOrderSettings } from './customer-order-settings.mjs'
import { validateServiceJobPayment } from './service-jobs.mjs'
import { validateRestaurantPaymentShape } from './restaurant-payments.mjs'
import { receiptSnapshot } from './receipts.mjs'
import { validatePosSale } from './pos-pricing.mjs'
export const extraReasons = { tip: 'Voluntary tip', rounding: 'Agreed rounding', donation: 'Voluntary donation', other: 'Other — explanation required' }
export function paymentPolicy(value) {
  if (typeof value === 'string') { try { value = JSON.parse(value) } catch { value = {} } }
  const p = value || {}
  return { customerOrdering: customerOrderSettings(p.customerOrdering), allowWallet: p.allowWallet === true, allowWalletCredit: p.allowWalletCredit === true, allowExtras: p.allowExtras === true, reasonForChange: p.reasonForChange === true, printExtraDetails: p.printExtraDetails === true, reasons: Array.isArray(p.reasons) ? [...new Set(p.reasons.filter(r => Object.hasOwn(extraReasons, r)))] : ['tip', 'rounding', 'other'], providers: Array.isArray(p.providers) ? [...new Set(p.providers.map(value => String(value).trim().slice(0, 100)).filter(Boolean))].slice(0, 20) : [] }
}
function cents(value, label) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value ?? '').trim())) throw new Error(`${label} must be a non-negative amount with at most two decimals.`)
  const n = Math.round(Number(value) * 100)
  if (!Number.isSafeInteger(n)) throw new Error(`${label} is too large.`)
  return n
}
export function paymentResult(sale, policyInput, legacy = false) {
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
    const cashPart=parts.filter(part=>part.method==='cash').reduce((sum,part)=>sum+part.amount,0)
    const received=input.cashReceived ?? sale.cashReceived
    const handed=received==null?null:cents(received,'Cash received')
    if(handed!=null && handed<cashPart)throw new Error('Cash received is less than the cash payment parts.')
    const change=handed==null?0:handed-cashPart
    return { ...sale, cashReceived: handed==null?null:handed/100, changeGiven: handed==null?null:change/100, paymentDetails: { version: 1, amountReceived: (total+change) / 100, changeGiven: change/100, extraKept: 0, reason: '', note: '', printExtraDetails: false, allocations: parts.map(part => ({ ...part, amount: part.amount / 100 })), policy } }
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

export function recordPayment(sale, policyInput, legacy = false) {
  const validated = sale.paymentDetails?.serviceJob ? validateServiceJobPayment(sale) : sale.paymentDetails?.restaurantBill ? validateRestaurantPaymentShape(sale) : validatePosSale(sale)
  const result = paymentResult(validated, policyInput, legacy)
  if(String(sale.id).startsWith('restaurant-payment:') && !validated.paymentDetails?.restaurantBill) throw new Error('Restaurant bill payment details are required.');
  if(validated.paymentDetails?.serviceJob) result.paymentDetails.serviceJob=validated.paymentDetails.serviceJob
  if(validated.paymentDetails?.restaurantBill) result.paymentDetails.restaurantBill=validated.paymentDetails.restaurantBill
  if (String(sale.id).startsWith('counter-payment:') && !validated.paymentDetails?.counterOrder) throw new Error('Counter order payment details are required.')
  if (validated.paymentDetails?.counterOrder) {
    const details = validated.paymentDetails.counterOrder
    if (typeof details.id !== 'string' || !details.id || details.id.length > 150 || typeof details.tillId !== 'string' || !details.tillId || details.tillId.length > 100) throw new Error('Invalid counter order payment link.')
    result.paymentDetails.counterOrder = { id: details.id, tillId: details.tillId }
    if(details.diningOption!==undefined) {if(!['Takeaway','Dine in','Delivery'].includes(details.diningOption))throw new Error('Choose a valid order type.');result.paymentDetails.counterOrder.diningOption=details.diningOption}
    if(details.tableService) { const t=details.tableService; if(typeof t.tabId !== 'string' || !t.tabId || t.tabId.length>150 || typeof t.sessionId !== 'string' || !t.sessionId || t.sessionId.length>100 || typeof t.name !== 'string' || !t.name || t.name.length>100 || !Number.isInteger(t.seat) || t.seat<0 || t.seat>100) throw new Error('Invalid table bill payment link.'); result.paymentDetails.counterOrder.tableService={tabId:t.tabId,sessionId:t.sessionId,name:t.name,seat:t.seat} }
  }
  if (validated.paymentDetails?.pos) result.paymentDetails = { ...result.paymentDetails, pos: validated.paymentDetails.pos }
  if (validated.paymentDetails?.receipt) result.paymentDetails.receipt = receiptSnapshot(validated.paymentDetails.receipt)
  if (validated.paymentDetails?.servicePayment) {
    const details = validated.paymentDetails.servicePayment
    if (!sale.items?.length || sale.items.some(item => !String(item.productId).startsWith('service:'))) throw new Error('Service payments cannot include stock products.')
    if (typeof details.customerName !== 'string' || details.customerName.length > 200 || typeof details.customerPhone !== 'string' || details.customerPhone.length > 80) throw new Error('Enter valid customer details.')
    if (!Number.isFinite(Number(sale.total)) || Number(sale.total) <= 0 || Math.round((validated.paymentDetails?.pos?.pricing?.total ?? sale.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0)) * 100) !== Math.round(Number(sale.total) * 100)) throw new Error('Service payment amount does not match its description line.')
    if (sale.items.length > 100 || sale.items.some(item => !Number.isFinite(Number(item.price)) || Number(item.price) < 0 || Math.abs(Number(item.price) * 100 - Math.round(Number(item.price) * 100)) > 0.000001 || !String(item.productName || '').trim() || String(item.productName).length > 200)) throw new Error('Use up to 100 named receipt items and unit prices with at most two decimals.')
    if (validated.paymentDetails?.pos && (validated.paymentDetails.pos.customerId || validated.paymentDetails.pos.discountValue || validated.paymentDetails.pos.loyaltyRedeemed || validated.paymentDetails.pos.tax?.loyaltyEnabled)) throw new Error('Basic payment receipts support tax without customer rewards or discounts.')
    result.paymentDetails.servicePayment = { customerName: details.customerName.trim(), customerPhone: details.customerPhone.trim() }
  }
  return result
}
