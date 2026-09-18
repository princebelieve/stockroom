import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import assert from 'node:assert/strict'

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname
  try {
    const file = resolve('dist', path === '/' ? 'index.html' : `.${path}`)
    if (!file.startsWith(resolve('dist'))) throw new Error('Invalid path')
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
    res.end(await readFile(file))
  } catch { res.writeHead(404); res.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ channel: 'msedge', headless: true })
console.log('Browser launched')
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  let pushed = []
  let remoteOperations = []
  let cloudOffline = false
  await context.route('https://stockroom-0vm5.onrender.com/**', async route => {
    if (cloudOffline) return route.abort('internetdisconnected')
    const path = new URL(route.request().url()).pathname
    const body = route.request().postDataJSON() || {}
    let result = {}
    if (path === '/v1/auth/login') result = { account: { id: 'owner', businessId: body.email === 'other@test.com' ? 'other-shop' : 'shop', name: 'Owner', email: body.email, role: 'owner' }, accessToken: 'access' }
    if (path === '/v1/devices/enroll') result = { businessId: 'shop', deviceId: body.deviceId, deviceToken: 'device' }
    if (path === '/v1/sync/pull') {
      const cursor = Number(new URL(route.request().url()).searchParams.get('cursor') || 0)
      const operations = remoteOperations.slice(cursor, cursor + 500)
      result = { operations, cursor: String(cursor + operations.length) }
    }
    if (path === '/v1/sync/push') { pushed.push(...body.operations); result = { acceptedOperationIds: body.operations.map(item => item.operationId), conflicts: [] } }
    if (path === '/v1/staff') result = { users: [] }
    await route.fulfill({ json: result })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.getByRole('heading', { name: 'Sign in to your shop' }).waitFor()
  console.log('PWA loaded')
  const api = (path, body) => page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
    return { status: response.status, data: await response.json() }
  }, { path, body })
  assert.equal((await api('/api/installer/activate', { mode: 'existing', ownerEmail: 'owner@test.com', ownerPassword: 'test-password', deviceId: 'pwa-test', label: 'iPhone' })).status, 201)
  assert.equal((await api('/api/auth/cloud-session', { email: 'other@test.com', password: 'test-password' })).status, 403)
  await page.reload()
  await page.getByLabel('Email', { exact: true }).fill('owner@test.com')
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'Log out' }).waitFor()
  console.log('Signed in')
  const created = await api('/api/products', { name: 'Coffee', sku: 'COF', category: 'Drink', unit: 'bag', stock: 10, reorder: 2, price: 5 })
  assert.equal(created.status, 201)
  await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Service worker not ready')), 15000))]))
  console.log('Offline shell ready')
  await context.setOffline(true)
  cloudOffline = true
  const sale = { id: 'sale-test', total: 10, items: [{ productId: created.data.id, quantity: 2, price: 5 }], paymentMethod: 'cash', cashReceived: 20, changeGiven: 999 }
  assert.equal((await api('/api/sales', sale)).status, 201)
  assert.equal((await api('/api/sales', sale)).status, 200)
  assert.equal((await api('/api/products')).data.products[0].stock, 8)
  assert.equal((await api('/api/sync/status')).data.pending, 2)
  const failedSync = await api('/api/sync/now', {})
  assert.ok(failedSync.data.lastError)
  assert.equal((await api('/api/sync/status')).data.pending, 2)
  const rejected = await api('/api/sales', { ...sale, id: 'too-many', total: 500, items: [{ ...sale.items[0], quantity: 100 }] })
  assert.equal(rejected.status, 400)
  assert.equal((await api('/api/products')).data.products[0].stock, 8)
  await page.reload()
  await page.getByRole('button', { name: 'Log out' }).waitFor()
  const savedCash = (await api('/api/sales')).data.sales.find(row => row.id === sale.id)
  assert.equal(savedCash.cashReceived, 20)
  assert.equal(savedCash.changeGiven, 10)
  assert.equal((await api('/api/products')).data.products[0].stock, 8)
  assert.equal((await api('/api/sync/status')).data.pending, 2)
  // A storage failure must not acknowledge a write or retain an in-memory edit.
  await page.evaluate(() => {
    window.restorePut = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function () { throw new DOMException('Storage full', 'QuotaExceededError') }
  })
  assert.equal((await api(`/api/products/${created.data.id}/stock`, { amount: 3 })).status, 503)
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.restorePut })
  assert.equal((await api('/api/products')).data.products[0].stock, 8)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.getByLabel('Page options').click()
  await page.getByRole('button', { name: 'Refresh', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await context.setOffline(false)
  cloudOffline = false
  await api('/api/sync/now', {})
  assert.equal((await api('/api/sync/status')).data.pending, 0)
  assert.equal(pushed.filter(item => item.entityType === 'sale').length, 1)
  const createdAt = new Date().toISOString()
  const remote = (operationId, entityType, action, payload) => ({ operationId, entityType, action, payload, createdAt })
  remoteOperations = [
    remote('remote-product', 'product', 'upsert', { id: 'remote', name: 'Tea', sku: 'TEA', category: 'Drink', unit: 'bag', stock: 10, price: 2 }),
    remote('remote-count', 'stocktake', 'approved', { counts: [{ productId: 'remote', variance: -3 }] }),
    remote('remote-sale', 'sale', 'create', { id: 'remote-sale', total: 4, items: [{ productId: 'remote', quantity: 2, price: 2 }] }),
    ...Array.from({ length: 501 }, (_, index) => remote(`settings-${index}`, 'settings', 'upsert', { appName: `Shop ${index}`, currency: 'USD' })),
  ]
  await api('/api/sync/pull', {})
  assert.equal((await api('/api/settings')).data.appName, 'Shop 500')
  assert.equal((await api('/api/products')).data.products.find(item => item.id === 'remote').stock, 5)
  await api('/api/sync/pull', {})
  assert.equal((await api('/api/products')).data.products.find(item => item.id === 'remote').stock, 5)
  assert.equal(pushed.filter(item => item.entityType === 'sale').length, 1)
  const secondTab = await context.newPage()
  await secondTab.goto(page.url())
  await secondTab.getByRole('button', { name: 'Log out' }).waitFor()
  await Promise.all([
    api(`/api/products/${created.data.id}/stock`, { amount: 1 }),
    secondTab.evaluate(async productId => {
      const response = await fetch(`/api/products/${productId}/stock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 1 }) })
      if (!response.ok) throw new Error('Second-tab write failed')
    }, created.data.id),
  ])
  assert.equal((await api('/api/products')).data.products.find(item => item.id === created.data.id).stock, 10)
  await secondTab.close()
  cloudOffline = true
  await context.setOffline(true)
  const beforeDraft = (await api('/api/sync/status')).data.pending
  const draft = (await api('/api/stocktakes', {})).data
  assert.equal((await api('/api/stocktakes', {})).data.id, draft.id)
  const coffeeCount = draft.counts.find(item => item.productId === created.data.id)
  const teaCount = draft.counts.find(item => item.productId === 'remote')
  const count = (countId, counted) => page.evaluate(async ({ sessionId, countId, counted }) => {
    const response = await fetch(`/api/stocktakes/${sessionId}/counts/${countId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ counted }) })
    return response.status
  }, { sessionId: draft.id, countId, counted })
  assert.equal(await count(coffeeCount.id, -1), 400)
  assert.equal(await count(coffeeCount.id, 8), 200)
  assert.equal(await count(teaCount.id, 0), 200)
  assert.equal((await api('/api/sync/status')).data.pending, beforeDraft)
  await page.reload()
  await page.getByRole('button', { name: 'Stock take', exact: true }).click()
  await page.getByRole('button', { name: 'Approve adjustments' }).waitFor()
  assert.equal((await api('/api/stocktakes')).data.stocktake.counts.find(item => item.id === coffeeCount.id).counted, 8)
  await api('/api/products/remote/stock', { amount: -5 })
  assert.equal((await api(`/api/stocktakes/${draft.id}/approve`, { reason: 'Shelf count' })).status, 400)
  assert.equal((await api('/api/products')).data.products.find(item => item.id === created.data.id).stock, 10)
  assert.equal(await count(teaCount.id, 5), 200)
  const approved = await api(`/api/stocktakes/${draft.id}/approve`, { reason: 'Shelf count' })
  assert.equal(approved.status, 200)
  assert.equal(approved.data.history[0].variance, -2)
  assert.equal((await api(`/api/stocktakes/${draft.id}/approve`, { reason: 'Retry' })).status, 200)
  assert.equal(await count(coffeeCount.id, 7), 409)
  assert.equal((await api('/api/products')).data.products.find(item => item.id === created.data.id).stock, 8)
  cloudOffline = false
  await context.setOffline(false)
  await api('/api/sync/now', {})
  const stocktakeOps = pushed.filter(item => item.entityType === 'stocktake' && item.entityId === draft.id)
  assert.deepEqual(stocktakeOps.map(item => item.action), ['create', 'approved'])
  assert.equal(stocktakeOps[0].payload.status, 'approved')
  assert.equal(stocktakeOps[1].payload.counts.find(item => item.id === coffeeCount.id).variance, -2)
  await page.getByRole('button', { name: 'POS', exact: true }).click()
  await page.locator('.pos-product').filter({ hasText: 'Coffee' }).click()
  await page.getByLabel('Payment method').selectOption('cash')
  assert.equal(await page.getByRole('button', { name: 'Complete sale', exact: true }).isDisabled(), true)
  await page.getByLabel('Cash received').fill('0.01')
  assert.equal(await page.getByRole('button', { name: 'Complete sale', exact: true }).isDisabled(), true)
  await page.getByLabel('Cash received').fill('100')
  await page.getByRole('button', { name: 'Complete sale', exact: true }).click()
  await page.getByText('Scan or select a product to begin.', { exact: true }).waitFor()
  const cashSale = (await api('/api/sales')).data.sales.find(row => row.cashReceived === 100)
  assert.ok(cashSale)
  assert.equal(cashSale.changeGiven, 100 - cashSale.total)
  assert.match(await page.locator('.print-receipt').textContent(), /Cash received:.*Change given:/)
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.getByRole('heading', { name: 'Sign in to your shop' }).waitFor()
  assert.equal((await api('/api/settings')).data.existingBusiness, true)
  assert.equal((await api('/api/products')).status, 401)
  assert.deepEqual(errors, [])
  // Even an accidentally packaged PWA build must defer to the Windows server.
  const desktop = await browser.newContext()
  await desktop.addInitScript(() => { window.stockroomDesktop = { openCustomerDisplay: async () => {} } })
  await desktop.route('**/api/**', route => route.fulfill({ json: { desktopServer: true, cloudConfigured: false, ownerConfigured: false } }))
  const desktopPage = await desktop.newPage()
  await desktopPage.goto(page.url())
  await desktopPage.getByRole('heading', { name: 'Add another device' }).waitFor()
  assert.equal(await desktopPage.evaluate(async () => (await (await fetch('/api/health')).json()).desktopServer), true)
  await desktop.close()
  console.log('PWA passed: enrollment, business isolation, login/logout, offline reload, durable sales/outbox, duplicate retry, rollback, sync, menu and mobile width.')
} finally { await browser.close(); server.close() }
