import { posSettings } from './pos-pricing.mjs'

export function receiptSettings(input = {}) {
  const result = {}
  for (const [key, max] of Object.entries({ businessName: 100, address: 300, phone: 80, email: 254, footer: 1000 })) {
    const value = input[key] ?? (key === 'footer' ? 'Thank you for your business!' : '')
    if (typeof value !== 'string' || value.length > max) throw new Error(`Enter a valid receipt ${key} (up to ${max} characters).`)
    result[key] = value.trim()
  }
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new Error('Enter a valid business email.')
  result.taxEnabled = input.taxEnabled === true
  result.taxIncluded = input.taxIncluded === true
  result.taxRate = Number(input.taxRate || 0)
  result.taxLabel = String(input.taxLabel || 'Tax').trim().slice(0,40)
  posSettings(result)
  return result
}
export function receiptSnapshot(input) {
  const profile = receiptSettings(input)
  const result = { address: profile.address, phone: profile.phone, email: profile.email, footer: profile.footer }
  for (const [key, max] of Object.entries({ number: 150, transactionType: 100, cardType: 60 })) {
    if (typeof input[key] !== 'string' || input[key].length > max) throw new Error(`Enter a valid receipt ${key}.`)
    result[key] = input[key].trim()
  }
  return result
}
export function receiptText(sale) {
  const format = n => new Intl.NumberFormat('en', { style: 'currency', currency: sale.currency || 'USD' }).format(Number(n) || 0)
  const receipt = sale.paymentDetails?.receipt
  const details = sale.paymentDetails || {}
  const pricing = details.pos?.pricing
  const date = new Date(sale.createdAt)
  const method = sale.paymentMethod === 'external-pos' ? receipt?.cardType || 'Payment terminal' : { cash: 'Cash', 'bank-transfer': 'Bank transfer', multiple: 'Split payment', wallet: 'Customer wallet' }[sale.paymentMethod] || sale.paymentMethod
  return [
    'PAYMENT RECEIPT', sale.businessName || 'Receipt',
    receipt?.address && `Address: ${receipt.address}`, receipt?.phone && `Phone: ${receipt.phone}`, receipt?.email && `Email: ${receipt.email}`,
    `Receipt: ${receipt?.number || sale.id}`, receipt?.number && `Transaction ID: ${sale.id}`,
    details.counterOrder && `Order: ${details.counterOrder.id.slice(0,8).toUpperCase()}`,
    `Date: ${date.toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' })}`, `Time: ${date.toLocaleTimeString('en')}`,
    `Transaction type: ${receipt?.transactionType || (details.counterOrder?.tableService ? 'Restaurant / bar order' : details.counterOrder ? 'Fast food order' : details.servicePayment ? 'Payment' : 'In-store shopping')}`,
    details.restaurantBill && `Table / tab: ${details.restaurantBill.name} / Bill ${details.restaurantBill.sessionId.slice(0,8).toUpperCase()}`,
    details.counterOrder?.tableService && `Table / tab: ${details.counterOrder.tableService.name}${details.counterOrder.tableService.seat ? ' / Seat '+details.counterOrder.tableService.seat : ''}`,
    `Cashier: ${sale.staffName || sale.staffId || 'Not recorded'}`,
    details.servicePayment?.customerName && `Customer: ${details.servicePayment.customerName}`, details.servicePayment?.customerPhone && `Customer phone: ${details.servicePayment.customerPhone}`,
    details.pos?.customerName && `Customer: ${details.pos.customerName}`, '', 'Items | Qty | Unit price | Total',
    ...sale.items.map((item,index) => `${item.productName || item.productId} | ${item.quantity} | ${format(item.price)} | ${format(sale.paymentDetails?.restaurantBill ? pricing.lines[index].subtotal : Math.round(item.quantity * item.price * 100) / 100)}`), '',
    `Subtotal: ${format(pricing?.subtotal ?? sale.items.reduce((sum,item) => sum + item.quantity * item.price, 0))}`,
    pricing?.discount > 0 && `Discount: ${format(pricing.discount)}`,
    details.restaurantBill && pricing?.addedTax>0 && `Tax added: ${format(pricing.addedTax)}`,
    details.restaurantBill && pricing?.includedTax>0 && `Tax included in prices: ${format(pricing.includedTax)}`,
    !details.restaurantBill && pricing?.taxSettings?.taxEnabled && `${pricing?.taxSettings?.taxLabel || 'Tax'} (${pricing?.taxSettings?.taxEnabled ? pricing.taxSettings.taxRate : 0}%${pricing?.taxSettings?.taxIncluded ? ', included' : ''}): ${format(pricing?.tax || 0)}`,
    details.pos?.loyaltyRedeemed > 0 && `Rewards spent (included in discount): ${format(details.pos.loyaltyRedeemed)}`,
    `GRAND TOTAL: ${format(sale.total)}`, '', `Payment: ${method}`,
    `Amount paid: ${format(details.amountReceived ?? sale.cashReceived ?? sale.total)}`, `Change given: ${format(details.changeGiven ?? sale.changeGiven ?? 0)}`,
    ...(details.allocations||[]).map(part=>`${part.method==='cash'?'Cash':part.method==='bank-transfer'?'Bank transfer':'Payment terminal'}: ${format(part.amount)}${part.provider?' / '+part.provider:''}${part.reference?' / '+part.reference:''}`),
    sale.terminalProvider && `Provider: ${sale.terminalProvider}`, sale.paymentReference && `Reference: ${sale.paymentReference}`,
    details.printExtraDetails && details.extraKept > 0 && `Extra retained: ${format(details.extraKept)} (${details.reason})`,
    details.pos?.note && `Note: ${details.pos.note}`, '', receipt?.footer ?? 'Thank you for your business!'
  ].filter(value => value !== false && value != null).join('\n')
}
