import test from 'node:test'
import assert from 'node:assert/strict'
import { ObjectId } from 'mongodb'
import { DatabaseSync } from 'node:sqlite'
import { createStaffRemoval } from '../cloud/staff-removal.mjs'
import { recordStaffRemoval } from '../server/staff-removal.mjs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function fixture() {
 const staff={_id:new ObjectId(),businessId:'shop',name:'Ada',role:'cashier',username:'ada'}
 const owner={_id:new ObjectId(),businessId:'shop',role:'owner',email:'owner@example.com'}
 const rows=[staff,owner],sessions=[{accountId:staff._id},{accountId:owner._id}],events=[]
 let claims={kind:'access',sub:String(owner._id),businessId:'shop',role:'owner',email:owner.email}
 const matches=(row,q)=>Object.entries(q).every(([k,v])=>v?.$in?v.$in.includes(row[k]):String(row[k])===String(v))
 const api=createStaffRemoval({
  accounts:{findOne:async q=>rows.find(r=>matches(r,q)),updateOne:async(q,u)=>Object.assign(rows.find(r=>matches(r,q)),u.$set)},
  refreshTokens:{deleteMany:async q=>{for(let i=sessions.length-1;i>=0;i--)if(matches(sessions[i],q))sessions.splice(i,1)}},
  operations:{updateOne:async(q,u)=>{if(!events.some(e=>matches(e,q)))events.push(u.$setOnInsert)}},
  verifyToken:()=>claims,ownerPasswordIsValid:async(c,p)=>p==='correct',readJson:async r=>r.body,send:(r,status,data)=>Object.assign(r,{status,data})
 })
 return {api,staff,owner,sessions,events,setClaims:c=>{claims=c},async call(id=String(staff._id),body={confirmation:'REMOVE',ownerPassword:'correct'}) {const response={};assert.equal(await api.handle({method:'POST',url:`/v1/staff/${id}/remove`,body},response),true);return response}}
}
test('owner removal retains staff profile, revokes sessions, blocks tokens and propagates once',async()=>{
 const f=fixture();assert.equal((await f.call()).status,200)
 assert.equal(f.staff.name,'Ada');assert.ok(f.staff.removedAt);assert.equal(f.staff.operationalAccess,false)
 assert.equal(f.sessions.length,1);assert.equal(f.events[0].entityType,'staff_removal')
 const first=f.staff.removedAt;await f.call();assert.equal(f.events.length,1);assert.equal(f.staff.removedAt,first)
 f.setClaims({kind:'access',sub:String(f.staff._id),businessId:'shop',role:'cashier'})
 assert.equal(await f.api.blocked({}),true)
 f.setClaims({kind:'access',username:'ada',businessId:'shop',role:'cashier'})
 assert.equal(await f.api.blocked({}),true)
})
test('staff removal rejects staff, owner targets, wrong business and missing confirmation/password',async()=>{
 const f=fixture()
 for(const role of ['admin','cashier']) {f.setClaims({kind:'access',businessId:'shop',role});assert.equal((await f.call()).status,403)}
 f.setClaims({kind:'access',businessId:'shop',role:'owner'})
 assert.equal((await f.call(String(f.owner._id))).status,404)
 assert.equal((await f.call(String(f.staff._id),{ownerPassword:'wrong',confirmation:'REMOVE'})).status,401)
 assert.equal((await f.call(String(f.staff._id),{ownerPassword:'correct'})).status,401)
 f.setClaims({kind:'access',businessId:'other',role:'owner'})
 assert.equal((await f.call()).status,404);assert.equal(f.events.length,0);assert.equal(f.staff.removedAt,undefined)
})
test('local tombstone preserves attribution, is idempotent and records removal before a profile arrives',async()=>{
 const sqlite=new DatabaseSync(':memory:')
 sqlite.exec("CREATE TABLE users(id TEXT PRIMARY KEY, name TEXT, role TEXT, operational_access INTEGER); CREATE TABLE sales(id TEXT,staff_id TEXT,total REAL); INSERT INTO users VALUES('staff','Ada','cashier',1),('owner','Owner','owner',1); INSERT INTO sales VALUES('sale','staff',50)")
 const db={run:async(sql,params=[])=>sqlite.prepare(sql).run(...params)}
 await recordStaffRemoval(db,'staff','2026-10-06');await recordStaffRemoval(db,'staff','2026-10-07')
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM staff_removals').get().n,1)
 assert.equal(sqlite.prepare('SELECT name FROM users WHERE id=?').get('staff').name,'Ada')
 assert.equal(sqlite.prepare('SELECT total FROM sales').get().total,50)
 assert.equal(sqlite.prepare('SELECT id FROM users WHERE id NOT IN (SELECT id FROM staff_removals)').all().length,1)
 await recordStaffRemoval(db,'future','2026-10-06')
 assert.ok(sqlite.prepare('SELECT id FROM staff_removals WHERE id=?').get('future'));sqlite.close()
})

test('desktop synchronized removal revokes offline sign-in/session and preserves activity attribution',async()=>{
 const data=await mkdtemp(join(tmpdir(),'stockroom-staff-removal-'))
 try {
  const script=`
   import assert from 'node:assert/strict';
   import * as db from './server/db.mjs';
   const member=db.createUser({name:'Ada',username:'ada',role:'cashier',password:'valid-password'});
   const session=db.createSession(member.id);
   assert.ok(db.authenticateUser('ada','valid-password'));
   db.createExpense({category:'Travel',description:'Delivery',amount:10,incurredAt:new Date().toISOString()},'main',member);
   db.applyRemoteOperations([{operationId:'removal',entityType:'staff_removal',entityId:member.id,action:'remove',payload:{id:member.id,removedAt:new Date().toISOString()}}]);
   assert.equal(db.sessionUser(session),null);
   assert.equal(db.authenticateUser('ada','valid-password'),null);
   assert.equal(db.listUsers().some(u=>u.id===member.id),false);
   db.cacheCloudUsers([{...member,removedAt:null}]);
   assert.equal(db.authenticateUser('ada','valid-password'),null);
   const history=db.getStaffActivity('main','2000-01-01','2100-01-01');
   assert.equal(history.staff.find(u=>u.staffId===member.id).role,'cashier');
   assert.equal(history.staff.find(u=>u.staffId===member.id).expensesTotal,10);
   db.database.close();`
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,STOCKROOM_DATA_DIR:data},encoding:'utf8'})
  assert.equal(result.status,0,result.stderr)
 } finally {await rm(data,{recursive:true,force:true})}
})
