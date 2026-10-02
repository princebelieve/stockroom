import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 850 } })
 const base = `http://127.0.0.1:${server.httpServer.address().port}`
 await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort())
 await page.route(`${base}/pos-test`, async route => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/pos-test','<html><body><main id="root" style="padding:24px"></main></body></html>') }))
 await page.goto(`${base}/pos-test`)
 await page.evaluate(async () => {
  const { React, createRoot } = await import('/test/shop-setup-harness.ts')
  const { PosCatalog } = await import('/src/PosCatalog.tsx')
  const { CartItem } = await import('/src/CartItem.tsx')
  await import('/src/styles.css')
  const products = [{ id:'1', name:'Orange juice', category:'Drinks', stock:2, price:15, unit:'bottle', sku:'OJ' }, {id:'2', name:'Wholemeal bread', category:'Bakery', stock:8, price:10, unit:'loaf', sku:'BR'}, {id:'3', name:'Coffee', category:'Drinks', stock:0, price:20, unit:'jar', sku:'CO'}]
  const money = value => '$' + value.toFixed(2)
  function App() {
   const [query,setQuery] = React.useState(''); const [cart,setCart] = React.useState({})
   const total = products.reduce((sum,p) => sum + p.price*(cart[p.id] || 0),0)
   return React.createElement('section',{className:'pos-layout'}, React.createElement(PosCatalog,{products,matches:products.filter(p=>p.name.toLowerCase().includes(query.toLowerCase())),query,setQuery,cart,add:p=>setCart({...cart,[p.id]:(cart[p.id]||0)+1}),scan:()=>{window.scanned=true},scanKey:'Enter',acceptBarcode:code=>{window.code=code},money}),React.createElement('div',{className:'panel cart-panel'},React.createElement('h2',null,'Current sale'),React.createElement('div',{className:'pos-total-due'},'Total due',React.createElement('strong',null,money(total))),...products.filter(p=>cart[p.id]).map(p=>React.createElement(CartItem,{key:p.id,product:p,quantity:cart[p.id],money,onChange:n=>setCart({...cart,[p.id]:n}),onVoid:()=>{}}))))
  }
  createRoot(document.getElementById('root')).render(React.createElement(App))
 })
 await page.getByRole('heading',{name:'Choose products'}).waitFor()
 assert.equal(await page.getByRole('button',{name:/Add Coffee/}).isDisabled(),true)
 await page.getByRole('button',{name:/Add Orange juice/}).click()
 assert.match(await page.locator('.pos-total-due').innerText(),/15.00/)
 await page.getByRole('button',{name:/Add Orange juice/}).click()
 assert.equal(await page.getByRole('button',{name:/Add Orange juice/}).isDisabled(),true)
 await page.getByLabel('Category',{exact:false}).selectOption('Bakery')
 assert.equal(await page.locator('.pos-product').count(),1)
 await page.getByLabel('Search products for sale').fill('Orange')
 assert.equal(await page.locator('.pos-product').count(),1)
 await page.getByLabel('Search products for sale').fill('missing')
 await page.getByText('No matching products',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Show all products'}).click()
 await page.getByRole('button',{name:'Scan barcode',exact:true}).click()
 assert.equal(await page.evaluate(()=>window.scanned),true)
 await page.getByLabel('Search products for sale').fill('OJ')
 await page.getByLabel('Search products for sale').press('Enter')
 assert.equal(await page.evaluate(()=>window.code),'OJ')
 await page.getByLabel('Search products for sale').fill('')
 for(const width of [1280,390]) {
  await page.setViewportSize({width,height:850})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true)
  await page.screenshot({path:join(tmpdir(),`stockroom-pos-${width}.png`),fullPage:true})
 }
 console.log('PASS: category/search, stock availability, cart feedback, scanner controls and desktop/mobile widths')
 console.log(join(tmpdir(),'stockroom-pos-390.png'))
} finally {await browser.close();await server.close()}
