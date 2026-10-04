import { counterConflictRecord } from '../server/counter-service.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { handlePos, ensurePos, applyPosRecord } from '../server/pos-service.mjs'
import { migrateRetail } from '../server/retail.mjs'
import { restaurantBillFingerprint } from '../server/restaurant-service.mjs'
import { restaurantBillLines,restaurantOrderPayment,restaurantPortion,validateRestaurantLedger,validateRestaurantPayment } from '../server/restaurant-payments.mjs'
const owner={id:'owner',name:'Owner',role:'owner'}
async function fixture() {
 const sqlite=new DatabaseSync(':memory:')
 const source=readFileSync('src/lib/browserSchema.ts','utf8').split('export const browserSchema = ')[1].trim();sqlite.exec(vm.runInNewContext(source))
 sqlite.exec(`ALTER TABLE app_settings ADD COLUMN shop_profile TEXT;INSERT INTO app_settings(id,app_name,currency,updated_at,shop_profile) VALUES(1,'Cafe','USD','now','{"restaurant":true,"fastFood":true}');INSERT INTO products(id,name,sku,category,stock,reorder_point,price,cost_price,unit,updated_at) VALUES('bottle','Bottle','BOTTLE','Drinks',8,0,3,2,'bottle','now');CREATE TABLE IF NOT EXISTS branch_inventory(branch_id TEXT,product_id TEXT,stock REAL,reorder_point REAL DEFAULT 0,updated_at TEXT,PRIMARY KEY(branch_id,product_id));INSERT INTO branch_inventory VALUES('main','bottle',8,0,'now');`)
 let transaction=false
 const db={query:(sql,args=[])=>({values:sqlite.prepare(sql).all(...args)}),run:(sql,args=[],own=false)=>{if(transaction)assert.equal(own,false);return sqlite.prepare(sql).run(...args)},execute:sql=>sqlite.exec(sql),beginTransaction:()=>{sqlite.exec('BEGIN');transaction=true},commitTransaction:()=>{sqlite.exec('COMMIT');transaction=false},rollbackTransaction:()=>{sqlite.exec('ROLLBACK');transaction=false}}
 await migrateRetail(db);await ensurePos(db)
 const sales=()=>sqlite.prepare('SELECT id,total,payment_method AS paymentMethod,payment_reference AS paymentReference,terminal_provider AS terminalProvider,created_at AS createdAt,cash_received AS cashReceived,change_given AS changeGiven,payment_details AS paymentDetails,branch_id AS branchId FROM sales').all().map(sale=>({...sale,paymentDetails:JSON.parse(sale.paymentDetails),items:sqlite.prepare('SELECT product_id AS productId,product_name AS productName,quantity,unit_price AS price FROM sale_items WHERE sale_id=? ORDER BY rowid').all(sale.id)}))
 const call=(path,input,tillId='till')=>handlePos({db,scope:'business',branchId:'main',user:owner,path:'/api/pos/'+path,method:input?'POST':'GET',input:input||{},tillId,sales,publish:(record,type='pos_record')=>db.run('INSERT INTO sync_outbox(operation_id,entity_type,entity_id,action,payload,created_at) VALUES(?,?,?,?,?,?)',[crypto.randomUUID(),type,record.id,type==='sale'?'create':'upsert',JSON.stringify(record),record.updatedAt||record.createdAt],false)})
 const command=(path,input)=>call(path,{commandId:crypto.randomUUID(),expectedUpdatedAt:'',...input})
 const tab=await command('restaurant/open',{id:'restaurant-tab:main:group',name:'Ada group',sessionId:'session',guests:3})
 const menu=await command('restaurant/counter/menu',{id:'restaurant-menu',items:[{id:'meal',name:'Meal',price:10,type:'prepared',productId:'',available:true,station:'kitchen',options:[]},{id:'drink',name:'Drink',price:3,type:'stock',productId:'bottle',available:true,station:'bar',options:[]}]})
 async function order(id,item='meal',seat=1,quantity=1){return command('restaurant/counter/orders',{id,menuUpdatedAt:menu.updatedAt,tableService:{tabId:tab.id,sessionId:tab.sessionId,seat},lines:[{id:id+'line',menuItemId:item,optionIds:[],quantity}]})}
 async function payment(selections,extra={}){const state=await call('restaurant');return {id:'restaurant-payment:'+crypto.randomUUID(),tabId:tab.id,sessionId:tab.sessionId,expectedUpdatedAt:state.ledgers[0]?.updatedAt||'',billFingerprint:restaurantBillFingerprint(tab,state.orders),selections:selections||restaurantBillLines(tab,state.orders,state.receipts).filter(line=>line.remaining>0).map(line=>({orderId:line.orderId,lineId:line.lineId,quantity:line.remaining})),method:'cash',cash:'',provider:'',reference:'',...extra}}
 return {sqlite,db,call,command,tab,menu,order,payment,sales}
}
test('consolidated payment atomically saves one receipt and ledger, retries exactly once, and closes only served bills',async()=>{
 const f=await fixture();try{
  let meal=await f.order('meal-round');let drink=await f.order('drink-round','drink',2)
  for(let order of [meal,drink])for(const status of ['preparing','ready','collected'])order=await f.command('restaurant/counter/status',{id:order.id,expectedUpdatedAt:order.updatedAt,status})
  assert.equal(f.sqlite.prepare('SELECT stock FROM branch_inventory').get().stock,7)
  const input=await f.payment(undefined,{cash:'20'}),sale=await f.call('restaurant/settle',input)
  assert.equal(sale.total,13);assert.equal(sale.changeGiven,7);assert.equal(sale.items.length,2);assert.equal(f.sales().length,1)
  assert.equal((await f.call('restaurant/settle',input)).id,sale.id);assert.equal(f.sales().length,1)
  await assert.rejects(f.call('restaurant/settle',{...input,cash:'30'}),/different details/)
  assert.equal(f.sqlite.prepare('SELECT stock FROM branch_inventory').get().stock,7)
  const state=await f.call('restaurant');assert.ok(state.orders.every(order=>order.receiptId===sale.id))
  const closed=await f.command('restaurant/close',{id:f.tab.id,expectedUpdatedAt:f.tab.updatedAt});assert.equal(closed.status,'closed')
  assert.equal((await f.call('restaurant/settle',input)).id,sale.id)
 }finally{f.sqlite.close()}
})
test('splitting quantities and seats retains remaining portions and prevents paying an item twice',async()=>{
 const f=await fixture();try{
  const order=await f.order('round','meal',1,2)
  const first=await f.call('restaurant/settle',await f.payment([{orderId:order.id,lineId:order.lines[0].id,quantity:0.667}]))
  assert.equal(first.total,6.67)
  const lines=restaurantBillLines(f.tab,[order],f.sales());assert.equal(lines[0].remaining,1.333);assert.equal(lines[0].remainingAmount,13.33)
  assert.equal(restaurantOrderPayment(order,f.sales()).paymentStarted,true);assert.equal(restaurantOrderPayment(order,f.sales()).receiptId,'')
  await assert.rejects(f.call('restaurant/settle',await f.payment([{orderId:order.id,lineId:order.lines[0].id,quantity:2}])),/exceeds/)
  const last=await f.call('restaurant/settle',await f.payment());assert.equal(last.total,13.33)
  assert.equal(f.sales().reduce((sum,sale)=>sum+sale.total,0),20)
 }finally{f.sqlite.close()}
})
test('saved tax and discount cents survive partial settlement, including mixed tender and cash change',async()=>{
 const f=await fixture();try{
  await f.call('settings',{taxEnabled:true,taxRate:10})
  const order=await f.command('restaurant/counter/orders',{id:'taxed',menuUpdatedAt:f.menu.updatedAt,discountType:'amount',discountValue:1,tableService:{tabId:f.tab.id,sessionId:f.tab.sessionId,seat:1},lines:[{id:'line',menuItemId:'meal',quantity:1,optionIds:[]}]})
  const first=await f.call('restaurant/settle',await f.payment([{orderId:order.id,lineId:'line',quantity:0.333}],{method:'multiple',allocations:[{method:'cash',amount:'1',provider:'',reference:''},{method:'external-pos',amount:'2.3',provider:'Terminal',reference:'OK-1'}],cashReceived:'5'}))
  assert.equal(first.total,3.3);assert.equal(first.changeGiven,4);assert.equal(first.paymentDetails.pos.pricing.tax,0.3)
  const second=await f.call('restaurant/settle',await f.payment())
  assert.equal(second.total,6.6);assert.equal(Math.round(f.sales().reduce((sum,sale)=>sum+sale.paymentDetails.pos.pricing.tax,0)*100),90)
  assert.equal(f.sales().reduce((sum,sale)=>sum+sale.paymentDetails.pos.pricing.discount,0),1)
 }finally{f.sqlite.close()}
})
test('outbox failure rolls back money, ledger and receipt together; stale entries and wrong tills are rejected',async()=>{
 const f=await fixture();try{
  await f.order('round');const input=await f.payment()
  f.sqlite.exec("CREATE TRIGGER fail BEFORE INSERT ON sync_outbox WHEN NEW.entity_type='sale' BEGIN SELECT RAISE(ABORT,'outbox failure');END")
  await assert.rejects(f.call('restaurant/settle',input),/outbox failure/)
  assert.equal(f.sales().length,0);assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM pos_records WHERE kind='restaurant-ledger'").get().n,0)
  f.sqlite.exec('DROP TRIGGER fail')
  await assert.rejects(f.call('restaurant/settle',input,'other'),/original till/)
  await f.order('new-round')
  await assert.rejects(f.call('restaurant/settle',input),/bill changed/)
  assert.equal(f.sales().length,0)
 }finally{f.sqlite.close()}
})
test('synced ledger restores its receipt once and validates financial snapshots against source orders',async()=>{
 const f=await fixture();try{
  await f.order('round');const input=await f.payment(),sale=await f.call('restaurant/settle',input)
  const state=await f.call('restaurant'),ledger=state.ledgers[0]
  await validateRestaurantLedger(ledger,undefined,f.tab,state.orders,[])
  assert.throws(()=>validateRestaurantPayment({...sale,total:100},f.tab,state.orders,[]),/pricing|match/)
  f.sqlite.exec('DELETE FROM sale_items;DELETE FROM sales')
  await f.db.beginTransaction();await applyPosRecord(f.db,'business',ledger);await f.db.commitTransaction()
  await f.db.beginTransaction();await applyPosRecord(f.db,'business',ledger);await f.db.commitTransaction()
  assert.equal(f.sales().length,1)
  assert.equal(f.sales()[0].id,sale.id)
 }finally{f.sqlite.close()}
})

