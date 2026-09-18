import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const server = await createServer({ server: { port: 0, host: '127.0.0.1' } })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message) })
  page.setDefaultTimeout(10000)
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  await page.route(`${base}/__setup_test`, async route => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/__setup_test', `<div id="root"></div><script type="module">
    import React from '/node_modules/.vite/deps/react.js';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    const { createRoot } = ReactDOM;
    import { DeviceSetup } from '/src/DeviceSetup.tsx';
    window.printCalls = 0;
    window.stockroomDesktop = { listPrinters: async () => [{name:'Test queue',displayName:'Test queue'}], print:async () => { window.printCalls++; if(window.failPrint) throw new Error('Printer offline'); }, control:async () => {} };
    createRoot(document.getElementById('root')).render(React.createElement(DeviceSetup,{businessId:'shop-a',defaultProvider:'Example',onTerminalSaved:()=>{},createPairing:async()=>{},openSecondMonitor:async()=>{},pairing:null,scan:async()=> '00123'}));
  </script>`) }))
  await page.goto(`${base}/__setup_test`)
  await page.getByRole('button', { name: /^Receipt printer/ }).click()
  assert.equal(await page.getByRole('button', { name: 'Continue to configuration' }).isDisabled(), true)
  await page.getByLabel('Manufacturer and model').fill('Test thermal 80')
  await page.getByRole('button', { name: 'Continue to configuration' }).click()
  await page.getByRole('combobox', { name: /^Receipt printer/ }).selectOption('Test queue')
  await page.getByRole('button', { name: 'Save printer settings', exact: true }).click()
  assert.equal(await page.getByRole('checkbox').isDisabled(), true)
  await page.evaluate(() => { window.failPrint = true })
  await page.getByRole('button', { name: 'Print test page' }).click()
  await page.getByRole('alert').filter({ hasText: 'Printer offline' }).waitFor()
  assert.equal(await page.getByRole('checkbox').isDisabled(), true)
  await page.evaluate(() => { window.failPrint = false })
  await page.getByRole('button', { name: 'Print test page' }).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Finish — test confirmed' }).click()
  await page.reload()
  await page.getByRole('button', { name: /Receipt printer.*Test confirmed by user/ }).waitFor()
  await page.evaluate(() => localStorage.setItem('stockroom-printers', '{}'))
  await page.reload()
  await page.getByRole('button', { name: /Receipt printer.*Configured — test needed/ }).waitFor()

  await page.getByRole('button', { name: /^Cash drawer/ }).click()
  await page.getByLabel('Manufacturer and model').fill('USB-only drawer')
  await page.getByLabel('Connection / printing method').selectOption('usb')
  await page.getByRole('button', { name: 'Continue to configuration' }).click()
  await page.getByRole('button', { name: 'Save device details' }).click()
  assert.equal(await page.getByRole('checkbox').count(), 0)
  await page.getByRole('button', { name: 'Finish — integration unavailable' }).click()

  await page.getByRole('button', { name: /^Barcode scanner/ }).click()
  await page.getByLabel('Manufacturer and model').fill('Keyboard scanner')
  await page.getByRole('button', { name: 'Continue to configuration' }).click()
  await page.getByLabel('Scanner terminator').selectOption('Tab')
  await page.getByRole('button', { name: 'Save scanner settings' }).click()
  const scan = page.getByLabel('Scan a known barcode into this field')
  await scan.fill('00123')
  await scan.press('Enter')
  assert.equal(await page.getByRole('checkbox').isDisabled(), true)
  await scan.press('Tab')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Finish — test confirmed' }).click()
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('stockroom-scanner')).suffix), 'Tab')

  await page.getByRole('button', { name: /^Payment terminal/ }).click()
  await page.getByRole('button', { name: 'Continue to configuration' }).click()
  await page.getByLabel('Terminal model').fill('Example model')
  await page.getByLabel('Planned connection').selectOption('sdk')
  await page.getByRole('checkbox').uncheck()
  await page.getByRole('button', { name: 'Save terminal profile' }).click()
  await page.getByRole('button', { name: 'Finish — integration unavailable' }).click()
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('stockroom-device:shop-a:terminal')).status), 'unavailable')
  assert.deepEqual(errors, [])
  console.log('PASS: wizard configuration, printer failure/retry, confirmation gating, persisted status invalidation, unsupported transports, scanner suffix, and unavailable payment adapter')
} finally { await browser.close(); await server.close() }
