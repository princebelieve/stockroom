import test from 'node:test'
import assert from 'node:assert/strict'
import { nextSettingsTimestamp } from '../server/settings-sync.mjs'
import { identicalSettings, isNewerMutableOperation } from '../cloud/conflict-policy.mjs'

test('rapid settings saves advance even when the device clock repeats or moves back',()=>{
  const clock=Date.parse('2026-10-08T12:00:00.000Z')
  const first=nextSettingsTimestamp('',clock)
  const second=nextSettingsTimestamp(first,clock)
  const third=nextSettingsTimestamp(second,clock-10000)
  assert.ok(second>first);assert.ok(third>second)
})
test('same-device settings timestamp collision is accepted; another device still conflicts',()=>{
  const head={deviceId:'till',updatedAt:'2026-10-08T12:00:00.000Z',payload:{appName:'Shop'}}
  const operation={deviceId:'till',entityType:'settings',payload:{updatedAt:head.updatedAt,appName:'New shop'}}
  assert.equal(isNewerMutableOperation(operation,head),true)
  assert.equal(isNewerMutableOperation({...operation,deviceId:'other'},head),false)
  assert.equal(isNewerMutableOperation({...operation,entityType:'product'},head),false)
})
test('unchanged settings snapshots can be acknowledged without hiding different settings',()=>{
  const incoming={entityType:'settings',payload:{appName:'Shop',updatedAt:'old',paymentPolicy:{allowWallet:true}}}
  const head={payload:{paymentPolicy:{allowWallet:true},appName:'Shop',updatedAt:'new'}}
  assert.equal(identicalSettings(incoming,head),true)
  assert.equal(identicalSettings({...incoming,payload:{...incoming.payload,appName:'Different'}},head),false)
  assert.equal(identicalSettings({...incoming,entityType:'product'},head),false)
})
