import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { handlePos } from '../server/pos-service.mjs'
import { businessWorkspace, normalizeShopProfile } from '../server/shop-profile.mjs'
import { tableTabId, validateRestaurantRecord } from '../server/restaurant-service.mjs'
import { counterItems, counterSaleId, validateCounterPayment, requiresRestaurantSync, counterConflictRecord } from '../server/counter-service.mjs'
import { recordPayment } from '../server/payment.mjs'
const owner={id:'owner',name:'Owner',role:'owner'}
function fixture() {
 const sqlite=new DatabaseSync(':memory:')
 sqlite.exec(`CREATE TABLE app_settings(id INTEGER PRIMARY KEY,shop_profile TEXT,app_name TEXT,currency TEXT);INSERT INTO app_settings VALUES(1,'{"restaurant":true,"fastFood":true}','Cafe','USD');CREATE TABLE customers(id TEXT,name TEXT,phone TEXT,balance REAL);CREATE TABLE products(id TEXT PRIMARY KEY);`)
 const db={query:(sql,params=[])=>({values:sqlite.prepare(sql).all(...params)}),run:(sql,params=[])=>sqlite.prepare(sql).run(...params),beginTransaction:()=>sqlite.exec('BEGIN'),commitTransaction:()=>sqlite.exec('COMMIT'),rollbackTransaction:()=>sqlite.exec('ROLLBACK')}
 const sales=[],published=[]
 const call=(path,input={},tillId='till',user=owner,branchId='main')=>handlePos({db,scope:'business',branchId,user,path:'/api/pos/'+path,method:['restaurant','restaurant/counter','counter'].includes(path)?'GET':'POST',input,sales:()=>sales,tillId,publish:record=>published.push(record)})
 const command=(path,input,till='till',user=owner)=>call(path,{commandId:crypto.randomUUID(),expectedUpdatedAt:'',...input},till,user)
 return {sqlite,call,command,sales,published}
}
async function setup(f) {
 const layout=await f.command('restaurant/layout',{id:'restaurant-layout:main',tables:[{id:'one',name:'Table 1',seats:4}]})
 const tab=await f.command('restaurant/open',{id:tableTabId('main','one'),tableId:'one',sessionId:'session1',guests:2})
 const menu=await f.command('restaurant/counter/menu',{id:'restaurant-menu',items:[{id:'meal',name:'Meal',price:10,type:'prepared',available:true,productId:'',station:'kitchen',options:[]},{id:'drink',name:'Drink',price:3,type:'prepared',available:true,productId:'',station:'bar',options:[]}]})
 return {layout,tab,menu}
}
const newOrder=(f,tab,menu,id='round1',seat=1)=>f.command('restaurant/counter/orders',{id,menuUpdatedAt:menu.updatedAt,tableService:{tabId:tab.id,sessionId:tab.sessionId,seat},lines:[{id:id+'line',menuItemId:'meal',quantity:2,optionIds:[]}]})
const advance=(f,order,status)=>f.command('restaurant/counter/status',{id:order.id,expectedUpdatedAt:order.updatedAt,status})
const payment=order=>recordPayment({id:counterSaleId(order.id),currency:order.currency,branchId:'main',items:counterItems(order),total:order.total,paymentMethod:'cash',paymentDetails:{amountReceived:order.total,pos:order.pos,counterOrder:{id:order.id,tillId:order.tillId,tableService:order.tableService}}})

