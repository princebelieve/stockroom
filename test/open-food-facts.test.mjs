import test from 'node:test'
import assert from 'node:assert/strict'
import { lookupOpenFoodFacts } from '../server/open-food-facts.mjs'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function withCatalogueResponses(respond, run) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => respond(String(input))
  try { await run() } finally { globalThis.fetch = originalFetch }
}

test('accepts the live Open Food Facts success status and verifies the exact barcode', async () => {
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
  const barcode = '8001090583420'
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
