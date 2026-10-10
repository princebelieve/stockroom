import test from 'node:test'
import assert from 'node:assert/strict'
import { lookupOpenFoodFacts } from '../server/open-food-facts.mjs'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function withCatalogueResponses(respond, run) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => respond(String(input), init)
  try { await run() } finally { globalThis.fetch = originalFetch }
}

test('uses an exact EcomSource record ahead of conflicting catalogue results', async () => {
  const barcode = '8001090583420'
  const previousAccessKey = process.env.ECOMSOURCE_ACCESS_KEY
  const previousSecretKey = process.env.ECOMSOURCE_SECRET_KEY
  process.env.ECOMSOURCE_ACCESS_KEY = 'test-access-key'
  process.env.ECOMSOURCE_SECRET_KEY = 'test-secret-key'
  await withCatalogueResponses((url, init) => {
    if (url === 'https://api.ecomsource.ai/api/v1/search/product') {
      assert.equal(init.method, 'POST')
      assert.equal(init.headers['X-Access-Key'], 'test-access-key')
      assert.equal(init.headers['X-Secret-Key'], 'test-secret-key')
      assert.deepEqual(JSON.parse(init.body), { identifier: barcode, identifierType: 'ean', refresh: false })
      return json({ success: true, data: [{ identifiers: [{ type: 'ean', identifier: barcode }], summary: [{ itemName: 'Oral-B Strong Teeth Toothpaste 130g', brand: 'Oral-B', manufacturer: 'Procter & Gamble', category: 'Health & Beauty' }], images: [{ link: 'https://images.example/oralb.jpg' }] }] })
    }
    if (url.startsWith('https://api.upcitemdb.com/')) return json({ code: 'OK', total: 1, items: [{ ean: barcode, title: 'Wrong provider title', brand: 'Other' }] })
    if (url.includes('world.openfoodfacts.org') && url.includes('product_type=all')) return json({ status: 'success', product: { code: barcode, product_name: 'Unrelated food label', brands: 'Unrelated brand', product_type: 'food' } })
    return json({}, 404)
  }, async () => {
    try {
      const result = await lookupOpenFoodFacts(barcode, 'general')
      assert.equal(result.status, 200)
      assert.equal(result.body.product.product_name, 'Oral-B Strong Teeth Toothpaste 130g')
      assert.equal(result.body.product.source, 'EcomSource')
      assert.equal(result.body.product.attributes.brand, 'Oral-B')
      assert.equal(result.body.product.attributes.manufacturer, 'Procter & Gamble')
      assert.equal(result.body.product.attributes.category, 'Health & Beauty')
      assert.equal(result.body.product.attributes.imageUrl, 'https://images.example/oralb.jpg')
    } finally {
      if (previousAccessKey === undefined) delete process.env.ECOMSOURCE_ACCESS_KEY
      else process.env.ECOMSOURCE_ACCESS_KEY = previousAccessKey
      if (previousSecretKey === undefined) delete process.env.ECOMSOURCE_SECRET_KEY
      else process.env.ECOMSOURCE_SECRET_KEY = previousSecretKey
    }
  })
})

test('parses the Open Food Facts v3 success status and verifies the exact barcode', async () => {
  const barcode = '4006381333931'
  await withCatalogueResponses(url => url.includes('/api/v3/product/')
    ? json({ status: 'success', product: { code: barcode, product_name: 'Juice', brands: 'Acme', quantity: '500 ml', product_type: 'food' } })
    : json({}, 404), async () => {
    const result = await lookupOpenFoodFacts(barcode)
    assert.equal(result.status, 200)
    assert.deepEqual(result.body.product, { code: barcode, product_name: 'Juice', source: 'Open Food Facts', attributes: { brand: 'Acme', quantity: '500 ml', packageSize: '500 ml' } })
  })
})

test('normalizes an Open Products Facts suggestion into the shared product draft contract', async () => {
  const barcode = '3017620422003'
  await withCatalogueResponses(url => url.includes('/api/v3/product/')
    ? json({ status: 'success', product: { code: barcode, product_name: 'Phone case', brands: 'Acme', product_type: 'product' } })
    : json({}, 404), async () => {
    const result = await lookupOpenFoodFacts(barcode)
    assert.deepEqual(result.body.product, { code: barcode, product_name: 'Phone case', source: 'Open Products Facts', attributes: { brand: 'Acme' } })
  })
})

test('prefills a sparse catalogue name so the owner can edit it during upload', async () => {
  const barcode = '0123456789012'
  await withCatalogueResponses(url => url.includes('/api/v3/product/')
    ? json({ status: 'success', product: { code: barcode, product_name: 'closeup', product_type: 'food' } })
    : json({}, 404), async () => {
    const result = await lookupOpenFoodFacts(barcode)
    assert.equal(result.status, 200)
    assert.deepEqual(result.body.product, { code: barcode, product_name: 'closeup', source: 'Open Food Facts', attributes: {} })
  })
})

