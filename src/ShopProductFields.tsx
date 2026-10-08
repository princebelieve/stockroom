import type { ShopProfile } from '../server/shop-profile.mjs'
import { readCustomValues, validateCustomValues } from '../server/shop-fields.mjs'
import type { ProductDraft } from './lib/productIntake'

export function ShopProductFields({ profile, customOnly = false, values, initialDraft, scanBarcode }: { profile: ShopProfile; customOnly?: boolean; values?: unknown; initialDraft?: ProductDraft; scanBarcode?: () => Promise<string | undefined> }) {
  const saved = readCustomValues(values)
  return <div className="form-grid">{profile.fields.filter(field => field.visible && (!customOnly || field.id.startsWith('custom_'))).map(field => {
    const custom = field.id.startsWith('custom_')
    const defaults: Record<string, string | number | undefined> = { unit: profile.unit, stock: '', reorder: '0', cost: '0', price: '', ...Object.fromEntries(Object.entries(initialDraft || {}).filter(([, value]) => typeof value === 'string' || typeof value === 'number')) }
    const name = custom ? `custom:${field.id}` : field.id
    return <label key={field.id}>{field.label}{field.required ? ' *' : ''}
      {field.type === 'select' ? <select name={name} required={field.required} defaultValue={saved[field.id] || ''}><option value="">{field.placeholder || 'Choose an option'}</option>{field.options.map(option => <option key={option}>{option}</option>)}</select>
        : <><input name={name} type={field.type} required={field.required} placeholder={field.placeholder} maxLength={custom ? 2000 : 180} defaultValue={custom ? saved[field.id] || '' : defaults[field.id] ?? ''} min={!custom && field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? (['stock', 'reorder'].includes(field.id) ? '0.001' : 'any') : undefined} list={field.id === 'category' ? 'shop-category-options' : undefined} />{field.id==='barcode' && scanBarcode && <button type="button" className="filter-button" onClick={async event=>{const input=event.currentTarget.parentElement?.querySelector('input');const code=await scanBarcode();if(code && input?.isConnected){input.value=code;input.dispatchEvent(new Event('input',{bubbles:true}))}}}>Scan product barcode</button>}</>}
    </label>
  })}<datalist id="shop-category-options">{profile.categories.map(category => <option key={category} value={category} />)}</datalist></div>
}

export function collectCustomValues(data: FormData) {
  return Object.fromEntries([...data.entries()].filter(([key]) => key.startsWith('custom:')).map(([key, value]) => [key.slice(7), String(value)]))
}

export function CustomFieldEditor({ profile, values = {}, onChange, labelPrefix = '' }: { profile: ShopProfile; values?: Record<string, string>; onChange: (values: Record<string, string>) => void; labelPrefix?: string }) {
  return <div className="form-grid">{profile.fields.filter(field => field.visible && field.id.startsWith('custom_')).map(field => <label key={field.id}>{field.label}{field.required ? ' *' : ''}
    {field.type === 'select' ? <select aria-label={`${labelPrefix}${field.label}`} value={values[field.id] || ''} onChange={event => onChange({ ...values, [field.id]: event.target.value })}><option value="">{field.placeholder || 'Choose an option'}</option>{field.options.map(option => <option key={option}>{option}</option>)}</select>
      : <input aria-label={`${labelPrefix}${field.label}`} type={field.type} step={field.type === 'number' ? 'any' : undefined} maxLength={2000} placeholder={field.placeholder} value={values[field.id] || ''} onChange={event => onChange({ ...values, [field.id]: event.target.value })} />}
  </label>)}</div>
}

export function customFieldProblem(values: unknown, profile?: ShopProfile) {
  if (!profile) return ''
  try { validateCustomValues(values, profile); return '' } catch (error) { return error instanceof Error ? error.message : 'Check custom fields.' }
}
