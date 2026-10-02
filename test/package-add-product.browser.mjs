import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const server = await createServer({ server: { port: 0, host: '127.0.0.1' } })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort())
  await page.route(`${base}/photo-test`, async route => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/photo-test', '<html><body><div id="root"></div></body></html>') }))
  await page.goto(`${base}/photo-test`)
  const image = await page.evaluate(async () => {
    const { React, createRoot } = await import('/test/shop-setup-harness.ts')
    const { ProductIntake } = await import('/src/ProductIntake.tsx')
    const { PackageProductPhoto } = await import('/src/PackageProductPhoto.tsx')
    const { ShopProductFields } = await import('/src/ShopProductFields.tsx')
    const { normalizeShopProfile } = await import('/server/shop-profile.mjs')
    function Test() {
      const [draft, setDraft] = React.useState(null)
      return React.createElement(React.Fragment, null,
        React.createElement(ProductIntake, { products: [], defaultUnit: 'item', scan: async () => '', create: async () => { throw Error('Package must use Add Product') }, openProduct: setDraft }),
        draft && React.createElement('form', { onSubmit: event => { event.preventDefault(); window.saved = Object.fromEntries(new FormData(event.currentTarget)) } },
          React.createElement('h2', null, 'Add product'), React.createElement(PackageProductPhoto), React.createElement(ShopProductFields, { profile: normalizeShopProfile(), initialDraft: draft }), React.createElement('button', { type: 'submit' }, 'Save product')))
    }
    createRoot(document.getElementById('root')).render(React.createElement(Test))
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 320
    const context = canvas.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, 900, 320); context.fillStyle = 'black'; context.font = '40px monospace'
    ;['ACME', 'Orange Juice', '500 ml'].forEach((line, i) => context.fillText(line, 30, 60 + i * 70))
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const file = { name: 'package.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') }
  await page.getByText('Add products from a photo, barcode or file', { exact: true }).click()
  await page.getByLabel('Photo or screenshot', { exact: true }).setInputFiles(file)
  await page.getByRole('heading', { name: 'Add product' }).waitFor({ timeout: 90000 })
  const form = page.locator('form')
  assert.match(await form.locator('[name=name]').inputValue(), /Orange Juice/)
  assert.equal(await page.getByLabel('Name row 1', { exact: true }).count(), 0)
  assert.equal(await form.locator('[name=price]').inputValue(), '')
  assert.equal(await form.locator('[name=stock]').inputValue(), '')
  await form.locator('[name=name]').fill('OWNER NAME')
  await form.locator('[name=price]').fill('25')
  await form.locator('[name=stock]').fill('8')
  await page.getByLabel('Fill from a package photo').setInputFiles(file)
  await page.getByRole('status').filter({ hasText: 'No empty fields could be filled' }).waitFor({ timeout: 90000 })
  assert.equal(await form.locator('[name=name]').inputValue(), 'OWNER NAME')
  assert.equal(await form.locator('[name=price]').inputValue(), '25')
  await form.locator('[name=name]').fill('')
  await page.getByLabel('Fill from a package photo').setInputFiles(file)
  await page.getByRole('status').filter({ hasText: 'Details filled in this form' }).waitFor({ timeout: 90000 })
  assert.match(await form.locator('[name=name]').inputValue(), /Orange Juice/)
  await page.getByRole('button', { name: 'Save product', exact: true }).click()
  assert.equal(await page.evaluate(() => window.saved.stock), '8')
  assert.equal(await page.evaluate(() => window.saved.price), '25')
  console.log('PASS: package upload opens populated Add Product inputs, no package review row, direct photo autofill preserves owner entries and submits the same form')
} finally { await browser.close(); await server.close() }
