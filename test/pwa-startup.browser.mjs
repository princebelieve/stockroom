import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const server = await createServer({ mode: 'pwa', server: { host: '127.0.0.1', port: 0, hmr: false } })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true })

try {
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  for (const statusResponse of [
    { status: 200, body: JSON.stringify({ configured: false, existingBusiness: false }) },
    null,
  ]) {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    if (statusResponse) {
      await page.route('**/api/sync/status', route => route.fulfill({
        status: statusResponse.status,
        contentType: 'application/json',
        body: statusResponse.body,
      }))
    }
    await page.addInitScript(() => {
      localStorage.setItem('stockroom-introduction-v1', 'seen')
      Object.defineProperty(IDBFactory.prototype, 'open', {
        configurable: true,
        value() { throw new Error('Simulated local database startup failure.') },
      })
    })
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
    await page.locator('h1').filter({ hasText: 'Keep selling.' }).waitFor({ timeout: 30000 })
    assert.equal(new URL(page.url()).pathname, '/welcome')
    assert.equal(await page.getByRole('heading', { name: 'Cannot open your business' }).count(), 0)
    assert.equal(await page.getByRole('heading', { name: 'Sign in to your shop' }).count(), 0)
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log('Fresh Vercel/PWA root visits reach the visitor landing page when settings fail, whether sync status says no business or also fails.')
} finally {
  await browser.close()
  await server.close()
}
