import { oilPricing,oilPrice } from '../server/oil-pricing.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { handlePos,ensurePos,applyPosRecord } from '../server/pos-service.mjs'
import { churchSummary,validateChurchRecord,requiresChurchSync } from '../server/church-ledger.mjs'
import { receiptText } from '../server/receipts.mjs'
import { validateServiceJob,serviceJobBalance } from '../server/service-jobs.mjs'
function fixture() {
 const sql=new DatabaseSync(':memory:')
 sql.exec(vm.runInNewContext(readFileSync('src/lib/browserSchema.ts','utf8').split('export const browserSchema = ')[1].trim()))
 sql.exec("ALTER TABLE app_settings ADD COLUMN shop_profile TEXT;INSERT INTO app_settings(id,app_name,currency,updated_at) VALUES(1,'Print Shop','USD','2026-01-01');")
 const db={query:(s,p=[])=>({values:sql.prepare(s).all(...p)}),run:(s,p=[])=>sql.prepare(s).run(...p),beginTransaction:()=>sql.exec('BEGIN'),commitTransaction:()=>sql.exec('COMMIT'),rollbackTransaction:()=>sql.exec('ROLLBACK')}
 let fail=false;const published=[]
 const options={db,scope:'business',branchId:'main',user:{id:'owner',name:'Owner',role:'owner'},tillId:'till1',publish:async record=>{if(fail)throw new Error('outbox failed');published.push(record)},sales:()=>[]}
 const call=(path,input,extra={})=>handlePos({...options,...extra,path:'/api/pos/service-jobs'+path,method:input?'POST':'GET',input:input||{}})
 const create={id:'service-job:test',commandId:'create',expectedUpdatedAt:'',title:'200 flyers',customerName:'Ada',customerPhone:'555',lines:[{id:'flyers',description:'Flyers',quantity:200,price:0.5}]}
 const church=(input,extra={})=>handlePos({...options,...extra,path:'/api/pos/church',method:input?'POST':'GET',input:input||{}})
 return {sql,db,call,church,pos:(path,input)=>handlePos({...options,path,method:'POST',input,sales:()=>sql.prepare('SELECT id,total,payment_method AS paymentMethod,payment_details AS paymentDetails FROM sales').all().map(row=>({...row,paymentDetails:JSON.parse(row.paymentDetails),items:sql.prepare('SELECT product_id AS productId,product_name AS productName,quantity,unit_price AS price FROM sale_items WHERE sale_id=?').all(row.id)}))}),create,published,setFail:value=>fail=value}
}



test('oil rates resolve customer before bulk before retail, preserve containers and reject duplicate/invalid rules',()=>{
 const rules={bulk:[{minimum:100,price:7},{minimum:20,price:8}],customers:[{customerId:'ada',price:6}]}
 const loose={price:10},container={price:230,saleFactor:25}
 assert.equal(oilPrice(loose,rules,19.999).price,10)
 assert.equal(oilPrice(loose,rules,20).price,8)
 assert.equal(oilPrice(loose,rules,100).price,7)
 assert.equal(oilPrice(loose,rules,1,'ada').price,6)
 assert.equal(oilPrice(container,rules,10).price,230)
 assert.equal(oilPrice(container,rules,25).price,200)
 assert.equal(oilPrice(container,rules,100,'ada').price,150)
 assert.throws(()=>oilPricing({bulk:[{minimum:0,price:1}]}),/positive/)
 assert.throws(()=>oilPricing({bulk:[{minimum:1,price:1},{minimum:1,price:2}]}),/distinct/)
 assert.throws(()=>oilPricing({customers:[{customerId:'ada',price:1.001}]}),/valid/)
})
test('oil configuration preserves options, rejects stale/customer/permission errors, retries once and rolls back failed publication',async()=>{
 const f=fixture();try{
  f.sql.exec("INSERT INTO products(id,name,sku,category,price,cost_price,unit,updated_at) VALUES('oil','Palm oil','OIL','Oil',10,3,'litre','2026-01-01');INSERT INTO customers VALUES('ada','Ada','555',0);")
  const options=await f.pos('/api/pos/products',{productId:'oil',variantGroup:'Oil',variantLabel:'Palm',modifiers:[]})
  const request={productId:'oil',commandId:'tier',expectedUpdatedAt:options.updatedAt,value:{bulk:[{minimum:20,price:8}],customers:[{customerId:'ada',price:7}]}}
  await assert.rejects(handlePos({db:f.db,scope:'business',branchId:'main',user:{id:'staff',name:'Staff',role:'cashier'},path:'/api/pos/oil-pricing',method:'POST',input:request,sales:()=>[],publish:()=>{}}),/Owner or admin/)
  const saved=await f.pos('/api/pos/oil-pricing',request);await f.pos('/api/pos/oil-pricing',request)
  assert.equal(saved.variantGroup,'Oil');assert.equal(saved.oilPricing.bulk[0].price,8)
  await assert.rejects(f.pos('/api/pos/oil-pricing',{...request,commandId:'stale'}),/changed/)
  await assert.rejects(f.pos('/api/pos/oil-pricing',{...request,commandId:'missing',expectedUpdatedAt:saved.updatedAt,value:{customers:[{customerId:'missing',price:5}]}}),/existing customer/)
  const updated=await f.pos('/api/pos/products',{productId:'oil',variantGroup:'New group',modifiers:[]})
  assert.equal(updated.oilPricing.customers[0].price,7)
  f.setFail(true);await assert.rejects(f.pos('/api/pos/oil-pricing',{...request,commandId:'failed',expectedUpdatedAt:updated.updatedAt,value:{bulk:[],customers:[]}}),/outbox/)
  assert.equal(JSON.parse(f.sql.prepare("SELECT payload FROM pos_records WHERE id='product:oil'").get().payload).oilPricing.bulk.length,1)
 }finally{f.sql.close()}
})
