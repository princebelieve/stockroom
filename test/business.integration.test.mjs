import { priceOrder, posSettings } from '../server/pos-pricing.mjs'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { isNewerMutableOperation, mutableEntities } from '../cloud/conflict-policy.mjs'
import { normalizeShopProfile } from '../server/shop-profile.mjs'

const tempDirectories = []
const processes = []
const subscriptionClouds = []
let port = 9200

async function startBusiness({ syncApiUrl, entitlement = { testMode: true, expiresAt: null } } = {}) {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'stockroom-test-'))
  tempDirectories.push(dataDirectory)
  const serverPort = ++port
  if (!syncApiUrl) {
    const cloud = createServer((request, response) => {
      if (request.url === '/v1/subscriptions/access') { response.setHeader('Content-Type', 'application/json'); return response.end(JSON.stringify({ businessId: 'test-business', ...entitlement })) }
      response.writeHead(503); response.end()
    })
    cloud.listen(0, '127.0.0.1'); await once(cloud, 'listening')
    subscriptionClouds.push(cloud)
    syncApiUrl = `http://127.0.0.1:${cloud.address().port}`
  }
  const child = spawn(globalThis.process.execPath, ['server/index.mjs'], {
    cwd: process.cwd(),
    env: { ...globalThis.process.env, PORT: String(serverPort), CUSTOMER_DISPLAY_PORT: String(serverPort + 100), STOCKROOM_DATA_DIR: dataDirectory, SYNC_CONFIG_PATH: join(dataDirectory, 'sync-config.json'), ...(syncApiUrl ? { SYNC_API_URL: syncApiUrl, SYNC_DEVICE_TOKEN: 'test-device-token', BUSINESS_ID: 'test-business', DEVICE_ID: `device-${serverPort}` } : {}) },
    stdio: 'ignore',
  })
  processes.push(child)
  const baseUrl = `http://127.0.0.1:${serverPort}`
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return { baseUrl, dataDirectory, serverPort } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Local business server did not start.')
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill()
  await once(child, 'exit').catch(() => undefined)
}
async function json(url, options) { const response = await fetch(url, options); return { response, body: await response.json() } }

async function createOwner(baseUrl, email = `owner${Date.now()}@test.local`) {
  const { body } = await json(`${baseUrl}/api/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appName: 'Test Shop', ownerName: 'Owner', email, password: 'long-test-password' }) })
  return body.token
}

async function product(baseUrl, token, stock = 5) {
  const { body } = await json(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: 'Test Product', sku: `SKU-${Date.now()}-${Math.random()}`, category: 'Test', stock, reorder: 1, price: 10, cost: 4, unit: 'piece' }) })
  return body
}

after(async () => {
  await Promise.all(processes.map((child) => stop(child)))
  await Promise.all(subscriptionClouds.map(cloud => new Promise(resolve => { cloud.close(resolve); cloud.closeAllConnections() })))
  await Promise.all(tempDirectories.map((directory) => rm(directory, { recursive: true, force: true })))
})

test('expired subscriptions reject sales without changing stock; developer test mode restores POS', async () => {
  const entitlement = { testMode: false, expiresAt: '2000-01-01T00:00:00Z' }
  const { baseUrl } = await startBusiness({ entitlement })
  const token = await createOwner(baseUrl)
  const item = await product(baseUrl, token, 5)
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const sale = { id: 'subscription-block-test', items: [{ productId: item.id, quantity: 1, price: 10 }], total: 10, createdAt: new Date().toISOString(), paymentMethod: 'cash', cashReceived: 10 }
  const post = () => json(`${baseUrl}/api/sales`, { method: 'POST', headers, body: JSON.stringify(sale) })
  assert.equal((await post()).response.status, 402)
  const products = await json(`${baseUrl}/api/products`, { headers })
  assert.equal(products.body.products.find(row => row.id === item.id).stock, 5)
  entitlement.testMode = true
  const access = await json(`${baseUrl}/api/subscriptions/access`, { headers: { ...headers, 'X-Subscription-Refresh': 'true' } })
  assert.equal(access.body.blocked, false)
  assert.equal((await post()).response.status, 201)
})

test('offline sale is committed locally and duplicate sale IDs do not reduce stock twice', async () => {
  const { baseUrl } = await startBusiness()
  const token = await createOwner(baseUrl)
  const anonymousProducts = await json(`${baseUrl}/api/products`)
  assert.equal(anonymousProducts.response.status, 401)
  const secondSetup = await json(`${baseUrl}/api/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appName: 'Other Shop', ownerName: 'Intruder', email: `second${Date.now()}@test.local`, password: 'long-test-password' }) })
  assert.equal(secondSetup.response.status, 403)
  const item = await product(baseUrl, token, 5)
  const sale = { id: 'sale-idempotency-test', items: [{ productId: item.id, quantity: 2, price: 10 }], total: 20, createdAt: new Date().toISOString(), paymentMethod: 'cash', cashReceived: 50, changeGiven: 999 }
  const invalidCash = await json(`${baseUrl}/api/sales`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...sale, cashReceived: 10 }) })
  assert.equal(invalidCash.response.status, 400)
  const first = await json(`${baseUrl}/api/sales`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(sale) })
  const second = await json(`${baseUrl}/api/sales`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(sale) })
  assert.equal(first.response.status, 201); assert.equal(second.response.status, 201)
  const products = await json(`${baseUrl}/api/products`, { headers: { Authorization: `Bearer ${token}` } })
  assert.equal(products.body.products.find((value) => value.id === item.id).stock, 3)
  const sales = await json(`${baseUrl}/api/sales`, { headers: { Authorization: `Bearer ${token}` } })
  assert.equal(sales.body.sales.filter((value) => value.id === sale.id).length, 1)
  assert.equal(sales.body.sales.find(value => value.id === sale.id).cashReceived, 50)
  assert.equal(sales.body.sales.find(value => value.id === sale.id).changeGiven, 30)
})

