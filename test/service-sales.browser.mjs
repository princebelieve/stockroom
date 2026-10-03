import { createServer } from 'node:http'
﻿import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import assert from 'node:assert/strict'
const data = await mkdtemp(join(tmpdir(), 'stockroom-desktop-pos-'))
const port = 9357
const base = `http://127.0.0.1:${port}`
const subscriptionServer = createServer((request, response) => { response.setHeader('Content-Type','application/json'); response.end(JSON.stringify({businessId:'service-test',testMode:true})) })
await new Promise(resolve => subscriptionServer.listen(9359,'127.0.0.1',resolve))
const child = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT:String(port), CUSTOMER_DISPLAY_PORT:'9358', STOCKROOM_DATA_DIR:data, SYNC_CONFIG_PATH:join(data,'sync.json'), SYNC_API_URL:'http://127.0.0.1:9359', SYNC_DEVICE_TOKEN:'test', BUSINESS_ID:'service-test', DEVICE_ID:'test-device' }, stdio:'ignore' })
let browser
try {
 for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{};await new Promise(r=>setTimeout(r,100))}
 const account=await (await fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appName:'Corner Shop',ownerName:'Test Cashier',email:'desktop@test.local',password:'long-test-password'})})).json()
 assert.ok(account.token)
 const headers={'Content-Type':'application/json',Authorization:`Bearer ${account.token}`}
 for(const [name,price,category] of [['Orange juice',15,'Drinks'],['Wholemeal bread',10,'Bakery'],['Coffee',20,'Drinks']]) await fetch(base+'/api/products',{method:'POST',headers,body:JSON.stringify({name,price,category,sku:name,stock:20,reorder:2,cost:3,unit:'piece'})})
 browser=await chromium.launch({channel:'msedge',headless:true})
 const page=await browser.newPage({viewport:{width:1366,height:900}})
 page.on('dialog', async dialog => { console.log('Dialog:', dialog.message()); await dialog.dismiss() })
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort())
 await page.route('**/api/subscriptions/access',route=>route.fulfill({json:{testMode:true,blocked:false,status:'test'}}))
 await page.addInitScript(account=>{localStorage.setItem('stockroom-token',account.token);localStorage.setItem('stockroom-user',JSON.stringify(account.user));localStorage.setItem(`stockroom-active-screen:${account.user.organizationId}:${account.user.id}`,'POS')},account)
 await page.goto(base)
 await page.getByRole('heading',{name:'Basket',exact:true}).waitFor({timeout:30000})
 await page.getByLabel('Service description', {exact:true}).fill('A4 DI printing')
 await page.getByLabel('Service quantity', {exact:true}).fill('3')
 await page.getByLabel('Price per service / unit', {exact:true}).fill('5')
 await page.getByRole('button', {name:'Add service to basket'}).click()
 await page.reload()
 await page.getByRole('heading',{name:'Basket',exact:true}).waitFor()
 const basket=page.locator('#pos-checkout')
 const catalog=page.locator('.pos-catalog-slot')
 assert.match(await basket.innerText(), /A4 DI printing/)
 await page.getByRole('button',{name:/Take payment/}).click()
 assert.equal(await catalog.isVisible(),false)
 const pay=page.locator('#pos-payment')
 assert.ok((await pay.boundingBox()).width>450)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true, 'Terminal controls must not cause horizontal overflow')
 await pay.getByLabel('Payment method',{exact:true}).selectOption('cash')
 await pay.getByLabel('Cash received',{exact:true}).fill('20')
 await pay.getByText('Change to give: $5.00',{exact:true}).waitFor()
 await pay.getByRole('button', {name:'Complete sale',exact:true}).click()
 await page.waitForTimeout(300)
 const sales=await (await fetch(base+'/api/sales', {headers})).json()
 const sale=sales.sales.find(sale=>sale.items.some(item=>item.productName==='A4 DI printing'))
 assert.ok(sale, 'Service receipt was saved')
 assert.equal(sale.total,15)
 assert.equal(sale.items[0].quantity,3)
 const products=await (await fetch(base+'/api/products',{headers})).json()
 assert.ok(products.products.every(product=>product.stock===20), 'Services do not deduct inventory')
 assert.deepEqual(errors,[])
 console.log('PASS: service entry, draft reload, cash payment, saved receipt and unchanged inventory')
} finally {if(browser)await browser.close();child.kill();await once(child,'exit').catch(()=>{});await rm(data,{recursive:true,force:true}); subscriptionServer.close()}
