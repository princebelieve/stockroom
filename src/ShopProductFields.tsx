import { useEffect, useRef, useState } from 'react'
import { catalogueWorkspaces, workspaceCatalogueOptions, workspaceCatalogueSettings, type ShopProfile, type CatalogueWorkspace } from '../server/shop-profile.mjs'
import { readCustomValues, validateCustomValues } from '../server/shop-fields.mjs'
import type { ProductDraft } from './lib/productIntake'
import { lookupProductBarcode, searchProductNames, validGtin, type ProductNameSuggestion } from './lib/productIntake'
import { scannerSettings } from './lib/deviceSetup'

function fieldHint(id: string, label: string, type: string) {
  if (id.startsWith('custom_')) return type === 'select' ? `Choose the closest value for ${label}. Add or change choices in Business settings > Workspaces > Product form.` : `Enter the ${label.toLowerCase()} for this product. Leave it blank when it does not apply.`
  const hints: Record<string, string> = {
    name: 'Enter the product name customers and staff will recognize. Include a brand or pack size when it distinguishes this item.',
    barcode: 'Scan or enter the code printed on this exact product and pack size. Leave it blank when the item has no barcode; do not make one up.',
    sku: 'SKU means internal stock code. Enter an existing code if your business uses one; otherwise leave it blank for Stockroom to generate a short unique code.',
    category: 'Choose the closest category for reports and searching. Choose Other (please specify) to enter a different category.',
    unit: 'Choose the unit used to count this product. Stock, cost and selling price all refer to one of this unit. Choose Other (please specify) for a unit not listed.',
    stock: 'Enter how many units are physically available now. Use zero if the product has not arrived yet.',
    reorder: 'Enter the quantity at which you want to reorder. Low-stock reports use this value.',
    cost: 'Enter what you paid for one unit in the selected unit. Use zero when the cost is unknown; update it when known for more useful profit reports.',
    price: 'Enter what the customer pays for one unit in the selected unit.',
  }
  return hints[id] || `Enter the ${label.toLowerCase()} for this product.`
}

function FieldInfo({ label, description }: { label: string; description: string }) {
  const info = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const details = info.current
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) details.open = false
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [])
  return <details ref={info} className="product-field-info"><summary aria-label={`What to enter for ${label}`} title={`What to enter for ${label}`}>(i)</summary><div className="product-field-info-copy" role="note">{description}</div></details>
}

