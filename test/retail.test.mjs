import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { migrateRetail, handleRetail, applyRetailRecord } from '../server/retail.mjs'
import { quantity } from '../server/quantities.mjs'

function fixture() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE products(id TEXT PRIMARY KEY,name TEXT,unit TEXT,cost_price REAL);
    CREATE TABLE branch_inventory(branch_id TEXT,product_id TEXT REFERENCES products(id),stock REAL CHECK(stock>=0),updated_at TEXT,PRIMARY KEY(branch_id,product_id));
    CREATE TABLE inventory_movements(id TEXT PRIMARY KEY,product_id TEXT REFERENCES products(id),quantity REAL,reason TEXT,created_at TEXT,branch_id TEXT);
    CREATE TABLE sync_outbox(id TEXT PRIMARY KEY,payload TEXT);
    INSERT INTO products VALUES('milk','Milk','bottle',2);
    INSERT INTO branch_inventory VALUES('main','milk',10,'old');`)
  const db = {
    execute: sql => sqlite.exec(sql), query: (sql, params=[]) => ({ values: sqlite.prepare(sql).all(...params) }),
    run: (sql, params=[]) => sqlite.prepare(sql).run(...params),
    beginTransaction: () => sqlite.exec('BEGIN'), commitTransaction: () => sqlite.exec('COMMIT'), rollbackTransaction: () => sqlite.exec('ROLLBACK')
  }
  const call = input => handleRetail({ db, scope:'business', branchId:'main', user:{id:'owner',name:'Owner',role:'owner'}, method:'POST', input,
    publish: record => db.run('INSERT INTO sync_outbox VALUES(?,?)',[record.id,JSON.stringify(record)]) })
  const stock = () => sqlite.prepare('SELECT stock FROM branch_inventory').get().stock
  return { sqlite, db, call, stock }
}

test('supplier accounts handle paid/unpaid deliveries, opening debt, payments, returns and refunds without changing profit costs', async()=>{
  const f=fixture();try{
    await migrateRetail(f.db)
    await f.call({id:'supplier',kind:'supplier',name:'Supplier'})
    await f.call({id:'opening',kind:'supplier-opening',supplierId:'supplier',amount:100,reference:'Prior debt'})
    await assert.rejects(f.call({id:'opening-again',kind:'supplier-opening',supplierId:'supplier',amount:100,reference:'Prior debt'}),/already/)
    await f.call({id:'invoice',kind:'receipt',supplierId:'supplier',reference:'INV1',amountPaid:10,lines:[{productId:'milk',quantity:10,unitCost:3}]})
    const payment={id:'payment',kind:'supplier-payment',supplierId:'supplier',amount:120,reference:'BANK-1'}
    await f.call(payment);await f.call(payment)
    await f.call({id:'return',kind:'supplier-return',supplierId:'supplier',receiptId:'invoice',reference:'Return',lines:[{productId:'milk',quantity:2}]})
    const get=()=>handleRetail({db:f.db,scope:'business',branchId:'main',user:{role:'owner'},method:'GET'})
    assert.equal((await get()).accounts[0].balance,-6)
    await f.call({id:'refund',kind:'supplier-refund',supplierId:'supplier',amount:6,reference:'Refund received'})
    assert.equal((await get()).accounts[0].balance,0)
    assert.equal(f.stock(),18)
    await assert.rejects(f.call({...payment,id:'negative',amount:-1}),/positive/)
  }finally{f.sqlite.close()}
})

test('additive versioned migration preserves legacy stock and can run twice', async () => {
  const f=fixture(); try {
    await migrateRetail(f.db); await migrateRetail(f.db)
    assert.equal(f.stock(),10)
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n,2)
    assert.equal(f.sqlite.prepare('SELECT cost_price FROM products').get().cost_price,2)
    f.sqlite.exec("INSERT INTO schema_migrations VALUES ('retail',999,'future')")
    await assert.rejects(migrateRetail(f.db),/newer app/)
  } finally { f.sqlite.close() }
})

test('orders, carton deliveries, partial receiving and retries preserve stock and purchase history', async () => {
  const f=fixture(); try {
    await migrateRetail(f.db)
    await f.call({id:'supplier',kind:'supplier',name:'Supplier'})
    await f.call({id:'carton',kind:'conversion',productId:'milk',label:'Carton',factor:24})
    await f.call({id:'order',kind:'order',supplierId:'supplier',reference:'PO-1',lines:[{productId:'milk',quantity:2,conversionId:'carton',unitCost:48}]})
    assert.equal(f.stock(),10)
    const input={id:'receipt',kind:'receipt',supplierId:'supplier',reference:'Delivery-1',orderId:'order',lines:[{productId:'milk',quantity:1,conversionId:'carton',unitCost:60}]}
    const record=await f.call(input)
    await f.call(input)
    assert.equal(f.stock(),34)
    assert.equal(record.lines[0].unitCost,2.5)
    assert.equal(record.lines[0].factor,24)
    assert.equal(f.sqlite.prepare('SELECT cost_price FROM products').get().cost_price,2)
    await assert.rejects(f.call({...input,reference:'Different'}),/already been used/)
    await assert.rejects(f.call({...input,id:'too-much',lines:[{productId:'milk',quantity:2,conversionId:'carton',unitCost:60}]}),/exceeds/)
    assert.equal(f.stock(),34)
    await f.call({...input,id:'second',reference:'Delivery-2'})
    assert.equal(f.stock(),58)
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_movements').get().n,2)
    const supplierReturn={id:'return',kind:'supplier-return',supplierId:'supplier',receiptId:'receipt',reference:'Return-1',lines:[{productId:'milk',quantity:0.5,conversionId:'carton'}]}
    const returned=await f.call(supplierReturn)
    await f.call(supplierReturn)
    assert.equal(f.stock(),46)
    assert.equal(returned.lines[0].unitCost,2.5)
    await assert.rejects(f.call({...supplierReturn,id:'excess-return',lines:[{productId:'milk',quantity:1,conversionId:'carton'}]}),/exceeds/)

  } finally { f.sqlite.close() }
})

test('receiving and outbox roll back together; replay applies once and rejects missing products', async () => {
  const f=fixture(), remote=fixture(); try {
    await migrateRetail(f.db); await migrateRetail(remote.db)
    await f.call({id:'supplier',kind:'supplier',name:'Supplier'})
    const input={id:'receipt',kind:'receipt',supplierId:'supplier',reference:'Delivery',lines:[{productId:'milk',quantity:0.125,unitCost:2}]}
    await assert.rejects(handleRetail({db:f.db,scope:'business',branchId:'main',user:{role:'owner'},method:'POST',input,publish:()=>{throw new Error('outbox failed')}}),/outbox failed/)
    assert.equal(f.stock(),10)
    const record=await f.call(input)
    await remote.db.beginTransaction(); await applyRetailRecord(remote.db,'business',record); await remote.db.commitTransaction()
    assert.equal(remote.stock(),10.125)
    assert.equal(await applyRetailRecord(remote.db,'business',record),false)
    await assert.rejects(applyRetailRecord(remote.db,'business',{...record,id:'missing',lines:[{...record.lines[0],productId:'unknown'}]}),/Synchronize/)
    assert.equal(remote.stock(),10.125)
  } finally { f.sqlite.close(); remote.sqlite.close() }
})

test('fractional wastage is audited, rejects negative stock, and purchasing requires a manager', async () => {
  const f=fixture(); try {
    await migrateRetail(f.db)
    await f.call({id:'waste',kind:'waste',reason:'Damaged',lines:[{productId:'milk',quantity:0.125}]})
    assert.equal(f.stock(),9.875)
    await assert.rejects(f.call({id:'excess',kind:'waste',reason:'Expired',lines:[{productId:'milk',quantity:10}]}),/Insufficient/)
    await assert.rejects(handleRetail({db:f.db,scope:'business',branchId:'main',user:{role:'cashier'},method:'GET'}),/Owner or admin/)
    for(const value of ['',null,Infinity,-1,0.0001]) assert.throws(()=>quantity(value))
    assert.equal(quantity(1.125),1.125)
  } finally { f.sqlite.close() }
})


test('browser SQLite savepoints commit receiving, outbox, and migrations into a reloadable snapshot', async () => {
  const {default:initSqlJs}=await import('sql.js')
  const {readFile}=await import('node:fs/promises')
  const SQL=await initSqlJs({wasmBinary:await readFile('node_modules/sql.js/dist/sql-wasm.wasm')})
  const sqlite=new SQL.Database()
  sqlite.run(`CREATE TABLE products(id TEXT PRIMARY KEY,name TEXT,unit TEXT,cost_price REAL DEFAULT 0);
    CREATE TABLE branch_inventory(branch_id TEXT,product_id TEXT,stock REAL,updated_at TEXT);
    CREATE TABLE inventory_movements(id TEXT PRIMARY KEY,product_id TEXT,quantity REAL,reason TEXT,created_at TEXT,branch_id TEXT);
    CREATE TABLE sync_outbox(id TEXT PRIMARY KEY,payload TEXT);
    INSERT INTO products VALUES('milk','Milk','bottle',2);
    INSERT INTO branch_inventory VALUES('main','milk',10,'');`)
  const db={execute:sql=>sqlite.run(sql),run:(sql,args=[])=>sqlite.run(sql,args),query:(sql,args=[])=>{const stmt=sqlite.prepare(sql);try{stmt.bind(args);const values=[];while(stmt.step())values.push(stmt.getAsObject());return{values}}finally{stmt.free()}},beginTransaction:()=>sqlite.run('SAVEPOINT operation'),commitTransaction:()=>sqlite.run('RELEASE operation'),rollbackTransaction:()=>{sqlite.run('ROLLBACK TO operation');sqlite.run('RELEASE operation')}}
  try {
    await migrateRetail(db)
    sqlite.run('BEGIN')
    const options={db,scope:'business',branchId:'main',user:{id:'owner',role:'owner'},method:'POST',publish:record=>db.run('INSERT INTO sync_outbox VALUES(?,?)',[record.id,JSON.stringify(record)])}
    await handleRetail({...options,input:{id:'supplier',kind:'supplier',name:'Supplier'}})
    await handleRetail({...options,input:{id:'receipt',kind:'receipt',supplierId:'supplier',reference:'Delivery',lines:[{productId:'milk',quantity:1.125,unitCost:2}]}})
    sqlite.run('COMMIT')
    const reloaded=new SQL.Database(sqlite.export())
    try{assert.equal(reloaded.exec('SELECT stock FROM branch_inventory')[0].values[0][0],11.125);assert.equal(reloaded.exec('SELECT COUNT(*) FROM sync_outbox')[0].values[0][0],2)}finally{reloaded.close()}
  } finally {sqlite.close()}
})


test('native SQLite statements participate in the receiving transaction without nested transactions', async () => {
  const f=fixture(); let active=false
  const native={...f.db,
    execute:(sql,transaction=true)=>{if(active && transaction)throw new Error('Already in transaction');return f.db.execute(sql)},
    run:(sql,args=[],transaction=true)=>{if(active && transaction)throw new Error('Already in transaction');return f.db.run(sql,args)},
    beginTransaction:()=>{assert.equal(active,false);f.db.beginTransaction();active=true},
    commitTransaction:()=>{f.db.commitTransaction();active=false},rollbackTransaction:()=>{f.db.rollbackTransaction();active=false}}
  try {
    await migrateRetail(native)
    const options={db:native,scope:'business',branchId:'main',user:{role:'owner'},method:'POST',publish:record=>native.run('INSERT INTO sync_outbox VALUES(?,?)',[record.id,JSON.stringify(record)],false)}
    await handleRetail({...options,input:{id:'supplier',kind:'supplier',name:'Supplier'}})
    await handleRetail({...options,input:{id:'receipt',kind:'receipt',supplierId:'supplier',reference:'Delivery',lines:[{productId:'milk',quantity:1.125,unitCost:2}]}})
    assert.equal(f.stock(),11.125)
    assert.equal(active,false)
  } finally {f.sqlite.close()}
})
