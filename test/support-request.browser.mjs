import {createServer} from 'vite'
import {chromium} from '@playwright/test'
import assert from 'node:assert/strict'
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false}});await server.listen()
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 const page=await browser.newPage();const base=`http://127.0.0.1:${server.httpServer.address().port}`;let reference,calls=0
 await page.route(base+'/api/integrations/support/requests',async route=>{const input=route.request().postDataJSON();calls++;if(reference)assert.equal(input.id,reference);reference=input.id;await route.fulfill({status:calls===1?503:200,json:calls===1?{error:'Connection interrupted. Retry.'}:{sent:true,reference}})})
 await page.route(base+'/support-harness',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}))
 const mount=()=>page.evaluate(async()=>{const{React,createRoot}=await import('/test/shop-setup-harness.ts');const{SupportRequest}=await import('/src/SupportRequest.tsx');createRoot(document.getElementById('root')).render(React.createElement(SupportRequest,{scope:'shop:staff',headers:{Authorization:'Bearer test'}}))})
 await page.goto(base+'/support-harness');await mount();await page.getByText('Send a support request',{exact:true}).click()
 await page.getByLabel('Your name').fill('Ada');await page.getByLabel('Contact email').fill('ada@example.test');await page.getByLabel('Subject',{exact:true}).fill('Printer');await page.getByLabel('What happened?').fill('Receipt printer stopped.')
 await page.reload();await mount();await page.getByText('Send a support request',{exact:true}).click();assert.equal(await page.getByLabel('Subject',{exact:true}).inputValue(),'Printer')
 await page.getByRole('button',{name:'Send support request',exact:true}).click();await page.getByRole('alert').waitFor()
 await page.getByRole('button',{name:'Retry saved request',exact:true}).click();await page.getByRole('status').waitFor();assert.equal(calls,2)
 assert.equal(await page.evaluate(()=>localStorage.getItem('stockroom-support-draft:shop:staff')),null)
 console.log('PASS: support drafts survive reload and retries preserve their reference')
} finally {await browser.close();await server.close()}