test('supermarket reports handle multi-item receipts and returns, and stock transfers accept fractions', async () => {
  const { baseUrl } = await startBusiness()
  const token = await createOwner(baseUrl)
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const request = (path, body, method = 'POST') => json(`${baseUrl}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })
  const first = await product(baseUrl, token, 10)
  const second = await product(baseUrl, token, 10)
  const sale = { id: 'report-basket', items: [{ productId: first.id, quantity: 2, price: 10 }, { productId: second.id, quantity: 1, price: 10 }], total: 30, createdAt: new Date().toISOString(), paymentMethod: 'cash', cashReceived: 30 }
  assert.equal((await request('/api/sales', sale)).response.status, 201)
  assert.deepEqual((await request('/api/reports', undefined, 'GET')).body.profit, { revenue: 30, cost: 12, expenses: 0, amount: 18 })
  const refund = { id: 'report-refund', saleId: sale.id, reason: 'Customer return', method: 'cash', items: [{ lineIndex: 0, quantity: 0.5, restock: true }] }
  assert.equal((await request('/api/pos/returns', refund)).response.status, 200)
  assert.equal((await request('/api/pos/returns', refund)).response.status, 200)
  assert.deepEqual((await request('/api/reports', undefined, 'GET')).body.profit, { revenue: 25, cost: 10, expenses: 0, amount: 15 })
  const destination = await request('/api/branches', { name: 'Second branch' })
  assert.equal(destination.response.status, 201)
  const transfer = await request('/api/branch-transfers', { fromBranchId: 'main', toBranchId: destination.body.id, productId: first.id, quantity: 0.25, reason: 'Measured stock transfer' })
  assert.equal(transfer.response.status, 201, JSON.stringify(transfer.body))
  const stock = (await request('/api/products', undefined, 'GET')).body.products.find(row => row.id === first.id).stock
  assert.equal(stock, 8.25)
})

test('supermarket supplier cash settlement, stock shortages and till shortages reconcile end to end', async()=>{
  const {baseUrl}=await startBusiness()
  const token=await createOwner(baseUrl)
  const headers={'Content-Type':'application/json',Authorization:`Bearer ${token}`}
  const request=async(path,body,method='POST')=>{
    const result=await json(`${baseUrl}${path}`,{method,headers,...(body?{body:JSON.stringify(body)}:{})})
    assert.ok(result.response.ok,JSON.stringify(result.body));return result.body
  }
  const item=await product(baseUrl,token,10)
  const register=await request('/api/pos/registers',{action:'open',amount:100})
  await request('/api/retail',{id:'cash-supplier',kind:'supplier',name:'Wholesale'})
  await request('/api/retail',{id:'cash-delivery',kind:'receipt',supplierId:'cash-supplier',reference:'INV',amountPaid:12,paymentMethod:'cash',lines:[{productId:item.id,quantity:4,unitCost:6}]})
  await request('/api/retail',{id:'cash-payment',kind:'supplier-payment',supplierId:'cash-supplier',reference:'PAY',amount:10,method:'cash'})
  await request('/api/retail',{id:'cash-return',kind:'supplier-return',supplierId:'cash-supplier',receiptId:'cash-delivery',reference:'RETURN',lines:[{productId:item.id,quantity:1}]})
  await request('/api/retail',{id:'cash-refund',kind:'supplier-refund',supplierId:'cash-supplier',reference:'REFUND',amount:4,method:'cash'})
  const closed=await request('/api/pos/registers',{id:register.id,action:'close',amount:80,reason:'Two naira short'})
  assert.equal(closed.expectedCash,82);assert.equal(closed.difference,-2)
  await request(`/api/products/${item.id}/stock`,{amount:-2,reason:'Damaged stock'})
  const count=await request('/api/stocktakes',{})
  const line=count.counts.find(row=>row.productId===item.id)
  await request(`/api/stocktakes/${count.id}/counts/${line.id}`,{counted:line.expected-1},'PUT')
  await request(`/api/stocktakes/${count.id}/approve`,{reason:'Shelf shortage'})
  const report=await request('/api/reports',undefined,'GET')
  assert.equal(report.supermarket.stockLoss,12)
  assert.equal(report.supermarket.cashShortage,2)
  assert.equal(report.supermarket.suppliers.find(row=>row.id==='cash-supplier').balance,0)
  assert.equal(report.profit.amount,-14)
})

test('wallet payments require owner settings, debit once, allow approved debt and record repayments', async () => {
  const { baseUrl, dataDirectory } = await startBusiness()
  const token = await createOwner(baseUrl)
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const request = (path, body, method = 'POST') => json(`${baseUrl}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })
  const item = await product(baseUrl, token, 10)
  const customer = (await request('/api/customers', { name: 'Wallet customer' })).body
  const sale = { id: 'wallet-prepaid', items: [{ productId: item.id, quantity: 1, price: 10 }], total: 10, createdAt: new Date().toISOString(), paymentMethod: 'wallet', paymentDetails: { customerId: customer.id } }
  assert.equal((await request('/api/sales', sale)).response.status, 400)
  const settings = (await request('/api/settings', undefined, 'GET')).body
  assert.equal((await request('/api/settings', { ...settings, paymentPolicy: { allowWallet: true } }, 'PUT')).response.status, 200)
  assert.equal((await request(`/api/customers/${customer.id}/wallet`, { amount: 15, reason: 'Deposit' })).response.status, 200)
  assert.equal((await request('/api/sales', sale)).response.status, 201)
  assert.equal((await request('/api/sales', sale)).response.status, 201)
  const balance = async () => (await request('/api/customers', undefined, 'GET')).body.customers.find(c => c.id === customer.id)
  assert.equal((await balance()).balance, 5)
  const creditSale = { ...sale, id: 'wallet-credit', paymentDetails: { customerId: customer.id, creditApproved: true } }
  assert.equal((await request('/api/sales', creditSale)).response.status, 400)
  await request('/api/settings', { ...settings, paymentPolicy: { allowWallet: true, allowWalletCredit: true } }, 'PUT')
  const db = new DatabaseSync(join(dataDirectory, 'stockroom.sqlite'))
  try {
    db.prepare("UPDATE users SET role = 'admin' WHERE role = 'owner'").run()
    assert.equal((await request('/api/sales', creditSale)).response.status, 403)
    db.prepare("UPDATE users SET role = 'owner' WHERE role = 'admin'").run()
  } finally { db.close() }
  assert.equal((await request('/api/sales', { ...sale, id: 'underfunded' })).response.status, 400)
  assert.equal((await request('/api/sales', creditSale)).response.status, 201)
  assert.equal((await balance()).balance, -5)
  assert.equal((await request(`/api/customers/${customer.id}/wallet`, { amount: -1, reason: 'Withdrawal' })).response.status, 400)
  assert.equal((await request(`/api/customers/${customer.id}/wallet`, { amount: 2, reason: 'Partial repayment' })).response.status, 200)
  assert.equal((await balance()).balance, -3)
  await request(`/api/customers/${customer.id}/wallet`, { amount: 3, reason: 'Final repayment' })
  const final = await balance()
  assert.equal(final.balance, 0)
  assert.equal(final.transactions.length, 5)
  assert.equal(final.transactions.reduce((sum, entry) => sum + entry.amount, 0), final.balance)
})

