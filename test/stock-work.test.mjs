import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { stockSchema } from '../server/stock-ledger.mjs'
import { handlePos, applyPosRecord, savePosRecord, ensurePos } from '../server/pos-service.mjs'
import { applyStockWorkSync, validateStockWork, requiresStockWorkSync } from '../server/stock-work.mjs'
import { buildReports } from '../server/reports.mjs'
import { coordinationChanges } from '../cloud/supermarket-coordination.mjs'

function fixture() {
  const sql=new DatabaseSync(':memory:')
  sql.exec(`${stockSchema}
    CREATE TABLE products(id TEXT PRIMARY KEY,name TEXT,unit TEXT,cost_price REAL);
    INSERT INTO products VALUES('paper','Paper','sheet',0.1),('flour','Flour','kg',4),('bread','Bread','piece',0);
    CREATE TABLE branch_inventory(branch_id TEXT,product_id TEXT,stock REAL,updated_at TEXT,PRIMARY KEY(branch_id,product_id));
    INSERT INTO branch_inventory VALUES('main','paper',1000,'now'),('main','flour',10,'now'),('main','bread',0,'now');
    CREATE TABLE inventory_movements(id TEXT PRIMARY KEY,product_id TEXT,quantity REAL,reason TEXT,created_at TEXT,branch_id TEXT);
    CREATE TABLE outbox(id TEXT PRIMARY KEY,payload TEXT);`)
  const db={query:(s,p=[])=>({values:sql.prepare(s).all(...p)}),run:(s,p=[])=>sql.prepare(s).run(...p),beginTransaction:()=>sql.exec('BEGIN'),commitTransaction:()=>sql.exec('COMMIT'),rollbackTransaction:()=>sql.exec('ROLLBACK')}
  const options={db,scope:'business',branchId:'main',tillId:'till',user:{id:'owner',name:'Owner',role:'owner'},sales:()=>[],publish:record=>db.run('INSERT INTO outbox VALUES(?,?)',[record.id,JSON.stringify(record)])}
  const call=(input,extra={})=>handlePos({...options,...extra,path:'/api/pos/stock-work',method:input?'POST':'GET',input:input||{}})
  const stock=id=>sql.prepare('SELECT stock FROM branch_inventory WHERE product_id=?').get(id).stock
  return {sql,db,call,stock}
}
const batch={id:'stock-work:batch001',kind:'food-production',note:'Morning bake',ingredients:[{productId:'flour',quantity:2}],outputProductId:'bread',outputQuantity:8,expectedQuantity:10,expiry:'2099-01-01'}

test('production consumes once, captures actual yield cost, retains expiry and rolls back failures',async()=>{
  const f=fixture();try {
    const record=await f.call(batch)
    assert.equal(f.stock('flour'),8);assert.equal(f.stock('bread'),8)
    assert.equal(record.totalCost,8);assert.equal(record.output.unitCost,1)
    const lot=f.sql.prepare("SELECT * FROM stock_batches WHERE product_id='bread'").get()
    assert.equal(lot.expiry,'2099-01-01');assert.equal(lot.unit_cost,1)
    await f.call(batch);assert.equal(f.stock('bread'),8)
    await assert.rejects(f.call({...batch,outputQuantity:10}),/different details/)
    await assert.rejects(f.call({...batch,id:'stock-work:badbatch',outputProductId:'flour'}),/separate/)
    assert.equal(f.stock('flour'),8)
    await assert.rejects(f.call({...batch,id:'stock-work:no-stock',ingredients:[{productId:'flour',quantity:20}]}),/Not enough/)
    await assert.rejects(f.call({...batch,id:'stock-work:failed-publish'},{publish:()=>{throw new Error('outbox failed')}}),/outbox/)
    assert.equal(f.stock('flour'),8);assert.equal(f.stock('bread'),8)
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM outbox').get().n,1)
    await assert.rejects(f.call({...batch,id:'stock-work:cashier'},{user:{id:'staff',name:'Staff',role:'cashier'}}),/Owner or admin/)
    assert.deepEqual(coordinationChanges({entityType:'pos_record',payload:record}).map(row=>row.delta),[-2,8])
  }finally{f.sql.close()}
})

