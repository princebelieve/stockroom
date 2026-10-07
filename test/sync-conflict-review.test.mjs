import test from 'node:test'
import assert from 'node:assert/strict'
import {conflictReview} from '../server/sync-conflict-review.mjs'
test('conflict outcome requires manager, explicit check and meaningful explanation',()=>{
 const user={id:'owner',role:'owner'},input={action:'corrected',confirmed:true,note:'Stock count SC-15 approved after checking both devices.'}
 assert.equal(conflictReview(input,user).reviewerId,'owner')
 assert.throws(()=>conflictReview(input,{...user,role:'cashier'}),/access/)
 assert.throws(()=>conflictReview({...input,confirmed:false},user),/Inspect/)
 assert.throws(()=>conflictReview({...input,note:'ok'},user),/Inspect/)
 assert.throws(()=>conflictReview({...input,action:'overwrite-sale'},user),/Inspect/)
})
