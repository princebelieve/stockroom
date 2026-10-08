import { businessWorkspace, type ShopProfile } from '../server/shop-profile.mjs'
import { ScreenPicker } from './EmptyScreen'
import type { Product } from './types'
import { customerOrderSettings } from '../server/customer-order-settings.mjs'
import { WorkspaceHelp } from './WorkspaceHelp'
import { useState } from 'react'
import { extraReasons, type PaymentPolicy } from '../server/payment.mjs'
export function PaymentPolicySettings({ profile, products = [], value, onChange }: { profile:ShopProfile; products?: Product[]; value: PaymentPolicy; onChange: (policy: PaymentPolicy) => void }) {
  const workspace = businessWorkspace(profile)
  const goodsOrdering = workspace.productSales || workspace.oil
  const deliveryAvailable = goodsOrdering || workspace.fastFood
  const [newProvider, setNewProvider] = useState('')
  const [view,setView]=useState('providers')
  const [addingProvider,setAddingProvider]=useState(false)
  const defaults = ['OPay', 'PalmPay', 'Moniepoint', 'Paga', 'Kuda', 'Access Bank', 'FirstBank', 'GTBank', 'UBA', 'Zenith Bank']
  const providers = [...new Set([...defaults, ...value.providers])]
  const addProvider = () => {
    const provider = newProvider.trim().replace(/\s+/g, ' ')
    if (!provider || value.providers.some(item => item.toLowerCase() === provider.toLowerCase())) return
    onChange({ ...value, providers: [...value.providers, provider] })
    setNewProvider('');setAddingProvider(false)
  }
  const ordering = { ...customerOrderSettings(value.customerOrdering), deliveryZones: value.customerOrdering?.deliveryZones || [] }
  const setOrdering = (patch: Partial<typeof ordering>) => onChange({ ...value, customerOrdering: { ...ordering, ...patch } })
  return <section><ScreenPicker label="Payment setup" value={view} change={setView} options={[{id:'providers',label:'Payment methods'},{id:'ordering',label:'Bank details and online ordering'},{id:'wallet',label:'Customer wallets'},{id:'extras',label:'Extra-payment rules'}]}/><section hidden={view!=='ordering'}><h3>{goodsOrdering || workspace.fastFood || workspace.restaurant ? 'Online orders and bank details' : 'Bank details'}</h3><WorkspaceHelp title="Payment setup"><p>These details are displayed publicly on your QR ordering page. Save business settings, then synchronize to publish them.</p></WorkspaceHelp>
    {goodsOrdering && <label><input type="checkbox" checked={ordering.retailEnabled} onChange={e=>setOrdering({retailEnabled:e.target.checked})}/>Enable online product orders</label>}{goodsOrdering && ordering.retailEnabled && <details><summary>Choose products to publish ({ordering.retailProductIds.length})</summary><WorkspaceHelp title="Payment setup"><p>Choose up to 2,000 products. Only selected products appear publicly, at their current retail price. Stock availability is confirmed by staff; an online request does not reserve goods.</p></WorkspaceHelp>{products.map(product=><label key={product.id}><input type="checkbox" disabled={!ordering.retailProductIds.includes(product.id)&&ordering.retailProductIds.length>=2000} checked={ordering.retailProductIds.includes(product.id)} onChange={e=>setOrdering({retailProductIds:e.target.checked?[...ordering.retailProductIds,product.id]:ordering.retailProductIds.filter(id=>id!==product.id)})}/>{product.name}</label>)}</details>}<label>Bank name<input maxLength={100} value={ordering.bankName} onChange={e => setOrdering({ bankName: e.target.value })} /></label>
    <label>Account name<input maxLength={120} value={ordering.accountName} onChange={e => setOrdering({ accountName: e.target.value })} /></label>
    <label>Account number<input maxLength={40} value={ordering.accountNumber} onChange={e => setOrdering({ accountNumber: e.target.value })} /></label>
    <label>Transfer instructions<textarea maxLength={300} value={ordering.transferInstructions} onChange={e => setOrdering({ transferInstructions: e.target.value })} /></label>
    {deliveryAvailable && <label><input type="checkbox" checked={ordering.deliveryEnabled} onChange={e => setOrdering({ deliveryEnabled: e.target.checked })} />Offer delivery on online orders</label>}
    {deliveryAvailable && ordering.deliveryEnabled && <label>Fixed delivery charge (before tax)<input type="number" min="0" max="1000000" step="0.01" value={ordering.deliveryFee} onChange={e => setOrdering({ deliveryFee: Number(e.target.value) })} /></label>}
    {deliveryAvailable && ordering.deliveryEnabled && <section><h4>Delivery areas and charges</h4><WorkspaceHelp title="Payment setup"><p>Leave this list empty to use the fixed charge. Otherwise customers must choose one of these areas. Existing orders retain their original charge.</p></WorkspaceHelp>{ordering.deliveryZones.map(zone => <div key={zone.id}><label>Area name<input maxLength={100} value={zone.name} onChange={e => setOrdering({deliveryZones:ordering.deliveryZones.map(row=>row.id===zone.id?{...row,name:e.target.value}:row)})}/></label><label>Charge before tax<input type="number" min="0" max="1000000" step="0.01" value={zone.fee} onChange={e => setOrdering({deliveryZones:ordering.deliveryZones.map(row=>row.id===zone.id?{...row,fee:Number(e.target.value)}:row)})}/></label><button type="button" className="filter-button" onClick={()=>setOrdering({deliveryZones:ordering.deliveryZones.filter(row=>row.id!==zone.id)})}>Remove area</button></div>)}<button type="button" className="filter-button" disabled={ordering.deliveryZones.length>=50} onClick={()=>setOrdering({deliveryZones:[...ordering.deliveryZones,{id:crypto.randomUUID(),name:'New delivery area',fee:ordering.deliveryFee}]})}>Add delivery area</button></section>}
    </section><section hidden={view!=='wallet'}><h3>Wallet payments</h3>
    <label className="checkbox-label"><input type="checkbox" checked={value.allowWallet} onChange={e => onChange({ ...value, allowWallet: e.target.checked })} />Enable customer wallet payments</label>
    <label className="checkbox-label"><input type="checkbox" checked={value.allowWalletCredit} disabled={!value.allowWallet} onChange={e => onChange({ ...value, allowWalletCredit: e.target.checked })} />Allow owner-approved purchases on credit</label><WorkspaceHelp><p>Prepaid funds are used first. Only an owner can approve a sale that creates debt. Repayments reduce the amount owed. Save business settings to apply these options.</p></WorkspaceHelp>
    </section><section hidden={view!=='extras'}><h3>Extra-payment rules</h3><WorkspaceHelp><p>Saved with business settings. Extra amounts are kept separate from sales revenue. Internal payment records are retained regardless of receipt visibility.</p></WorkspaceHelp>
    <label className="checkbox-label"><input type="checkbox" checked={value.allowExtras} onChange={e => onChange({ ...value, allowExtras: e.target.checked })} />Allow staff to record extra money retained</label>
    <label className="checkbox-label"><input type="checkbox" checked={value.reasonForChange} onChange={e => onChange({ ...value, reasonForChange: e.target.checked })} />Require staff to confirm bank-transfer overpayments returned to the customer</label>
    <label className="checkbox-label"><input type="checkbox" checked={value.printExtraDetails} onChange={e => onChange({ ...value, printExtraDetails: e.target.checked })} />Print extra amount, reason and explanation on customer receipts</label>
    {value.allowExtras && <><WorkspaceHelp title="Payment setup"><p>Allowed reasons (a reason is always required for retained extras):</p></WorkspaceHelp>{Object.entries(extraReasons).map(([key, label]) => <label key={key} className="checkbox-label"><input type="checkbox" checked={value.reasons.includes(key)} onChange={e => onChange({ ...value, reasons: e.target.checked ? [...value.reasons, key] : value.reasons.filter(r => r !== key) })} />{label}</label>)}</>}
    </section><section hidden={view!=='providers'}><h3>Payment methods</h3>
    <div className="setup-payment-row"><span>Cash</span><span>Ready</span></div>
    {value.providers.map((provider,index)=><div className="setup-payment-row" key={provider}><span>{provider}{index===0&&<small>Default POS provider</small>}</span><button type="button" className="text-button" onClick={()=>onChange({...value,providers:value.providers.filter(item=>item!==provider)})}>Remove</button></div>)}
    {addingProvider?<div className="provider-add"><label>POS provider<select value={providers.includes(newProvider)?newProvider:''} onChange={event=>setNewProvider(event.target.value)}><option value="">Choose a provider</option>{providers.map(provider=><option key={provider}>{provider}</option>)}</select></label><label>Provider name<input value={newProvider} onChange={event=>setNewProvider(event.target.value)} placeholder="Add another POS provider" maxLength={100}/></label><button type="button" className="primary-button" disabled={!newProvider.trim()} onClick={addProvider}>Add name</button><button type="button" className="text-button" onClick={()=>setAddingProvider(false)}>Cancel</button></div>:<button type="button" className="filter-button" onClick={()=>setAddingProvider(true)}>Add POS provider</button>}
    </section>
  </section>
}
