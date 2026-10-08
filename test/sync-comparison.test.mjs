import test from 'node:test'
import assert from 'node:assert/strict'
import { syncComparison } from '../server/sync-comparison.mjs'
const raw=value=>JSON.stringify(value)
test('matching business settings ignore timestamps and property order',()=>{
  const result=syncComparison(raw({appName:'Shop',currency:'NGN',logoData:'data:image/png;base64,AAAA',updatedAt:'old'}),raw({updatedAt:'new',logoData:'data:image/png;base64,AAAA',currency:'NGN',appName:'Shop'}))
  assert.equal(result.matching,true);assert.deepEqual(result.rows,[])
})
test('business changes have readable labels and no raw logo or private values',()=>{
  const result=syncComparison(raw({currency:'NGN',logoData:'data:image/png;base64,AAAA',password:'private-old',paymentPolicy:{allowWallet:true}}),raw({currency:'USD',logoData:'data:image/png;base64,BBBB',password:'private-new',paymentPolicy:{allowWallet:false}}))
  assert.equal(result.matching,false)
  assert.ok(result.rows.some(row=>row.label==='Currency'&&row.local==='NGN'&&row.remote==='USD'))
  assert.ok(result.rows.some(row=>row.local==='Enabled'&&row.remote==='Disabled'))
  assert.ok(result.rows.every(row=>!row.local.includes('base64')&&!row.remote.includes('private-')))
  assert.equal(result.rows.find(row=>row.logo).localLogo,'data:image/png;base64,AAAA')
})
test('unavailable or truncated records never appear as matching settings',()=>{
  assert.equal(syncComparison('{"logoData":"truncated','{}').available,false)
  assert.equal(syncComparison(undefined,'{}').matching,false)
})
