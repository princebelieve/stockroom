import type { ShopProfile, CatalogueWorkspace } from '../../server/shop-profile.mjs'

export type ProductDraft = { customValues?: Record<string, string>; name: string; barcode?: string; sku?: string; category?: string; unit?: string; price?: number; cost?: number; stock?: number; reorder?: number; catalogueSource?: string }

export function validGtin(value: string) {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false
  const digits = [...value].map(Number)
  const check = digits.pop()!
  return (10 - digits.reverse().reduce((sum, digit, i) => sum + digit * (i % 2 ? 1 : 3), 0) % 10) % 10 === check
}

export function labelSuggestion(text: string): ProductDraft {
  const lines = text.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const barcodes = [...new Set((text.match(/\b\d{8,14}\b/g) || []).filter(validGtin))]
  const size = text.match(/\b\d+(?:[.,]\d+)?\s*(?:ml|cl|litres?|liters?|kg|mg|g|oz|lb)\b/i)?.[0]
  const candidates = lines.filter(line => /[a-z]{2}/i.test(line) && line.length <= 70
    && !/\b(ingredients?|nutrition|energy|protein|carbohydrate|sodium|fat|sugars?|manufactur|distribut|expiry|expires|best before|batch|lot|barcode|www\.|https?:|storage|keep out|customer care|address|tel:|net weight|net content|serving size|per serving|allergen|warning|directions|imported by|made in|country of origin|customer service|email|phone)\b/i.test(line)
    && !/^\d+(?:[.,]\d+)?\s*(?:ml|cl|litres?|liters?|kg|mg|g|oz|lb)\b/i.test(line)
    && !/^\d+[\s./-]*\d+[\s./-]*\d+$/.test(line)
    && !/^[^a-z]*$/i.test(line))
  // OCR often emits a short brand line followed by the larger product name. Keep
  // those two useful lines, while avoiding the full label text as a product name.
  const name = candidates.slice(0, 2).join(' ')
  return { name: name ? `${name}${size && !name.toLowerCase().includes(size.toLowerCase()) ? ` ${size}` : ''}`.slice(0, 180) : '', barcode: barcodes.length === 1 ? barcodes[0] : undefined }
}

// Document OCR may collapse columns. Preserve each original line for owner selection,
// and only parse columns when explicit table separators and headers survive.
export function documentSuggestions(text: string): Array<{ draft: ProductDraft; source: string }> {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  let columns: string[] = []
  const split = (line: string) => line.split(/\t+|\s*\|\s*| {2,}/).map(cell => cell.trim())
  const result: Array<{ draft: ProductDraft; source: string }> = []
  for (const line of lines) {
    const cells = split(line)
    if (cells.some(cell => /^(description|product(?: name)?|item(?: description)?|name)$/i.test(cell))) { columns = cells.map(cell => cell.toLowerCase()); continue }
    if (!/[a-z]/i.test(line) || /^(?:sub\s*total|grand total|total|tax|vat|discount|invoice|receipt|date|supplier|customer|bill to|ship to|payment|balance|amount due)\b/i.test(line)) continue
    const get = (pattern: RegExp) => cells[columns.findIndex(column => pattern.test(column))] || ''
    if (columns.length && cells.length === columns.length) {
      const name = get(/^(description|product(?: name)?|item(?: description)?|name)$/)
      if (!name) continue
      const costText = get(/^(unit cost|cost|cost price)$/).replace(/,/g, '')
      const barcode = get(/^(barcode|ean|upc|gtin)$/)
      result.push({ draft: { name, barcode: barcode || undefined, cost: /^\d+(\.\d+)?$/.test(costText) ? Number(costText) : undefined }, source: line })
    } else result.push({ draft: { name: line.slice(0, 180) }, source: line })
  }
  return result.slice(0, 300)
}