test('kitchen and bar readiness progresses independently without consuming ingredients twice',async()=>{
 const f=await fixture();try{
  let order=await f.command('restaurant/counter/orders',{id:'mixed',menuUpdatedAt:f.menu.updatedAt,tableService:{tabId:f.tab.id,sessionId:f.tab.sessionId,seat:1},lines:[{id:'meal-line',menuItemId:'meal',quantity:1,optionIds:[]},{id:'drink-line',menuItemId:'drink',quantity:1,optionIds:[]}]})
  order=await f.command('restaurant/counter/status',{id:order.id,expectedUpdatedAt:order.updatedAt,status:'preparing'})
  order=await f.command('restaurant/counter/status',{id:order.id,expectedUpdatedAt:order.updatedAt,status:'ready',station:'bar'})
  assert.equal(order.status,'preparing');assert.equal(order.stationReady.bar,true)
  await assert.rejects(f.command('restaurant/counter/status',{id:order.id,expectedUpdatedAt:order.updatedAt,status:'collected'}),/stages/)
  order=await f.command('restaurant/counter/status',{id:order.id,expectedUpdatedAt:order.updatedAt,status:'ready',station:'kitchen'})
  assert.equal(order.status,'ready');assert.equal(f.sqlite.prepare('SELECT stock FROM branch_inventory').get().stock,7)
 }finally{f.sqlite.close()}
})
test('moving preserves the bill and merging frees the source while settling all immutable rounds together',async()=>{
 const f=await fixture();try{
  await f.command('restaurant/layout',{id:'restaurant-layout:main',tables:[{id:'large',name:'Large table',seats:8},{id:'small',name:'Small table',seats:2}]})
  const sourceOrder=await f.order('source-round','meal',2)
  let floor=await f.command('restaurant/arrange',{tabId:f.tab.id,sessionId:f.tab.sessionId,action:'move',tableId:'large'})
  let state=await f.call('restaurant'),moved=state.tabs.find(tab=>tab.id===f.tab.id)
  assert.deepEqual(counterConflictRecord({entityType:'pos_record',entityId:floor.id,localPayload:{...floor,updatedAt:'2099-01-01'},remotePayload:floor}),floor)
  assert.equal(moved.displayTableId,'large');assert.equal(moved.name,'Large table')
  const second=await f.command('restaurant/open',{id:'restaurant-tab:main:second',name:'Second group',sessionId:'second-session',guests:1})
  await assert.rejects(f.command('restaurant/arrange',{expectedUpdatedAt:floor.updatedAt,tabId:second.id,sessionId:second.sessionId,action:'move',tableId:'large'}),/open bill/)
  const secondOrder=await f.command('restaurant/counter/orders',{id:'second-order',menuUpdatedAt:f.menu.updatedAt,tableService:{tabId:second.id,sessionId:second.sessionId,seat:1},lines:[{id:'second-line',menuItemId:'drink',quantity:1,optionIds:[]}]})
  floor=await f.command('restaurant/arrange',{expectedUpdatedAt:floor.updatedAt,tabId:second.id,sessionId:second.sessionId,action:'merge',targetId:f.tab.id,targetSessionId:f.tab.sessionId})
  state=await f.call('restaurant');moved=state.tabs.find(tab=>tab.id===f.tab.id)
  assert.equal(moved.guests,4);assert.equal(state.tabs.find(tab=>tab.id===second.id).mergedInto.tabId,f.tab.id)
  const lines=restaurantBillLines(moved,state.orders,state.receipts)
  assert.equal(lines.length,2);assert.equal(lines.find(line=>line.orderId===secondOrder.id).seat,4)
  const sale=await f.call('restaurant/settle',{id:'restaurant-payment:merged',tabId:moved.id,sessionId:moved.sessionId,expectedUpdatedAt:'',billFingerprint:restaurantBillFingerprint(moved,state.orders),selections:lines.map(line=>({orderId:line.orderId,lineId:line.lineId,quantity:line.remaining})),method:'cash',cash:'20'})
  assert.equal(sale.total,13);assert.equal(sale.items.length,2)
  const acceptedLedger=JSON.parse(f.sqlite.prepare("SELECT payload FROM pos_records WHERE kind='restaurant-ledger'").get().payload)
  await validateRestaurantLedger(acceptedLedger,undefined,moved,state.orders,[])
  assert.deepEqual(JSON.parse(f.sqlite.prepare('SELECT payload FROM pos_records WHERE id=?').get(sourceOrder.id).payload).tableService,sourceOrder.tableService)
  await assert.rejects(f.command('restaurant/arrange',{expectedUpdatedAt:'',tabId:moved.id,sessionId:moved.sessionId,action:'move',tableId:'small'}),/tables changed/)
  await assert.rejects(f.command('restaurant/arrange',{expectedUpdatedAt:floor.updatedAt,tabId:moved.id,sessionId:moved.sessionId,action:'merge',targetId:second.id,targetSessionId:second.sessionId}),/open bills/)
 }finally{f.sqlite.close()}
})

