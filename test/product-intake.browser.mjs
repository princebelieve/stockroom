import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const server = await createServer({ server: { port: 0, host: '127.0.0.1' } })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  await page.route(`${base}/intake-test`, async route => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/intake-test', '<html><body><div id="root"></div></body></html>') }))
  await page.route('https://world.openfoodfacts.org/**', route => route.abort())
  await page.goto(`${base}/intake-test`)
  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default
    const { ProductIntake } = await import('/src/ProductIntake.tsx')
    window.saved = []; window.fail = true
    createRoot(document.getElementById('root')).render(React.createElement(ProductIntake, {
      products: [], defaultUnit: 'item', scan: async () => '4006381333931',
      create: async draft => { if (draft.name === 'Soap' && window.fail) throw new Error('Simulated save failure'); window.saved.push(draft) },
    }))
  })
  // Real local OCR, then editable package suggestion.
  const image = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 320
    const context = canvas.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, 900, 320); context.fillStyle = 'black'; context.font = '40px monospace'
    ;['ACME', 'Orange Juice', '500 ml'].forEach((line, i) => context.fillText(line, 30, 60 + i * 70))
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.getByLabel('Photo or screenshot', { exact: true }).setInputFiles({ name: 'package.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') })
  await page.getByRole('status').filter({ hasText: 'Image text is ready' }).waitFor({ timeout: 90000 })
  await page.getByRole('button', { name: 'Suggest products from text' }).click()
  assert.match(await page.getByLabel('Name row 1', { exact: true }).inputValue(), /Orange Juice/)
  assert.equal(await page.getByLabel('Selling price row 1').inputValue(), '')
  await page.getByLabel('Remove row 1').click()
  // CSV quoting, explicit zero, and partial failure retry.
  await page.getByLabel('CSV product file').setInputFiles({ name: 'products.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Price,Stock\n"Juice, orange",10,0\nSoap,20,2') })
  await page.getByLabel('Name row 2', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Import 2 reviewed products' }).click()
  await page.getByRole('status').filter({ hasText: 'Simulated save failure' }).waitFor()
  assert.equal(await page.getByLabel('Name row 1', { exact: true }).inputValue(), 'Soap')
  assert.equal(await page.getByLabel('Name row 2', { exact: true }).count(), 0)
  await page.evaluate(() => { window.fail = false })
  await page.getByRole('button', { name: 'Import 1 reviewed product', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Imported 1 product.' }).waitFor()
  assert.deepEqual(await page.evaluate(() => window.saved.map(product => product.name)), ['Juice, orange', 'Soap'])
  // Lookup failure still provides an editable barcode row.
  await page.getByRole('button', { name: 'Scan barcode', exact: true }).click()
  await page.getByLabel('Barcode row 1', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Barcode row 1', { exact: true }).inputValue(), '4006381333931')
  assert.equal(await page.getByRole('button', { name: 'Import 1 reviewed product', exact: true }).isDisabled(), true)
  await page.getByLabel('Remove row 1').click()
  await page.getByLabel('What are you reading?').selectOption('document')
  await page.getByLabel('Read or pasted text').fill('Description | Quantity | Unit cost\nSoap | 12 | 20\nTotal 240')
  await page.getByRole('button', { name: 'Suggest products from text' }).click()
  assert.equal(await page.getByLabel('Import row 1', { exact: true }).isChecked(), false)
  assert.equal(await page.getByLabel('Unit cost row 1').inputValue(), '20')
  assert.equal(await page.getByLabel('Current stock row 1').inputValue(), '')
  await page.getByLabel('Import row 1', { exact: true }).check()
  await page.getByLabel('Selling price row 1').fill('30')
  await page.getByLabel('Current stock row 1').fill('0')
  assert.equal(await page.getByRole('button', { name: 'Import 1 reviewed product', exact: true }).isEnabled(), true)
  console.log('PASS: package OCR, editable review, CSV quoting, partial import retry, failed online lookup, invoice selection and stock confirmation')
} finally { await browser.close(); await server.close() }
