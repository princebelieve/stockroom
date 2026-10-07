import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { backupSnapshot, encryptBackup, decryptBackup, restoreSnapshot } from '../server/business-backup.mjs'
test('encrypted backup validates identity, detects tampering and restores atomically', () => {
  const db=new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON; CREATE TABLE products(id TEXT PRIMARY KEY, stock REAL CHECK(stock>=0)); CREATE TABLE users(id TEXT PRIMARY KEY, password TEXT); CREATE TABLE auth_sessions(id TEXT); INSERT INTO products VALUES (\'rice\',10); INSERT INTO users VALUES (\'owner\',\'current\')')
  const identity={businessId:'shop',tillId:'till'}, snapshot=backupSnapshot(db,identity), archive=encryptBackup(snapshot,'long-backup-password')
  assert.equal(snapshot.data.auth_sessions,undefined)
  assert.throws(()=>decryptBackup(archive,'wrong-password'),/incorrect/)
  assert.throws(()=>decryptBackup({...archive,tag:Buffer.alloc(16).toString('base64')},'long-backup-password'),/damaged/)
  db.exec("UPDATE products SET stock=1; UPDATE users SET password='new-password'")
  assert.throws(()=>restoreSnapshot(db,snapshot,{...identity,businessId:'another'}),/business/)
  assert.throws(()=>restoreSnapshot(db,snapshot,{...identity,tillId:'another'}),/checkout/)
  const invalid=structuredClone(snapshot); invalid.data.products[0].stock=-1
  assert.throws(()=>restoreSnapshot(db,invalid,identity))
  assert.equal(db.prepare('SELECT stock FROM products').get().stock,1)
  restoreSnapshot(db,decryptBackup(archive,'long-backup-password'),identity)
  assert.equal(db.prepare('SELECT stock FROM products').get().stock,10)
  assert.equal(db.prepare('SELECT password FROM users').get().password,'new-password')
  db.close()
})
