const appVersion = '1.0.10'
const userAgent = `Stockroom Business/${appVersion} (https://stockroom.globalcreest.com; support@sbi.globalcreest.com)`
const responseCache = new Map()
const recentUpstreamReads = []

export function validProductBarcode(value) {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false
  const digits = [...value].map(Number)
  const check = digits.pop()
  return (10 - digits.reverse().reduce((sum, digit, index) => sum + digit * (index % 2 ? 1 : 3), 0) % 10) % 10 === check
}

export async function lookupOpenFoodFacts(barcode) {
  if (!validProductBarcode(barcode)) return { status: 400, body: { error: 'Enter a valid product barcode.' } }
  const cached = responseCache.get(barcode)
  if (cached && cached.expiresAt > Date.now()) return cached.result
  const minuteAgo = Date.now() - 60_000
  while (recentUpstreamReads.length && recentUpstreamReads[0] <= minuteAgo) recentUpstreamReads.shift()
  // Open Food Facts limits product reads to 15 requests per minute per IP.
  // Render and Vercel proxy requests share an upstream address, so cap this
  // service below that ceiling; browser-side cached reads do not reach here.
  if (recentUpstreamReads.length >= 12) return { status: 429, body: { error: 'The barcode lookup limit was reached. Wait a minute and try again.' } }
  recentUpstreamReads.push(Date.now())
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const result = await lookupCatalogues(barcode, controller.signal)
    responseCache.set(barcode, { result, expiresAt: Date.now() + 6 * 60 * 60 * 1000 })
    if (responseCache.size > 5000) for (const [key, value] of responseCache) if (value.expiresAt <= Date.now()) responseCache.delete(key)
    return result
  } catch {
    return { status: 503, body: { error: controller.signal.aborted ? 'Barcode lookup timed out. You can still enter the product details.' : 'Could not reach the barcode catalogue. Check your connection and enter the product details.' } }
  } finally {
    clearTimeout(timer)
  }
}

async function getJson(url, signal) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' }, signal })
    if (!response.ok) return null
    return response.json().catch(() => null)
  } catch (error) {
    if (signal.aborted) throw error
    return null
  }
}

function suggestion(code, name, source, details = '') {
  const cleanName = String(name || '').replace(/\s+/g, ' ').trim()
  return cleanName ? { status: 200, body: { status: 1, product: { code, product_name: cleanName, source, details } } } : null
}

async function lookupCatalogues(barcode, signal) {
  // Community catalogues are attempted first because they cover products sold
  // internationally; specialist regulatory sources are fallbacks by identifier.
  const catalogs = [
    ['https://world.openfoodfacts.org', 'Open Food Facts'],
    ['https://world.openproductsfacts.org', 'Open Products Facts'],
    ['https://world.openbeautyfacts.org', 'Open Beauty Facts'],
    ['https://world.openpetfoodfacts.org', 'Open Pet Food Facts'],
  ]
  for (const [base, source] of catalogs) {
    const data = await getJson(`${base}/api/v3/product/${encodeURIComponent(barcode)}?fields=code,product_name,brands,quantity`, signal)
    const product = data?.product
    if (data?.status === 1 && product?.code?.padStart(14, '0') === barcode.padStart(14, '0')) {
      const name = [product.brands, product.product_name, product.quantity].filter(value => typeof value === 'string' && value.trim()).join(' ')
      const found = suggestion(barcode, name, source, product.quantity || '')
      if (found) return found
    }
  }

  // openFDA identifies OTC/marketed drugs by UPC when that identifier was
  // supplied in the listing. It is US data and is only a product suggestion.
  const drug = await getJson(`https://api.fda.gov/drug/ndc.json?search=openfda.upc:${encodeURIComponent(barcode)}&limit=1`, signal)
  const drugRecord = drug?.results?.[0]
  if (drugRecord) {
    const name = [drugRecord.brand_name, drugRecord.generic_name, drugRecord.dosage_form].filter(Boolean).join(' ')
    const found = suggestion(barcode, name, 'openFDA Drug NDC Directory', drugRecord.product_ndc || '')
    if (found) return found
  }

  // A GTIN can also be the device identifier (DI) in a UDI. Registry coverage
  // is FDA/US focused; never treat a failed match as proof a device is invalid.
  const device = await getJson(`https://accessgudid.nlm.nih.gov/api/v3/devices/lookup.json?di=${encodeURIComponent(barcode)}`, signal)
  const deviceRecord = device?.gudid?.device || device?.device || device
  if (deviceRecord && (deviceRecord.brandName || deviceRecord.deviceDescription || deviceRecord.companyName)) {
    const name = [deviceRecord.brandName, deviceRecord.deviceDescription || deviceRecord.versionModelNumber].filter(Boolean).join(' ')
    const found = suggestion(barcode, name, 'AccessGUDID medical device registry', deviceRecord.companyName || '')
    if (found) return found
  }
  return { status: 404, body: { status: 0, error: 'No product name was found in the available catalogues. The barcode is still valid; enter or photograph the product details.' } }
}
