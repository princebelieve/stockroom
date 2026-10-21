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

function setupProfile(profile:ShopProfile,industry:BusinessMode,screens:SetupWorkspace[],timeZone:string,hotelOperations:boolean,nightlifeOperations:boolean):ShopProfile {
  const oil=screens.includes('Oil')
  const productSales=screens.includes('POS')
  const payments=screens.includes('Payments')
  const fastFood=screens.includes('Counter')
  const restaurant=screens.includes('Restaurant')
  const workspaceCatalogues={...profile.workspaceCatalogues,...(oil?{'oil-sales':productCatalogueOptions(industry)}:{}),...(productSales?{'product-sales':productCatalogueOptions(industry)}:{})}
  const workflows:ShopProfile['workflows']=payments&&(productSales||oil)?'both':productSales||oil?'stock':payments?'payments':fastFood?'fast-food':restaurant?'restaurant':'stock'
  return normalizeShopProfile({...profile,workspaceSelectionVersion:1,mode:industry==='general'?'general':'suggested',industry,workflows,fastFood,restaurant,features:{...profile.features,services:payments,productSales,oilSales:oil,hotelOperations,nightlifeOperations,hospitalityOperations:hotelOperations||nightlifeOperations},workspaceCatalogues,reportingTimeZone:timeZone})
}

