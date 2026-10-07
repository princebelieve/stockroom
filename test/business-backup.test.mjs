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

 test('backup restores across additive upgrades and rejects destructive changes without changing stock', () => {
  const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE products(id TEXT PRIMARY KEY, stock REAL); INSERT INTO products VALUES ('rice',10)")
  const identity={businessId:'shop',tillId:'till'}, original=backupSnapshot(db,identity)
  db.exec("ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT 'General'; CREATE TABLE new_records(id TEXT); UPDATE products SET stock=1")
  restoreSnapshot(db,original,identity)
  assert.deepEqual({...db.prepare('SELECT * FROM products').get()},{id:'rice',stock:10,category:'General'})
  assert.equal(db.prepare('SELECT count(*) AS n FROM new_records').get().n,0)
  const legacy={...original};delete legacy.tables;delete legacy.columns
  assert.throws(()=>restoreSnapshot(db,legacy,identity),/supported app version/)
  db.exec('ALTER TABLE products RENAME COLUMN stock TO quantity')
  assert.throws(()=>restoreSnapshot(db,original,identity),/changed columns/)
  assert.equal(db.prepare('SELECT quantity FROM products').get().quantity,10)
  db.close()
 })
 test('added mandatory columns without a default reject older backups',()=>{
  const source=new DatabaseSync(':memory:');source.exec('CREATE TABLE products(id TEXT PRIMARY KEY)');const identity={businessId:'shop',tillId:'till'}, snapshot=backupSnapshot(source,identity)
  const target=new DatabaseSync(':memory:');target.exec('CREATE TABLE products(id TEXT PRIMARY KEY, required TEXT NOT NULL)')
  assert.throws(()=>restoreSnapshot(target,snapshot,identity),/required fields/)
  source.close();target.close()
 })

test('legacy archives support the known addition of local review history',()=>{
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE products(id TEXT PRIMARY KEY,stock REAL); INSERT INTO products VALUES('rice',10)")
 const identity={businessId:'shop',tillId:'till'},snapshot=backupSnapshot(db,identity);delete snapshot.tables;delete snapshot.columns
 db.exec('CREATE TABLE sync_conflict_reviews(conflict_id TEXT PRIMARY KEY); UPDATE products SET stock=1')
 restoreSnapshot(db,snapshot,identity)
 assert.equal(db.prepare('SELECT stock FROM products').get().stock,10)
 db.close()
})

test('legacy backup without metadata automatically restores known app additions with exact historical fingerprint',()=>{
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE products(id TEXT PRIMARY KEY,stock REAL); INSERT INTO products VALUES('rice',10)")
 const identity={businessId:'shop',tillId:'till'}, snapshot=backupSnapshot(db,identity);delete snapshot.tables;delete snapshot.columns
 db.exec("ALTER TABLE products ADD COLUMN barcode TEXT NOT NULL DEFAULT ''; ALTER TABLE products ADD COLUMN custom_values TEXT NOT NULL DEFAULT '{}'; UPDATE products SET stock=1")
 restoreSnapshot(db,snapshot,identity)
 assert.equal(db.prepare('SELECT stock FROM products').get().stock,10)
 assert.equal(db.prepare('SELECT barcode FROM products').get().barcode,'')
 assert.equal(db.prepare('SELECT custom_values FROM products').get().custom_values,'{}')
 const damaged={...snapshot,schema:'f'.repeat(64)}
 db.exec('UPDATE products SET stock=2')
 assert.throws(()=>restoreSnapshot(db,damaged,identity),/supported app version/)
 assert.equal(db.prepare('SELECT stock FROM products').get().stock,2)
 db.close()
})

test('legacy recovery recognises known additions to empty tables without guessing from row data',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE sales(id TEXT PRIMARY KEY,total REAL); CREATE TABLE expenses(id TEXT PRIMARY KEY,amount REAL)')
 const identity={businessId:'shop',tillId:'till'},snapshot=backupSnapshot(db,identity);delete snapshot.tables;delete snapshot.columns
 db.exec("ALTER TABLE sales ADD COLUMN staff_id TEXT NOT NULL DEFAULT ''; ALTER TABLE sales ADD COLUMN staff_name TEXT NOT NULL DEFAULT ''; ALTER TABLE expenses ADD COLUMN staff_id TEXT NOT NULL DEFAULT ''")
 restoreSnapshot(db,snapshot,identity)
 assert.equal(db.prepare('SELECT count(*) AS n FROM sales').get().n,0)
 db.close()
})
