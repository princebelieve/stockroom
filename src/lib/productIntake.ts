export type ProductDraft = { customValues?: Record<string, string>; name: string; barcode?: string; sku?: string; category?: string; unit?: string; price?: number; cost?: number; stock?: number; reorder?: number }

export function validGtin(value: string) {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false
  const digits = [...value].map(Number)
  const check = digits.pop()!
  return (10 - digits.reverse().reduce((sum, digit, i) => sum + digit * (i % 2 ? 1 : 3), 0) % 10) % 10 === check
}

export function labelSuggestion(text: string): ProductDraft {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const barcodes = [...new Set((text.match(/\b\d{8,14}\b/g) || []).filter(validGtin))]
  const size = text.match(/\b\d+(?:[.,]\d+)?\s*(?:ml|cl|litres?|liters?|kg|mg|g|oz|lb)\b/i)?.[0]
  const candidates = lines.filter(line => /[a-z]/i.test(line) && line.length <= 100
    && !/\b(ingredients?|nutrition|energy|protein|carbohydrate|sodium|fat|sugars?|manufactur|distribut|expiry|expires|best before|batch|lot|barcode|www\.|https?:|storage|keep out|customer care|address|tel:|net weight|net content)\b/i.test(line)
    && !/^\d+(?:[.,]\d+)?\s*(?:ml|cl|litres?|liters?|kg|mg|g|oz|lb)\b/i.test(line))
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

const cache = new Map<string, ProductDraft | null>()
let lastLookup = 0
export async function lookupFoodBarcode(barcode: string): Promise<ProductDraft | null> {
  if (!validGtin(barcode)) return null
  if (cache.has(barcode)) return cache.get(barcode)!
  if (Date.now() - lastLookup < 4500) throw new Error('Please wait a few seconds before another online lookup.')
  lastLookup = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}?fields=code,product_name,brands,quantity&app_name=StockroomBusiness`, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
    if (response.status === 404) { cache.set(barcode, null); return null }
    if (!response.ok) throw new Error('Online lookup is unavailable. You can still use a photo or fill the details yourself.')
    const data = await response.json()
    const product = data.product
    if (!product || typeof product.product_name !== 'string' || !product.product_name.trim()) { cache.set(barcode, null); return null }
    if (typeof product.code !== 'string' || product.code.padStart(14, '0') !== barcode.padStart(14, '0')) return null
    const name = [product.brands, product.product_name, product.quantity].filter(value => typeof value === 'string' && value.trim()).join(' ').slice(0, 180)
    const draft = { name, barcode }
    cache.set(barcode, draft)
    return draft
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Online lookup timed out. Use a photo or complete the details yourself.')
    throw error
  } finally { clearTimeout(timer) }
}

export function draftProblem(draft: ProductDraft, existingBarcodes: string[], otherBarcodes: string[]) {
  if (!draft.name.trim()) return 'Enter a product name.'
  if (draft.barcode?.trim() && [...existingBarcodes, ...otherBarcodes].includes(draft.barcode.trim())) return 'This barcode is already in the catalogue or another selected row. Remove this row or correct its barcode.'
  if (draft.price === undefined) return 'Enter a selling price (use 0 only if intentional).'
  if (draft.stock === undefined) return 'Enter current stock (use 0 for no opening stock).'
  if (['price', 'cost', 'stock', 'reorder'].some(key => { const value = draft[key as keyof ProductDraft]; return value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0) })) return 'Amounts and quantities must be valid, non-negative numbers.'
  return ''
}
