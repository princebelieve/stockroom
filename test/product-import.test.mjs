import test from 'node:test'
import assert from 'node:assert/strict'
import {suggestImportMapping,mappedProducts,importMatches} from '../server/product-import.mjs'
test('custom column mapping imports prices, leading-zero identities and explicit opening stock',()=>{
  const table=[['Goods','Our code','Scan','Retail','Bought for','On shelf'],['Milk','M1','012345','₦1,200.50','NGN 950','0']]
  const rows=mappedProducts(table,{name:0,sku:1,barcode:2,price:3,cost:4,stock:5})
  assert.equal(rows[0].barcode,'012345');assert.equal(rows[0].price,1200.5);assert.equal(rows[0].cost,950);assert.equal(rows[0].stock,0)
  assert.throws(()=>mappedProducts(table,{name:0,price:0}),/only one/)
  assert.throws(()=>mappedProducts(table,{name:-1}),/Product name/)
})
test('automatic mapping and duplicate matches never merge different identities silently',()=>{
  const header=['Product Name','Product Code','Barcode','Selling price','Current stock']
  const mapping=suggestImportMapping(header);assert.equal(mapping.stock,4)
  const rows=mappedProducts([header,['Soap','SKU','00123','500','']]);assert.equal(rows[0].stock,undefined)
  const products=[{id:'a',sku:'SKU',barcode:'999'},{id:'b',sku:'OTHER',barcode:'00123'}]
  assert.equal(importMatches(rows[0],products).length,2)
  assert.equal(importMatches({...rows[0],sku:''},products)[0].id,'b')
})