test('uses a catalogue brand when a valid exact-barcode record has no product name', async () => {
  const barcode = '6291003667367'
  await withCatalogueResponses(url => url.includes('/api/v3/product/')
    ? json({ status: 'success', product: { code: barcode, brands: 'Oral-B', product_type: 'beauty' } })
    : json({}, 404), async () => {
    const result = await lookupOpenFoodFacts(barcode, 'general')
    assert.equal(result.status, 200)
    assert.equal(result.body.product.product_name, 'Oral-B')
    assert.equal(result.body.product.attributes.brand, 'Oral-B')
  })
})

test('accepts Open Food Facts success_with_warnings when it normalizes the Indomie UPC with a leading zero', async () => {
  const scannedBarcode = '089686130010'
  await withCatalogueResponses(url => url.includes('/api/v3/product/')
    ? json({
      code: '0089686130010', status: 'success_with_warnings',
      warnings: [{ message: 'different_normalized_product_code' }],
      product: { code: '0089686130010', product_name: 'Instant Noodles Chicken', brands: 'indomie', quantity: '40 x 70 g', product_type: 'food' },
    })
    : json({}, 404), async () => {
    const result = await lookupOpenFoodFacts(scannedBarcode, 'general')
    assert.equal(result.status, 200)
    assert.deepEqual(result.body.product, {
      code: scannedBarcode,
      product_name: 'Instant Noodles Chicken',
      source: 'Open Food Facts',
      attributes: { brand: 'indomie', quantity: '40 x 70 g', packageSize: '40 x 70 g' },
    })
  })
})

test('normalizes openFDA drug results for non-food barcode suggestions', async () => {
  const barcode = '4006381333931'
  await withCatalogueResponses(url => {
    if (url.includes('/api/v3/product/')) return json({ status: 0 })
    if (url.includes('api.fda.gov/drug/ndc.json')) return json({ results: [{ brand_name: 'Example OTC', generic_name: 'Example medicine', dosage_form: 'tablet', route: ['ORAL'], labeler_name: 'Acme Labs', product_ndc: '12345-678', active_ingredients: [{ name: 'Example medicine', strength: '10 mg' }], packaging: [{ description: '100 tablets' }] }] })
    return json({}, 404)
  }, async () => {
    const result = await lookupOpenFoodFacts(barcode, 'pharmacy')
    assert.deepEqual(result.body.product, { code: barcode, product_name: 'Example OTC Example medicine tablet', source: 'openFDA Drug NDC Directory', attributes: { brand: 'Example OTC', manufacturer: 'Acme Labs', activeIngredients: 'Example medicine 10 mg', strength: '10 mg', dosageForm: 'tablet', route: 'ORAL', packageSize: '100 tablets', registrationNumber: '12345-678' } })
  })
})

test('industry preference chooses a category-specific catalogue record over a conflicting universal record', async () => {
  const barcode = '123456789012'
  await withCatalogueResponses(url => {
    if (url.includes('world.openfoodfacts.org') && url.includes('product_type=all')) return json({ status: 'success', product: { code: barcode, product_name: 'Closeup', brands: 'Closeup', product_type: 'food' } })
    if (url.includes('world.openfoodfacts.org')) return json({ status: 0 })
    if (url.includes('world.openbeautyfacts.org')) return json({ status: 'success', product: { code: barcode, product_name: 'Strong Teeth Toothpaste', brands: 'Oral-B', quantity: '130 g', product_type: 'beauty' } })
    return json({}, 404)
  }, async () => {
    const result = await lookupOpenFoodFacts(barcode, 'pharmacy')
    assert.equal(result.status, 200)
    assert.equal(result.body.product.product_name, 'Strong Teeth Toothpaste')
    assert.equal(result.body.product.source, 'Open Beauty Facts')
    assert.equal(result.body.product.attributes.brand, 'Oral-B')
  })
})

test('normalizes AccessGUDID device records for non-food barcode suggestions', async () => {
  const barcode = '5901234123457'
  await withCatalogueResponses(url => {
    if (url.includes('/api/v3/product/')) return json({ status: 0 })
    if (url.includes('api.fda.gov/drug/ndc.json')) return json({}, 404)
    if (url.includes('accessgudid.nlm.nih.gov')) return json({ gudid: { device: { brandName: 'Example Monitor', versionModelNumber: 'Model 1', deviceDescription: 'Patient monitor', companyName: 'Acme Medical' } } })
    return json({}, 404)
  }, async () => {
    const result = await lookupOpenFoodFacts(barcode)
    assert.deepEqual(result.body.product, { code: barcode, product_name: 'Example Monitor Patient monitor', source: 'AccessGUDID medical device registry', attributes: { brand: 'Example Monitor', manufacturer: 'Acme Medical', model: 'Model 1', description: 'Patient monitor' } })
  })
})
