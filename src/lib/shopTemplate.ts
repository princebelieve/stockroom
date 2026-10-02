import { coreFields, type ShopField } from '../../server/shop-fields.mjs'

// Conservative candidates: headings/labels only, never automatically applied.
export function suggestTemplateFields(text: string, existing: ShopField[]): ShopField[] {
  const aliases: Record<string, string> = { 'product': 'name', 'product name': 'name', 'item name': 'name', 'name': 'name', 'sku': 'sku', 'barcode': 'barcode', 'category': 'category', 'unit': 'unit', 'quantity': 'stock', 'stock': 'stock', 'starting stock': 'stock', 'reorder point': 'reorder', 'price': 'price', 'selling price': 'price', 'cost': 'cost', 'cost price': 'cost' }
  const labels = text.split(/[\r\n|\t]+| {2,}/).map(line => line.replace(/[:*]+\s*$/, '').trim()).filter(line => line.length >= 2 && line.length <= 80 && /[a-z]/i.test(line) && !/^\d/.test(line))
  const seen = new Set<string>()
  return labels.filter(label => { const key = label.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true }).slice(0, 40).map(label => {
    const core = coreFields.find(field => field.id === aliases[label.toLowerCase()])
    const match = core || existing.find(field => field.label.toLowerCase() === label.toLowerCase())
    return { ...(match || { id: `custom_${crypto.randomUUID().replaceAll('-', '_')}`, type: /\bdate\b/i.test(label) ? 'date' : 'text', required: false, locked: false, options: [], placeholder: '' }), label, visible: true } as ShopField
  })
}
