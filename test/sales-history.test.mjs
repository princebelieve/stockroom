import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { salesHistory } from '../server/sales-history.mjs'
import { businessDate, businessDayStart, nextBusinessDate } from '../server/report-timezone.mjs'

test('receipt search finds old sales, isolates business/branch and pages full results',async()=>{
 const sql=new DatabaseSync(':memory:')
 sql.exec('CREATE TABLE sales(id TEXT,total REAL,created_at TEXT,staff_name TEXT,payment_method TEXT,payment_reference TEXT,branch_id TEXT,organization_id TEXT); CREATE TABLE sale_items(sale_id TEXT,product_name TEXT,quantity REAL)')
 const insert=sql.prepare('INSERT INTO sales VALUES(?,?,?,?,?,?,?,?)')
 for(let i=0;i<125;i++)insert.run(`receipt-${i}`,10,new Date(Date.UTC(2026,0,1+i)).toISOString(),'Ada','cash','', 'main','shop')
 sql.prepare('INSERT INTO sale_items VALUES(?,?,?)').run('receipt-0','Rice 100%_special',1)
 insert.run('other-business',10,'2026-01-01T00:00:00Z','Ada','cash','','main','other')
 insert.run('other-branch',10,'2026-01-01T00:00:00Z','Ada','cash','','branch','shop')
 const db={query:async(q,p=[])=>({values:sql.prepare(q).all(...p)})}
 const options={branchId:'main',organizationId:'shop'}
 assert.equal((await salesHistory(db,options)).total,125)
 const oldest=await salesHistory(db,{...options,order:'oldest',pageSize:1})
 assert.equal(oldest.sales[0].id,'receipt-0')
 const newest=await salesHistory(db,{...options,order:'newest',pageSize:1})
 assert.equal(newest.sales[0].id,'receipt-124')
 assert.equal((await salesHistory(db,{...options,order:'oldest; DROP TABLE sales',pageSize:1})).sales[0].id,'receipt-124')
 assert.equal((await salesHistory(db,{...options,page:2})).sales.length,25)
 const found=await salesHistory(db,{...options,query:'100%_special'})
 assert.equal(found.total,1);assert.equal(found.sales[0].id,'receipt-0')
 insert.run('local-midnight',10,'2025-12-31T23:30:00Z','Ada','cash','','main','shop')
 const day=await salesHistory(db,{...options,timeZone:'Africa/Lagos',from:'2026-01-01',to:'2026-01-01'})
 assert.deepEqual(day.sales.map(s=>s.id).sort(),['local-midnight','receipt-0'])
 await assert.rejects(()=>salesHistory(db,{...options,from:'2026-02-01',to:'2026-01-01'}))
 sql.close()
})
test('business calendar boundaries handle daylight saving and date-only expenses',()=>{
 assert.equal(businessDate('2026-01-01T00:30:00Z','America/Los_Angeles'),'2025-12-31')
 assert.equal(businessDate('2026-01-01','America/Los_Angeles'),'2026-01-01')
 const start=businessDayStart('2026-03-08','America/Los_Angeles')
 const end=businessDayStart(nextBusinessDate('2026-03-08'),'America/Los_Angeles')
 assert.equal((Date.parse(end)-Date.parse(start))/3600000,23)
 assert.equal(start,'2026-03-08T08:00:00.000Z')
 assert.throws(()=>businessDayStart('2026-02-30','UTC'))
})
