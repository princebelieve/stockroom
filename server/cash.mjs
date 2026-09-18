export function cashPayment(total, received) {
  const amount = typeof received === 'string' ? received.trim() : String(received ?? '')
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) throw new Error('Enter the cash received with no more than two decimal places.')
  const due = Math.round(Number(total) * 100)
  const paid = Math.round(Number(amount) * 100)
  if (!Number.isSafeInteger(due) || due < 0 || !Number.isSafeInteger(paid)) throw new Error('Cash amount is outside the supported range.')
  if (paid < due) throw new Error('Cash received is less than the sale total.')
  return { cashReceived: paid / 100, changeGiven: (paid - due) / 100 }
}
export function normalizeCashSale(sale) {
  if (sale.paymentMethod !== 'cash') return { ...sale, cashReceived: null, changeGiven: null }
  // Older sales predate cash tender recording; do not invent amounts for them.
  if (sale.cashReceived == null) return { ...sale, cashReceived: null, changeGiven: null }
  return { ...sale, ...cashPayment(sale.total, sale.cashReceived) }
}
