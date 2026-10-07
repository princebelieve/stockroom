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


const fund={kind:'church-fund',id:'church-fund:building',commandId:'fund',action:'create',expectedUpdatedAt:'',name:'Building fund'}
const donor={kind:'church-donor',id:'church-donor:ada',commandId:'donor',action:'create',expectedUpdatedAt:'',name:'Ada',phone:'555'}
const commitment=f=>({...f.create,lines:[{id:'contribution',description:'Building pledge',quantity:1,price:100}],church:{type:'pledge',fundId:fund.id,donorId:donor.id}})
test('church identities, commitments, receipts, refunds and donor totals reconcile without duplicate money or stock',async()=>{
 const f=fixture();try{
  await f.church(fund);await f.church(donor)
  await f.church(fund);assert.equal((await f.church()).funds.length,1)
  await f.church({...donor,id:'church-donor:other',commandId:'other',phone:'999'})
  await assert.rejects(f.church({...fund,id:'church-fund:staff',commandId:'staff'},{user:{id:'staff',name:'Staff',role:'cashier'}}),/Owner or admin/)
  await f.pos('/api/pos/receipt-settings',{taxEnabled:true,taxRate:10})
  let {job}=await f.call('',commitment(f));assert.equal(job.pricing.tax,0)
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sales').get().n,0,'Pledges are not received money')
  assert.equal((await f.call('')).jobs.length,0,'Church commitments are separate from work invoices')
  const payment={id:job.id,commandId:'contribution',expectedUpdatedAt:job.updatedAt,amount:'30',method:'bank-transfer',provider:'Example Bank',reference:'confirmed-001'}
  const result=await f.call('/pay',payment);job=result.job
  await f.call('/pay',payment);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sales').get().n,1)
  assert.match(receiptText(result.sale),/Fund: Building fund/);assert.doesNotMatch(receiptText(result.sale),/Invoice:/)
  await assert.rejects(f.call('/status',{id:job.id,commandId:'cancel',expectedUpdatedAt:job.updatedAt,status:'cancelled'}),/refund/)
  await f.pos('/api/pos/returns',{id:'church-refund',saleId:result.sale.id,reason:'Returned contribution',method:'bank-transfer',reference:'refund-confirmed',confirmed:true,items:[{lineIndex:0,amount:10}]})
  const data=await f.church(),summary=churchSummary(data.jobs,data.returns,{donorId:donor.id})
  assert.equal(summary.funds[0].received,30);assert.equal(summary.funds[0].refunded,10);assert.equal(summary.funds[0].net,20);assert.equal(summary.pledges[0].outstanding,80)
  assert.equal(churchSummary(data.jobs,data.returns,{donorId:'church-donor:other'}).rows.length,0,'Same names have separate statements')
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM inventory_movements').get().n,0)
  const tampered=structuredClone(job);tampered.church={...tampered.church,fundName:'Other fund'};assert.throws(()=>validateServiceJob(tampered,undefined,true),/fund and donor/)
 }finally{f.sql.close()}
})
test('archival preserves commitments and retries; invalid identities and failed saves do not leave partial records',async()=>{
 const f=fixture();try{
  const saved=await f.church(fund);await f.church(donor)
  const created=await f.call('',commitment(f));const archive={...fund,action:'archive',commandId:'archive',expectedUpdatedAt:saved.updatedAt}
  const archived=await f.church(archive);await f.church(archive);assert.equal(archived.events.length,2)
  assert.equal((await f.church()).jobs.length,1)
  await assert.rejects(f.call('',{...commitment(f),id:'service-job:other',commandId:'other'}),/active fund/)
  await f.call('/pay',{id:created.job.id,commandId:'old-pledge',expectedUpdatedAt:created.job.updatedAt,amount:'10',method:'cash'})
  assert.throws(()=>validateChurchRecord({...archived,name:'Rewritten'},saved),/identities/)
  f.setFail(true);await assert.rejects(f.church({...donor,id:'church-donor:failed',commandId:'failed'}),/outbox/)
  assert.equal((await f.church()).donors.length,1)
  f.setFail(false)
  const amount=(await f.church()).jobs[0].updatedAt;f.setFail(true)
  await assert.rejects(f.call('/pay',{id:created.job.id,commandId:'failed-pay',expectedUpdatedAt:amount,amount:'10',method:'cash'}),/outbox/)
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sales').get().n,1)
  assert.equal(requiresChurchSync({payload:created.job}),true);assert.equal(requiresChurchSync({payload:fund}),true)
 }finally{f.sql.close()}
})
test('anonymous donations do not become pledges and statement periods use the business timezone',async()=>{
 const f=fixture();try{
  await f.church(fund)
  await assert.rejects(f.call('',{...commitment(f),church:{type:'pledge',fundId:fund.id,donorId:''}}),/registered donor/)
  const {job}=await f.call('',{...commitment(f),church:{type:'donation',fundId:fund.id,donorId:''}})
  const paid=await f.call('/pay',{id:job.id,commandId:'anonymous',expectedUpdatedAt:job.updatedAt,amount:'100',method:'cash'})
  paid.job.payments[0].sale.createdAt='2026-10-06T23:30:00.000Z'
  const summary=churchSummary([paid.job],[],{from:'2026-10-07',to:'2026-10-07',timeZone:'Africa/Lagos'})
  assert.equal(summary.rows.length,1);assert.equal(summary.rows[0].donor,'Anonymous donor');assert.equal(summary.pledges.length,0)
  assert.equal(churchSummary([paid.job],[],{to:'2026-10-06',timeZone:'Africa/Lagos'}).rows.length,0)
 }finally{f.sql.close()}
})