test('mixed payments and receipt refunds reconcile with the existing cashier register',async()=>{
 const f=await fixture();try{
  const register=await f.call('registers',{action:'open',amount:10})
  await f.order('register-order')
  const sale=await f.call('restaurant/settle',await f.payment(undefined,{method:'multiple',cashReceived:'10',allocations:[{method:'cash',amount:5},{method:'external-pos',amount:5,provider:'Terminal',reference:'OK'}]}))
  assert.equal(sale.paymentDetails.pos.registerId,register.id);assert.equal(sale.changeGiven,5)
  const refund=await f.call('returns',{id:'restaurant-refund',saleId:sale.id,reason:'Customer correction',method:'cash',items:[{lineIndex:0,quantity:0.5,restock:false}]})
  assert.equal(refund.total,5)
  const closed=await f.call('registers',{action:'close',id:register.id,amount:10})
  assert.equal(closed.expectedCash,10);assert.equal(closed.difference,0)
 }finally{f.sqlite.close()}
})
test('small loyalty rewards reconcile exactly across several lines and partial quantities',async()=>{
 const f=await fixture();try{
  f.sqlite.exec("INSERT INTO customers(id,name,phone,balance) VALUES('guest','Guest','',0)")
  await f.call('settings',{loyaltyEnabled:true,loyaltyRate:0.05})
  const order=await f.command('restaurant/counter/orders',{id:'reward-order',customerId:'guest',menuUpdatedAt:f.menu.updatedAt,tableService:{tabId:f.tab.id,sessionId:f.tab.sessionId,seat:1},lines:[1,2,3].map(index=>({id:'reward-'+index,menuItemId:'meal',quantity:1,optionIds:[]}))})
  for(const line of order.lines) await f.call('restaurant/settle',await f.payment([{orderId:order.id,lineId:line.id,quantity:0.5}]))
  await f.call('restaurant/settle',await f.payment())
  assert.equal(Math.round(f.sales().reduce((sum,sale)=>sum+sale.paymentDetails.pos.loyaltyEarned,0)*100),2)
 }finally{f.sqlite.close()}
})

