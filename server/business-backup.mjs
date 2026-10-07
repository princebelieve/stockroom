import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'node:crypto'
const excluded = new Set(['sessions', 'auth_sessions'])
const quote = value => '"' + value.replaceAll('"', '""') + '"'
function schema(db) {
  return db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().filter(row => !excluded.has(row.name))
}
const fingerprint = tables => createHash('sha256').update(JSON.stringify(tables)).digest('hex')
export function backupSnapshot(db, identity) {
  const tables = schema(db)
  db.exec('BEGIN')
  try {
    const data = Object.fromEntries(tables.map(table => [table.name, db.prepare(`SELECT * FROM ${quote(table.name)}`).all()]))
    db.exec('COMMIT')
    return { format: 'stockroom-backup-v1', ...identity, createdAt: new Date().toISOString(), schema: fingerprint(tables), data }
  } catch (error) { db.exec('ROLLBACK'); throw error }
}
export function encryptBackup(snapshot, password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('Use a backup password of 12 to 256 characters.')
  const salt = randomBytes(16), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', scryptSync(password, salt, 32), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(snapshot)), cipher.final()])
  return { format: 'stockroom-encrypted-backup-v1', salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), body: body.toString('base64') }
}
export function decryptBackup(archive, password) {
  if (archive?.format !== 'stockroom-encrypted-backup-v1' || typeof password !== 'string' || password.length > 256) throw new Error('Invalid backup file or password.')
  try {
    const decipher = createDecipheriv('aes-256-gcm', scryptSync(password, Buffer.from(archive.salt, 'base64'), 32), Buffer.from(archive.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(archive.tag, 'base64'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(archive.body, 'base64')), decipher.final()]).toString())
  } catch { throw new Error('The backup password is incorrect or the file is damaged.') }
}
export function restoreSnapshot(db, snapshot, identity) {
  const tables = schema(db)
  if (snapshot?.format !== 'stockroom-backup-v1' || snapshot.businessId !== identity.businessId || snapshot.tillId !== identity.tillId || snapshot.schema !== fingerprint(tables)) throw new Error('Use a backup from this business and checkout with the same database version. For a replacement device use lost-till recovery first.')
  if (!snapshot.data || Object.keys(snapshot.data).sort().join('|') !== tables.map(t => t.name).sort().join('|')) throw new Error('The backup is incomplete.')
  for (const table of tables) {
    const columns = db.prepare(`PRAGMA table_info(${quote(table.name)})`).all().map(row => row.name).sort()
    if (!Array.isArray(snapshot.data[table.name]) || snapshot.data[table.name].some(row => Object.keys(row).sort().join('|') !== columns.join('|'))) throw new Error('Invalid backup records.')
  }
  db.exec('BEGIN IMMEDIATE; PRAGMA defer_foreign_keys = ON')
  try {
    // Preserve current credentials; backups must never reinstate a removed staff account.
    const preserved = new Set(['organizations', 'branches', 'users', 'staff_removals'])
    for (const table of tables.filter(t => !preserved.has(t.name))) db.exec(`DELETE FROM ${quote(table.name)}`)
    for (const table of tables.filter(t => !preserved.has(t.name))) {
      const columns = db.prepare(`PRAGMA table_info(${quote(table.name)})`).all().map(row => row.name)
      const insert = db.prepare(`INSERT INTO ${quote(table.name)} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
      for (const row of snapshot.data[table.name]) insert.run(...columns.map(column => row[column]))
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Backup references are incomplete. No records were restored.')
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}
