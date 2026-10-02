import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const server = await createServer({ server: { host: '127.0.0.1', port: 9357, hmr: false } })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-features=LocalNetworkAccessChecks'] })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 850 } })
  page.setDefaultTimeout(12000)
  page.on('pageerror', error => console.error(error.message))
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.fallback() : route.abort())
  await page.route(`${base}/bank-test`, async route => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/bank-test', '<html><body><main id="root"></main></body></html>') }))
  await page.goto(`${base}/bank-test`)
  await page.evaluate(async () => {
    const { React, createRoot } = await import('/test/shop-setup-harness.ts')
    const { PayoutBankForm } = await import('/src/PayoutBankForm.tsx')
    await import('/src/portal.css')
    window.saved = 0
    createRoot(document.getElementById('root')).render(React.createElement(PayoutBankForm, {
      className: 'portal-form', buttonClass: 'portal-btn', onSaved: async () => { window.saved++ },
      request: async (path, init) => {
        if (path.includes('/banks')) return { banks: [{ name: 'Example Bank', code: '001' }] }
        const input = JSON.parse(init.body)
        if (input.accountNumber === '9999999999') throw Error('Account could not be verified.')
        if (path.endsWith('/resolve')) {
          window.lookups = (window.lookups || 0) + 1
          if (input.accountNumber === '1111111111') { window.delayedLookupStarted = true; await new Promise(resolve => setTimeout(resolve, 1200)); return { name: 'OLD ACCOUNT NAME' } }
          return { name: 'VERIFIED ACCOUNT NAME' }
        }
        window.submitted = input
        return { profile: { name: 'VERIFIED ACCOUNT NAME', accountLast4: '6789' } }
      }
    }))
  })
  await page.getByLabel('Bank', { exact: true }).selectOption('001')
  await page.getByLabel('Account number', { exact: true }).fill('0123456789')
  await page.waitForFunction(() => document.querySelector('input[readonly]')?.value === 'VERIFIED ACCOUNT NAME')
  assert.equal(await page.getByLabel('Account name', { exact: true }).inputValue(), 'VERIFIED ACCOUNT NAME')
  assert.equal(await page.getByLabel('Account name', { exact: true }).getAttribute('readonly'), '')
  assert.equal(await page.evaluate(() => window.saved), 0)
  await page.getByLabel('Account number', { exact: true }).fill('9999999999')
  assert.equal(await page.getByLabel('Account name', { exact: true }).inputValue(), '')
  await page.getByText('Account could not be verified.').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Confirm and save bank account' }).isDisabled(), true)
  await page.getByLabel('Account number', { exact: true }).fill('0123456789')
  await page.getByRole('button', { name: 'Confirm and save bank account' }).click()
  await page.getByText(/Bank account saved:/).waitFor()
  assert.equal(await page.evaluate(() => window.saved), 1)
  assert.equal(await page.evaluate(() => window.submitted.confirmedName), 'VERIFIED ACCOUNT NAME')
  await page.getByLabel('Account number', { exact: true }).fill('1111111111')
  await page.waitForFunction(() => window.delayedLookupStarted)
  await page.getByLabel('Account number', { exact: true }).fill('0123456789')
  await page.waitForFunction(() => document.querySelector('input[readonly]')?.value === 'VERIFIED ACCOUNT NAME')
  await page.waitForTimeout(1400)
  assert.equal(await page.getByLabel('Account name', { exact: true }).inputValue(), 'VERIFIED ACCOUNT NAME')
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 850 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  }
  console.log('PASS automatic bank verification, confirmation, changed details, lookup failure, stale responses, phone and desktop widths')
} finally { await browser.close(); await server.close() }
