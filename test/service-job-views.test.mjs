import test from 'node:test'
import assert from 'node:assert/strict'
import { filterServiceJobs, invoiceStatements } from '../server/service-job-views.mjs'
import { receiptSettings } from '../server/receipts.mjs'
const job=(id,patch={})=>({id,title:'Flyers',customerName:'Ada',customerPhone:'',currency:'NGN',businessName:'Shop',status:'new',dueDate:'2026-10-05',lines:[{description:'Colour copies'}],pricing:{total:100},balance:{netPaid:40,due:60},...patch})
test('job search, overdue work and unpaid invoices distinguish completed and estimated work',()=>{
 const jobs=[job('a'),job('b',{status:'completed',balance:{netPaid:100,due:0}}),job('c',{status:'estimate'})]
 assert.equal(filterServiceJobs(jobs,{status:'overdue',today:'2026-10-06'}).length,1)
 assert.equal(filterServiceJobs(jobs,{status:'unpaid',today:'2026-10-06'}).length,1)
 assert.equal(filterServiceJobs(jobs,{query:'COLOUR',today:'2026-10-06'}).length,3)
})
test('statements separate currencies and unidentified namesakes, and total linked invoice balances',()=>{
 const statements=invoiceStatements([job('a'),job('b'),job('c',{customerId:'customer'}),job('d',{customerId:'customer'}),job('e',{customerId:'customer',currency:'USD'}),job('f',{status:'estimate'})])
 assert.equal(statements.length,4)
 const linked=statements.find(row=>row.jobs.length===2);assert.equal(linked.total,200);assert.equal(linked.netPaid,80);assert.equal(linked.due,120)
})
test('saved service prices validate IDs and decimal precision and preserve historical snapshots',()=>{
 const input={serviceItems:[{id:'flyers',name:'Flyers',price:5.5}]},profile=receiptSettings(input)
 input.serviceItems[0].price=99;assert.equal(profile.serviceItems[0].price,5.5)
 assert.throws(()=>receiptSettings({serviceItems:[{id:'flyers',name:'Flyers',price:0.001}]}),/prices/)
 assert.throws(()=>receiptSettings({serviceItems:[...profile.serviceItems,...profile.serviceItems]}),/unique/)
})
