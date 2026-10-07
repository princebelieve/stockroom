import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'node:crypto'
const excluded = new Set(['sessions', 'auth_sessions'])
const quote = value => '"' + value.replaceAll('"', '""') + '"'
function schema(db) {
  return db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().filter(row => !excluded.has(row.name))
}
const fingerprint = tables => createHash('sha256').update(JSON.stringify(tables)).digest('hex')
// Only additions already made by the app are eligible for legacy recovery.
const legacyAdditions = {
  app_settings: ['currency','pos_provider','pos_terminal_id','pos_connection','logo_data','payment_policy','shop_profile'],
  products: ['barcode','custom_values','cost_price'],
  sales: ['payment_method','payment_reference','terminal_provider','payment_details','cash_received','change_given','staff_id','staff_name'],
  sale_items: ['unit_cost'], stocktakes: ['approval_reason'], users: ['operational_access','username'],
  branches: ['is_active','assigned_user_ids'], expenses: ['staff_id','staff_name'],
}
function removeAddedColumns(sql, missing) {
  const start=sql.indexOf('('), end=sql.lastIndexOf(')')
  if(start<0||end<start) return null
  const body=sql.slice(start+1,end), parts=[]
  let depth=0, quoteChar='', offset=0
  for(let i=0;i<body.length;i++) {
    const c=body[i]
    if(quoteChar) { if(c===quoteChar) { if(body[i+1]===quoteChar)i++;else quoteChar='' } }
    else if(c==='\''||c==='"'||c==='`')quoteChar=c
    else if(c==='(')depth++
    else if(c===')')depth--
    else if(c===','&&depth===0){parts.push(body.slice(offset,i));offset=i+1}
  }
  parts.push(body.slice(offset))
  const removed=new Set()
  const kept=parts.filter(part=>{const name=part.trim().match(/^(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][A-Za-z_0-9]*))/);const key=name&&(name[1]||name[2]||name[3]||name[4]);if(missing.includes(key)){removed.add(key);return false}return true})
  return removed.size===missing.length?sql.slice(0,start+1)+kept.join(',')+sql.slice(end):null
}
function legacyMetadata(db, snapshot, tables) {
  if(snapshot.tables||snapshot.columns||!snapshot.data||!/^[a-f0-9]{64}$/.test(snapshot.schema||''))return null
  const names=Object.keys(snapshot.data)
  if(names.some(name=>!tables.some(table=>table.name===name)))return null
  const source=[], columns={}, alternatives=[]
  for(const table of tables.filter(table=>names.includes(table.name))) {
    const rows=snapshot.data[table.name]
    if(!Array.isArray(rows)||rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))return null
    const current=db.prepare(`PRAGMA table_info(${quote(table.name)})`).all()
    const keys=rows.length?Object.keys(rows[0]):current.map(column=>column.name)
    if(rows.some(row=>!row||Object.keys(row).sort().join('|')!==[...keys].sort().join('|'))||keys.some(key=>!current.some(column=>column.name===key)))return null
    const missing=current.filter(column=>!keys.includes(column.name)).map(column=>column.name)
    if(missing.some(name=>!legacyAdditions[table.name]?.includes(name)))return null
    const sql=missing.length?removeAddedColumns(table.sql,missing):table.sql
    if(!sql)return null
    source.push({...table,sql});columns[table.name]=current.filter(column=>keys.includes(column.name))
    if(!rows.length) {
      const options=[{sql:table.sql,columns:current}]
      const omitted=[]
      for(let index=current.length-1;index>=0;index--) {
        const column=current[index]
        if(column.pk||!legacyAdditions[table.name]?.includes(column.name))break
        omitted.push(column.name)
        const candidate=removeAddedColumns(table.sql,omitted)
        if(candidate)options.push({sql:candidate,columns:current.filter(row=>!omitted.includes(row.name))})
      }
      if(options.length>1)alternatives.push({index:source.length-1,name:table.name,options})
    }
  }
  // The historical fingerprint must match exactly; record shapes alone never authorize conversion.
  if(source.length&&fingerprint(source)===snapshot.schema)return {tables:source,columns}
  // Empty tables contain no row keys. Check bounded, known additive histories against the exact hash.
  let attempts=0
  function find(index) {
    if(index===alternatives.length){if(++attempts>4096)return null;return fingerprint(source)===snapshot.schema?{tables:source.map(table=>({...table})),columns:{...columns}}:null}
    const choice=alternatives[index]
    for(const option of choice.options) {
      source[choice.index]={...source[choice.index],sql:option.sql};columns[choice.name]=option.columns
      const found=find(index+1);if(found)return found;if(attempts>4096)break
    }
    return null
  }
  return find(0)
}

