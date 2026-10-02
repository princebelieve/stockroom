import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false } })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.on('pageerror', error => console.error(error.message))
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort())
  let remote = []
  await page.route(`${base}/shop-test`, async route => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/shop-test', '<html><body><div id="root"></div></body></html>') }))
  await page.route(`${base}/v1/sync/pull**`, route => route.fulfill({ json: { operations: remote, cursor: remote.length ? '1' : '' } }))
  await page.goto(`${base}/shop-test`)
  await page.evaluate(async () => {
    const { React, createRoot } = await import('/test/shop-setup-harness.ts')
    const { ShopSetup } = await import('/src/ShopSetup.tsx')
    const { normalizeShopProfile } = await import('/server/shop-profile.mjs')
    const { openBrowserDatabase, saveBrowserSyncConfiguration, withBrowserDatabase } = await import('/src/lib/browserDatabase.ts')
    const { handleBrowserApi } = await import('/src/lib/browserApi.ts')
    await import('/src/styles.css')
    await withBrowserDatabase(async () => {
    const db = await openBrowserDatabase()
    await db.run("INSERT INTO app_settings (id, app_name, currency, updated_at) VALUES (1, 'Test shop', 'USD', ?)", [new Date().toISOString()])
    await db.run('INSERT INTO users (id, name, email, role, created_at) VALUES (?, ?, ?, ?, ?)', ['owner', 'Owner', 'owner@test.local', 'owner', new Date().toISOString()])
    await db.run('INSERT INTO mobile_settings (key, value) VALUES (?, ?)', ['sessionUserId', 'owner'])
    await saveBrowserSyncConfiguration({ syncApiUrl: location.origin, businessId: 'shop', deviceId: 'test', deviceToken: 'test' })
    return new Response('{}')
    })
    window.shopApi = async (path, value, method) => {
      const response = await withBrowserDatabase(() => handleBrowserApi(path, { method: method || (value ? 'PUT' : 'GET'), ...(value ? { body: JSON.stringify(value) } : {}) }))
      return { status: response.status, data: await response.json() }
    }
    function Setup() {
      const [profile, setProfile] = React.useState(normalizeShopProfile())
      return React.createElement(ShopSetup, { value: profile, save: async next => {
        const result = await window.shopApi('/api/settings/shop-profile', next)
        if (result.status !== 200) throw new Error(result.data.error)
        setProfile(result.data)
      } })
    }
    createRoot(document.getElementById('root')).render(React.createElement(Setup))
  })
  await page.getByRole('heading', { name: 'Shop setup wizard' }).waitFor()
  await page.getByLabel('Business template').selectOption('printing')
  await page.getByRole('button', { name: 'Use this template' }).click()
  // Exercise the real bundled OCR reader against a clear screenshot fixture.
  await page.getByText('Start from a printed form or screenshot', { exact: true }).click()
  const photo = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 600
    const context = canvas.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, 1400, 600)
    context.fillStyle = 'black'; context.font = '48px Arial'
    context.fillText('Supplier code', 80, 120); context.fillText('Brand name', 80, 260)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.getByLabel('Template image').setInputFiles({ name: 'old-app.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') })
  await page.getByRole('button', { name: 'Read template image' }).click()
  await page.getByRole('status').filter({ hasText: 'Text read.' }).waitFor({ timeout: 100000 })
  assert.match(await page.getByLabel('Template text').inputValue(), /Supplier code/i)
  await page.getByRole('button', { name: 'Suggest fields from text' }).click()
  await page.getByRole('button', { name: 'Add selected fields to draft' }).click()
  await page.context().setOffline(true)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByLabel('Item name', { exact: true }).fill('Printed item')
  await page.getByLabel('Usual unit', { exact: true }).fill('sheet')
  await page.getByLabel('Suggested categories').fill('Cards\nFlyers')
  let editor = page.locator('.shop-field').filter({ has: page.locator('summary', { hasText: /^Finish\s*$/ }) })
  await editor.locator('summary').click()
  await editor.getByLabel('Label', { exact: true }).fill('Finishing')
  editor = page.locator('.shop-field').filter({ has: page.locator('summary', { hasText: /^Finishing/ }) })
  await editor.getByLabel('Input type').selectOption('select')
  await editor.getByLabel('Placeholder').fill('Choose finish')
  await editor.getByLabel('Dropdown choices').fill('Gloss\nMatte')
  await editor.getByLabel('Required', { exact: true }).check()
  await editor.getByRole('button', { name: 'Move up' }).click()
  const barcode = page.locator('.shop-field').filter({ has: page.locator('summary', { hasText: /^Barcode\s*$/ }) })
  await barcode.locator('summary').click()
  await barcode.getByRole('button', { name: 'Remove field' }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  const preview = page.getByRole('group', { name: 'Product form preview' })
  assert.equal(await preview.getByLabel(/Barcode/).count(), 0)
  assert.equal(await preview.getByLabel(/Finishing/).getAttribute('required'), '')
  assert.ok(await preview.getByLabel(/Supplier code/i).count())
  await preview.getByLabel(/Finishing/).selectOption('Gloss')
  await page.getByRole('button', { name: 'Save shop setup', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Shop setup saved' }).waitFor()
  const saved = await page.evaluate(async () => (await window.shopApi('/api/settings')).data)
  const layout = JSON.parse(saved.shopProfile)
  assert.equal(layout.unit, 'sheet')
  assert.deepEqual(layout.categories, ['Cards', 'Flyers'])
  assert.equal(layout.fields.find(field => field.id === 'barcode').visible, false)
  const custom = await page.evaluate(async () => {
    const input = { name: 'Business card', sku: 'CARD1', category: 'Cards', unit: 'sheet', stock: 4, reorder: 0, price: 10, cost: 3 }
    const invalid = await window.shopApi('/api/products', input, 'POST')
    const created = await window.shopApi('/api/products', { ...input, customValues: { custom_printing_finish: 'Gloss' } }, 'POST')
    const changed = await window.shopApi('/api/products/' + created.data.id + '/custom-values', { customValues: { custom_printing_finish: 'Matte' } })
    return { invalid, created, changed }
  })
  assert.equal(custom.invalid.status, 400)
  assert.equal(custom.created.status, 201)
  assert.equal(custom.changed.data.customValues.custom_printing_finish, 'Matte')
  const queue = await page.evaluate(async () => {
    const { openBrowserDatabase, withBrowserDatabase } = await import('/src/lib/browserDatabase.ts')
    return (await withBrowserDatabase(async () => new Response(JSON.stringify((await (await openBrowserDatabase()).query("SELECT payload FROM sync_outbox WHERE entity_type = 'settings'")).values.map(row => JSON.parse(row.payload)))))).json()
  })
  assert.ok(queue.some(row => row.shopProfile?.unit === 'sheet'))
  console.log('Custom setup queued')
  await page.context().setOffline(false)
  await page.reload()
  const reopened = await page.evaluate(async () => {
    const { handleBrowserApi } = await import('/src/lib/browserApi.ts')
    const { withBrowserDatabase } = await import('/src/lib/browserDatabase.ts')
    return (await withBrowserDatabase(() => handleBrowserApi('/api/settings'))).json()
  })
  assert.equal(JSON.parse(reopened.shopProfile).itemLabel, 'Printed item')
  const products = await page.evaluate(async () => { const { handleBrowserApi } = await import('/src/lib/browserApi.ts'); const { withBrowserDatabase } = await import('/src/lib/browserDatabase.ts'); return (await withBrowserDatabase(() => handleBrowserApi('/api/products'))).json() })
  assert.equal(JSON.parse(products.products[0].customValues).custom_printing_finish, 'Matte')
  remote = [{ operationId: 'remote-shop-profile', entityType: 'settings', entityId: 'business', action: 'upsert', createdAt: '2030-01-01T00:00:00Z', payload: { appName: 'Test shop', currency: 'USD', updatedAt: '2030-01-01T00:00:00Z', shopProfile: { mode: 'suggested', industry: 'food-service' } } }]
  const received = await page.evaluate(async () => {
    const { handleBrowserApi } = await import('/src/lib/browserApi.ts')
    const { withBrowserDatabase } = await import('/src/lib/browserDatabase.ts')
    await withBrowserDatabase(() => handleBrowserApi('/api/sync/pull', { method: 'POST' }))
    return (await withBrowserDatabase(() => handleBrowserApi('/api/settings'))).json()
  })
  assert.equal(JSON.parse(received.shopProfile).itemLabel, 'Menu item')
  console.log('PASS: template wizard, real screenshot OCR, field editing/removal/order, required dropdowns, offline product details, restart and profile sync')
} finally { await browser.close(); await server.close() }