export function ShopProductFields({ profile, catalogueWorkspace = 'product-sales', customOnly = false, readOnlyStock = false, values, initialDraft, scanBarcode, lookupApiUrl = '' }: { profile: ShopProfile; catalogueWorkspace?: CatalogueWorkspace; customOnly?: boolean; readOnlyStock?: boolean; values?: unknown; initialDraft?: ProductDraft; scanBarcode?: () => Promise<string | undefined>; lookupApiUrl?: string }) {
  const saved = readCustomValues(values)
  const catalogue = workspaceCatalogueOptions(profile, catalogueWorkspace)
  const catalogueSettings = workspaceCatalogueSettings(profile, catalogueWorkspace)
  const categories = catalogue.categories
  const units = [...new Set([...(catalogueSettings.disabledUnits.includes(profile.unit) ? [] : [profile.unit]), ...catalogue.units].map(unit => String(unit || '').trim()).filter(Boolean))]
  const initialCategory = initialDraft?.category || ''
  const initialUnit = initialDraft?.unit || profile.unit
  const [categoryChoice, setCategoryChoice] = useState(() => categories.includes(initialCategory) ? initialCategory : initialCategory ? '__custom__' : '')
  const [unitChoice, setUnitChoice] = useState(() => units.includes(initialUnit) ? initialUnit : '__custom__')
  const [barcodeLookupMessage,setBarcodeLookupMessage]=useState('')
  const [nameLookupQuery,setNameLookupQuery]=useState('')
  const [nameSuggestions,setNameSuggestions]=useState<ProductNameSuggestion[]>([])
  const [nameLookupBusy,setNameLookupBusy]=useState(false)
  const [nameLookupError,setNameLookupError]=useState('')
  useEffect(()=>{
    const term=nameLookupQuery.trim()
    if(term.length<3){setNameSuggestions([]);setNameLookupBusy(false);return}
    const controller=new AbortController()
    const timer=window.setTimeout(()=>{
      setNameLookupBusy(true);setNameLookupError('')
      void searchProductNames(term,lookupApiUrl,profile,controller.signal).then(setNameSuggestions).catch(error=>{
        if(!controller.signal.aborted){setNameSuggestions([]);setNameLookupError(error instanceof Error?error.message:'Product suggestions are unavailable.')}
      }).finally(()=>{if(!controller.signal.aborted)setNameLookupBusy(false)})
    },500)
    return()=>{window.clearTimeout(timer);controller.abort()}
  },[nameLookupQuery,lookupApiUrl,profile])
  const nameFor = (field: string) => field.startsWith('custom_') ? `custom:${field}` : field
  const idFor = (field: string) => `product-entry-${field}`
  async function lookupBarcode(code: string, codeInput: HTMLInputElement) {
    const value=code.trim()
    if(!value)return
    const formGrid=codeInput.closest('.form-grid')
    setBarcodeLookupMessage('Checking barcode catalogue...')
    try {
      const match=validGtin(value)?await lookupProductBarcode(value,lookupApiUrl,profile,catalogueWorkspace):null
      if(!validGtin(value)){setBarcodeLookupMessage('Barcode saved. This format cannot be checked in the online catalogue.');return}
      if(!match?.name){setBarcodeLookupMessage('No catalogue match. Barcode saved; enter the product name and store details.');return}
      const nameInput=formGrid?.querySelector<HTMLInputElement|HTMLTextAreaElement>('input[name="name"], textarea[name="name"]')
      if(nameInput){nameInput.value=match.name;nameInput.dispatchEvent(new Event('input',{bubbles:true}))}
      for(const [fieldId,fieldValue] of Object.entries(match.customValues||{})){
        const input=formGrid?.querySelector<HTMLInputElement>(`input[name="custom:${fieldId}"]`)
        if(input){input.value=fieldValue;input.dispatchEvent(new Event('input',{bubbles:true}))}
      }
      if(match.category){
        const select=formGrid?.querySelector<HTMLSelectElement>('select[name="category"]')
        if(select){
          const known=[...select.options].some(option=>option.value===match.category)
          select.value=known?match.category:'__custom__'
          select.dispatchEvent(new Event('change',{bubbles:true}))
          if(!known){await new Promise(resolve=>requestAnimationFrame(()=>resolve(undefined)));const categoryInput=formGrid?.querySelector<HTMLInputElement>('input[name="customCategory"]');if(categoryInput)categoryInput.value=match.category}
        }
      }
      setBarcodeLookupMessage(`Catalogue details filled from ${match.catalogueSource}. Edit any field to match your product.`)
    } catch(error) {
      setBarcodeLookupMessage(`${error instanceof Error?error.message:'Barcode lookup failed.'} Barcode saved; enter the product details.`)
    }
  }

  async function chooseNameSuggestion(suggestion: ProductNameSuggestion, formGrid: Element | null) {
    const nameInput=formGrid?.querySelector<HTMLInputElement|HTMLTextAreaElement>('input[name="name"], textarea[name="name"]')
    if(nameInput){nameInput.value=suggestion.name;nameInput.dispatchEvent(new Event('input',{bubbles:true}))}
    const barcodeInput=formGrid?.querySelector<HTMLInputElement>('input[name="barcode"]')
    if(barcodeInput&&suggestion.barcode&&!barcodeInput.value.trim()){
      barcodeInput.value=suggestion.barcode
      barcodeInput.dispatchEvent(new Event('input',{bubbles:true}))
    }
    const select=formGrid?.querySelector<HTMLSelectElement>('select[name="category"]')
    if(select&&suggestion.category&&!select.value){
      const known=[...select.options].some(option=>option.value.toLocaleLowerCase()===suggestion.category?.toLocaleLowerCase())
      select.value=known?select.options[[...select.options].findIndex(option=>option.value.toLocaleLowerCase()===suggestion.category?.toLocaleLowerCase())].value:'__custom__'
      select.dispatchEvent(new Event('change',{bubbles:true}))
      if(!known){await new Promise(resolve=>requestAnimationFrame(()=>resolve(undefined)));const input=formGrid?.querySelector<HTMLInputElement>('input[name="customCategory"]');if(input&&!input.value)input.value=suggestion.category}
    }
    const attributes:Record<string,string>={brand:suggestion.brand||'',quantity:suggestion.quantity||'',packageSize:suggestion.quantity||'',category:suggestion.category||'',imageUrl:suggestion.imageUrl||''}
    for(const field of profile.fields.filter(item=>item.id.startsWith('custom_')&&item.lookupKey)){
      const value=attributes[field.lookupKey!]||''
      const input=formGrid?.querySelector<HTMLInputElement>(`input[name="custom:${field.id}"]`)
      if(value&&input&&!input.value){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))}
    }
    setNameSuggestions([]);setNameLookupQuery('');setNameLookupError('')
  }

  return <div className="form-grid">{profile.fields.filter(field => (field.visible || ['category', 'unit'].includes(field.id)) && (!customOnly || field.id.startsWith('custom_'))).map(field => {
    const custom = field.id.startsWith('custom_')
    const defaults: Record<string, string | number | undefined> = { unit: profile.unit, stock: '', reorder: '0', cost: '0', price: '', ...Object.fromEntries(Object.entries(initialDraft || {}).filter(([, value]) => typeof value === 'string' || typeof value === 'number')) }
    const name = nameFor(field.id)
    const inputId = idFor(field.id)
    const hint = fieldHint(field.id, field.label, field.type)
    const categoryField = field.id === 'category' && !customOnly
    const unitField = field.id === 'unit' && !customOnly
    const customCategory = categoryField && categoryChoice === '__custom__'
    const customUnit = unitField && unitChoice === '__custom__'
    const control = categoryField ? <>
      <select id={inputId} name="category" defaultValue={categoryChoice} onChange={event => setCategoryChoice(event.target.value)}>
        <option value="">Choose a category</option>
        <optgroup label={`${catalogueWorkspaces[catalogueWorkspace]} categories`}>{categories.map(category => <option key={category} value={category}>{category}</option>)}</optgroup>
        <option value="__custom__">Other (please specify)</option>
      </select>
      {customCategory && <input aria-label="Specify product category" name="customCategory" required maxLength={80} defaultValue={initialCategory && !categories.includes(initialCategory) ? initialCategory : ''} placeholder="Enter category" />}
    </> : unitField ? <>
      <select id={inputId} name="unit" defaultValue={unitChoice} onChange={event => setUnitChoice(event.target.value)}>
        <optgroup label={`${catalogueWorkspaces[catalogueWorkspace]} units`}>{units.map(unit => <option key={unit} value={unit}>{unit}</option>)}</optgroup>
        <option value="__custom__">Other (please specify)</option>
      </select>
      {customUnit && <input aria-label="Specify product unit" name="customUnit" required maxLength={30} defaultValue={initialUnit && !units.includes(initialUnit) ? initialUnit : ''} placeholder="Enter unit, such as roll or hour" />}
    </> : field.type === 'select' ? <select id={inputId} name={name} required={field.required} defaultValue={saved[field.id] || ''}><option value="">{field.placeholder || 'Choose an option'}</option>{field.options.map(option => <option key={option}>{option}</option>)}</select>
      : field.id === 'name' ? <><textarea id={inputId} name={name} required={field.required} maxLength={180} defaultValue={defaults[field.id] ?? ''} rows={2} placeholder={field.placeholder} onInput={event=>{setNameLookupQuery(event.currentTarget.value);setNameLookupError('')}} />{nameLookupQuery.trim().length>=3&&(nameLookupBusy||nameLookupError||nameSuggestions.length>0)&&<div className="product-name-suggestions" role="listbox" aria-label="Product suggestions">{nameLookupBusy?<p role="status">Searching product sources…</p>:nameLookupError?<p role="status">{nameLookupError}</p>:nameSuggestions.map((suggestion,index)=><button type="button" role="option" key={`${suggestion.barcode||suggestion.name}-${suggestion.source}-${index}`} onMouseDown={event=>event.preventDefault()} onClick={event=>{const grid=event.currentTarget.closest('.form-grid');void chooseNameSuggestion(suggestion,grid)}}><span><strong>{suggestion.name}</strong><small>{[suggestion.brand,suggestion.quantity,suggestion.barcode].filter(Boolean).join(' · ')}</small></span><small>{suggestion.source}</small></button>)}</div>}</>
      : <><input id={inputId} name={name} type={field.type} required={field.required} readOnly={readOnlyStock && field.id === 'stock'} placeholder={field.placeholder} maxLength={custom ? 2000 : 180} defaultValue={custom ? saved[field.id] || initialDraft?.customValues?.[field.id] || '' : defaults[field.id] ?? ''} min={!custom && field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? (['stock', 'reorder'].includes(field.id) ? '0.001' : 'any') : undefined} onKeyDown={field.id==='barcode'?event=>{if(event.key===scannerSettings().suffix&&event.currentTarget.value.trim()){event.preventDefault();void lookupBarcode(event.currentTarget.value,event.currentTarget)}}:undefined} />{field.id === 'barcode' && scanBarcode && <button type="button" className="filter-button" onClick={async event => { const codeInput=event.currentTarget.parentElement?.querySelector('input'); const code=await scanBarcode(); if(code&&codeInput?.isConnected){codeInput.value=code;codeInput.dispatchEvent(new Event('input',{bubbles:true}));await lookupBarcode(code,codeInput)} }}>Scan product barcode</button>}</>

    return <div className="shop-product-field" key={field.id}>
      <div className="shop-product-field-label"><label htmlFor={inputId}>{field.label}{field.required ? ' *' : ''}</label><FieldInfo label={field.label} description={hint} /></div>
      {control}{field.id==='barcode'&&barcodeLookupMessage&&(barcodeLookupMessage==='Checking barcode catalogue...'?<div className="barcode-lookup-inline-loading" role="status" aria-live="polite"><span className="barcode-lookup-spinner" aria-hidden="true"/>Checking barcode catalogue...</div>:<p className="settings-message" role="status">{barcodeLookupMessage}</p>)}
    </div>
  })}</div>
}

