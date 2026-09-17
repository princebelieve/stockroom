import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import assert from 'node:assert/strict'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  await page.route('http://printing.test/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"><div class="app-shell"><aside>Navigation</aside><main class="main-content"><header>Toolbar</header><section class="reports-dashboard">A4 report<form>Expense form</form></section></main><div class="print-receipt">Receipt</div></div></div>' }))
  await page.goto('http://printing.test')
  await page.addStyleTag({ content: (await readFile('src/styles.css', 'utf8')).replace(/@import[^;]+;/g, '') })
  await page.emulateMedia({ media: 'print' })
  const source = (await readFile('src/lib/printing.ts', 'utf8')).replace("import { isNativeMobile } from './mobileDatabase'", 'const isNativeMobile = () => false').replaceAll('export ', '')
  await page.addScriptTag({ content: stripTypeScriptTypes(source) })
  const result = await page.evaluate(async () => {
    localStorage.setItem('stockroom-printers', JSON.stringify({ receipt: 'Xprinter', report: 'Office A4', width: 58, automatic: true }))
    const calls = []
    window.stockroomDesktop = { print: async options => {
      calls.push({ ...options, receiptVisible: getComputedStyle(document.querySelector('.print-receipt')).display !== 'none', reportVisible: getComputedStyle(document.querySelector('.main-content')).display !== 'none', receiptWidth: document.querySelector('.print-receipt').getBoundingClientRect().width })
    } }
    await printDocument('receipt')
    await printDocument('report')
    window.stockroomDesktop.print = async () => { throw new Error('Printer offline') }
    let error = ''
    try { await printDocument('receipt', printerSettings(), true) } catch (caught) { error = caught.message }
    return { calls, error, cleaned: !document.body.dataset.printKind && !document.querySelector('.printer-test') }
  })
  assert.equal(result.calls[0].deviceName, 'Xprinter')
  assert.equal(result.calls[0].reportVisible, false)
  assert.equal(result.calls[0].receiptVisible, true)
  assert.ok(Math.abs(result.calls[0].receiptWidth - 58 * 96 / 25.4) < 1)
  assert.equal(result.calls[1].deviceName, 'Office A4')
  assert.equal(result.calls[1].receiptVisible, false)
  assert.equal(result.calls[1].reportVisible, true)
  assert.equal(result.error, 'Printer offline')
  assert.equal(result.cleaned, true)
  const offlineSource = (await readFile('src/lib/offlineStore.ts', 'utf8')).replace(/import type[^\n]+/g, '').replaceAll('export ', '')
  await page.addScriptTag({ content: stripTypeScriptTypes(offlineSource) })
  await page.evaluate(async () => {
    await commitOfflineSale({ id: 'receipt-1', organizationId: 'shop-a', businessName: 'Original shop', currency: 'NGN', total: 100, items: [{ productId: 'p1', productName: 'Original name', price: 100, quantity: 1 }] }, [{ id: 'p1', name: 'Original name', stock: 2 }])
  })
  await page.reload()
  await page.addScriptTag({ content: stripTypeScriptTypes(offlineSource) })
  const archive = await page.evaluate(async () => ({ receipts: await getReceiptHistory('shop-a'), otherShop: await getReceiptHistory('shop-b'), pending: await getQueuedOperations(), products: await getCachedProducts() }))
  assert.equal(archive.receipts[0].items[0].productName, 'Original name')
  assert.equal(archive.receipts[0].currency, 'NGN')
  assert.equal(archive.otherShop.length, 0)
  assert.equal(archive.pending.length, 1)
  assert.equal(archive.products[0].stock, 2)
  console.log('PASS: printer routing, layouts, failure cleanup, durable receipt/stock/queue commit and business isolation')
} finally { await browser.close() }
