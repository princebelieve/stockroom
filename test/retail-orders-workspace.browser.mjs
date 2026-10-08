import {createServer} from 'vite'
import {chromium} from '@playwright/test'
import assert from 'node:assert/strict'
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false}});await server.listen()
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const page=await browser.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',error=>errors.push(error.message));const base=`http://127.0.0.1:${server.httpServer.address().port}`
 const order={id:'online-retail',kind:'counter-order',retailOrder:true,source:'customer-portal',acceptedTillId:'retail-till',tillId:'retail-till',branchId:'main',status:'queued',currency:'USD',businessName:'Shop',customerName:'Ada',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),note:'Deliver to 12 Market Street',delivery:{phone:'08012345678',address:'12 Market Street',fee:0},total:20,events:[],lines:[{id:'rice',menuItemId:'rice',productId:'rice',name:'Rice',quantity:2,price:10,options:[],ingredients:[]}]}
 await page.route(base+'/api/pos/retail-orders**',async route=>{if(route.request().method()==='POST'){const input=route.request().postDataJSON();order.status=input.status;order.updatedAt=new Date().toISOString();await route.fulfill({json:order})}else await route.fulfill({json:{menu:{id:'retail-catalogue',updatedAt:'',items:[]},orders:[order],receipts:[],customers:[],loyaltyBalances:{},returns:[],settings:{}}})})
 await page.route(base+'/retail-harness',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto(base+'/retail-harness')
 await page.evaluate(async()=>{const {React,createRoot}=await import('/test/shop-setup-harness.ts');const {CounterService}=await import('/src/CounterService.tsx');const {checkoutTillId}=await import('/src/lib/checkoutTill.ts');window.retailTill=checkoutTillId();createRoot(document.getElementById('root')).render(React.createElement(CounterService,{retail:true,access:{productSales:true},headers:{},storageKey:'retail-test',products:[],receipts:[],manager:false,owner:false,money:String,print:async()=>{},printTicket:async()=>{},refreshStock:async()=>{},synchronize:async()=>{},pay:async()=>{throw new Error('This test checks picking before payment.')}}))})
 order.tillId=await page.evaluate(()=>window.retailTill);order.acceptedTillId=order.tillId
 await page.getByRole('heading',{name:'Online retail orders',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'New order',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Batch production',exact:true}).count(),0)
 await page.getByRole('button',{name:'Preparation',exact:true}).click();await page.getByRole('button',{name:'Start picking',exact:true}).click();await page.getByRole('button',{name:'Mark ready',exact:true}).click();assert.equal(order.status,'ready');assert.equal(await page.getByRole('button',{name:'Complete delivery',exact:true}).isDisabled(),true)
 assert.deepEqual(errors,[]);console.log('PASS: retail staff view, dedicated API routing, picking stages and payment required before delivery completion')
}finally{await browser.close();await server.close()}
