const appVersion = '1.0.10'
const userAgent = `Stockroom Business/${appVersion} (https://stockroom.globalcreest.com; support@sbi.globalcreest.com)`
const responseCache = new Map()
const candidateCache = new Map()
const upcItemDbCache = new Map()
const ecomSourceCache = new Map()
const recentUpstreamReads = []
const recentFoodFactsReads = []
const recentNafdacReads = []
const recentWebSearchReads = []
const webSearchCache = new Map()
let lastUpcItemDbRead = 0
const nameSearchCache = new Map()
let lastEcomSourceRead = 0

export async function searchProductNames(rawQuery, industry = 'general') {
  const query = String(rawQuery || '').trim().replace(/\s+/g, ' ').slice(0, 80)
  if (query.length < 3) return { status: 200, body: { suggestions: [] } }
  const cacheKey = `${industry}:${query.toLocaleLowerCase()}`
  const cached = nameSearchCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return { status: 200, body: cached.body }
  const fields = 'code,product_name,brands,quantity,categories,image_url'
  const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=8&fields=${fields}`
  const offPromise = fetch(offUrl, { headers: { 'User-Agent': userAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(5000) })
    .then(response => response.ok ? response.json() : null).catch(() => null)
  let upcPromise = Promise.resolve(null)
  // UPCitemdb's free search and barcode lookup quotas are shared. Keep its
  // contribution opportunistic and rate limited; Open Food Facts remains the fallback.
  if (Date.now() - lastUpcItemDbRead >= 10_000) {
    lastUpcItemDbRead = Date.now()
    upcPromise = fetch(`https://api.upcitemdb.com/prod/trial/search?s=${encodeURIComponent(query)}`, { headers: { 'User-Agent': userAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(5000) })
      .then(response => response.ok ? response.json() : null).catch(() => null)
  }
  const [off, upc] = await Promise.all([offPromise, upcPromise])
  const suggestions = []
  for (const product of Array.isArray(off?.products) ? off.products : []) {
    const name = String(product.product_name || '').trim()
    if (!name) continue
    suggestions.push({ name, barcode: String(product.code || ''), brand: String(product.brands || ''), quantity: String(product.quantity || ''), category: String(product.categories || '').split(',').map(value => value.trim()).filter(Boolean).at(-1) || '', imageUrl: String(product.image_url || ''), source: product.product_type === 'beauty' ? 'Open Beauty Facts' : product.product_type === 'product' ? 'Open Products Facts' : product.product_type === 'petfood' ? 'Open Pet Food Facts' : 'Open Food Facts' })
  }
  for (const product of Array.isArray(upc?.items) ? upc.items : []) {
    const name = String(product.title || product.description || '').trim()
    if (!name) continue
    suggestions.push({ name, barcode: String(product.ean || product.upc || product.gtin || ''), brand: String(product.brand || ''), quantity: String(product.size || ''), category: String(product.category || ''), imageUrl: String(product.images?.[0] || ''), source: 'UPCitemdb' })
  }
  const seen = new Set()
  const unique = suggestions.filter(item => {
    const key = `${item.barcode || item.name.toLocaleLowerCase()}`.toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 10)
  const body = { suggestions: unique }
  nameSearchCache.set(cacheKey, { body, expiresAt: Date.now() + 2 * 60_000 })
  if (nameSearchCache.size > 300) for (const [key, value] of nameSearchCache) if (value.expiresAt <= Date.now()) nameSearchCache.delete(key)
  return { status: 200, body }
}

export function validProductBarcode(value) {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false
  const digits = [...value].map(Number)
  const check = digits.pop()
  return (10 - digits.reverse().reduce((sum, digit, index) => sum + digit * (index % 2 ? 1 : 3), 0) % 10) % 10 === check
}

