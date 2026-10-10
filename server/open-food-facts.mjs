const appVersion = '1.0.10'
const userAgent = `Stockroom Business/${appVersion} (https://stockroom.globalcreest.com; support@sbi.globalcreest.com)`
const responseCache = new Map()
const recentUpstreamReads = []
const recentFoodFactsReads = []

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
  // Limit uncached public lookups per process; successful results use the
  // shared server cache, so repeat clients do not make additional provider calls.
  if (recentUpstreamReads.length >= 12) return { status: 429, body: { error: 'The barcode lookup limit was reached. Wait a minute and try again.' } }
  recentUpstreamReads.push(Date.now())
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
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
    if (new URL(url).hostname === 'world.openfoodfacts.org') {
      const minuteAgo = Date.now() - 60_000
      while (recentFoodFactsReads.length && recentFoodFactsReads[0] <= minuteAgo) recentFoodFactsReads.shift()
      // Stay below Open Food Facts' 15 product reads/minute/IP ceiling.
      if (recentFoodFactsReads.length >= 12) return { __lookupUnavailable: true }
      recentFoodFactsReads.push(Date.now())
    }
    const response = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' }, signal })
    if (!response.ok) return { __lookupUnavailable: response.status !== 404 }
    const body = await response.json().catch(() => null)
    return body || { __lookupUnavailable: true }
  } catch (error) {
    if (signal.aborted) throw error
    return { __lookupUnavailable: true }
  }
}

function lookupAttributes(values) {
  const allowed = ['brand','manufacturer','quantity','description','ingredients','allergens','traces','imageUrl','activeIngredients','strength','dosageForm','route','packageSize','registrationNumber','model','deviceClass','category']
  return Object.fromEntries(allowed.flatMap(key => {
    const value = values?.[key]
    const text = Array.isArray(value) ? value.filter(Boolean).join(', ') : String(value || '').replace(/\s+/g, ' ').trim()
    return text ? [[key, text.slice(0, 2000)]] : []
  }))
}

function suggestion(code, name, source, attributes = {}) {
  const cleanName = String(name || '').replace(/\s+/g, ' ').trim()
  return cleanName ? { status: 200, body: { status: 1, product: { code, product_name: cleanName, source, attributes: lookupAttributes(attributes) } } } : null
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
  // Catalogue data is a starting point for an editable product upload. Even a
  // sparse name can help the owner, so it should not block name prefill.
  const name = [product.brands, product.product_name, product.quantity].filter(value => typeof value === 'string' && value.trim()).join(' ')
  return suggestion(barcode, name, source, {
    brand: product.brands,
    manufacturer: product.brand_owner,
    quantity: product.quantity,
    description: product.generic_name,
    ingredients: product.ingredients_text,
    allergens: product.allergens,
    traces: product.traces,
    imageUrl: product.image_url,
    category: product.categories_en || product.categories,
  })
}

async function lookupCatalogues(barcode, signal) {
  let providerResponded = false
  // The universal endpoint follows Open Food Facts' cross-catalogue redirect
  // for food, beauty, pet-food and other products in one request.
  const fields = 'code,product_name,brands,brand_owner,quantity,generic_name,categories,categories_en,ingredients_text,allergens,traces,image_url,product_type'
  const universal = await getJson(`https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}?product_type=all&fields=${fields}`, signal)
  providerResponded ||= universal?.__lookupUnavailable !== true
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
    Promise.all(catalogs.map(([base]) => getJson(`${base}/api/v3/product/${encodeURIComponent(barcode)}?fields=${fields}`, signal))),
    getJson(`https://api.fda.gov/drug/ndc.json?search=openfda.upc:${encodeURIComponent(barcode)}&limit=1`, signal),
    getJson(`https://accessgudid.nlm.nih.gov/api/v3/devices/lookup.json?di=${encodeURIComponent(barcode)}`, signal),
  ])
  for (let index = 0; index < catalogs.length; index++) {
    const data = catalogueResults[index]
    providerResponded ||= data?.__lookupUnavailable !== true
    const product = productRecord(data, barcode)
    if (product) {
      const sourceByType = { food: 'Open Food Facts', beauty: 'Open Beauty Facts', petfood: 'Open Pet Food Facts', product: 'Open Products Facts' }
      const found = catalogueSuggestion(product, barcode, sourceByType[product.product_type] || catalogs[index][1])
      if (found) return found
    }
  }

  // openFDA identifies OTC/marketed drugs by UPC when that identifier was
  // supplied in the listing. It is US data and is only a product suggestion.
  providerResponded ||= drug?.__lookupUnavailable !== true
  const drugRecord = drug?.results?.[0]
  if (drugRecord) {
    const activeIngredients = (drugRecord.active_ingredients || []).map(item => [item.name, item.strength].filter(Boolean).join(' ')).filter(Boolean)
    const strengths = (drugRecord.active_ingredients || []).map(item => item.strength).filter(Boolean)
    const name = [drugRecord.brand_name, drugRecord.generic_name, drugRecord.dosage_form, drugRecord.brand_name_suffix].filter(Boolean).join(' ')
    const packaging = (drugRecord.packaging || []).map(item => item.description).filter(Boolean).join(', ')
    const found = suggestion(barcode, name, 'openFDA Drug NDC Directory', {
      brand: drugRecord.brand_name,
      manufacturer: drugRecord.labeler_name,
      activeIngredients,
      strength: strengths.join(', '),
      dosageForm: drugRecord.dosage_form,
      route: drugRecord.route,
      packageSize: packaging,
      registrationNumber: drugRecord.product_ndc,
    })
    if (found) return found
  }

  // A GTIN can also be the device identifier (DI) in a UDI. Registry coverage
  // is FDA/US focused; never treat a failed match as proof a device is invalid.
  providerResponded ||= device?.__lookupUnavailable !== true
  const deviceRecord = device?.gudid?.device || device?.device || device
  if (deviceRecord && (deviceRecord.brandName || deviceRecord.deviceDescription || deviceRecord.companyName)) {
    const name = [deviceRecord.brandName, deviceRecord.deviceDescription || deviceRecord.versionModelNumber].filter(Boolean).join(' ')
    const deviceClass = device?.productCodes?.map(item => item.deviceName || item.definition).filter(Boolean).join(', ')
    const found = suggestion(barcode, name, 'AccessGUDID medical device registry', {
      brand: deviceRecord.brandName,
      manufacturer: deviceRecord.companyName,
      model: deviceRecord.versionModelNumber || deviceRecord.catalogNumber,
      description: deviceRecord.deviceDescription,
      deviceClass,
    })
    if (found) return found
  }
  return !providerResponded
    ? { status: 503, body: { error: 'Product catalogues are temporarily unreachable. The barcode is saved in the product form, and you can still enter the product details.' } }
    : { status: 404, body: { status: 0, error: 'No reliable product details were found in the available catalogues. The barcode is still valid; enter or photograph the product details.' } }
}
