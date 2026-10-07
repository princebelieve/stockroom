import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false}});await server.listen()
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 const page=await browser.newPage();page.setDefaultTimeout(15000)
 const base=`http://127.0.0.1:${server.httpServer.address().port}`
 await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort())
 await page.route(base+'/reliability-test',async route=>route.fulfill({contentType:'text/html',body:await server.transformIndexHtml('/reliability-test','<html><body><div id="root"></div></body></html>')}))
 await page.goto(base+'/reliability-test')
 await page.evaluate(async()=>{
  const {React,createRoot}=await import('/test/shop-setup-harness.ts')
  const {openBrowserDatabase,withBrowserDatabase}=await import('/src/lib/browserDatabase.ts')
  const {handleBrowserApi}=await import('/src/lib/browserApi.ts')
  await withBrowserDatabase(async()=>{const db=await openBrowserDatabase();await db.run("INSERT INTO app_settings(id,app_name,currency,updated_at) VALUES(1,'Shop','NGN',?)",[new Date().toISOString()]);await db.run("INSERT INTO users(id,name,email,role,created_at) VALUES('owner','Owner','owner@test.local','owner',?)",[new Date().toISOString()]);await db.run("INSERT INTO mobile_settings(key,value) VALUES('sessionUserId','owner')");await db.run('INSERT INTO sync_conflicts(id,operation_id,entity_type,entity_id,reason,local_payload,remote_payload,created_at) VALUES(?,?,?,?,?,?,?,?)',['issue','operation','product','rice','Competing stock changes',JSON.stringify({stock:2,password:'hidden-secret'}),JSON.stringify({stock:3}),new Date().toISOString()]);return new Response('{}')})
  const original=window.fetch.bind(window);window.fetch=(path,init)=>typeof path==='string'&&path.startsWith('/api/')?withBrowserDatabase(()=>handleBrowserApi(path,init)):original(path,init)
  const {SyncIssues}=await import('/src/SyncIssues.tsx');const {SupportContacts}=await import('/src/SupportContacts.tsx');const {Reconciliation}=await import('/src/Reconciliation.tsx')
  function App(){const [conflicts,setConflicts]=React.useState([]);React.useEffect(()=>{fetch('/api/sync/conflicts').then(r=>r.json()).then(r=>setConflicts(r.conflicts))},[]);return React.createElement(React.Fragment,null,React.createElement(SyncIssues,{conflicts,headers:{},navigate:()=>{},resolveConflict:async(id,input)=>{const response=await fetch('/api/sync/conflicts/'+id+'/resolve',{method:'POST',body:JSON.stringify(input)});if(!response.ok)throw new Error((await response.json()).error);setConflicts([])}}),React.createElement(SupportContacts),React.createElement(Reconciliation,{sales:[{id:'split',createdAt:'2026-10-07T10:00:00Z',paymentMethod:'multiple',currency:'NGN',total:100,paymentDetails:{allocations:[{method:'cash',amount:30},{method:'bank-transfer',amount:70,reference:'transfer'}]}},{id:'absent',createdAt:'2026-10-07T10:00:00Z',paymentMethod:'bank-transfer',currency:'NGN',total:20,paymentReference:'missing'}]}))}
  createRoot(document.getElementById('root')).render(React.createElement(App))
 })
 await page.getByRole('button',{name:'product: rice',exact:true}).click()
 assert.equal(await page.getByText('hidden-secret',{exact:false}).count(),0)
 await page.getByLabel('What you checked or corrected').fill('Stock count SC-15 approved after checking physical rice.')
 await page.getByLabel('I checked the current records and any money or stock difference.').check()
 await page.getByRole('button',{name:'Record review outcome',exact:true}).click()
 await page.getByText('No open sync issues.',{exact:true}).waitFor()
 await page.getByText('Recorded review outcomes',{exact:true}).click()
 await page.getByText('Stock count SC-15 approved after checking physical rice.',{exact:false}).waitFor()
 assert.equal(await page.locator('a[href="https://wa.me/2347033928277"]').count(),1)
 assert.equal(await page.locator('a[href="mailto:support@sbi.globalcreest.com"]').count(),1)
 await page.getByLabel('Provider CSV').setInputFiles({name:'bank.csv',mimeType:'text/csv',buffer:Buffer.from('ref,amount,status,currency\ntransfer,70,SUCCESS,NGN')})
 await page.getByLabel('Payment type').selectOption('bank-transfer')
 await page.getByLabel('Sales from (UTC date)').fill('2026-10-07')
 await page.getByLabel('Sales through (UTC date)').fill('2026-10-07')
 for(const [name,value] of [['reference','0'],['amount','1'],['status','2'],['currency','3']])await page.getByLabel(name+' column').selectOption(value)
 await page.getByRole('button',{name:'Compare transactions',exact:true}).click()
 await page.getByRole('cell',{name:'Matched',exact:true}).waitFor()
 await page.getByRole('cell',{name:'Recorded payment absent from report',exact:true}).waitFor()
 const invalid=await page.evaluate(async()=>{const r=await fetch('/api/sync/conflicts/issue/resolve',{method:'POST',body:JSON.stringify({action:'accepted',confirmed:false,note:'invalid'})});return r.status})
 assert.ok(invalid>=400)
 console.log('PASS: browser database conflict inspection, redaction, audited outcome, support links, transfer/split reconciliation and missing payments')
}finally{await browser.close();await server.close()}
