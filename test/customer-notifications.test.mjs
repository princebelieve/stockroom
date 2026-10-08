import test from 'node:test'
import assert from 'node:assert/strict'
import { ObjectId } from 'mongodb'
import { createNotifications } from '../cloud/notifications.mjs'
test('customer event keys create one notification per recipient even when retried',async()=>{
 const rows=[],recipient=new ObjectId(),empty={createIndex:async()=>{},find:()=>({limit:()=>({toArray:async()=>[]})})}
 const collection={...empty,insertOne:async row=>rows.push(row),updateOne:async(filter,update)=>{if(rows.some(row=>row.recipientKey===filter.recipientKey&&row.dedupeKey===filter.dedupeKey))return {upsertedCount:0};rows.push(update.$setOnInsert);return {upsertedCount:1}}}
 const notifications=await createNotifications({database:{collection:name=>name==='app_notifications'?collection:empty},accounts:{findOne:async()=>({_id:recipient,businessId:'shop'})},visitors:{},verifyToken:()=>null})
 const birthday={title:'Birthday',body:'Ada has a birthday today.',type:'customer-birthday',dedupeKey:'birthday:ada:2026-10-07'}
 await notifications.notifyAccount(recipient.toString(),birthday);await notifications.notifyAccount(recipient.toString(),birthday)
 assert.equal(rows.length,1)
 await notifications.notifyAccount(recipient.toString(),{...birthday,dedupeKey:'birthday:ada:2027-10-07'})
 assert.equal(rows.length,2)
})
