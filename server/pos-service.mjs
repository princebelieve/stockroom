import { stockChange } from './stock-ledger.mjs'
import { handleCounter } from './counter-service.mjs'
import { posSettings, refundFor, loyaltyBalances } from './pos-pricing.mjs'
export const posSchema = 'CREATE TABLE IF NOT EXISTS pos_records (scope TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, branch_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(scope,id));'
export async function ensurePos(db) { await db.run(posSchema) }
export async function posRecords(db, scope, kind, branch = 'main') {
  await ensurePos(db)
  return (await db.query('SELECT payload FROM pos_records WHERE scope=? AND kind=? AND branch_id=? ORDER BY updated_at DESC', [scope, kind, branch])).values.map(row => JSON.parse(row.payload))
}
export async function savePosRecord(db, scope, record) {
  await ensurePos(db)
  await db.run('INSERT INTO pos_records (scope,id,kind,branch_id,payload,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(scope,id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at WHERE excluded.updated_at >= pos_records.updated_at', [scope, record.id, record.kind, record.branchId || 'main', JSON.stringify(record), record.updatedAt])
}
export async function applyPosRecord(db, scope, record, organizationId) {
  const found = (await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?', [scope, record.id])).values[0]
  if (record.kind === 'return' && !found) {
    for (const item of record.items) if (item.restock && !String(item.productId).startsWith('service:')) {
      const result = await db.query('SELECT stock FROM branch_inventory WHERE product_id=? AND branch_id=?', [item.productId, record.branchId])
      if (!result.values.length) throw new Error('Returned product is not available on this device yet.')
      const parts=item.batchAllocations?.length?item.batchAllocations:[{quantity:item.quantity,unitCost:item.unitCost||0}]
      for(const [index,part] of parts.entries())await stockChange(db,{id:`${record.id}:restock:${item.lineIndex}:${index}`,lotId:part.id,branchId:record.branchId,productId:item.productId,delta:part.quantity,reconcile:index===0,unitCost:part.unitCost,expiry:part.expiry||'',batchNumber:part.batchNumber||'',createdAt:record.updatedAt})
      await db.run('UPDATE branch_inventory SET stock=stock+? WHERE product_id=? AND branch_id=?', [item.quantity, item.productId, record.branchId])
      const columns = organizationId ? 'id,organization_id,product_id,quantity,reason,created_at,branch_id' : 'id,product_id,quantity,reason,created_at,branch_id'
      const values = [`${record.id}:return:${item.lineIndex}`, ...(organizationId ? [organizationId] : []), item.productId, item.quantity, `Return ${record.saleId}: ${record.reason}`, record.updatedAt, record.branchId]
      await db.run(`INSERT INTO inventory_movements (${columns}) VALUES (${values.map(() => '?').join(',')})`, values)
    }
    if (record.walletCustomerId) {
      const customer = (await db.query(`SELECT id FROM customers WHERE id=?${organizationId ? ' AND organization_id=?' : ''}`, [record.walletCustomerId, ...(organizationId ? [organizationId] : [])])).values[0]
      if (!customer) throw new Error('Customer account is not available on this device yet.')
      await db.run('UPDATE customers SET balance=ROUND(balance+?,2) WHERE id=?', [record.total, record.walletCustomerId])
      const columns = organizationId ? 'id,organization_id,customer_id,amount,reason,created_at' : 'id,customer_id,amount,reason,created_at'
      const values = [record.id, ...(organizationId ? [organizationId] : []), record.walletCustomerId, record.total, `Return ${record.saleId}: ${record.reason}`, record.updatedAt]
      await db.run(`INSERT INTO wallet_transactions (${columns}) VALUES (${values.map(() => '?').join(',')})`, values)
    }
  }
  await savePosRecord(db, scope, record)
}
const amount = value => { const n = Number(value); if (!Number.isFinite(n) || n < 0 || Math.abs(Math.round(n * 100) - n * 100) > 0.000001) throw new Error('Enter a non-negative amount with at most two decimals.'); return n }
export async function handlePos({ db, scope, branchId, user, path, method, input, sales, publish, organizationId, tillId }) {
  // handlePos owns its transactions; native SQLite run() must not nest them.
  const connection = db
  db = {
    query: (sql, params = []) => connection.query(sql, params),
    run: (sql, params = []) => connection.run(sql, params, false),
    beginTransaction: () => connection.beginTransaction(),
    commitTransaction: () => connection.commitTransaction(),
    rollbackTransaction: () => connection.rollbackTransaction()
  }
  await ensurePos(db)
  if (path.startsWith('/api/pos/counter')) return handleCounter({ db, scope, organizationId, branchId, user, path, method, input, sales, publish, tillId, saveRecord: savePosRecord })
  const manager = ['owner', 'admin'].includes(user.role)
  const records = kind => posRecords(db, scope, kind, kind === 'settings' || kind === 'product' ? 'main' : branchId)
  const write = async record => { if(['basket','register'].includes(record.kind)){const previous=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,record.id])).values[0];record.expectedUpdatedAt=previous?JSON.parse(previous.payload).updatedAt:''} await db.beginTransaction(); try { await savePosRecord(db, scope, record); await publish(record); await db.commitTransaction() } catch(error) { await db.rollbackTransaction(); throw error } return record }
  const stamp = { branchId, updatedAt: new Date().toISOString(), staffId: user.id, staffName: user.name }
  if (method === 'GET') {
    const [settings, baskets, registers, returns, products] = await Promise.all(['settings', 'basket', 'register', 'return', 'product'].map(records))
    const loaded = await sales()
    const customerHistory = loaded.filter(sale => sale.paymentDetails?.pos?.customerId)
    const customers = (await db.query(`SELECT id,name,phone,balance FROM customers${organizationId ? ' WHERE organization_id=?' : ''} ORDER BY name`, organizationId ? [organizationId] : [])).values
    return { settings: posSettings(settings[0]?.value), baskets: baskets.filter(record => !record.deleted), registers, returns, products, customerHistory, customers, loyaltyBalances: loyaltyBalances(loaded, returns) }
  }
  if (path === '/api/pos/settings') {
    if (user.role !== 'owner') throw new Error('Only the owner can change POS settings.')
    const value = posSettings(input)
    if (value.offlineStockPoolsEnabled) for (const branch of Object.values(value.stockPools)) {
      const found = (await db.query(`SELECT id FROM branches WHERE id=? AND is_active=1${organizationId ? ' AND organization_id=?' : ''}`, [branch, ...(organizationId ? [organizationId] : [])])).values[0]
      if (!found) throw new Error('Each till must use an active stock location.')
    }
    return write({ ...stamp, branchId: 'main', id: 'pos-settings', kind: 'settings', value })
  }
  if (path === '/api/pos/products') {
    if (!manager) throw new Error('Owner or admin access required.')
    if (!input.productId) throw new Error('Choose a product.')
    const modifiers = Array.isArray(input.modifiers) ? input.modifiers.map(modifier => ({ name: String(modifier.name).trim().slice(0, 80), price: amount(modifier.price) })) : []
    if (modifiers.some(modifier => !modifier.name) || modifiers.length > 30) throw new Error('Enter up to 30 named modifiers.')
    return write({ ...stamp, branchId: 'main', id: `product:${input.productId}`, productId: input.productId, kind: 'product', variantGroup: String(input.variantGroup || '').slice(0, 100), variantLabel: String(input.variantLabel || '').slice(0, 100), modifiers })
  }
  if (path === '/api/pos/baskets') {
    if (!input.id) throw new Error('Basket ID required.')
    return write({ ...stamp, id: String(input.id), kind: 'basket', label: String(input.label || 'Saved basket').slice(0, 100), draft: input.draft, deleted: input.deleted === true })
  }
  if (path === '/api/pos/registers') {
    const existing = (await records('register')).find(record => record.id === input.id)
    if (input.action === 'open') {
      if ((await records('register')).some(record => !record.closedAt && record.staffId === user.id)) throw new Error('Close your current register session first.')
      return write({ ...stamp, id: crypto.randomUUID(), kind: 'register', openedAt: stamp.updatedAt, openingCash: amount(input.amount), movements: [] })
    }
    if (!existing || existing.closedAt || (!manager && existing.staffId !== user.id)) throw new Error('Open register session not found.')
    if (input.action === 'movement') {
      const reason = String(input.reason || '').trim()
      if (reason.length < 3 || !['in', 'out'].includes(input.direction)) throw new Error('Choose cash in/out and enter a reason.')
      return write({ ...existing, updatedAt: stamp.updatedAt, movements: [...existing.movements, { id: crypto.randomUUID(), amount: amount(input.amount), direction: input.direction, reason, staffId: user.id, createdAt: stamp.updatedAt }] })
    }
    if (input.action !== 'close') throw new Error('Unknown register action.')
    const loaded = (await sales()).filter(sale => sale.paymentDetails?.pos?.registerId === existing.id)
    const cashSales = loaded.reduce((sum, sale) => sum + (sale.paymentMethod === 'cash' ? sale.total : (sale.paymentDetails?.allocations || []).filter(part => part.method === 'cash').reduce((total, part) => total + part.amount, 0)), 0)
    const cashReturns = (await records('return')).filter(record => record.registerId === existing.id && record.method === 'cash').reduce((sum, record) => sum + record.total, 0)
    const hasRetail=(await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='retail_records'")).values.length
    const supplierCash=hasRetail?(await db.query('SELECT payload FROM retail_records WHERE scope=? AND branch_id=?',[scope,branchId])).values.map(row=>JSON.parse(row.payload)).filter(row=>row.registerId===existing.id).reduce((sum,row)=>sum+Number(row.cashAmount||0),0):0
    const expectedCash = Math.round((existing.openingCash + cashSales - cashReturns + supplierCash + existing.movements.reduce((sum, movement) => sum + movement.amount * (movement.direction === 'in' ? 1 : -1), 0)) * 100) / 100
    const countedCash = amount(input.amount), difference = Math.round((countedCash - expectedCash) * 100) / 100
    if (difference && String(input.reason || '').trim().length < 3) throw new Error('Explain the cash difference before closing.')
    return write({ ...existing, updatedAt: stamp.updatedAt, closedAt: stamp.updatedAt, cashSales, cashReturns, supplierCash, expectedCash, countedCash, difference, closingReason: String(input.reason || '') })
  }
  if (path === '/api/pos/returns') {
    if (!manager) throw new Error('Owner or admin access required for returns.')
    if (!input.id || String(input.reason || '').trim().length < 3) throw new Error('Return ID and reason required.')
    const previous = await records('return')
    const duplicate = previous.find(record => record.id === input.id)
    if (duplicate) return duplicate
    const sale = (await sales()).find(sale => sale.id === input.saleId)
    if (!sale) throw new Error('Receipt not found. Synchronize this device first.')
    if (!['cash', 'external-pos', 'bank-transfer', 'wallet'].includes(input.method)) throw new Error('Choose a refund method.')
    if (['external-pos', 'bank-transfer'].includes(input.method) && (!input.reference || input.confirmed !== true)) throw new Error('Confirm the external refund and record its reference.')
    const walletCustomerId = input.method === 'wallet' ? sale.paymentDetails?.pos?.customerId || sale.paymentDetails?.customerId : undefined
    if (input.method === 'wallet' && !walletCustomerId) throw new Error('This receipt has no customer account.')
    const computed = refundFor(sale, previous.filter(record => record.saleId === sale.id), input.items || [])
    const record = { ...stamp, id: input.id, kind: 'return', saleId: sale.id, ...computed, reason: input.reason, method: input.method, reference: input.reference || '', walletCustomerId, registerId: (await records('register')).find(session => !session.closedAt && session.staffId === user.id)?.id }
    await db.beginTransaction()
    try { await applyPosRecord(db, scope, record, organizationId); await publish(record); await db.commitTransaction() } catch (error) { await db.rollbackTransaction(); throw error }
    return record
  }
  throw new Error('Unknown POS action.')
}
