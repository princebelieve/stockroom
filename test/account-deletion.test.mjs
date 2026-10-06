import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { ObjectId } from 'mongodb'
import { createAccountDeletion } from '../cloud/account-deletion.mjs'

const equal = (a,b) => String(a) === String(b)
function matches(row, query) {
  return Object.entries(query).every(([key,value]) => {
    if (key === '$or') return value.some(part => matches(row,part))
    const actual=row[key]
    if(value && typeof value==='object' && !(value instanceof Date) && !(value instanceof ObjectId)) return Object.entries(value).every(([op,wanted]) =>
      op==='$in'?wanted.some(v=>equal(actual,v)):op==='$ne'?!equal(actual,wanted):op==='$gt'?actual>wanted:op==='$lt'?actual<wanted:op==='$lte'?actual<=wanted:op==='$regex'?new RegExp(wanted).test(actual):false)
    return value===null ? actual==null : equal(actual,value)
  })
}
function fixture(role='owner') {
  const stores=new Map()
  const collection=name=>{
    if(!stores.has(name))stores.set(name,[])
    const rows=stores.get(name)
    const change=(row,update)=>{Object.assign(row,update.$set||{});for(const key of Object.keys(update.$unset||{}))delete row[key]}
    return { rows, findOne:async q=>{const row=rows.find(r=>matches(r,q));return row?{...row}:null},
      find:q=>({project(){return this},limit(){return this},toArray:async()=>rows.filter(r=>matches(r,q))}),
      insertOne:async r=>{rows.push({...r});return{insertedId:r._id}},
      updateOne:async(q,u)=>{const row=rows.find(r=>matches(r,q));if(row)change(row,u);return{modifiedCount:row?1:0}},
      updateMany:async(q,u)=>{rows.filter(r=>matches(r,q)).forEach(r=>change(r,u))},
      deleteMany:async q=>{for(let i=rows.length-1;i>=0;i--)if(matches(rows[i],q))rows.splice(i,1)},
      deleteOne:async q=>{const i=rows.findIndex(r=>matches(r,q));if(i>=0)rows.splice(i,1)} }
  }
  const account={_id:new ObjectId(),businessId:'shop',role,email:`${role}@shop.test`}
  collection('accounts').rows.push(account,{_id:new ObjectId(),businessId:'other',role:'owner'})
  collection('devices').rows.push({businessId:'shop',deviceId:'till',revokedAt:null})
  collection('referral_visitors').rows.push({_id:'visitor'})
  let claims={kind:'access',sub:String(account._id),businessId:'shop',role,email:account.email}
  const api=createAccountDeletion({database:{collection},accounts:collection('accounts'),devices:collection('devices'),refreshTokens:collection('auth_refresh_tokens'),visitors:collection('referral_visitors'),verifyToken:()=>claims,graceDays:async()=>14})
  return {api,collection,account,setClaims:value=>{claims=value},async call(method='GET',body){
    const request=Readable.from(body===undefined?[]:[typeof body==='string'?body:JSON.stringify(body)]);request.url='/v1/account-deletion/me';request.method=method
    let status,data;const response={setHeader(){},writeHead:s=>{status=s},end:s=>{data=JSON.parse(s)}}
    assert.equal(await api.handle(request,response),true);return{status,data}
  }}
}

for(const role of ['owner'])test(`${role} closure uses real JSON and preserves scope on request/cancel`,async()=>{
  const f=fixture(role)
  assert.equal((await f.call()).data.graceDays,14)
  assert.equal((await f.call('POST',{action:'request',confirmation:'wrong'})).status,400)
  const saved=await f.call('POST',{action:'request',confirmation:'DELETE'})
  assert.equal(saved.status,201);assert.equal(saved.data.scope,role==='owner'?'business':'account')
  assert.equal((await f.call('POST',{action:'request',confirmation:'DELETE'})).status,409)
  assert.equal(Boolean(f.collection('devices').rows[0].revokedAt),role==='owner')
  assert.ok(await f.api.blocked({url:'/v1/sync/pull'}))
  assert.equal(await f.api.blocked({url:'/v1/auth/refresh'}),null)
  assert.equal((await f.call('POST',{action:'cancel'})).status,200)
  assert.equal(await f.api.blocked({url:'/v1/sync/pull'}),null)
  assert.equal(f.collection('devices').rows[0].revokedAt,role==='owner'?undefined:null)
})

