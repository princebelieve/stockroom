import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const server = await createServer({ server: { port: 0, host: '127.0.0.1' } })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  const external = []
  await page.route('**/*', route => { if (!route.request().url().startsWith(base)) { external.push(route.request().url()); return route.abort() }; return route.continue() })
  let configured = false; let requests = 0
  const fields = Object.fromEntries(['name', 'barcode', 'sku', 'category', 'unit', 'stock', 'reorder', 'cost', 'price'].map(key => [key, { value: null, state: 'blank' }]))
  for (const [key, value] of Object.entries({ name: 'Orange Juice', sku: 'JUICE-01', unit: 'bottle', stock: 0, cost: 10, price: 15 })) fields[key] = { value, state: 'suggested' }
  fields.barcode = { value: null, state: 'uncertain' }
  await page.route(`${base}/form-test`, async route => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/form-test', '<html><body><div id="root"></div></body></html>') }))
  await page.route(`${base}/v1/product-forms/status`, route => route.fulfill({ json: { configured } }))
  await page.route(`${base}/v1/product-forms/read`, route => { requests++; assert.match(route.request().postDataJSON().image, /^data:image\/jpeg;base64,/); return route.fulfill({ json: { fields } }) })
  await page.goto(`${base}/form-test`)
  const image = await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default
    const { HandwrittenProductForm } = await import('/src/HandwrittenProductForm.tsx')
    const { BlankProductForm } = await import('/src/BlankProductForm.tsx')
    await import('/src/styles.css')
    window.saved = []; window.failSave = true
    createRoot(document.getElementById('root')).render(React.createElement(React.Fragment, null,
      React.createElement(BlankProductForm, { businessName: 'Sample Business', businessMode: 'wholesale', currency: 'NGN' }),
      React.createElement(HandwrittenProductForm, { apiUrl: location.origin, token: 'test', onToken: () => {}, products: [], create: async draft => { if (window.failSave) throw new Error('Save failed for test'); window.saved.push(draft) } })))
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 2000
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, 1000, 2000)
    context.fillStyle = '#000'; context.font = '32px monospace'
    const answers = ['SODA', '001234567890', 'SODA01', 'DRINKS', 'BOTTLE', '12', '5', '10.00', '15.00']
    for (let i = 0; i < 10; i++) { context.fillText(`F${String(i + 1).padStart(2, '0')}`, 60, 100 + i * 170); if (i < 9) context.fillText(answers[i], 80, 185 + i * 170) }
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.getByRole('heading', { name: 'Upload completed product form' }).waitFor()
  await page.getByLabel('Completed paper form photo').setInputFiles({ name: 'form.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') })
  assert.equal(await page.getByRole('button', { name: 'Read completed form' }).isDisabled(), true)
  await page.getByLabel('Form Product name', { exact: true }).fill('MANUAL PRODUCT')
  await page.getByLabel('Form Unit', { exact: true }).fill('carton')
  await page.getByLabel('Form Starting stock', { exact: true }).fill('0')
  await page.getByLabel('Form Selling price per unit', { exact: true }).fill('25')
  await page.getByLabel('I checked every field against the handwritten form.').check()
  assert.equal(requests, 0)
  await page.evaluate(() => { window.failSave = false })
  await page.getByRole('button', { name: 'Save reviewed product' }).click()
  await page.getByRole('status').filter({ hasText: 'Product saved.' }).waitFor()
  assert.equal(await page.evaluate(() => window.saved[0].name), 'MANUAL PRODUCT')
  await page.evaluate(() => { window.saved = []; window.failSave = true })
  await page.getByLabel('Completed paper form photo').setInputFiles({ name: 'form.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') })
  await page.getByLabel('Form Product name', { exact: true }).fill('OWNER ENTERED NAME')
  await page.getByRole('button', { name: 'Autofill on this device' }).click()
  await page.getByRole('button', { name: 'Autofill on this device' }).waitFor({ state: 'visible' })
  await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled, { }, { timeout: 90000 })
  const localStatus = await page.getByRole('status').allTextContents()
  if (!localStatus.some(text => text.includes('Suggestions filled empty fields'))) {
    const diagnostic = await page.evaluate(async () => {
      const { readPhotoData } = await import('/src/lib/receiptOcr.ts')
      const blob = await (await fetch(document.querySelector('img[alt="Uploaded handwritten product form for comparison"]').src)).blob()
      const data = await readPhotoData(new File([blob], 'fixture.png', { type: 'image/png' }), new AbortController().signal, () => {}, true, true)
      return data.text
    })
    console.log('Local OCR fixture text:', diagnostic)
  }
  assert.ok(localStatus.some(text => text.includes('Suggestions filled empty fields')), localStatus.join('\n'))
  assert.equal(requests, 0)
  assert.equal(await page.getByLabel('Form Product name', { exact: true }).inputValue(), 'OWNER ENTERED NAME')
  assert.equal(await page.getByLabel('Form Unit', { exact: true }).inputValue(), 'BOTTLE')
  assert.equal(await page.getByLabel('Form Starting stock', { exact: true }).inputValue(), '12')
  // Start a fresh review for the separate Google success/failure checks.
  await page.getByLabel('Completed paper form photo').setInputFiles({ name: 'form.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') })
  await page.getByLabel('Form Product name', { exact: true }).fill('OWNER ENTERED NAME')
  await page.getByLabel('Send this photo to Google Cloud Vision to read the handwriting.').check()
  await page.getByRole('button', { name: 'Read completed form' }).click()
  await page.getByRole('status').filter({ hasText: 'not configured' }).waitFor()
  assert.equal(requests, 0)
  assert.equal(await page.getByLabel('Form Product name', { exact: true }).inputValue(), 'OWNER ENTERED NAME')
  configured = true
  await page.getByRole('button', { name: 'Read completed form' }).click()
  await page.getByRole('status').filter({ hasText: 'Suggestions filled empty fields' }).waitFor()
  assert.equal(await page.getByLabel('Form Product name', { exact: true }).inputValue(), 'OWNER ENTERED NAME')
  assert.equal(requests, 1)
  assert.equal(await page.getByLabel('Form Barcode', { exact: true }).inputValue(), '')
  assert.equal(await page.getByLabel('Form Starting stock', { exact: true }).inputValue(), '0')
  const save = page.getByRole('button', { name: 'Save reviewed product' })
  assert.equal(await save.isDisabled(), true)
  const confirm = page.getByLabel('I checked every field against the handwritten form.')
  await confirm.check()
  await page.getByLabel('Form Selling price per unit', { exact: true }).fill('20')
  assert.equal(await confirm.isChecked(), false)
  await confirm.check(); await save.click()
  await page.getByRole('status').filter({ hasText: 'Save failed for test' }).waitFor()
  assert.equal(await page.getByLabel('Form SKU', { exact: true }).inputValue(), 'JUICE-01')
  await page.evaluate(() => { window.failSave = false })
  await save.click()
  await page.getByRole('status').filter({ hasText: 'Product saved.' }).waitFor()
  assert.deepEqual(await page.evaluate(() => window.saved.map(draft => [draft.sku, draft.price, draft.stock])), [['JUICE-01', 20, 0]])
  assert.equal(await page.getByRole('button', { name: 'Save reviewed product' }).count(), 0)
  await page.evaluate(() => { document.body.dataset.printKind = 'product-form' })
  await page.emulateMedia({ media: 'print' })
  assert.equal(await page.locator('#root').isVisible(), false)
  assert.match(await page.locator('.blank-product-form').innerText(), /F01[\s\S]*F10/)
  for (const format of ['A4', 'Letter']) {
    const pdf = await page.pdf({ format, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } })
    assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 1, `${format} must fit one page`)
  }
  // App CSS requests a font; it is blocked above along with all external traffic.
  assert.deepEqual(external.filter(url => !url.startsWith('https://fonts.googleapis.com/')), [])
  console.log('PASS: real on-device OCR with external traffic blocked, manual save, optional Google review, preserved owner entries, retry and one-page print layout')
} finally { await browser.close(); await server.close() }
