const money = value => Math.round((Number(value) + Number.EPSILON) * 100)
export function posSettings(value = {}) {
  if (typeof value === 'string') value = JSON.parse(value)
  const taxRate = Number(value.taxRate || 0), loyaltyRate = Number(value.loyaltyRate || 0)
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100 || !Number.isFinite(loyaltyRate) || loyaltyRate < 0 || loyaltyRate > 100) throw new Error('Rates must be between 0 and 100.')
  const taxRates = Object.fromEntries(Object.entries(value.taxRates || {}).map(([id, rate]) => {
    const n = Number(rate)
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Product tax rates must be between 0 and 100.')
    return [id, n]
  }))
  const stockPools = Object.fromEntries(Object.entries(value.stockPools || {}).map(([till, branch]) => {
    if (!till || till.length > 100 || typeof branch !== 'string' || !branch || branch.length > 80) throw new Error('Choose a valid till and stock location.')
    return [till, branch]
  }))
  if (new Set(Object.values(stockPools)).size !== Object.keys(stockPools).length) throw new Error('Each offline till needs its own stock location.')
  if (value.offlineStockPoolsEnabled && !Object.keys(stockPools).length) throw new Error('Assign stock locations before enabling offline till stock.')
  return { taxEnabled: value.taxEnabled === true, taxRate, taxRates, taxIncluded: value.taxIncluded === true, taxLabel: String(value.taxLabel || 'Tax').slice(0, 40), loyaltyEnabled: value.loyaltyEnabled === true, loyaltyRate, offlineStockPoolsEnabled: value.offlineStockPoolsEnabled === true, stockPools }
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
  const redeemed = Number(options.loyaltyRedeemed || 0)
  if (!Number.isFinite(redeemed) || redeemed < 0 || Math.abs(redeemed * 100 - Math.round(redeemed * 100)) > 0.000001) throw new Error('Enter rewards with at most two decimals.')
  if (redeemed && (!tax.loyaltyEnabled || !options.customerId)) throw new Error('Enable loyalty and select a customer to spend rewards.')
  const discount = (options.discountType === 'percent' ? Math.round(subtotal * value / 100) : money(value)) + money(redeemed)
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
    const rate = tax.taxRates[line.productId] ?? tax.taxRate
    const taxAmount = !tax.taxEnabled ? 0 : tax.taxIncluded ? Math.round(net - net / (1 + rate / 100)) : Math.round(net * rate / 100)
    return { productId: line.productId, quantity: Number(line.quantity), subtotal: line.subtotal / 100, discount: part / 100, tax: taxAmount / 100, total: (net + (tax.taxIncluded ? 0 : taxAmount)) / 100 }
  })
  return { subtotal: subtotal / 100, discount: discount / 100, tax: discounted.reduce((sum, line) => sum + money(line.tax), 0) / 100, total: discounted.reduce((sum, line) => sum + money(line.total), 0) / 100, lines: discounted, taxSettings: tax }
}
export function validatePosSale(sale) {
  if (!sale.paymentDetails?.pos) return sale
  const pos = sale.paymentDetails.pos
  const pricing = priceOrder(sale.items, pos)
  if (money(pricing.total) !== money(sale.total)) throw new Error('Sale total does not match its discounts and tax.')
  const loyaltyEarned = pricing.taxSettings.loyaltyEnabled && pos.customerId ? money(pricing.total * pricing.taxSettings.loyaltyRate / 100) / 100 : 0
  return { ...sale, paymentDetails: { ...sale.paymentDetails, pos: { ...pos, loyaltyEarned, pricing } } }
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
  const pos = sale.paymentDetails?.pos || {}
  // Allocate rewards by each line's original subtotal, using cumulative rounding
  // so several partial returns restore exactly the original redeemed amount.
  const rewardShare = (records, reward) => {
    const shares = pricing.lines.map(line => pricing.subtotal ? money(reward) * line.subtotal / pricing.subtotal : 0)
    const parts = shares.map(Math.floor)
    let left = money(reward) - parts.reduce((a,b) => a+b,0)
    for (const i of shares.map((_,i) => i).sort((a,b) => shares[b]-parts[b]-(shares[a]-parts[a]) || a-b)) { if (left <= 0) break; parts[i]++; left-- }
    return records.flatMap(record => record.items).reduce((sum,item) => sum + parts[item.lineIndex] * item.quantity / sale.items[item.lineIndex].quantity, 0)
  }
  const delta = reward => (Math.round(rewardShare([...existing, {items}], reward)) - Math.round(rewardShare(existing, reward))) / 100
  return { items, total: items.reduce((sum, item) => sum + money(item.amount), 0) / 100, loyaltyCustomerId: pos.customerId, loyaltyRestored: delta(pos.loyaltyRedeemed || 0), loyaltyReversed: delta(pos.loyaltyEarned || 0) }
}

export function loyaltyBalances(sales, returns) {
  const balances = {}
  for (const sale of sales) {
    const pos = sale.paymentDetails?.pos
    if (pos?.customerId) balances[pos.customerId] = (balances[pos.customerId] || 0) + money(pos.loyaltyEarned || 0) - money(pos.loyaltyRedeemed || 0)
  }
  const processed = []
  for (const record of [...returns].sort((a,b) => String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')) || String(a.id || '').localeCompare(String(b.id || '')))) {
    let reward = record
    const original = sales.find(sale => sale.id === record.saleId)
    if (original?.paymentDetails?.pos?.customerId && !Object.hasOwn(record, 'loyaltyRestored')) {
      reward = refundFor(original, processed.filter(row => row.saleId === record.saleId), record.items)
    }
    const id = reward.loyaltyCustomerId
    if (id) balances[id] = (balances[id] || 0) + money(reward.loyaltyRestored || 0) - money(reward.loyaltyReversed || 0)
    processed.push(record)
  }
  return Object.fromEntries(Object.entries(balances).map(([id,value]) => [id,value / 100]))
}

export function validateLoyaltyBalance(sale, sales, returns) {
  const pos = sale.paymentDetails?.pos
  if (!pos?.loyaltyRedeemed) return
  const balance = loyaltyBalances(sales, returns)[pos.customerId] || 0
  if (money(pos.loyaltyRedeemed) > Math.max(0, money(balance))) throw new Error('Insufficient customer rewards. Synchronize or reduce the rewards used.')
  pos.loyaltyBeforeBalance = balance
}

export function validateCheckoutSettings(sale, value) {
  if (sale.paymentDetails?.counterOrder) return
  if (sale.paymentDetails?.servicePayment && sale.items?.length && sale.items.every(item => String(item.productId).startsWith('service:'))) return
  const saved = posSettings(value)
  if (saved.offlineStockPoolsEnabled && saved.stockPools[sale.paymentDetails?.pos?.tillId] !== (sale.branchId || 'main')) throw new Error('Choose this till’s assigned stock location before selling. Ask the owner to assign this till if needed.')
  const pos = sale.paymentDetails?.pos
  if (!pos) return
  const requested = posSettings(pos.tax)
  const same = ['taxEnabled','taxRate','taxIncluded','taxLabel','loyaltyEnabled','loyaltyRate'].every(key => saved[key] === requested[key])
  if (!same || sale.items.some(item => (saved.taxRates[item.productId] ?? saved.taxRate) !== (requested.taxRates[item.productId] ?? requested.taxRate))) throw new Error('POS settings changed. Refresh the basket before taking payment.')
}
