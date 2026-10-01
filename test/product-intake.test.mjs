import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const source = await readFile(new URL('../src/lib/productIntake.ts', import.meta.url), 'utf8')
const { labelSuggestion, documentSuggestions, validGtin, draftProblem, lookupFoodBarcode } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)

test('package text suggests a name and size without inventing commercial values', () => {
  const draft = labelSuggestion('ACME\nOrange Juice\n500 ml\nIngredients: oranges\n4006381333931')
  assert.equal(draft.name, 'ACME Orange Juice 500 ml')
  assert.equal(draft.barcode, '4006381333931')
  assert.equal(draft.price, undefined)
  assert.equal(draft.stock, undefined)
  assert.equal(draft.cost, undefined)
  assert.equal(labelSuggestion('Ingredients: milk\nNutrition facts\n500 ml').name, '')
})

test('barcode detection rejects bad checksums and ambiguous labels', () => {
  assert.equal(validGtin('4006381333931'), true)
  assert.equal(validGtin('4006381333932'), false)
  assert.equal(labelSuggestion('Soap\n4006381333931\n3017620422003').barcode, undefined)
  assert.equal(labelSuggestion('Soap\n123456789').barcode, undefined)
})

test('invoice columns preserve explicit unit cost but never use purchased quantity as current stock', () => {
  const rows = documentSuggestions('Invoice 123\nDescription | Quantity | Unit cost | Amount\nOrange Juice | 12 | 1,250.50 | 15006\nTotal 15006')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].draft.name, 'Orange Juice')
  assert.equal(rows[0].draft.cost, 1250.5)
  assert.equal(rows[0].draft.stock, undefined)
  assert.equal(rows[0].draft.price, undefined)
  assert.equal(documentSuggestions('Description | Qty | Price\nSoap | 4 | 500')[0].draft.cost, undefined)
})

test('unstructured document text remains visible for selection instead of guessing numbers', () => {
  const [row] = documentSuggestions('Soap 4 500 2000\nTotal 2000')
  assert.equal(row.draft.name, 'Soap 4 500 2000')
  assert.equal(row.draft.cost, undefined)
})

test('review requires explicit price and stock, rejects duplicates and invalid amounts', () => {
  const draft = { name: 'Soap', barcode: '00123', price: 0, stock: 0 }
  assert.equal(draftProblem(draft, [], []), '')
  assert.match(draftProblem({ ...draft, stock: undefined }, [], []), /stock/)
  assert.match(draftProblem({ ...draft, price: undefined }, [], []), /price/)
  assert.match(draftProblem(draft, ['00123'], []), /already/)
  assert.match(draftProblem(draft, [], ['00123']), /already/)
  assert.match(draftProblem({ ...draft, cost: NaN }, [], []), /valid/)
  assert.match(draftProblem({ ...draft, stock: -1 }, [], []), /valid/)
})

test('online lookup verifies barcode and caches a successful suggestion without financial fields', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async url => {
    calls++
    assert.match(url, /4006381333931/)
    return { ok: true, json: async () => ({ product: { code: '4006381333931', brands: 'Acme', product_name: 'Juice', quantity: '500 ml', price: 999 } }) }
  }
  try {
    const draft = await lookupFoodBarcode('4006381333931')
    assert.deepEqual(draft, { name: 'Acme Juice 500 ml', barcode: '4006381333931' })
    await lookupFoodBarcode('4006381333931')
    assert.equal(calls, 1)
    assert.equal(await lookupFoodBarcode('bad'), null)
  } finally { globalThis.fetch = original }
})
