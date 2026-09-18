import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const server = await createServer({ server: { port: 0, host: '127.0.0.1' } })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  const external = []
  await page.route('**/*', route => {
    if (!route.request().url().startsWith(base)) { external.push(route.request().url()); return route.abort() }
    return route.continue()
  })
  await page.route(`${base}/ocr-test`, async route => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/ocr-test', '<html><body>Receipt OCR test</body></html>') }))
  await page.goto(`${base}/ocr-test`)
  const result = await page.evaluate(async () => {
    const { readReceiptPhoto, receiptSuggestions } = await import('/src/lib/receiptOcr.ts')
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 400
    const c = canvas.getContext('2d'); c.fillStyle = 'white'; c.fillRect(0, 0, 900, 400); c.fillStyle = 'black'; c.font = '36px monospace'
    ;['TERMINAL RECEIPT', 'RRN: 001234567890', 'AMOUNT: NGN 1250.00', 'APPROVED'].forEach((line, i) => c.fillText(line, 30, 60 + i * 70))
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    const text = await readReceiptPhoto(new File([blob], 'receipt.png', { type: 'image/png' }), new AbortController().signal, () => {})
    return { image: canvas.toDataURL('image/png'), result: receiptSuggestions(text), ambiguous: receiptSuggestions('RRN: 001234\nREFERENCE: 999999'), failed: receiptSuggestions('NOT APPROVED'), card: receiptSuggestions('CARD: 1234567890123456') }
  })
  assert.equal(result.result.reference, '001234567890')
  assert.equal(result.result.amount, '1250.00')
  assert.match(result.result.status, /Approval text/)
  assert.equal(result.ambiguous.reference, '')
  assert.equal(result.card.reference, '')
  assert.match(result.failed.status, /Failure/)
  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default
    const { ReceiptPhoto } = await import('/src/ReceiptPhoto.tsx')
    createRoot(document.body).render(React.createElement(ReceiptPhoto, { total: 1250, onReference: value => { window.acceptedReference = value } }))
  })
  await page.getByLabel('Read terminal receipt photo', { exact: true }).setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from(result.image.split(',')[1], 'base64') })
  await page.getByLabel('Review receipt reference').waitFor()
  assert.equal(await page.getByLabel('Review receipt reference').inputValue(), '001234567890')
  assert.equal(await page.getByRole('button', { name: 'Use reviewed reference' }).isDisabled(), true)
  await page.getByRole('checkbox').check()
  await page.getByLabel('Review receipt reference').fill('001234567891')
  assert.equal(await page.getByRole('button', { name: 'Use reviewed reference' }).isDisabled(), true)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Use reviewed reference' }).click()
  assert.equal(await page.evaluate(() => window.acceptedReference), '001234567891')
  assert.deepEqual(external, [])
  console.log('PASS: real local OCR reads receipt reference/amount, rejects ambiguous references and does not upload to external services')
} finally { await browser.close(); await server.close() }
