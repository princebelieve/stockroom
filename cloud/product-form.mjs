import { ObjectId } from 'mongodb'
import { extractProductForm } from './product-form-layout.mjs'
export { extractProductForm } from './product-form-layout.mjs'
const fail = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode })

export function validateFormImage(input) {
  const match = typeof input?.image === 'string' && input.image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/)
  if (!match || match[2].length > 4_000_000) throw fail('Choose a JPG, PNG or WebP photo smaller than 3 MB.', 400)
  const bytes = Buffer.from(match[2], 'base64')
  const valid = match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  if (!valid) throw fail('The uploaded file is not a supported image.', 400)
  return match[2]
}

export async function createProductFormReader({ database, accounts, verifyToken, readJson, send, fetchImpl = fetch, env = process.env }) {
  const usage = database.collection('product_form_ocr_usage')
  await usage.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  return async function handle(request, response) {
    if (!['/v1/product-forms/status', '/v1/product-forms/read'].includes(request.url)) return false
    response.setHeader('Cache-Control', 'no-store')
    try {
      const claims = verifyToken(request)
      if (claims?.kind !== 'access' || !ObjectId.isValid(claims.sub)) throw fail('Sign in with your cloud owner account to read handwritten forms.', 401)
      const account = await accounts.findOne({ _id: new ObjectId(claims.sub), businessId: claims.businessId })
      if (!account || account.role !== 'owner') throw fail('Only the business owner can read handwritten product forms.', 403)
      if (request.method === 'GET' && request.url.endsWith('/status')) { send(response, 200, { configured: Boolean(env.GOOGLE_CLOUD_VISION_API_KEY) }); return true }
      if (request.method !== 'POST' || !request.url.endsWith('/read')) throw fail('Method not allowed.', 405)
      if (!env.GOOGLE_CLOUD_VISION_API_KEY) throw fail('Handwriting recognition is not configured yet. The app administrator must enable Google Cloud Vision on the server.', 503)
      const input = await readJson(request, 4_100_000)
      const content = validateFormImage(input)
      for (const [period, limit] of [[60000, 4], [86400000, 60]]) {
        const bucket = Math.floor(Date.now() / period)
        const count = await usage.findOneAndUpdate({ _id: `${claims.businessId}:${period}:${bucket}` }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 2) * period) } }, { upsert: true, returnDocument: 'after' })
        if (count.count > limit) throw fail(period === 60000 ? 'Too many form uploads. Wait a minute and try again.' : 'This business has reached its daily limit of 60 form readings.', 429)
      }
      let upstream
      try {
        upstream = await fetchImpl('https://vision.googleapis.com/v1/images:annotate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_CLOUD_VISION_API_KEY },
          body: JSON.stringify({ requests: [{ image: { content }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }] }), signal: AbortSignal.timeout(45000) })
      } catch { throw fail('The handwriting service could not be reached. Your form has not been saved as a product.', 503) }
      if (!upstream.ok) throw fail('The handwriting service is unavailable. Ask the app administrator to check its configuration and quota.', 503)
      const data = await upstream.json()
      if (data.responses?.[0]?.error) throw fail('The handwriting service could not read this image. Try a clearer photo.')
      send(response, 200, extractProductForm(data.responses?.[0]?.fullTextAnnotation))
    } catch (error) { send(response, error.statusCode || 503, { error: error.statusCode ? error.message : 'Could not read the form. Try again later.' }) }
    return true
  }
}
