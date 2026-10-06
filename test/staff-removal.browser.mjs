import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false}})
await server.listen()
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 const page=await browser.newPage();page.setDefaultTimeout(15000)
 const base=`http://127.0.0.1:${server.httpServer.address().port}`
 await page.route(`${base}/staff-removal`,r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}))
 await page.goto(`${base}/staff-removal`,{waitUntil:'domcontentloaded'})
 await page.evaluate(async()=>{
  await import('/src/styles.css')
  const {React,createRoot}=await import('/test/shop-setup-harness.ts')
  const {RemoveStaffButton}=await import('/src/RemoveStaffButton.tsx')
  window.removalCalls=[];window.failRemoval=true
  createRoot(document.getElementById('root')).render(React.createElement(RemoveStaffButton,{member:{id:'staff',name:'Ada'},onRemove:async(id,password)=>{window.removalCalls.push({id,password});if(window.failRemoval)throw new Error('Connection unavailable')}}))
 })
 await page.getByRole('button',{name:'Remove staff',exact:true}).click()
 await page.getByRole('alertdialog',{name:'Remove Ada?'}).waitFor()
 const confirm=page.getByRole('button',{name:'Confirm staff removal',exact:true})
 assert.equal(await confirm.isDisabled(),true)
 await page.getByRole('button',{name:'Cancel',exact:true}).click()
 assert.equal(await page.evaluate(()=>window.removalCalls.length),0)
 await page.getByRole('button',{name:'Remove staff',exact:true}).click()
 await page.getByLabel('Owner password').fill('owner-test-password')
 assert.equal(await confirm.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(180, 35, 24)')
 await confirm.click();await page.getByRole('alert').waitFor()
 assert.equal(await page.getByRole('alertdialog').count(),1)
 await page.evaluate(()=>{window.failRemoval=false})
 await confirm.click();await page.getByRole('alertdialog').waitFor({state:'hidden'})
 assert.equal(await page.evaluate(()=>window.removalCalls.length),2)
 await page.getByRole('button',{name:'Remove staff',exact:true}).click()
 assert.equal(await page.getByLabel('Owner password').inputValue(),'')
 console.log('Staff removal warning, Cancel, red confirmation, failure/retry and password clearing checks passed.')
} finally {await browser.close();await server.close()}
