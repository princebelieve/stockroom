import test from 'node:test'
import assert from 'node:assert/strict'
import { canRequest,hasPermission,parsePermissions,staffCapabilities } from '../server/staff-permissions.mjs'
import { catalogueStarters,missingStarters } from '../server/catalogue-starters.mjs'
import { businessModes } from '../server/shop-profile.mjs'
test('individual permissions deny other workspaces and owner-only actions, including restricted admins',()=>{
 for(const role of ['cashier','admin']){
  const user={role,operationalAccess:true,permissions:{counter:true}}
  assert.equal(canRequest(user,'/api/pos/counter/orders','POST'),true)
  for(const [path,method,input] of [['/api/products','POST',{}],['/api/retail','POST',{}],['/api/pos/restaurant','GET',{}],['/api/pos/service-jobs/pay','POST',{}],['/api/reports','GET',{}],['/api/users/a/permissions','PUT',{}],['/api/pos/returns','POST',{}],['/api/sales','POST',{items:[{productId:'rice'}]}]])assert.equal(canRequest(user,path,method,input),false,path)
  assert.equal(canRequest(user,'/api/sales','POST',{items:[{productId:'service:x'}]}),false)
 }
 assert.equal(canRequest({role:'cashier',permissions:{payments:true}},'/api/sales','POST',{items:[{productId:'service:x'}]}),true)
 assert.equal(canRequest({role:'owner',permissions:{}},'/api/users/a/permissions','PUT'),true)
 assert.equal(hasPermission({role:'cashier',permissions:{inventory:true}},'purchasing'),false)
 assert.throws(()=>parsePermissions({constructor:true}),/Invalid/)
 assert.throws(()=>parsePermissions({inventory:'yes'}),/Invalid/)
 assert.equal(canRequest({role:'cashier',permissions:{counter:true}},'/api/sales','POST',{paymentDetails:{counterOrder:{id:'order'}},items:[{productId:'service:counter:rice'}]}),true)
 assert.equal(canRequest({role:'cashier',permissions:{counter:true}},'/api/pos/counter/status','POST',{status:'preparing'}),false)
 assert.equal(Object.keys(staffCapabilities).length,19)
})
test('catalogue starters cover every stock industry and never replace saved names',()=>{
 for(const industry of Object.keys(businessModes))assert.ok(catalogueStarters('stock',industry).length,industry)
 for(const kind of ['service','counter','restaurant','bar'])assert.ok(catalogueStarters(kind).length)
 const saved=[{id:'existing',name:'  RICE ',price:99,stock:20}];const original=structuredClone(saved)
 assert.ok(!missingStarters(catalogueStarters('stock'),saved).some(row=>row.name==='Rice'))
 assert.deepEqual(saved,original)
 assert.ok(catalogueStarters('stock','liquids').every(row=>row.unit==='litre'))
})
