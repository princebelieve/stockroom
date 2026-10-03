import { checkoutTillId } from './lib/checkoutTill'
import { useEffect, useState } from 'react'
import type { Customer, Product, Sale } from './types'
import { posSettings, type PosSettings } from '../server/pos-pricing.mjs'
import { AsyncButton, AsyncForm, SubmitButton } from './AsyncControls'

export type PosData = { settings: PosSettings; loyaltyBalances: Record<string, number>; baskets: any[]; registers: any[]; returns: any[]; products: any[]; customerHistory: any[]; customers: Customer[] }
export const emptyPosData: PosData = { settings: posSettings(), loyaltyBalances: {}, baskets: [], registers: [], returns: [], products: [], customerHistory: [], customers: [] }
export async function posRequest(path: string, headers: Record<string, string>, input?: unknown) {
  const response = await fetch(path, { method: input === undefined ? 'GET' : 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Could not save POS changes.')
  return result
}
export function PosTools({ data, headers, reload, user, branches, products, customers, sales, money, restored }: {
  branches: Array<{id: string; name: string; isActive?: boolean}>; data: PosData; headers: Record<string, string>; reload: () => Promise<void>; user: { id: string; role: string }; products: Product[]; customers: Customer[]; sales: Sale[]; money: (n: number) => string; restored: () => Promise<void>
}) {
  const [error, setError] = useState('')
  const [settings, setSettings] = useState(data.settings)
  const [selectedSale, setSelectedSale] = useState('')
  const [quantities, setQuantities] = useState<Record<number, string>>({})
  const [restock, setRestock] = useState<Record<number, boolean>>({})
  const [method, setMethod] = useState('cash')
  const [customerId, setCustomerId] = useState('')
  const [poolTill, setPoolTill] = useState(checkoutTillId())
  const [poolBranch, setPoolBranch] = useState('')
  const [productId, setProductId] = useState('')
  useEffect(() => setSettings(data.settings), [data.settings])
  const session = data.registers.find(record => record.staffId === user.id && !record.closedAt)
  const sale = sales.find(record => record.id === selectedSale)
  async function act(path: string, input: unknown) {
    setError('')
    try { await posRequest(path, headers, input); await reload(); await restored() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save changes.'); throw caught }
  }
  return <section className="panel full-panel pos-tools"><div className="panel-heading"><h2>POS tools</h2></div>{error && <p role="alert">{error}</p>}
    <details><summary>Cash register</summary>
      <p>Track the cash held during your session. Cash sales, cash returns and supplier cash payments/refunds made during this session are included automatically. Do not enter those supplier payments again as cash-out. Closing shortages reduce reported profit; surplus increases it.</p>
      {!session ? <AsyncForm onSubmit={async event => { const form = new FormData(event.currentTarget); await act('/api/pos/registers', { action: 'open', amount: form.get('amount') }) }} busyLabel="Opening register..."><label>Starting cash<input name="amount" type="number" min="0" step="0.01" required /></label><SubmitButton className="filter-button">Open register</SubmitButton></AsyncForm> : <>
        <p>Opened {new Date(session.openedAt).toLocaleString()} · starting cash {money(session.openingCash)}</p>
        <AsyncForm busyLabel="Recording cash movement..." onSubmit={async event => { const form = new FormData(event.currentTarget); await act('/api/pos/registers', { id: session.id, action: 'movement', direction: form.get('direction'), amount: form.get('amount'), reason: form.get('reason') }) }}>
          <label>Movement<select name="direction"><option value="in">Cash in</option><option value="out">Cash out</option></select></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Reason<input name="reason" minLength={3} required /></label><SubmitButton className="filter-button">Record cash movement</SubmitButton>
        </AsyncForm>
        <AsyncForm busyLabel="Closing register..." onSubmit={async event => { const form = new FormData(event.currentTarget); await act('/api/pos/registers', { id: session.id, action: 'close', amount: form.get('amount'), reason: form.get('reason') }) }}><label>Cash counted at closing<input name="amount" type="number" min="0" step="0.01" required /></label><label>Explanation if the count differs<input name="reason" /></label><SubmitButton className="filter-button">Close register</SubmitButton></AsyncForm>
      </>}
      {data.registers.filter(record => record.closedAt && (user.role !== 'cashier' || record.staffId === user.id)).map(record => <p key={record.id}>{record.staffName} · {new Date(record.closedAt).toLocaleString()} · expected {money(record.expectedCash)} · counted {money(record.countedCash)} · difference {money(record.difference)}{record.closingReason && ` · ${record.closingReason}`}</p>)}
    </details>
    {['owner', 'admin'].includes(user.role) && <details><summary>Return items from a completed receipt</summary><p>Choose the receipt and returned quantities. Restock only goods that can be sold again.</p>
      <label>Receipt<select value={selectedSale} onChange={event => { setSelectedSale(event.target.value); setQuantities({}); setRestock({}) }}><option value="">Choose receipt</option>{sales.map(record => <option key={record.id} value={record.id}>{new Date(record.createdAt).toLocaleString()} · {record.id} · {money(record.total)}</option>)}</select></label>
      {sale && <AsyncForm busyLabel="Saving return..." onSubmit={async event => {
        const form = new FormData(event.currentTarget)
        await act('/api/pos/returns', { id: crypto.randomUUID(), saleId: sale.id, items: sale.items.map((item, lineIndex) => ({ lineIndex, quantity: Number(quantities[lineIndex] || 0), restock: restock[lineIndex] === true })), method, reason: form.get('reason'), reference: form.get('reference'), confirmed: form.get('confirmed') === 'on' })
        setQuantities({}); setSelectedSale('')
      }}>
        {sale.items.map((item, index) => {
          const returned = data.returns.filter(record => record.saleId === sale.id).flatMap(record => record.items).filter(line => line.lineIndex === index).reduce((sum, line) => sum + line.quantity, 0)
          return <div key={index} className="pos-return-line"><strong>{item.productName || item.productId}</strong><span>{item.quantity - returned} remaining</span><label>Return quantity<input type="number" min="0" max={item.quantity - returned} step="0.001" value={quantities[index] || ''} onChange={event => setQuantities(current => ({ ...current, [index]: event.target.value }))} /></label><label><input type="checkbox" disabled={item.productId.startsWith('service:')} checked={!item.productId.startsWith('service:') && (restock[index] || false)} onChange={event => setRestock(current => ({ ...current, [index]: event.target.checked }))} />Return to stock</label></div>
        })}
        <label>Refund method<select value={method} onChange={event => setMethod(event.target.value)}><option value="cash">Cash</option><option value="external-pos">External terminal</option><option value="bank-transfer">Bank transfer</option><option value="wallet">Customer account credit</option></select></label>
        {['external-pos', 'bank-transfer'].includes(method) && <><label>Refund reference<input name="reference" required /></label><label><input name="confirmed" type="checkbox" required />I have completed the refund with the provider</label></>}
        <label>Return reason<input name="reason" minLength={3} required /></label><SubmitButton className="filter-button">Record return and refund</SubmitButton>
      </AsyncForm>}
      {data.returns.map(record => <p key={record.id}>Receipt {record.saleId} · {money(record.total)} refunded via {record.method} · {record.reason}</p>)}
    </details>}
    <details><summary>Customer purchase history and rewards</summary><label>Customer<select value={customerId} onChange={event => setCustomerId(event.target.value)}><option value="">Choose customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
      {customerId && <p>Reward balance at this stock location: {money(data.loyaltyBalances[customerId] || 0)}</p>}
      {customerId && data.customerHistory.filter(record => record.paymentDetails?.pos?.customerId === customerId).map(record => <p key={record.id}>{new Date(record.createdAt).toLocaleString()} · {record.id} · {money(record.total)} · {record.paymentMethod}{record.paymentDetails?.pos?.loyaltyEarned ? ` · reward earned ${money(record.paymentDetails.pos.loyaltyEarned)}` : ''}</p>)}
    </details>
    {user.role === 'owner' && <details><summary>Optional tax and loyalty settings</summary><AsyncForm busyLabel="Saving POS settings..." onSubmit={() => act('/api/pos/settings', settings)}>
      <p>Tax and loyalty are off by default. Leave them off if your business does not use them; checkout works without either.</p>
      <p>Tax is optional. Enable it only if your shop needs a tax calculation on its receipts. These settings do not submit tax returns or pay tax.</p>
      <label><input type="checkbox" checked={settings.taxEnabled} onChange={event => setSettings(current => ({ ...current, taxEnabled: event.target.checked }))} />Calculate tax on sales</label>
      {settings.taxEnabled && <><p>Use the default rate below, or set a different rate for each product. Use 0 for exempt products.</p><label>Tax label<input value={settings.taxLabel} maxLength={40} onChange={event => setSettings(current => ({ ...current, taxLabel: event.target.value }))} /></label><label>Rate (%)<input type="number" min="0" max="100" step="0.01" value={settings.taxRate} onChange={event => setSettings(current => ({ ...current, taxRate: Number(event.target.value) }))} /></label><label>Price treatment<select value={settings.taxIncluded ? 'included' : 'added'} onChange={event => setSettings(current => ({ ...current, taxIncluded: event.target.value === 'included' }))}><option value="added">Add tax at checkout</option><option value="included">Prices already include tax</option></select></label><details><summary>Product tax rates</summary>{products.map(product => <label key={product.id}>{product.name}<input aria-label={`Tax rate for ${product.name}`} type="number" min="0" max="100" step="0.01" placeholder="Default rate" value={settings.taxRates[product.id] ?? ''} onChange={event => setSettings(current => { const taxRates = { ...current.taxRates }; if (event.target.value === '') delete taxRates[product.id]; else taxRates[product.id] = Number(event.target.value); return { ...current, taxRates } })} /></label>)}</details></>}
      <label><input type="checkbox" checked={settings.loyaltyEnabled} onChange={event => setSettings(current => ({ ...current, loyaltyEnabled: event.target.checked }))} />Earn and spend customer rewards</label>{settings.loyaltyEnabled && <><p>Select a customer at checkout to spend their available branch rewards. Returned items restore spent rewards and reverse earned rewards.</p><label>Reward percentage of purchase<input type="number" min="0" max="100" step="0.01" value={settings.loyaltyRate} onChange={event => setSettings(current => ({ ...current, loyaltyRate: Number(event.target.value) }))} /></label></>}
      <details><summary>Offline stock for multiple tills</summary>
        <p>This till ID: <code>{checkoutTillId()}</code></p>
        <p>To prevent separate offline tills selling the same stock, give each till its own stock location. Create locations in Business settings, then use stock transfers to divide your goods. Synchronize every till before enabling this option. Single-till shops can leave it off.</p>
        <label>Till ID<input value={poolTill} onChange={event => setPoolTill(event.target.value)} /></label>
        <label>Stock location<select value={poolBranch} onChange={event => setPoolBranch(event.target.value)}><option value="">Choose location</option>{branches.filter(branch => branch.isActive !== false).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <button type="button" className="filter-button" disabled={!poolTill.trim() || !poolBranch} onClick={() => setSettings(current => ({...current, stockPools: {...current.stockPools, [poolTill.trim()]: poolBranch}}))}>Assign till</button>
        {Object.entries(settings.stockPools).map(([till,branch]) => <p key={till}>{till}: {branches.find(item => item.id === branch)?.name || branch} <button type="button" className="text-button" onClick={() => setSettings(current => {const stockPools={...current.stockPools};delete stockPools[till];return {...current,stockPools}})}>Remove assignment</button></p>)}
        <label><input type="checkbox" checked={settings.offlineStockPoolsEnabled} onChange={event => setSettings(current => ({...current,offlineStockPoolsEnabled:event.target.checked}))} />Use separate stock for each offline till</label>
        <p>Keep assignments unchanged while a till is offline. Synchronize all tills before changing locations or moving their remaining stock.</p>
      </details>
      <SubmitButton className="filter-button">Save POS settings</SubmitButton>
    </AsyncForm></details>}
    {['owner', 'admin'].includes(user.role) && <details><summary>Product variants and extras</summary><p>Each stock variant uses its own existing product/SKU. Group them here and optionally configure extras that add to its selling price.</p><label>Product<select value={productId} onChange={event => setProductId(event.target.value)}><option value="">Choose product</option>{products.map(product => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label>
      {productId && <AsyncForm key={productId} busyLabel="Saving product options..." onSubmit={async event => {
        const form = new FormData(event.currentTarget)
        const modifiers = String(form.get('modifiers') || '').split('\n').filter(line => line.trim()).map(line => { const index = line.lastIndexOf('|'); if (index < 1) throw new Error('Use Extra name | price for each line.'); return { name: line.slice(0, index).trim(), price: Number(line.slice(index + 1).trim()) } })
        await act('/api/pos/products', { productId, variantGroup: form.get('group'), variantLabel: form.get('variant'), modifiers })
      }}><label>Variant group<input name="group" defaultValue={data.products.find(record => record.productId === productId)?.variantGroup || ''} placeholder="e.g. T-shirt" /></label><label>Variant label<input name="variant" defaultValue={data.products.find(record => record.productId === productId)?.variantLabel || ''} placeholder="e.g. Blue / Medium" /></label><label>Extras, one per line: name | price<textarea name="modifiers" defaultValue={(data.products.find(record => record.productId === productId)?.modifiers || []).map((modifier: any) => `${modifier.name} | ${modifier.price}`).join('\n')} placeholder="Extra cheese | 1.50" /></label><SubmitButton className="filter-button">Save product options</SubmitButton></AsyncForm>}
    </details>}
  </section>
}

export function DigitalReceipt({ sale, headers, beforeSend }: { sale: Sale; headers: Record<string, string>; beforeSend: () => Promise<void> }) {
  const [email, setEmail] = useState(''), [phone, setPhone] = useState('')
  const format = (value: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: sale.currency || 'USD' }).format(value)
  const pricing = sale.paymentDetails?.pos?.pricing
  const text = `${sale.businessName || 'Receipt'}\nReceipt: ${sale.id}\n${new Date(sale.createdAt).toLocaleString()}\n${sale.paymentDetails?.servicePayment ? `Customer: ${sale.paymentDetails.servicePayment.customerName || 'Walk-in customer'}\n${sale.paymentDetails.servicePayment.customerPhone ? `Phone: ${sale.paymentDetails.servicePayment.customerPhone}\n` : ''}` : ''}${sale.items.map(item => `${item.quantity} x ${item.productName || item.productId}: ${format(item.price)} each`).join('\n')}\n${sale.paymentDetails?.pos?.loyaltyRedeemed ? `Rewards spent (included in discount): ${format(sale.paymentDetails.pos.loyaltyRedeemed)}\n` : ''}${pricing ? `Subtotal: ${format(pricing.subtotal)}\nDiscount: ${format(pricing.discount)}\n${pricing.taxSettings.taxEnabled ? `${pricing.taxSettings.taxLabel}: ${format(pricing.tax)}\n` : ''}` : ''}Total: ${format(sale.total)}\nPayment: ${sale.paymentMethod}`
  return <details><summary>Digital receipt</summary><div className="report-actions"><AsyncButton className="filter-button" busyLabel="Sharing..." onClick={async () => { if (navigator.share) await navigator.share({ title: `Receipt ${sale.id}`, text }); else { await navigator.clipboard.writeText(text); window.alert('Receipt copied. Paste it into a message to the customer.') } }}>Share or copy receipt</AsyncButton><button type="button" className="filter-button" onClick={() => { const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `receipt-${sale.id}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>Download receipt</button></div><label>Customer email<input type="email" value={email} onChange={event => setEmail(event.target.value)} /></label><AsyncButton className="filter-button" busyLabel="Sending receipt..." disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)} onClick={async () => { await beforeSend(); await posRequest('/api/integrations/receipts/send', headers, { saleId: sale.id, to: email }); window.alert('Receipt sent by email.') }}>Send receipt by Gmail</AsyncButton><a className="filter-button" href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Receipt ${sale.id}`)}&body=${encodeURIComponent(text)}`}>Open email with receipt</a><label>Customer phone<input type="tel" value={phone} onChange={event => setPhone(event.target.value)} /></label><a className="filter-button" href={`sms:${encodeURIComponent(phone)}?body=${encodeURIComponent(text)}`}>Open SMS with receipt</a><small>Email and SMS open your messaging app for you to send.</small></details>
}