export function WorkspaceOnboarding({profile,currency,policy,saveProfile,savePreferences,saveStarters,finish}: {
  profile:ShopProfile;currency:string;policy:PaymentPolicy;
  saveProfile:(profile:ShopProfile)=>Promise<void>;
  savePreferences:(currency:string,policy:PaymentPolicy)=>Promise<void>;
  saveStarters:(workspace:SetupWorkspace,industry:BusinessMode,items:CatalogueStarter[])=>Promise<void>;
  finish:(screen?:SetupWorkspace)=>void;
}) {
  const [industry,setIndustry]=useState<BusinessMode>(profile.industry)
  const [screens,setScreens]=useState<SetupWorkspace[]>(()=>{const current=businessWorkspace(profile);return (['POS','Oil','Payments','Counter','Restaurant'] as SetupWorkspace[]).filter(item=>item==='POS'?current.productSales:item==='Oil'?current.oil:item==='Payments'?current.payments:item==='Counter'?current.fastFood:current.restaurant)})
  const [screen,setScreen]=useState<SetupWorkspace|''>(()=>{const current=businessWorkspace(profile);return current.oil?'Oil':current.productSales?'POS':current.payments?'Payments':current.fastFood?'Counter':current.restaurant?'Restaurant':''})
  const [hotelOperations,setHotelOperations]=useState(()=>businessWorkspace(profile).hotelOperations||profile.industry==='hotel')
  const [nightlifeOperations,setNightlifeOperations]=useState(()=>businessWorkspace(profile).nightlifeOperations||profile.industry==='nightclub')
  const [nextCurrency,setCurrency]=useState(currency)
  const [timeZone,setTimeZone]=useState(profile.reportingTimeZone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC')
  const [provider,setProvider]=useState(policy.providers[0]||'')
  const [usePos,setUsePos]=useState(policy.providers.length>0)
  const [step,setStep]=useState<'business'|'items'|'confirm'>('business')
  const [query,setQuery]=useState('')
  const [selectedIds,setSelectedIds]=useState<string[]>([])
  const [starterSelections,setStarterSelections]=useState<Partial<Record<SetupWorkspace,string[]>>>({})
  const [error,setError]=useState('')
  const [saving,setSaving]=useState(false)
  const workspace=starterWorkspace(screen||'POS',industry)
  const starters=useMemo(()=>screen?catalogueStarters(workspace.kind,workspace.industry):[],[screen,workspace.kind,workspace.industry])
  const visible=starters.filter(item=>`${item.name} ${item.category} ${item.unit}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0,80)
  const selected=starters.filter(item=>selectedIds.includes(item.id))
  const setupSummary=[...screens.map(item=>`${starterWorkspace(item,industry).label} — ${starterSelections[item]?.length||0} starter items`),...(hotelOperations?['Hotel operations']:[]),...(nightlifeOperations?['Nightlife operations']:[])]
  function chooseIndustry(value:BusinessMode){setIndustry(value);setSelectedIds([]);setStarterSelections({});setQuery('');if(value==='hotel')setHotelOperations(true);if(value==='nightclub')setNightlifeOperations(true)}
  function toggleWorkspace(value:SetupWorkspace){const next=screens.includes(value)?screens.filter(item=>item!==value):[...screens,value];setScreens(next);setStarterSelections(current=>{const copy={...current};if(!next.includes(value))delete copy[value];return copy})}
  function toggle(id:string){setSelectedIds(current=>current.includes(id)?current.filter(item=>item!==id):current.length>=200?current:[...current,id])}
  function continueSetup(){if(!screens.length&&!hotelOperations&&!nightlifeOperations){setError('Choose at least one workspace to continue.');return}setError('');if(screens.length){setScreen(screens[0]);setSelectedIds(starterSelections[screens[0]]||[]);setStep('items')}else setStep('confirm')}
  function reviewCurrent(skip=false){if(screen){setStarterSelections(current=>({...current,[screen]:skip?[]:selectedIds}));const next=screens[screens.indexOf(screen)+1];if(next){setScreen(next);setSelectedIds(starterSelections[next]||[]);setQuery('');return}}setStep('confirm')}
  async function saveSetup(skipStarters=false){
    if(usePos&&!provider.trim()){setError('Enter the name of your POS provider, or turn off the POS payment method.');setStep('business');return}
    if(!screens.length&&!hotelOperations&&!nightlifeOperations){setError('Choose at least one workspace to continue.');setStep('business');return}
    setError('');setSaving(true)
    let complete=false
    try {
      const profileDraft=setupProfile(profile,industry,screens,timeZone,hotelOperations,nightlifeOperations)
      await saveProfile(profileDraft)
      const providers=usePos&&provider.trim()?[provider.trim(),...policy.providers.filter(value=>value!==policy.providers[0]&&value!==provider.trim())]:[]
      await savePreferences(nextCurrency,{...policy,providers})
      const selections=skipStarters?{}:{...starterSelections,...(screen?{[screen]:selectedIds}:{})}
      for(const selectedWorkspace of screens){const items=catalogueStarters(starterWorkspace(selectedWorkspace,industry).kind,industry).filter(item=>(selections[selectedWorkspace]||[]).includes(item.id));await saveStarters(selectedWorkspace,industry,items)}
      complete=true
    } catch(caught) { setError(caught instanceof Error?caught.message:'Could not finish setup. Review the selection and retry.') }
    finally { setSaving(false) }
    if(complete)finish(screens[0]||undefined)
  }
  return <main className="login-screen"><section className="login-card workspace-onboarding">
    <div className="brand-mark"><Store size={24}/></div><h1>{step==='business'?'Set up your business':step==='items'?'Choose what you sell':screen?'Review your starter catalogue':'Review your workspaces'}</h1>
    {error&&<p role="alert">{error}</p>}
    {step==='business'&&<>
      <p>Choose your business type and every workspace your business will use. You can enable more workspaces later.</p>
      <label>Business type<SearchableSelect ariaLabel="Business type" placeholder="Search business types" value={industry} options={Object.entries(businessModes).map(([id,item])=>({value:id,label:item.label}))} onChange={value=>chooseIndustry(value as BusinessMode)}/></label>
      <fieldset className="setup-optional"><legend>Workspaces (select all that apply)</legend>{([['POS','Product sales'],['Oil','Oil sales'],['Payments','Payments & receipts'],['Counter','Order counter'],['Restaurant','Tables & tabs']] as [SetupWorkspace,string][]).map(([id,label])=><label key={id} className="checkbox-label"><input type="checkbox" checked={screens.includes(id)} onChange={()=>toggleWorkspace(id)}/>{label}</label>)}</fieldset>
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
      <button type="button" className="primary-button login-button" onClick={continueSetup}>{screens.length?'Choose starter items':'Review workspace setup'}</button>
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
      <div className="report-actions"><button type="button" className="filter-button" onClick={()=>{if(screen)setStarterSelections(current=>({...current,[screen]:selectedIds}));setStep('business')}}>Back</button><button type="button" className="primary-button" onClick={()=>reviewCurrent()}>Review {selectedIds.length} selected{screen&&screens.indexOf(screen)<screens.length-1?' and continue':''}</button><button type="button" className="text-button" onClick={()=>reviewCurrent(true)}>Skip these catalogue suggestions</button></div>
    </>}
    {step==='confirm'&&<>
      <p>Review the selected workspaces and starter catalogue counts before saving.</p>
      <ul className="onboarding-selected-list">{setupSummary.map(item=><li key={item}>{item}</li>)}</ul>
      {screens.length>0&&<p role="note">Starter products and services begin with zero stock or price. Menu items begin unavailable at zero price. Enter real values in each workspace before using those entries.</p>}
      <div className="report-actions"><button type="button" className="filter-button" disabled={saving} onClick={()=>{if(screens.length){const last=screens[screens.length-1];setScreen(last);setSelectedIds(starterSelections[last]||[]);setStep('items')}else setStep('business')}}>Back to selection</button><button type="button" className="primary-button" disabled={saving} onClick={()=>void saveSetup()}>{saving?'Saving setup...':'Save and open my workspaces'}</button></div>
      <button type="button" className="text-button" disabled={saving} onClick={()=>void saveSetup(true)}>Save workspaces without starter items</button>
    </>}
  </section></main>
}
