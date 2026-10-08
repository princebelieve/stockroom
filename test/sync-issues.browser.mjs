import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false}})
await server.listen()
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 const base=`http://127.0.0.1:${server.httpServer.address().port}`
 await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort())
 await page.route(`${base}/sync-test`,async route=>route.fulfill({contentType:'text/html',body:await server.transformIndexHtml('/sync-test','<html><body><div id="root"></div></body></html>')}))
 await page.route(`${base}/api/sync/conflicts/reviews`,route=>route.fulfill({json:{conflicts:[]}}))
 await page.goto(`${base}/sync-test`)
 await page.evaluate(async()=>{
  const {React,createRoot}=await import('/test/shop-setup-harness.ts')
  const {SyncIssues}=await import('/src/SyncIssues.tsx')
  const {WorkspaceHelpProvider}=await import('/src/WorkspaceHelp.tsx')
  await import('/src/styles.css');await import('/src/operational.css')
  const root=createRoot(document.getElementById('root'))
  window.renderIssue=(changed=false)=>{
   const local={appName:'Test shop',currency:'NGN',logoData:'data:image/png;base64,AAAA',updatedAt:'2026-10-08T12:00:00.000Z'}
   const remote={...local,currency:changed?'USD':'NGN',logoData:changed?'data:image/png;base64,BBBB':local.logoData,updatedAt:'2026-10-08T12:01:00.000Z'}
   root.render(React.createElement(WorkspaceHelpProvider,null,React.createElement(SyncIssues,{conflicts:[{id:'issue',entityType:'settings',entityId:'private-record-id',reason:'A newer version was saved.',createdAt:'2026-10-08T12:00:00.000Z',localPayload:JSON.stringify(local),remotePayload:JSON.stringify(remote)}],headers:{},navigate:()=>{},resolveConflict:async(id,input)=>{window.review={id,...input}}})))
  }
  window.renderIssue()
 })
 await page.getByRole('button',{name:/Business settings -/}).click()
 await page.getByRole('button',{name:'Confirm matching settings',exact:true}).click()
 await page.waitForFunction(()=>window.review?.id==='issue')
 assert.equal(await page.evaluate(()=>window.review.confirmed),true)
 assert.equal(await page.evaluate(()=>window.review.action),'accepted')
 await page.evaluate(()=>window.renderIssue(true))
 await page.getByRole('button',{name:/Business settings -/}).click()
 await page.getByRole('columnheader',{name:'This device',exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Confirm matching settings',exact:true}).count(),0)
 assert.equal(await page.locator('pre').count(),0)
 const text=await page.locator('body').innerText()
 assert.ok(text.toLowerCase().includes('currency')&&text.includes('NGN')&&text.includes('USD'))
 assert.equal(text.includes('base64'),false);assert.equal(text.includes('private-record-id'),false)
 assert.equal(await page.getByAltText('Logo on this device').count(),1)
 assert.deepEqual(errors,[])
 console.log('PASS: readable sync comparisons, logo previews, no JSON/base64/record IDs, matching-settings audit action')
}finally{await browser.close();await server.close()}
