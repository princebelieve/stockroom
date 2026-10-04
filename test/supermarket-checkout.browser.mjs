import { createServer } from 'node:http'
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import assert from 'node:assert/strict'
const data = await mkdtemp(join(tmpdir(), 'stockroom-desktop-pos-'))
const port = 9377
const base = `http://127.0.0.1:${port}`
const subscriptionServer = createServer((request, response) => { response.setHeader('Content-Type','application/json'); response.end(JSON.stringify({businessId:'service-test',testMode:true})) })
await new Promise(resolve => subscriptionServer.listen(9379,'127.0.0.1',resolve))
const child = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT:String(port), CUSTOMER_DISPLAY_PORT:'9378', STOCKROOM_DATA_DIR:data, SYNC_CONFIG_PATH:join(data,'sync.json'), SYNC_API_URL:'http://127.0.0.1:9379', SYNC_DEVICE_TOKEN:'test', BUSINESS_ID:'service-test', DEVICE_ID:'test-device' }, stdio:'ignore' })
let browser
try {
 for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{};await new Promise(r=>setTimeout(r,100))}
 const account=await (await fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appName:'Corner Shop',ownerName:'Test Cashier',email:'desktop@test.local',password:'long-test-password'})})).json()
 assert.ok(account.token)
 const headers={'Content-Type':'application/json',Authorization:`Bearer ${account.token}`}
 for(const [name,price,category] of [['Orange juice',15,'Drinks'],['Wholemeal bread',10,'Bakery'],['Coffee',20,'Drinks']]) await fetch(base+'/api/products',{method:'POST',headers,body:JSON.stringify({name,price,category,sku:name,stock:20,reorder:2,cost:3,unit:'piece'})})

 const customer=await (await fetch(base+'/api/customers',{method:'POST',headers,body:JSON.stringify({name:'Regular shopper',phone:'555'})})).json()
 assert.ok(customer.id)
 browser=await chromium.launch({channel:'msedge',headless:true})
 const page=await browser.newPage({viewport:{width:1366,height:900}})
 page.on('dialog', async dialog => { console.log('Dialog:', dialog.message()); await dialog.dismiss() })
 const dialogs=[];page.on('dialog', dialog=>dialogs.push(dialog.message()));
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort())
 await page.route('**/api/subscriptions/access',route=>route.fulfill({json:{testMode:true,blocked:false,status:'test'}}))
 await page.addInitScript(account=>{localStorage.setItem('stockroom-token',account.token);localStorage.setItem('stockroom-user',JSON.stringify(account.user));localStorage.setItem(`stockroom-active-screen:${account.user.organizationId}:${account.user.id}`,'POS')},account)
 await page.goto(base)
 await page.getByRole('heading',{name:'Basket',exact:true}).waitFor({timeout:30000})
 assert.equal(await page.getByText('Optional tax and loyalty settings',{exact:true}).count(),0)
 await page.getByRole('button',{name:'Business settings',exact:true}).click()
 await page.getByRole('button',{name:'Sales',exact:true}).click()
 await page.getByText('Optional tax and loyalty settings',{exact:true}).click()
 await page.getByLabel('Calculate tax on sales',{exact:true}).check()
 await page.getByLabel('Rate (%)',{exact:true}).fill('20')
 await page.getByText('Product tax rates',{exact:true}).click()
 await page.getByLabel('Tax rate for Orange juice',{exact:true}).fill('0')
 await page.getByLabel('Tax rate for Wholemeal bread',{exact:true}).fill('5')
 await page.getByLabel('Earn and spend customer rewards',{exact:true}).check()
 await page.getByLabel('Reward percentage of purchase',{exact:true}).fill('10')
 await page.getByRole('button',{name:'Save POS settings',exact:true}).click()
 await page.waitForFunction(async()=>{const r=await fetch('/api/pos',{headers:{Authorization:`Bearer ${localStorage.getItem('stockroom-token')}`}});return (await r.json()).settings.loyaltyRate===10})
 await page.getByRole('button',{name:'Stock & checkout',exact:true}).click()
 async function checkout(redeem){
  await page.getByRole('button',{name:/^Add Orange juice,/}).click()
  await page.getByRole('button',{name:/^Add Wholemeal bread,/}).click()
  await page.locator('#pos-checkout .pos-adjustments select').first().selectOption(customer.id)
  if(redeem)await page.getByLabel(/Spend rewards/).fill(String(redeem))
  await page.getByRole('button',{name:/Take payment/}).click()
  const pay=page.locator('#pos-payment')
  await pay.getByLabel('Payment method',{exact:true}).selectOption('cash')
  await pay.getByLabel('Cash received',{exact:true}).fill('30')
  await pay.getByRole('button',{name:'Complete sale',exact:true}).click()
  await page.waitForFunction(async(count)=>{const r=await fetch('/api/sales',{headers:{Authorization:`Bearer ${localStorage.getItem('stockroom-token')}`}});return (await r.json()).sales.length===count},redeem?2:1)
 }
 await checkout(0)
 const readSales=async count=>{for(let attempt=0;attempt<40;attempt++){const result=await (await fetch(base+'/api/sales',{headers})).json();if(result.sales.length===count)return result;await new Promise(resolve=>setTimeout(resolve,50))}throw new Error('Saved receipt was not available')}
 const first=await readSales(1)
 assert.equal(first.sales[0].total,25.5)
 await checkout(2)
 const second=await readSales(2)
 const spent=second.sales.find(sale=>sale.paymentDetails?.pos?.loyaltyRedeemed===2)
 assert.ok(spent)
 assert.equal(spent.total,23.46)
 assert.equal(spent.paymentDetails.pos.loyaltyEarned,2.35)
 const pos=await (await fetch(base+'/api/pos',{headers})).json()
 assert.equal(pos.loyaltyBalances[customer.id],2.9)
 await page.getByRole('button',{name:'Cash register',exact:true}).click()
 await page.getByLabel('Starting cash',{exact:true}).fill('50')
 await page.getByRole('button',{name:'Open register',exact:true}).click()
 await page.getByLabel('Cash counted at closing',{exact:true}).fill('50')
 await page.getByRole('button',{name:'Close register',exact:true}).click()
 await page.getByLabel('Starting cash',{exact:true}).waitFor()
 assert.equal(await page.getByText('Optional tax and loyalty settings',{exact:true}).count(),0)
 // UI role fixtures; server authorization is unchanged and separately tested.
 for(const role of ['cashier','admin']) {
  const rolePage=await browser.newPage()
  const identity={...account.user,role,operationalAccess:false}
  await rolePage.route('**/api/auth/session',route=>route.fulfill({json:{user:identity,token:account.token}}))
  await rolePage.route('**/api/subscriptions/access',route=>route.fulfill({json:{testMode:true,blocked:false,status:'test'}}))
  await rolePage.addInitScript(({identity,token})=>{localStorage.setItem('stockroom-token',token);localStorage.setItem('stockroom-user',JSON.stringify(identity))},{identity,token:account.token})
  await rolePage.goto(base)
  await rolePage.locator('.sidebar').waitFor()
  if(role==='cashier') {
   await rolePage.getByRole('heading',{name:'Basket',exact:true}).waitFor()
   assert.equal(await rolePage.getByRole('button',{name:'Business settings',exact:true}).count(),0)
   assert.equal(await rolePage.getByText('Product variants and extras',{exact:true}).count(),0)
   await rolePage.getByRole('button',{name:'Cash register',exact:true}).click()
   await rolePage.getByLabel('Starting cash',{exact:true}).waitFor()
  } else {
   await rolePage.getByRole('button',{name:'Business settings',exact:true}).click()
   await rolePage.getByRole('heading',{name:'Device setup wizard',exact:true}).waitFor()
   assert.equal(await rolePage.getByRole('button',{name:'Workspaces',exact:true}).count(),0)
   await rolePage.getByRole('button',{name:'Receipts',exact:true}).click()
   await rolePage.getByRole('button',{name:'Customize receipt',exact:true}).waitFor()
   await rolePage.reload()
   await rolePage.getByRole('heading',{name:'Device setup wizard',exact:true}).waitFor()
  }
  await rolePage.close()
 }
 assert.deepEqual(errors,[])
 assert.deepEqual(dialogs,[])
 console.log('PASS: optional product tax settings, exempt goods, earn rewards and redeem them through cash checkout without external network access')
} finally {if(browser)await browser.close();child.kill();await once(child,'exit').catch(()=>{});await rm(data,{recursive:true,force:true}); subscriptionServer.close()}
