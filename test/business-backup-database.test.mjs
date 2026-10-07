import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backupSnapshot, restoreSnapshot } from '../server/business-backup.mjs'
test('real database restore retains changed owner credentials and removed staff tombstones',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'stockroom-restore-test-'));process.env.STOCKROOM_DATA_DIR=folder
 const db=await import('../server/db.mjs')
 try{
 await db.createOwnerSetup({ownerName:'Owner',email:'owner@shop.test',password:'owner-password-123',appName:'Shop'})
 const user=db.authenticateUser('owner@shop.test','owner-password-123')
 const identity={businessId:'shop',tillId:'till'},snapshot=backupSnapshot(db.database,identity)
 db.changePassword(user.id,'owner-password-123','changed-owner-password')
 db.database.prepare("INSERT INTO staff_removals VALUES ('staff-removed','2026-10-06')").run()
 db.database.prepare("UPDATE branches SET assigned_user_ids='[\"owner-only\"]' WHERE id='main'").run()
 restoreSnapshot(db.database,snapshot,identity)
 assert.ok(db.authenticateUser('owner@shop.test','changed-owner-password'))
 assert.equal(db.database.prepare('SELECT count(*) AS count FROM staff_removals').get().count,1)
 assert.equal(db.database.prepare("SELECT assigned_user_ids FROM branches WHERE id='main'").get().assigned_user_ids,'["owner-only"]')
 assert.equal(db.database.prepare('PRAGMA foreign_key_check').all().length,0)
 db.recordSyncConflicts([{operationId:'competing-stock',entityType:'product',entityId:'rice',reason:'Stock changed',localPayload:{stock:2},remotePayload:{stock:3}}])
 const issue=db.listSyncConflicts()[0]
 assert.equal(JSON.parse(issue.localPayload).stock,2);assert.equal(JSON.parse(issue.remotePayload).stock,3)
 assert.throws(()=>db.resolveSyncConflict(issue.id,{action:'accepted',note:'bad',confirmed:false},user),/Inspect/)
 assert.equal(db.listSyncConflicts().length,1)
 db.resolveSyncConflict(issue.id,{action:'accepted',note:'Counted physical stock and checked accepted stock record.',confirmed:true},user)
 assert.equal(db.listSyncConflicts().length,0)
 assert.equal(db.listSyncConflicts(true)[0].reviewerId,user.id)
 assert.match(db.listSyncConflicts(true)[0].reviewNote,/Counted physical/)
 assert.throws(()=>db.resolveSyncConflict(issue.id,{action:'accepted',note:'Already reviewed accepted record.',confirmed:true},user),/no longer open/)

 }finally{db.database.close();await rm(folder,{recursive:true,force:true})}
})
