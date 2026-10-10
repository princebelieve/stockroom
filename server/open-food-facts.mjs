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
    if (result.status === 200) {
      responseCache.set(barcode, { result, expiresAt: Date.now() + 6 * 60 * 60 * 1000 })
      if (responseCache.size > 5000) for (const [key, value] of responseCache) if (value.expiresAt <= Date.now()) responseCache.delete(key)
    }
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
    if (!response.ok) return { __lookupUnavailable: response.status !== 404 }
    const body = await response.json().catch(() => null)
    return body || { __lookupUnavailable: true }
  } catch (error) {
    if (signal.aborted) throw error
    return { __lookupUnavailable: true }
  }
}

function suggestion(code, name, source, details = '') {
  const cleanName = String(name || '').replace(/\s+/g, ' ').trim()
  return cleanName ? { status: 200, body: { status: 1, product: { code, product_name: cleanName, source, details } } } : null
}

function productRecord(data, barcode) {
  const product = data?.product
  const status = data?.status
  const successful = status === 1 || status === 'success' || status === 'success_with_errors'
  return successful && typeof product?.code === 'string' && product.code.padStart(14, '0') === barcode.padStart(14, '0')
    ? product
    : null
}

function catalogueSuggestion(product, barcode, source) {
  // Open catalogues contain sparse and occasionally misclassified records.
  // Do not prefill the owner's product name from a bare one-field record:
  // require a brand or pack size so there is enough context to review it.
  if (!(typeof product.brands === 'string' && product.brands.trim()) && !(typeof product.quantity === 'string' && product.quantity.trim())) return null
  const name = [product.brands, product.product_name, product.quantity].filter(value => typeof value === 'string' && value.trim()).join(' ')
  return suggestion(barcode, name, source, product.quantity || '')
}

async function lookupCatalogues(barcode, signal) {
  let providerUnavailable = false
  // The universal endpoint follows Open Food Facts' cross-catalogue redirect
  // for food, beauty, pet-food and other products in one request.
  const universal = await getJson(`https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}?product_type=all&fields=code,product_name,brands,quantity,product_type`, signal)
  providerUnavailable ||= universal?.__lookupUnavailable === true
  const universalProduct = productRecord(universal, barcode)
  if (universalProduct) {
    const sourceByType = { food: 'Open Food Facts', beauty: 'Open Beauty Facts', petfood: 'Open Pet Food Facts', product: 'Open Products Facts' }
    const found = catalogueSuggestion(universalProduct, barcode, sourceByType[universalProduct.product_type] || 'Open product catalogues')
    if (found) return found
  }

  // Check category-specific catalogues and regulated registries in parallel
  // when the universal catalogue has no usable name. This keeps sparse records
  // from masking a better match and keeps mobile scans within the timeout.
  const catalogs = [
    ['https://world.openfoodfacts.org', 'Open Food Facts'],
    ['https://world.openproductsfacts.org', 'Open Products Facts'],
    ['https://world.openbeautyfacts.org', 'Open Beauty Facts'],
    ['https://world.openpetfoodfacts.org', 'Open Pet Food Facts'],
  ].filter(([base]) => !(universalProduct && base === 'https://world.openfoodfacts.org'))
  const [catalogueResults, drug, device] = await Promise.all([
    Promise.all(catalogs.map(([base]) => getJson(`${base}/api/v3/product/${encodeURIComponent(barcode)}?fields=code,product_name,brands,quantity,product_type`, signal))),
    getJson(`https://api.fda.gov/drug/ndc.json?search=openfda.upc:${encodeURIComponent(barcode)}&limit=1`, signal),
    getJson(`https://accessgudid.nlm.nih.gov/api/v3/devices/lookup.json?di=${encodeURIComponent(barcode)}`, signal),
  ])
  for (let index = 0; index < catalogs.length; index++) {
    const data = catalogueResults[index]
    providerUnavailable ||= data?.__lookupUnavailable === true
    const product = productRecord(data, barcode)
    if (product) {
      const sourceByType = { food: 'Open Food Facts', beauty: 'Open Beauty Facts', petfood: 'Open Pet Food Facts', product: 'Open Products Facts' }
      const found = catalogueSuggestion(product, barcode, sourceByType[product.product_type] || catalogs[index][1])
      if (found) return found
    }
  }

  // openFDA identifies OTC/marketed drugs by UPC when that identifier was
  // supplied in the listing. It is US data and is only a product suggestion.
  providerUnavailable ||= drug?.__lookupUnavailable === true
  const drugRecord = drug?.results?.[0]
  if (drugRecord) {
    const name = [drugRecord.brand_name, drugRecord.generic_name, drugRecord.dosage_form].filter(Boolean).join(' ')
    const found = suggestion(barcode, name, 'openFDA Drug NDC Directory', drugRecord.product_ndc || '')
    if (found) return found
  }

  // A GTIN can also be the device identifier (DI) in a UDI. Registry coverage
  // is FDA/US focused; never treat a failed match as proof a device is invalid.
  providerUnavailable ||= device?.__lookupUnavailable === true
  const deviceRecord = device?.gudid?.device || device?.device || device
  if (deviceRecord && (deviceRecord.brandName || deviceRecord.deviceDescription || deviceRecord.companyName)) {
    const name = [deviceRecord.brandName, deviceRecord.deviceDescription || deviceRecord.versionModelNumber].filter(Boolean).join(' ')
    const found = suggestion(barcode, name, 'AccessGUDID medical device registry', deviceRecord.companyName || '')
    if (found) return found
  }
  return providerUnavailable
    ? { status: 503, body: { error: 'Some product catalogues could not be reached. Try the lookup again; the scanned barcode is saved in the product form.' } }
    : { status: 404, body: { status: 0, error: 'No reliable product details were found in the available catalogues. The barcode is still valid; enter or photograph the product details.' } }
}