test('restaurant workspace is opt-in and restaurant-only hides stock, payments and fast food',()=>{
 const basic=businessWorkspace({mode:'suggested',industry:'supermarket'});assert.equal(basic.restaurant,false)
 const workspace=businessWorkspace(normalizeShopProfile({workflows:'restaurant'}));assert.equal(workspace.restaurant,true);assert.equal(workspace.fastFood,false);assert.equal(workspace.stock,false);assert.equal(workspace.payments,false)
 assert.ok(requiresRestaurantSync({payload:{shopProfile:{restaurant:true}}}))
 assert.ok(requiresRestaurantSync({payload:{kind:'restaurant-tab'}}))
})
test('restaurant menus and orders are separate, bills allow repeated rounds, seats are validated',async()=>{
 const f=fixture();try{
  const {tab,menu}=await setup(f)
  const first=await newOrder(f,tab,menu);f.sqlite.exec("UPDATE app_settings SET currency='EUR',app_name='Renamed cafe'");const second=await newOrder(f,tab,menu,'round2',2)
  assert.equal(second.currency,'USD');assert.equal(second.businessName,'Cafe')
  assert.equal(first.total,20);assert.equal(first.tableService.name,'Table 1');assert.equal(first.lines[0].station,'kitchen');assert.equal(second.tableService.seat,2)
  assert.equal((await f.call('restaurant/counter')).orders.length,2)
  assert.equal((await f.call('counter')).orders.length,0)
  assert.deepEqual((await f.call('counter')).menu.items,[])
  await assert.rejects(newOrder(f,tab,menu,'wrong-seat',3),/seat/)
  await assert.rejects(newOrder(f,{...tab,sessionId:'wrong'},menu,'wrong-session'),/open table/)
  await assert.rejects(f.command('restaurant/counter/orders',{id:'wrong-till',menuUpdatedAt:menu.updatedAt,tableService:{tabId:tab.id,sessionId:tab.sessionId},lines:[{id:'a',menuItemId:'meal',quantity:1,optionIds:[]}]},'other'),/till/)
  await assert.rejects(f.command('counter/status',{id:first.id,expectedUpdatedAt:first.updatedAt,status:'preparing'}),/workspace that created/)
 }finally{f.sqlite.close()}
})
test('table orders can be served before payment; unpaid or unserved bills cannot close; paid tables can reopen without losing history',async()=>{
 const f=fixture();try{
  const {tab,menu}=await setup(f);let order=await newOrder(f,tab,menu)
  await assert.rejects(f.command('restaurant/close',{id:tab.id,expectedUpdatedAt:tab.updatedAt}),/Serve or cancel/)
  order=await advance(f,order,'preparing');order=await advance(f,order,'ready');order=await advance(f,order,'collected')
  assert.equal(order.status,'collected');assert.equal(f.sales.length,0)
  await assert.rejects(f.command('restaurant/close',{id:tab.id,expectedUpdatedAt:tab.updatedAt}),/Settle/)
  const sale=payment(order);validateCounterPayment(sale,order,'till');f.sales.push(sale)
  assert.equal(sale.paymentDetails.counterOrder.tableService.seat,1)
  assert.throws(()=>validateCounterPayment({...sale,paymentDetails:{...sale.paymentDetails,counterOrder:{...sale.paymentDetails.counterOrder,tableService:{...order.tableService,seat:2}}}},order,'till'),/bill and seat/)
  const closed=await f.command('restaurant/close',{id:tab.id,expectedUpdatedAt:tab.updatedAt});assert.equal(closed.status,'closed')
  await assert.rejects(f.command('restaurant/counter/status',{id:order.id,expectedUpdatedAt:order.updatedAt,status:'cancelled',reason:'Late correction'}),/Closed bill/)
  await assert.rejects(newOrder(f,tab,menu,'after-close'),/open table/)
  const reopened=await f.command('restaurant/open',{id:tab.id,expectedUpdatedAt:closed.updatedAt,tableId:'one',sessionId:'session2',guests:1})
  assert.equal(reopened.history.length,1);assert.equal(reopened.history[0].sessionId,tab.sessionId)
  assert.equal((await f.call('restaurant')).orders.length,1)
  await newOrder(f,reopened,menu,'new-round');assert.equal((await f.call('restaurant')).orders.length,2)
  assert.equal(counterConflictRecord({entityType:'pos_record',entityId:tab.id,localPayload:reopened,remotePayload:closed}).status,'closed')
 }finally{f.sqlite.close()}
})
test('open table occupancy, layout revisions, permissions and cancelled rounds are guarded',async()=>{
 const f=fixture();try{
  const {layout,tab,menu}=await setup(f)
  await assert.rejects(f.command('restaurant/open',{id:tab.id,expectedUpdatedAt:tab.updatedAt,tableId:'one',sessionId:'other',guests:1}),/already/)
  await assert.rejects(f.command('restaurant/layout',{id:layout.id,expectedUpdatedAt:layout.updatedAt,tables:[]}),/Close/)
  await assert.rejects(f.command('restaurant/layout',{id:layout.id,expectedUpdatedAt:layout.updatedAt,tables:layout.tables},'till',{...owner,role:'cashier'}),/owner or admin/)
  let order=await newOrder(f,tab,menu)
  order=await f.command('restaurant/counter/status',{id:order.id,expectedUpdatedAt:order.updatedAt,status:'cancelled',reason:'Customer left'})
  const closed=await f.command('restaurant/close',{id:tab.id,expectedUpdatedAt:tab.updatedAt});assert.equal(closed.status,'closed')
  const reopened=await f.command('restaurant/open',{id:tab.id,expectedUpdatedAt:closed.updatedAt,tableId:'one',sessionId:'next',guests:1})
  assert.throws(()=>validateRestaurantRecord({...reopened,history:[]},closed),/history/)
  await assert.rejects(f.command('restaurant/close',{id:reopened.id,expectedUpdatedAt:reopened.updatedAt},'other'),/original till/)
  f.sqlite.exec("UPDATE app_settings SET shop_profile='{}'")
  await assert.rejects(f.call('restaurant'),/enable/)
 }finally{f.sqlite.close()}
})
test('named bar tabs need no tables and command retries are idempotent',async()=>{
 const f=fixture();try{
  const request={id:'restaurant-tab:main:bar',sessionId:'party',name:'Ada group',guests:3,expectedUpdatedAt:'',commandId:'open-one'}
  const tab=await f.call('restaurant/open',request);assert.equal(tab.tableId,'')
  const retry=await f.call('restaurant/open',request);assert.equal(retry.updatedAt,tab.updatedAt);assert.equal(f.published.length,1)
  await assert.rejects(f.call('restaurant/open',{...request,name:'Different'}),/different/)
  await assert.rejects(f.command('restaurant/open',{id:'restaurant-tab:main:wrong',tableId:'missing',sessionId:'a',guests:1}),/configured/)
 }finally{f.sqlite.close()}
})
