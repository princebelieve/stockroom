import {createServer} from 'vite'
import {chromium} from '@playwright/test'
import assert from 'node:assert/strict'

const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false}});await server.listen()
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 const base=`http://127.0.0.1:${server.httpServer.address().port}`
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(20000)
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 const profile={guest:false,customer:{id:'ada',name:'Ada',phone:'08012345678',balance:20},orders:[],transactions:[]}
 const catalog={businessId:'shop',businessName:'Shop',currency:'USD',mode:'retail',customerOrdering:{deliveryEnabled:false},menu:{id:'retail',updatedAt:'revision',items:[{id:'rice',name:'Rice',price:10,options:[]}]}}
 await page.route('**/v1/customer-portal/**',route=>route.fulfill({json:route.request().url().includes('/catalog')?catalog:profile}))
 await page.route(base+'/navigation-harness',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}))
 await page.goto(base+'/navigation-harness')
 await page.evaluate(async data=>{
  sessionStorage.setItem('stockroom-customer-shop','test');sessionStorage.setItem('stockroom-customer-data-shop',JSON.stringify(data.profile))
  const{React,createRoot}=await import('/test/shop-setup-harness.ts');const{CustomerPortal}=await import('/src/CustomerPortal.tsx')
  createRoot(document.getElementById('root')).render(React.createElement(CustomerPortal,{businessId:'shop'}))
 },{profile})
 await page.getByRole('heading',{name:'My wallet',exact:true}).waitFor()
 const toggle=page.getByRole('button',{name:'Open navigation menu',exact:true});await toggle.click({noWaitAfter:true})
 await page.getByRole('button',{name:'Wallet',exact:true}).click();await page.getByRole('link',{name:'Wallet activity',exact:true}).click()
 assert.equal(await toggle.getAttribute('aria-expanded'),'false');await page.getByRole('heading',{name:'Wallet activity',exact:true}).waitFor()
 await toggle.click();await page.getByRole('button',{name:'Order online',exact:true}).click();await page.getByRole('link',{name:'Your basket',exact:true}).click()
 await page.getByRole('heading',{name:'Your order',exact:true}).waitFor();assert.equal(await toggle.getAttribute('aria-expanded'),'false')
 await toggle.click();await page.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal(await toggle.evaluate(element=>element===document.activeElement),true)
 assert.equal(await page.locator('#customer-navigation').isVisible(),false)
 await page.setViewportSize({width:1440,height:900});assert.equal(await page.locator('#customer-navigation').isVisible(),true)
 await page.route('**/v1/account-deletion/me',route=>route.fulfill({json:{status:'active'}}))
 await page.route('**/v1/referral-wallet/me',route=>route.fulfill({json:{referrer:{name:'Promoter',email:'promoter@example.test',type:'visitor'},link:'https://example.test/ref',balances:[],commissions:[],payouts:[],profiles:[],automaticTransfersEnabled:false}}))
 await page.route('**/v1/notifications/**',route=>route.fulfill({json:{notifications:[],unreadCount:0}}))
 await page.addInitScript(()=>localStorage.setItem('stockroom-visitor-portal-access','test'))
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/visitor.html')
 await page.getByRole('heading',{name:'Help Stockroom reach more businesses',exact:true}).waitFor()
 await page.getByRole('button',{name:'Open navigation menu',exact:true}).click()
 await page.getByRole('button',{name:'Wallet & payouts',exact:true}).click();await page.getByRole('link',{name:'Balances',exact:true}).click()
 await page.getByRole('heading',{name:'Your referral wallet',exact:true}).waitFor()
 assert.equal(await page.locator('#visitor-navigation').isVisible(),false)
 await page.getByRole('button',{name:'Open navigation menu',exact:true}).click();await page.keyboard.press('Escape')
 assert.equal(await page.getByRole('button',{name:'Open navigation menu',exact:true}).evaluate(element=>element===document.activeElement),true)
 await page.goto(base+'/navigation-harness')
 await page.evaluate(async()=>{const{React,createRoot}=await import('/test/shop-setup-harness.ts');const{NavigationSection}=await import('/src/NavigationSection.tsx');createRoot(document.getElementById('root')).render(React.createElement(NavigationSection,{title:'Daily work',active:'POS',screens:['POS']},React.createElement('button',{},'Product sales')))})
 await page.getByText('Daily work',{exact:true}).click();assert.equal(await page.getByRole('button',{name:'Product sales'}).isVisible(),false)
 await page.getByText('Daily work',{exact:true}).click();assert.equal(await page.getByRole('button',{name:'Product sales'}).isVisible(),true)
 assert.deepEqual(errors,[])
 console.log('PASS: expandable app sections, customer/visitor mobile navigation, shortcuts, desktop visibility and Escape/focus return.')
} finally {await browser.close();await server.close()}
