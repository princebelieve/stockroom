import { useMemo, useState } from 'react'
import { Store } from 'lucide-react'
import { TimeZoneSelect } from './TimeZoneSelect'
import { businessModes, normalizeShopProfile, productCatalogueOptions, type BusinessMode, type ShopProfile } from '../server/shop-profile.mjs'
import { catalogueStarters, type CatalogueStarter } from '../server/catalogue-starters.mjs'
import type { PaymentPolicy } from '../server/payment.mjs'

export const workspaceSetupKey=(businessId:string)=>`stockroom-workspace-setup:${businessId}`
export type SetupWorkspace = 'POS'|'Oil'|'Payments'|'Counter'|'Restaurant'
type WorkspaceItems = { kind: 'stock'|'service'|'counter'|'restaurant'|'bar'; industry: BusinessMode; label: string }

function starterWorkspace(screen:SetupWorkspace,industry:BusinessMode):WorkspaceItems {
  const kind = screen === 'POS' || screen === 'Oil' ? 'stock' : screen === 'Payments' ? 'service' : screen === 'Counter' ? 'counter' : industry === 'drinks' ? 'bar' : 'restaurant'
  const label = screen === 'POS' ? 'Product sales' : screen === 'Oil' ? 'Oil sales' : screen === 'Payments' ? 'Payments & receipts' : screen === 'Counter' ? 'Order counter' : 'Tables & tabs'
  return { kind, industry, label }
}

function setupProfile(profile:ShopProfile,industry:BusinessMode,screen:SetupWorkspace,timeZone:string):ShopProfile {
  const oil=screen==='Oil'
  const workspaceKey=oil?'oil-sales':screen==='POS'?'product-sales':null
  const options=productCatalogueOptions(industry)
  const workspaceCatalogues={...profile.workspaceCatalogues,...(workspaceKey?{[workspaceKey]:options}:{})}
  const workflows:ShopProfile['workflows']=screen==='Payments'?'payments':screen==='Counter'?'fast-food':screen==='Restaurant'?'restaurant':'stock'
  return normalizeShopProfile({...profile,mode:industry==='general'?'general':'suggested',industry,workflows,fastFood:screen==='Counter',restaurant:screen==='Restaurant',features:{services:screen==='Payments',productSales:screen==='POS'},workspaceCatalogues,reportingTimeZone:timeZone})
}

