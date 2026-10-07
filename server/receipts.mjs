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
  if (input.serviceItems !== undefined) {
    if (!Array.isArray(input.serviceItems) || input.serviceItems.length > 200) throw new Error('Use up to 200 saved services.')
    const ids = new Set()
    result.serviceItems = input.serviceItems.map(item => {
      const id = String(item?.id || ''), name = String(item?.name || '').trim(), price = Number(item?.price)
      if (!/^[a-zA-Z0-9_-]{3,100}$/.test(id) || ids.has(id) || !name || name.length > 150 || !Number.isFinite(price) || price < 0 || !Number.isSafeInteger(Math.round(price * 100)) || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) throw new Error('Enter unique saved services with valid names and prices.')
      ids.add(id); return { id, name, price }
    })
  }
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
  const method = sale.paymentMethod === 'external-pos' ? receipt?.cardType || 'POS Terminal' : { cash: 'Cash', 'bank-transfer': 'Bank Transfer', multiple: 'Split payment', wallet: 'Customer wallet' }[sale.paymentMethod] || sale.paymentMethod
  return [
    'PAYMENT RECEIPT', sale.businessName || 'Receipt',
    receipt?.address && `Address: ${receipt.address}`, receipt?.phone && `Phone: ${receipt.phone}`, receipt?.email && `Email: ${receipt.email}`,
    `Receipt: ${receipt?.number || sale.id}`, receipt?.number && `Transaction ID: ${sale.id}`,
    details.counterOrder?.diningOption && `Order type: ${details.counterOrder.diningOption}`,
    details.counterOrder && `Order: ${details.counterOrder.id.slice(0,8).toUpperCase()}`,
    `Date: ${date.toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' })}`, `Time: ${date.toLocaleTimeString('en')}`,
    `Transaction type: ${receipt?.transactionType || (details.counterOrder?.tableService ? 'Restaurant / bar order' : details.counterOrder ? 'Fast food order' : details.servicePayment ? 'Payment' : 'In-store shopping')}`,
    details.restaurantBill && `Table / tab: ${details.restaurantBill.name} / Bill ${details.restaurantBill.sessionId.slice(0,8).toUpperCase()}`,
    details.counterOrder?.tableService && `Table / tab: ${details.counterOrder.tableService.name}${details.counterOrder.tableService.seat ? ' / Seat '+details.counterOrder.tableService.seat : ''}`,
    `Cashier: ${sale.staffName || sale.staffId || 'Not recorded'}`,
    details.servicePayment?.customerName && `Customer: ${details.servicePayment.customerName}`, details.servicePayment?.customerPhone && `Customer phone: ${details.servicePayment.customerPhone}`,
    details.serviceJob?.church && `Fund: ${details.serviceJob.church.fundName}\nDonor: ${details.serviceJob.church.donorName}`,
    details.serviceJob?.church?.type==='pledge' && `Pledge: ${details.serviceJob.title}\nCommitment: ${format(details.serviceJob.invoiceTotal)}\nRemaining at this payment: ${format(details.serviceJob.balanceDue)}`,
    details.serviceJob && !details.serviceJob.church && `Invoice: #${details.serviceJob.number} / ${details.serviceJob.title}\nInvoice total: ${format(details.serviceJob.invoiceTotal)}\nBalance due: ${format(details.serviceJob.balanceDue)}`,
    details.pos?.customerName && `Customer: ${details.pos.customerName}`, '', 'Items | Qty | Unit price | Total',
    ...sale.items.map((item,index) => `${item.productName || item.productId} | ${item.quantity} | ${format(item.price)} | ${format(sale.paymentDetails?.restaurantBill ? pricing.lines[index].subtotal : Math.round(item.quantity * item.price * 100) / 100)}`), '',
    `Subtotal: ${format(pricing?.subtotal ?? sale.items.reduce((sum,item) => sum + item.quantity * item.price, 0))}`,
    pricing?.discount > 0 && `Discount: ${format(pricing.discount)}`,
    details.restaurantBill && pricing?.addedTax>0 && `Tax added: ${format(pricing.addedTax)}`,
    details.restaurantBill && pricing?.includedTax>0 && `Tax included in prices: ${format(pricing.includedTax)}`,
    !details.restaurantBill && pricing?.taxSettings?.taxEnabled && `${pricing?.taxSettings?.taxLabel || 'Tax'} (${pricing?.taxSettings?.taxEnabled ? pricing.taxSettings.taxRate : 0}%${pricing?.taxSettings?.taxIncluded ? ', included' : ''}): ${format(pricing?.tax || 0)}`,
    details.pos?.loyaltyRedeemed > 0 && `Rewards spent (included in discount): ${format(details.pos.loyaltyRedeemed)}`,
    `GRAND TOTAL: ${format(sale.total)}`, '', `Payment Method: ${method}`,
    `Amount paid: ${format(details.amountReceived ?? sale.cashReceived ?? sale.total)}`, `Change given: ${format(details.changeGiven ?? sale.changeGiven ?? 0)}`,
    ...(details.allocations||[]).map(part=>`${part.method==='cash'?'Cash':part.method==='bank-transfer'?'Bank Transfer':'POS Terminal'}: ${format(part.amount)}${part.provider?' / '+part.provider:''}${part.reference?' / '+part.reference:''}`),
    sale.terminalProvider && `Provider: ${sale.terminalProvider}`, sale.paymentReference && `Reference: ${sale.paymentReference}`,
    details.printExtraDetails && details.extraKept > 0 && `Extra retained: ${format(details.extraKept)} (${details.reason})`,
    details.pos?.note && `Note: ${details.pos.note}`, '', receipt?.footer ?? 'Thank you for your business!'
  ].filter(value => value !== false && value != null).join('\n')
}
