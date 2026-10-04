import { useEffect, useState } from 'react'
import { AsyncButton, AsyncForm, SubmitButton } from './AsyncControls'
import { DigitalReceipt, posRequest } from './PosTools'
import { priceOrder, posSettings } from '../server/pos-pricing.mjs'
import { receiptSettings, type ReceiptSettings } from '../server/receipts.mjs'
import type { Customer, Sale } from './types'

type Line = { id: string; description: string; quantity: string; price: string }
type Draft = { id: string; lines: Line[]; name: string; phone: string; method: 'cash' | 'bank-transfer' | 'external-pos'; provider: string; reference: string; cash: string; transactionType: string; cardType: string }
const newLine = (): Line => ({ id: crypto.randomUUID(), description: '', quantity: '1', price: '' })
const fresh = (): Draft => ({ id: crypto.randomUUID(), lines: [newLine()], name: '', phone: '', method: 'cash', provider: '', reference: '', cash: '', transactionType: 'Walk-in', cardType: '' })
function restore(key: string): Draft {
  try { const previous = JSON.parse(localStorage.getItem(key) || '{}'); return { ...fresh(), ...previous, lines: previous.lines?.length ? previous.lines : [{ ...newLine(), description: previous.purpose || '', price: previous.amount || '' }] } } catch { return fresh() }
}
export function ServicePayments({ storageKey, hidden, enabled, manager, customers, receipts, headers, save, print, beforeSend, money }: {
  storageKey: string; hidden: boolean; enabled: boolean; manager: boolean; customers: Customer[]; receipts: Sale[]; headers: Record<string, string>;
  save: (draft: Draft & { profile: ReceiptSettings }) => Promise<Sale>; print: (sale: Sale) => Promise<void>; beforeSend: () => Promise<void>; money: (amount: number) => string
}) {
  const [draft, setDraft] = useState<Draft>(() => restore(storageKey))
  const [profile, setProfile] = useState(receiptSettings())
  const [profileDraft, setProfileDraft] = useState<ReceiptSettings | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [setupError, setSetupError] = useState('')
  const [setupMessage, setSetupMessage] = useState('')
  const [saved, setSaved] = useState<Sale | null>(null)
  const [query, setQuery] = useState('')
  const [storageError, setStorageError] = useState('')
  const token = headers.Authorization
  useEffect(() => { let live = true; if (hidden) return; void posRequest('/api/pos/receipt-settings', headers).then(value => { if (live) { setProfile(value); setLoaded(true); setSetupError('') } }).catch(error => { if (live) setSetupError(error.message) }); return () => { live = false } }, [token, hidden])
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(draft)); setStorageError('') } catch { setStorageError('This draft could not be saved on this device. Keep this screen open until payment is saved.') } }, [storageKey, draft])
  const change = (patch: Partial<Draft>) => { setDraft(current => ({ ...current, ...patch })); setSaved(null) }
  const changeLine = (id: string, patch: Partial<Line>) => change({ lines: draft.lines.map(line => line.id === id ? { ...line, ...patch } : line) })
  let pricing
  try { pricing = priceOrder(draft.lines.map(line => ({ productId: 'service:' + line.id, quantity: Number(line.quantity), price: Number(line.price) })), { tax: posSettings(profile) }) } catch { pricing = null }
  const amount = pricing?.total || 0
  const valid = loaded && amount > 0 && draft.lines.every(line => line.description.trim() && /^\d+(?:\.\d{1,2})?$/.test(line.price) && Number(line.quantity) > 0 && Number.isFinite(Number(line.quantity)))
  const history = receipts.filter(sale => sale.paymentDetails?.servicePayment).filter(sale => `${sale.id} ${sale.paymentDetails?.receipt?.number || ''} ${sale.items.map(item => item.productName).join(' ')} ${sale.paymentDetails?.servicePayment?.customerName} ${sale.paymentDetails?.servicePayment?.customerPhone} ${sale.paymentReference || ''}`.toLowerCase().includes(query.toLowerCase()))
  return <section hidden={hidden} className="service-payments">
    {manager && <details className="panel receipt-setup"><summary>Customize receipt</summary><p>Set the business details and footer printed on new receipts. Past receipts retain their saved details.</p><button type="button" className="filter-button" onClick={() => { setProfileDraft(structuredClone(profile)); setSetupMessage('') }}>Customize receipt</button>{profileDraft && <AsyncForm className="settings-form" onSubmit={async () => { const result = await posRequest('/api/pos/receipt-settings', headers, profileDraft); setProfile(result.value); setProfileDraft(null); setSetupMessage('Receipt settings saved.') }}>
      <label>Receipt business name<input maxLength={100} value={profileDraft.businessName} placeholder="Use your app business name" onChange={event => setProfileDraft({ ...profileDraft, businessName: event.target.value })} /></label>
      <label>Business address<textarea rows={3} maxLength={300} value={profileDraft.address} onChange={event => setProfileDraft({ ...profileDraft, address: event.target.value })} /></label>
      <div className="form-grid"><label>Business phone<input type="tel" maxLength={80} value={profileDraft.phone} onChange={event => setProfileDraft({ ...profileDraft, phone: event.target.value })} /></label><label>Business email<input type="email" maxLength={254} value={profileDraft.email} onChange={event => setProfileDraft({ ...profileDraft, email: event.target.value })} /></label></div>
      <label>Receipt footer<textarea rows={4} maxLength={1000} placeholder="Thank-you message and your own return policy" value={profileDraft.footer} onChange={event => setProfileDraft({ ...profileDraft, footer: event.target.value })} /></label>
      <label className="checkbox-label"><input type="checkbox" checked={profileDraft.taxEnabled} onChange={event => setProfileDraft({ ...profileDraft, taxEnabled: event.target.checked })} />Calculate tax on payments</label>
      {profileDraft.taxEnabled && <div className="form-grid"><label>Tax label<input maxLength={40} value={profileDraft.taxLabel} onChange={event => setProfileDraft({ ...profileDraft, taxLabel: event.target.value })} /></label><label>Tax rate (%)<input type="number" min="0" max="100" step="0.01" value={profileDraft.taxRate} onChange={event => setProfileDraft({ ...profileDraft, taxRate: Number(event.target.value) })} /></label><label htmlFor="receipt-price-treatment">Price treatment</label><select id="receipt-price-treatment" value={profileDraft.taxIncluded ? 'included' : 'added'} onChange={event => setProfileDraft({ ...profileDraft, taxIncluded: event.target.value === 'included' })}><option value="added">Add tax to the subtotal</option><option value="included">Unit prices include tax</option></select></div>}
      <SubmitButton className="primary-button">Save receipt settings</SubmitButton></AsyncForm>}{setupMessage && <p role="status">{setupMessage}</p>}</details>}
    {setupError && <p role="alert">{setupError}</p>}
    <AsyncForm className="panel payment-entry" busyLabel="Saving payment..." onSubmit={async () => {
      if (!enabled || !valid) throw new Error('Enter item descriptions, positive quantities and valid unit prices.')
      const receipt = await save({ ...draft, profile })
      setSaved(receipt); setDraft(fresh())
    }}>
      <h2>Record a payment</h2><p>Enter what the customer is paying for. These receipt items do not change stock.</p>
      <div className="form-grid"><label>Customer name (optional)<input maxLength={200} list="service-payment-customers" value={draft.name} onChange={event => { const customer = customers.find(row => row.name === event.target.value); change({ name: event.target.value, ...(customer ? { phone: customer.phone } : {}) }) }} /></label><label>Customer phone (optional)<input type="tel" maxLength={80} value={draft.phone} onChange={event => change({ phone: event.target.value })} /></label></div>
      <datalist id="service-payment-customers">{customers.map(customer => <option key={customer.id} value={customer.name} />)}</datalist>
      <label htmlFor="service-transaction-type">Transaction type</label><select id="service-transaction-type" value={draft.transactionType} onChange={event => change({ transactionType: event.target.value })}><option>Walk-in</option><option>In-store shopping</option><option>Service payment</option><option>Collection / donation</option><option>Other payment</option></select>
      <h3>Receipt items</h3><div className="payment-lines">{draft.lines.map((line,index) => <fieldset className="payment-line" key={line.id}><legend>Item {index + 1}</legend><label>{index === 0 ? 'Payment for' : 'Item description'}<input required maxLength={150} value={line.description} onChange={event => changeLine(line.id, { description: event.target.value })} placeholder="e.g. Printing 200 flyers" /></label><div className="payment-line-details"><label>Quantity<input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={event => changeLine(line.id, { quantity: event.target.value })} /></label><label>Unit price<input required type="number" min="0" step="0.01" value={line.price} onChange={event => changeLine(line.id, { price: event.target.value })} /></label></div><div className="payment-line-total"><strong>Line total: {money(Math.round((Number(line.quantity) || 0) * (Number(line.price) || 0) * 100) / 100)}</strong>{draft.lines.length > 1 && <button type="button" className="filter-button" onClick={() => change({ lines: draft.lines.filter(row => row.id !== line.id) })}>Remove item</button>}</div></fieldset>)}</div>
      <button type="button" className="filter-button" disabled={draft.lines.length >= 100} onClick={() => change({ lines: [...draft.lines, newLine()] })}>Add another item</button>
      <div className="payment-summary"><p><span>Subtotal</span><strong>{money(pricing?.subtotal || 0)}</strong></p>{profile.taxEnabled && <p><span>{profile.taxLabel} ({profile.taxRate}%{profile.taxIncluded ? ', included' : ''})</span><strong>{money(pricing?.tax || 0)}</strong></p>}<p className="payment-grand-total"><span>Grand total</span><strong>{money(amount)}</strong></p></div>
      <label htmlFor="service-payment-method">Payment method</label><select id="service-payment-method" value={draft.method} onChange={event => change({ method: event.target.value as Draft['method'], cash: '', cardType: '' })}><option value="cash">Cash</option><option value="bank-transfer">Bank transfer</option><option value="external-pos">Card / payment terminal</option></select>
      {draft.method === 'cash' ? <><label>Cash received (optional)<input type="number" min={amount || 0} step="0.01" value={draft.cash} placeholder={String(amount) || 'Same as grand total'} onChange={event => change({ cash: event.target.value })} /></label>{draft.cash && <p>Change: {money(Math.max(0, Number(draft.cash) - amount))}</p>}</> : <><label>{draft.method === 'bank-transfer' ? 'Bank / provider' : 'Terminal provider'}<input required maxLength={200} value={draft.provider} onChange={event => change({ provider: event.target.value })} /></label><label>Payment reference<input required maxLength={200} value={draft.reference} onChange={event => change({ reference: event.target.value })} /></label>{draft.method === 'external-pos' && <><label htmlFor="service-card-type">Card type (optional)</label><select id="service-card-type" value={draft.cardType} onChange={event => change({ cardType: event.target.value })}><option value="">Payment terminal</option><option>Visa</option><option>Mastercard</option><option>Amex</option><option>Other card</option></select></>}<p>Confirm the payment succeeded before saving.</p></>}
      {storageError && <p role="alert">{storageError}</p>}
      <SubmitButton className="primary-button" disabled={!enabled || !valid}>Save payment</SubmitButton>
    </AsyncForm>
    {saved && <section className="panel" role="status"><h2>Payment saved</h2><p>{saved.items.map(item => item.productName).join(', ')} - {money(saved.total)}</p><p>Receipt: {saved.paymentDetails?.receipt?.number || saved.id}</p><AsyncButton className="primary-button" busyLabel="Printing..." onClick={() => print(saved)}>Print receipt</AsyncButton><DigitalReceipt sale={saved} headers={headers} beforeSend={beforeSend} /></section>}
    <section className="panel"><h2>Payment history</h2><label>Find a payment<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, phone, description or receipt" /></label>{history.length ? history.map(sale => <div className="customer-row" key={sale.id}><div><strong>{sale.items.map(item => item.productName).join(', ')} - {money(sale.total)}</strong><small>{sale.paymentDetails?.servicePayment?.customerName || 'Walk-in customer'} - {new Date(sale.createdAt).toLocaleString()}</small><small>{sale.paymentDetails?.receipt?.number || sale.id}</small><DigitalReceipt sale={sale} headers={headers} beforeSend={beforeSend} /></div><AsyncButton className="filter-button" busyLabel="Printing..." onClick={() => print(sale)}>Reprint receipt</AsyncButton></div>) : <p>No matching payments.</p>}</section>
  </section>
}
