const appVersion = '1.0.10'
const userAgent = `Stockroom Business/${appVersion} (https://stockroom.globalcreest.com; support@sbi.globalcreest.com)`
const responseCache = new Map()
const upcItemDbCache = new Map()
const ecomSourceCache = new Map()
const recentUpstreamReads = []
const recentFoodFactsReads = []
let lastUpcItemDbRead = 0
let lastEcomSourceRead = 0

export function validProductBarcode(value) {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false
  const digits = [...value].map(Number)
  const check = digits.pop()
  return (10 - digits.reverse().reduce((sum, digit, index) => sum + digit * (index % 2 ? 1 : 3), 0) % 10) % 10 === check
}

export async function lookupOpenFoodFacts(barcode, industry = 'general') {
  if (!validProductBarcode(barcode)) return { status: 400, body: { error: 'Enter a valid product barcode.' } }
  const cacheKey = `${industry}:${barcode}`
  const cached = responseCache.get(cacheKey)
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
    const result = await lookupCatalogues(barcode, controller.signal, industry)
    if (result.status === 200) {
      responseCache.set(cacheKey, { result, expiresAt: Date.now() + 60_000 })
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

function sameBarcode(left, right) {
  return typeof left === 'string' && left.replace(/\D/g, '').padStart(14, '0') === right.padStart(14, '0')
}

async function lookupUpcItemDb(barcode, signal) {
  const cached = upcItemDbCache.get(barcode)
  if (cached && cached.expiresAt > Date.now()) return cached
  // UPCitemdb's no-key plan is shared per IP and documents one sustained
  // request every ten seconds. Skip rather than queueing owners behind a
  // provider throttle; cache both hits and misses to preserve the allowance.
  if (Date.now() - lastUpcItemDbRead < 10_000) return { product: null, responded: false }
  lastUpcItemDbRead = Date.now()
  const hasKey = Boolean(process.env.UPCITEMDB_USER_KEY)
  const url = hasKey
    ? `https://api.upcitemdb.com/prod/v1/lookup?upc=${encodeURIComponent(barcode)}`
    : `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`
  const headers = hasKey
    ? { 'user_key': process.env.UPCITEMDB_USER_KEY, 'key_type': process.env.UPCITEMDB_KEY_TYPE || '3scale' }
    : undefined
  let data
  let httpStatus = 0
  try {
    const response = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json', ...headers }, signal })
    httpStatus = response.status
    data = await response.json().catch(() => null)
  } catch (error) {
    if (signal.aborted) throw error
  }
  const item = data?.code === 'OK' && Array.isArray(data.items)
    ? data.items.find(candidate => [candidate.upc, candidate.ean, candidate.gtin].some(code => sameBarcode(code, barcode)))
    : null
  const name = item?.title || item?.description
  const product = item && name ? {
    name,
    attributes: {
      brand: item.brand,
      manufacturer: item.manufacturer,
      model: item.model,
      quantity: item.size,
      packageSize: item.size,
      category: item.category,
      description: item.description,
      imageUrl: Array.isArray(item.images) ? item.images[0] : undefined,
    },
  } : null
  // An upstream limit/error is retried after a minute; ordinary misses get a
  // longer cache so repeated scans don't consume the shared daily allowance.
  const limited = data?.code === 'EXCEED_LIMIT' || data?.code === 'TOO_FAST' || httpStatus === 429
  const confirmedMiss = httpStatus === 404 || data?.code === 'OK'
  const result = { product, responded: httpStatus > 0 && httpStatus < 500 && httpStatus !== 429 }
  upcItemDbCache.set(barcode, { ...result, expiresAt: Date.now() + (limited || !confirmedMiss && !product ? 60_000 : product ? 7 * 24 * 60 * 60_000 : 6 * 60 * 60_000) })
  return result
}

function ecomSourceIdentifierType(barcode) {
  if (barcode.length === 12) return 'upc'
  if (barcode.length === 13) return 'ean'
  return 'gtin'
}

async function lookupEcomSource(barcode, signal) {
  const cached = ecomSourceCache.get(barcode)
  if (cached && cached.expiresAt > Date.now()) return cached
  const accessKey = process.env.ECOMSOURCE_ACCESS_KEY?.trim()
  const secretKey = process.env.ECOMSOURCE_SECRET_KEY?.trim()
  if (!accessKey || !secretKey) return { product: null, responded: false }
  // The free sandbox is limited to ten calls per day and asks clients to wait
  // at least one second between calls. Skip a busy slot; UPCitemdb/Open Facts
  // remain available as fallbacks instead of delaying product entry.
  if (Date.now() - lastEcomSourceRead < 1_000) return { product: null, responded: false }
  lastEcomSourceRead = Date.now()
  let data
  let httpStatus = 0
  try {
    const response = await fetch('https://api.ecomsource.ai/api/v1/search/product', {
      method: 'POST',
      headers: {
        'X-Access-Key': accessKey,
        'X-Secret-Key': secretKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ identifier: barcode, identifierType: ecomSourceIdentifierType(barcode), refresh: false }),
      signal,
    })
    httpStatus = response.status
    data = await response.json().catch(() => null)
  } catch (error) {
    if (signal.aborted) throw error
  }
  const records = Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : []
  const record = records.find(candidate => Array.isArray(candidate.identifiers)
    && candidate.identifiers.some(identifier => sameBarcode(String(identifier?.identifier || ''), barcode)))
  const summary = Array.isArray(record?.summary) ? record.summary[0] : record?.summary
  const title = summary?.itemName || summary?.brand || summary?.modelNumber
  const product = record && title ? {
    name: String(title).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
    attributes: {
      brand: summary?.brand,
      manufacturer: summary?.manufacturer,
      model: summary?.modelNumber,
      category: summary?.category,
      description: summary?.htmlDescription,
      imageUrl: Array.isArray(record.images) ? record.images[0]?.link : undefined,
    },
  } : null
  const limited = httpStatus === 429
  const confirmedMiss = data?.status === 'not_found' || httpStatus === 404
  const result = { product, responded: httpStatus > 0 && httpStatus < 500 && !limited }
  ecomSourceCache.set(barcode, {
    ...result,
    expiresAt: Date.now() + (limited ? 5 * 60_000 : product ? 7 * 24 * 60 * 60_000 : confirmedMiss ? 12 * 60 * 60_000 : 60_000),
  })
  return result
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
  // OFF v3 legitimately returns success_with_warnings when it normalizes a
  // barcode (for example, adding a leading zero). The product remains usable.
  const successful = status === 1 || status === 'success' || status === 'success_with_errors' || status === 'success_with_warnings'
  return successful && typeof product?.code === 'string' && product.code.padStart(14, '0') === barcode.padStart(14, '0')
    ? product
    : null
}

function catalogueSuggestion(product, barcode, source) {
  // Catalogue data is a starting point for an editable product upload. Use the
  // most descriptive available label; many otherwise useful records have a
  // brand but no product_name, so do not discard them as a no-match.
  const name = product.product_name || product.generic_name || product.brands || product.brand_owner || product.quantity
  return suggestion(barcode, name, source, {
    brand: product.brands,
    manufacturer: product.brand_owner,
    quantity: product.quantity,
    packageSize: product.quantity,
    description: product.generic_name,
    ingredients: product.ingredients_text,
    allergens: product.allergens,
    traces: product.traces,
    imageUrl: product.image_url,
    category: product.categories_en || product.categories,
  })
}

function catalogueRank(industry, type) {
  const typeName = String(type || '').toLowerCase()
  const preference = industry === 'pharmacy' || industry === 'health-beauty'
    ? ['beauty', 'product', 'food', 'petfood']
    : industry === 'electronics' || industry === 'automotive'
      ? ['product', 'food', 'beauty', 'petfood']
      : industry === 'drinks' || industry === 'grocery' || industry === 'supermarket' || industry === 'food-service' || industry === 'bakery' || industry === 'food-manufacturing'
        ? ['food', 'product', 'beauty', 'petfood']
        : ['product', 'food', 'beauty', 'petfood']
  const index = preference.indexOf(typeName.replace('open ', '').replace(' facts', '').replace(' facts', ''))
  return index < 0 ? 5 : index
}

async function lookupCatalogues(barcode, signal, industry = 'general') {
  let providerResponded = false
  // The universal endpoint follows Open Food Facts' cross-catalogue redirect
  // for food, beauty, pet-food and other products in one request.
  const fields = 'code,product_name,brands,brand_owner,quantity,generic_name,categories,categories_en,ingredients_text,allergens,traces,image_url,product_type'
  const [universal, broadLookup, ecomLookup] = await Promise.all([
    getJson(`https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}?product_type=all&fields=${fields}`, signal),
    lookupUpcItemDb(barcode, signal),
    lookupEcomSource(barcode, signal),
  ])
  const broadProduct = broadLookup.product
  const ecomProduct = ecomLookup.product
  providerResponded ||= broadLookup.responded || ecomLookup.responded
  providerResponded ||= universal?.__lookupUnavailable !== true
  const universalProduct = productRecord(universal, barcode)

  // Query all catalogues even when the universal endpoint found a name. The
  // first named record can be stale or from the wrong product category.
  const catalogs = [
    ['https://world.openfoodfacts.org', 'Open Food Facts'],
    ['https://world.openproductsfacts.org', 'Open Products Facts'],
    ['https://world.openbeautyfacts.org', 'Open Beauty Facts'],
    ['https://world.openpetfoodfacts.org', 'Open Pet Food Facts'],
  ]
  const [catalogueResults, drug, device] = await Promise.all([
    Promise.all(catalogs.map(([base]) => getJson(`${base}/api/v3/product/${encodeURIComponent(barcode)}?fields=${fields}`, signal))),
    getJson(`https://api.fda.gov/drug/ndc.json?search=openfda.upc:${encodeURIComponent(barcode)}&limit=1`, signal),
    getJson(`https://accessgudid.nlm.nih.gov/api/v3/devices/lookup.json?di=${encodeURIComponent(barcode)}`, signal),
  ])
  const candidates = []
  const sourceByType = { food: 'Open Food Facts', beauty: 'Open Beauty Facts', petfood: 'Open Pet Food Facts', product: 'Open Products Facts' }
  if (ecomProduct) {
    const found = suggestion(barcode, ecomProduct.name, 'EcomSource', ecomProduct.attributes)
    if (found) candidates.push({ found, rank: -2, richness: Object.keys(found.body.product.attributes).length })
  }
  if (broadProduct) {
    const found = suggestion(barcode, broadProduct.name, 'UPCitemdb', broadProduct.attributes)
    if (found) candidates.push({ found, rank: -1, richness: Object.keys(found.body.product.attributes).length })
  }
  if (universalProduct) {
    const found = catalogueSuggestion(universalProduct, barcode, sourceByType[universalProduct.product_type] || 'Open product catalogues')
    if (found) candidates.push({ found, rank: catalogueRank(industry, universalProduct.product_type), richness: Object.keys(found.body.product.attributes).length })
  }
  for (let index = 0; index < catalogs.length; index++) {
    const data = catalogueResults[index]
    providerResponded ||= data?.__lookupUnavailable !== true
    const product = productRecord(data, barcode)
    if (product) {
      const found = catalogueSuggestion(product, barcode, sourceByType[product.product_type] || catalogs[index][1])
      if (found) candidates.push({ found, rank: catalogueRank(industry, product.product_type || catalogs[index][1]), richness: Object.keys(found.body.product.attributes).length })
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
    if (found) candidates.push({ found, rank: industry === 'pharmacy' ? 0 : 3, richness: Object.keys(found.body.product.attributes).length })
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
    if (found) candidates.push({ found, rank: industry === 'electronics' || industry === 'medical' || industry === 'healthcare' ? 0 : 4, richness: Object.keys(found.body.product.attributes).length })
  }
  if (candidates.length) {
    candidates.sort((a, b) => a.rank - b.rank || b.richness - a.richness)
    return candidates[0].found
  }
  return !providerResponded
    ? { status: 503, body: { error: 'Product catalogues are temporarily unreachable. The barcode is saved in the product form, and you can still enter the product details.' } }
    : { status: 404, body: { status: 0, error: 'No reliable product details were found in the available catalogues. The barcode is still valid; enter or photograph the product details.' } }
}
