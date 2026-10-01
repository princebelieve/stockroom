import test from 'node:test'
import assert from 'node:assert/strict'
import { extractProductForm, validateFormImage, createProductFormReader } from '../cloud/product-form.mjs'

const word = (text, x, y, confidence = .99) => ({ confidence, symbols: [...text].map(text => ({ text })), boundingBox: { vertices: [{ x, y }, { x: x + 60, y }, { x: x + 60, y: y + 15 }, { x, y: y + 15 }] } })
function form(values = ['Orange Juice', '001234567890', 'JUICE-01', 'Drinks', 'bottle', '12', '5', '1,250.50', '1,500']) {
  const words = []
  for (let i = 0; i < 10; i++) {
    words.push(word(`F${String(i + 1).padStart(2, '0')}`, 50, 100 + i * 100))
    if (i < 9) { words.push(word('Printed hint must not become an answer', 140, 100 + i * 100)); if (values[i]) words.push(word(values[i], 70, 155 + i * 100)) }
  }
  return { pages: [{ blocks: [{ paragraphs: [{ words }] }] }] }
}

test('maps nine marked handwriting areas and excludes the printed headings and hints', () => {
  const { fields } = extractProductForm(form())
  assert.equal(fields.name.value, 'Orange Juice')
  assert.equal(fields.barcode.value, '001234567890')
  assert.equal(fields.sku.value, 'JUICE-01')
  assert.equal(fields.cost.value, 1250.5)
  assert.equal(fields.price.value, 1500)
  assert.equal(fields.stock.value, 12)
})
test('blank paper, low confidence and ambiguous decimal amounts stay empty', () => {
  const input = form(Array(9).fill(''))
  assert.ok(Object.values(extractProductForm(input).fields).every(field => field.value === null && field.state === 'blank'))
  const uncertain = form(); uncertain.pages[0].blocks[0].paragraphs[0].words.find(word => word.symbols.map(s => s.text).join('') === 'Orange Juice').confidence = .5
  assert.equal(extractProductForm(uncertain).fields.name.state, 'uncertain')
  const values = ['', '', '', '', '', '0', '', '12,50', '-10']
  const result = extractProductForm(form(values)).fields
  assert.equal(result.stock.value, 0)
  assert.equal(result.cost.value, null)
  assert.equal(result.price.value, null)
})
test('marker-only O and I confusion is tolerated without changing product text', () => {
  const annotation = form()
  const words = annotation.pages[0].blocks[0].paragraphs[0].words
  words[0].symbols = [...'FOI'].map(text => ({ text }))
  assert.equal(extractProductForm(annotation).fields.name.value, 'Orange Juice')
})
test('missing, duplicate, rotated and badly aligned markers reject the form', () => {
  const missing = form(); missing.pages[0].blocks[0].paragraphs[0].words.shift()
  assert.throws(() => extractProductForm(missing), /markers/)
  const duplicate = form(); duplicate.pages[0].blocks[0].paragraphs[0].words.push(word('F01', 50, 100))
  assert.throws(() => extractProductForm(duplicate), /markers/)
  const rotated = form(); rotated.pages[0].blocks[0].paragraphs[0].words[0].boundingBox.vertices[1].y += 30
  assert.throws(() => extractProductForm(rotated), /tilted/)
  assert.throws(() => extractProductForm({ pages: [form().pages[0], form().pages[0]] }), /one complete/)
})
test('image validation rejects URLs, mismatched signatures and oversize uploads', () => {
  assert.throws(() => validateFormImage({ image: 'https://example.com/photo.jpg' }), /Choose/)
  assert.throws(() => validateFormImage({ image: 'data:image/png;base64,YWJjZA==' }), /supported image/)
  assert.throws(() => validateFormImage({ image: 'data:image/jpeg;base64,' + 'A'.repeat(4_000_001) }), /Choose/)
})

async function harness({ role = 'owner', configured = true, claims = { kind: 'access', sub: '111111111111111111111111', businessId: 'business' }, count = 1, providerStatus = 200 } = {}) {
  let calls = 0; let payload; let status
  const handler = await createProductFormReader({ database: { collection: () => ({ createIndex: async () => {}, findOneAndUpdate: async () => ({ count }) }) },
    accounts: { findOne: async () => ({ role }) }, verifyToken: () => claims,
    readJson: async () => ({ image: 'data:image/jpeg;base64,/9j/AA==' }),
    send: (_response, code, body) => { status = code; payload = body }, env: configured ? { GOOGLE_CLOUD_VISION_API_KEY: 'test-secret' } : {},
    fetchImpl: async (url, init) => { calls++; assert.equal(url, 'https://vision.googleapis.com/v1/images:annotate'); assert.equal(init.headers['X-Goog-Api-Key'], 'test-secret'); assert.equal(JSON.parse(init.body).requests[0].features[0].type, 'DOCUMENT_TEXT_DETECTION'); return { ok: providerStatus === 200, json: async () => ({ responses: [{ fullTextAnnotation: form() }] }) } } })
  return { run: async (method, url) => { await handler({ method, url }, { setHeader() {} }); return { status, payload, calls } } }
}
test('configured owner request reaches Vision and returns only extracted fields', async () => {
  const result = await (await harness()).run('POST', '/v1/product-forms/read')
  assert.equal(result.status, 200); assert.equal(result.calls, 1)
  assert.equal(result.payload.fields.sku.value, 'JUICE-01')
  assert.equal(JSON.stringify(result.payload).includes('test-secret'), false)
})
test('unconfigured, unauthenticated, staff and over-quota requests never call Vision', async () => {
  for (const [options, status] of [[{ configured: false }, 503], [{ claims: null }, 401], [{ role: 'cashier' }, 403], [{ count: 61 }, 429]]) {
    const result = await (await harness(options)).run('POST', '/v1/product-forms/read')
    assert.equal(result.status, status); assert.equal(result.calls, 0)
  }
  const status = await (await harness({ configured: false })).run('GET', '/v1/product-forms/status')
  assert.equal(status.payload.configured, false)
})
test('provider errors do not leak credentials or raw service responses', async () => {
  const result = await (await harness({ providerStatus: 403 })).run('POST', '/v1/product-forms/read')
  assert.equal(result.status, 503)
  assert.equal(JSON.stringify(result.payload).includes('test-secret'), false)
})