test('queued local changes synchronize after cloud service becomes reachable', async () => {
  const received = []
  let cloudOnline = false
  const cloud = createServer(async (request, response) => {
    if (!cloudOnline) { response.writeHead(503); return response.end() }
    if (request.url === '/v1/sync/push') { let body = ''; for await (const chunk of request) body += chunk; received.push(...JSON.parse(body).operations); response.writeHead(200, { 'Content-Type': 'application/json' }); return response.end(JSON.stringify({ acceptedOperationIds: received.map((value) => value.operationId), conflicts: [] })) }
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ operations: [], cursor: '' }))
  })
  cloud.listen(0, '127.0.0.1'); await once(cloud, 'listening')
  const cloudUrl = `http://127.0.0.1:${cloud.address().port}`
  const { baseUrl } = await startBusiness({ syncApiUrl: cloudUrl })
  const token = await createOwner(baseUrl)
  await product(baseUrl, token)
  await json(`${baseUrl}/api/sync/now`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  cloudOnline = true
  await json(`${baseUrl}/api/sync/now`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  assert.ok(received.some((operation) => operation.entityType === 'product'))
  cloud.close()
})

test('a new device downloads every product page and retries without duplicating stock', async () => {
  const operations = Array.from({ length: 501 }, (_, index) => ({ operationId: `catalogue-${index}`, entityType: 'product', entityId: `product-${index}`, action: 'upsert', createdAt: '2026-01-01T00:00:00.000Z', payload: { id: `product-${index}`, name: `Product ${index}`, sku: `SYNC-${index}`, category: 'Test', unit: 'piece', stock: 5, reorder: 1, price: 300 } }))
  const cloud = createServer(async (request, response) => {
    if (request.url === '/v1/sync/push') {
      let body = ''; for await (const chunk of request) body += chunk
      response.writeHead(200, { 'Content-Type': 'application/json' })
      return response.end(JSON.stringify({ acceptedOperationIds: JSON.parse(body).operations.map(operation => operation.operationId) }))
    }
    const cursor = Number(new URL(request.url, 'http://localhost').searchParams.get('cursor') || 0)
    const page = operations.slice(cursor, cursor + 500)
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ operations: page, cursor: String(cursor + page.length) }))
  })
  cloud.listen(0, '127.0.0.1'); await once(cloud, 'listening')
  try {
    const { baseUrl } = await startBusiness({ syncApiUrl: `http://127.0.0.1:${cloud.address().port}` })
    const token = await createOwner(baseUrl)
    const headers = { Authorization: `Bearer ${token}` }
    const pull = await json(`${baseUrl}/api/sync/pull`, { method: 'POST', headers })
    assert.equal(pull.body.lastError, '')
    const products = (await json(`${baseUrl}/api/products`, { headers })).body.products
    assert.equal(products.length, 501)
    assert.equal(products.find(p => p.id === 'product-500').price, 300)
    await json(`${baseUrl}/api/sync/pull`, { method: 'POST', headers })
    assert.equal((await json(`${baseUrl}/api/products`, { headers })).body.products.find(p => p.id === 'product-500').stock, 5)
  } finally { cloud.close() }
})

