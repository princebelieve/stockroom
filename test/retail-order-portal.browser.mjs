import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false}});await server.listen()
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const page=await browser.newPage();page.setDefaultTimeout(15000);let submission
 const ordering={bankName:'Test Bank',accountName:'Cafe Account',accountNumber:'0123456789',transferInstructions:'Use your order reference.',deliveryEnabled:true,deliveryFee:2}
 await page.route('**/v1/customer-portal/**',async route=>{
  const path=new URL(route.request().url()).pathname;let data
  if(path.endsWith('/guest'))data={accessToken:'guest'}
  else if(path.endsWith('/catalog'))data={businessId:'shop',businessName:'Cafe',currency:'USD',mode:'retail',customerOrdering:ordering,tax:{taxEnabled:true,taxRate:10,taxIncluded:false},menu:{id:'retail-catalogue',updatedAt:'revision',items:[{id:'meal',name:'Meal',price:10,description:'',options:[]}]}}
  else if(path.endsWith('/me'))data={guest:true,customer:{id:'guest',name:'Ada',balance:0},orders:[],transactions:[]}
  else if(path.endsWith('/orders')){submission=route.request().postDataJSON();data={order:{id:'order'}}}
  else throw new Error(path)
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)})
 })
 const base=`http://127.0.0.1:${server.httpServer.address().port}`
 await page.route(base+'/harness**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}))
 await page.goto(base+'/harness?catalog=retail');await page.evaluate(async()=>{const{React,createRoot}=await import('/test/shop-setup-harness.ts');const{CustomerPortal}=await import('/src/CustomerPortal.tsx');createRoot(document.getElementById('root')).render(React.createElement(CustomerPortal,{businessId:'shop'}))})
 await page.getByLabel('Name for pickup').fill('Ada');await page.getByRole('button',{name:'Continue as guest'}).click()
 await page.getByLabel('Quantity',{exact:true}).fill('1.5');await page.getByRole('button',{name:'Add to basket'}).click();await page.reload();await page.evaluate(async()=>{const{React,createRoot}=await import('/test/shop-setup-harness.ts');const{CustomerPortal}=await import('/src/CustomerPortal.tsx');createRoot(document.getElementById('root')).render(React.createElement(CustomerPortal,{businessId:'shop'}))});await page.getByText(/Remove 1\.5/).waitFor();await page.getByLabel('Pickup / handoff').selectOption('Delivery')
 await page.getByLabel('Delivery phone number').fill('08012345678');await page.getByLabel('Complete delivery address').fill('12 Market Street, Lagos')
 await page.getByLabel('Payment',{exact:true}).selectOption('bank-transfer');await page.getByText('Test Bank',{exact:false}).waitFor()
 await page.getByLabel('Bank / transfer provider').fill('My Bank');await page.getByLabel('Transfer reference').fill('REF-123')
 await page.getByRole('button',{name:'Submit order',exact:true}).click();await page.getByText('Order received.',{exact:false}).waitFor()
 assert.equal(submission.expectedTotal,18.7);assert.equal(submission.paymentMethod,'bank-transfer');assert.equal(submission.delivery.address,'12 Market Street, Lagos')
 assert.equal(submission.catalogMode,'retail');assert.equal(submission.lines[0].quantity,1.5);
 console.log('PASS: Retail QR bank details, delivery contact, fee and tax preview, transfer reference submission')
}finally{await browser.close();await server.close()}