export async function lookupOpenFoodFacts(barcode, industry = 'general', requestedSource = '', searchContext = '') {
  const allowedSources = ['', 'Open Food Facts', 'Open Beauty Facts', 'Open Pet Food Facts', 'Open Products Facts', 'UPCitemdb', 'EcomSource', 'openFDA Drug NDC Directory', 'AccessGUDID medical device registry', 'NAFDAC Greenbook', 'Web search']
  const source = allowedSources.includes(requestedSource) ? requestedSource : ''
  const registration = String(searchContext || '').toUpperCase().match(/\b[A-Z]\d{1,2}-\d{4,7}[A-Z]?\b/)?.[0] || ''
  if (!validProductBarcode(barcode) && !(source === 'NAFDAC Greenbook' && registration)) return { status: 400, body: { error: 'Enter a valid product barcode, or choose NAFDAC Greenbook and enter a valid registration number.' } }
  const cacheKey = `${industry}:${barcode}:${source}:${registration}`
  const cached = responseCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.result
  const cachedCandidates = candidateCache.get(`${industry}:${barcode}`)
  if (!['NAFDAC Greenbook', 'Web search'].includes(source) && cachedCandidates && cachedCandidates.expiresAt > Date.now()) {
    const selected = source ? cachedCandidates.candidates.find(candidate => candidate.found.body.product.source === source) : cachedCandidates.candidates[0]
    return selected?.found || { status: 404, body: { status: 0, error: source ? `No exact barcode match was found in ${source}.` : 'No reliable product details were found in the available catalogues.' } }
  }
  const minuteAgo = Date.now() - 60_000
  while (recentUpstreamReads.length && recentUpstreamReads[0] <= minuteAgo) recentUpstreamReads.shift()
  // Limit uncached public lookups per process; successful results use the
  // shared server cache, so repeat clients do not make additional provider calls.
  if (recentUpstreamReads.length >= 12) return { status: 429, body: { error: 'The barcode lookup limit was reached. Wait a minute and try again.' } }
  recentUpstreamReads.push(Date.now())
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25000)
  try {
    const result = await lookupCatalogues(barcode, controller.signal, industry, source, registration)
    if (result.status === 200 || result.status === 404) {
      // Cache both matches and confirmed misses briefly. Repeated scans of an
      // uncatalogued barcode should not spend provider quota over and over.
      responseCache.set(cacheKey, { result, expiresAt: Date.now() + (result.status === 200 ? 60_000 : 5 * 60_000) })
      if (responseCache.size > 5000) for (const [key, value] of responseCache) if (value.expiresAt <= Date.now()) responseCache.delete(key)
    }
    return result
  } catch (error) {
    return { status: 503, body: { error: controller.signal.aborted ? 'Barcode lookup timed out. You can still enter the product details.' : error instanceof Error ? error.message : 'Could not reach the barcode catalogue. Check your connection and enter the product details.' } }
  } finally {
    clearTimeout(timer)
  }
}

async function getJson(url, signal) {
  const provider = new AbortController()
  const timeout = setTimeout(() => provider.abort(), 5000)
  const abortFromParent = () => provider.abort()
  signal.addEventListener('abort', abortFromParent, { once: true })
  try {
    if (new URL(url).hostname === 'world.openfoodfacts.org') {
      const minuteAgo = Date.now() - 60_000
      while (recentFoodFactsReads.length && recentFoodFactsReads[0] <= minuteAgo) recentFoodFactsReads.shift()
      // Stay below Open Food Facts' 15 product reads/minute/IP ceiling.
      if (recentFoodFactsReads.length >= 12) return { __lookupUnavailable: true }
      recentFoodFactsReads.push(Date.now())
    }
    const response = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' }, signal: provider.signal })
    if (!response.ok) return { __lookupUnavailable: response.status !== 404 }
    const body = await response.json().catch(() => null)
    return body || { __lookupUnavailable: true }
  } catch (error) {
    if (signal.aborted) throw error
    return { __lookupUnavailable: true }
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', abortFromParent)
  }
}

