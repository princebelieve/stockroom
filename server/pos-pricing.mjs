const money = value => Math.round((Number(value) + Number.EPSILON) * 100)
export function posSettings(value = {}) {
  if (typeof value === 'string') value = JSON.parse(value)
  const taxRate = Number(value.taxRate || 0), loyaltyRate = Number(value.loyaltyRate || 0)
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100 || !Number.isFinite(loyaltyRate) || loyaltyRate < 0 || loyaltyRate > 100) throw new Error('Rates must be between 0 and 100.')
  return { taxEnabled: value.taxEnabled === true, taxRate, taxIncluded: value.taxIncluded === true, taxLabel: String(value.taxLabel || 'Tax').slice(0, 40), loyaltyEnabled: value.loyaltyEnabled === true, loyaltyRate }
}
export function priceOrder(items, options = {}) {
  const tax = posSettings(options.tax || {})
  const lines = items.map(item => {
    if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || Math.abs(Math.round(Number(item.quantity) * 1000) - Number(item.quantity) * 1000) > 0.000001 || !Number.isFinite(Number(item.price)) || Number(item.price) < 0) throw new Error('Use positive quantities with up to three decimals and valid prices.')
    return { ...item, subtotal: money(Number(item.quantity) * Number(item.price)) }
  })
  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0)
  const value = Number(options.discountValue || 0)
  if (!Number.isFinite(value) || value < 0 || (options.discountType === 'percent' && value > 100)) throw new Error('Invalid discount.')
  const discount = options.discountType === 'percent' ? Math.round(subtotal * value / 100) : money(value)
  if (discount > subtotal) throw new Error('Discount exceeds the basket subtotal.')
  const shares = lines.map(line => subtotal ? discount * line.subtotal / subtotal : 0)
  const parts = shares.map(Math.floor)
  let remainder = discount - parts.reduce((sum, part) => sum + part, 0)
  for (const index of shares.map((_, index) => index).sort((a, b) => (shares[b] - parts[b]) - (shares[a] - parts[a]) || a - b)) {
    if (!remainder) break
    if (parts[index] < lines[index].subtotal) { parts[index]++; remainder-- }
  }
  const discounted = lines.map((line, index) => {
    const part = parts[index]
    const net = line.subtotal - part
    const taxAmount = !tax.taxEnabled ? 0 : tax.taxIncluded ? Math.round(net - net / (1 + tax.taxRate / 100)) : Math.round(net * tax.taxRate / 100)
    return { productId: line.productId, quantity: Number(line.quantity), subtotal: line.subtotal / 100, discount: part / 100, tax: taxAmount / 100, total: (net + (tax.taxIncluded ? 0 : taxAmount)) / 100 }
  })
  return { subtotal: subtotal / 100, discount: discount / 100, tax: discounted.reduce((sum, line) => sum + money(line.tax), 0) / 100, total: discounted.reduce((sum, line) => sum + money(line.total), 0) / 100, lines: discounted, taxSettings: tax }
}
export function validatePosSale(sale) {
  if (!sale.paymentDetails?.pos) return sale
  const pos = sale.paymentDetails.pos
  const pricing = priceOrder(sale.items, pos)
  if (money(pricing.total) !== money(sale.total)) throw new Error('Sale total does not match its discounts and tax.')
  return { ...sale, paymentDetails: { ...sale.paymentDetails, pos: { ...pos, pricing } } }
}
export function refundFor(sale, existing, selections) {
  const pricing = sale.paymentDetails?.pos?.pricing || priceOrder(sale.items)
  const items = selections.filter(item => Number(item.quantity) > 0).map(selection => {
    const index = Number(selection.lineIndex)
    const original = sale.items[index], line = pricing.lines[index]
    const quantity = Number(selection.quantity)
    const returned = existing.flatMap(record => record.items).filter(item => item.lineIndex === index).reduce((sum, item) => sum + Number(item.quantity), 0)
    if (!original || !Number.isFinite(quantity) || quantity <= 0 || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.000001 || quantity + returned > original.quantity + 0.000001) throw new Error('Return quantity exceeds the quantity remaining on the receipt.')
    const amount = (Math.round(money(line.total) * (returned + quantity) / original.quantity) - Math.round(money(line.total) * returned / original.quantity)) / 100
    let offset=returned,remaining=quantity
    const allocations=[]
    const batches=typeof original.batchAllocations==='string'?JSON.parse(original.batchAllocations):original.batchAllocations||[]
    for(const part of batches){const skipped=Math.min(offset,part.quantity);offset-=skipped;const units=Math.min(remaining,part.quantity-skipped);if(units>0){allocations.push({...part,quantity:units});remaining-=units}}
    const tax = (Math.round(money(line.tax || 0) * (returned + quantity) / original.quantity) - Math.round(money(line.tax || 0) * returned / original.quantity)) / 100
    const unitCost = allocations.length ? allocations.reduce((sum, part) => sum + part.quantity * part.unitCost, 0) / quantity : Number(original.unitCost || 0)
    return { tax, unitCost, batchAllocations: allocations, lineIndex: index, productId: original.productId, productName: original.productName, quantity, amount, restock: selection.restock === true && !String(original.productId).startsWith('service:') }
  })
  if (!items.length || new Set(items.map(item => item.lineIndex)).size !== items.length) throw new Error('Select each returned line once.')
  return { items, total: items.reduce((sum, item) => sum + money(item.amount), 0) / 100 }
}
