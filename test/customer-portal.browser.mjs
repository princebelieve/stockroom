import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false } })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  page.setDefaultTimeout(15000)
  const requests = [], orders = []
  const catalog = { businessId: 'shop', businessName: 'Test Cafe', currency: 'USD', mode: 'fast-food', menu: { id: 'counter-menu', updatedAt: 'revision', items: [{ id: 'meal', name: 'Meal', price: 10, description: '', options: [] }] } }
  await page.route('**/v1/customer-portal/**', async route => {
    const path = new URL(route.request().url()).pathname
    const input = route.request().method() === 'POST' ? route.request().postDataJSON() : null
    requests.push({ path, input })
    let data
    if (path.endsWith('/guest')) data = { accessToken: 'guest-token' }
    else if (path.endsWith('/catalog')) data = catalog
    else if (path.endsWith('/me')) data = { guest: true, customer: { id: 'guest', name: 'Ada', phone: '', balance: 0 }, transactions: [], orders }
    else if (path.endsWith('/orders')) {
      const order = { id: `online-${input.clientOrderId}`, status: 'pending', total: 10, currency: 'USD', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lines: [{ name: 'Meal', quantity: 1, options: [] }], paymentMethod: 'cash', paymentReference: '', paymentPending: true }
      if (!orders.length) {
        orders.push(order)
        // The server accepted it, but the customer never received the reply.
        await route.abort('failed'); return
      }
      data = { order: orders[0] }
    } else throw new Error(`Unexpected request: ${path}`)
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  await page.route(`${base}/guest-harness`, route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
  const mount = () => page.evaluate(async () => {
    const { React, createRoot } = await import('/test/shop-setup-harness.ts')
    const { CustomerPortal } = await import('/src/CustomerPortal.tsx')
    createRoot(document.getElementById('root')).render(React.createElement(CustomerPortal, { businessId: 'shop' }))
  })
  await page.goto(`${base}/guest-harness`, { waitUntil: 'domcontentloaded' })
  await mount()
  await page.getByLabel('Name for pickup').fill('Ada')
  await page.getByRole('button', { name: 'Continue as guest' }).click()
  await page.getByRole('button', { name: 'Add to basket' }).click()
  assert.equal(await page.getByRole('option', { name: 'Customer wallet' }).count(), 0)
  await page.getByRole('button', { name: 'Submit order', exact: true }).click()
  await page.getByRole('button', { name: 'Retry saved order', exact: true }).click()
  await page.getByText('Awaiting business acceptance', { exact: false }).waitFor()
  const submission = requests.find(request => request.path.endsWith('/orders')).input
  assert.equal(submission.paymentMethod, 'cash'); assert.equal(submission.lines[0].menuItemId, 'meal')
  assert.match(submission.clientOrderId, /^[a-zA-Z0-9_-]{12,100}$/)
  const submissions = requests.filter(request => request.path.endsWith('/orders'))
  assert.equal(submissions.length, 2); assert.deepEqual(submissions[0].input, submissions[1].input)
  assert.equal(orders.length, 1)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await mount()
  await page.getByRole('button', { name: 'Order tracking', exact: true }).click()
  await page.getByText('Awaiting business acceptance', { exact: false }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Wallet', exact: true }).count(), 0)
  console.log('Guest QR entry, basket, cash submission, acceptance status and session reload passed.')
} finally { await browser.close(); await server.close() }
