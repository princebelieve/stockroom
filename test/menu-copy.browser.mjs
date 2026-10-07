import {createServer} from 'vite'
import {chromium} from '@playwright/test'
import assert from 'node:assert/strict'
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false}});await server.listen()
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 const page=await browser.newPage();page.setDefaultTimeout(15000)
 const base=`http://127.0.0.1:${server.httpServer.address().port}`
 const source={id:'counter-menu',updatedAt:'source',items:[{id:'rice',name:'Rice',price:20,type:'prepared',productId:'',available:true,recipe:[{productId:'grain',quantity:0.2}],options:[{id:'sauce-extra',name:'Sauce',price:3,recipe:[{productId:'sauce',quantity:0.05}]}]}]}
 let destination={id:'restaurant-menu',updatedAt:'',items:[]};const requests=[]
 await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort())
 await page.route(base+'/menu-copy-test',async route=>route.fulfill({contentType:'text/html',body:await server.transformIndexHtml('/menu-copy-test','<html><body><div id="root"></div></body></html>')}))
 await page.route('**/api/pos/**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(route.request().method()==='POST'){const input=route.request().postDataJSON();requests.push({path,input});assert.equal(path,'/api/pos/restaurant/counter/menu');destination={...input,updatedAt:'saved'};return route.fulfill({json:destination})}
  const menu=path==='/api/pos/counter'?source:destination
  await route.fulfill({json:{menu,orders:[],receipts:[],settings:{},customers:[],loyaltyBalances:{},returns:[]}})
 })
 await page.goto(base+'/menu-copy-test')
 await page.evaluate(async()=>{const {React,createRoot}=await import('/test/shop-setup-harness.ts');const {CounterService}=await import('/src/CounterService.tsx');createRoot(document.getElementById('root')).render(React.createElement(CounterService,{restaurant:true,configuration:true,headers:{},storageKey:'copy-test',products:[],receipts:[],manager:true,owner:true,money:value=>String(value),print:async()=>{},printTicket:async()=>{},synchronize:async()=>{},refreshStock:async()=>{},pay:async()=>{}}))})
 await page.getByText('Copy menu items from takeaway',{exact:true}).click()
 await page.getByRole('button',{name:'Preview takeaway menu',exact:true}).click()
 await page.getByLabel('Rice / 20',{exact:true}).check()
 await page.getByRole('button',{name:'Cancel copy preview',exact:true}).click()
 assert.equal(requests.length,0)
 await page.getByRole('button',{name:'Preview takeaway menu',exact:true}).click()
 await page.getByLabel('Rice / 20',{exact:true}).check()
 await page.getByRole('button',{name:'Add selected items to menu draft',exact:true}).click()
 assert.equal(requests.length,0,'Copy is a draft until Save menu')
 await page.getByRole('button',{name:'Save menu',exact:true}).click()
 await page.getByText('Menu saved.',{exact:true}).waitFor()
 assert.equal(destination.items[0].recipe[0].quantity,0.2);assert.equal(destination.items[0].options[0].recipe[0].quantity,0.05)
 assert.notEqual(destination.items[0].id,'rice');assert.notEqual(destination.items[0].options[0].id,'sauce-extra')
 assert.equal(source.items[0].id,'rice');assert.equal(destination.items[0].station,'kitchen')
 assert.equal(await page.getByLabel('Rice / 20 / Already in this menu',{exact:true}).isDisabled(),true)
 console.log('PASS: restaurant settings preview/cancel, draft-only copy, extras/recipes preserved, correct save route and duplicate prevention')
}finally{await browser.close();await server.close()}
