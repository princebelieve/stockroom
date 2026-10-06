import { supplierAccounts } from './supplier-accounts.mjs'
import { stockSchema, stockChange, batchReport, expiryDate, allocateStock } from './stock-ledger.mjs'
import { quantity } from './quantities.mjs'

// Additive, shared migrations. Existing tables and receipt IDs remain intact.
export const retailMigrations = [{ version: 1, sql: `CREATE TABLE IF NOT EXISTS retail_records (
  scope TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, branch_id TEXT NOT NULL,
  payload TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(scope,id));
  CREATE INDEX IF NOT EXISTS retail_records_kind ON retail_records(scope,kind,branch_id);` }, { version: 2, sql: stockSchema }]
function transactionDb(db) {
  // Capacitor defaults each statement to its own transaction. Disable that
  // default because this module owns the complete receiving transaction.
  return {
    execute: sql => db.execute(sql, false), run: (sql, params = []) => db.run(sql, params, false),
    query: (sql, params = []) => db.query(sql, params),
    beginTransaction: () => db.beginTransaction(), commitTransaction: () => db.commitTransaction(), rollbackTransaction: () => db.rollbackTransaction()
  }
}
export async function migrateRetail(db) {
  db = transactionDb(db)
  await db.run('CREATE TABLE IF NOT EXISTS schema_migrations (module TEXT NOT NULL, version INTEGER NOT NULL, applied_at TEXT NOT NULL, PRIMARY KEY(module,version))')
  const latest = (await db.query("SELECT MAX(version) AS version FROM schema_migrations WHERE module='retail'")).values[0]?.version || 0
  if (latest > retailMigrations.at(-1).version) throw new Error('This database was upgraded by a newer app. Update this device before opening it.')
  for (const migration of retailMigrations) {
    if ((await db.query("SELECT version FROM schema_migrations WHERE module='retail' AND version=?", [migration.version])).values.length) continue
    await db.beginTransaction()
    try {
      await db.execute(migration.sql)
      if(migration.version===2){const columns=(await db.query('PRAGMA table_info(sale_items)')).values;if(columns.length && !columns.some(row=>row.name==='batch_allocations'))await db.run("ALTER TABLE sale_items ADD COLUMN batch_allocations TEXT NOT NULL DEFAULT '[]'")}
      await db.run("INSERT INTO schema_migrations VALUES ('retail',?,?)", [migration.version, new Date().toISOString()])
      await db.commitTransaction()
    } catch (error) { await db.rollbackTransaction(); throw error }
  }
  // Receipt lines can describe payments without an inventory product. Older
  // browser/native databases enforced a product foreign key; retain their
  // receipt IDs, line order, columns and indexes while removing only that key.
  if ((await db.query('PRAGMA table_info(sale_items)')).values.length && !(await db.query("SELECT version FROM schema_migrations WHERE module='service-payments' AND version=1")).values.length) {
    await db.beginTransaction()
    try {
      const keys = (await db.query('PRAGMA foreign_key_list(sale_items)')).values
      if (keys.some(key => key.from === 'product_id' && key.table === 'products')) {
        const schema = (await db.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='sale_items'")).values[0].sql
        const indexes = (await db.query("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='sale_items' AND sql IS NOT NULL")).values
        const replacement = schema.replace(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`\[]?sale_items["`\]]?/i, 'CREATE TABLE sale_items_payment_upgrade').replace(/(product_id\s+TEXT\s+NOT NULL)\s+REFERENCES\s+products\s*\(id\)/i, '$1')
        if (replacement === schema || /product_id\s+TEXT\s+NOT NULL\s+REFERENCES/i.test(replacement)) throw new Error('Could not upgrade payment receipt storage safely.')
        await db.execute(replacement)
        await db.run('INSERT INTO sale_items_payment_upgrade SELECT * FROM sale_items ORDER BY rowid')
        await db.execute('DROP TABLE sale_items; ALTER TABLE sale_items_payment_upgrade RENAME TO sale_items;')
        for (const index of indexes) await db.execute(index.sql)
      }
      await db.run("INSERT INTO schema_migrations VALUES ('service-payments',1,?)", [new Date().toISOString()])
      await db.commitTransaction()
    } catch (error) { await db.rollbackTransaction(); throw error }
  }
}
const text = (value, label) => {
  const result = String(value || '').trim()
  if (!result || result.length > 200) throw new Error(`Enter ${label} (up to 200 characters).`)
  return result
}
const cost = value => {
  const n = Number(value)
  if (value === '' || value == null || !Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 100)) || Math.abs(n * 100 - Math.round(n * 100)) > 0.000001) throw new Error('Enter a non-negative unit cost with at most two decimals.')
  return n
}
export async function retailRecords(db, scope) {
  return (await db.query('SELECT payload FROM retail_records WHERE scope=? ORDER BY created_at DESC,id', [scope])).values.map(row => JSON.parse(row.payload))
}
// Returns deterministic statements so desktop and asynchronous SQLite clients
// apply precisely the same immutable receiving event inside a transaction.
export function validateRetailRecord(record) {
  if (!record || !['supplier', 'conversion', 'order', 'receipt', 'waste', 'supplier-return', 'pricing', 'batch-update', 'supplier-opening', 'supplier-payment', 'supplier-refund'].includes(record.kind)) throw new Error('Unsupported retail record. Update this device before synchronizing.')
  text(record.id, 'a record ID'); text(record.branchId, 'a branch ID')
  if (!Number.isFinite(Date.parse(record.createdAt))) throw new Error('Invalid purchasing record date.')
  if (record.kind === 'supplier') text(record.name, 'a supplier name')
  else if (['supplier-opening','supplier-payment','supplier-refund'].includes(record.kind)) { text(record.supplierId,'a supplier'); text(record.reference,'a reference'); if(!Number.isFinite(record.amount) || !Number.isSafeInteger(Math.round(record.amount*100)) || Math.abs(record.amount*100-Math.round(record.amount*100))>0.000001 || (record.kind!=='supplier-opening' && record.amount<=0))throw new Error('Invalid supplier amount.') }
  else if (record.kind === 'conversion') { text(record.productId, 'a product ID'); text(record.label, 'a pack name'); quantity(record.factor, 0.001); if (record.sellInPos === true) cost(record.salePrice) }
  else if (record.kind === 'pricing') { text(record.productId, 'a product ID'); cost(record.price); cost(record.cost); text(record.reason, 'a price-change reason') }
  else if (record.kind === 'batch-update') { text(record.batchId, 'a batch ID'); expiryDate(record.expiry); text(record.reason, 'a batch-change reason') }
  else {
    if (!Array.isArray(record.lines) || !record.lines.length || record.lines.length > 100) throw new Error('Invalid purchasing lines.')
    if (record.kind === 'waste') text(record.reason, 'a wastage reason')
    else { text(record.supplierId, 'a supplier ID'); text(record.reference, 'a reference') }
    const ids = new Set()
    for (const line of record.lines) {
      text(line.productId, 'a product ID')
      if (ids.has(line.productId)) throw new Error('Duplicate purchasing line.')
      ids.add(line.productId)
      quantity(line.units, 0.001); quantity(line.quantity, 0.001); quantity(line.factor, 0.001); quantity(line.beforeStock)
      if (quantity(line.quantity * line.factor, 0.001) !== line.units || !Number.isFinite(line.unitCost) || line.unitCost < 0) throw new Error('Invalid receiving conversion or purchase cost.')
    }
  }
  if(record.kind==='receipt' && record.accountingVersion===1){const total=Math.round(record.lines.reduce((sum,line)=>sum+line.units*line.unitCost,0)*100)/100;if(cost(record.amountPaid)>total)throw new Error('Paid amount exceeds delivery total.')}
  return record
}

