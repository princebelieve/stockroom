import test from 'node:test'
import assert from 'node:assert/strict'
import { supportRequest, submitSupportRequest } from '../cloud/support-requests.mjs'
const input={id:'ticket-12345678',name:'Ada',email:'ada@example.test',subject:'Printer issue',message:'The receipt printer stopped.'}
const identity={businessId:'shop',deviceId:'till'}
function fixture() {
  let saved, leased=false
  return {findOne:async()=>saved, countDocuments:async()=>0, insertOne:async row=>{saved=structuredClone(row)},findOneAndUpdate:async()=>{if(leased)return null;leased=true;return saved},updateOne:async(_,update)=>{Object.assign(saved,update.$set);if(update.$unset?.sendingAt!==undefined){delete saved.sendingAt;leased=false}}}
}
test('support references bind retries to one business and reject unsafe contact headers',()=>{
 assert.equal(supportRequest(input,identity)._id,'shop:ticket-12345678')
 assert.throws(()=>supportRequest({...input,email:'ada@example.test\r\nBcc: other@example.test'},identity),/valid contact/)
 assert.throws(()=>supportRequest({...input,message:'x'.repeat(5001)},identity),/message/)
})
test('support email failure retains the reference and successful retries do not resend',async()=>{
 const collection=fixture();let calls=0
 const sendMail=async()=>{calls++;if(calls===1)throw new Error('Offline');return {messageId:'gmail-message',threadId:'gmail-thread'}}
 await assert.rejects(submitSupportRequest({collection,input,identity,sendMail}),/saved/)
 assert.equal((await submitSupportRequest({collection,input,identity,sendMail})).sent,true)
 assert.equal((await submitSupportRequest({collection,input,identity,sendMail})).sent,true)
 assert.equal(calls,2)
 await assert.rejects(submitSupportRequest({collection,input:{...input,message:'Changed'},identity,sendMail}),/different details/)
})
