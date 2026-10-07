import { createServer } from 'vite'
import { createServer as createHttpServer } from 'node:http'
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import assert from 'node:assert/strict'

const data=await mkdtemp(join(tmpdir(),'stockroom-stock-work-'))
const base='http://127.0.0.1:9365'
const cloud=createHttpServer((request,response)=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify({businessId:'stock-work-test',testMode:true}))})
await new Promise(resolve=>cloud.listen(0,'127.0.0.1',resolve))
const child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:'9365',CUSTOMER_DISPLAY_PORT:'9366',STOCKROOM_DATA_DIR:data,SYNC_CONFIG_PATH:join(data,'sync.json'),BUSINESS_ID:'stock-work-test',SYNC_API_URL:`http://127.0.0.1:${cloud.address().port}`,SYNC_DEVICE_TOKEN:'test',DEVICE_ID:'stock-work-test-device'},stdio:'ignore'})
let server,browser
try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(resolve=>setTimeout(resolve,100))}
  const account=await (await fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appName:'Batch Shop',ownerName:'Owner',email:'batch@test.local',password:'long-test-password'})})).json()
  assert.ok(account.token)
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+account.token,'X-Stockroom-Branch':'main','X-Stockroom-Till':'batch-till'}
  const api=async(path,input)=>{const response=await fetch(base+path,{method:input?'POST':'GET',headers,body:input?JSON.stringify(input):undefined});const result=await response.json();assert.ok(response.ok,JSON.stringify(result));return result}
  const paper=await api('/api/products',{name:'Paper',sku:'paper',category:'Materials',unit:'sheet',cost:0.1,price:0,stock:1000,reorder:0})
  const flour=await api('/api/products',{name:'Flour',sku:'flour',category:'Ingredients',unit:'kg',cost:4,price:0,stock:10,reorder:0})
  const bread=await api('/api/products',{name:'Bread',sku:'bread',category:'Finished food',unit:'piece',cost:0,price:3,stock:0,reorder:0})
  const {job}=await api('/api/pos/service-jobs',{id:'service-job:browser',commandId:'create',expectedUpdatedAt:'',title:'Print flyers',customerName:'Ada',customerPhone:'555',lines:[{id:'flyer',description:'Flyers',quantity:100,price:1}]})
  server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false,proxy:{'/api':base}}});await server.listen()
  browser=await chromium.launch({channel:'msedge',headless:true})
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(15000)
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  const ui=`http://127.0.0.1:${server.httpServer.address().port}`
  await page.route(ui+'/harness',route=>route.fulfill({contentType:'text/html',body:'<link rel="stylesheet" href="/src/styles.css"><div id="root"></div>'}))
  await page.goto(ui+'/harness')
  const mount=async job=>page.evaluate(async({headers,job})=>{
    const {React,createRoot}=await import('/test/shop-setup-harness.ts');const {StockWork}=await import('/src/StockWork.tsx')
    window.workRoot?.unmount();window.workRoot=createRoot(document.getElementById('root'))
    window.workRoot.render(React.createElement(StockWork,{headers,storageKey:'batch-browser',money:value=>'$'+value.toFixed(2),job}))
  },{headers,job})
  await mount(job)
  await page.getByLabel('Work reference / reason').fill('Flyer printing')
  await page.getByLabel('Stock used',{exact:true}).selectOption(paper.id)
  await page.getByLabel('Actual quantity used').fill('20')
  await page.getByRole('button',{name:'Review stock changes'}).click()
  await page.getByRole('button',{name:'Cancel',exact:true}).click()
  assert.equal((await api('/api/products')).products.find(row=>row.id===paper.id).stock,1000)
  await page.getByRole('button',{name:'Review stock changes'}).click()
  assert.match(await page.getByRole('button',{name:'Confirm stock changes'}).getAttribute('class'),/closure-confirm/)
  let loseResponse=true
  await page.route('**/api/pos/stock-work',async route=>{
    if(route.request().method()==='POST'&&loseResponse){loseResponse=false;const response=await route.fetch();assert.equal(response.status(),200);await route.abort();return}await route.continue()
  })
  await page.getByRole('button',{name:'Confirm stock changes'}).click()
  await page.getByRole('alert').filter({hasText:/fetch|Failed|Network/i}).waitFor()
  await page.getByRole('button',{name:'Confirm stock changes'}).click()
  await page.getByText('Stock work saved. Captured material cost: $2.00.',{exact:true}).waitFor()
  assert.equal((await api('/api/products')).products.find(row=>row.id===paper.id).stock,980)
  assert.equal((await api('/api/pos/stock-work')).records.length,1)
  await page.getByRole('button',{name:'Purchasing and wastage',exact:true}).click()
  await page.getByRole('heading',{name:'Purchasing and receiving',exact:true}).waitFor()
  await page.getByRole('button',{name:'Purchasing and wastage',exact:true}).click()
  await mount(undefined)
  await page.getByLabel('Work reference / reason').fill('Morning bread')
  await page.getByLabel('Stock used',{exact:true}).selectOption(flour.id)
  await page.getByLabel('Actual quantity used').fill('2')
  await page.getByLabel('Finished stock product',{exact:true}).selectOption(bread.id)
  await page.getByLabel('Expected finished quantity').fill('10')
  await page.getByLabel('Actual usable finished quantity').fill('8')
  await page.getByLabel('Finished batch expiry (optional)').fill('2099-01-01')
  await page.getByRole('button',{name:'Review stock changes'}).click()
  await page.getByRole('button',{name:'Confirm stock changes'}).click()
  await page.getByText('Stock work saved. Captured material cost: $8.00.',{exact:true}).waitFor()
  let products=(await api('/api/products')).products
  assert.equal(products.find(row=>row.id===bread.id).stock,8);assert.equal(products.find(row=>row.id===flour.id).stock,8)
  const production=(await api('/api/pos/stock-work')).records.find(row=>row.kind==='food-production')
  assert.equal(production.output.unitCost,1)
  const reports=await api('/api/reports');assert.equal(reports.profit.cost,2,'Only service materials are expensed before finished goods are sold')
  await api('/api/sales',{id:'sold-bread',total:6,createdAt:new Date().toISOString(),paymentMethod:'cash',items:[{productId:bread.id,productName:'Bread',quantity:2,price:3}]})
  products=(await api('/api/products')).products
  assert.equal(products.find(row=>row.id===bread.id).stock,6)
  const soldReport=await api('/api/reports');assert.equal(soldReport.profit.cost,4);assert.equal(soldReport.profit.amount,2)
  await page.getByRole('button',{name:'Use for new batch'}).click()
  assert.equal(await page.getByLabel('Actual usable finished quantity').inputValue(),'8')
  assert.equal(await page.getByLabel('Finished batch expiry (optional)').inputValue(),'')
  assert.deepEqual(errors,[])
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  console.log('PASS: real stock use, Cancel, red confirmation, lost-response retry, batch yields/costs, copy batch and reports')
}finally{if(browser)await browser.close();if(server)await server.close();child.kill();await once(child,'exit').catch(()=>{});await rm(data,{recursive:true,force:true});cloud.close()}