test('concurrent mutable changes use latest timestamp while inventory events remain append-only', () => {
  assert.ok(mutableEntities.has('product'))
  const current = { updatedAt: '2026-01-01T12:00:00.000Z' }
  assert.equal(isNewerMutableOperation({ createdAt: '2026-01-01T11:00:00.000Z', payload: {} }, current), false)
  assert.equal(isNewerMutableOperation({ createdAt: '2026-01-01T13:00:00.000Z', payload: {} }, current), true)
  assert.equal(mutableEntities.has('stock'), false)
  assert.equal(mutableEntities.has('sale'), false)
})

test('restart preserves installed business data, modeling an application upgrade', async () => {
  const first = await startBusiness()
  const ownerEmail = `owner-restart-${Date.now()}@test.local`
  const token = await createOwner(first.baseUrl, ownerEmail)
  const item = await product(first.baseUrl, token, 7)
  const setup = await json(`${first.baseUrl}/api/settings/shop-profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ mode: 'suggested', industry: 'printing' }) })
  assert.equal(setup.response.status, 200)
  assert.equal(setup.body.unit, 'copy')
  const running = processes.at(-1); await stop(running)
  const secondPort = ++port
  const restarted = spawn(globalThis.process.execPath, ['server/index.mjs'], { cwd: globalThis.process.cwd(), env: { ...globalThis.process.env, PORT: String(secondPort), CUSTOMER_DISPLAY_PORT: String(secondPort + 100), STOCKROOM_DATA_DIR: first.dataDirectory }, stdio: 'ignore' })
  processes.push(restarted)
  const baseUrl = `http://127.0.0.1:${secondPort}`
  for (let attempt = 0; attempt < 80; attempt++) { try { if ((await fetch(`${baseUrl}/api/health`)).ok) break } catch {}; await new Promise((resolve) => setTimeout(resolve, 50)) }
  const login = await json(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ownerEmail, password: 'long-test-password' }) })
  const products = await json(`${baseUrl}/api/products`, { headers: { Authorization: `Bearer ${login.body.token}` } })
  assert.equal(products.body.products.find((value) => value.id === item.id).stock, 7)
  assert.equal(products.body.products.find((value) => value.id === item.id).unit, 'piece')
  assert.equal((await json(`${baseUrl}/api/settings`)).body.shopProfile.industry, 'printing')
})

