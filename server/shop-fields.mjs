export const coreFields = [
  { id: 'name', label: 'Product name', type: 'text', required: true, locked: true, placeholder: 'Enter a name' },
  { id: 'barcode', label: 'Barcode', type: 'text', placeholder: 'Scan or enter barcode' },
  { id: 'sku', label: 'SKU', type: 'text', placeholder: 'Leave blank to generate' },
  { id: 'category', label: 'Category', type: 'text', placeholder: 'Choose or enter a category' },
  { id: 'unit', label: 'Unit', type: 'text', required: true, locked: true, placeholder: 'piece, carton, portion' },
  { id: 'stock', label: 'Starting stock', type: 'number', required: true, locked: true, placeholder: '0' },
  { id: 'reorder', label: 'Reorder point', type: 'number', placeholder: '0' },
  { id: 'cost', label: 'Cost price per unit', type: 'number', placeholder: '0.00' },
  { id: 'price', label: 'Selling price per unit', type: 'number', required: true, locked: true, placeholder: '0.00' },
].map(field => ({ required: false, locked: false, visible: true, options: [], ...field }))

export function templateFields(industry = 'general', itemLabel = 'Product') {
  const extras = {
    printing: [['paper_size', 'Paper size'], ['finish', 'Finish'], ['colour', 'Colour']],
    'food-service': [['allergens', 'Allergens'], ['portion_size', 'Portion size']],
    clothing: [['size', 'Size'], ['colour', 'Colour'], ['material', 'Material']],
    pharmacy: [['batch', 'Batch number'], ['expiry', 'Expiry date', 'date']],
    electronics: [['brand', 'Brand'], ['model', 'Model'], ['warranty', 'Warranty']],
  }[industry] || []
  return [...coreFields.map(field => ({ ...field, label: field.id === 'name' ? `${itemLabel} name` : field.label })),
    ...extras.map(([id, label, type = 'text']) => ({ id: `custom_${industry.replaceAll('-', '_')}_${id}`, label, type, placeholder: '', required: false, visible: true, locked: false, options: [] }))]
}

export function normalizeFields(fields, industry, itemLabel) {
  if (!Array.isArray(fields)) return templateFields(industry, itemLabel)
  const seen = new Set()
  const result = []
  for (const field of fields.slice(0, 49)) {
    if (!field || typeof field !== 'object' || typeof field.id !== 'string' || seen.has(field.id)) continue
    const core = coreFields.find(item => item.id === field.id)
    if (!core && (!/^custom_[a-zA-Z0-9_]{1,64}$/.test(field.id) || result.filter(item => item.id.startsWith('custom_')).length >= 40)) continue
    seen.add(field.id)
    result.push({ id: field.id, label: String(field.label || core?.label || 'Custom field').trim().slice(0, 80),
      type: core?.type || (['text', 'number', 'date', 'select'].includes(field.type) ? field.type : 'text'),
      placeholder: String(field.placeholder || '').slice(0, 120), locked: Boolean(core?.locked),
      visible: core?.locked || core?.id === 'category' ? true : field.visible !== false, required: core?.locked ? true : Boolean(field.required),
      options: Array.isArray(field.options) ? [...new Set(field.options.filter(option => typeof option === 'string').map(option => option.trim()).filter(Boolean))].slice(0, 40) : [],
    })
  }
  // Missing essential fields cannot disable inventory accounting.
  for (const core of coreFields) if (!seen.has(core.id)) result.push({ ...core, visible: core.locked || core.id === 'category' })
  return result
}

export function validateFields(fields) {
  if (fields === undefined) return
  if (!Array.isArray(fields) || fields.length > 49) throw new Error('Use up to 40 custom fields.')
  if (fields.filter(field => field?.id?.startsWith?.('custom_')).length > 40) throw new Error('Use up to 40 custom fields.')
  const seen = new Set()
  for (const field of fields) {
    const core = coreFields.find(item => item.id === field?.id)
    if (!field || (!core && !/^custom_[a-zA-Z0-9_]{1,64}$/.test(field.id)) || seen.has(field.id)) throw new Error('Each field needs a unique identifier.')
    seen.add(field.id)
    if (typeof field.label !== 'string' || !field.label.trim() || field.label.length > 80 || typeof field.placeholder !== 'string' || field.placeholder.length > 120) throw new Error('Use a label up to 80 characters and a placeholder up to 120 characters.')
    if (!['text', 'number', 'date', 'select'].includes(field.type) || (core && field.type !== core.type)) throw new Error('Choose a valid field type. Built-in field types cannot change.')
    if (core?.locked && (field.visible === false || !field.required)) throw new Error(`${core.label} is needed for stock and sales.`)
    if (!Array.isArray(field.options) || field.options.length > 40 || field.options.some(option => typeof option !== 'string' || !option.trim() || option.length > 80)) throw new Error('Use up to 40 short dropdown choices.')
    if (field.type === 'select' && !field.options.length) throw new Error(`Add dropdown choices for ${field.label}.`)
  }
}

// Historical values are kept independently of the current layout.
export function readCustomValues(input) {
  if (typeof input === 'string') { try { input = JSON.parse(input) } catch { throw new Error('Custom field values are invalid.') } }
  if (input == null) return {}
  if (typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 100) throw new Error('Custom field values are invalid.')
  const result = {}
  for (const [key, value] of Object.entries(input)) {
    if (!/^custom_[a-zA-Z0-9_]{1,64}$/.test(key) || typeof value !== 'string' || value.length > 2000) throw new Error('Custom field values must be text of at most 2,000 characters.')
    result[key] = value
  }
  return result
}

export function validateCustomValues(input, profile, enforceRequired = true) {
  const values = readCustomValues(input)
  for (const field of profile.fields || []) {
    if (!field.id.startsWith('custom_') || !field.visible) continue
    const value = values[field.id]?.trim() || ''
    if (!value) { if (field.required && enforceRequired) throw new Error(`Enter ${field.label}.`); continue }
    if (field.type === 'number' && !Number.isFinite(Number(value))) throw new Error(`${field.label} must be a number.`)
    if (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error(`${field.label} must be a valid date.`)
    if (field.type === 'select' && !field.options.includes(value)) throw new Error(`Choose an option for ${field.label}.`)
  }
  return values
}

export function validateCoreRequirements(input, profile) {
  for (const field of profile.fields || []) {
    if (field.visible && field.required && !field.id.startsWith('custom_') && (input[field.id] == null || String(input[field.id]).trim() === '')) throw new Error(`Enter ${field.label}.`)
  }
}
