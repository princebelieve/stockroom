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
 await pay.getByLabel('Payment method',{exact:true}).selectOption('cash')
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
 await pay.getByLabel('Payment method',{exact:true}).selectOption('bank-transfer')
 await pay.getByLabel('Transfer reference (required)',{exact:true}).waitFor()
 await pay.getByLabel('Payment method',{exact:true}).selectOption('multiple')
 await pay.getByLabel('Cash portion',{exact:true}).waitFor()
 assert.equal(await page.locator('.sidebar').getByRole('button',{name:'Customer accounts',exact:true}).count(),1)
 assert.equal(await page.locator('.sidebar').getByRole('button',{name:'Printers & devices',exact:true}).count(),1)
 assert.deepEqual(errors,[])
 console.log('PASS: real desktop app, basket-dominant layout, payment step, preserved entries, cash/transfer/split fields and 1280/1366/1920 widths')
 console.log(join(tmpdir(),'stockroom-desktop-payment-1366.png'))
} finally {if(browser)await browser.close();child.kill();await once(child,'exit').catch(()=>{});await rm(data,{recursive:true,force:true})}
