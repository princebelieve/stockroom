import { createServer } from 'vite'
import { createServer as createHttpServer } from 'node:http'
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import assert from 'node:assert/strict'

const data=await mkdtemp(join(tmpdir(),'stockroom-oil-'))
const base='http://127.0.0.1:9385'
const cloud=createHttpServer((request,response)=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify({businessId:'oil-test',testMode:true}))})
await new Promise(resolve=>cloud.listen(0,'127.0.0.1',resolve))
const child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:'9385',CUSTOMER_DISPLAY_PORT:'9386',STOCKROOM_DATA_DIR:data,SYNC_CONFIG_PATH:join(data,'sync.json'),BUSINESS_ID:'oil-test',SYNC_API_URL:`http://127.0.0.1:${cloud.address().port}`,SYNC_DEVICE_TOKEN:'test',DEVICE_ID:'oil-test-device'},stdio:'ignore'})
let server,browser
try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(resolve=>setTimeout(resolve,100))}
  const account=await (await fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appName:'Batch Shop',ownerName:'Owner',email:'batch@test.local',password:'long-test-password'})})).json()
  assert.ok(account.token)
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+account.token,'X-Stockroom-Branch':'main','X-Stockroom-Till':'batch-till'}
  const api=async(path,input)=>{const response=await fetch(base+path,{method:input?'POST':'GET',headers,body:input?JSON.stringify(input):undefined});const result=await response.json();assert.ok(response.ok,JSON.stringify(result));return result}
  const oil=await api('/api/products',{name:'Palm oil',sku:'OIL',category:'Oil',unit:'litre',price:10,cost:4,stock:200,reorder:0})
  const customer=await api('/api/customers',{name:'Ada Buyer',phone:'555'})
  const profile=await fetch(base+'/api/settings/shop-profile',{method:'PUT',headers,body:JSON.stringify({mode:'suggested',industry:'liquids'})});assert.equal(profile.ok,true,await profile.text())
  await api('/api/retail',{id:'can25',kind:'conversion',productId:oil.id,label:'25 litre can',factor:25,sellInPos:true,salePrice:230})
  const state=await api('/api/pos');assert.equal(state.saleConversions.length,1,'Desktop loads oil containers from its profile')
  server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false,proxy:{'/api':base}}});await server.listen()
  browser=await chromium.launch({channel:'msedge',headless:true})
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(15000)
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  const ui=`http://127.0.0.1:${server.httpServer.address().port}`
  await page.route(ui+'/harness',route=>route.fulfill({contentType:'text/html',body:'<link rel="stylesheet" href="/src/styles.css"><div id="root"></div>'}))
  await page.goto(ui+'/harness')
  await page.evaluate(async({headers,oil,customer})=>{
    const {React,createRoot}=await import('/test/shop-setup-harness.ts');const {OilPricing}=await import('/src/OilPricing.tsx')
    window.root=createRoot(document.getElementById('root'));window.root.render(React.createElement(OilPricing,{headers,products:[oil],customers:[customer],storageKey:'oil-config',refresh:async()=>{}}))
  },{headers,oil,customer})
  await page.getByLabel('Oil pricing product').selectOption(oil.id)
  await page.getByRole('button',{name:'Add bulk rate',exact:true}).click()
  await page.getByLabel('Bulk minimum quantity').fill('20')
  await page.getByLabel('Bulk unit price').fill('8')
  await page.getByRole('button',{name:'Add bulk rate',exact:true}).click()
  await page.getByLabel('Bulk minimum quantity').nth(1).fill('100')
  await page.getByLabel('Bulk unit price').nth(1).fill('7')
  await page.getByRole('button',{name:'Add customer rate',exact:true}).click()
  await page.getByLabel('Pricing customer').selectOption(customer.id)
  await page.getByLabel('Customer unit price').fill('6')
  let lost=true
  await page.route('**/api/pos/oil-pricing',async route=>{if(lost){lost=false;const response=await route.fetch();assert.equal(response.status(),200);await route.abort();return}await route.continue()})
  await page.getByRole('button',{name:'Save oil price tiers',exact:true}).click()
  await page.getByRole('alert').filter({hasText:/fetch|Failed|Network/i}).waitFor()
  await page.getByRole('button',{name:'Save oil price tiers',exact:true}).click()
  await page.getByText('Price tiers saved. Existing receipts keep their original prices.',{exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await page.evaluate(async({headers,oil,customer,account})=>{
    const {React,createRoot}=await import('/test/shop-setup-harness.ts');const {usePosBasket}=await import('/src/lib/usePosBasket.ts')
    window.root.unmount();window.root=createRoot(document.getElementById('root'))
    function App(){const [cart,setCart]=React.useState({}),[id,setId]=React.useState('oil-sale');const pos=usePosBasket({user:{...account.user,organizationId:'oil-test'},branchId:'main',headers,cart,setCart,orderId:id,setOrderId:setId,products:[oil],workspaceId:'oil'});window.oilBasket=pos
      const pack=pos.catalogue.find(row=>row.saleFactor===25)
      return React.createElement('section',null,React.createElement('label',null,'Oil customer',React.createElement('select',{value:pos.customerId,onChange:e=>pos.setCustomerId(e.target.value)},React.createElement('option',{value:''},'Retail customer'),React.createElement('option',{value:customer.id},customer.name))),React.createElement('label',null,'Loose litres',React.createElement('input',{value:cart[oil.id]||'',onChange:e=>setCart({...cart,[oil.id]:Number(e.target.value)})})),pack&&React.createElement('label',null,'Cans',React.createElement('input',{value:cart[pack.id]||'',onChange:e=>setCart({...cart,[pack.id]:Number(e.target.value)})})),React.createElement('p',{id:'total'},String(pos.pricing.total)),React.createElement('p',{id:'items'},JSON.stringify(pos.items)))
    }
    window.root.render(React.createElement(App))
  },{headers,oil,customer,account})
  await page.getByLabel('Cans').fill('1');await page.waitForFunction(()=>window.oilBasket.pricing.total===200)
  await page.getByLabel('Loose litres').fill('75');await page.waitForFunction(()=>window.oilBasket.pricing.total===700)
  await page.getByLabel('Oil customer').selectOption(customer.id);await page.waitForFunction(()=>window.oilBasket.pricing.total===600)
  const snapshot=await page.evaluate(()=>({items:window.oilBasket.items,pricing:window.oilBasket.pricing}))
  assert.equal(snapshot.items.reduce((n,row)=>n+row.quantity,0),100)
  assert.ok(snapshot.items.every(row=>row.price===6&&row.productName.includes('Customer rate')))
  await page.getByLabel('Oil customer').selectOption('');await page.getByLabel('Loose litres').fill('0');await page.getByLabel('Cans').fill('0');await page.getByLabel('Loose litres').fill('19.999');await page.waitForFunction(()=>window.oilBasket.pricing.total===199.99)
  await page.getByLabel('Loose litres').fill('20');await page.waitForFunction(()=>window.oilBasket.pricing.total===160)
  await api('/api/sales',{id:'oil-sale',total:600,createdAt:new Date().toISOString(),paymentMethod:'cash',items:snapshot.items,paymentDetails:{pos:{workspace:'oil',tillId:'batch-till',customerId:customer.id,pricing:snapshot.pricing,tax:state.settings}}})
  assert.equal((await api('/api/products')).products.find(row=>row.id===oil.id).stock,100)
  const savedRates=(await api('/api/pos')).products.find(row=>row.productId===oil.id)
  await api('/api/pos/oil-pricing',{productId:oil.id,commandId:'changed-rate',expectedUpdatedAt:savedRates.updatedAt,value:{bulk:[],customers:[{customerId:customer.id,price:5}]}})
  const savedSale=(await api('/api/sales')).sales.find(row=>row.id==='oil-sale');assert.equal(savedSale.total,600);assert.ok(savedSale.items.every(row=>row.unitPrice===6))
  const refund=await api('/api/pos/returns',{id:'oil-refund',saleId:'oil-sale',reason:'Returned unused oil',method:'cash',items:[{lineIndex:0,quantity:5,restock:true}]});assert.equal(refund.total,30,'Refund retains original rate after changing price rules')
  assert.equal((await api('/api/products')).products.find(row=>row.id===oil.id).stock,105)
  const retailProfile=await fetch(base+'/api/settings/shop-profile',{method:'PUT',headers,body:JSON.stringify({mode:'suggested',industry:'general',workflows:'stock'})});assert.equal(retailProfile.ok,true,await retailProfile.text())
  assert.equal((await api('/api/pos')).saleConversions.length,1,'Saved selling packs remain available independently of the preset')
  const rice=await api('/api/products',{name:'Rice bag',sku:'RICE',category:'Groceries',unit:'bag',price:10,cost:4,stock:100,reorder:0})
  await api('/api/retail',{id:'rice-pack5',kind:'conversion',productId:rice.id,label:'5 bag pack',factor:5,sellInPos:true,salePrice:45})
  await page.evaluate(async({headers,rice,customer})=>{
    const {React,createRoot}=await import('/test/shop-setup-harness.ts');const {OilPricing}=await import('/src/OilPricing.tsx')
    window.root.unmount();window.root=createRoot(document.getElementById('root'));window.root.render(React.createElement(OilPricing,{headers,products:[rice],customers:[customer],storageKey:'retail-config',oil:false,refresh:async()=>{}}))
  },{headers,rice,customer})
  await page.getByRole('heading',{name:'Product price tiers',exact:true}).waitFor()
  await page.getByLabel('Pricing product').selectOption(rice.id)
  await page.getByRole('button',{name:'Add bulk rate',exact:true}).click()
  await page.getByLabel('Bulk minimum quantity').fill('10');await page.getByLabel('Bulk unit price').fill('8')
  await page.getByRole('button',{name:'Add customer rate',exact:true}).click()
  await page.getByLabel('Pricing customer').selectOption(customer.id);await page.getByLabel('Customer unit price').fill('6')
  await page.getByRole('button',{name:'Save product price tiers',exact:true}).click()
  await page.getByText('Price tiers saved. Existing receipts keep their original prices.',{exact:true}).waitFor()
  await page.evaluate(async({headers,rice,customer,account})=>{
    const {React,createRoot}=await import('/test/shop-setup-harness.ts');const {usePosBasket}=await import('/src/lib/usePosBasket.ts')
    window.root.unmount();window.root=createRoot(document.getElementById('root'))
    function App(){const [cart,setCart]=React.useState({}),[id,setId]=React.useState('retail-sale');const pos=usePosBasket({user:{...account.user,organizationId:'oil-test'},branchId:'main',headers,cart,setCart,orderId:id,setOrderId:setId,products:[rice],workspaceId:'products'});window.retailBasket=pos
      return React.createElement('section',null,React.createElement('label',null,'Retail customer',React.createElement('select',{value:pos.customerId,onChange:e=>pos.setCustomerId(e.target.value)},React.createElement('option',{value:''},'Retail customer'),React.createElement('option',{value:customer.id},customer.name))),React.createElement('label',null,'Bags',React.createElement('input',{value:cart[rice.id]||'',onChange:e=>setCart({...cart,[rice.id]:Number(e.target.value)})})),pos.catalogue.find(row=>row.saleFactor===5)&&React.createElement('label',null,'Rice packs',React.createElement('input',{value:cart[pos.catalogue.find(row=>row.saleFactor===5).id]||'',onChange:e=>setCart({...cart,[pos.catalogue.find(row=>row.saleFactor===5).id]:Number(e.target.value)})})))
    }
    window.root.render(React.createElement(App))
  },{headers,rice,customer,account})
  await page.getByLabel('Bags').fill('9');await page.waitForFunction(()=>window.retailBasket.pricing.total===90)
  await page.getByLabel('Bags').fill('10');await page.waitForFunction(()=>window.retailBasket.pricing.total===80)
  assert.ok((await page.evaluate(()=>window.retailBasket.items))[0].productName.includes('Bulk rate'))
  await page.getByLabel('Bags').fill('0');await page.getByLabel('Rice packs').fill('1');await page.waitForFunction(()=>window.retailBasket.pricing.total===45)
  await page.getByLabel('Bags').fill('5');await page.waitForFunction(()=>window.retailBasket.pricing.total===80)
  await page.getByLabel('Rice packs').fill('0');await page.getByLabel('Bags').fill('10');await page.waitForFunction(()=>window.retailBasket.pricing.total===80)
  await page.getByLabel('Retail customer').selectOption(customer.id);await page.waitForFunction(()=>window.retailBasket.pricing.total===60)
  await page.evaluate(id=>window.retailBasket.setOverrides({[id]:9}),rice.id);await page.waitForFunction(()=>window.retailBasket.pricing.total===90)
  await page.evaluate(()=>window.retailBasket.setOverrides({}));await page.waitForFunction(()=>window.retailBasket.pricing.total===60)
  const retailSnapshot=await page.evaluate(()=>({items:window.retailBasket.items,pricing:window.retailBasket.pricing}))
  await api('/api/sales',{id:'retail-sale',total:60,createdAt:new Date().toISOString(),paymentMethod:'cash',items:retailSnapshot.items,paymentDetails:{pos:{workspace:'products',tillId:'batch-till',customerId:customer.id,pricing:retailSnapshot.pricing,tax:state.settings}}})
  assert.equal((await api('/api/products')).products.find(row=>row.id===rice.id).stock,90)
  const riceRates=(await api('/api/pos')).products.find(row=>row.productId===rice.id)
  await api('/api/pos/oil-pricing',{productId:rice.id,commandId:'rice-changed-rate',expectedUpdatedAt:riceRates.updatedAt,value:{bulk:[],customers:[{customerId:customer.id,price:5}]}})
  const retailSale=(await api('/api/sales')).sales.find(row=>row.id==='retail-sale');assert.equal(retailSale.total,60);assert.equal(retailSale.items[0].unitPrice,6)
  const retailRefund=await api('/api/pos/returns',{id:'retail-refund',saleId:'retail-sale',reason:'Returned bag',method:'cash',items:[{lineIndex:0,quantity:1,restock:true}]});assert.equal(retailRefund.total,6)
  assert.equal((await api('/api/products')).products.find(row=>row.id===rice.id).stock,91)
  assert.deepEqual(errors,[])
  console.log('PASS: shared retail tiers, customer precedence, manual overrides, original-price retail refunds, desktop containers, tier configuration, lost-save retry, combined loose/container thresholds, customer precedence, fractional boundary, receipt prices, stock consumption and mobile setup')
}catch(error){if(browser)console.log(await browser.contexts()[0].pages()[0].locator('body').innerText());throw error}finally{if(browser)await browser.close();if(server)await server.close();child.kill();await once(child,'exit').catch(()=>{});await rm(data,{recursive:true,force:true});cloud.close()}
