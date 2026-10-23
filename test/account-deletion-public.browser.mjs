import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname
  const file = path === '/account-deletion' || path === '/account-deletion.html'
    ? 'account-deletion.html'
    : path === '/' ? 'index.html' : null
  if (!file) { response.writeHead(404); response.end('Not found'); return }
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.end(await readFile(new URL(`../${file}`, import.meta.url)))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true, timeout: 15000 })
  const page = await browser.newPage()
  const base = `http://127.0.0.1:${server.address().port}`
  await page.route(`${base}/src/**`, route => route.fulfill({ status: 200, body: '' }))
  await page.goto(`${base}/account-deletion`, { waitUntil: 'domcontentloaded' })

  assert.equal(await page.getByRole('heading', { name: 'Close your Stockroom account' }).count(), 1)
  const ownerLink = page.getByRole('link', { name: 'Business owner: sign in and request deletion' })
  assert.equal(await ownerLink.getAttribute('href'), '/?screen=account-deletion')
  assert.equal(await page.getByRole('link', { name: 'Promoter: sign in and request deletion' }).getAttribute('href'), '/visitor')

  await ownerLink.click()
  await page.waitForURL('**/?screen=account-deletion')
  assert.equal(new URL(page.url()).searchParams.get('screen'), 'account-deletion')
  assert.equal(await page.title(), 'Stockroom Business App')
  console.log('Public deletion page and owner browser entry route passed. The existing signed-in deletion flow is covered by account-deletion.browser.mjs.')
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