export function WorkspaceOnboarding({profile,currency,policy,saveProfile,savePreferences,saveStarters,finish}: {
  profile:ShopProfile;currency:string;policy:PaymentPolicy;
  saveProfile:(profile:ShopProfile)=>Promise<void>;
  savePreferences:(currency:string,policy:PaymentPolicy)=>Promise<void>;
  saveStarters:(workspace:SetupWorkspace,industry:BusinessMode,items:CatalogueStarter[])=>Promise<void>;
  finish:(screen?:SetupWorkspace)=>void;
}) {
  const [industry,setIndustry]=useState<BusinessMode>(profile.industry)
  const [screen,setScreen]=useState<SetupWorkspace>(()=>profile.industry==='liquids'?'Oil':profile.fastFood?'Counter':profile.restaurant?'Restaurant':profile.workflows==='payments'?'Payments':'POS')
  const [nextCurrency,setCurrency]=useState(currency)
  const [timeZone,setTimeZone]=useState(profile.reportingTimeZone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC')
  const [provider,setProvider]=useState(policy.providers[0]||'')
  const [usePos,setUsePos]=useState(policy.providers.length>0)
  const [step,setStep]=useState<'business'|'items'|'confirm'>('business')
  const [query,setQuery]=useState('')
  const [selectedIds,setSelectedIds]=useState<string[]>([])
  const [error,setError]=useState('')
  const [saving,setSaving]=useState(false)
  const workspace=starterWorkspace(screen,industry)
  const starters=useMemo(()=>catalogueStarters(workspace.kind,workspace.industry),[workspace.kind,workspace.industry])
  const visible=starters.filter(item=>`${item.name} ${item.category} ${item.unit}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0,80)
  const selected=starters.filter(item=>selectedIds.includes(item.id))
  function chooseIndustry(value:BusinessMode){setIndustry(value);if(value==='liquids')setScreen('Oil');else if(screen==='Oil')setScreen('POS');setSelectedIds([]);setQuery('')}
  function chooseWorkspace(value:SetupWorkspace){setScreen(value);setSelectedIds([]);setQuery('')}
  function toggle(id:string){setSelectedIds(current=>current.includes(id)?current.filter(item=>item!==id):current.length>=200?current:[...current,id])}
  async function saveSetup(itemsToSave:CatalogueStarter[]=selected){
    if(usePos&&!provider.trim()){setError('Enter the name of your POS provider, or turn off the POS payment method.');setStep('business');return}
    setError('');setSaving(true)
    let complete=false
    try {
      const profileDraft=setupProfile(profile,industry,screen,timeZone)
      await saveProfile(profileDraft)
      const providers=usePos&&provider.trim()?[provider.trim(),...policy.providers.filter(value=>value!==policy.providers[0]&&value!==provider.trim())]:[]
      await savePreferences(nextCurrency,{...policy,providers})
      await saveStarters(screen,industry,itemsToSave)
      complete=true
    } catch(caught) { setError(caught instanceof Error?caught.message:'Could not finish setup. Review the selection and retry.') }
    finally { setSaving(false) }
    if(complete)finish(screen)
  }
  return <main className="login-screen"><section className="login-card workspace-onboarding">
    <div className="brand-mark"><Store size={24}/></div><h1>{step==='business'?'Set up your business':step==='items'?'Choose what you sell':'Review your starter catalogue'}</h1>
    {error&&<p role="alert">{error}</p>}
    {step==='business'&&<>
      <p>Choose your business type and selling workspace separately. The catalogue list will match both choices. You can change them later.</p>
      <label htmlFor="setup-business-type">Business type</label><select id="setup-business-type" value={industry} onChange={event=>chooseIndustry(event.target.value as BusinessMode)}>{Object.entries(businessModes).map(([id,item])=><option key={id} value={id}>{item.label}</option>)}</select>
      <label htmlFor="setup-workspace">Selling workspace</label><select id="setup-workspace" value={screen} onChange={event=>chooseWorkspace(event.target.value as SetupWorkspace)}><option value="Oil" disabled={industry!=='liquids'}>Oil sales</option><option value="POS">Product sales</option><option value="Payments">Payments &amp; receipts</option><option value="Counter">Order counter</option><option value="Restaurant">Tables &amp; tabs</option></select>
      {industry==='liquids'&&<p>Oil sales remains enabled for the oil business type. The workspace you choose here is enabled alongside it; configure other combinations later in Business settings.</p>}
      <details className="setup-optional"><summary>Currency, time zone and other payment methods</summary>
        <label htmlFor="setup-currency">Currency</label><select id="setup-currency" value={nextCurrency} onChange={event=>setCurrency(event.target.value)}>{[...new Set([currency,'NGN','USD','GHS','KES','ZAR','GBP','EUR','XOF'])].map(code=><option key={code}>{code}</option>)}</select>
        <TimeZoneSelect value={timeZone} onChange={setTimeZone}/>
        <div className="setup-payment-row"><span>Cash</span><span>Ready</span></div>
        <label className="checkbox-label"><input type="checkbox" checked={usePos} onChange={event=>setUsePos(event.target.checked)}/>Add a POS payment method</label>{usePos&&<label>Provider name<input required value={provider} onChange={event=>setProvider(event.target.value)} placeholder="Bank or provider name" maxLength={100}/></label>}
      </details>
      <button type="button" className="primary-button login-button" onClick={()=>setStep('items')}>Choose starter items</button>
      <button type="button" className="text-button" onClick={finish}>Set up later</button>
    </>}
    {step==='items'&&<>
      <p><strong>{workspace.label}</strong>: choose the names that match what your business sells. Search the list and select as many as you need; you can add or edit entries later.</p>
      <label htmlFor="starter-search">Search starter names<input id="starter-search" type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search product, service or menu item" /></label>
      <div className="report-actions"><button type="button" className="filter-button" disabled={!visible.length||selectedIds.length>=200} onClick={()=>setSelectedIds(current=>[...new Set([...current,...visible.map(item=>item.id)])].slice(0,200))}>Select shown matches</button><button type="button" className="text-button" disabled={!selectedIds.length} onClick={()=>setSelectedIds([])}>Clear selection</button></div>
      <fieldset className="onboarding-starter-list"><legend>{starters.length} suggestions / {selectedIds.length} selected</legend>
        {visible.map(item=><label key={item.id} className="checkbox-label"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={()=>toggle(item.id)} />{item.name}<small>{item.category} / {item.unit}</small></label>)}
        {visible.length===0&&<p>No names match. Try a shorter search; you can add your own later.</p>}
        {starters.filter(item=>`${item.name} ${item.category} ${item.unit}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).length>visible.length&&<p>Showing the first 80 matches. Type a more specific search to find other names.</p>}
      </fieldset>
      {selectedIds.length>=200&&<p role="status">The initial setup can add up to 200 selected entries. You can add more later.</p>}
      {workspace.kind==='stock'?<p className="muted">Starter products begin with zero stock and zero price/cost. Enter real stock and prices before selling. Barcodes are optional; scan the actual item later. Product SKUs are generated automatically.</p>:workspace.kind==='service'?<p className="muted">Starter service descriptions begin at zero price. Add the actual price before using them on a receipt or job.</p>:<p className="muted">Starter menu items begin at zero price and unavailable. Set prices and availability in menu settings before offering them.</p>}
      <div className="report-actions"><button type="button" className="filter-button" onClick={()=>setStep('business')}>Back</button><button type="button" className="primary-button" onClick={()=>setStep('confirm')}>Review {selectedIds.length} selected</button><button type="button" className="text-button" onClick={()=>{setSelectedIds([]);setStep('confirm')}}>Skip catalogue suggestions</button></div>
    </>}
    {step==='confirm'&&<>
      <p>Save these {selected.length} starter {workspace.kind==='stock'?'products':workspace.kind==='service'?'services':'menu items'} for <strong>{workspace.label}</strong>?</p>
      <ul className="onboarding-selected-list">{selected.map(item=><li key={item.id}>{item.name}</li>)}</ul>
      {workspace.kind==='stock'&&selected.length>0&&<p role="note">Products will be saved with no barcode, zero opening stock and zero prices until you edit them. The list will not be ready for paid sales until you enter your actual values.</p>}
      {workspace.kind==='service'&&selected.length>0&&<p role="note">Reusable service descriptions will be saved at zero price. Set your actual service prices before using them on receipts or jobs.</p>}
      {['counter','restaurant','bar'].includes(workspace.kind)&&selected.length>0&&<p role="note">Menu items will be saved at zero price and unavailable. Review prices, availability, stock links, recipes and options in menu settings before offering them to customers.</p>}
      <div className="report-actions"><button type="button" className="filter-button" disabled={saving} onClick={()=>setStep('items')}>Back to selection</button><button type="button" className="primary-button" disabled={saving} onClick={()=>void saveSetup()}>{saving?'Saving catalogue...':'Save and confirm workspace'}</button></div>
      <button type="button" className="text-button" disabled={saving} onClick={()=>void saveSetup([])}>Continue without starter items</button>
    </>}
  </section></main>
}