export function backupSnapshot(db, identity) {
  const tables = schema(db)
  db.exec('BEGIN')
  try {
    const data = Object.fromEntries(tables.map(table => [table.name, db.prepare(`SELECT * FROM ${quote(table.name)}`).all()]))
    db.exec('COMMIT')
    return { format: 'stockroom-backup-v1', ...identity, createdAt: new Date().toISOString(), schema: fingerprint(tables), tables, columns: Object.fromEntries(tables.map(table => [table.name, db.prepare(`PRAGMA table_info(${quote(table.name)})`).all()])), data }
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
  if (snapshot?.format !== 'stockroom-backup-v1' || snapshot.businessId !== identity.businessId || snapshot.tillId !== identity.tillId) throw new Error('Use a backup from this business and checkout. For a replacement device use lost-till recovery first.')
  const recovered = legacyMetadata(db, snapshot, tables)
  if (recovered) snapshot = { ...snapshot, ...recovered }
  const compatible = snapshot.schema === fingerprint(tables)
  // Known additive migration for archives made before review history existed.
  const legacyTables = tables.filter(table => table.name !== 'sync_conflict_reviews')
  const legacyReviewUpgrade = !snapshot.tables && snapshot.schema === fingerprint(legacyTables)
  const sourceTables = compatible ? tables : legacyReviewUpgrade ? legacyTables : snapshot.tables
  if (!Array.isArray(sourceTables) || !compatible && !legacyReviewUpgrade && (!snapshot.columns || snapshot.schema !== fingerprint(sourceTables))) throw new Error('This older backup needs a supported app version to read its structure. No records were changed. Contact support; retain the original backup.')
  const currentNames = new Set(tables.map(table => table.name))
  if (sourceTables.some(table => !currentNames.has(table.name))) throw new Error('This backup needs a supported update for removed or renamed tables. No records were restored.')
  if (!snapshot.data || Object.keys(snapshot.data).sort().join('|') !== sourceTables.map(table => table.name).sort().join('|')) throw new Error('The backup is incomplete.')
  const inserts = new Map()
  for (const table of sourceTables) {
    const current = db.prepare(`PRAGMA table_info(${quote(table.name)})`).all()
    const original = compatible || legacyReviewUpgrade ? current : snapshot.columns[table.name]
    if (!Array.isArray(original) || !original.length) throw new Error('Invalid backup column metadata.')
    const names = original.map(column => column.name)
    if (new Set(names).size !== names.length || original.some(column => !current.some(next => next.name === column.name && next.type === column.type && next.pk === column.pk && next.notnull === column.notnull))) throw new Error('This backup needs a supported update for changed columns. No records were restored.')
    if (current.some(column => !names.includes(column.name) && (column.pk || column.notnull && column.dflt_value === null))) throw new Error('New required fields need a supported app update. No records were restored.')
    if (!Array.isArray(snapshot.data[table.name]) || snapshot.data[table.name].some(row => !row || Object.keys(row).sort().join('|') !== [...names].sort().join('|'))) throw new Error('Invalid backup records.')
    inserts.set(table.name, names)
  }
  db.exec('BEGIN IMMEDIATE; PRAGMA defer_foreign_keys = ON')
  try {
    // Preserve current credentials; backups must never reinstate a removed staff account.
    const preserved = new Set(['organizations', 'branches', 'users', 'staff_removals'])
    for (const table of tables.filter(t => !preserved.has(t.name))) db.exec(`DELETE FROM ${quote(table.name)}`)
    for (const table of tables.filter(t => !preserved.has(t.name))) {
      const columns = inserts.get(table.name)
      if (!columns) continue // Tables introduced after this backup start empty.
      const insert = db.prepare(`INSERT INTO ${quote(table.name)} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
      for (const row of snapshot.data[table.name]) insert.run(...columns.map(column => row[column]))
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Backup references are incomplete. No records were restored.')
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}