export async function lookupProductBarcode(barcode: string, apiUrl = '', profile?: ShopProfile, workspace: CatalogueWorkspace = 'product-sales'): Promise<ProductDraft | null> {
  if (!validGtin(barcode)) return null
  // Product suggestions are mutable and may be corrected upstream. Let the
  // server own its short cache and rate limit; a browser cache could preserve
  // a wrong catalogue name for weeks or block a legitimate follow-up scan.
  try { localStorage.removeItem(`stockroom-barcode:${barcode}`) } catch { /* Storage is optional. */ }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 14000)
  try {
    const base = apiUrl.replace(/\/$/, '')
    const endpoint = base && base !== '/api/cloud'
      ? `${base}/v1/public/product-lookup?barcode=${encodeURIComponent(barcode)}`
      : `/api/product-lookup?barcode=${encodeURIComponent(barcode)}`
    const response = await fetch(endpoint, { signal: controller.signal, credentials: base && base !== '/api/cloud' ? 'omit' : 'same-origin', cache: 'no-store' })
    if (response.status === 404) return null
    if (!response.ok) { const failure = await response.json().catch(() => ({})); throw new Error(failure.error || 'Online lookup is unavailable. You can still use a photo or fill the details yourself.') }
    const data = await response.json()
    const product = data.product
    if (!product || typeof product.product_name !== 'string' || !product.product_name.trim()) return null
    if (typeof product.code !== 'string' || product.code.padStart(14, '0') !== barcode.padStart(14, '0')) return null
    const name = [product.brands, product.product_name, product.quantity].filter(value => typeof value === 'string' && value.trim()).join(' ').slice(0, 180)
    const attributes = product.attributes && typeof product.attributes === 'object' && !Array.isArray(product.attributes) ? product.attributes as Record<string, unknown> : {}
    const customValues: Record<string, string> = {}
    if (profile) for (const field of profile.fields) {
      const value = field.lookupKey ? attributes[field.lookupKey] : undefined
      const text = Array.isArray(value) ? value.filter(Boolean).join(', ') : String(value || '').trim()
      if (field.id.startsWith('custom_') && field.visible && text) customValues[field.id] = text.slice(0, 2000)
    }
    const categoryNames = String(attributes.category || '').split(/[,;>]/).map(value => value.trim()).filter(Boolean)
    const categorySettings = profile?.workspaceCatalogues?.[workspace]
    const configuredCategories = (categorySettings?.categories || profile?.categories || []).filter(category => !categorySettings?.disabledCategories?.includes(category))
    const fold = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    const matchedCategory = [...configuredCategories].reverse().find(category => categoryNames.some(name => fold(name) === fold(category) || fold(name).includes(fold(category)) || fold(category).includes(fold(name))))
    const draft = { name, barcode, ...(matchedCategory || categoryNames.length ? { category: matchedCategory || categoryNames[categoryNames.length - 1] } : {}), ...(Object.keys(customValues).length ? { customValues } : {}), catalogueSource: typeof product.source === 'string' ? product.source : 'Product catalogue' }
    return draft
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Online lookup timed out. Use a photo or complete the details yourself.')
    throw error
  } finally { clearTimeout(timer) }
}

// Kept as a compatibility alias for existing integrations/tests.
export const lookupFoodBarcode = lookupProductBarcode

export function draftProblem(draft: ProductDraft, existingBarcodes: string[], otherBarcodes: string[]) {
  if (!draft.name.trim()) return 'Enter a product name.'
  if (draft.barcode?.trim() && [...existingBarcodes, ...otherBarcodes].includes(draft.barcode.trim())) return 'This barcode is already in the catalogue or another selected row. Remove this row or correct its barcode.'
  if (draft.price === undefined) return 'Enter a selling price (use 0 only if intentional).'
  if (draft.stock === undefined) return 'Enter current stock (use 0 for no opening stock).'
  if (['price', 'cost', 'stock', 'reorder'].some(key => { const value = draft[key as keyof ProductDraft]; return value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0) })) return 'Amounts and quantities must be valid, non-negative numbers.'
  return ''
}
