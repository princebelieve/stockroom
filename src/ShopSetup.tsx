import { ScreenPicker } from './EmptyScreen'
import { WorkspaceHelp } from './WorkspaceHelp'
import { TimeZoneSelect } from './TimeZoneSelect'
import { useEffect, useState } from 'react'
import { AsyncForm, SubmitButton, AsyncButton } from './AsyncControls'
import { businessModes, businessWorkspace, catalogueWorkspaces, workspaceCatalogueSettings, normalizeShopProfile, validateShopProfile, type ShopProfile, type BusinessMode, type CatalogueWorkspace } from '../server/shop-profile.mjs'
import { validateFields, type ShopField } from '../server/shop-fields.mjs'
import { ShopProductFields } from './ShopProductFields'
import { BlankProductForm } from './BlankProductForm'
import type { SubscriptionAccess } from '../server/subscription-policy.mjs'

export function ShopSetup({ value, save, businessName = 'My business', currency = 'USD', requestedView, hideTaskNavigation = false, subscriptionAccess, onSubscriptionRequired }: { value: ShopProfile; save: (profile: ShopProfile) => Promise<void>; businessName?: string; currency?: string; requestedView?: string; hideTaskNavigation?: boolean; subscriptionAccess: SubscriptionAccess; onSubscriptionRequired: () => void }) {
  const [view,setView]=useState('type')
  const [draft, setDraft] = useState(value)
  const [step, setStep] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState('')
  const [subscriptionPrompt, setSubscriptionPrompt] = useState(false)
  const [catalogueWorkspace, setCatalogueWorkspace] = useState<CatalogueWorkspace>('product-sales')
  const [newCategory, setNewCategory] = useState('')
  const [newUnit, setNewUnit] = useState('')
  useEffect(() => { if (!dirty) setDraft(value) }, [value, dirty])
  useEffect(() => { if (requestedView) setView(requestedView) }, [requestedView])
  function change(next: ShopProfile) { setDraft(next); setDirty(true); setMessage(''); setProblem(''); setSubscriptionPrompt(false) }
  function changeCatalogueList(update: (settings: ReturnType<typeof workspaceCatalogueSettings>) => ReturnType<typeof workspaceCatalogueSettings>) {
    const settings = workspaceCatalogueSettings(draft, catalogueWorkspace)
    change({ ...draft, workspaceCatalogues: { ...draft.workspaceCatalogues, [catalogueWorkspace]: update(settings) } })
  }
  function addCatalogueChoice(field: 'categories' | 'units') {
    const value = (field === 'categories' ? newCategory : newUnit).trim().replace(/\s+/g, ' ')
    if (!value) return
    const settings = workspaceCatalogueSettings(draft, catalogueWorkspace)
    if (settings[field].some(item => item.toLocaleLowerCase() === value.toLocaleLowerCase())) { setProblem(`That ${field === 'categories' ? 'category' : 'unit'} is already listed.`); return }
    if (settings[field].length >= 30) { setProblem('A workspace can have up to 30 category choices and 30 unit choices.'); return }
    changeCatalogueList(current => ({ ...current, [field]: [...current[field], value] }))
    if (field === 'categories') setNewCategory(''); else setNewUnit('')
  }
  function updateField(id: string, changes: Partial<ShopField>) { change({ ...draft, mode: 'custom', fields: draft.fields.map(field => field.id === id ? { ...field, ...changes } : field) }) }
  function move(id: string, direction: number) {
    const fields = [...draft.fields]; const index = fields.findIndex(field => field.id === id); const next = index + direction
    if (next < 0 || next >= fields.length) return
    ;[fields[index], fields[next]] = [fields[next], fields[index]]; change({ ...draft, fields })
  }
  function useTemplate() {
    const next = normalizeShopProfile({ mode: draft.industry === 'general' ? 'general' : 'suggested', industry: draft.industry })
    next.workspaceSelectionVersion = 1
    next.reportingTimeZone = draft.reportingTimeZone
    next.workflows = draft.workflows
    next.fastFood = draft.fastFood
    next.restaurant = draft.restaurant
    next.features = { ...draft.features, services: draft.features?.services ?? true, productSales: businessWorkspace(draft).productSales, oilSales: businessWorkspace(draft).oil }
    const ids = new Set(next.fields.map(field => field.id))
    next.fields.push(...draft.fields.filter(field => !ids.has(field.id)).map(field => ({ ...field, visible: false })))
    if (next.fields.length > 49) { setProblem('This template would exceed 40 custom fields. Customize your current fields instead.'); return }
    change(next); setMessage('Template loaded into your draft. Review fields before saving.')
  }
  function setBusinessType(industry: BusinessMode) {
    const current = businessWorkspace(draft)
    change({ ...draft, mode: 'custom', industry, workspaceSelectionVersion: 1, features: { ...draft.features, services: draft.features?.services ?? true, productSales: current.productSales, oilSales: current.oil } })
  }
  function setWorkspaceEnabled(key: 'productSales'|'oilSales'|'payments'|'fastFood'|'restaurant'|'hospitalityOperations', enabled: boolean) {
    const current = businessWorkspace(draft)
    const workspaceLabels = { productSales: 'Product sales', oilSales: 'Oil sales', payments: 'Payments & receipts', fastFood: 'Order counter', restaurant: 'Tables & tabs', hospitalityOperations: 'Hotel & nightlife operations' }
    if (enabled && key !== 'payments') {
      const paidCount = [current.productSales, current.oil, current.fastFood, current.restaurant, current.hospitalityOperations].filter(Boolean).length
      const entitlement = subscriptionAccess.entitledWorkspaces ?? subscriptionAccess.workspacePricing?.count ?? 0
      const unrestricted = subscriptionAccess.status === 'test'
      if (!unrestricted && (subscriptionAccess.blocked || paidCount >= entitlement)) {
        setProblem(`Please subscribe to a plan to enable ${workspaceLabels[key]}.`)
        setSubscriptionPrompt(true)
        return
      }
    }
    const next = { productSales: current.productSales, oilSales: current.oil, payments: current.payments, fastFood: current.fastFood, restaurant: current.restaurant, hospitalityOperations:current.hospitalityOperations, [key]: enabled }
    if (!next.productSales && !next.oilSales && !next.payments && !next.fastFood && !next.restaurant && !next.hospitalityOperations) {
      setProblem('Keep at least one workspace enabled.')
      return
    }
    const workflows: ShopProfile['workflows'] = next.productSales && next.payments ? 'both' : next.productSales ? 'stock' : next.payments ? 'payments' : next.fastFood ? 'fast-food' : next.restaurant ? 'restaurant' : 'stock'
    change({ ...draft, workspaceSelectionVersion: 1, workflows, fastFood: next.fastFood, restaurant: next.restaurant, features: { ...draft.features, services: draft.features?.services ?? true, productSales: next.productSales, oilSales: next.oilSales, hospitalityOperations:next.hospitalityOperations } })
  }
  function go(next: number) {
    try { if (next > step) { const fields = draft.fields.map(field => ({ ...field, options: field.options.map(item => item.trim()).filter(Boolean) })); validateFields(fields); setDraft({ ...draft, fields }) }; setStep(next); setProblem('') }
    catch (error) { setProblem(error instanceof Error ? error.message : 'Check your fields.') }
  }
  return <section id="shop-setup" className="panel full-panel shop-wizard">
    {!hideTaskNavigation && <ScreenPicker buttons className="settings-task-navigation" label="Workspace settings tasks" value={view} change={setView} options={[{id:'type',label:'Business type'},{id:'workspaces',label:'Available workspaces'},{id:'catalogues',label:'Workspace catalogues'},{id:'timezone',label:'Reporting timezone'},...(!['fast-food','restaurant'].includes(draft.workflows||'')?[{id:'form',label:'Product form'}]:[])]}/>}<section hidden={view!=='type'}>
    <h2>Business type</h2>
    <label htmlFor="business-type">Business type</label>
    <select id="business-type" value={draft.industry} onChange={event => setBusinessType(event.target.value as BusinessMode)}>{Object.entries(businessModes).map(([key, type]) => <option key={key} value={key}>{type.label}</option>)}</select>
    <p>Changes the business type used for catalogue suggestions. It does not rename items or switch workspaces.</p>
    <AsyncButton className="primary-button" busyLabel="Saving business type..." disabled={!dirty || draft.industry === value.industry} onClick={async()=>{const valid=validateShopProfile(draft);await save(valid);setDraft(valid);setDirty(false);setMessage('Business type saved. Workspace choices and labels are unchanged.')}}>Save business type</AsyncButton>
    </section><section hidden={view!=='workspaces'} className="workspace-availability-task"><h2>Available workspaces</h2><p>Turn on the screens this business needs. Each appears as its own destination in the app.</p>
    <label className="settings-workspace-option"><input type="checkbox" checked={businessWorkspace(draft).productSales} onChange={event=>setWorkspaceEnabled('productSales',event.target.checked)}/><span><strong>Product sales</strong><small>Sell stocked products and manage inventory.</small></span></label>
    <label className="settings-workspace-option"><input type="checkbox" checked={businessWorkspace(draft).oil} onChange={event=>setWorkspaceEnabled('oilSales',event.target.checked)}/><span><strong>Oil sales</strong><small>Sell oil by measured quantity or container.</small></span></label>
    <label className="settings-workspace-option"><input type="checkbox" checked={businessWorkspace(draft).payments} onChange={event=>setWorkspaceEnabled('payments',event.target.checked)}/><span><strong>Payments &amp; receipts</strong><small>Record service payments without changing stock.</small></span></label>
    <label className="settings-workspace-option"><input type="checkbox" checked={businessWorkspace(draft).fastFood} onChange={event=>setWorkspaceEnabled('fastFood',event.target.checked)}/><span><strong>Order counter</strong><small>Take menu orders for a counter, cafe or takeaway.</small></span></label>
    <label className="settings-workspace-option"><input type="checkbox" checked={businessWorkspace(draft).restaurant} onChange={event=>setWorkspaceEnabled('restaurant',event.target.checked)}/><span><strong>Tables &amp; tabs</strong><small>Manage table orders and customer tabs.</small></span></label>
    <label className="settings-workspace-option"><input type="checkbox" checked={businessWorkspace(draft).hospitalityOperations} onChange={event=>setWorkspaceEnabled('hospitalityOperations',event.target.checked)}/><span><strong>Hotel &amp; nightlife operations</strong><small>Manage room stays, events, guest lists and check-ins.</small></span></label>
    <AsyncButton className="primary-button" busyLabel="Saving workspaces..." onClick={async()=>{const valid=validateShopProfile(draft);await save(valid);setDraft(valid);setDirty(false);setMessage('Workspaces saved.')}}>Save workspaces</AsyncButton>
    </section><section hidden={view!=='timezone'}><h2>Reporting timezone</h2><p>Used to group sales and reports by business day.</p>
    <TimeZoneSelect value={draft.reportingTimeZone || 'UTC'} onChange={reportingTimeZone => change({ ...draft, reportingTimeZone })} />
    <AsyncButton className="primary-button" busyLabel="Saving timezone..." onClick={async () => { const reportingTimeZone = validateShopProfile({ ...value, reportingTimeZone: draft.reportingTimeZone }).reportingTimeZone; const otherChanges = JSON.stringify({ ...draft, reportingTimeZone: value.reportingTimeZone }) !== JSON.stringify(value); await save({ ...value, reportingTimeZone }); setDraft(current => ({ ...current, reportingTimeZone })); setDirty(otherChanges); setMessage('Reporting timezone saved.') }}>Save reporting timezone</AsyncButton>
    </section><section hidden={view!=='catalogues'}>
      <h2>Workspace catalogues</h2>
      <WorkspaceHelp title="Workspace configuration"><p>Choose which category and unit choices appear in this workspace's product dropdowns. You can hide a choice without deleting it, or remove it from the list.</p></WorkspaceHelp>
      <ScreenPicker buttons className="settings-task-navigation" label="Choose workspace catalogue" value={catalogueWorkspace} change={key=>setCatalogueWorkspace(key as CatalogueWorkspace)} options={Object.entries(catalogueWorkspaces).map(([id,label])=>{const enabled=businessWorkspace(draft);const available=id==='oil-sales'?enabled.oil:id==='product-sales'?enabled.productSales:id==='order-counter'?enabled.fastFood:enabled.restaurant;return{id,label:`${label} · ${available?'enabled':'off'}`}})}/>
      {(['categories','units'] as const).map(field => {
        const settings = workspaceCatalogueSettings(draft, catalogueWorkspace)
        const disabled = field === 'categories' ? settings.disabledCategories : settings.disabledUnits
        const title = field === 'categories' ? 'Product categories' : 'Product units'
        const inputValue = field === 'categories' ? newCategory : newUnit
        return <fieldset key={field} className="catalogue-choice-list">
          <legend>{title} <span>{settings[field].length - disabled.length} of {settings[field].length} enabled</span></legend>
          <p className="catalogue-choice-hint">Checked choices appear in the <strong className="catalogue-choice-workspace">{catalogueWorkspaces[catalogueWorkspace]}</strong> dropdown. Uncheck to hide a choice. Removing it does not change saved products.</p>
          <div className="catalogue-choice-rows">{settings[field].map((choice,index) => <div className="catalogue-choice-row" key={`${choice}-${index}`}>
            <button type="button" className="catalogue-choice-delete" aria-label={`Remove ${choice} from ${title}`} title={`Remove ${choice} from this list`} onClick={() => changeCatalogueList(current => {
              const disabledKey = field === 'categories' ? 'disabledCategories' : 'disabledUnits'
              return { ...current, [field]: current[field].filter((_,i)=>i!==index), [disabledKey]: current[disabledKey].filter(item=>item!==choice) }
            })}>&times;</button>
            <label><input type="checkbox" checked={!disabled.includes(choice)} onChange={event => changeCatalogueList(current => {
              const disabledKey = field === 'categories' ? 'disabledCategories' : 'disabledUnits'
              const next = event.target.checked ? current[disabledKey].filter(item=>item!==choice) : [...current[disabledKey],choice]
              return { ...current, [disabledKey]: next }
            })} />{choice}</label>
          </div>)}</div>
          <div className="catalogue-choice-add"><input aria-label={`New ${field === 'categories' ? 'category' : 'unit'}`} maxLength={field === 'units' ? 30 : 80} value={inputValue} onChange={event => field === 'categories' ? setNewCategory(event.target.value) : setNewUnit(event.target.value)} onKeyDown={event => { if(event.key==='Enter'){event.preventDefault();addCatalogueChoice(field)} }} placeholder={`Add a ${field === 'categories' ? 'category' : 'unit'}`} /><button type="button" className="filter-button" onClick={() => addCatalogueChoice(field)} disabled={!inputValue.trim()}>&#43; Add {field === 'categories' ? 'category' : 'unit'}</button></div>
        </fieldset>
      })}
      <WorkspaceHelp><p>'Other (please specify)' remains available in product entry. Product sales, Oil sales, Order counter and Tables &amp; tabs each keep separate lists.</p></WorkspaceHelp>
      <AsyncForm onSubmit={async()=>{
        const activeCatalogue = workspaceCatalogueSettings(draft, catalogueWorkspace)
        const savedProfile = validateShopProfile({ ...value, workspaceCatalogues: { ...value.workspaceCatalogues, [catalogueWorkspace]: activeCatalogue } })
        await save(savedProfile)
        const remainingDraft = { ...draft, workspaceCatalogues: { ...draft.workspaceCatalogues, [catalogueWorkspace]: savedProfile.workspaceCatalogues[catalogueWorkspace] } }
        setDraft(remainingDraft)
        setDirty(JSON.stringify(remainingDraft) !== JSON.stringify(savedProfile))
        setMessage(`${catalogueWorkspaces[catalogueWorkspace]} catalogue saved on this device. Use Sync now to share it with your other devices.`)
      }}><SubmitButton className="primary-button">Save {catalogueWorkspaces[catalogueWorkspace]} catalogue</SubmitButton></AsyncForm>
    </section><section hidden={view!=='form'}>{!['fast-food','restaurant'].includes(draft.workflows || '') && <><h2>Product form (optional)</h2><WorkspaceHelp><p>Choose a template, customize your product form, then preview and save. Existing products keep their values.</p></WorkspaceHelp>
    <nav aria-label="Shop setup steps" className="shop-steps">{['Choose template', 'Customize fields', 'Preview and save'].map((title, index) => <button key={title} type="button" className={step === index ? 'primary-button' : 'filter-button'} aria-current={step === index ? 'step' : undefined} onClick={() => go(index)}>{index + 1}. {title}</button>)}</nav>
    {step === 0 && <div className="shop-step">
      <h3>Product catalogue template</h3><WorkspaceHelp title="Workspace configuration"><p>Use your saved business type to load starting product labels and form fields. This does not enable selling workspaces or create business operations.</p></WorkspaceHelp><p>{businessModes[draft.industry].note}</p><button type="button" className="filter-button" onClick={useTemplate}>Load {businessModes[draft.industry].label} template</button>
      <WorkspaceHelp><p>Loading a template replaces this draft's visible fields. Previous custom fields stay in Removed fields so their saved values can be restored.</p></WorkspaceHelp>
    </div>}
    {step === 1 && <div className="shop-step">
      <div className="form-grid"><label>Item name<input maxLength={40} value={draft.itemLabel} onChange={event => change({ ...draft, mode: 'custom', itemLabel: event.target.value })} /></label><label>Catalogue name<input maxLength={40} value={draft.inventoryLabel} onChange={event => change({ ...draft, mode: 'custom', inventoryLabel: event.target.value })} /></label><label>Usual unit<input maxLength={30} value={draft.unit} onChange={event => change({ ...draft, mode: 'custom', unit: event.target.value })} /></label></div>
      <WorkspaceHelp title="Control dropdowns by workspace"><p>Set category and unit choices separately for each workspace under Workspace catalogues. This product form controls field labels, placeholders, and custom dropdown fields.</p></WorkspaceHelp>
      <h3>Your form fields</h3><WorkspaceHelp><p>Open a field to edit it. Required stock and sales fields stay available. Removing an optional field hides it without deleting saved values.</p></WorkspaceHelp>
      {draft.fields.filter(field => field.visible).map(field => <details key={field.id} className="shop-field"><summary>{field.label || 'Untitled field'} {field.locked ? '(stock and sales)' : field.required ? '(required)' : ''}</summary><div className="form-grid">
        <label>Label<input value={field.label} maxLength={80} onChange={event => updateField(field.id, { label: event.target.value })} /></label><label>Placeholder<input value={field.placeholder} maxLength={120} onChange={event => updateField(field.id, { placeholder: event.target.value })} /></label>
        <label>Input type<select disabled={!field.id.startsWith('custom_')} value={field.type} onChange={event => updateField(field.id, { type: event.target.value as ShopField['type'] })}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="select">Dropdown</option></select></label>
        <label className="shop-check"><input type="checkbox" disabled={field.locked} checked={field.required} onChange={event => updateField(field.id, { required: event.target.checked })} />Required</label>
        {field.type === 'select' && <label>Dropdown choices (one per line)<textarea rows={4} value={field.options.join('\n')} onChange={event => updateField(field.id, { options: event.target.value.split('\n') })} /></label>}
      </div><div className="report-actions"><button type="button" className="filter-button" disabled={draft.fields[0].id === field.id} onClick={() => move(field.id, -1)}>Move up</button><button type="button" className="filter-button" disabled={draft.fields.at(-1)?.id === field.id} onClick={() => move(field.id, 1)}>Move down</button>{!field.locked && field.id !== 'category' && <button type="button" className="filter-button" onClick={() => updateField(field.id, { visible: false })}>Remove field</button>}</div></details>)}
      <button type="button" className="filter-button" disabled={draft.fields.length >= 49} onClick={() => change({ ...draft, mode: 'custom', fields: [...draft.fields, { id: `custom_${crypto.randomUUID().replaceAll('-', '_')}`, label: 'New field', placeholder: '', type: 'text', required: false, visible: true, locked: false, options: [] }] })}>Add input</button>
      {draft.fields.some(field => !field.visible) && <details><summary>Removed fields</summary>{draft.fields.filter(field => !field.visible).map(field => <p key={field.id}>{field.label} <button type="button" className="filter-button" onClick={() => updateField(field.id, { visible: true })}>Restore {field.label}</button></p>)}</details>}
    </div>}
    {step === 2 && <div className="shop-step"><h3>Preview: {draft.inventoryLabel}</h3><WorkspaceHelp title="Workspace configuration"><p>This is the form your team will use. Preview entries are not saved.</p></WorkspaceHelp><fieldset className="shop-preview" aria-label="Product form preview"><ShopProductFields key={JSON.stringify(draft)} profile={draft} /></fieldset><BlankProductForm businessName={businessName} businessMode={draft.industry} currency={currency} shopProfile={draft} />
      <WorkspaceHelp><p>Print customized form follows this layout for manual entry. Print blank product form keeps the standard F01-F10 layout for automatic completed-form reading. Stock and checkout calculations keep their existing rules.</p></WorkspaceHelp>
      <AsyncForm onSubmit={async () => { const next = validateShopProfile({ ...draft, categories: draft.categories.map(item => item.trim()).filter(Boolean), fields: draft.fields.map(field => ({ ...field, options: field.options.map(item => item.trim()).filter(Boolean) })) }); await save(next); setDirty(false); setMessage('Shop setup saved on this device. Use Sync now to share it with your other devices.') }}><SubmitButton className="primary-button">Save shop setup</SubmitButton></AsyncForm>
    </div>}
    <div className="shop-steps">{step > 0 && <button type="button" className="filter-button" onClick={() => go(step - 1)}>Back</button>}{step < 2 && <button type="button" className="primary-button" onClick={() => go(step + 1)}>Continue</button>}</div>
    </>}
    </section>{problem && <p role="alert">{problem} {subscriptionPrompt && <button type="button" className="text-button" onClick={onSubscriptionRequired}>View plans</button>}</p>}{message && <p role="status">{message}</p>}{dirty && <p className="muted" role="status">Unsaved changes.</p>}
  </section>
}