test('malformed and non-object requests are rejected without scheduling deletion',async()=>{
 const f=fixture();for(const body of ['{','null','[]'])assert.equal((await f.call('POST',body)).status,400)
 assert.equal(f.collection('account_deletion_requests').rows.length,0)
})

test('visitor request/cancel affects only promoter identity',async()=>{
 const f=fixture();f.setClaims({kind:'visitor',visitorId:'visitor'})
 assert.equal((await f.call('POST',{action:'request',confirmation:'DELETE'})).data.scope,'visitor')
 assert.equal(f.collection('devices').rows[0].revokedAt,null)
 assert.equal((await f.call('POST',{action:'cancel'})).status,200)
})

test('business closure blocks staff and devices but preserves cancellation access',async()=>{
 const f=fixture();await f.call('POST',{action:'request',confirmation:'DELETE'})
 const staff={_id:new ObjectId(),businessId:'shop',role:'cashier',username:'cashier'};f.collection('accounts').rows.push(staff)
 f.setClaims({kind:'access',sub:String(staff._id),businessId:'shop',role:'cashier'})
 assert.ok(await f.api.blocked({url:'/v1/notifications/me'}))
 f.setClaims({kind:'device',businessId:'shop'})
 assert.ok(await f.api.blocked({url:'/v1/sync/pull'}))
 f.setClaims({kind:'customer',businessId:'shop',customerId:'guest-session',guest:true})
 assert.ok(await f.api.blocked({url:'/v1/customer-portal/orders'}))
})

for(const role of ['owner','visitor'])test(`${role} scheduled cleanup preserves unrelated records`,async()=>{
 const f=fixture(role==='visitor'?'owner':role);if(role==='visitor')f.setClaims({kind:'visitor',visitorId:'visitor'})
 await f.call('POST',{action:'request',confirmation:'DELETE'})
 const key=role==='visitor'?'visitor:visitor':`account:${f.account._id}`
 for(const name of ['app_notifications','push_subscriptions','fcm_push_subscriptions'])f.collection(name).rows.push({recipientKey:key},{recipientKey:'account:other'})
 f.collection('business_settings').rows.push({businessId:'shop'},{businessId:'other'})
 f.collection('customer_portal_accounts').rows.push({businessId:'shop'},{businessId:'other'})
 f.collection('supermarket_admissions').rows.push({_id:'shop:operation'},{_id:'other:operation'})
 f.collection('account_deletion_requests').rows[0].scheduledFor=new Date(0)
 await f.api.processDue()
 assert.equal(f.collection('account_deletion_requests').rows[0].status,'completed')
 assert.equal(f.collection('app_notifications').rows.length,1)
 assert.ok(f.collection('accounts').rows.some(r=>r.businessId==='other'))
 assert.equal(f.collection('business_settings').rows.some(r=>r.businessId==='shop'),role!=='owner')
 assert.equal(f.collection('customer_portal_accounts').rows.some(r=>r.businessId==='shop'),role!=='owner')
 assert.ok(f.collection('customer_portal_accounts').rows.some(r=>r.businessId==='other'))
 assert.equal(f.collection('supermarket_admissions').rows.some(r=>r._id==='shop:operation'),role!=='owner')
})


test('account navigation is restricted to owners', async () => {
  const { readFile } = await import('node:fs/promises')
  const { stripTypeScriptTypes } = await import('node:module')
  const { runInNewContext } = await import('node:vm')
  const source = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')
  const start = source.indexOf('const navigableScreens =')
  const end = source.indexOf('function preferredScreen', start)
  const code = stripTypeScriptTypes(source.slice(start,end), { mode: 'strip' })
  for (const role of ['owner', 'admin', 'cashier']) {
    assert.equal(runInNewContext(code + "; screenAllowedForUser('Account', user)", { user: { role, operationalAccess: false }, isBrowserPwa:()=>false, isNativeMobile:()=>false }), role === 'owner')
  }
})

for (const role of ['admin','cashier']) test(`${role} cannot inspect, request or cancel account deletion`, async()=>{
 const f=fixture(role)
 for(const action of [undefined,'request','cancel']) {
  const result=action ? await f.call('POST',{action,confirmation:'DELETE'}) : await f.call()
  assert.equal(result.status,403)
 }
 assert.equal(f.collection('account_deletion_requests').rows.length,0)
})
