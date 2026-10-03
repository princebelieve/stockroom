import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {stockSchema,stockChangeSync,stockTransferSync,allocateStock,applySyncedSale} from '../server/stock-ledger.mjs'
import {coordinationChanges,createSupermarketCoordinator} from '../cloud/supermarket-coordination.mjs'
function fixture(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(`CREATE TABLE products(id TEXT PRIMARY KEY,cost_price REAL,reorder_point REAL);INSERT INTO products VALUES('milk',2,0);CREATE TABLE branch_inventory(branch_id TEXT,product_id TEXT,stock REAL,updated_at TEXT,reorder_point REAL DEFAULT 0,PRIMARY KEY(branch_id,product_id));INSERT INTO branch_inventory VALUES('main','milk',0,'',0);`);sqlite.exec(stockSchema);const db={query:(sql,args=[])=>({values:sqlite.prepare(sql).all(...args)}),run:(sql,args=[])=>sqlite.prepare(sql).run(...args)};return{sqlite,db}}
function event(f,input){f.sqlite.exec('BEGIN');try{const result=stockChangeSync(f.db,{branchId:'main',productId:'milk',createdAt:'2026-10-03T12:00:00Z',...input});f.sqlite.prepare('UPDATE branch_inventory SET stock=stock+? WHERE branch_id=? AND product_id=?').run(input.delta,input.branchId||'main','milk');f.sqlite.exec('COMMIT');return result}catch(error){f.sqlite.exec('ROLLBACK');throw error}}

test('a transfer spanning two costs retains both destination batches',()=>{
 const f=fixture();try{
  event(f,{id:'first',delta:2,unitCost:3,expiry:'2026-10-08'})
  event(f,{id:'second',delta:3,unitCost:7,expiry:'2026-10-09'})
  f.sqlite.exec('BEGIN')
  stockTransferSync(f.db,{id:'multi',fromBranchId:'main',toBranchId:'other',productId:'milk',quantity:4,createdAt:'2026-10-03T12:00:00Z'})
  f.sqlite.exec("UPDATE branch_inventory SET stock=stock-4 WHERE branch_id='main';UPDATE branch_inventory SET stock=stock+4 WHERE branch_id='other';COMMIT")
  assert.deepEqual(f.sqlite.prepare("SELECT id,quantity,unit_cost FROM stock_batches WHERE branch_id='other' ORDER BY id").all().map(row=>[row.id,row.quantity,row.unit_cost]),[['first',2,3],['second',2,7]])
 }finally{f.sqlite.close()}
})
test('FEFO excludes expired batches and captures the cost of each delivery',()=>{const f=fixture();try{event(f,{id:'late',delta:5,unitCost:4,expiry:'2026-12-01'});event(f,{id:'early',delta:3,unitCost:2,expiry:'2026-10-05'});event(f,{id:'expired',delta:2,unitCost:1,expiry:'2026-10-01'});const result=event(f,{id:'sale',delta:-4});assert.deepEqual(result.allocations.map(row=>[row.id,row.quantity]),[['early',3],['late',1]]);assert.equal(result.unitCost,2.5);assert.throws(()=>event(f,{id:'oversold',delta:-5}),/sellable/);assert.equal(f.sqlite.prepare('SELECT SUM(quantity) AS n FROM stock_batches').get().n,6);const waste=event(f,{id:'waste',delta:-2,allowExpired:true});assert.equal(waste.unitCost,1);assert.equal(waste.allocations[0].id,'expired')}finally{f.sqlite.close()}})
test('transfer retains expiry and delivery cost at the destination branch',()=>{const f=fixture();try{event(f,{id:'delivery',delta:5,unitCost:7,expiry:'2026-10-08',batchNumber:'B1'});f.sqlite.exec('BEGIN');const allocations=stockTransferSync(f.db,{id:'transfer',fromBranchId:'main',toBranchId:'second',productId:'milk',quantity:2,createdAt:'2026-10-03T12:00:00Z'});f.sqlite.exec("UPDATE branch_inventory SET stock=stock-2 WHERE branch_id='main';UPDATE branch_inventory SET stock=stock+2 WHERE branch_id='second'");f.sqlite.exec('COMMIT');assert.equal(allocations[0].unitCost,7);const lot=f.sqlite.prepare("SELECT * FROM stock_batches WHERE branch_id='second'").get();assert.equal(lot.expiry,'2026-10-08');assert.equal(lot.quantity,2);assert.equal(lot.unit_cost,7)}finally{f.sqlite.close()}})
test('recorded allocations reject a changed batch instead of silently taking another delivery',()=>{assert.throws(()=>allocateStock([{id:'expired',quantity:2,expiry:'2026-01-01',received_at:'',unit_cost:2}],1,'2026-10-03'),/sellable/);const f=fixture();try{event(f,{id:'delivery',delta:2,unitCost:3});assert.throws(()=>event(f,{id:'wrong',delta:-1,allocations:[{id:'missing',quantity:1,unitCost:3}]}),/Batch changed/);assert.equal(f.sqlite.prepare('SELECT quantity FROM stock_batches').get().quantity,2)}finally{f.sqlite.close()}})
test('coordination covers offline overselling, shared return limits, and order shortages',()=>{const sale={businessId:'shop',entityType:'sale',action:'create',payload:{id:'sale',branchId:'main',items:[{productId:'milk',quantity:2,beforeStock:3}]}};const changes=coordinationChanges(sale);assert.equal(changes[0].delta,-2);assert.equal(changes[1].key,'return:sale:0');const returned=coordinationChanges({entityType:'pos_record',payload:{kind:'return',saleId:'sale',items:[{lineIndex:0,productId:'milk',quantity:2,restock:true}]}},sale.payload);assert.equal(returned[0].initial,2);assert.equal(returned[0].delta,-2);assert.equal(returned[1].delta,2)})
test('cloud admission is idempotent and concurrent tills produce an explicit stock discrepancy',async()=>{const stores=new Map();let tail=Promise.resolve();const database={collection:name=>{if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name);return{findOne:async query=>data.get(query._id)||null,updateOne:async(query,update)=>{data.set(query._id,{...(data.get(query._id)||{}),...update.$set})},insertOne:async row=>data.set(row._id,row)}}};const client={startSession:()=>({withTransaction:async action=>{const previous=tail;let release;tail=new Promise(resolve=>release=resolve);await previous;try{await action()}finally{release()}},endSession:async()=>{}})};const admit=createSupermarketCoordinator(database,client);const sale=id=>({businessId:'shop',operationId:id,entityType:'sale',action:'create',payload:{id,branchId:'main',items:[{productId:'milk',quantity:2,beforeStock:3}]}});const results=await Promise.all([admit(sale('a')),admit(sale('b'))]);assert.equal(results.flat().length,1);assert.match(results.flat()[0],/oversold/);assert.equal(stores.get('supermarket_resources').get('shop:stock:main:milk').value,-1);await admit(sale('b'));assert.equal(stores.get('supermarket_resources').get('shop:stock:main:milk').value,-1)})


