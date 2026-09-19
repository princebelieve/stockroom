import { useState } from 'react'
import { extraReasons, type PaymentPolicy } from '../server/payment.mjs'
export function PaymentPolicySettings({ value, onChange }: { value: PaymentPolicy; onChange: (policy: PaymentPolicy) => void }) {
  const [newProvider, setNewProvider] = useState('')
  const defaults = ['OPay', 'PalmPay', 'Moniepoint', 'Paga', 'Kuda', 'Access Bank', 'FirstBank', 'GTBank', 'UBA', 'Zenith Bank']
  const providers = [...new Set([...defaults, ...value.providers])]
  const addProvider = () => {
    const provider = newProvider.trim().replace(/\s+/g, ' ')
    if (!provider || value.providers.some(item => item.toLowerCase() === provider.toLowerCase())) return
    onChange({ ...value, providers: [...value.providers, provider] })
    setNewProvider('')
  }
  return <section><h3>Wallet payments</h3>
    <label className="checkbox-label"><input type="checkbox" checked={value.allowWallet} onChange={e => onChange({ ...value, allowWallet: e.target.checked })} />Enable customer wallet payments</label>
    <label className="checkbox-label"><input type="checkbox" checked={value.allowWalletCredit} disabled={!value.allowWallet} onChange={e => onChange({ ...value, allowWalletCredit: e.target.checked })} />Allow owner-approved purchases on credit</label><p>Prepaid funds are used first. Only an owner can approve a sale that creates debt. Repayments reduce the amount owed. Save business settings to apply these options.</p>
    <h3>Extra-payment rules</h3><p>Saved with business settings. Extra amounts are kept separate from sales revenue. Internal payment records are retained regardless of receipt visibility.</p>
    <label className="checkbox-label"><input type="checkbox" checked={value.allowExtras} onChange={e => onChange({ ...value, allowExtras: e.target.checked })} />Allow staff to record extra money retained</label>
    <label className="checkbox-label"><input type="checkbox" checked={value.reasonForChange} onChange={e => onChange({ ...value, reasonForChange: e.target.checked })} />Require staff to confirm bank-transfer overpayments returned to the customer</label>
    <label className="checkbox-label"><input type="checkbox" checked={value.printExtraDetails} onChange={e => onChange({ ...value, printExtraDetails: e.target.checked })} />Print extra amount, reason and explanation on customer receipts</label>
    {value.allowExtras && <><p>Allowed reasons (a reason is always required for retained extras):</p>{Object.entries(extraReasons).map(([key, label]) => <label key={key} className="checkbox-label"><input type="checkbox" checked={value.reasons.includes(key)} onChange={e => onChange({ ...value, reasons: e.target.checked ? [...value.reasons, key] : value.reasons.filter(r => r !== key) })} />{label}</label>)}</>}
    <h3>Approved banks and POS providers</h3><p>Choose the providers staff can select at checkout. Add a provider only when it is not already in the list.</p>{providers.map(provider => <label key={provider} className="checkbox-label"><input type="checkbox" checked={value.providers.includes(provider)} onChange={e => onChange({ ...value, providers: e.target.checked ? [...value.providers, provider] : value.providers.filter(item => item !== provider) })} />{provider}</label>)}<div className="provider-add"><input value={newProvider} onChange={event => setNewProvider(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addProvider() } }} placeholder="Add another provider (optional)" maxLength={100} /><button type="button" className="filter-button" onClick={addProvider}>Add provider</button></div>
  </section>
}
