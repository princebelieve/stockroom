import { useState } from 'react'
import { catalogueWorkspaces, workspaceCatalogueOptions, workspaceCatalogueSettings, type ShopProfile, type CatalogueWorkspace } from '../server/shop-profile.mjs'
import { readCustomValues, validateCustomValues } from '../server/shop-fields.mjs'
import type { ProductDraft } from './lib/productIntake'

function fieldHint(id: string, label: string, type: string) {
  if (id.startsWith('custom_')) return type === 'select' ? `Choose the closest value for ${label}. Add or change choices in Business settings > Workspaces > Product form.` : `Enter the ${label.toLowerCase()} for this product. Leave it blank when it does not apply.`
  const hints: Record<string, string> = {
    name: 'Enter the product name customers and staff will recognize. Include a brand or pack size when it distinguishes this item.',
    barcode: 'Scan or enter the code printed on this exact product and pack size. Leave it blank when the item has no barcode; do not make one up.',
    sku: 'A SKU is your own stock code. Leave it blank and Stockroom will generate one.',
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
  return <details className="product-field-info"><summary aria-label={`What to enter for ${label}`} title={`What to enter for ${label}`}>(i)</summary><div className="product-field-info-copy" role="note">{description}</div></details>
}

export function ShopProductFields({ profile, catalogueWorkspace = 'product-sales', customOnly = false, values, initialDraft, scanBarcode }: { profile: ShopProfile; catalogueWorkspace?: CatalogueWorkspace; customOnly?: boolean; values?: unknown; initialDraft?: ProductDraft; scanBarcode?: () => Promise<string | undefined> }) {
  const saved = readCustomValues(values)
  const catalogue = workspaceCatalogueOptions(profile, catalogueWorkspace)
  const catalogueSettings = workspaceCatalogueSettings(profile, catalogueWorkspace)
  const categories = catalogue.categories
  const units = [...new Set([...(catalogueSettings.disabledUnits.includes(profile.unit) ? [] : [profile.unit]), ...catalogue.units].map(unit => String(unit || '').trim()).filter(Boolean))]
  const initialCategory = initialDraft?.category || ''
  const initialUnit = initialDraft?.unit || profile.unit
  const [categoryChoice, setCategoryChoice] = useState(() => categories.includes(initialCategory) ? initialCategory : initialCategory ? '__custom__' : '')
  const [unitChoice, setUnitChoice] = useState(() => units.includes(initialUnit) ? initialUnit : '__custom__')
  const nameFor = (field: string) => field.startsWith('custom_') ? `custom:${field}` : field
  const idFor = (field: string) => `product-entry-${field}`

  return <div className="form-grid">{profile.fields.filter(field => field.visible && (!customOnly || field.id.startsWith('custom_'))).map(field => {
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
      : <><input id={inputId} name={name} type={field.type} required={field.required} placeholder={field.placeholder} maxLength={custom ? 2000 : 180} defaultValue={custom ? saved[field.id] || '' : defaults[field.id] ?? ''} min={!custom && field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? (['stock', 'reorder'].includes(field.id) ? '0.001' : 'any') : undefined} />{field.id === 'barcode' && scanBarcode && <button type="button" className="filter-button" onClick={async event => { const input = event.currentTarget.parentElement?.querySelector('input'); const code = await scanBarcode(); if (code && input?.isConnected) { input.value = code; input.dispatchEvent(new Event('input', { bubbles: true })) } }}>Scan product barcode</button>}</>

    return <div className="shop-product-field" key={field.id}>
      <div className="shop-product-field-label"><label htmlFor={inputId}>{field.label}{field.required ? ' *' : ''}</label><FieldInfo label={field.label} description={hint} /></div>
      {control}
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
