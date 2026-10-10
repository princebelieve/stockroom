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
    assert.deepEqual(result.body.product, { code: barcode, product_name: 'Acme Juice 500 ml', source: 'Open Food Facts', details: '500 ml' })
  })
})

test('normalizes an Open Products Facts suggestion into the shared product draft contract', async () => {
  const barcode = '3017620422003'
  await withCatalogueResponses(url => url.includes('/api/v3/product/')
    ? json({ status: 'success', product: { code: barcode, product_name: 'Phone case', brands: 'Acme', product_type: 'product' } })
    : json({}, 404), async () => {
    const result = await lookupOpenFoodFacts(barcode)
    assert.deepEqual(result.body.product, { code: barcode, product_name: 'Acme Phone case', source: 'Open Products Facts', details: '' })
  })
})

test('does not prefill a sparse catalogue record that only provides a possibly misleading name', async () => {
  const barcode = '0123456789012'
  await withCatalogueResponses(url => url.includes('/api/v3/product/')
    ? json({ status: 'success', product: { code: barcode, product_name: 'closeup', product_type: 'food' } })
    : json({}, 404), async () => {
    const result = await lookupOpenFoodFacts(barcode)
    assert.equal(result.status, 404)
    assert.match(result.body.error, /barcode is still valid/i)
  })
})

test('normalizes openFDA drug results for non-food barcode suggestions', async () => {
  const barcode = '8001090583420'
  await withCatalogueResponses(url => {
    if (url.includes('/api/v3/product/')) return json({ status: 0 })
    if (url.includes('api.fda.gov/drug/ndc.json')) return json({ results: [{ brand_name: 'Example OTC', generic_name: 'Example medicine', dosage_form: 'tablet', product_ndc: '12345-678' }] })
    return json({}, 404)
  }, async () => {
    const result = await lookupOpenFoodFacts(barcode)
    assert.deepEqual(result.body.product, { code: barcode, product_name: 'Example OTC Example medicine tablet', source: 'openFDA Drug NDC Directory', details: '12345-678' })
  })
})

test('normalizes AccessGUDID device records for non-food barcode suggestions', async () => {
  const barcode = '5901234123457'
  await withCatalogueResponses(url => {
    if (url.includes('/api/v3/product/')) return json({ status: 0 })
    if (url.includes('api.fda.gov/drug/ndc.json')) return json({}, 404)
    if (url.includes('accessgudid.nlm.nih.gov')) return json({ gudid: { device: { brandName: 'Example Monitor', deviceDescription: 'Patient monitor', companyName: 'Acme Medical' } } })
    return json({}, 404)
  }, async () => {
    const result = await lookupOpenFoodFacts(barcode)
    assert.deepEqual(result.body.product, { code: barcode, product_name: 'Example Monitor Patient monitor', source: 'AccessGUDID medical device registry', details: 'Acme Medical' })
  })
})
