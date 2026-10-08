import test from 'node:test'
import assert from 'node:assert/strict'
import { hasActiveBranchAccess, isBranchOperation } from '../server/branch-access.mjs'

test('transactions require an active assigned branch while account recovery remains reachable',()=>{
  const staff={id:'staff',role:'cashier'},owner={id:'owner',role:'owner'}
  const branches=[{isActive:true,assignedUserIds:['other']}]
  assert.equal(hasActiveBranchAccess(staff,branches),false)
  assert.equal(hasActiveBranchAccess(owner,branches),true)
  assert.equal(hasActiveBranchAccess(owner,[{isActive:false}]),false)
  assert.equal(hasActiveBranchAccess(staff,[{isActive:1,assignedUserIds:['staff']}]),true)
  assert.equal(hasActiveBranchAccess(staff,[{isActive:0,assignedUserIds:[]}]),false)
  for(const path of ['/api/sales','/api/products','/api/pos/counter','/api/retail','/api/reports?period=month']) assert.equal(isBranchOperation(path),true,path)
  for(const path of ['/api/auth/logout','/api/auth/session','/api/branches','/api/branches/main','/api/settings','/api/health']) assert.equal(isBranchOperation(path),false,path)
})
