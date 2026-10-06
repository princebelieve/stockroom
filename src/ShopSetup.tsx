import { WorkspaceHelp } from './WorkspaceHelp'
﻿import { useEffect, useRef, useState } from 'react'
import { AsyncForm, SubmitButton, AsyncButton } from './AsyncControls'
import { businessModes, businessPresets, applyBusinessPreset, normalizeShopProfile, validateShopProfile, type ShopProfile, type BusinessMode } from '../server/shop-profile.mjs'
import { coreFields, validateFields, type ShopField } from '../server/shop-fields.mjs'
import { ShopProductFields } from './ShopProductFields'
import { readReceiptPhoto } from './lib/receiptOcr'
import { suggestTemplateFields } from './lib/shopTemplate'
import { BlankProductForm } from './BlankProductForm'

export function ShopSetup({ value, save, businessName = 'My business', currency = 'USD', openWorkspace }: { value: ShopProfile; save: (profile: ShopProfile) => Promise<void>; businessName?: string; currency?: string; openWorkspace?: (screen: 'Oil' | 'POS' | 'Payments' | 'Counter' | 'Restaurant') => void }) {
  const [presetKey, setPresetKey] = useState('')
  const [previewPreset, setPreviewPreset] = useState('')
  const [draft, setDraft] = useState(value)
  const [step, setStep] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState('')
  const [industry, setIndustry] = useState<BusinessMode>(value.industry)
  const [text, setText] = useState('')
  const [candidates, setCandidates] = useState<ShopField[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState('')
  const reading = useRef<AbortController | null>(null)
  useEffect(() => () => reading.current?.abort(), [])
  useEffect(() => { if (!dirty) { setDraft(value); setIndustry(value.industry) } }, [value, dirty])
  function change(next: ShopProfile) { setDraft(next); setDirty(true); setMessage(''); setProblem('') }
  function updateField(id: string, changes: Partial<ShopField>) { change({ ...draft, mode: 'custom', fields: draft.fields.map(field => field.id === id ? { ...field, ...changes } : field) }) }
  function move(id: string, direction: number) {
    const fields = [...draft.fields]; const index = fields.findIndex(field => field.id === id); const next = index + direction
    if (next < 0 || next >= fields.length) return
    ;[fields[index], fields[next]] = [fields[next], fields[index]]; change({ ...draft, fields })
  }
  function useTemplate() {
    const next = normalizeShopProfile({ mode: industry === 'general' ? 'general' : 'suggested', industry })
    next.reportingTimeZone = draft.reportingTimeZone
    next.workflows = draft.workflows
    next.fastFood = draft.fastFood
    next.restaurant = draft.restaurant
    const ids = new Set(next.fields.map(field => field.id))
    next.fields.push(...draft.fields.filter(field => !ids.has(field.id)).map(field => ({ ...field, visible: false })))
    if (next.fields.length > 49) { setProblem('This template would exceed 40 custom fields. Customize your current fields instead.'); return }
    change(next); setMessage('Template loaded into your draft. Review fields before saving.')
  }
  function suggest() { const fields = suggestTemplateFields(text, draft.fields); setCandidates(fields); setSelected(fields.map((_, index) => index)); setProgress(fields.length ? 'Review the detected labels below. Uncheck text that is not a field.' : 'No labels found. Type or add your fields manually.') }
  function addSuggestions() {
    const fields = [...draft.fields]
    for (const index of selected) {
      const candidate = candidates[index]
      const position = fields.findIndex(field => field.id === candidate.id)
      if (position >= 0) fields[position] = { ...fields[position], label: candidate.label, visible: true }
      else fields.push(candidate)
    }
    if (fields.length > 49) { setProblem('Use up to 40 custom fields. Uncheck some suggestions.'); return }
    change({ ...draft, mode: 'custom', fields }); setCandidates([]); setMessage('Selected labels added to your draft. Check their types and placeholders below.')
  }
  function go(next: number) {
    try { if (next > step) { const fields = draft.fields.map(field => ({ ...field, options: field.options.map(item => item.trim()).filter(Boolean) })); validateFields(fields); setDraft({ ...draft, fields }) }; setStep(next); setProblem('') }
    catch (error) { setProblem(error instanceof Error ? error.message : 'Check your fields.') }
  }
  return <section id="shop-setup" className="panel full-panel shop-wizard">
    <h2>Start with your business</h2>
    <label htmlFor="business-preset">Business preset</label>
    <select id="business-preset" value={presetKey} onChange={event => { setPresetKey(event.target.value); setPreviewPreset('') }}><option value="">Choose your business</option>{Object.entries(businessPresets).map(([key, preset]) => <option key={key} value={key}>{preset.label}</option>)}</select>
    <button type="button" className="filter-button" disabled={!presetKey || dirty} onClick={() => setPreviewPreset(presetKey)}>Preview preset</button>
    {dirty && <p>Save your current changes before applying a business preset.</p>}
    {previewPreset && <div className="panel" aria-label="Business preset preview"><h3>{businessPresets[previewPreset].workspace}</h3><p>This will become your selling workspace. Other selling screens will be hidden; you can enable them again below.</p><p>Your products, menu, tables, receipts and saved configuration are kept. Add your items and prices in Business settings when needed.</p><AsyncButton className="primary-button" busyLabel="Applying preset..." disabled={dirty} onClick={async () => { await save(applyBusinessPreset(value, previewPreset)); setDirty(false); setPreviewPreset(''); openWorkspace?.(businessPresets[previewPreset].screen) }}>Apply preset and start selling</AsyncButton><button type="button" className="filter-button" onClick={() => setPreviewPreset('')}>Cancel</button></div>}
    <h3>Reporting timezone</h3>
    <label htmlFor="reporting-timezone">Business timezone</label><input id="reporting-timezone" value={draft.reportingTimeZone || 'UTC'} placeholder="Africa/Lagos" maxLength={100} onChange={event => change({ ...draft, reportingTimeZone: event.target.value })} /><p>Use a timezone such as Africa/Lagos, Europe/London or America/Los_Angeles. Reports use this timezone on every device. Existing businesses default to UTC.</p>
    <AsyncButton className="primary-button" busyLabel="Saving timezone..." onClick={async () => { const reportingTimeZone = validateShopProfile({ ...value, reportingTimeZone: draft.reportingTimeZone }).reportingTimeZone; const otherChanges = JSON.stringify({ ...draft, reportingTimeZone: value.reportingTimeZone }) !== JSON.stringify(value); await save({ ...value, reportingTimeZone }); setDraft(current => ({ ...current, reportingTimeZone })); setDirty(otherChanges); setMessage('Reporting timezone saved. Use Sync now to share it with other devices.') }}>Save reporting timezone</AsyncButton>
    <h3>Customise workspaces (optional)</h3>
    {draft.industry === 'liquids' ? <>
      <label><input type="checkbox" checked={draft.features?.productSales === true} onChange={event => change({ ...draft, features: { services: draft.features?.services ?? true, productSales: event.target.checked } })} />Also enable the separate Product sales workspace</label><WorkspaceHelp><p>Wholesale oil sales remains its own workspace. Enable this only if the business also needs the standard retail checkout, with its own basket and held sales.</p></WorkspaceHelp>
      <label><input type="checkbox" checked={draft.workflows === 'both' || draft.workflows === 'payments'} onChange={event => change({ ...draft, workflows: event.target.checked ? 'both' : 'stock' })} />Also enable Payments &amp; receipts</label><WorkspaceHelp><p>This is a separate screen for recording service payments that do not change oil stock.</p></WorkspaceHelp>
    </> : <>
      <label htmlFor="payment-screens">Payment screens</label><select id="payment-screens" value={draft.workflows || 'both'} onChange={event => change({ ...draft, workflows: event.target.value as ShopProfile['workflows'] })}><option value="payments">Payments &amp; receipts (printing presses, church offices, services)</option><option value="stock">Product sales (supermarkets, mini-marts, retail shops)</option><option value="both">Product sales + Payments &amp; receipts</option><option value="fast-food">Order counter only (fast food, cafes, takeaways)</option><option value="restaurant">Tables &amp; tabs only (restaurants, bars, lounges)</option></select><p>These business examples are a guide. Choose the workflow that fits how you sell.</p><WorkspaceHelp><p>Payments &amp; receipts records a payment without changing stock. Both gives staff two separate screens.</p></WorkspaceHelp>
      <label><input type="checkbox" checked={draft.fastFood === true || draft.workflows === 'fast-food'} disabled={draft.workflows === 'fast-food'} onChange={event => change({ ...draft, fastFood: event.target.checked })} />Enable separate Order counter (fast food, cafes, takeaways)</label><WorkspaceHelp><p>Use Order counter only for menu orders and preparation. Enable the checkbox with another screen choice for a mixed business.</p></WorkspaceHelp>
      <label><input type="checkbox" checked={draft.restaurant === true || draft.workflows === 'restaurant'} disabled={draft.workflows === 'restaurant'} onChange={event => change({ ...draft, restaurant: event.target.checked })} />Enable separate Tables &amp; tabs workspace (restaurants, bars, lounges)</label><p>Tables, seats, open bills and food or drink orders.</p>
    </>}
    <AsyncButton className="primary-button" busyLabel="Saving screens..." onClick={async () => { const otherChanges = JSON.stringify({ ...draft, workflows: value.workflows, fastFood: value.fastFood, restaurant: value.restaurant }) !== JSON.stringify(value); await save(validateShopProfile({ ...value, workflows: draft.workflows, fastFood: draft.fastFood || draft.workflows === 'fast-food', restaurant: draft.restaurant || draft.workflows === 'restaurant', features: { services: value.features?.services ?? true, productSales: draft.features?.productSales } })); setDirty(otherChanges); setMessage('Workspaces saved. Use Sync now to share this choice with your other devices.') }}>Save workspaces</AsyncButton>
    {!['fast-food','restaurant'].includes(draft.workflows || '') && <><h2>Product form (optional)</h2><WorkspaceHelp><p>Choose a template, customize your product form, then preview and save. Existing products keep their values.</p></WorkspaceHelp>
    <nav aria-label="Shop setup steps" className="shop-steps">{['Choose template', 'Customize fields', 'Preview and save'].map((title, index) => <button key={title} type="button" className={step === index ? 'primary-button' : 'filter-button'} aria-current={step === index ? 'step' : undefined} onClick={() => go(index)}>{index + 1}. {title}</button>)}</nav>
    {step === 0 && <div className="shop-step">
      <h3>Product catalogue template</h3><label>Catalogue type<select value={industry} onChange={event => setIndustry(event.target.value as BusinessMode)}>{Object.entries(businessModes).map(([key, profile]) => <option key={key} value={key}>{profile.label}</option>)}</select></label>
      <p>{businessModes[industry].note}</p><button type="button" className="filter-button" onClick={useTemplate}>Use this template</button>
      <WorkspaceHelp><p>Loading a template replaces this draft's visible fields. Previous custom fields stay in Removed fields so their saved values can be restored.</p></WorkspaceHelp>
      <details><summary>Start from a printed form or screenshot</summary><WorkspaceHelp><p>Upload a JPG, PNG or WebP image, or paste headings from your old app. Text is read on this device without a paid recognition service. Clear printed text works best; write in BLOCK / CAPITAL LETTERS for handwritten labels.</p></WorkspaceHelp>
        <label>Template image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { reading.current?.abort(); setFile(event.target.files?.[0] || null); setCandidates([]); setProgress('') }} /></label>
        <AsyncButton className="filter-button" disabled={!file} busyLabel="Reading image..." onClick={async () => {
          if (!file) return
          const controller = new AbortController(); reading.current = controller
          try { const result = await readReceiptPhoto(file, controller.signal, setProgress, true); if (!controller.signal.aborted) { setText(result); setProgress('Text read. Check it, then suggest fields.') } } finally { if (reading.current === controller) reading.current = null }
        }}>Read template image</AsyncButton><button type="button" className="filter-button" onClick={() => { reading.current?.abort(); setProgress('Reading cancelled. You can enter labels manually.') }}>Cancel reading</button>
        <label>Template text<textarea rows={6} value={text} onChange={event => setText(event.target.value)} placeholder="Product name&#10;Paper size&#10;Finish&#10;Selling price" /></label>
        <button type="button" className="filter-button" disabled={!text.trim()} onClick={suggest}>Suggest fields from text</button>
        {progress && <p role="status">{progress}</p>}
        {candidates.length > 0 && <fieldset><legend>Review suggested fields</legend>{candidates.map((field, index) => <div key={index} className="shop-candidate"><label><input type="checkbox" checked={selected.includes(index)} onChange={event => setSelected(event.target.checked ? [...selected, index] : selected.filter(item => item !== index))} />Use label {index + 1}</label><input aria-label={`Suggested label ${index + 1}`} maxLength={80} value={field.label} onChange={event => setCandidates(candidates.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} /><label>Connect to<select value={coreFields.some(core => core.id === field.id) ? field.id : 'custom'} onChange={event => {
          const core = coreFields.find(item => item.id === event.target.value)
          setCandidates(candidates.map((item, i) => i === index ? { ...(core || { ...item, id: `custom_${crypto.randomUUID().replaceAll('-', '_')}`, locked: false, required: false }), label: item.label } : item))
        }}><option value="custom">New custom field</option>{coreFields.map(core => <option key={core.id} value={core.id}>{core.label}</option>)}</select></label></div>)}<button type="button" className="filter-button" disabled={!selected.length} onClick={addSuggestions}>Add selected fields to draft</button></fieldset>}
      </details>
    </div>}
    {step === 1 && <div className="shop-step">
      <div className="form-grid"><label>Item name<input maxLength={40} value={draft.itemLabel} onChange={event => change({ ...draft, mode: 'custom', itemLabel: event.target.value })} /></label><label>Catalogue name<input maxLength={40} value={draft.inventoryLabel} onChange={event => change({ ...draft, mode: 'custom', inventoryLabel: event.target.value })} /></label><label>Usual unit<input maxLength={30} value={draft.unit} onChange={event => change({ ...draft, mode: 'custom', unit: event.target.value })} /></label><label>Suggested categories<textarea rows={4} value={draft.categories.join('\n')} onChange={event => change({ ...draft, mode: 'custom', categories: event.target.value.split('\n') })} /></label></div>
      <h3>Your form fields</h3><WorkspaceHelp><p>Open a field to edit it. Required stock and sales fields stay available. Removing an optional field hides it without deleting saved values.</p></WorkspaceHelp>
      {draft.fields.filter(field => field.visible).map(field => <details key={field.id} className="shop-field"><summary>{field.label || 'Untitled field'} {field.locked ? '(stock and sales)' : field.required ? '(required)' : ''}</summary><div className="form-grid">
        <label>Label<input value={field.label} maxLength={80} onChange={event => updateField(field.id, { label: event.target.value })} /></label><label>Placeholder<input value={field.placeholder} maxLength={120} onChange={event => updateField(field.id, { placeholder: event.target.value })} /></label>
        <label>Input type<select disabled={!field.id.startsWith('custom_')} value={field.type} onChange={event => updateField(field.id, { type: event.target.value as ShopField['type'] })}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="select">Dropdown</option></select></label>
        <label className="shop-check"><input type="checkbox" disabled={field.locked} checked={field.required} onChange={event => updateField(field.id, { required: event.target.checked })} />Required</label>
        {field.type === 'select' && <label>Dropdown choices (one per line)<textarea rows={4} value={field.options.join('\n')} onChange={event => updateField(field.id, { options: event.target.value.split('\n') })} /></label>}
      </div><div className="report-actions"><button type="button" className="filter-button" disabled={draft.fields[0].id === field.id} onClick={() => move(field.id, -1)}>Move up</button><button type="button" className="filter-button" disabled={draft.fields.at(-1)?.id === field.id} onClick={() => move(field.id, 1)}>Move down</button>{!field.locked && <button type="button" className="filter-button" onClick={() => updateField(field.id, { visible: false })}>Remove field</button>}</div></details>)}
      <button type="button" className="filter-button" disabled={draft.fields.length >= 49} onClick={() => change({ ...draft, mode: 'custom', fields: [...draft.fields, { id: `custom_${crypto.randomUUID().replaceAll('-', '_')}`, label: 'New field', placeholder: '', type: 'text', required: false, visible: true, locked: false, options: [] }] })}>Add input</button>
      {draft.fields.some(field => !field.visible) && <details><summary>Removed fields</summary>{draft.fields.filter(field => !field.visible).map(field => <p key={field.id}>{field.label} <button type="button" className="filter-button" onClick={() => updateField(field.id, { visible: true })}>Restore {field.label}</button></p>)}</details>}
    </div>}
    {step === 2 && <div className="shop-step"><h3>Preview: {draft.inventoryLabel}</h3><p>This is the form your team will use. Preview entries are not saved.</p><fieldset className="shop-preview" aria-label="Product form preview"><ShopProductFields key={JSON.stringify(draft)} profile={draft} /></fieldset><BlankProductForm businessName={businessName} businessMode={draft.industry} currency={currency} shopProfile={draft} />
      <WorkspaceHelp><p>Print customized form follows this layout for manual entry. Print blank product form keeps the standard F01-F10 layout for automatic completed-form reading. Stock and checkout calculations keep their existing rules.</p></WorkspaceHelp>
      <AsyncForm onSubmit={async () => { const next = validateShopProfile({ ...draft, categories: draft.categories.map(item => item.trim()).filter(Boolean), fields: draft.fields.map(field => ({ ...field, options: field.options.map(item => item.trim()).filter(Boolean) })) }); await save(next); setDirty(false); setMessage('Shop setup saved on this device. Use Sync now to share it with your other devices.') }}><SubmitButton className="primary-button">Save shop setup</SubmitButton></AsyncForm>
    </div>}
    <div className="shop-steps">{step > 0 && <button type="button" className="filter-button" onClick={() => go(step - 1)}>Back</button>}{step < 2 && <button type="button" className="primary-button" onClick={() => go(step + 1)}>Continue</button>}</div>
    </>}
    {problem && <p role="alert">{problem}</p>}{message && <p role="status">{message}</p>}{dirty && <p className="muted">Unsaved changes. Save payment screens above; product form changes use Preview and save.</p>}
  </section>
}
