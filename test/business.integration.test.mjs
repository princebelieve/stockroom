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
  const running = processes.at(-1); await stop(running)
  const secondPort = ++port
  const restarted = spawn(globalThis.process.execPath, ['server/index.mjs'], { cwd: globalThis.process.cwd(), env: { ...globalThis.process.env, PORT: String(secondPort), CUSTOMER_DISPLAY_PORT: String(secondPort + 100), STOCKROOM_DATA_DIR: first.dataDirectory }, stdio: 'ignore' })
  processes.push(restarted)
  const baseUrl = `http://127.0.0.1:${secondPort}`
  for (let attempt = 0; attempt < 80; attempt++) { try { if ((await fetch(`${baseUrl}/api/health`)).ok) break } catch {}; await new Promise((resolve) => setTimeout(resolve, 50)) }
  const login = await json(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ownerEmail, password: 'long-test-password' }) })
  const products = await json(`${baseUrl}/api/products`, { headers: { Authorization: `Bearer ${login.body.token}` } })
  assert.equal(products.body.products.find((value) => value.id === item.id).stock, 7)
})