test('completed offline sales retain captured batches despite shortages, and replenishment recovers stock',()=>{
 const f=fixture();try{
  event(f,{id:'delivery',delta:3,unitCost:7})
  const parts=[{id:'delivery',quantity:2,unitCost:7,expiry:'',batchNumber:''}]
  event(f,{id:'local',delta:-2,allocations:parts})
  assert.throws(()=>event(f,{id:'new-sale',delta:-2}),/sellable/)
  const remote=event(f,{id:'remote',delta:-2,allocations:parts,completedSale:true})
  assert.equal(remote.unitCost,7)
  assert.equal(f.sqlite.prepare('SELECT stock FROM branch_inventory').get().stock,-1)
  assert.equal(f.sqlite.prepare("SELECT quantity FROM stock_batches WHERE id='delivery'").get().quantity,0)
  assert.equal(stockChangeSync(f.db,{id:'remote',branchId:'main',productId:'milk',delta:-2}).unitCost,7)
  event(f,{id:'replenished',delta:4,unitCost:8})
  event(f,{id:'after-replenishment',delta:-3})
  assert.equal(f.sqlite.prepare('SELECT stock FROM branch_inventory').get().stock,0)
 }finally{f.sqlite.close()}
})

test('cloud coordinates offline reward spending and reward restoration',()=>{
 const sale={entityType:'sale',action:'create',payload:{id:'s',branchId:'main',items:[],paymentDetails:{pos:{customerId:'c',loyaltyBeforeBalance:5,loyaltyRedeemed:4,loyaltyEarned:0.1}}}}
 const change=coordinationChanges(sale)[0]
 assert.equal(change.key,'loyalty:main:c');assert.equal(change.initial,5);assert.equal(change.delta,-3.9)
 const restored=coordinationChanges({entityType:'pos_record',payload:{kind:'return',branchId:'main',loyaltyCustomerId:'c',loyaltyRestored:4,loyaltyReversed:0.1,items:[]}})[0]
 assert.equal(restored.delta,3.9)
})


test('sync imports a completed oversold receipt atomically and replay never deducts it twice',async()=>{
 const f=fixture();try{
  f.sqlite.exec(`CREATE TABLE sales(id TEXT PRIMARY KEY,total REAL,payment_method TEXT,payment_reference TEXT,terminal_provider TEXT,staff_id TEXT,staff_name TEXT,created_at TEXT,cash_received REAL,change_given REAL,payment_details TEXT,branch_id TEXT);
  CREATE TABLE sale_items(id TEXT PRIMARY KEY,sale_id TEXT,product_id TEXT,product_name TEXT,quantity REAL,unit_price REAL,unit_cost REAL,batch_allocations TEXT);`)
  event(f,{id:'delivery',delta:3,unitCost:7})
  event(f,{id:'local',delta:-2})
  const db={...f.db,beginTransaction:()=>f.sqlite.exec('BEGIN'),commitTransaction:()=>f.sqlite.exec('COMMIT'),rollbackTransaction:()=>f.sqlite.exec('ROLLBACK')}
  const payload={id:'remote-receipt',branchId:'main',total:20,paymentMethod:'cash',createdAt:'2026-10-03T12:00:00Z',items:[{productId:'milk',quantity:2,price:10,unitCost:7,batchAllocations:[{id:'delivery',quantity:2,unitCost:7}]}]}
  await applySyncedSale(db,payload,{createdAt:payload.createdAt},()=>{})
  await applySyncedSale(db,payload,{createdAt:payload.createdAt},()=>{})
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM sales').get().n,1)
  assert.equal(f.sqlite.prepare('SELECT stock FROM branch_inventory').get().stock,-1)
  assert.equal(f.sqlite.prepare('SELECT unit_cost FROM sale_items').get().unit_cost,7)
 }finally{f.sqlite.close()}
})
