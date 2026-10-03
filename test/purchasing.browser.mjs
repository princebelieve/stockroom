import { createServer } from 'node:http'
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import assert from 'node:assert/strict'
const data = await mkdtemp(join(tmpdir(), 'stockroom-desktop-pos-'))
const port = 9367
const base = `http://127.0.0.1:${port}`
const subscriptionServer = createServer((request, response) => { response.setHeader('Content-Type','application/json'); response.end(JSON.stringify({businessId:'service-test',testMode:true})) })
await new Promise(resolve => subscriptionServer.listen(9369,'127.0.0.1',resolve))
const child = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT:String(port), CUSTOMER_DISPLAY_PORT:'9368', STOCKROOM_DATA_DIR:data, SYNC_CONFIG_PATH:join(data,'sync.json'), SYNC_API_URL:'http://127.0.0.1:9369', SYNC_DEVICE_TOKEN:'test', BUSINESS_ID:'service-test', DEVICE_ID:'test-device' }, stdio:'ignore' })
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
 await page.addInitScript(account=>{localStorage.setItem('stockroom-token',account.token);localStorage.setItem('stockroom-user',JSON.stringify(account.user));localStorage.setItem(`stockroom-active-screen:${account.user.organizationId}:${account.user.id}`,'Inventory')},account)
 await page.goto(base)
 await page.getByRole('heading',{name:'Purchasing and receiving',exact:true}).waitFor({timeout:30000})
 const panel=page.getByRole('heading',{name:'Purchasing and receiving',exact:true}).locator('..')
 await panel.locator('summary').filter({hasText:'Suppliers'}).click()
 await panel.getByLabel('Supplier name',{exact:true}).fill('Wholesale supplier')
 await panel.getByRole('button',{name:'Add supplier',exact:true}).click()
 await panel.getByText('Wholesale supplier',{exact:true}).first().waitFor()
 await panel.locator('summary').filter({hasText:'Pack conversions'}).click()
 const conversion=panel.locator('summary').filter({hasText:'Pack conversions'}).locator('..')
 await conversion.getByLabel('Product',{exact:true}).selectOption({label:'Orange juice (piece)'})
 await conversion.getByLabel('Pack name',{exact:true}).fill('Carton')
 await conversion.getByLabel('Selling units per pack',{exact:true}).fill('24')
 await conversion.getByRole('button',{name:'Add conversion',exact:true}).click()
 await panel.getByText('Orange juice: Carton = 24 selling units',{exact:true}).waitFor()
 const form=panel.locator('form.settings-form')
 await form.getByLabel('Supplier',{exact:true}).selectOption({label:'Wholesale supplier'})
 await form.getByLabel('Order / delivery reference',{exact:true}).fill('INV-1')
 await form.getByLabel('Product',{exact:true}).selectOption({label:'Orange juice'})
 await form.getByLabel('Receiving unit',{exact:true}).selectOption({label:'Carton (24 units)'})
 await form.getByLabel('Quantity',{exact:true}).fill('2')
 await form.getByLabel('Cost per selected unit / pack',{exact:true}).fill('120')
 await form.locator('summary').filter({hasText:'Expiry / batch (optional)'}).click()
 await form.getByLabel('Batch number',{exact:true}).fill('JUICE-001')
 await form.getByLabel('Expiry date',{exact:true}).fill('2099-12-31')
 await form.getByRole('button',{name:'Save delivery',exact:true}).click()
 await page.waitForFunction(async () => { const token=localStorage.getItem('stockroom-token');const data=await (await fetch('/api/products',{headers:{Authorization:`Bearer ${token}`}})).json();return data.products.some(p=>p.name==='Orange juice' && p.stock===68) })
 await page.reload()
 await page.getByRole('heading',{name:'Purchasing and receiving',exact:true}).waitFor()
 await page.getByText('Orders, delivery costs, and wastage history',{exact:true}).click()
 await page.getByText('receipt: INV-1',{exact:true}).waitFor()
 const retail=await (await fetch(base+'/api/retail',{headers})).json()
 assert.ok(retail.batches.lots.some(lot=>lot.batch_number==='JUICE-001' && lot.expiry==='2099-12-31' && lot.quantity===48 && lot.unit_cost===5))
 assert.deepEqual(errors,[])
 console.log('PASS: purchasing UI creates supplier and carton conversion, receives stock, and retains history after reload')
} finally {if(browser)await browser.close();child.kill();await once(child,'exit').catch(()=>{});await rm(data,{recursive:true,force:true}); subscriptionServer.close()}
