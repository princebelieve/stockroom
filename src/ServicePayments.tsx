import { useEffect, useState } from 'react'
import { AsyncButton, AsyncForm, SubmitButton } from './AsyncControls'
import { DigitalReceipt } from './PosTools'
import type { Customer, Sale } from './types'

type Draft = { id: string; purpose: string; name: string; phone: string; amount: string; method: 'cash' | 'bank-transfer' | 'external-pos'; provider: string; reference: string; cash: string }
const fresh = (): Draft => ({ id: crypto.randomUUID(), purpose: '', name: '', phone: '', amount: '', method: 'cash', provider: '', reference: '', cash: '' })

export function ServicePayments({ storageKey, hidden, enabled, customers, receipts, headers, save, print, beforeSend, money }: {
  storageKey: string; hidden: boolean; enabled: boolean; customers: Customer[]; receipts: Sale[]; headers: Record<string, string>;
  save: (draft: Draft) => Promise<Sale>; print: (sale: Sale) => Promise<void>; beforeSend: () => Promise<void>; money: (amount: number) => string
}) {
  const [draft, setDraft] = useState<Draft>(() => { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(storageKey) || '{}') } } catch { return fresh() } })
  const [saved, setSaved] = useState<Sale | null>(null)
  const [query, setQuery] = useState('')
  const [storageError, setStorageError] = useState('')
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(draft)); setStorageError('') } catch { setStorageError('This draft could not be saved on this device. Keep this screen open until payment is saved.') } }, [storageKey, draft])
  const change = (patch: Partial<Draft>) => { setDraft(current => ({ ...current, ...patch })); setSaved(null) }
  const amount = Number(draft.amount)
  const valid = draft.purpose.trim() && /^\d+(?:\.\d{1,2})?$/.test(draft.amount) && amount > 0
  const history = receipts.filter(sale => sale.paymentDetails?.servicePayment).filter(sale => `${sale.id} ${sale.items.map(item => item.productName).join(' ')} ${sale.paymentDetails?.servicePayment?.customerName} ${sale.paymentDetails?.servicePayment?.customerPhone} ${sale.paymentReference || ''}`.toLowerCase().includes(query.toLowerCase()))
  return <section hidden={hidden} className="service-payments">
    <AsyncForm className="panel settings-form" busyLabel="Saving payment..." onSubmit={async () => {
      if (!enabled || !valid) throw new Error('Enter what the payment is for and a positive amount.')
      const receipt = await save(draft)
      setSaved(receipt); setDraft(fresh())
    }}>
      <h2>Record a payment</h2>
      <label>Payment for<input required maxLength={200} value={draft.purpose} onChange={event => change({ purpose: event.target.value })} placeholder="e.g. Printing 200 flyers" /></label>
      <div className="form-grid">
        <label>Customer name (optional)<input maxLength={200} list="service-payment-customers" value={draft.name} onChange={event => { const customer = customers.find(row => row.name === event.target.value); change({ name: event.target.value, ...(customer ? { phone: customer.phone } : {}) }) }} /></label>
        <label>Customer phone (optional)<input type="tel" maxLength={80} value={draft.phone} onChange={event => change({ phone: event.target.value })} /></label>
      </div>
      <datalist id="service-payment-customers">{customers.map(customer => <option key={customer.id} value={customer.name} />)}</datalist>
      <label>Amount paid<input required type="number" min="0.01" step="0.01" value={draft.amount} onChange={event => change({ amount: event.target.value })} /></label>
      <label htmlFor="service-payment-method">Payment method</label><select id="service-payment-method" value={draft.method} onChange={event => change({ method: event.target.value as Draft['method'] })}><option value="cash">Cash</option><option value="bank-transfer">Bank transfer</option><option value="external-pos">Payment terminal</option></select>
      {draft.method === 'cash' ? <><label>Cash received (optional)<input type="number" min={amount || 0} step="0.01" value={draft.cash} placeholder={draft.amount || 'Same as amount paid'} onChange={event => change({ cash: event.target.value })} /></label>{draft.cash && <p>Change: {money(Math.max(0, Number(draft.cash) - amount))}</p>}</> : <><label>{draft.method === 'bank-transfer' ? 'Bank / provider' : 'Terminal provider'}<input required maxLength={200} value={draft.provider} onChange={event => change({ provider: event.target.value })} /></label><label>Payment reference<input required maxLength={200} value={draft.reference} onChange={event => change({ reference: event.target.value })} /></label><p>Confirm the payment succeeded before saving.</p></>}
      {storageError && <p role="alert">{storageError}</p>}
      <SubmitButton className="primary-button" disabled={!enabled || !valid}>Save payment</SubmitButton>
    </AsyncForm>
    {saved && <section className="panel" role="status"><h2>Payment saved</h2><p>{saved.items[0].productName} · {money(saved.total)}</p><p>Receipt: {saved.id}</p><AsyncButton className="primary-button" busyLabel="Printing..." onClick={() => print(saved)}>Print receipt</AsyncButton><DigitalReceipt sale={saved} headers={headers} beforeSend={beforeSend} /></section>}
    <section className="panel"><h2>Payment history</h2><label>Find a payment<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, phone, description or receipt" /></label>{history.length ? history.map(sale => <div className="customer-row" key={sale.id}><div><strong>{sale.items.map(item => item.productName).join(', ')} · {money(sale.total)}</strong><small>{sale.paymentDetails?.servicePayment?.customerName || 'Walk-in customer'} · {new Date(sale.createdAt).toLocaleString()}</small><small>{sale.id}</small><DigitalReceipt sale={sale} headers={headers} beforeSend={beforeSend} /></div><AsyncButton className="filter-button" busyLabel="Printing..." onClick={() => print(sale)}>Reprint receipt</AsyncButton></div>) : <p>No matching payments.</p>}</section>
  </section>
}
