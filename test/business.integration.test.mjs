import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { isNewerMutableOperation, mutableEntities } from '../cloud/conflict-policy.mjs'

const tempDirectories = []
const processes = []
let port = 9200

async function startBusiness({ syncApiUrl } = {}) {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'stockroom-test-'))
  tempDirectories.push(dataDirectory)
  const serverPort = ++port
  const child = spawn(globalThis.process.execPath, ['server/index.mjs'], {
    cwd: process.cwd(),
    env: { ...globalThis.process.env, PORT: String(serverPort), CUSTOMER_DISPLAY_PORT: String(serverPort + 100), STOCKROOM_DATA_DIR: dataDirectory, ...(syncApiUrl ? { SYNC_API_URL: syncApiUrl, SYNC_DEVICE_TOKEN: 'test-device-token', BUSINESS_ID: 'test-business', DEVICE_ID: `device-${serverPort}` } : {}) },
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
  if (child.exitCode !== null) return
  child.kill()
  await once(child, 'exit').catch(() => undefined)
}
async function json(url, options) { const response = await fetch(url, options); return { response, body: await response.json() } }

async function createOwner(baseUrl) {
  const { body } = await json(`${baseUrl}/api/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appName: 'Test Shop', ownerName: 'Owner', email: `owner${Date.now()}@test.local`, password: 'long-test-password' }) })
  return body.token
}

async function product(baseUrl, stock = 5) {
  const { body } = await json(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test Product', sku: `SKU-${Date.now()}-${Math.random()}`, category: 'Test', stock, reorder: 1, price: 10, cost: 4, unit: 'piece' }) })
  return body
}

after(async () => {
  await Promise.all(processes.map((child) => stop(child)))
  await Promise.all(tempDirectories.map((directory) => rm(directory, { recursive: true, force: true })))
})

test('offline sale is committed locally and duplicate sale IDs do not reduce stock twice', async () => {
  const { baseUrl } = await startBusiness()
  await createOwner(baseUrl)
  const item = await product(baseUrl, 5)
  const sale = { id: 'sale-idempotency-test', items: [{ productId: item.id, quantity: 2, price: 10 }], total: 20, createdAt: new Date().toISOString(), paymentMethod: 'cash' }
  const first = await json(`${baseUrl}/api/sales`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sale) })
  const second = await json(`${baseUrl}/api/sales`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sale) })
  assert.equal(first.response.status, 201); assert.equal(second.response.status, 201)
  const products = await json(`${baseUrl}/api/products`)
  assert.equal(products.body.products.find((value) => value.id === item.id).stock, 3)
  const sales = await json(`${baseUrl}/api/sales`)
  assert.equal(sales.body.sales.filter((value) => value.id === sale.id).length, 1)
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
  await product(baseUrl)
  await json(`${baseUrl}/api/sync/now`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  cloudOnline = true
  await json(`${baseUrl}/api/sync/now`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  assert.ok(received.some((operation) => operation.entityType === 'product'))
  cloud.close()
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
  await createOwner(first.baseUrl)
  const item = await product(first.baseUrl, 7)
  const running = processes.at(-1); await stop(running)
  const secondPort = ++port
  const restarted = spawn(globalThis.process.execPath, ['server/index.mjs'], { cwd: globalThis.process.cwd(), env: { ...globalThis.process.env, PORT: String(secondPort), CUSTOMER_DISPLAY_PORT: String(secondPort + 100), STOCKROOM_DATA_DIR: first.dataDirectory }, stdio: 'ignore' })
  processes.push(restarted)
  const baseUrl = `http://127.0.0.1:${secondPort}`
  for (let attempt = 0; attempt < 80; attempt++) { try { if ((await fetch(`${baseUrl}/api/health`)).ok) break } catch {}; await new Promise((resolve) => setTimeout(resolve, 50)) }
  const products = await json(`${baseUrl}/api/products`)
  assert.equal(products.body.products.find((value) => value.id === item.id).stock, 7)
})
