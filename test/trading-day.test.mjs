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
 sql.exec("ALTER TABLE app_settings ADD COLUMN shop_profile TEXT;INSERT INTO app_settings(id,app_name,currency,updated_at) VALUES(1,'Print Shop','USD','2026-01-01');")
 const db={query:(s,p=[])=>({values:sql.prepare(s).all(...p)}),run:(s,p=[])=>sql.prepare(s).run(...p),beginTransaction:()=>sql.exec('BEGIN'),commitTransaction:()=>sql.exec('COMMIT'),rollbackTransaction:()=>sql.exec('ROLLBACK')}
 let fail=false;const published=[]
 const options={db,scope:'business',branchId:'main',user:{id:'owner',name:'Owner',role:'owner'},tillId:'till1',publish:async record=>{if(fail)throw new Error('outbox failed');published.push(record)},sales:()=>[]}
 const call=(path,input,extra={})=>handlePos({...options,...extra,path:'/api/pos/service-jobs'+path,method:input?'POST':'GET',input:input||{}})
 const create={id:'service-job:test',commandId:'create',expectedUpdatedAt:'',title:'200 flyers',customerName:'Ada',customerPhone:'555',lines:[{id:'flyers',description:'Flyers',quantity:200,price:0.5}]}
 const church=(input,extra={})=>handlePos({...options,...extra,path:'/api/pos/church',method:input?'POST':'GET',input:input||{}})
 return {sql,db,call,church,pos:(path,input,extra={})=>handlePos({...options,...extra,path,method:'POST',input,sales:()=>sql.prepare('SELECT id,total,payment_method AS paymentMethod,payment_details AS paymentDetails FROM sales').all().map(row=>({...row,paymentDetails:JSON.parse(row.paymentDetails),items:sql.prepare('SELECT product_id AS productId,product_name AS productName,quantity,unit_price AS price FROM sale_items WHERE sale_id=?').all(row.id)}))}),create,published,setFail:value=>fail=value}
}



test('trading-day cash, interrupted commands, cash refunds and staff handover reconcile once on the original till',async()=>{
 const f=fixture();try{
  const opening={id:'shift-one',action:'open',commandId:'open-one',expectedUpdatedAt:'',amount:'100'}
  let shift=await f.pos('/api/pos/registers',opening);await f.pos('/api/pos/registers',opening)
  const staff={id:'cashier',name:'Cashier',role:'cashier'}
  await assert.rejects(f.pos('/api/pos/registers',{id:'shift-two',action:'open',amount:'100'},{user:staff}),/existing staff shift/)
  const movement={id:shift.id,action:'movement',commandId:'petty-cash',expectedUpdatedAt:shift.updatedAt,direction:'out',amount:'3',reason:'Petty cash'}
  shift=await f.pos('/api/pos/registers',movement);await f.pos('/api/pos/registers',movement)
  assert.equal(shift.movements.length,1)
  await assert.rejects(f.pos('/api/pos/registers',{...movement,amount:'4'}),/different details/)
  await assert.rejects(f.pos('/api/pos/registers',{...movement,commandId:'stale'}),/changed/)
  await assert.rejects(f.pos('/api/pos/registers',{...movement,commandId:'other-till',expectedUpdatedAt:shift.updatedAt},{tillId:'till2'}),/original till/)
  await assert.rejects(f.pos('/api/pos/registers',{...movement,commandId:'staff-write',expectedUpdatedAt:shift.updatedAt},{user:staff}),/owner\/admin/)
  const {job}=await f.call('',f.create)
  const paid=await f.call('/pay',{id:job.id,commandId:'cash-sale',expectedUpdatedAt:job.updatedAt,amount:'30',method:'cash',cash:'50'})
  await f.pos('/api/pos/returns',{id:'return-one',saleId:paid.sale.id,reason:'Partial return',method:'cash',items:[{lineIndex:0,amount:10}]})
  f.setFail(true);await assert.rejects(f.pos('/api/pos/registers',{...movement,commandId:'failed',expectedUpdatedAt:shift.updatedAt,direction:'in',amount:'5'}),/outbox/);f.setFail(false)
  await assert.rejects(f.pos('/api/pos/registers',{id:shift.id,action:'close',commandId:'bad-close',expectedUpdatedAt:shift.updatedAt,amount:'116'}),/Explain/)
  const close={id:shift.id,action:'close',commandId:'close-one',expectedUpdatedAt:shift.updatedAt,amount:'117'}
  const closed=await f.pos('/api/pos/registers',close);await f.pos('/api/pos/registers',close)
  assert.equal(closed.cashSales,30);assert.equal(closed.cashReturns,10);assert.equal(closed.expectedCash,117);assert.equal(closed.difference,0)
  const next=await f.pos('/api/pos/registers',{id:'shift-two',action:'open',commandId:'open-two',expectedUpdatedAt:'',amount:'117'},{user:staff})
  assert.equal(next.staffId,staff.id);assert.equal(next.tillId,'till1')
  // Owner refund comes from the currently open drawer, even though the cashier owns its shift.
  await f.pos('/api/pos/returns',{id:'return-two',saleId:paid.sale.id,reason:'Further refund',method:'cash',items:[{lineIndex:0,amount:5}]})
  const end=await f.pos('/api/pos/registers',{id:next.id,action:'close',commandId:'close-two',expectedUpdatedAt:next.updatedAt,amount:'112'},{user:staff})
  assert.equal(end.expectedCash,112);assert.equal(end.cashReturns,5)
 }finally{f.sql.close()}
})
test('retained cash extras remain in the physical drawer after change',async()=>{
 const f=fixture();try{
  const shift=await f.pos('/api/pos/registers',{id:'extras-shift',action:'open',amount:50})
  f.sql.prepare("INSERT INTO sales(id,total,payment_method,payment_details,created_at,branch_id) VALUES(?,?,?,?,?,?)").run('extras-sale',10,'cash',JSON.stringify({extraKept:2,pos:{registerId:shift.id}}),new Date().toISOString(),'main')
  const end=await f.pos('/api/pos/registers',{id:shift.id,action:'close',amount:62})
  assert.equal(end.cashSales,12);assert.equal(end.difference,0)
 }finally{f.sql.close()}
})
