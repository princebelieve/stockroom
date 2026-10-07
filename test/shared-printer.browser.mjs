import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false}});await server.listen()
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const page=await browser.newPage();page.setDefaultTimeout(20000);let state='pending',claims=0,results=0
 const job={id:'ticket',station:'kitchen',order:{id:'order',lines:[{name:'Meal'}]}}
 await page.route('**/api/preparation-print/**',async route=>{
  const action=new URL(route.request().url()).pathname.split('/').pop();let data
  if(action==='jobs')data={shared:true,designated:true,jobs:state==='submitted'?[]:[{...job,state}]}
  else if(action==='claim'){claims++;state='printing';data={claimed:true,attemptId:'attempt-'+claims}}
  else if(action==='result'){results++;if(results===1){await route.abort();return}state='submitted';data={saved:true}}
  else if(action==='retry'){assert.equal(route.request().postDataJSON().confirmDuplicateRisk,true);state='pending';data={saved:true}}
  else throw new Error(action)
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)})
 })
 const base=`http://127.0.0.1:${server.httpServer.address().port}`;await page.route(base+'/harness',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto(base+'/harness')
 await page.evaluate(async()=>{
  window.printed=[];window.stockroomDesktop={};localStorage.setItem('stockroom-printers',JSON.stringify({kitchen:'Kitchen'}))
  const{React,createRoot}=await import('/test/shop-setup-harness.ts');const{SharedPreparationPrinter}=await import('/src/SharedPreparationPrinter.tsx')
  createRoot(document.getElementById('root')).render(React.createElement(SharedPreparationPrinter,{headers:{Authorization:'Bearer local','X-Stockroom-Branch':'main'},scope:'shop:main',owner:false,configure:false,apiUrl:'',token:'',onToken:()=>{},print:async(order,station)=>window.printed.push({order,station})}))
 })
 await page.getByRole('button',{name:'Retry ticket (may print twice)'}).waitFor()
 assert.equal(claims,1);assert.equal(await page.evaluate(()=>window.printed.length),1)
 await page.getByRole('button',{name:'Retry ticket (may print twice)'}).click()
 await page.waitForFunction(()=>window.printed.length===2);assert.equal(claims,2)
 assert.equal(await page.evaluate(()=>window.printed[0].station),'kitchen')
 console.log('PASS: shared worker claims once, retains uncertain acknowledgement and retries only explicitly')
}finally{await browser.close();await server.close()}
