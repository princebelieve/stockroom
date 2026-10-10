import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const server = await createServer({ server: { port: 0, host: '127.0.0.1' } })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  page.setDefaultTimeout(7000)
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  const searchTestHtml = '<html><body><div id="root"></div></body></html>'
  await page.route('**/*', route => {
    const url = route.request().url()
    if (url === `${base}/search-test`) return route.fulfill({ contentType: 'text/html', body: searchTestHtml })
    if (url.includes('/api/product-lookup?barcode=')) {
      const barcode = new URL(url).searchParams.get('barcode')
      return barcode === '4006381333931'
        ? route.fulfill({ json: { status: 1, product: { code: barcode, product_name: 'Acme Juice 500 ml', source: 'Open Food Facts' } } })
        : barcode === '8001090583420'
          ? route.fulfill({ json: { status: 1, product: { code: barcode, product_name: 'Strong Teeth Toothpaste', source: 'EcomSource', attributes: { brand: 'Oral-B', manufacturer: 'Procter & Gamble', packageSize: '130 g', category: 'Oral care', weight: '130 (unit not supplied)', dimensions: 'ITEM: height 4, width 5, length 6 (unit not supplied)', features: 'Helps protect teeth; Mint flavour' } } } })
          : route.fulfill({ status: 404, json: { status: 0, error: 'No reliable product details found.' } })
    }
    return url.startsWith(base) ? route.continue() : route.abort()
  })
  await page.goto(`${base}/search-test`, { waitUntil: 'commit' })
  await page.locator('#root').waitFor({ state: 'attached' })
  await page.evaluate(async () => {
    const RefreshRuntime = await import('/@react-refresh')
    RefreshRuntime.injectIntoGlobalHook(window)
    window.$RefreshReg$ = () => {}
    window.$RefreshSig$ = () => (type) => type
    window.__vite_plugin_react_preamble_installed__ = true
    const { React, createRoot } = await import('/test/shop-setup-harness.ts')
    const { ProductSearch } = await import('/src/ProductSearch.tsx')
    const { normalizeShopProfile } = await import('/server/shop-profile.mjs')
    window.addedDrafts = []
    window.scanCode = '4006381333931'
    window.shopProfile = normalizeShopProfile({ mode: 'suggested', industry: 'pharmacy' })
    window.shopProfile.workspaceCatalogues['product-sales'] = { categories: ['Oral care'], units: ['tube'] }
    window.root = createRoot(document.getElementById('root'))
    window.root.render(React.createElement(ProductSearch, {
      products: [], add: draft => window.addedDrafts.push(draft), open: () => {},
      scan: async () => window.scanCode, openStarters: () => {}, shopProfile: window.shopProfile,
      catalogueWorkspace: 'product-sales',
    }))
  })

  await page.getByRole('button', { name: /Scan barcode/ }).click()
  await page.getByText(/suggests Acme Juice/).waitFor()
  await page.getByRole('button', { name: 'Review product details' }).click()
  await page.waitForFunction(() => window.addedDrafts.length === 1)
  assert.deepEqual(await page.evaluate(() => window.addedDrafts[0]), {
    name: 'Acme Juice 500 ml', barcode: '4006381333931', catalogueSource: 'Open Food Facts',
  })

  await page.evaluate(() => { window.scanCode = '8001090583420' })
  const oralBLookup = page.waitForResponse(response => response.url().includes('/api/product-lookup?barcode=8001090583420'))
  await page.getByRole('button', { name: /Scan barcode/ }).click()
  const oralBResponse = await oralBLookup
  assert.equal(new URL(oralBResponse.url()).searchParams.get('industry'), 'pharmacy')
  await page.getByText(/suggests Strong Teeth Toothpaste/).waitFor()
  await page.getByRole('button', { name: 'Review product details' }).click()
  await page.waitForFunction(() => window.addedDrafts.length === 2)
  assert.deepEqual(await page.evaluate(() => window.addedDrafts[1]), {
    name: 'Strong Teeth Toothpaste', barcode: '8001090583420', category: 'Oral care', catalogueSource: 'EcomSource',
    customValues: {
      custom_pharmacy_brand: 'Oral-B', custom_pharmacy_manufacturer: 'Procter & Gamble',
      custom_pharmacy_package_size: '130 g',
      custom_pharmacy_product_weight: '130 (unit not supplied)',
      custom_pharmacy_product_dimensions: 'ITEM: height 4, width 5, length 6 (unit not supplied)',
      custom_pharmacy_product_features: 'Helps protect teeth; Mint flavour',
    },
  })
  await page.evaluate(async () => {
    const { React } = await import('/test/shop-setup-harness.ts')
    const { ShopProductFields } = await import('/src/ShopProductFields.tsx')
    window.root.render(React.createElement(ShopProductFields, {
      profile: window.shopProfile, initialDraft: window.addedDrafts[1], catalogueWorkspace: 'product-sales',
    }))
  })
  assert.equal(await page.locator('textarea[name="name"]').inputValue(), 'Strong Teeth Toothpaste')
  assert.equal(await page.locator('input[name="barcode"]').inputValue(), '8001090583420')
  assert.equal(await page.locator('input[name="custom:custom_pharmacy_brand"]').inputValue(), 'Oral-B')
  assert.equal(await page.locator('input[name="custom:custom_pharmacy_package_size"]').inputValue(), '130 g')
  assert.equal(await page.locator('input[name="custom:custom_pharmacy_product_weight"]').inputValue(), '130 (unit not supplied)')
  assert.equal(await page.locator('input[name="custom:custom_pharmacy_product_dimensions"]').inputValue(), 'ITEM: height 4, width 5, length 6 (unit not supplied)')
  assert.equal(await page.locator('input[name="custom:custom_pharmacy_product_features"]').inputValue(), 'Helps protect teeth; Mint flavour')

  await page.evaluate(async () => {
    const { React, createRoot } = await import('/test/shop-setup-harness.ts')
    const { ProductSearch } = await import('/src/ProductSearch.tsx')
    window.root.unmount()
    window.root = createRoot(document.getElementById('root'))
    window.root.render(React.createElement(ProductSearch, {
      products: [], add: draft => window.addedDrafts.push(draft), open: () => {},
      scan: async () => window.scanCode, openStarters: () => {},
    }))
  })
  await page.evaluate(() => { window.scanCode = '3017620422003' })
  const noMatchResponse = page.waitForResponse(response => response.url().includes('/api/product-lookup?barcode=3017620422003'))
  await page.getByRole('button', { name: /Scan barcode/ }).click()
  await noMatchResponse
  await page.getByText(/No catalogue name was returned/).waitFor()
  await page.getByRole('button', { name: 'Review product details' }).click()
  await page.waitForFunction(() => window.addedDrafts.length === 3)
  assert.deepEqual(await page.evaluate(() => window.addedDrafts[2]), { name: '', barcode: '3017620422003' })
  console.log('PASS: barcode scan carries both complete and sparse catalogue names into product entry and preserves the barcode for manual upload when no result exists')
} finally {
  await browser.close()
  await server.close()
}
