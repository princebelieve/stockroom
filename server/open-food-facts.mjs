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
    const response = await fetch(`https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}?product_type=all&fields=code,product_name,brands,quantity`, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: controller.signal,
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) return { status: 502, body: { error: response.status === 429 ? 'The barcode catalogue is busy. Wait a minute and try again.' : 'The barcode catalogue is temporarily unavailable.' } }
    const result = { status: 200, body }
    responseCache.set(barcode, { result, expiresAt: Date.now() + 6 * 60 * 60 * 1000 })
    if (responseCache.size > 5000) for (const [key, value] of responseCache) if (value.expiresAt <= Date.now()) responseCache.delete(key)
    return result
  } catch {
    return { status: 503, body: { error: controller.signal.aborted ? 'Barcode lookup timed out. You can still enter the product details.' : 'Could not reach the barcode catalogue. Check your connection and enter the product details.' } }
  } finally {
    clearTimeout(timer)
  }
}
