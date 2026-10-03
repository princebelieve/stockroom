import {createServer} from 'vite'
import {chromium} from '@playwright/test'
import assert from 'node:assert/strict'
const server=await createServer({server:{port:0,host:'127.0.0.1'}})
await server.listen()
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const page=await browser.newPage()
 const base=`http://127.0.0.1:${server.httpServer.address().port}`
 await page.route(`${base}/migration-test`,async route=>route.fulfill({contentType:'text/html',body:await server.transformIndexHtml('/migration-test','<html><body><div id="root"></div></body></html>')}))
 await page.goto(`${base}/migration-test`)
 await page.evaluate(async()=>{
  const {React,createRoot}=await import('/test/shop-setup-harness.ts')
  const {ProductIntake}=await import('/src/ProductIntake.tsx')
  window.saved=[]
  createRoot(document.getElementById('root')).render(React.createElement(ProductIntake,{products:[{id:'existing',name:'Existing milk',sku:'M1',barcode:'00123'}],defaultUnit:'bottle',scan:async()=>undefined,create:async draft=>{window.saved.push(draft)}}))
 })
 await page.getByText('Add products from a photo, barcode or file',{exact:true}).click()
 await page.getByLabel('CSV product file').setInputFiles({name:'old-app.csv',mimeType:'text/csv',buffer:Buffer.from('Old description,Stock code,Scan number,Checkout amount,On shelf\nMilk,M1,00123,500,20\nJuice,J1,00124,NGN 600,24')})
 for(const [field,index] of [['Name',0],['SKU',1],['Barcode',2],['Selling price',3],['Current stock',4]])await page.getByLabel(`${field} column`,{exact:true}).selectOption(String(index))
 await page.getByRole('button',{name:'Load mapped products for review'}).click()
 await page.getByText('Skipped: already exists as Existing milk',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Import 1 reviewed product',exact:true}).click()
 await page.getByRole('status').filter({hasText:'Imported 1 product.'}).waitFor()
 const saved=await page.evaluate(()=>window.saved)
 assert.equal(saved.length,1);assert.equal(saved[0].name,'Juice');assert.equal(saved[0].barcode,'00124');assert.equal(saved[0].stock,24);assert.equal(saved[0].price,600)
 console.log('PASS: maps old-app CSV headings, preserves leading-zero barcodes and skips existing SKU/barcode matches')
}finally{await browser.close();await server.close()}
