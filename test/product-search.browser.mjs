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
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort())
  await page.route(`${base}/search-test`, async route => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/search-test', '<html><body><div id="root"></div></body></html>') }))
  await page.route('**/api/product-lookup?barcode=*', route => {
    const barcode = new URL(route.request().url()).searchParams.get('barcode')
    return barcode === '4006381333931'
      ? route.fulfill({ json: { status: 1, product: { code: barcode, product_name: 'Acme Juice 500 ml', source: 'Open Food Facts' } } })
      : route.fulfill({ status: 404, json: { status: 0, error: 'No reliable product details found.' } })
  })
  await page.goto(`${base}/search-test`)
  await page.evaluate(async () => {
    const { React, createRoot } = await import('/test/shop-setup-harness.ts')
    const { ProductSearch } = await import('/src/ProductSearch.tsx')
    window.addedDrafts = []
    window.scanCode = '4006381333931'
    createRoot(document.getElementById('root')).render(React.createElement(ProductSearch, {
      products: [], add: draft => window.addedDrafts.push(draft), open: () => {},
      scan: async () => window.scanCode, openStarters: () => {},
    }))
  })

  await page.getByRole('button', { name: /Scan barcode/ }).click()
  await page.getByText(/suggests Acme Juice/).waitFor()
  await page.getByRole('button', { name: 'Review product details' }).click()
  await page.waitForFunction(() => window.addedDrafts.length === 1)
  assert.deepEqual(await page.evaluate(() => window.addedDrafts[0]), {
    name: 'Acme Juice 500 ml', barcode: '4006381333931', catalogueSource: 'Open Food Facts',
  })

  await page.waitForTimeout(4600)
  await page.evaluate(() => { window.scanCode = '3017620422003' })
  const noMatchResponse = page.waitForResponse(response => response.url().includes('/api/product-lookup?barcode=3017620422003'))
  await page.getByRole('button', { name: /Scan barcode/ }).click()
  await noMatchResponse
  await page.getByText(/No reliable external product details/).waitFor()
  await page.getByRole('button', { name: 'Review product details' }).click()
  await page.waitForFunction(() => window.addedDrafts.length === 2)
  assert.deepEqual(await page.evaluate(() => window.addedDrafts[1]), { name: '', barcode: '3017620422003' })
  console.log('PASS: barcode scan carries a catalogue suggestion into product entry and preserves the barcode for manual upload when no reliable result exists')
} finally {
  await browser.close()
  await server.close()
}
