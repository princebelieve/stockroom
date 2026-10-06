import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { handlePos,ensurePos,applyPosRecord } from '../server/pos-service.mjs'
import { validateServiceJob,serviceJobBalance } from '../server/service-jobs.mjs'
function fixture() {
 const sql=new DatabaseSync(':memory:')
 sql.exec(vm.runInNewContext(readFileSync('src/lib/browserSchema.ts','utf8').split('export const browserSchema = ')[1].trim()))
 sql.exec("INSERT INTO app_settings(id,app_name,currency,updated_at) VALUES(1,'Print Shop','USD','2026-01-01');")
 const db={query:(s,p=[])=>({values:sql.prepare(s).all(...p)}),run:(s,p=[])=>sql.prepare(s).run(...p),beginTransaction:()=>sql.exec('BEGIN'),commitTransaction:()=>sql.exec('COMMIT'),rollbackTransaction:()=>sql.exec('ROLLBACK')}
 let fail=false;const published=[]
 const options={db,scope:'business',branchId:'main',user:{id:'owner',name:'Owner',role:'owner'},tillId:'till1',publish:async record=>{if(fail)throw new Error('outbox failed');published.push(record)},sales:()=>[]}
 const call=(path,input,extra={})=>handlePos({...options,...extra,path:'/api/pos/service-jobs'+path,method:input?'POST':'GET',input:input||{}})
 const create={id:'service-job:test',commandId:'create',expectedUpdatedAt:'',title:'200 flyers',customerName:'Ada',customerPhone:'555',lines:[{id:'flyers',description:'Flyers',quantity:200,price:0.5}]}
 return {sql,db,call,pos:(path,input)=>handlePos({...options,path,method:'POST',input,sales:()=>sql.prepare('SELECT id,total,payment_method AS paymentMethod,payment_details AS paymentDetails FROM sales').all().map(row=>({...row,paymentDetails:JSON.parse(row.paymentDetails),items:sql.prepare('SELECT product_id AS productId,product_name AS productName,quantity,unit_price AS price FROM sale_items WHERE sale_id=?').all(row.id)}))}),create,published,setFail:value=>fail=value}
}
test('invoice snapshots, deposits, retry safety, balances and non-stock accounting',async()=>{
 const f=fixture();try{
 const register=await f.pos('/api/pos/registers',{action:'open',amount:0})
 let {job}=await f.call('',f.create)
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sales').get().n,0)
 const request={id:job.id,commandId:'deposit',expectedUpdatedAt:job.updatedAt,amount:'30',method:'cash'}
 let result=await f.call('/pay',request);job=result.job
 assert.equal(result.sale.total,30);assert.equal(result.sale.paymentDetails.serviceJob.balanceDue,70)
 await f.call('/pay',request)
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sales').get().n,1)
 await assert.rejects(f.call('/pay',{...request,amount:'35'}),/different details/)
 await assert.rejects(f.call('/pay',{...request,commandId:'stale'}),/changed/)
 await assert.rejects(f.call('/pay',{...request,commandId:'wrong-till',expectedUpdatedAt:job.updatedAt},{tillId:'till2'}),/original till/)
 await assert.rejects(f.call('/pay',{...request,commandId:'too-much',expectedUpdatedAt:job.updatedAt,amount:'71'}),/remaining balance/)
 result=await f.call('/pay',{...request,commandId:'balance',expectedUpdatedAt:job.updatedAt,amount:'70'});job=result.job
 assert.equal(serviceJobBalance(job).due,0)
 assert.equal(f.sql.prepare('SELECT SUM(total) AS total FROM sales').get().total,100)
 const closing=await f.pos('/api/pos/registers',{id:register.id,action:'close',amount:100})
 assert.equal(closing.expectedCash,100);assert.equal(closing.difference,0)
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM inventory_movements').get().n,0)
 assert.throws(()=>validateServiceJob({...job,lines:[{...job.lines[0],price:1}]},job),/pricing/)
 const replay={...job};await applyPosRecord(f.db,'business',replay);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sales').get().n,2)
 const remote=fixture();try{await ensurePos(remote.db);await applyPosRecord(remote.db,'business',replay);await applyPosRecord(remote.db,'business',replay);assert.equal(remote.sql.prepare('SELECT COUNT(*) AS n,SUM(total) AS total FROM sales').get().n,2);assert.equal(remote.sql.prepare('SELECT SUM(total) AS total FROM sales').get().total,100)}finally{remote.sql.close()}
 }finally{f.sql.close()}
})
test('estimates, progress, refund balance, permissions and cancellation',async()=>{
 const f=fixture();try{
 let {job}=await f.call('',{...f.create,estimate:true})
 await assert.rejects(f.call('/pay',{id:job.id,commandId:'no',expectedUpdatedAt:job.updatedAt,amount:'10',method:'cash'}),/Issue/)
 job=(await f.call('/status',{id:job.id,commandId:'accept',expectedUpdatedAt:job.updatedAt,status:'new'})).job
 job=(await f.call('/status',{id:job.id,commandId:'start',expectedUpdatedAt:job.updatedAt,status:'in-progress'})).job
 job=(await f.call('/pay',{id:job.id,commandId:'deposit',expectedUpdatedAt:job.updatedAt,amount:'30',method:'cash'})).job
 await assert.rejects(f.call('/status',{id:job.id,commandId:'cancel',expectedUpdatedAt:job.updatedAt,status:'cancelled'}),/refund/)
 assert.equal(serviceJobBalance(job,[{saleId:job.payments[0].sale.id,total:10}]).due,80)
 const returned=await f.pos('/api/pos/returns',{id:'refund-deposit',saleId:job.payments[0].sale.id,reason:'Partial refund',method:'cash',items:[{lineIndex:0,amount:10}]})
 assert.equal(returned.total,10)
 assert.equal((await f.call('')).jobs[0].balance.due,80)
 await assert.rejects(f.pos('/api/pos/returns',{id:'refund-too-much',saleId:job.payments[0].sale.id,reason:'Over refund',method:'cash',items:[{lineIndex:0,amount:21}]}),/remaining/)
 await f.pos('/api/pos/returns',{id:'refund-rest',saleId:job.payments[0].sale.id,reason:'Remaining deposit',method:'cash',items:[{lineIndex:0,amount:20}]})
 job=(await f.call('/status',{id:job.id,commandId:'cancel-refunded',expectedUpdatedAt:job.updatedAt,status:'cancelled'})).job
 assert.equal(job.status,'cancelled');assert.equal(serviceJobBalance(job).due,0)

 await assert.rejects(f.call('/status',{id:job.id,commandId:'cashier-cancel',expectedUpdatedAt:job.updatedAt,status:'cancelled'},{user:{id:'staff',name:'Cashier',role:'cashier'}}),/owner or admin/)
 }finally{f.sql.close()}
})
test('failed payment persistence rolls back receipt and job, and saved tax allocates across payments',async()=>{
 const f=fixture();try{
 await ensurePos(f.db)
 f.sql.prepare("INSERT INTO pos_records(scope,id,kind,branch_id,payload,updated_at) VALUES('business','receipt-settings','receipt-settings','main',?,'2026-01-01')").run(JSON.stringify({value:{taxEnabled:true,taxIncluded:true,taxRate:7}}))
 let {job}=await f.call('',{...f.create,lines:[{id:'small',description:'Small job',quantity:1,price:1}]})
 f.setFail(true)
 const input={id:job.id,commandId:'one',expectedUpdatedAt:job.updatedAt,amount:'0.30',method:'cash'}
 await assert.rejects(f.call('/pay',input),/outbox/)
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sales').get().n,0)
 f.setFail(false);job=(await f.call('/pay',input)).job
 job=(await f.call('/pay',{...input,commandId:'two',expectedUpdatedAt:job.updatedAt,amount:'0.70'})).job
 assert.equal(job.payments.reduce((n,p)=>n+Math.round(p.sale.paymentDetails.pos.pricing.tax*100),0),Math.round(job.pricing.tax*100))
 assert.equal(serviceJobBalance(job).due,0)
 }finally{f.sql.close()}
})