export function collectCustomValues(data: FormData) {
  return Object.fromEntries([...data.entries()].filter(([key]) => key.startsWith('custom:')).map(([key, value]) => [key.slice(7), String(value)]))
}

export function CustomFieldEditor({ profile, values = {}, onChange, labelPrefix = '' }: { profile: ShopProfile; values?: Record<string, string>; onChange?: (values: Record<string, string>) => void; labelPrefix?: string }) {
  return <div className="form-grid">{profile.fields.filter(field => field.visible && field.id.startsWith('custom_')).map(field => {
    const hint = fieldHint(field.id, field.label, field.type)
    const inputId = `custom-product-${field.id}`
    return <div className="shop-product-field" key={field.id}><div className="shop-product-field-label"><label htmlFor={inputId}>{labelPrefix}{field.label}{field.required ? ' *' : ''}</label><FieldInfo label={field.label} description={hint} /></div>
      {field.type === 'select' ? <select id={inputId} aria-label={`${labelPrefix}${field.label}`} required={field.required} value={values[field.id] || ''} onChange={event => onChange?.({ ...values, [field.id]: event.target.value })}><option value="">{field.placeholder || 'Choose an option'}</option>{field.options.map(option => <option key={option}>{option}</option>)}</select>
        : <input id={inputId} aria-label={`${labelPrefix}${field.label}`} type={field.type} required={field.required} step={field.type === 'number' ? 'any' : undefined} maxLength={2000} placeholder={field.placeholder} value={values[field.id] || ''} onChange={event => onChange?.({ ...values, [field.id]: event.target.value })} />}
    </div>
  })}</div>
}

export function customFieldProblem(values: unknown, profile?: ShopProfile) {
  if (!profile) return ''
  try { validateCustomValues(values, profile); return '' } catch (error) { return error instanceof Error ? error.message : 'Check custom fields.' }
}
