import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import assert from 'node:assert/strict'
const data = await mkdtemp(join(tmpdir(), 'stockroom-desktop-pos-'))
const port = 9347
const base = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT:String(port), CUSTOMER_DISPLAY_PORT:'9348', STOCKROOM_DATA_DIR:data, SYNC_CONFIG_PATH:join(data,'sync.json'), SYNC_API_URL:'', SYNC_DEVICE_TOKEN:'', BUSINESS_ID:'', DEVICE_ID:'' }, stdio:'ignore' })
let browser
try {
 for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{};await new Promise(r=>setTimeout(r,100))}
 const account=await (await fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appName:'Corner Shop',ownerName:'Test Cashier',email:'desktop@test.local',password:'long-test-password'})})).json()
 assert.ok(account.token)
 const headers={'Content-Type':'application/json',Authorization:`Bearer ${account.token}`}
 const settings = await (await fetch(base+'/api/settings',{headers})).json()
 await fetch(base+'/api/settings',{method:'PUT',headers,body:JSON.stringify({...settings,paymentPolicy:{...settings.paymentPolicy,providers:['Moniepoint','OPay']}})})

 for(const [name,price,category] of [['Orange juice',15,'Drinks'],['Wholemeal bread',10,'Bakery'],['Coffee',20,'Drinks']]) await fetch(base+'/api/products',{method:'POST',headers,body:JSON.stringify({name,price,category,sku:name,stock:20,reorder:2,cost:3,unit:'piece'})})
 browser=await chromium.launch({channel:'msedge',headless:true})
 const page=await browser.newPage({viewport:{width:1366,height:900}})
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort())
 await page.route('**/api/subscriptions/access',route=>route.fulfill({json:{testMode:true,blocked:false,status:'test'}}))
 await page.addInitScript(account=>{localStorage.setItem('stockroom-token',account.token);localStorage.setItem('stockroom-user',JSON.stringify(account.user));localStorage.setItem(`stockroom-active-screen:${account.user.organizationId}:${account.user.id}`,'POS')},account)
 await page.goto(base)
 await page.getByRole('heading',{name:'Basket',exact:true}).waitFor({timeout:30000})
 await page.getByRole('button',{name:/Add Orange juice/}).click()
 const basket=page.locator('#pos-checkout')
 const catalog=page.locator('.pos-catalog-slot')
 assert.ok((await basket.boundingBox()).width > (await catalog.boundingBox()).width*1.4)
 await page.screenshot({path:join(tmpdir(),'stockroom-desktop-basket.png'),fullPage:true})
 assert.equal(await page.locator('#pos-payment').isVisible(),false)
 await page.getByRole('button',{name:/Take payment/}).click()
 assert.equal(await catalog.isVisible(),false)
 const pay=page.locator('#pos-payment')
 assert.ok((await pay.boundingBox()).width>450)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true, 'Terminal controls must not cause horizontal overflow')
 await pay.getByLabel('Payment Method',{exact:true}).selectOption('cash')
 await pay.getByLabel('Cash received',{exact:true}).fill('20')
 await pay.getByText('Change to give: $5.00',{exact:true}).waitFor()
 for(const width of [1280,1366,1920]) {
  await page.setViewportSize({width,height:900})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true)
  assert.ok((await pay.boundingBox()).width>400)
  await page.screenshot({path:join(tmpdir(),`stockroom-desktop-payment-${width}.png`),fullPage:true})
 }
 await pay.getByRole('button',{name:'Back to products'}).click()
 assert.equal(await catalog.isVisible(),true)
 assert.match(await basket.innerText(),/Orange juice/)
 await page.getByRole('button',{name:/Take payment/}).click()
 assert.equal(await pay.getByLabel('Cash received',{exact:true}).inputValue(),'20')
 await pay.getByLabel('Payment Method',{exact:true}).selectOption('bank-transfer')
 await pay.getByLabel('Transfer reference (required)',{exact:true}).waitFor()
 await pay.getByLabel('Payment Method',{exact:true}).selectOption('multiple')
 await pay.getByLabel('Cash portion',{exact:true}).waitFor()
 assert.equal(await page.locator('.sidebar').getByRole('button',{name:'Customer accounts',exact:true}).count(),1)
 assert.equal(await page.locator('.sidebar').getByRole('button',{name:'Printers & devices',exact:true}).count(),0)
 // Simulate Paystack responses only; no real terminal receives this test order.
 let terminalOrder, terminalPaid = false
 await page.route('**/api/integrations/paystack/config', route => route.fulfill({ json: { configured: true, terminalId: 'TEST-TERMINAL', testMode: true } }))
 await page.route('**/api/integrations/paystack/start', route => {
   const input = route.request().postDataJSON()
   terminalOrder = { ...input, reference: 'PRQ_browser_test', paid: false, status: 'pending' }
   return route.fulfill({ json: terminalOrder })
 })
 await page.route('**/api/integrations/paystack/verify', route => {
   const input = route.request().postDataJSON()
   return route.fulfill({ json: terminalOrder ? { ...terminalOrder, paid: terminalPaid, status: terminalPaid ? 'paid' : 'pending' } : { orderId: input.orderId, paid: false, status: 'not-started' } })
 })
 await pay.getByLabel('Payment Method',{exact:true}).selectOption('external-pos')
 await pay.getByLabel('Use connected Paystack POS').uncheck()
 assert.equal(await pay.getByLabel('POS provider',{exact:true}).inputValue(),'Moniepoint')
 assert.deepEqual(await pay.getByLabel('POS provider',{exact:true}).locator('option').allTextContents(),['Choose POS provider','Moniepoint','OPay'])

 assert.equal(await pay.getByRole('button',{name:'Scan payment reference',exact:true}).count(),1)
 await pay.getByLabel('Use connected Paystack POS').check()
 await pay.getByRole('button', { name: 'Send amount to Paystack POS' }).click()
 assert.equal(terminalOrder.amount, 15)
 assert.equal(await pay.getByRole('button', { name: 'Complete sale', exact: true }).isEnabled(), false)
 assert.equal(await pay.getByLabel('Payment Method',{exact:true}).isEnabled(), false)
 terminalPaid = true
 await pay.getByRole('button', { name: 'Check payment status' }).click()
 await pay.getByText('Payment verified. You can complete the sale.').waitFor()
 assert.equal(await pay.getByRole('button', { name: 'Complete sale', exact: true }).isEnabled(), true)
 await page.reload()
 await page.getByRole('button',{name:/Take payment/}).click()
 await pay.getByText('Payment verified. You can complete the sale.').waitFor()
 assert.equal(await pay.getByRole('button', { name: 'Complete sale', exact: true }).isEnabled(), true)
 assert.equal(await pay.getByRole('button', { name: 'Send amount to Paystack POS' }).isEnabled(), false)
 assert.deepEqual(errors,[])
 const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
 await mobile.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort())
 await mobile.route('**/api/subscriptions/access', route => route.fulfill({ json: { testMode: true, blocked: false, status: 'test' } }))
 await mobile.addInitScript(account => { localStorage.setItem('stockroom-token', account.token); localStorage.setItem('stockroom-user', JSON.stringify(account.user)) }, account)
 await mobile.goto(base)
 const toggle = mobile.locator('.mobile-nav-toggle')
 await toggle.tap()
 assert.equal(await toggle.getAttribute('aria-expanded'), 'true')
 await mobile.locator('.sidebar .brand').tap()
 assert.equal(await toggle.getAttribute('aria-expanded'), 'true', 'Taps inside the menu keep it open')
 await mobile.touchscreen.tap(370, 400)
 assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'Outside touch closes the main mobile menu')
 await toggle.tap()
 await mobile.evaluate(() => {
   const overlay = document.createElement('div')
   Object.assign(overlay.style, { position: 'fixed', right: '0', top: '300px', width: '40px', height: '200px', zIndex: '100' })
   overlay.addEventListener('pointerdown', event => event.stopPropagation())
   document.body.append(overlay)
 })
 await mobile.touchscreen.tap(370, 400)
 assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'Outside touch closes even above the backdrop')
 await toggle.tap()
 await toggle.tap()
 assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'Toggle still closes the menu')
 await mobile.close()
 await page.getByRole('button',{name:'How to use the app',exact:true}).click()
 await page.getByRole('heading',{name:'Owner and cashier guide',exact:true}).waitFor()
 await page.getByLabel('Guide topic',{exact:true}).selectOption({label:'Business settings > Business'})
 await page.getByRole('heading',{name:'Business settings > Business',exact:true}).waitFor()
 const guideDownload=page.waitForEvent('download')
 await page.getByRole('button',{name:'Download full guide',exact:true}).click()
 assert.equal((await guideDownload).suggestedFilename(),'Stockroom-user-guide.txt')
 await page.setViewportSize({width:390,height:844})
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 await page.getByLabel('Search guide',{exact:true}).fill('xyz-topic-not-found')
 await page.getByText('No matching topics. Try a shorter search.',{exact:true}).waitFor()

 await page.setViewportSize({width:1366,height:900})
 await page.locator('.sidebar').getByRole('button',{name:/^Inventory/}).click()
 const remoteProducts = (await (await fetch(base+'/api/products',{headers})).json()).products
 remoteProducts[0].stock = 80
 await page.route('**/api/products', route => route.request().method()==='GET' ? route.fulfill({json:{products:remoteProducts}}) : route.continue())
 await page.route('**/api/sync/pull', route => route.fulfill({json:{configured:true,pending:1,conflicts:0,lastError:''}}))
 let uploads = 0
 await page.route('**/api/products/*/stock', route => { uploads++; return route.abort() })
 await page.evaluate(async productId => {
   const db = await new Promise((resolve,reject) => { const request=indexedDB.open('stockroom-offline',2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error) })
   await new Promise((resolve,reject)=>{const tx=db.transaction('operations','readwrite');tx.objectStore('operations').add({type:'stock',payload:{productId,amount:3},createdAt:new Date().toISOString()});tx.oncomplete=resolve;tx.onerror=reject})
   db.close()
 },remoteProducts[0].id)
 await page.getByLabel('Page options',{exact:true}).click()
 await page.getByRole('button',{name:'Refresh',exact:true}).click()
 await page.getByRole('status').filter({hasText:'No local changes uploaded.'}).waitFor()
 const refreshedRow=page.locator('tbody tr').filter({hasText:remoteProducts[0].name}).first()
 assert.match(await refreshedRow.innerText(),/83/,'Downloaded stock plus the pending local adjustment must appear')
 const queued = await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('stockroom-offline',2);r.onsuccess=()=>resolve(r.result)});const result=await new Promise(resolve=>{const r=db.transaction('operations','readonly').objectStore('operations').getAll();r.onsuccess=()=>resolve(r.result)});db.close();return result})
 assert.equal(queued.filter(operation=>operation.type==='stock').length,1,'Refresh preserves the pending outbox')
 assert.equal(uploads,0,'Refresh does not upload local work')
 console.log('PASS: real desktop app, basket-dominant layout, payment step, preserved entries, cash/transfer/split fields and 1280/1366/1920 widths')
 console.log(join(tmpdir(),'stockroom-desktop-payment-1366.png'))
} finally {if(browser)await browser.close();child.kill();await once(child,'exit').catch(()=>{});await rm(data,{recursive:true,force:true})}