test('shop setup validates input, requires owner access, and queues business-wide settings', async () => {
  const { baseUrl, dataDirectory } = await startBusiness()
  const token = await createOwner(baseUrl)
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const profile = { mode: 'custom', industry: 'printing', itemLabel: 'Printed item', inventoryLabel: 'Print catalogue', unit: 'sheet', categories: ['Cards', 'Flyers'] }
  assert.equal((await json(`${baseUrl}/api/settings/shop-profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) })).response.status, 403)
  assert.equal((await json(`${baseUrl}/api/settings/shop-profile`, { method: 'PUT', headers, body: JSON.stringify({ ...profile, unit: '' }) })).response.status, 400)
  assert.equal((await json(`${baseUrl}/api/settings/shop-profile`, { method: 'PUT', headers, body: JSON.stringify(profile) })).response.status, 200)
  const settings = (await json(`${baseUrl}/api/settings`)).body
  assert.equal(settings.shopProfile.unit, 'sheet')
  const { shopProfile, ...oldClientSettings } = settings
  assert.equal((await json(`${baseUrl}/api/settings`, { method: 'PUT', headers, body: JSON.stringify(oldClientSettings) })).response.status, 200)
  assert.equal((await json(`${baseUrl}/api/settings`)).body.shopProfile.itemLabel, 'Printed item')
  const db = new DatabaseSync(join(dataDirectory, 'stockroom.sqlite'))
  try {
    const snapshots = db.prepare("SELECT payload FROM sync_outbox WHERE entity_type = 'settings'").all().map(row => JSON.parse(row.payload))
    assert.ok(snapshots.some(snapshot => snapshot.shopProfile?.unit === 'sheet'))
  } finally { db.close() }
})


test('custom product values validate, persist, synchronize and survive field removal', async () => {
  const { baseUrl, dataDirectory } = await startBusiness()
  const token = await createOwner(baseUrl)
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const request = (path, value, method = 'PUT') => json(`${baseUrl}${path}`, { method, headers, body: JSON.stringify(value) })
  const profile = normalizeShopProfile({ mode: 'suggested', industry: 'printing' })
  const field = profile.fields.find(field => field.id === 'custom_printing_finish')
  Object.assign(field, { type: 'select', options: ['Gloss', 'Matte'], required: true })
  assert.equal((await request('/api/settings/shop-profile', profile)).response.status, 200)
  const input = { name: 'Flyer', sku: 'FLYER', category: 'Print', unit: 'copy', stock: 8, reorder: 0, cost: 2, price: 5 }
  assert.equal((await request('/api/products', input, 'POST')).response.status, 400)
  const created = await request('/api/products', { ...input, customValues: { [field.id]: 'Gloss' } }, 'POST')
  assert.equal(created.response.status, 201)
  const id = created.body.id
  let rows = (await json(`${baseUrl}/api/products`, { headers })).body.products
  assert.equal(JSON.parse(rows.find(row => row.id === id).customValues)[field.id], 'Gloss')
  assert.equal((await request(`/api/products/${id}/custom-values`, { customValues: { [field.id]: 'Bad' } })).response.status, 400)
  assert.equal((await request(`/api/products/${id}/custom-values`, { customValues: { [field.id]: 'Matte' } })).response.status, 200)
  field.visible = false
  assert.equal((await request('/api/settings/shop-profile', profile)).response.status, 200)
  assert.equal((await request(`/api/products/${id}/custom-values`, { customValues: {} })).response.status, 200)
  rows = (await json(`${baseUrl}/api/products`, { headers })).body.products
  assert.equal(JSON.parse(rows.find(row => row.id === id).customValues)[field.id], 'Matte')
  assert.equal(rows.find(row => row.id === id).stock, 8)
  const db = new DatabaseSync(join(dataDirectory, 'stockroom.sqlite'))
  try { const snapshots = db.prepare("SELECT payload FROM sync_outbox WHERE entity_type = 'product'").all().map(row => JSON.parse(row.payload)); assert.ok(snapshots.some(row => (typeof row.customValues === 'string' ? JSON.parse(row.customValues) : row.customValues)?.[field.id] === 'Matte')) } finally { db.close() }
})

test('desktop subscription bridge uses enrolled cloud and preserves cloud authentication failures', async () => {
  const cloud = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/v1/subscriptions') {
      response.writeHead(request.headers.authorization === 'Bearer cloud-owner' ? 200 : 403)
      return response.end(JSON.stringify(request.headers.authorization === 'Bearer cloud-owner' ? { isDeveloper: false } : { error: 'Sign in with your cloud owner account.' }))
    }
    response.writeHead(404); response.end('{}')
  })
  cloud.listen(0, '127.0.0.1'); await once(cloud, 'listening'); subscriptionClouds.push(cloud)
  const { baseUrl } = await startBusiness({ syncApiUrl: `http://127.0.0.1:${cloud.address().port}` })
  const token = await createOwner(baseUrl)
  const url = `${baseUrl}/api/cloud/v1/subscriptions`
  assert.equal((await fetch(url)).status, 401)
  const headers = { 'X-Local-Session': token, Authorization: 'Bearer cloud-owner' }
  const result = await json(url, { headers })
  assert.equal(result.response.status, 200)
  assert.equal(result.body.isDeveloper, false)
  assert.equal((await fetch(url, { headers: { 'X-Local-Session': token } })).status, 403)
  assert.equal((await fetch(`${baseUrl}/api/cloud/v1/staff`, { headers })).status, 404)
})


test('desktop downloads the complete staff directory, preserves owner login, and retains staff offline', async () => {
  const ownerEmail = 'directory-owner@test.local'
  let online = true
  const users = [
    { id: 'remote-owner', name: 'Owner', email: ownerEmail, role: 'owner' },
    { id: 'remote-admin', name: 'Admin', username: 'manager', role: 'admin' },
    { id: 'remote-cashier', name: 'Cashier', username: 'cashier', role: 'cashier', operationalAccess: true },
  ]
  const cloud = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (!online) { response.writeHead(503); return response.end(JSON.stringify({ error: 'Cloud offline' })) }
    if (request.url === '/v1/auth/me') return response.end(JSON.stringify({ account: { ...users[0], businessId: 'test-business' } }))
    if (request.url === '/v1/staff') return response.end(JSON.stringify({ users }))
    response.writeHead(404); response.end('{}')
  })
  cloud.listen(0, '127.0.0.1'); await once(cloud, 'listening'); subscriptionClouds.push(cloud)
  const { baseUrl } = await startBusiness({ syncApiUrl: `http://127.0.0.1:${cloud.address().port}` })
  const token = await createOwner(baseUrl, ownerEmail)
  const headers = { Authorization: `Bearer ${token}`, 'X-Cloud-Access-Token': 'cloud-owner' }
  const load = () => json(`${baseUrl}/api/users`, { headers })
  const fresh = await load()
  assert.equal(fresh.response.status, 200)
  assert.equal(fresh.body.refreshed, true, fresh.body.refreshError)
  assert.equal(fresh.body.users.length, 3)
  assert.deepEqual(fresh.body.users.map(user => user.role).sort(), ['admin', 'cashier', 'owner'])
  assert.equal(fresh.body.users.find(user => user.id === 'remote-cashier').operationalAccess, true)
  assert.equal((await load()).body.users.length, 3, 'repeated refresh must not duplicate the owner')
  assert.equal((await fetch(`${baseUrl}/api/auth/session`, { headers })).status, 200)
  const login = await json(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ownerEmail, password: 'long-test-password' }) })
  assert.equal(login.response.status, 200, 'refresh preserves the owner password')
  online = false
  const cached = await load()
  assert.equal(cached.body.refreshed, false)
  assert.equal(cached.body.users.length, 3)
  assert.ok(cached.body.refreshError)
})


