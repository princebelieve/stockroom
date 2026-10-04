import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import assert from 'node:assert/strict'

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname
  try {
    // Mirror Vercel's cleanUrls behavior for the app's canonical /welcome URL.
    const file = resolve('dist', path === '/' ? 'index.html' : ['/welcome', '/developer', '/visitor', '/privacy', '/terms', '/account-deletion'].includes(path) ? `.${path}.html` : `.${path}`)
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
  let loginBodies = []
  let enrollmentBodies = []
  let cloudOffline = false
  let counterConflict = null
  let counterSupported = true
  let subscription = { businessId: 'shop', testMode: true, expiresAt: null }
  const cloudRoute = async route => {
    if (cloudOffline) return route.abort('internetdisconnected')
    const path = new URL(route.request().url()).pathname
    const body = route.request().postDataJSON() || {}
    let result = {}
    if (path === '/v1/sync/capabilities') result = { capabilities: counterSupported ? ['counter-v3'] : [] }
    if (path === '/v1/subscriptions/access') result = subscription
    if (path === '/v1/auth/login') { loginBodies.push(body); result = { account: { id: 'owner', businessId: body.email === 'other@test.com' ? 'other-shop' : 'shop', name: 'Owner', email: body.email, role: 'owner' }, accessToken: 'access' } }
    if (path === '/v1/devices/enroll') { enrollmentBodies.push(body); result = { businessId: 'shop', deviceId: body.deviceId, deviceToken: 'device' } }
    if (path === '/v1/sync/pull') {
      const cursor = Number(new URL(route.request().url()).searchParams.get('cursor') || 0)
      const operations = remoteOperations.slice(cursor, cursor + 500)
      result = { operations, cursor: String(cursor + operations.length) }
    }
    if (path === '/v1/sync/push') {
      pushed.push(...body.operations)
      const rejected = counterConflict ? body.operations.filter(item => item.entityType === 'pos_record' && item.entityId === 'pwa-counter' && ['ready', 'collected'].includes(item.payload.status)) : []
      result = { acceptedOperationIds: body.operations.filter(item => !rejected.includes(item)).map(item => item.operationId), conflicts: rejected.map(item => ({ operationId: item.operationId, entityType: item.entityType, entityId: item.entityId, localPayload: item.payload, remotePayload: counterConflict, reason: 'Concurrent preparation update' })) }
    }
    if (path === '/v1/staff') result = { users: [] }
    await route.fulfill({ json: result })
  }
  // Registration belongs to the app's existing setup screen, not the landing page.
  const registrationContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await registrationContext.route('https://stockroom-0vm5.onrender.com/**', cloudRoute)
  let registrationInput
  await registrationContext.route('**/v1/business-registration', async route => {
    registrationInput = route.request().postDataJSON()
    await route.fulfill({ status: 201, json: { businessId: 'shop', businessName: 'New Shop', email: registrationInput.email } })
  })
  const registrationPage = await registrationContext.newPage()
  await registrationPage.goto(`http://127.0.0.1:${server.address().port}/?screen=register&ref=${'a'.repeat(32)}`)
  await registrationPage.waitForFunction(() => navigator.serviceWorker.controller)
  await registrationPage.getByRole('button', { name: 'I already have a key' }).click()
  await registrationPage.getByRole('heading', { name: 'Set up your shop' }).waitFor()
  await registrationPage.getByLabel('Business registration key').fill(`SBIT-${'b'.repeat(48)}`)
  await registrationPage.getByLabel('Owner name', { exact: true }).fill('Owner')
  await registrationPage.getByLabel('Email', { exact: true }).fill('owner@test.com')
  await registrationPage.getByLabel('Password', { exact: true }).fill('test-password')
  await registrationPage.getByLabel('Confirm password', { exact: true }).fill('test-password')
  assert.equal(await registrationPage.getByLabel('Referral code (optional)').inputValue(), 'a'.repeat(32))
  await registrationPage.getByRole('button', { name: 'Create owner account' }).click()
  await registrationPage.getByRole('button', { name: 'Log out' }).waitFor()
  assert.equal(registrationInput.referralCode, 'a'.repeat(32))
  assert.equal(registrationInput.email, 'owner@test.com')
  assert.equal(new URL(registrationPage.url()).hostname, '127.0.0.1')
  const registeredSettings = await registrationPage.evaluate(async () => (await fetch('/api/settings')).json())
  assert.equal(registeredSettings.cloudConfigured, true)
  await registrationContext.close()
  loginBodies = []; enrollmentBodies = []
  await context.route('https://stockroom-0vm5.onrender.com/**', cloudRoute)
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  // At a phone width the primary navigation is intentionally inside the
  // drawer. Exercise that real interaction instead of treating the hidden
  // sidebar as a desktop navigation bar.
  const navigateMobile = async (target) => {
    await page.getByLabel('Open navigation menu', { exact: true }).click()
    await page.getByRole('button', { name: target, exact: true }).click()
  }
  const errors = []
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
  await page.goto(`http://127.0.0.1:${server.address().port}/?business=shop`)
  await page.waitForFunction(() => navigator.serviceWorker.controller)
  await page.getByRole('heading', { name: 'Sign in to your shop' }).waitFor()
  console.log('PWA loaded')
  const api = (path, body) => page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
    return { status: response.status, data: await response.json() }
  }, { path, body })
  assert.equal((await api('/api/installer/activate', { mode: 'existing', ownerEmail: 'owner@test.com', ownerPassword: 'test-password', deviceId: 'pwa-test', label: 'iPhone' })).status, 201)
  assert.notEqual(enrollmentBodies[0].deviceId, 'pwa-test', 'Enrollment must use the generated browser installation ID, not a form value')
  assert.equal((await api('/api/auth/cloud-session', { email: 'other@test.com', password: 'test-password' })).status, 403)
  assert.deepEqual(loginBodies.at(-1), { email: 'other@test.com', password: 'test-password' }, 'Owner login must return its actual business so the device can reject a mismatch explicitly')
  await page.reload()
  await page.getByLabel('Owner email or staff username', { exact: true }).fill('owner@test.com')
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
  const beforeSale = (await api('/api/sync/status')).data.pending
  const sale = { id: 'sale-test', total: 10, items: [{ productId: created.data.id, quantity: 2, price: 5 }], paymentMethod: 'cash', cashReceived: 20, changeGiven: 999 }
  assert.equal((await api('/api/sales', sale)).status, 201)
  assert.equal((await api('/api/sales', sale)).status, 200)
  assert.equal((await api('/api/products')).data.products[0].stock, 8)
  assert.equal((await api('/api/sync/status')).data.pending, beforeSale + 1)
  const failedSync = await api('/api/sync/now', {})
  assert.ok(failedSync.data.lastError)
  assert.equal((await api('/api/sync/status')).data.pending, beforeSale + 1)
  const rejected = await api('/api/sales', { ...sale, id: 'too-many', total: 500, items: [{ ...sale.items[0], quantity: 100 }] })
  assert.equal(rejected.status, 400)
  assert.equal((await api('/api/products')).data.products[0].stock, 8)
  const startupCloudRequests = []
  const recordStartupCloud = request => { if (/^\/v1\/(auth|devices|sync|subscriptions|pos-paystack)(\/|$)/.test(new URL(request.url()).pathname)) startupCloudRequests.push(request.url()) }
  page.on('request', recordStartupCloud)
  await page.reload()
  await page.getByRole('button', { name: 'Log out' }).waitFor()
  await api('/api/products')
  await api('/api/subscriptions/access')
  assert.deepEqual(startupCloudRequests, [], 'offline startup and local reads must not attempt cloud requests')
  page.off('request', recordStartupCloud)
  const savedCash = (await api('/api/sales')).data.sales.find(row => row.id === sale.id)
  assert.equal(savedCash.cashReceived, 20)
  assert.equal(savedCash.changeGiven, 10)
  assert.equal((await api('/api/products')).data.products[0].stock, 8)
  assert.equal((await api('/api/sync/status')).data.pending, beforeSale + 1)
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
  // A genuinely new device has no local products, cursor, or enrollment.
  // A non-stock payment must persist offline and synchronize its customer snapshot.
  await context.setOffline(true)
  cloudOffline = true
  const servicePayment = { id: 'pwa-service-payment', total: 12, createdAt: new Date().toISOString(), paymentMethod: 'cash', items: [{ productId: 'service:pwa-payment', productName: 'Printing flyers', quantity: 1, price: 12 }], paymentDetails: { amountReceived: 12, servicePayment: { customerName: 'PWA Customer', customerPhone: '08012345678' } } }
  const serviceResult = await api('/api/sales', servicePayment)
  assert.equal(serviceResult.status, 201, JSON.stringify(serviceResult.data))
  assert.equal((await api('/api/sales', servicePayment)).status, 200)
  assert.equal((await api('/api/products')).data.products.find(item => item.id === created.data.id).stock, 8)
  await page.reload()
  await page.getByRole('button', { name: 'Log out' }).waitFor()
  const serviceReceipt = (await api('/api/sales')).data.sales.find(row => row.id === servicePayment.id)
  assert.deepEqual(serviceReceipt.paymentDetails.servicePayment, servicePayment.paymentDetails.servicePayment)
  await context.setOffline(false)
  cloudOffline = false
  await api('/api/sync/now', {})
  assert.equal(pushed.filter(item => item.entityType === 'sale' && item.entityId === servicePayment.id).length, 1)
  assert.equal(pushed.find(item => item.entityId === servicePayment.id).payload.paymentDetails.servicePayment.customerPhone, '08012345678')
  const newDevice = await browser.newContext()
  await newDevice.route('https://stockroom-0vm5.onrender.com/**', cloudRoute)
  const newPage = await newDevice.newPage()
  await newPage.goto(page.url())
  await newPage.waitForFunction(() => navigator.serviceWorker.controller)
  await newPage.getByLabel('Owner email or staff username', { exact: true }).fill('owner@test.com')
  await newPage.getByLabel('Password', { exact: true }).fill('test-password')
  await newPage.getByRole('button', { name: 'Sign in', exact: true }).click()
  await newPage.getByRole('button', { name: 'Log out' }).waitFor()
  await newPage.getByRole('button', { name: 'Stock & checkout', exact: true }).click()
  await newPage.locator('.pos-product').filter({ hasText: 'Tea' }).waitFor()
  assert.equal(await newPage.evaluate(async () => (await (await fetch('/api/products')).json()).products.find(p => p.id === 'remote').stock), 5)
  // Upload one real product on device A, then download it via Refresh on B.
  const milo = (await api('/api/products', { name: 'Milo', sku: 'MILO-SYNC', category: 'Drink', unit: 'tin', stock: 1, reorder: 0, price: 300 })).data
  await page.getByRole('button', { name: 'Sync now', exact: true }).click()
  await page.locator('.sync-feedback').filter({ hasText: 'All changes uploaded; 0 queued.' }).waitFor({ state: 'attached' })
  const uploadedMilo = pushed.find(operation => operation.entityType === 'product' && operation.payload.id === milo.id)
  assert.ok(uploadedMilo, 'Sync must upload Milo before another browser can download it')
  remoteOperations.push(uploadedMilo)
  const uploadCount = pushed.length
  await newPage.getByLabel('Page options').click()
  await newPage.getByRole('button', { name: 'Refresh', exact: true }).click()
  await newPage.locator('.sync-feedback').filter({ hasText: 'Refresh complete.' }).waitFor({ timeout: 5000, state: 'attached' })
  await newPage.locator('.pos-product').filter({ hasText: 'Milo' }).waitFor({ timeout: 5000 })
  assert.equal(pushed.length, uploadCount, 'Refresh must never upload')
  cloudOffline = true
  await page.getByRole('button', { name: 'Sync now', exact: true }).click()
  await page.locator('.sync-feedback').filter({ hasText: 'Sync failed:' }).waitFor({ state: 'attached' })
  cloudOffline = false
  await newDevice.close()
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
  await navigateMobile('Stock count')
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
  await navigateMobile('Stock & checkout')
  await page.locator('.pos-product').filter({ hasText: 'Coffee' }).click()
  await page.getByRole('button', { name: /Take payment/ }).click()
  await page.locator('#pos-payment').getByLabel('Payment method').selectOption('cash')
  assert.equal(await page.getByRole('button', { name: 'Complete sale', exact: true }).isDisabled(), true)
  await page.getByLabel('Cash received', { exact: true }).fill('0.01')
  assert.equal(await page.getByRole('button', { name: 'Complete sale', exact: true }).isDisabled(), true)
  await page.getByLabel('Cash received', { exact: true }).fill('100')
  await page.getByRole('button', { name: 'Edit quantity of Coffee', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Quantity for Coffee', exact: true }).fill('11')
  await page.getByRole('button', { name: 'Save quantity for Coffee', exact: true }).click()
  const stockWarning = page.waitForEvent('dialog').then(async dialog => { const message = dialog.message(); await dialog.accept(); return message })
  await page.getByRole('button', { name: 'Complete sale', exact: true }).click()
  assert.match(await stockWarning, /Insufficient stock for Coffee/)
  assert.equal((await api('/api/products')).data.products.find(item => item.id === created.data.id).stock, 8)
  await page.getByRole('button', { name: 'Edit quantity of Coffee', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Quantity for Coffee', exact: true }).fill('1')
  await page.getByRole('button', { name: 'Save quantity for Coffee', exact: true }).click()
  await page.getByRole('button', { name: 'Complete sale', exact: true }).click()
  await page.getByText('Scan or select a product to begin.', { exact: true }).waitFor()
  const cashSale = (await api('/api/sales')).data.sales.find(row => row.cashReceived === 100)
  assert.ok(cashSale)
  assert.equal(cashSale.changeGiven, 100 - cashSale.total)
  assert.match(await page.locator('.print-receipt').textContent(), /Cash received:.*Change given:/)
  // Exercise wallet checkout through the PWA UI and its local database.
  const walletSettings = (await api('/api/settings')).data
  await page.evaluate(async settings => {
    const result = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...settings, paymentPolicy: { allowWallet: true, allowWalletCredit: true } }) })
    if (!result.ok) throw new Error('Could not enable wallets')
  }, walletSettings)
  const walletCustomer = (await api('/api/customers', { name: 'Wallet browser customer' })).data
  assert.equal((await api('/api/customers/' + walletCustomer.id + '/wallet', { amount: 20, reason: 'Deposit' })).status, 200)
  await page.reload()
  await navigateMobile('Stock & checkout')
  await page.locator('.pos-product').filter({ hasText: 'Coffee' }).click()
  await page.getByRole('button', { name: /Take payment/ }).click()
  await page.locator('#pos-payment').getByRole('combobox', { name: /^Payment method/ }).selectOption('wallet')
  await page.getByRole('combobox', { name: /^Customer wallet/ }).selectOption(walletCustomer.id)
  await page.getByRole('button', { name: 'Complete sale', exact: true }).click()
  await page.getByText('Scan or select a product to begin.', { exact: true }).waitFor()
  const walletAfterSale = (await api('/api/customers')).data.customers.find(c => c.id === walletCustomer.id)
  assert.ok(walletAfterSale.balance < 20)
  assert.equal(walletAfterSale.transactions.length, 2)
  subscription = { businessId: 'shop', testMode: false, expiresAt: '2000-01-01T00:00:00Z' }
  const forceAccess = () => page.evaluate(async () => (await fetch('/api/subscriptions/access', { headers: { 'X-Subscription-Refresh': 'true' } })).json())
  assert.equal((await forceAccess()).blocked, true)
  await page.reload()
  await navigateMobile('Stock & checkout')
  await page.getByRole('heading', { name: 'POS access paused' }).waitFor()
  cloudOffline = true
  assert.equal((await api('/api/sales', { id: 'blocked-sale' })).status, 402)
  cloudOffline = false
  subscription.testMode = true
  await page.getByRole('button', { name: 'Check access again' }).click()
  await page.getByRole('heading', { name: 'Choose products' }).waitFor()
  await navigateMobile('Customer accounts')
  await page.getByRole('heading', { name: 'Wallet browser customer' }).waitFor()
  // Counter orders use the same durable offline storage without a retail basket.
  const profileResult = await page.evaluate(async () => {
    const response = await fetch('/api/settings/shop-profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'general', industry: 'general', workflows: 'both', fastFood: true }) })
    return { status: response.status, data: await response.json() }
  })
  assert.equal(profileResult.status, 200, JSON.stringify(profileResult.data))
  const counterApi = (path, body) => page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, { ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), headers: { 'Content-Type': 'application/json', 'X-Stockroom-Till': 'counter-pwa-till' } })
    return { status: response.status, data: await response.json() }
  }, { path, body })
  await context.setOffline(true); cloudOffline = true
  const counterMenu = await counterApi('/api/pos/counter/menu', { id: 'counter-menu', commandId: 'pwa-menu', expectedUpdatedAt: '', items: [{ id: 'sandwich', name: 'Sandwich', price: 5, type: 'prepared', available: true, productId: '', options: [], recipe: [{ productId: created.data.id, quantity: 0.1 }] }, { id: 'coffee', name: 'Packaged coffee', price: 2, type: 'stock', available: true, productId: created.data.id, options: [] }] })
  assert.equal(counterMenu.status, 200, JSON.stringify(counterMenu.data))
  const counterRequest = { id: 'pwa-counter', commandId: 'pwa-create', expectedUpdatedAt: '', menuUpdatedAt: counterMenu.data.updatedAt, lines: [{ id: 'pwa-food', menuItemId: 'sandwich', quantity: 1, optionIds: [] }, { id: 'pwa-coffee', menuItemId: 'coffee', quantity: 1, optionIds: [] }] }
  const counterOrder = await counterApi('/api/pos/counter/orders', counterRequest)
  assert.equal(counterOrder.status, 200, JSON.stringify(counterOrder.data))
  assert.equal((await counterApi('/api/pos/counter/orders', counterRequest)).status, 200)
  const beforeCounterStock = (await api('/api/products')).data.products.find(row => row.id === created.data.id).stock
  let counter = counterOrder.data
  for (const status of ['preparing', 'ready']) {
    const result = await counterApi('/api/pos/counter/status', { id: counter.id, commandId: status, expectedUpdatedAt: counter.updatedAt, status })
    assert.equal(result.status, 200, JSON.stringify(result.data)); counter = result.data
    if (status === 'preparing') counterConflict = counter
  }
  const counterSale = { id: 'counter-payment:pwa-counter', currency: counter.currency, total: 7, paymentMethod: 'cash', createdAt: new Date().toISOString(), items: [{ productId: 'service:counter:pwa-food', productName: 'Sandwich', quantity: 1, price: 5 }, { productId: created.data.id, productName: 'Packaged coffee', quantity: 1, price: 2 }], paymentDetails: { amountReceived: 10, pos: counter.pos, counterOrder: { id: counter.id, tillId: 'counter-pwa-till' } } }
  const paymentResult = await counterApi('/api/sales', counterSale)
  assert.equal(paymentResult.status, 201, JSON.stringify(paymentResult.data))
  assert.equal((await counterApi('/api/sales', counterSale)).status, 200)
  assert.equal((await counterApi('/api/sales', { ...counterSale, paymentDetails: { ...counterSale.paymentDetails, amountReceived: 20 } })).status, 400)
  assert.ok(Math.abs((await api('/api/products')).data.products.find(row => row.id === created.data.id).stock - (beforeCounterStock - 1.1)) < 0.000001)
  assert.equal((await counterApi('/api/pos/counter')).data.consumptions.length, 1)
  assert.equal((await counterApi('/api/pos/counter/status', { id: counter.id, commandId: 'collect', expectedUpdatedAt: counter.updatedAt, status: 'collected' })).status, 200)
  await page.reload()
  await page.getByRole('button', { name: 'Log out' }).waitFor()
  const restoredCounter = (await counterApi('/api/pos/counter')).data.orders.find(row => row.id === counter.id)
  assert.equal(restoredCounter.status, 'collected'); assert.equal(restoredCounter.receiptId, counterSale.id)
  await context.setOffline(false); cloudOffline = false
  counterSupported = false
  const unsupportedSync = await api('/api/sync/now', {})
  assert.match(unsupportedSync.data.lastError, /Update the cloud server/)
  assert.equal(pushed.filter(row => row.entityId === counterSale.id).length, 0)
  assert.ok(unsupportedSync.data.pending > 0)
  counterSupported = true
  await api('/api/sync/now', {})
  assert.equal(pushed.filter(row => row.entityType === 'sale' && row.entityId === counterSale.id).length, 1)
  assert.equal((await counterApi('/api/pos/counter')).data.orders.find(row => row.id === counter.id).status, 'preparing')
  const conflicts = (await api('/api/sync/conflicts')).data.conflicts
  assert.equal(conflicts.length, 2)
  for (const conflict of conflicts) assert.equal((await api('/api/sync/conflicts/' + conflict.id + '/resolve', {})).status, 200)
  counterConflict = null
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
  await desktopPage.getByRole('heading', { name: 'Welcome to Stockroom' }).waitFor()
  await desktopPage.getByRole('button', { name: 'New business with a key' }).waitFor()
  assert.equal(await desktopPage.getByLabel('Installer Admin API key').count(), 0)
  await desktopPage.getByRole('button', { name: 'Existing business', exact: true }).click()
  await desktopPage.getByRole('heading', { name: 'Add another device' }).waitFor()
  assert.equal(await desktopPage.evaluate(async () => (await (await fetch('/api/health')).json()).desktopServer), true)
  await desktop.close()
  console.log('PWA passed: enrollment, business isolation, login/logout, offline reload, durable sales/outbox, duplicate retry, rollback, sync, menu and mobile width.')
} finally { await browser.close(); server.close() }