test('fractional receipt summaries reconcile exactly without negative subtotal or lost tax cents',async()=>{
 const f=await fixture();try{
  await f.call('settings',{taxEnabled:true,taxRate:9})
  const order=await f.command('restaurant/counter/orders',{id:'rounded-order',menuUpdatedAt:f.menu.updatedAt,discountType:'amount',discountValue:1,tableService:{tabId:f.tab.id,sessionId:f.tab.sessionId,seat:1},lines:[{id:'line',menuItemId:'meal',quantity:1,optionIds:[]}]})
  for(const quantity of [0.333,0.333,0.334]) {
    const receipt=await f.call('restaurant/settle',await f.payment([{orderId:order.id,lineId:'line',quantity}]))
    const pricing=receipt.paymentDetails.pos.pricing
    assert.equal(Math.round((pricing.subtotal-pricing.discount+pricing.addedTax)*100),Math.round(receipt.total*100))
    assert.ok(pricing.subtotal>=0)
  }
  assert.equal(Math.round(f.sales().reduce((sum,sale)=>sum+sale.paymentDetails.pos.pricing.subtotal,0)*100),1000)
  assert.equal(Math.round(f.sales().reduce((sum,sale)=>sum+sale.paymentDetails.pos.pricing.tax,0)*100),81)
 }finally{f.sqlite.close()}
})
