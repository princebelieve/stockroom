import { useMemo, useState } from 'react'
import { Store } from 'lucide-react'
import { TimeZoneSelect } from './TimeZoneSelect'
import { SearchableSelect } from './SearchableSelect'
import { businessModes, businessWorkspace, normalizeShopProfile, productCatalogueOptions, type BusinessMode, type ShopProfile } from '../server/shop-profile.mjs'
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

function setupProfile(profile:ShopProfile,industry:BusinessMode,screen:SetupWorkspace|'',timeZone:string,hotelOperations:boolean,nightlifeOperations:boolean):ShopProfile {
  const oil=screen==='Oil'
  const workspaceKey=oil?'oil-sales':screen==='POS'?'product-sales':null
  const options=productCatalogueOptions(industry)
  const workspaceCatalogues={...profile.workspaceCatalogues,...(workspaceKey?{[workspaceKey]:options}:{})}
  const workflows:ShopProfile['workflows']=screen==='Payments'?'payments':screen==='Counter'?'fast-food':screen==='Restaurant'?'restaurant':'stock'
  return normalizeShopProfile({...profile,workspaceSelectionVersion:1,mode:industry==='general'?'general':'suggested',industry,workflows,fastFood:screen==='Counter',restaurant:screen==='Restaurant',features:{services:screen==='Payments',productSales:screen==='POS',oilSales:screen==='Oil',hotelOperations,nightlifeOperations,hospitalityOperations:hotelOperations||nightlifeOperations},workspaceCatalogues,reportingTimeZone:timeZone})
}

