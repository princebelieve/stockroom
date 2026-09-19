import type { Sale } from './types'

export function PaymentSummary({ method, total, cashReceived, extraKept, splitCash, splitTerminal, splitTransfer, money }: { method: Sale['paymentMethod']; total: number; cashReceived: string; extraKept: string; splitCash: string; splitTerminal: string; splitTransfer: string; money: (amount: number) => string }) {
  const amount = (value: string) => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : 0
  if (method === 'multiple') {
    const allocated = Math.round((amount(splitCash) + amount(splitTerminal) + amount(splitTransfer)) * 100) / 100
    const remaining = Math.round((total - allocated) * 100) / 100
    return <section className="panel full-panel"><h3>Split-payment check</h3><p>Sale total: <strong>{money(total)}</strong> · Allocated: <strong>{money(allocated)}</strong></p><p role="status">{Math.abs(remaining) < 0.005 ? 'Split payment is balanced.' : remaining > 0 ? `${money(remaining)} is still unallocated.` : `${money(-remaining)} is over the sale total. Reduce one payment portion.`}</p></section>
  }
  if (method === 'cash') {
    const tendered = amount(cashReceived); const extra = amount(extraKept); const change = Math.round((tendered - total - extra) * 100) / 100
    const note = tendered < total ? `${money(total - tendered)} more cash is required.` : change < 0 ? `Extra retained is ${money(-change)} more than the amount available above the sale total.` : extra > 0 ? `${money(extra)} is recorded as extra retained; change to give: ${money(change)}.` : `Change to give: ${money(change)}.`
    return <section className="panel full-panel"><h3>Cash-payment check</h3><p>Sale total: <strong>{money(total)}</strong> · Cash received: <strong>{money(tendered)}</strong></p><p role="status">{note}</p></section>
  }
  if (method === 'external-pos' || method === 'bank-transfer') {
    const extra = amount(extraKept)
    return <section className="panel full-panel"><h3>Payment check</h3><p>Sale total: <strong>{money(total)}</strong>{extra > 0 && <> · Extra retained: <strong>{money(extra)}</strong></>}</p><p role="status">Amount to confirm on the {method === 'bank-transfer' ? 'transfer' : 'terminal'}: <strong>{money(total + extra)}</strong>.</p></section>
  }
  return <section className="panel full-panel"><h3>Payment check</h3><p>Sale total: <strong>{money(total)}</strong>.</p></section>
}
