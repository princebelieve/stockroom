import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false } })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage(); page.setDefaultTimeout(20000)
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  await page.route(`${base}/printer-harness`, route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div><section class="print-order"></section>' }))
  await page.goto(`${base}/printer-harness`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(async () => {
    window.printCalls = []
    window.stockroomDesktop = { listPrinters: async () => ['Receipt', 'Kitchen', 'Bar'].map(name => ({ name, displayName: name })), print: async options => { window.printCalls.push({ ...options, content: document.querySelector('.print-order').textContent }) } }
    const { React, createRoot } = await import('/test/shop-setup-harness.ts')
    const { PrinterSettings } = await import('/src/PrinterSettings.tsx')
    createRoot(document.getElementById('root')).render(React.createElement(PrinterSettings))
  })
  await page.getByLabel('Kitchen ticket printer').selectOption('Kitchen')
  await page.getByLabel('Bar ticket printer').selectOption('Bar')
  await page.getByLabel('Automatically route preparation tickets').check()
  await page.getByRole('button', { name: 'Save printer settings', exact: true }).click()
  await page.getByRole('button', { name: 'Test kitchen ticket print', exact: true }).click()
  await page.getByRole('button', { name: 'Test bar ticket print', exact: true }).click()
  const result = await page.evaluate(async () => {
    const { routePreparation, preparationJobs } = await import('/src/lib/preparationPrinting.ts')
    const { printDocument, printerSettings } = await import('/src/lib/printing.ts')
    const order = { id: 'order', updatedAt: 'revision', status: 'queued', note: '', lines: [{ id: 'food', name: 'Meal', station: 'kitchen' }, { id: 'drink', name: 'Drink', station: 'bar' }] }
    const print = async (ticket, station) => {
      document.querySelector('.print-order').textContent = ticket.lines.map(line => line.name).join(', ')
      await printDocument('order', { ...printerSettings(), receipt: printerSettings()[station] })
    }
    await routePreparation('test-shop', order, print)
    await routePreparation('test-shop', order, print)
    return { calls: window.printCalls, states: preparationJobs('test-shop').map(job => job.state) }
  })
  assert.equal(result.calls.length, 4)
  assert.equal(result.calls[0].deviceName, 'Kitchen'); assert.equal(result.calls[1].deviceName, 'Bar')
  assert.equal(result.calls[2].deviceName, 'Kitchen'); assert.equal(result.calls[2].content, 'Meal')
  assert.equal(result.calls[3].deviceName, 'Bar'); assert.equal(result.calls[3].content, 'Drink')
  assert.deepEqual(result.states, ['submitted', 'submitted'])
  console.log('Installed station queue settings, test prints, automatic routing, station-only contents and duplicate suppression passed.')
} finally { await browser.close(); await server.close() }
