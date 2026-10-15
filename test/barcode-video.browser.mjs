import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const server = await createServer({ server: { port: 0, host: '127.0.0.1' } })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  await page.route(`${base}/barcode-video-test`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }))
  await page.goto(`${base}/barcode-video-test`, { waitUntil: 'domcontentloaded' })
  const value = await page.evaluate(async () => {
    const { scanRotatedBarcodeFromVideo } = await import('/test/barcode-video-harness.ts')
    return scanRotatedBarcodeFromVideo()
  })
  assert.equal(value, '4006381333931')
  console.log('PASS: continuous ZXing video scanning detects a rotated EAN-13 barcode')
} finally {
  await browser.close()
  await server.close()
}
