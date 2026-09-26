import { extraReasons } from '../server/payment.mjs'
import type { Sale } from './types'
export function PaymentEvidence({ sales, money }: { sales: Sale[]; money: (amount: number) => string }) {
  const recorded = sales.filter(s => s.paymentDetails)
  return <section id="sales-payment-evidence" className="panel full-panel"><h3>Payment accountability</h3><p>Recorded amounts and cashier explanations for the loaded sales. These records do not prove bank settlement. Extras are separate from merchandise revenue.</p>
    <p>Extra money retained in loaded sales: <strong>{money(recorded.reduce((sum, s) => sum + (s.paymentDetails?.extraKept || 0), 0))}</strong></p>
    <div className="table-wrap"><table><thead><tr><th>Sale / cashier</th><th>Method / reference</th><th>Sale total</th><th>Received</th><th>Change</th><th>Extra retained / reason</th></tr></thead><tbody>{recorded.map(s => <tr key={s.id}><td>{s.id}<br />{s.staffName || 'Cashier not recorded'}<br />{new Date(s.createdAt).toLocaleString()}</td><td>{s.paymentMethod}<br />{s.paymentReference || s.paymentDetails?.customerId || '—'}</td><td>{money(s.total)}</td><td>{money(s.paymentDetails!.amountReceived)}</td><td>{money(s.paymentDetails!.changeGiven)}</td><td>{money(s.paymentDetails!.extraKept)}<br />{extraReasons[s.paymentDetails!.reason] || (s.paymentDetails!.reason === 'change-returned' ? 'Change returned' : '')}<br />{s.paymentDetails!.note}</td></tr>)}</tbody></table></div>
    {!recorded.length && <p>No detailed payment records in the loaded sales. Older sales may not contain this information.</p>}
  </section>
}
