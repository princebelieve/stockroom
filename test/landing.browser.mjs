import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { chromium } from '@playwright/test'

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer(async (req, res) => {
  try {
    const file = join(process.cwd(), 'dist', new URL(req.url, 'http://local').pathname)
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
    res.end(await readFile(file))
  } catch { res.writeHead(404); res.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.route('**/v1/public/landing', route => route.fulfill({ json: { firstReferralPercent: 10, recurringReferralPercent: 5 } }))
    await page.goto(`http://127.0.0.1:${server.address().port}/welcome.html?ref=${'a'.repeat(32)}`)
    await page.getByRole('heading', { name: /Keep selling/ }).waitFor()
    await page.getByText('10%', { exact: true }).waitFor()
    assert.equal(await page.locator('form').count(), 0, 'marketing page must not register or bill businesses')
    assert.equal(await page.locator('#register-app').getAttribute('href'), `https://stockroom.globalcreest.com/?screen=register&ref=${'a'.repeat(32)}`)
    assert.equal(await page.locator('#subscription-app').getAttribute('href'), `https://stockroom.globalcreest.com/?screen=subscription&ref=${'a'.repeat(32)}`)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.equal(await page.locator('#apk').getAttribute('aria-disabled'), 'true')
    assert.equal(await page.locator('nav a.small-button').getAttribute('href'), 'https://stockroom.globalcreest.com/')
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log('Landing page passed at mobile and desktop widths: rates, app-only registration/subscription destinations, referral preservation and unavailable downloads.')
} finally { await browser.close(); server.close() }
