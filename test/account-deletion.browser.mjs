import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false}})
await server.listen()
const browser=await chromium.launch({channel:'msedge',headless:true,timeout:15000})
try {
 const base=`http://127.0.0.1:${server.httpServer.address().port}`
 for(const role of ['owner']) {
  const page=await browser.newPage();page.setDefaultTimeout(15000)
  let pending=false,fail=false,requests=0
  await page.route(`${base}/closure`,r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}))
  await page.route(`${base}/test-cloud/**`,async route=>{
   if(fail)return route.fulfill({status:503,json:{error:'Cloud service unavailable.'}})
   if(route.request().method()==='POST'){
    const command=route.request().postDataJSON();requests++;if(command.action==='request')assert.equal(command.confirmation,'DELETE')
    pending=command.action==='request'
   }
   return route.fulfill({json:{status:pending?'pending':'active',graceDays:14,scope:role==='owner'?'business':'account',scheduledFor:'2026-10-20T12:00:00Z'}})
  })
  await page.goto(`${base}/closure`,{waitUntil:'domcontentloaded'})
  await page.evaluate(async role=>{
   const {React,createRoot}=await import('/test/shop-setup-harness.ts')
   await import('/src/styles.css')
   const {AccountDeletionPanel}=await import('/src/AccountDeletionPanel.tsx')
   createRoot(document.getElementById('root')).render(React.createElement(AccountDeletionPanel,{apiUrl:'/test-cloud',token:'test',role,onToken:()=>{}}))
  },role)
  const submit=page.getByRole('button',{name:'Confirm account deletion',exact:true})
  await page.getByRole('button',{name:'Delete business account',exact:true}).click()
  await page.getByRole('alertdialog').waitFor()
  await page.getByRole('button',{name:'Cancel',exact:true}).click()
  assert.equal(requests,0);assert.equal(await page.getByRole('alertdialog').count(),0)
  await page.getByRole('button',{name:'Delete business account',exact:true}).click()
  await submit.waitFor();assert.equal(await submit.isDisabled(),true)
  assert.equal(requests,0)
  await page.getByLabel('Type DELETE to confirm').fill('DELETE')
  assert.equal(await submit.evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(180, 35, 24)')
  await submit.click();await page.getByText('Account deactivated. Your deletion request was saved.',{exact:true}).waitFor()
  await page.getByRole('button',{name:'Cancel account deletion',exact:true}).click()
  await page.getByRole('button',{name:'Delete business account',exact:true}).waitFor();assert.equal(requests,2)
  fail=true
  await page.reload({waitUntil:'domcontentloaded'})
  await page.evaluate(async role=>{
   const {React,createRoot}=await import('/test/shop-setup-harness.ts')
   await import('/src/styles.css')
   const {AccountDeletionPanel}=await import('/src/AccountDeletionPanel.tsx')
   createRoot(document.getElementById('root')).render(React.createElement(AccountDeletionPanel,{apiUrl:'/test-cloud',token:'test',role,onToken:()=>{}}))
  },role)
  await page.getByRole('alert').waitFor();assert.equal(await page.getByText('Checking deletion status...').count(),0)
  fail=false;await page.getByRole('button',{name:'Retry deletion status'}).click();await page.getByRole('button',{name:'Delete business account',exact:true}).waitFor()
  await page.close()
 }
 for(const role of ['admin','cashier']) {
  const staff=await browser.newPage();let calls=0
  await staff.route(`${base}/closure`,r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}))
  await staff.route(`${base}/test-cloud/**`,r=>{calls++;return r.fulfill({json:{status:'active'}})})
  await staff.goto(`${base}/closure`,{waitUntil:'domcontentloaded'})
  await staff.evaluate(async role=>{
   const {React,createRoot}=await import('/test/shop-setup-harness.ts')
   const {AccountDeletionPanel}=await import('/src/AccountDeletionPanel.tsx')
   const {UserGuide}=await import('/src/UserGuide.tsx')
   createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,React.createElement(AccountDeletionPanel,{apiUrl:'/test-cloud',token:'test',role,onToken:()=>{}}),React.createElement(UserGuide,{role})))
  },role)
  await staff.getByLabel('Guide topic').waitFor()
  assert.equal(await staff.getByRole('button',{name:'Delete business account'}).count(),0)
  assert.equal(await staff.getByRole('option',{name:'Close your account, exports and referrals'}).count(),0)
  assert.equal(calls,0);await staff.close()
 }
 const visitor=await browser.newPage();visitor.setDefaultTimeout(15000)
 let visitorPending=false
 await visitor.addInitScript(()=>localStorage.setItem('stockroom-visitor-portal-access','test'))
 await visitor.route('**/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(path==='/v1/account-deletion/me'){
   if(route.request().method()==='POST'){
    const command=route.request().postDataJSON()
    if(command.action==='request')assert.equal(command.confirmation,'DELETE')
    visitorPending=command.action==='request'
   }
   return route.fulfill({json:{status:visitorPending?'pending':'active',graceDays:14,scheduledFor:'2026-10-20T12:00:00Z'}})
  }
  if(path==='/v1/referral-wallet/me')return route.fulfill({json:{referrer:{name:'Test promoter',email:'test@example.com',type:'visitor'},link:'https://example.com/ref/test',referredBusinesses:0,automaticTransfersEnabled:false,balances:[],profiles:[],commissions:[],payouts:[]}})
  return route.fulfill({json:{notifications:[],unread:0}})
 })
 visitor.on('dialog',dialog=>dialog.accept())
 await visitor.goto(`${base}/visitor.html`,{waitUntil:'domcontentloaded'})
 await visitor.getByRole('button',{name:'Wallet & payouts'}).click()
 await visitor.getByRole('button',{name:'Deactivate and schedule deletion',exact:true}).click()
 await visitor.getByRole('alertdialog').waitFor()
 await visitor.getByRole('button',{name:'Cancel',exact:true}).click()
 assert.equal(visitorPending,false)
 await visitor.getByRole('button',{name:'Deactivate and schedule deletion',exact:true}).click()
 await visitor.getByRole('button',{name:'Confirm account deletion',exact:true}).click()
 await visitor.getByRole('heading',{name:'Your account is deactivated',exact:true}).waitFor()
 assert.equal(visitorPending,true)
 await visitor.getByRole('button',{name:'Cancel deletion and restore my account',exact:true}).click()
 await visitor.getByRole('heading',{name:'Wallet & payouts',exact:true}).waitFor()
 assert.equal(visitorPending,false)
 await visitor.close()
 console.log('Account closure browser request/cancel checks passed for owner and visitor; owner retry checks passed.')
}finally{await browser.close();await server.close()}