export function retailStatements(record, scope, organizationId) {
  validateRetailRecord(record)
  const statements = []
  if (record.kind === 'pricing') statements.push(['UPDATE products SET price=?,cost_price=?,barcode=?,updated_at=? WHERE id=?', [record.price,record.cost,record.barcode,record.createdAt,record.productId]])
  if (record.kind === 'batch-update') statements.push(['UPDATE stock_batches SET batch_number=?,expiry=? WHERE id=? AND branch_id=?', [record.batchNumber,record.expiry,record.batchId,record.branchId]])
  for (const [index, line] of (['receipt', 'waste', 'supplier-return'].includes(record.kind) ? record.lines : []).entries()) {
    const units = quantity(line.units, 0.001), delta = record.kind === 'receipt' ? units : -units
    statements.push(['UPDATE branch_inventory SET stock=ROUND(stock+?,3),updated_at=? WHERE branch_id=? AND product_id=?', [delta, record.createdAt, record.branchId, line.productId]])
    const columns = organizationId ? 'id,organization_id,product_id,quantity,reason,created_at,branch_id' : 'id,product_id,quantity,reason,created_at,branch_id'
    statements.push([`INSERT INTO inventory_movements (${columns}) VALUES (${columns.split(',').map(() => '?').join(',')})`, [`${record.id}:${index}`, ...(organizationId ? [organizationId] : []), line.productId, delta, `${record.kind === 'receipt' ? 'Supplier delivery' : record.kind === 'supplier-return' ? 'Supplier return' : 'Wastage'}: ${record.reference || record.reason}`, record.createdAt, record.branchId]])
  }
  statements.push(['INSERT INTO retail_records(scope,id,kind,branch_id,payload,created_at) VALUES (?,?,?,?,?,?)', [scope, record.id, record.kind, record.branchId, JSON.stringify(record), record.createdAt]])
  return statements
}
export async function applyRetailRecord(db, scope, record, organizationId) {
  db = transactionDb(db)
  const existing = (await db.query('SELECT payload FROM retail_records WHERE scope=? AND id=?', [scope, record.id])).values[0]
  if (existing) {
    if (existing.payload !== JSON.stringify(record)) throw new Error('This record ID has already been used for different details.')
    return false
  }
  for (const line of ['receipt', 'waste', 'supplier-return'].includes(record.kind) ? record.lines : []) {
    if (!(await db.query('SELECT stock FROM branch_inventory WHERE branch_id=? AND product_id=?', [record.branchId, line.productId])).values.length) throw new Error('Synchronize the product and branch before this delivery.')
  }
  for (const [index,line] of (['receipt','waste','supplier-return'].includes(record.kind) ? record.lines : []).entries()) {
    const result=await stockChange(db,{id:`${record.id}:lot:${index}`,branchId:record.branchId,productId:line.productId,delta:record.kind==='receipt'?line.units:-line.units,unitCost:line.unitCost,expiry:line.expiry||'',batchNumber:line.batchNumber||record.reference,sourceId:record.id,createdAt:record.createdAt,allowExpired:record.kind!=='receipt',allocations:line.allocations})
    if(!line.allocations)line.allocations=result.allocations
    if(record.kind==='waste')line.unitCost=result.unitCost
  }
  for (const [sql, params] of retailStatements(record, scope, organizationId)) await db.run(sql, params)
  return true
}
export async function handleRetail({ db, scope, organizationId, branchId, user, method, input, publish, currency = 'USD' }) {
  db = transactionDb(db)
  if (!['owner', 'admin'].includes(user.role)) throw new Error('Owner or admin access required for purchasing.')
  const records = await retailRecords(db, scope)
  if (method === 'GET') return { accounts:supplierAccounts(records,branchId), batches: await batchReport(db,branchId), records: records.filter(record => ['supplier','conversion','pricing'].includes(record.kind) || record.branchId === branchId) }
  if (method !== 'POST') throw new Error('Unsupported purchasing method.')
  const id = text(input.id, 'a record ID')
  const existing = records.find(record => record.id === id)
  // Stable request fingerprint makes uncertain-response retries safe.
  const request = JSON.stringify({ ...input, branchId })
  if (existing) { if (existing.request !== request) throw new Error('This record ID has already been used for different details.'); return existing }
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid business currency.')
  const record = { id, kind: input.kind, branchId, currency, createdAt: new Date().toISOString(), staffId: user.id, staffName: user.name, request }
  if (record.kind === 'supplier') Object.assign(record, { name: text(input.name, 'a supplier name'), phone: String(input.phone || '').slice(0, 100) })
  else if (['supplier-opening','supplier-payment','supplier-refund'].includes(record.kind)) {
    if(!records.some(row=>row.kind==='supplier' && row.id===input.supplierId))throw new Error('Choose an existing supplier.')
    if(record.kind==='supplier-opening' && records.some(row=>row.kind==='supplier-opening' && row.supplierId===input.supplierId && row.branchId===branchId))throw new Error('Opening balance has already been recorded for this supplier and branch.')
    const amount=Number(input.amount)
    if(record.kind==='supplier-opening'){if(!Number.isFinite(amount) || Math.abs(amount*100-Math.round(amount*100))>0.000001)throw new Error('Enter an opening balance with at most two decimals.')}else {if(amount<=0)throw new Error('Enter a positive payment amount.');cost(input.amount)}
    Object.assign(record,{supplierId:input.supplierId,amount,reference:text(input.reference,'a payment or opening reference'),method:String(input.method||'bank-transfer'),accountingVersion:1})
  }
  else if (record.kind === 'conversion') {
    if (!(await db.query('SELECT id FROM products WHERE id=?', [input.productId])).values.length) throw new Error('Choose an existing product.')
    Object.assign(record, { productId: input.productId, label: text(input.label, 'a pack name'), factor: quantity(input.factor, 0.001), sellInPos: input.sellInPos === true, ...(input.sellInPos === true ? { salePrice: cost(input.salePrice) } : {}) })
  } else if (record.kind === 'pricing') {
    const current=(await db.query('SELECT price,cost_price,barcode,updated_at FROM products WHERE id=?',[input.productId])).values[0]
    if(!current)throw new Error('Choose an existing product.')
    if(input.barcode && (await db.query('SELECT id FROM products WHERE barcode=? AND id<>?',[String(input.barcode).trim(),input.productId])).values.length)throw new Error('This barcode belongs to another product.')
    if(input.expectedUpdatedAt && input.expectedUpdatedAt!==current.updated_at)throw new Error('This product changed on another till. Refresh before editing.')
    Object.assign(record,{productId:input.productId,price:cost(input.price),cost:cost(input.cost),barcode:String(input.barcode||'').trim().slice(0,100),reason:text(input.reason,'a price-change reason'),before:{price:current.price,cost:current.cost_price,barcode:current.barcode,updatedAt:current.updated_at}})
  } else if (record.kind === 'batch-update') {
    const current=(await db.query('SELECT * FROM stock_batches WHERE id=? AND branch_id=?',[input.batchId,branchId])).values[0]
    if(!current)throw new Error('Choose a batch at this branch.')
    Object.assign(record,{batchId:input.batchId,productId:current.product_id,batchNumber:String(input.batchNumber||'').slice(0,100),expiry:expiryDate(input.expiry||''),reason:text(input.reason,'a batch-change reason'),before:{expiry:current.expiry,batchNumber:current.batch_number}})
  } else if (['order', 'receipt', 'waste', 'supplier-return'].includes(record.kind)) {
    if (record.kind !== 'waste' && !records.some(row => row.kind === 'supplier' && row.id === input.supplierId)) throw new Error('Choose an existing supplier.')
    Object.assign(record, { supplierId: input.supplierId || '', reference: record.kind === 'waste' ? '' : text(input.reference, 'a delivery or order reference'), reason: record.kind === 'waste' ? text(input.reason, 'a wastage reason') : '', orderId: input.orderId || '', receiptId: input.receiptId || '' })
    if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 100) throw new Error('Enter between 1 and 100 lines.')
    const productIds = new Set()
    record.lines = []
    for (const line of input.lines) {
      if (productIds.has(line.productId)) throw new Error('Each product may appear only once.')
      productIds.add(line.productId)
      const product = (await db.query('SELECT p.id,p.name,p.unit,i.stock FROM products p JOIN branch_inventory i ON i.product_id=p.id WHERE p.id=? AND i.branch_id=?', [line.productId, branchId])).values[0]
      if (!product) throw new Error('Choose a product stocked at this branch.')
      const conversion = line.conversionId ? records.find(row => row.id === line.conversionId && row.kind === 'conversion' && row.productId === line.productId) : null
      if (line.conversionId && !conversion) throw new Error('Choose a valid pack conversion for this product.')
      const count = quantity(line.quantity, 0.001), factor = conversion?.factor || 1, units = quantity(count * factor, 0.001)
      if (['waste', 'supplier-return'].includes(record.kind) && units > Number(product.stock)) throw new Error(`Insufficient stock for ${product.name}.`)
      record.lines.push({ productId: product.id, productName: product.name, unit: product.unit, quantity: count, pack: conversion?.label || product.unit, factor, units, unitCost: ['waste', 'supplier-return'].includes(record.kind) ? 0 : cost(line.unitCost) / factor, beforeStock: Number(product.stock), expiry: expiryDate(line.expiry||''), batchNumber: String(line.batchNumber||'').slice(0,100) })
    }
    if (record.kind === 'receipt') {
      const total=Math.round(record.lines.reduce((sum,line)=>sum+line.units*line.unitCost,0)*100)/100
      const amountPaid=cost(input.amountPaid ?? 0)
      if(amountPaid>total)throw new Error('Paid amount exceeds this delivery. Record an advance separately under Supplier accounts.')
      Object.assign(record,{accountingVersion:1,amountPaid,paymentMethod:String(input.paymentMethod||'bank-transfer'),paymentReference:String(input.paymentReference||'').slice(0,200)})
    }
    if (record.kind === 'supplier-return') {
      const receipt = records.find(row => row.id === record.receiptId && row.kind === 'receipt' && row.branchId === branchId && row.supplierId === record.supplierId)
      if (!receipt) throw new Error('Choose a delivery for this supplier and branch.')
      for (const line of record.lines) {
        const original = receipt.lines.find(row => row.productId === line.productId)
        const returned = records.filter(row => row.kind === 'supplier-return' && row.receiptId === receipt.id).flatMap(row => row.lines).filter(row => row.productId === line.productId).reduce((sum, row) => sum + row.units, 0)
        if (!original || quantity(returned + line.units) > original.units) throw new Error('Return exceeds the quantity remaining on this delivery.')
        line.unitCost = original.unitCost
        if(original.allocations?.length){const lots=(await db.query('SELECT * FROM stock_batches WHERE branch_id=? AND product_id=? AND quantity>0',[branchId,line.productId])).values.filter(lot=>original.allocations.some(part=>part.id===lot.id));line.allocations=allocateStock(lots,line.units,record.createdAt.slice(0,10),true)}
      }
    }
    if (record.orderId) {
      const order = records.find(row => row.id === record.orderId && row.kind === 'order' && row.branchId === branchId && row.supplierId === record.supplierId)
      if (!order || record.kind !== 'receipt') throw new Error('Choose an order for this supplier and branch.')
      for (const line of record.lines) {
        const ordered = order.lines.find(row => row.productId === line.productId)?.units || 0
        const received = records.filter(row => row.kind === 'receipt' && row.orderId === order.id).flatMap(row => row.lines).filter(row => row.productId === line.productId).reduce((sum, row) => sum + row.units, 0)
        if (quantity(received + line.units) > ordered) throw new Error('Delivery exceeds the quantity remaining on the order.')
      }
    }
  } else throw new Error('Unsupported purchasing action.')
  const cashAmount=record.kind==='receipt' && record.paymentMethod==='cash'?-Number(record.amountPaid||0):record.method==='cash' && record.kind==='supplier-payment'?-record.amount:record.method==='cash' && record.kind==='supplier-refund'?record.amount:0
  if(cashAmount){const hasPos=(await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pos_records'")).values.length;if(hasPos){const registers=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind='register'",[scope,branchId])).values.map(row=>JSON.parse(row.payload));const register=registers.find(row=>!row.closedAt && row.staffId===user.id);if(register)Object.assign(record,{registerId:register.id,cashAmount})}}
  await db.beginTransaction()
  try { await applyRetailRecord(db, scope, record, organizationId); await publish(record); await db.commitTransaction() } catch (error) { await db.rollbackTransaction(); throw error }
  return record
}