export function WorkspaceOnboarding({profile,currency,policy,saveProfile,savePreferences,saveStarters,finish}: {
  profile:ShopProfile;currency:string;policy:PaymentPolicy;
  saveProfile:(profile:ShopProfile)=>Promise<void>;
  savePreferences:(currency:string,policy:PaymentPolicy)=>Promise<void>;
  saveStarters:(workspace:SetupWorkspace,industry:BusinessMode,items:CatalogueStarter[])=>Promise<void>;
  finish:(screen?:SetupWorkspace)=>void;
}) {
  const [industry,setIndustry]=useState<BusinessMode>(profile.industry)
  const [screen,setScreen]=useState<SetupWorkspace|''>(()=>{const current=businessWorkspace(profile);if(profile.industry==='hotel'||profile.industry==='nightclub')return '';return current.oil?'Oil':current.fastFood?'Counter':current.restaurant?'Restaurant':current.payments?'Payments':current.productSales?'POS':''})
  const [hotelOperations,setHotelOperations]=useState(()=>businessWorkspace(profile).hotelOperations||profile.industry==='hotel')
  const [nightlifeOperations,setNightlifeOperations]=useState(()=>businessWorkspace(profile).nightlifeOperations||profile.industry==='nightclub')
  const [nextCurrency,setCurrency]=useState(currency)
  const [timeZone,setTimeZone]=useState(profile.reportingTimeZone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC')
  const [provider,setProvider]=useState(policy.providers[0]||'')
  const [usePos,setUsePos]=useState(policy.providers.length>0)
  const [step,setStep]=useState<'business'|'items'|'confirm'>('business')
  const [query,setQuery]=useState('')
  const [selectedIds,setSelectedIds]=useState<string[]>([])
  const [error,setError]=useState('')
  const [saving,setSaving]=useState(false)
  const workspace=starterWorkspace(screen||'POS',industry)
  const starters=useMemo(()=>screen?catalogueStarters(workspace.kind,workspace.industry):[],[screen,workspace.kind,workspace.industry])
  const visible=starters.filter(item=>`${item.name} ${item.category} ${item.unit}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0,80)
  const selected=starters.filter(item=>selectedIds.includes(item.id))
  function chooseIndustry(value:BusinessMode){setIndustry(value);setSelectedIds([]);setQuery('');if(value==='hotel')setHotelOperations(true);if(value==='nightclub')setNightlifeOperations(true)}
  function chooseWorkspace(value:SetupWorkspace){setScreen(value);setSelectedIds([]);setQuery('')}
  function toggle(id:string){setSelectedIds(current=>current.includes(id)?current.filter(item=>item!==id):current.length>=200?current:[...current,id])}
  function continueSetup(){if(!screen&&!hotelOperations&&!nightlifeOperations){setError('Choose at least one workspace to continue.');return}setError('');setStep(screen?'items':'confirm')}
  async function saveSetup(itemsToSave:CatalogueStarter[]=selected){
    if(usePos&&!provider.trim()){setError('Enter the name of your POS provider, or turn off the POS payment method.');setStep('business');return}
    if(!screen&&!hotelOperations&&!nightlifeOperations){setError('Choose at least one workspace to continue.');setStep('business');return}
    setError('');setSaving(true)
    let complete=false
    try {
      const profileDraft=setupProfile(profile,industry,screen,timeZone,hotelOperations,nightlifeOperations)
      await saveProfile(profileDraft)
      const providers=usePos&&provider.trim()?[provider.trim(),...policy.providers.filter(value=>value!==policy.providers[0]&&value!==provider.trim())]:[]
      await savePreferences(nextCurrency,{...policy,providers})
      if(screen)await saveStarters(screen,industry,itemsToSave)
      complete=true
    } catch(caught) { setError(caught instanceof Error?caught.message:'Could not finish setup. Review the selection and retry.') }
    finally { setSaving(false) }
    if(complete)finish(screen||undefined)
  }
  return <main className="login-screen"><section className="login-card workspace-onboarding">
    <div className="brand-mark"><Store size={24}/></div><h1>{step==='business'?'Set up your business':step==='items'?'Choose what you sell':screen?'Review your starter catalogue':'Review your workspaces'}</h1>
    {error&&<p role="alert">{error}</p>}
    {step==='business'&&<>
      <p>Choose your business type and selling workspace separately. The catalogue list will match both choices. You can change them later.</p>
      <label>Business type<SearchableSelect ariaLabel="Business type" placeholder="Search business types" value={industry} options={Object.entries(businessModes).map(([id,item])=>({value:id,label:item.label}))} onChange={value=>chooseIndustry(value as BusinessMode)}/></label>
      <label htmlFor="setup-workspace">Selling workspace (optional for Hotel/Nightlife)</label><select id="setup-workspace" value={screen} onChange={event=>event.target.value?chooseWorkspace(event.target.value as SetupWorkspace):(setScreen(''),setSelectedIds([]),setQuery(''))}><option value="">No additional sales workspace</option><option value="Oil">Oil sales</option><option value="POS">Product sales</option><option value="Payments">Payments &amp; receipts</option><option value="Counter">Order counter</option><option value="Restaurant">Tables &amp; tabs</option></select>
      <fieldset className="setup-optional"><legend>Hospitality operations</legend><label className="checkbox-label"><input type="checkbox" checked={hotelOperations} onChange={event=>setHotelOperations(event.target.checked)}/>Hotel operations — rooms, stays and guest folios</label><label className="checkbox-label"><input type="checkbox" checked={nightlifeOperations} onChange={event=>setNightlifeOperations(event.target.checked)}/>Nightlife operations — events, admissions and venue service</label></fieldset>
      <details className="setup-optional"><summary>Explore all Stockroom workspaces</summary><ul>
        <li><strong>Product sales:</strong> scan products, take payment, print receipts and manage stock and suppliers.</li>
        <li><strong>Oil sales:</strong> sell measured quantities and configured containers with customer and bulk pricing.</li>
        <li><strong>Payments &amp; receipts:</strong> record non-stock payments, share receipts, manage jobs and invoices, and use Church collections.</li>
        <li><strong>Order counter:</strong> take counter and takeaway orders, send them to preparation, and track collection.</li>
        <li><strong>Tables &amp; tabs:</strong> serve restaurant and bar tables, repeat order rounds, manage bills and customer tabs.</li>
        <li><strong>Hotel operations:</strong> manage room bookings, group stays, housekeeping, maintenance, guest folios and night audit.</li>
        <li><strong>Nightlife operations:</strong> plan events, manage General/VIP tickets, promotions, guest lists, waitlists, private-event inquiries and QR entry.</li>
      </ul></details>
      <details className="setup-optional"><summary>Currency, time zone and other payment methods</summary>
        <label htmlFor="setup-currency">Currency</label><select id="setup-currency" value={nextCurrency} onChange={event=>setCurrency(event.target.value)}>{[...new Set([currency,'NGN','USD','GHS','KES','ZAR','GBP','EUR','XOF'])].map(code=><option key={code}>{code}</option>)}</select>
        <TimeZoneSelect value={timeZone} onChange={setTimeZone}/>
        <div className="setup-payment-row"><span>Cash</span><span>Ready</span></div>
        <label className="checkbox-label"><input type="checkbox" checked={usePos} onChange={event=>setUsePos(event.target.checked)}/>Add a POS payment method</label>{usePos&&<label>Provider name<input required value={provider} onChange={event=>setProvider(event.target.value)} placeholder="Bank or provider name" maxLength={100}/></label>}
      </details>
      <button type="button" className="primary-button login-button" onClick={continueSetup}>{screen?'Choose starter items':'Review workspace setup'}</button>
      <button type="button" className="text-button" onClick={() => finish()}>Set up later</button>
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
      <p>{screen?<>Save these {selected.length} starter {workspace.kind==='stock'?'products':workspace.kind==='service'?'services':'menu items'} for <strong>{workspace.label}</strong>?</>:<>Set up <strong>{[hotelOperations&&'Hotel operations',nightlifeOperations&&'Nightlife operations'].filter(Boolean).join(' and ')}</strong>?</>}</p>
      <ul className="onboarding-selected-list">{selected.map(item=><li key={item.id}>{item.name}</li>)}</ul>
      {workspace.kind==='stock'&&selected.length>0&&<p role="note">Products will be saved with no barcode, zero opening stock and zero prices until you edit them. The list will not be ready for paid sales until you enter your actual values.</p>}
      {workspace.kind==='service'&&selected.length>0&&<p role="note">Reusable service descriptions will be saved at zero price. Set your actual service prices before using them on receipts or jobs.</p>}
      {['counter','restaurant','bar'].includes(workspace.kind)&&selected.length>0&&<p role="note">Menu items will be saved at zero price and unavailable. Review prices, availability, stock links, recipes and options in menu settings before offering them to customers.</p>}
      <div className="report-actions"><button type="button" className="filter-button" disabled={saving} onClick={()=>setStep(screen?'items':'business')}>{screen?'Back to selection':'Back to workspace setup'}</button><button type="button" className="primary-button" disabled={saving} onClick={()=>void saveSetup()}>{saving?'Saving setup...':screen?'Save and confirm workspace':'Save and open my workspace'}</button></div>
      <button type="button" className="text-button" disabled={saving} onClick={()=>void saveSetup([])}>Continue without starter items</button>
    </>}
  </section></main>
}
