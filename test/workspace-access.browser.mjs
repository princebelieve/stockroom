import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const server = await createServer({server:{port:0,host:'127.0.0.1',hmr:false}})
await server.listen()
const browser = await chromium.launch({channel:'msedge',headless:true})
try {
  const page = await browser.newPage()
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  const base=`http://127.0.0.1:${server.httpServer.address().port}`
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort())
  await page.route(`${base}/access-test`,async route=>route.fulfill({contentType:'text/html',body:await server.transformIndexHtml('/access-test','<html><body><div id="root"></div></body></html>')}))
  await page.route(`${base}/api/pos/retail-orders`,route=>route.fulfill({json:{menu:{id:'retail',items:[],updatedAt:''},orders:[],receipts:[],customers:[],returns:[],loyaltyBalances:{},settings:{}}}))
  await page.goto(`${base}/access-test`)
  await page.evaluate(async()=>{
    const {React,createRoot}=await import('/test/shop-setup-harness.ts')
    const {StaffPermissions}=await import('/src/StaffPermissions.tsx')
    const {PaymentPolicySettings}=await import('/src/PaymentPolicySettings.tsx')
    const {CounterService}=await import('/src/CounterService.tsx')
    const {WorkspaceHelpProvider}=await import('/src/WorkspaceHelp.tsx')
    const {applyBusinessPreset,normalizeShopProfile}=await import('/server/shop-profile.mjs')
    const {paymentPolicy}=await import('/server/payment.mjs')
    const root=createRoot(document.getElementById('root'))
    window.renderWorkspace=(key,screen='access')=>{
      const profile=applyBusinessPreset(normalizeShopProfile(),key)
      const child=screen==='access'?React.createElement(StaffPermissions,{profile,member:{id:'staff',role:'cashier',permissions:{restaurant:true,productSales:false}},save:async(id,permissions)=>{window.savedPermissions=permissions}}):screen==='settings'?React.createElement(PaymentPolicySettings,{profile,value:paymentPolicy(),onChange:()=>{}}):React.createElement(CounterService,{retail:true,access:{oilSales:true},headers:{},storageKey:'test-orders',products:[],receipts:[],manager:false,owner:false,money:String,print:async()=>{},printTicket:async()=>{},synchronize:async()=>{},refreshStock:async()=>{},pay:async()=>{}})
      root.render(React.createElement(WorkspaceHelpProvider,null,child))
    }
    window.renderWorkspace('retail')
  })
  await page.getByText('Choose staff access',{exact:true}).click()
  await page.getByLabel('Product sales',{exact:true}).check()
  assert.equal(await page.getByLabel('Tables & tabs',{exact:true}).count(),0)
  assert.equal(await page.getByLabel('Church collections',{exact:true}).count(),0)
  await page.getByRole('button',{name:'Save staff access',exact:true}).click()
  await page.waitForFunction(()=>window.savedPermissions?.productSales===true)
  assert.equal(await page.evaluate(()=>window.savedPermissions.restaurant),true,'Hidden permissions must survive saving')
  await page.evaluate(()=>window.renderWorkspace('printing'))
  await page.getByLabel('Job materials and costs',{exact:true}).waitFor()
  assert.equal(await page.getByLabel('Product sales',{exact:true}).count(),0)
  assert.equal(await page.getByLabel('Church collections',{exact:true}).count(),0)
  await page.evaluate(()=>window.renderWorkspace('restaurant','settings'))
  await page.getByLabel('Payment setup',{exact:true}).selectOption('ordering')
  assert.equal(await page.getByLabel('Enable online product orders',{exact:true}).count(),0)
  assert.equal(await page.getByLabel('Offer delivery on online orders',{exact:true}).count(),0)
  await page.evaluate(()=>window.renderWorkspace('retail','settings'))
  await page.getByLabel('Enable online product orders',{exact:true}).waitFor()
  await page.evaluate(()=>window.renderWorkspace('liquids','orders'))
  await page.getByText('No online orders',{exact:true}).waitFor()
  assert.deepEqual(await page.getByLabel('Order screen',{exact:true}).locator('option').allTextContents(),['Orders','Picking'])
  await page.getByLabel('Order screen',{exact:true}).selectOption('Preparation')
  await page.getByText('Nothing waiting to be picked',{exact:true}).waitFor()
  assert.equal(await page.getByLabel('Preparation station',{exact:true}).count(),0)
  assert.deepEqual(errors,[])
  console.log('PASS: workspace staff visibility, preserved hidden permissions, scoped ordering settings and oil-order picking UI')
} finally {await browser.close();await server.close()}
