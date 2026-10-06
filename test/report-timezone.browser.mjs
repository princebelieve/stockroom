import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false } })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true, timeout: 15000 })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.on('pageerror', error => console.error(error.message))
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort())
  await page.route(`${base}/v1/business/settings**`, route => route.fulfill({ json: { appName: 'Test shop', currency: 'USD' } }))
  let remote = []
  await page.route(`${base}/shop-test`, async route => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/shop-test', '<html><body><div id="root"></div></body></html>') }))
  await page.route(`${base}/v1/sync/pull**`, route => route.fulfill({ json: { operations: remote, cursor: remote.length ? '1' : '' } }))
  await page.goto(`${base}/shop-test`, { waitUntil: 'domcontentloaded', timeout: 15000 })
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
  page.setDefaultTimeout(15000)
  await page.getByRole('heading', { name: 'Reporting timezone', exact: true }).waitFor()
  await page.getByLabel('Business timezone', { exact: true }).fill('Africa/Lagos')
  await page.getByRole('button', { name: 'Save reporting timezone', exact: true }).click()
  await page.getByText('Reporting timezone saved.', { exact: false }).waitFor()
  const result = await page.evaluate(async () => ({
    settings: await window.shopApi('/api/settings'),
    report: await window.shopApi('/api/reports'),
  }))
  assert.equal(JSON.parse(result.settings.data.shopProfile).reportingTimeZone, 'Africa/Lagos')
  assert.equal(result.report.data.reportingTimeZone, 'Africa/Lagos')
  await page.getByLabel('Business timezone', { exact: true }).fill('invalid/zone')
  await page.getByRole('button', { name: 'Save reporting timezone', exact: true }).click()
  await page.getByText('Enter a valid reporting timezone, such as Africa/Lagos.', { exact: true }).waitFor()
  const stored = await page.evaluate(() => window.shopApi('/api/settings'))
  assert.equal(JSON.parse(stored.data.shopProfile).reportingTimeZone, 'Africa/Lagos')
  console.log('Reporting timezone browser save, validation, persistence and report checks passed.')
} finally { await browser.close(); await server.close() }