function providerRequestSignal(parent, timeoutMs = 5000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const abortFromParent = () => controller.abort()
  parent.addEventListener('abort', abortFromParent, { once: true })
  return {
    signal: controller.signal,
    close() { clearTimeout(timeout); parent.removeEventListener('abort', abortFromParent) },
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
  const provider = providerRequestSignal(signal)
  try {
    const response = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json', ...headers }, signal: provider.signal })
    httpStatus = response.status
    data = await response.json().catch(() => null)
  } catch (error) {
    if (signal.aborted) throw error
  } finally {
    provider.close()
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
  const provider = providerRequestSignal(signal)
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
      signal: provider.signal,
    })
    httpStatus = response.status
    data = await response.json().catch(() => null)
  } catch (error) {
    if (signal.aborted) throw error
  } finally {
    provider.close()
  }
  const records = Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : []
  const record = records.find(candidate => Array.isArray(candidate.identifiers)
    && candidate.identifiers.some(identifier => sameBarcode(String(identifier?.identifier || ''), barcode)))
  const summary = Array.isArray(record?.summary) ? record.summary[0] : record?.summary
  const title = summary?.itemName || summary?.brand || summary?.modelNumber
  const packageSize = extractPackageSize(title)
  const product = record && title ? {
    name: String(title).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
    attributes: {
      brand: summary?.brand,
      manufacturer: summary?.manufacturer,
      model: summary?.modelNumber,
      category: summary?.category,
      description: summary?.htmlDescription,
      imageUrl: Array.isArray(record.images) ? record.images[0]?.link : undefined,
      ...(packageSize ? { packageSize, quantity: packageSize } : {}),
      ...ecomPhysicalAttributes(record),
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
  const allowed = ['brand','manufacturer','quantity','description','ingredients','allergens','traces','imageUrl','activeIngredients','strength','dosageForm','route','packageSize','registrationNumber','model','deviceClass','category','weight','dimensions','features','sourceUrl']
  return Object.fromEntries(allowed.flatMap(key => {
    const value = values?.[key]
    const text = Array.isArray(value) ? value.filter(Boolean).join(', ') : String(value || '').replace(/\s+/g, ' ').trim()
    return text ? [[key, text.slice(0, 2000)]] : []
  }))
}

function ecomPhysicalAttributes(record) {
  const dimensions = Array.isArray(record?.dimensions) ? record.dimensions : []
  const dimensionText = dimensions.map(item => {
    const parts = [
      item?.height != null ? `height ${item.height}` : '',
      item?.width != null ? `width ${item.width}` : '',
      item?.length != null ? `length ${item.length}` : '',
    ].filter(Boolean)
    return parts.length ? `${item?.type ? `${item.type}: ` : ''}${parts.join(', ')} (unit not supplied)` : ''
  }).filter(Boolean).join('; ')
  const weights = dimensions.filter(item => item?.weight != null).map(item => `${item.type ? `${item.type}: ` : ''}${item.weight} (unit not supplied)`)
  const bulletPoints = record?.attributes?.bulletPoint
  const features = Array.isArray(bulletPoints) ? bulletPoints.map(item => item?.value).filter(value => typeof value === 'string' && value.trim()).join('; ') : ''
  return {
    ...(dimensionText ? { dimensions: dimensionText } : {}),
    ...(weights.length ? { weight: weights.join('; ') } : {}),
    ...(features ? { features } : {}),
  }
}

function extractPackageSize(title) {
  const matches = String(title || '').match(/\b\d+(?:[.,]\d+)?\s*(?:x|×)\s*\d+(?:[.,]\d+)?\s*(?:kg|g|mg|µg|mcg|lb|lbs|oz|l|litres?|liters?|ml|cl)\b|\b\d+(?:[.,]\d+)?\s*(?:kg|g|mg|µg|mcg|lb|lbs|oz|litres?|liters?|ml|cl|l)\b|\b(?:pack|case|box|set)\s+of\s+\d+\b/gi) || []
  return [...new Set(matches.map(value => value.replace(/\s+/g, ' ').trim()))].join(', ')
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
        : ['product', 'beauty', 'food', 'petfood']
  const index = preference.indexOf(typeName.replace('open ', '').replace(' facts', '').replace(' facts', ''))
  return index < 0 ? 5 : index
}

function providerProductType(attributes, name) {
  const category = String(attributes?.category || '').toLowerCase()
  if (/beauty|personal care|cosmetic|oral care|skin care|skincare/.test(category)) return 'beauty'
  if (/food|grocery|beverage|noodle|snack|drink|juice|milk|cereal|confectionery/.test(category)) return 'food'
  if (/pet food|petcare|pet care/.test(category)) return 'petfood'
  if (/electronics|device|medical equipment/.test(category)) return 'product'
  const text = String(name || '').toLowerCase()
  if (/beauty|personal care|cosmetic|toothpaste|tooth.?paste|oral care|soap|shampoo|cream|lotion|deodorant|skin care|skincare/.test(text)) return 'beauty'
  if (/food|grocery|beverage|noodle|snack|drink|juice|milk|cereal|confectionery/.test(text)) return 'food'
  if (/pet food|petcare|pet care/.test(text)) return 'petfood'
  return ''
}

async function lookupCatalogues(barcode, signal, industry = 'general', requestedSource = '', searchContext = '') {
  const candidateKey = `${industry}:${barcode}`
  const cachedCandidates = candidateCache.get(candidateKey)
  if (requestedSource === 'NAFDAC Greenbook') {
    const result = await lookupNafdacGreenbook(barcode, searchContext, signal)
    if (result) return result
    const webResult = await lookupBarcodeOnWeb(barcode, signal, searchContext)
    if (webResult.product) return suggestion(barcode, webResult.product.name, 'Web search', webResult.product.attributes)
    if (webResult.errorStatus) return { status: 503, body: { error: `Brave Search returned HTTP ${webResult.errorStatus}. Check the API credential, billing status, or rate limit.` } }
    return { status: 404, body: { status: 0, error: searchContext ? `No product details were found for ${searchContext} in the NAFDAC Greenbook${webResult.configured ? ' or exact web results' : ''}.` : 'Enter the NAFDAC registration number printed on the package to search the Greenbook.' } }
  }
  if (requestedSource === 'Web search') {
    const result = await lookupBarcodeOnWeb(barcode, signal, searchContext)
    if (result.registration) {
      const registered = await lookupNafdacGreenbook(barcode, result.registration, signal)
      if (registered) return registered
    }
    if (result.product) return suggestion(barcode, result.product.name, 'Web search', result.product.attributes)
    if (!result.configured) return { status: 503, body: { error: 'Web search is not configured. Add BRAVE_SEARCH_API_KEY to the API service to enable it.' } }
    if (!result.responded) return { status: 503, body: { error: result.errorStatus ? `Brave Search returned HTTP ${result.errorStatus}. Check the API credential, billing status, or rate limit.` : 'Brave web search is temporarily unavailable. Try again later.' } }
    return { status: 404, body: { status: 0, error: `No exact product match was found on the web for ${barcode}.` } }
  }
  if (cachedCandidates && cachedCandidates.expiresAt > Date.now()) {
    const selected = requestedSource ? cachedCandidates.candidates.find(candidate => candidate.found.body.product.source === requestedSource) : cachedCandidates.candidates[0]
    return selected?.found || (requestedSource ? { status: 404, body: { status: 0, error: `No exact barcode match was found in ${requestedSource}.` } } : { status: 404, body: { status: 0, error: 'No reliable product details were found in the available catalogues.' } })
  }
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

  // The universal product_type=all request already covers Open Food Facts and
  // redirects across the four product databases. Do not request the food
  // database a second time; query the other databases to catch category clashes.
  const catalogs = [
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
    if (found) candidates.push({ found, rank: catalogueRank(industry, providerProductType(ecomProduct.attributes, ecomProduct.name)), richness: Object.keys(found.body.product.attributes).length })
  }
  if (broadProduct) {
    const found = suggestion(barcode, broadProduct.name, 'UPCitemdb', broadProduct.attributes)
    if (found) candidates.push({ found, rank: catalogueRank(industry, providerProductType(broadProduct.attributes, broadProduct.name)), richness: Object.keys(found.body.product.attributes).length })
  }
  if (universalProduct) {
    // The universal endpoint is hosted by Open Food Facts. Older or sparse
    // records may omit product_type; keep them selectable as Open Food Facts
    // instead of assigning a source label that the UI cannot select.
    const productType = String(universalProduct.product_type || '').toLowerCase()
    const found = catalogueSuggestion(universalProduct, barcode, sourceByType[productType] || 'Open Food Facts')
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
    candidateCache.set(candidateKey, { candidates, expiresAt: Date.now() + 60_000 })
    const selected = requestedSource ? candidates.find(candidate => candidate.found.body.product.source === requestedSource) : candidates[0]
    if (selected) return selected.found
    if (requestedSource) return { status: 404, body: { status: 0, error: `No exact barcode match was found in ${requestedSource}.` } }
    return candidates[0].found
  }
  if (searchContext) {
    try {
      const nafdac = await lookupNafdacGreenbook(barcode, searchContext, signal)
      if (nafdac) return nafdac
    } catch (error) { if (signal.aborted) throw error }
  }
  const webResult = await lookupBarcodeOnWeb(barcode, signal, searchContext)
  if (webResult.registration) {
    const registered = await lookupNafdacGreenbook(barcode, webResult.registration, signal)
    if (registered) return registered
  }
  if (webResult.product) return suggestion(barcode, webResult.product.name, 'Web search', webResult.product.attributes)
  if (webResult.errorStatus) return { status: 503, body: { error: `Brave Search returned HTTP ${webResult.errorStatus}. Check the API credential, billing status, or rate limit.` } }
  providerResponded ||= webResult.responded
  return !providerResponded
    ? { status: 503, body: { error: 'Product catalogues are temporarily unreachable. The barcode is saved in the product form, and you can still enter the product details.' } }
    : { status: 404, body: { status: 0, error: 'No reliable product details were found in the available catalogues. The barcode is still valid; enter or photograph the product details.' } }
}

async function lookupNafdacGreenbook(barcode, registration, signal) {
  if (!registration) return null
  const params = new URLSearchParams({
    draw: '1', start: '0', length: '1000', 'search[value]': registration, 'search[regex]': 'false',
  })
  const endpoint = `https://greenbook.nafdac.gov.ng/?${params}`
  const minuteAgo = Date.now() - 60_000
  while (recentNafdacReads.length && recentNafdacReads[0] <= minuteAgo) recentNafdacReads.shift()
  if (recentNafdacReads.length >= 6) throw new Error('NAFDAC Greenbook lookup limit reached. Wait a minute and try again.')
  recentNafdacReads.push(Date.now())
  const request = providerRequestSignal(signal, 5000)
  try {
    const response = await fetch(endpoint, { headers: { 'User-Agent': userAgent, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' }, signal: request.signal })
    if (!response.ok) throw new Error(`NAFDAC Greenbook returned HTTP ${response.status}.`)
    const payload = await response.json().catch(() => null)
    if (!Array.isArray(payload?.data)) throw new Error('NAFDAC Greenbook returned an unexpected response. Its search service may have changed.')
    const rows = payload.data
    const normalize = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    const wanted = normalize(registration)
    const field = (row, names) => {
      for (const name of names) {
        const key = Object.keys(row || {}).find(candidate => candidate.toLowerCase() === name.toLowerCase())
        if (key && row[key] != null) return row[key]
      }
      return undefined
    }
    const record = rows.find(row => normalize(field(row, ['NRN', 'registrationNumber', 'registration_number', 'registrationNo', 'registration_no'])) === wanted)
    if (!record) return null
    const productName = String(field(record, ['productName', 'product_name', 'product', 'name']) || '').trim()
    if (!productName) return null
    const pick = (...values) => values.map(value => Array.isArray(value) ? value.filter(Boolean).join(', ') : typeof value === 'object' && value ? value.name || '' : String(value || '')).map(value => value.trim()).find(Boolean) || undefined
    const applicant = field(record, ['applicantName', 'applicant_name', 'applicant', 'manufacturer'])
    const detailId = field(record, ['id', 'productId', 'product_id'])
    const detailUrl = detailId ? `https://greenbook.nafdac.gov.ng/products/details/${encodeURIComponent(detailId)}` : 'https://greenbook.nafdac.gov.ng/'
    return suggestion(barcode, productName, 'NAFDAC Greenbook', {
      category: pick(field(record, ['productCategory', 'product_category', 'category'])),
      activeIngredients: pick(field(record, ['activeIngredients', 'active_ingredients', 'ingredients'])),
      manufacturer: pick(applicant),
      dosageForm: pick(field(record, ['form', 'dosageForm', 'dosage_form'])),
      strength: pick(field(record, ['strengths', 'strength'])),
      registrationNumber: registration,
      description: pick(field(record, ['status']) && `Registration status: ${field(record, ['status'])}`, field(record, ['approvalDate', 'approval_date', 'approvedAt']) && `Approved: ${field(record, ['approvalDate', 'approval_date', 'approvedAt'])}`),
      sourceUrl: detailUrl,
    })
  } catch (error) {
    if (signal.aborted) throw new Error('NAFDAC Greenbook lookup was cancelled.')
    if (error instanceof Error && (error.message.startsWith('NAFDAC Greenbook returned') || error.message.startsWith('NAFDAC Greenbook lookup limit'))) throw error
    throw new Error('Could not reach the NAFDAC Greenbook search service.')
  } finally { request.close() }
}

async function lookupBarcodeOnWeb(barcode, signal, searchContext = '') {
  const key = process.env.BRAVE_SEARCH_API_KEY?.trim()
  if (!key) return { configured: false, product: null, registration: '', responded: false }
  const cacheKey = `${barcode}:${searchContext}`
  const cached = webSearchCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached
  const minuteAgo = Date.now() - 60_000
  while (recentWebSearchReads.length && recentWebSearchReads[0] <= minuteAgo) recentWebSearchReads.shift()
  if (recentWebSearchReads.length >= 10) return { configured: true, product: null, registration: '', responded: false, errorStatus: 429 }
  recentWebSearchReads.push(Date.now())
  const request = providerRequestSignal(signal, 7000)
  try {
    const runSearch = async query => {
      const endpoint = new URL('https://api.search.brave.com/res/v1/web/search')
      endpoint.searchParams.set('q', `"${query}"`)
      endpoint.searchParams.set('country', 'NG')
      endpoint.searchParams.set('search_lang', 'en')
      endpoint.searchParams.set('count', '8')
      endpoint.searchParams.set('extra_snippets', 'true')
      const response = await fetch(endpoint, { headers: { 'X-Subscription-Token': key, Accept: 'application/json' }, signal: request.signal })
      if (!response.ok) return { ok: false, errorStatus: response.status, rows: [] }
      const data = await response.json().catch(() => null)
      return { ok: true, rows: Array.isArray(data?.web?.results) ? data.web.results : [] }
    }
    let ok = false
    let rows = []
    let errorStatus
    if (barcode) {
      const first = await runSearch(barcode)
      ok = first.ok; rows = first.rows; errorStatus = first.errorStatus
    }
    let exact = barcode ? rows.find(row => `${row.title || ''} ${row.description || ''} ${(row.extra_snippets || []).join(' ')} ${row.url || ''}`.replace(/\D/g, '').includes(barcode)) : undefined
    let registration = ''
    const resultText = row => `${row.title || ''} ${row.description || ''} ${(row.extra_snippets || []).join(' ')} ${row.url || ''}`
    const regPattern = /\b[A-Z]\d{1,2}-\d{4,7}[A-Z]?\b/i
    if (exact) registration = resultText(exact).match(regPattern)?.[0]?.toUpperCase() || ''
    if (!exact && searchContext) {
      const contextual = await runSearch(searchContext)
      ok ||= contextual.ok
      errorStatus = errorStatus || contextual.errorStatus
      rows = contextual.rows
      exact = rows.find(row => resultText(row).toUpperCase().replace(/[^A-Z0-9]/g, '').includes(searchContext.toUpperCase().replace(/[^A-Z0-9]/g, '')))
      registration = exact ? searchContext : ''
    }
    if (!ok) return { configured: true, product: null, registration: '', responded: false, errorStatus }
    let product = null
    if (exact) {
      const title = String(exact.title || '').split(/\s+[|–—]\s+/)[0].trim()
      let hostname = ''
      try { hostname = new URL(exact.url).hostname.replace(/^www\./, '') } catch { /* Ignore an invalid result URL. */ }
      const description = String([exact.description, ...(exact.extra_snippets || [])].filter(Boolean).join(' ')).replace(/\s+/g, ' ').slice(0, 1800)
      if (title && !/^\d{8,14}$/.test(title)) product = { name: title.slice(0, 180), attributes: { ...(description ? { description } : {}), ...(hostname ? { manufacturer: hostname } : {}), ...(typeof exact.url === 'string' && /^https:\/\//.test(exact.url) ? { sourceUrl: exact.url } : {}) } }
    }
    const result = { configured: true, product, registration, responded: true, errorStatus, expiresAt: Date.now() + (product ? 24 * 60 * 60_000 : 60 * 60_000) }
    webSearchCache.set(cacheKey, result)
    return result
  } catch {
    if (signal.aborted) throw new Error('Brave web search was cancelled.')
    return { configured: true, product: null, registration: '', responded: false }
  } finally { request.close() }
}