test('synced production applies captured cost once in both SQLite adapters and rejects overwritten stock work',async()=>{
  const source=fixture(),remote=fixture(),sync=fixture();try{
    const record=await source.call(batch)
    await ensurePos(remote.db)
    await applyPosRecord(remote.db,'business',record);await applyPosRecord(remote.db,'business',record)
    applyStockWorkSync(sync.db,record);applyStockWorkSync(sync.db,record)
    for(const f of [remote,sync]){assert.equal(f.stock('flour'),8);assert.equal(f.stock('bread'),8);assert.equal(f.sql.prepare("SELECT unit_cost FROM stock_batches WHERE product_id='bread'").get().unit_cost,1)}
    await assert.rejects(applyPosRecord(remote.db,'business',{...record,note:'Changed'}),/request|permanent/)
    assert.throws(()=>validateStockWork({...record,output:{...record.output,unitCost:0.1}}),/output cost/)
    assert.throws(()=>validateStockWork({...record,ingredients:[{...record.ingredients[0],unitCost:1}]}),/match its batches/)
    assert.equal(requiresStockWorkSync({entityType:'pos_record',payload:record}),true)
  }finally{source.sql.close();remote.sql.close();sync.sql.close()}
})

test('service material usage links original job and till, persists after refunds and affects profit once',async()=>{
  const f=fixture();try{
    const job={id:'service-job:flyers',kind:'service-job',branchId:'main',tillId:'till',title:'Print flyers',status:'in-progress',updatedAt:new Date().toISOString()}
    await savePosRecord(f.db,'business',job)
    const input={id:'stock-work:materials001',kind:'service-materials',jobId:job.id,note:'Flyers plus spoilage',ingredients:[{productId:'paper',quantity:220}]}
    const used=await f.call(input);assert.equal(used.totalCost,22);assert.equal(f.stock('paper'),780)
    await f.call(input);assert.equal(f.stock('paper'),780)
    await assert.rejects(f.call({...input,id:'stock-work:wrong-till'},{tillId:'other'}),/original till/)
    const adjustments=f.sql.prepare('SELECT payload FROM stock_events').all().map(row=>JSON.parse(row.payload))
    const data={sales:[{id:'deposit',total:30,createdAt:used.updatedAt}],items:[],products:[],expenses:[],adjustments,returns:[{saleId:'deposit',total:10,updatedAt:used.updatedAt,items:[]}]}
    const report=buildReports(data,new Date(used.updatedAt))
    assert.equal(report.profit.materialCost,22);assert.equal(report.profit.cost,22);assert.equal(report.profit.amount,-2)
    assert.throws(()=>validateStockWork(used,undefined,{...job,tillId:'other'}),/original till/)
    await savePosRecord(f.db,'business',{...job,status:'cancelled',updatedAt:new Date(Date.now()+10).toISOString()})
    await assert.rejects(f.call({...input,id:'stock-work:cancelled'}),/issued job/)
    assert.equal(f.stock('paper'),780)
  }finally{f.sql.close()}
})

test('production input cost stays in finished stock until sold, and uncaptured material costs warn',async()=>{
  const f=fixture();try{
    const record=await f.call(batch)
    const adjustments=f.sql.prepare('SELECT payload FROM stock_events').all().map(row=>JSON.parse(row.payload))
    const base={sales:[],items:[],products:[],expenses:[],adjustments}
    assert.equal(buildReports(base,new Date(record.updatedAt)).profit.cost,0)
    const sold=buildReports({...base,sales:[{id:'sale',total:6,createdAt:record.updatedAt}],items:[{saleId:'sale',productId:'bread',quantity:2,unitCost:record.output.unitCost}]},new Date(record.updatedAt))
    assert.equal(sold.profit.cost,2);assert.equal(sold.profit.amount,4)
    const warning=buildReports({...base,adjustments:[{category:'service-materials',delta:-1,unitCost:0,createdAt:record.updatedAt}]},new Date(record.updatedAt))
    assert.equal(warning.costWarnings.uncostedMaterials,1);assert.equal(warning.costWarnings.incomplete,true)
  }finally{f.sql.close()}
})
