import { createServer } from 'vite'
import { createServer as createHttpServer } from 'node:http'
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import assert from 'node:assert/strict'

const data=await mkdtemp(join(tmpdir(),'stockroom-church-'))
const base='http://127.0.0.1:9375'
const cloud=createHttpServer((request,response)=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify({businessId:'church-test',testMode:true}))})
await new Promise(resolve=>cloud.listen(0,'127.0.0.1',resolve))
const child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:'9375',CUSTOMER_DISPLAY_PORT:'9376',STOCKROOM_DATA_DIR:data,SYNC_CONFIG_PATH:join(data,'sync.json'),BUSINESS_ID:'church-test',SYNC_API_URL:`http://127.0.0.1:${cloud.address().port}`,SYNC_DEVICE_TOKEN:'test',DEVICE_ID:'church-test-device'},stdio:'ignore'})
let server,browser
try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(resolve=>setTimeout(resolve,100))}
  const account=await (await fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appName:'Batch Shop',ownerName:'Owner',email:'batch@test.local',password:'long-test-password'})})).json()
  assert.ok(account.token)
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+account.token,'X-Stockroom-Branch':'main','X-Stockroom-Till':'batch-till'}
  const api=async(path,input)=>{const response=await fetch(base+path,{method:input?'POST':'GET',headers,body:input?JSON.stringify(input):undefined});const result=await response.json();assert.ok(response.ok,JSON.stringify(result));return result}
  server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false,proxy:{'/api':base}}});await server.listen()
  browser=await chromium.launch({channel:'msedge',headless:true})
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(15000)
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  const ui=`http://127.0.0.1:${server.httpServer.address().port}`
  await page.route(ui+'/harness',route=>route.fulfill({contentType:'text/html',body:'<link rel="stylesheet" href="/src/styles.css"><div id="root"></div>'}))
  await page.goto(ui+'/harness')
  const mount=async()=>page.evaluate(async({headers})=>{
    const {React,createRoot}=await import('/test/shop-setup-harness.ts');const {ChurchCollections}=await import('/src/ChurchCollections.tsx')
    window.workRoot?.unmount();window.workRoot=createRoot(document.getElementById('root'))
    window.workRoot.render(React.createElement(ChurchCollections,{headers,storageKey:'church-browser',manager:true,providers:['Terminal'],print:async sale=>{window.savedReceipt=sale},beforeSend:async()=>{}}))
  },{headers})
  await mount()
  await page.getByRole('button',{name:'Add fund',exact:true}).click()
  await page.getByLabel('Fund name',{exact:true}).fill('Building fund')
  await page.getByRole('button',{name:'Confirm fund or donor',exact:true}).click()
  await page.getByRole('button',{name:'Add donor',exact:true}).click()
  await page.getByLabel('Donor name',{exact:true}).fill('Ada Donor')
  await page.getByLabel('Donor phone',{exact:true}).fill('555')
  await page.getByRole('button',{name:'Confirm fund or donor',exact:true}).click()
  await page.getByText('Fund or donor saved. History is preserved.',{exact:true}).waitFor()
  const identities=await api('/api/pos/church')
  await page.getByRole('button',{name:'New pledge / donation',exact:true}).click()
  await page.getByLabel('Collection fund').selectOption(identities.funds[0].id)
  await page.getByLabel('Collection donor').selectOption(identities.donors[0].id)
  await page.getByLabel('Collection purpose').fill('New roof')
  await page.getByLabel('Commitment amount').fill('100')
  await page.getByLabel('Pledge due date').fill('2020-01-01')
  await mount()
  assert.equal(await page.getByLabel('Collection purpose').inputValue(),'New roof','Draft survives remount')
  await page.getByRole('button',{name:'Save commitment',exact:true}).click()
  await page.getByText('Commitment saved. No payment was recorded.',{exact:true}).waitFor()
  assert.equal((await api('/api/sales')).sales.length,0)
  await page.getByRole('button',{name:'Receive contribution',exact:true}).click()
  await page.getByLabel('Contribution amount').fill('30')
  let lost=true
  await page.route('**/api/pos/service-jobs/pay',async route=>{if(lost){lost=false;const saved=await route.fetch();assert.equal(saved.status(),200);await route.abort();return}await route.continue()})
  await page.getByRole('button',{name:'Save contribution',exact:true}).click()
  await page.getByRole('alert').filter({hasText:/fetch|Failed|Network/i}).waitFor()
  await mount()
  await page.getByRole('button',{name:'Save contribution',exact:true}).click()
  await page.getByText('Contribution saved. One receipt records the payment.',{exact:true}).waitFor()
  assert.equal((await api('/api/sales')).sales.length,1,'Lost response is retried without a second payment')
  await page.getByRole('button',{name:'Print contribution receipt',exact:true}).click()
  await page.waitForFunction(()=>window.savedReceipt?.total===30)
  await page.getByRole('button',{name:'Refund contribution',exact:true}).click()
  await page.getByLabel('Refund amount').fill('10')
  await page.getByLabel('Refund reason').fill('Donor adjustment')
  await page.getByRole('button',{name:'Save refund',exact:true}).click()
  await page.getByText('Refund saved. Fund totals and pledge balance reflect it.',{exact:true}).waitFor()
  await page.getByLabel('Statement donor').selectOption(identities.donors[0].id)
  const download=page.waitForEvent('download')
  await page.getByRole('button',{name:'Export donor statement',exact:true}).click()
  const {readFile}=await import('node:fs/promises');const statement=await readFile(await (await download).path(),'utf8')
  assert.match(statement,/Ada Donor/);assert.match(statement,/Building fund/);assert.match(statement,/Refund/)
  const data=await api('/api/pos/church')
  assert.equal(data.summary.funds[0].net,20);assert.equal(data.summary.pledges[0].outstanding,80)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  assert.deepEqual(errors,[])
  console.log('PASS: funds, donor identities, pledge draft recovery, partial contribution, lost-response retry, receipt, refund reconciliation, statement export and mobile layout')
}catch(error){if(browser)console.log(await browser.contexts()[0].pages()[0].locator('body').innerText());throw error}finally{if(browser)await browser.close();if(server)await server.close();child.kill();await once(child,'exit').catch(()=>{});await rm(data,{recursive:true,force:true});cloud.close()}
