import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { once } from 'node:events'
import { chromium } from '@playwright/test'
import { createServer as createViteServer } from 'vite'
import { normalizeShopProfile } from '../../server/shop-profile.mjs'

const data = await mkdtemp(join(tmpdir(), 'stockroom-play-listing-'))
const output = resolve('promo-assets/store-listing')
const port = 9687
const base = `http://127.0.0.1:${port}`
const cloud = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json')
  if (request.url === '/v1/sync/capabilities') {
    response.end(JSON.stringify({ capabilities: ['counter-v3', 'restaurant-v2', 'hospitality-operations-v1', 'hotel-shift-handoff-v1', 'hotel-reservation-deposits-v1', 'hotel-group-reschedule-v1', 'hotel-group-master-folio-v1', 'restaurant-hotel-folio-v1'] }))
    return
  }
  if (request.url.startsWith('/v1/sync/push')) {
    let raw = ''
    for await (const chunk of request) raw += chunk
    response.end(JSON.stringify({ acceptedOperationIds: JSON.parse(raw).operations.map(row => row.operationId), conflicts: [] }))
    return
  }
  if (request.url.startsWith('/v1/sync/pull')) { response.end(JSON.stringify({ operations: [], cursor: '' })); return }
  response.end(JSON.stringify({ businessId: 'listing-demo', testMode: true }))
})
await new Promise(resolveListen => cloud.listen(0, '127.0.0.1', resolveListen))
const child = spawn(process.execPath, ['server/index.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), CUSTOMER_DISPLAY_PORT: String(port + 1), STOCKROOM_DATA_DIR: data, SYNC_CONFIG_PATH: join(data, 'sync.json'), SYNC_API_URL: `http://127.0.0.1:${cloud.address().port}`, SYNC_DEVICE_TOKEN: 'listing-demo', BUSINESS_ID: 'listing-demo', DEVICE_ID: 'listing-demo-device' },
  stdio: 'ignore',
})
let browser, viteServer
let uiBase = base
try {
  await mkdir(output, { recursive: true })
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 100))
  }
  const account = await (await fetch(`${base}/api/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appName: 'Harbour House', ownerName: 'Owner', email: 'listing-demo@example.invalid', password: 'temporary-listing-demo-password' }) })).json()
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` }
  const settings = await (await fetch(`${base}/api/settings`, { headers })).json()
  await fetch(`${base}/api/settings`, { method: 'PUT', headers, body: JSON.stringify({ ...settings, currency: 'NGN' }) })
  const profile = normalizeShopProfile({ ...settings.shopProfile, industry: 'services', workflows: 'both', restaurant: true, features: { ...settings.shopProfile?.features, hotelOperations: true, nightlifeOperations: true, hospitalityOperations: true } })
  await fetch(`${base}/api/settings/shop-profile`, { method: 'PUT', headers, body: JSON.stringify(profile) })

  viteServer = await createViteServer({ server: { port: 0, host: '127.0.0.1', hmr: false, proxy: { '/api': base } } })
  await viteServer.listen()
  uiBase = `http://127.0.0.1:${viteServer.httpServer.address().port}`

  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5 })
  page.setDefaultTimeout(15000)
  await page.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith(uiBase) ? route.continue() : route.abort())
  await page.route('**/api/subscriptions/access', route => route.fulfill({ json: { testMode: true, blocked: false, status: 'test' } }))
  await page.addInitScript(accountData => {
    localStorage.setItem('stockroom-token', accountData.token)
    localStorage.setItem('stockroom-user', JSON.stringify(accountData.user))
  }, account)
  await page.goto(base)
  await page.locator('[aria-label="Subscription: test"]').waitFor({ state: 'attached' })

  const openHospitality = async () => {
    const button = page.getByRole('button', { name: 'Hotel & nightlife', exact: true })
    if (!await button.isVisible()) {
      const menu = page.getByRole('button', { name: 'Open navigation menu', exact: true })
      if (await menu.isVisible()) await menu.click()
      await page.getByRole('button', { name: 'Sales & orders', exact: true }).click()
    }
    await button.click()
  }
  await openHospitality()
  const hospitality = page.locator('.hospitality-operations')
  await hospitality.getByRole('heading', { name: 'Hospitality operations' }).waitFor()
  await hospitality.getByLabel('Room name or number').fill('Garden Suite')
  await hospitality.locator('input[name="rate"]').first().fill('120')
  await hospitality.getByRole('button', { name: 'Add room', exact: true }).click()
  const room = hospitality.locator('article.customer-row:has(select[name="housekeepingStatus"])').filter({ hasText: 'Garden Suite' }).first()
  await room.locator('select[name="housekeepingStatus"]').selectOption('ready')
  await room.locator('select[name="housekeepingAssignedTo"]').selectOption({ label: 'Owner' })
  await room.getByRole('button', { name: 'Save room and housekeeping' }).click()
  const roomSelect = hospitality.locator('select[name="roomId"]:not([multiple])')
  await roomSelect.selectOption(await roomSelect.locator('option').nth(1).getAttribute('value'))
  await hospitality.getByLabel('Guest name').fill('Ada Guest')
  await hospitality.getByLabel('Phone', { exact: true }).fill('08000000001')
  await hospitality.locator('input[name="checkin"]').fill('2026-10-24')
  await hospitality.locator('input[name="checkout"]').fill('2026-10-26')
  await hospitality.getByLabel('Stay manager').selectOption({ label: 'Owner' })
  await hospitality.getByRole('button', { name: 'Save booking' }).click()
  const stay = hospitality.locator('.customer-row').filter({ hasText: 'Ada Guest' }).last()
  await stay.waitFor()
  await stay.locator('strong').first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(150)
  await page.screenshot({ path: join(output, '03-hotel-operations.png') })

  await hospitality.getByRole('button', { name: 'Nightlife events', exact: true }).click()
  await hospitality.getByLabel('Event name').fill('Friday Live')
  await hospitality.getByLabel('Starts').fill('2026-10-24T20:00')
  await hospitality.getByLabel('Ends').fill('2026-10-24T23:00')
  await hospitality.getByLabel('Guest capacity').fill('50')
  await hospitality.getByLabel('Admission price').fill('25')
  await hospitality.getByLabel('Event host').first().selectOption({ label: 'Owner' })
  await hospitality.getByLabel('Door staff lead').first().selectOption({ label: 'Owner' })
  await hospitality.getByRole('button', { name: 'Create event' }).click()
  const event = hospitality.locator('.panel').filter({ hasText: 'Friday Live' }).last()
  await event.getByLabel('Guest', { exact: true }).fill('Ben Guest')
  await event.getByLabel('Phone', { exact: true }).fill('08000000002')
  await event.getByRole('button', { name: 'Add guest' }).click()
  await event.locator('.customer-row').filter({ hasText: 'Ben Guest' }).waitFor()
  await event.locator('strong').first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(150)
  await page.screenshot({ path: join(output, '04-nightlife-events.png') })

  await page.route(`${uiBase}/harness`, route => route.fulfill({ contentType: 'text/html', body: '<link rel="stylesheet" href="/src/styles.css"><div id="root"></div>' }))
  await page.goto(`${uiBase}/harness`)
  await page.evaluate(async ({ headers }) => {
    const { React, createRoot } = await import('/test/shop-setup-harness.ts')
    const { ChurchCollections } = await import('/src/ChurchCollections.tsx')
    window.workRoot = createRoot(document.getElementById('root'))
    window.workRoot.render(React.createElement('main', { className: 'main-content' }, React.createElement(ChurchCollections, { headers, storageKey: 'store-listing-church', manager: true, providers: [], print: async () => {}, beforeSend: async () => {} })))
  }, { headers: { ...headers, 'X-Stockroom-Branch': 'main', 'X-Stockroom-Till': 'listing-demo-till' } })
  await page.getByRole('heading', { name: 'Church collections', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Add fund', exact: true }).click()
  await page.getByLabel('Fund name').fill('Community fund')
  await page.getByRole('button', { name: 'Confirm fund or donor', exact: true }).click()
  await page.getByRole('button', { name: 'Add donor', exact: true }).click()
  await page.getByLabel('Donor name').fill('Ada Donor')
  await page.getByLabel('Donor phone').fill('08000000003')
  await page.getByRole('button', { name: 'Confirm fund or donor', exact: true }).click()
  await page.getByRole('button', { name: 'New pledge / donation', exact: true }).click()
  await page.getByLabel('Collection fund').selectOption({ index: 1 })
  await page.getByLabel('Collection donor').selectOption({ index: 1 })
  await page.getByLabel('Collection purpose').fill('Community hall project')
  await page.getByLabel('Commitment amount').fill('50000')
  await page.getByRole('button', { name: 'Save commitment', exact: true }).click()
  await page.getByText('Commitment saved. No payment was recorded.', { exact: true }).waitFor()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(150)
  await page.screenshot({ path: join(output, '05-church-collections.png') })
} finally {
  if (browser) await browser.close()
  if (viteServer) await viteServer.close()
  child.kill()
  await once(child, 'exit').catch(() => {})
  await rm(data, { recursive: true, force: true })
  cloud.close()
}
