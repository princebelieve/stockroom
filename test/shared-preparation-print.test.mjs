import test from 'node:test'
import assert from 'node:assert/strict'
import { preparationTickets, createPreparationPrint } from '../cloud/preparation-print.mjs'
function matches(row,query){return Object.entries(query).every(([key,value])=>{const actual=key.split('.').reduce((x,k)=>x?.[k],row);if(value&&typeof value==='object')return Object.entries(value).every(([op,v])=>op==='$in'?v.includes(actual):op==='$gte'?actual>=v:false);return actual===value})}
function fixture(){
 const stores=new Map();const collection=name=>{if(!stores.has(name))stores.set(name,[]);const rows=stores.get(name);return {rows,findOne:async q=>structuredClone(rows.find(r=>matches(r,q))||null),find:q=>{let result=rows.filter(r=>matches(r,q));const cursor={sort:()=>cursor,limit:n=>{result=result.slice(0,n);return cursor},toArray:async()=>structuredClone(result)};return cursor},updateOne:async(q,u,options={})=>{let row=rows.find(r=>matches(r,q));if(!row){if(!options.upsert)return {modifiedCount:0};row={...q,...u.$setOnInsert};rows.push(row)}Object.assign(row,u.$set);return {modifiedCount:1}}}}
 let claims={kind:'access',role:'owner',businessId:'shop'}
 const devices=collection('devices');devices.rows.push({businessId:'shop',deviceId:'printer'},{businessId:'shop',deviceId:'phone'})
 const heads=collection('heads'),api=createPreparationPrint({database:{collection},devices,entityHeads:heads,verifyToken:()=>claims,ownerIsActive:async()=>true,readJson:async r=>r.input,send:(res,status,data)=>Object.assign(res,{status,data})})
 const call=async(action,input,method=input?'POST':'GET')=>{const response={};await api.handle({url:'/v1/preparation-print/'+action+'?branchId=main',method,input},response);return response}
 return {call,heads,collection,claims:value=>claims=value}
}
test('shared queue separates stations and deduplicates preparation status changes',()=>{
 const order={id:'order',createdAt:'2026-10-06T10:00:00Z',updatedAt:'2026-10-06T11:00:00Z',events:[{action:'create',at:'2026-10-06T10:00:00Z'}],lines:[{name:'Meal',station:'kitchen'},{name:'Drink',station:'bar'}]}
 const tickets=preparationTickets(order);assert.equal(tickets.length,2);assert.equal(tickets[0].order.lines.length,1)
 assert.equal(preparationTickets({...order,status:'ready',updatedAt:'later'})[0].id,tickets[0].id)
 assert.notEqual(preparationTickets({...order,status:'cancelled'})[0].id,tickets[0].id)
 assert.equal(preparationTickets({...order,source:'customer-portal'}).length,0)
})
test('phone cannot consume tickets; only one claim succeeds and uncertain printing needs explicit retry',async()=>{
 const f=fixture();assert.equal((await f.call('configure',{deviceId:'printer',branchId:'main',enabled:true})).status,200)
 const now=new Date(Date.now()+1000).toISOString()
 f.heads.rows.push({businessId:'shop',entityType:'pos_record',updatedAt:now,payload:{id:'order',kind:'counter-order',branchId:'main',createdAt:now,updatedAt:now,events:[{action:'create',at:now}],lines:[{station:'kitchen',name:'Meal'}]}})
 f.claims({kind:'device',businessId:'shop',deviceId:'phone'});assert.equal((await f.call('jobs')).data.shared,true);assert.equal((await f.call('jobs')).data.jobs.length,0)
 f.claims({kind:'device',businessId:'shop',deviceId:'printer'});const id=(await f.call('jobs')).data.jobs[0].id
 const claims=await Promise.all([f.call('claim',{id}),f.call('claim',{id})]);assert.equal(claims.filter(r=>r.data.claimed).length,1)
 assert.equal((await f.call('jobs')).data.jobs[0].state,'printing')
 assert.equal((await f.call('retry',{id})).status,400)
 assert.equal((await f.call('retry',{id,confirmDuplicateRisk:true})).status,400)
 f.collection('preparation_print_jobs').rows[0].claimedAt=new Date(Date.now()-61000).toISOString()
 await f.call('retry',{id,confirmDuplicateRisk:true});const retried=(await f.call('claim',{id})).data;assert.equal(retried.claimed,true)
 const oldAttempt=claims.find(r=>r.data.claimed).data.attemptId
 assert.equal((await f.call('result',{id,attemptId:oldAttempt})).data.saved,false)
 await f.call('result',{id,attemptId:retried.attemptId});assert.equal((await f.call('jobs')).data.jobs.length,0)
 f.claims({kind:'device',businessId:'other',deviceId:'printer'});assert.equal((await f.call('jobs')).status,400)
})

test('corrections cancel a removed station and replace pending stale tickets',async()=>{
 const f=fixture();await f.call('configure',{deviceId:'printer',branchId:'main',enabled:true})
 const first=new Date(Date.now()+1000).toISOString(),second=new Date(Date.now()+2000).toISOString()
 const head={businessId:'shop',entityType:'pos_record',updatedAt:first,payload:{id:'order',kind:'counter-order',branchId:'main',createdAt:first,updatedAt:first,events:[{action:'create',at:first}],lines:[{station:'kitchen',name:'Meal'},{station:'bar',name:'Drink'}]}};f.heads.rows.push(head)
 f.claims({kind:'device',businessId:'shop',deviceId:'printer'});assert.equal((await f.call('jobs')).data.jobs.length,2)
 head.updatedAt=second;head.payload.updatedAt=second;head.payload.events.push({action:'edit',at:second});head.payload.lines=head.payload.lines.slice(0,1)
 const jobs=(await f.call('jobs')).data.jobs;assert.equal(jobs.length,2);assert.match(jobs.find(job=>job.station==='bar').order.note,/CANCEL/);assert.match(jobs.find(job=>job.station==='kitchen').order.note,/CORRECTION/)
 const originals=f.collection('preparation_print_jobs').rows.filter(job=>job.revision===first);assert.ok(originals.every(job=>job.state==='superseded'))
 f.collection('devices').rows[0].revokedAt=new Date();assert.equal((await f.call('jobs')).status,400)
 f.claims({kind:'access',role:'cashier',businessId:'shop'});assert.equal((await f.call('configure',{deviceId:'printer',branchId:'main',enabled:true})).status,400)
})