test('existing installer registration sends its enrolled device credential to cloud', async () => {
  let received
  const cloud = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.url !== '/v1/auth/register') { response.writeHead(503); response.end('{}'); return }
    let body = ''; for await (const chunk of request) body += chunk
    received = { authorization: request.headers.authorization, body: JSON.parse(body) }
    response.end(JSON.stringify({ accessToken: 'owner-access' }))
  })
  cloud.listen(0, '127.0.0.1'); await once(cloud, 'listening'); subscriptionClouds.push(cloud)
  const { baseUrl } = await startBusiness({ syncApiUrl: `http://127.0.0.1:${cloud.address().port}` })
  const result = await json(`${baseUrl}/api/auth/cloud-register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ownerName: 'Owner', email: 'owner@test.com', password: 'long-password' }) })
  assert.equal(result.response.status, 201)
  assert.equal(received.authorization, 'Bearer test-device-token')
  assert.equal(received.body.businessId, 'test-business')
})


test('purchasing API preserves existing data, receives cartons once, and writes durable migration and sync records', async () => {
  const {baseUrl,dataDirectory,serverPort}=await startBusiness()
  const token=await createOwner(baseUrl)
  const item=await product(baseUrl,token,5)
  const headers={ 'Content-Type':'application/json',Authorization:`Bearer ${token}` }
  const send=input=>json(`${baseUrl}/api/retail`,{method:'POST',headers,body:JSON.stringify(input)})
  const invalidSale={id:'invalid-purchasing-sale',items:[{productId:item.id,quantity:-1,price:10}],total:10,paymentMethod:'cash',cashReceived:10,createdAt:new Date().toISOString()}
  assert.equal((await json(`${baseUrl}/api/sales`,{method:'POST',headers,body:JSON.stringify(invalidSale)})).response.status,400)
  assert.equal((await json(`${baseUrl}/api/products`,{headers})).body.products[0].stock,5)

  assert.equal((await json(`${baseUrl}/api/retail`)).response.status,403)
  assert.equal((await send({id:'supplier-1',kind:'supplier',name:'Wholesale'})).response.status,201)
  assert.equal((await send({id:'pack-1',kind:'conversion',productId:item.id,label:'Carton',factor:24})).response.status,201)
  const delivery={id:'delivery-1',kind:'receipt',supplierId:'supplier-1',reference:'Invoice-1',lines:[{productId:item.id,quantity:2,conversionId:'pack-1',unitCost:96}]}
  assert.equal((await send(delivery)).response.status,201)
  assert.equal((await send(delivery)).response.status,201)
  assert.equal((await json(`${baseUrl}/api/products`,{headers})).body.products[0].stock,53)
  const db=new DatabaseSync(join(dataDirectory,'stockroom.sqlite'))
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM retail_records WHERE kind='receipt'").get().n,1)
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sync_outbox WHERE entity_type='retail_record'").get().n,3)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n,2)
  } finally {db.close()}
  await stop(processes.at(-1))
  const legacy=new DatabaseSync(join(dataDirectory,'stockroom.sqlite'))
  legacy.exec("DELETE FROM schema_migrations WHERE module='retail'")
  legacy.close()
  const child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:String(serverPort),CUSTOMER_DISPLAY_PORT:String(serverPort+100),STOCKROOM_DATA_DIR:dataDirectory,SYNC_CONFIG_PATH:join(dataDirectory,'sync-config.json')},stdio:'ignore'})
  processes.push(child)
  for(let attempt=0;attempt<80;attempt++){try{if((await fetch(`${baseUrl}/api/health`)).ok)break}catch{};await new Promise(resolve=>setTimeout(resolve,50))}
  assert.equal((await json(`${baseUrl}/api/products`,{headers})).body.products[0].stock,53)
  const {readdir}=await import('node:fs/promises')
  const backup=(await readdir(dataDirectory)).find(name=>name.startsWith('pre-retail-upgrade-'))
  assert.ok(backup,'An established database is backed up before migrating')
  const snapshot=new DatabaseSync(join(dataDirectory,backup),{readOnly:true})
  try { assert.equal(snapshot.prepare('SELECT stock FROM branch_inventory WHERE product_id=?').get(item.id).stock,53) }
  finally {snapshot.close()}
})


test('offline POS earns and spends rewards, returns restore them, and till stock pools are enforced',async()=>{
 const {baseUrl}=await startBusiness()
 const token=await createOwner(baseUrl)
 const headers={'Content-Type':'application/json',Authorization:`Bearer ${token}`,'X-Stockroom-Till':'till-a'}
 const post=(path,input,override={})=>json(baseUrl+path,{method:'POST',headers:{...headers,...override},body:JSON.stringify(input)})
 const item=await product(baseUrl,token,10)
 const customer=await post('/api/customers',{name:'Rewards customer',phone:'555'})
 assert.equal(customer.response.status,201)
 const settings=posSettings({loyaltyEnabled:true,loyaltyRate:10,taxEnabled:true,taxRate:20,taxRates:{[item.id]:0}})
 assert.equal((await post('/api/pos/settings',settings)).response.status,200)
 const sell=async(id,rewards=0,override={})=>{
  const items=[{productId:item.id,quantity:1,price:10}]
  const pos={customerId:customer.body.id,loyaltyRedeemed:rewards,tax:settings}
  const pricing=priceOrder(items,pos)
  return post('/api/sales',{id,items,total:pricing.total,createdAt:new Date().toISOString(),paymentMethod:'cash',paymentDetails:{amountReceived:pricing.total,pos}},override)
 }
 assert.equal((await sell('earn')).response.status,201)
 let data=await json(baseUrl+'/api/pos',{headers})
 assert.equal(data.body.loyaltyBalances[customer.body.id],1)
 assert.equal((await sell('spend',1)).response.status,201)
 const rejected=await sell('overspend',1)
 assert.equal(rejected.response.status,400)
 assert.match(rejected.body.error,/Insufficient/)
 const returned=await post('/api/pos/returns',{id:'return-rewards',saleId:'spend',reason:'Customer return',method:'cash',items:[{lineIndex:0,quantity:1,restock:true}]})
 assert.equal(returned.response.status,200)
 assert.equal(returned.body.total,9)
 assert.equal(returned.body.loyaltyRestored,1)
 data=await json(baseUrl+'/api/pos',{headers})
 assert.equal(data.body.loyaltyBalances[customer.body.id],1)
 const poolSettings={...settings,offlineStockPoolsEnabled:true,stockPools:{'till-a':'main'}}
 assert.equal((await post('/api/pos/settings',poolSettings)).response.status,200)
 assert.equal((await sell('own-pool')).response.status,201)
 const wrong=await sell('other-till',0,{'X-Stockroom-Till':'till-b'})
 assert.equal(wrong.response.status,400)
 assert.match(wrong.body.error,/assigned stock/)
 // No external cloud endpoint is needed for any sale above.
})
