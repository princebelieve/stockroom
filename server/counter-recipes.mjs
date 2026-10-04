import { stockChange, stockChangeSync } from './stock-ledger.mjs'
import { validQuantity } from './quantities.mjs'

export const consumptionId = id => `counter-consumption:${id}`
const rounded = n => Math.round(n * 1000) / 1000
export function validateRecipe(recipe = []) {
  if (!Array.isArray(recipe) || recipe.length > 50) throw new Error('Use up to 50 ingredients per recipe.')
  const ids = new Set()
  for (const row of recipe) {
    if (typeof row.productId !== 'string' || !row.productId || ids.has(row.productId) || !validQuantity(row.quantity, 0.001)) throw new Error('Choose each ingredient once and enter a positive quantity with up to three decimals.')
    ids.add(row.productId)
  }
}
export function recipeRequirements(order) {
  const totals = new Map()
  for (const line of order.lines) for (const row of line.ingredients || []) {
    const previous = totals.get(row.productId) || { ...row, quantity: 0 }
    previous.quantity = rounded(previous.quantity + row.quantity * line.quantity)
    totals.set(row.productId, previous)
  }
  return [...totals.values()].sort((a,b) => a.productId.localeCompare(b.productId))
}
export function validateConsumption(record, order, previous) {
  if (record.kind !== 'counter-consumption' || !record.orderId || record.id !== consumptionId(record.orderId) || !record.branchId || !Number.isFinite(Date.parse(record.updatedAt)) || !Array.isArray(record.ingredients) || !record.ingredients.length || record.ingredients.length > 5000) throw new Error('Invalid ingredient consumption.')
  if (previous && JSON.stringify(record) !== JSON.stringify(previous)) throw new Error('Ingredient consumption is already recorded for this order.')
  const ids = new Set()
  for (const row of record.ingredients) {
    if (ids.has(row.productId) || !validQuantity(row.quantity, 0.001) || !Number.isFinite(row.unitCost) || row.unitCost < 0 || !Array.isArray(row.allocations) || !row.allocations.length) throw new Error('Invalid captured ingredient cost or quantity.')
    ids.add(row.productId)
    if (rounded(row.allocations.reduce((sum, part) => sum + part.quantity, 0)) !== row.quantity || row.allocations.some(part => !part.id || !validQuantity(part.quantity, 0.001) || !Number.isFinite(part.unitCost) || part.unitCost < 0)) throw new Error('Ingredient batches do not match the recipe quantity.')
    const actualCost = row.allocations.reduce((sum, part) => sum + part.quantity * part.unitCost, 0) / row.quantity
    if (Math.abs(actualCost - row.unitCost) > 0.000001) throw new Error('Ingredient cost must match its captured batches.')
  }
  const total = Math.round(record.ingredients.reduce((sum, row) => sum + row.quantity * row.unitCost, 0) * 100) / 100
  if (record.totalCost !== total) throw new Error('Ingredient cost total does not match its batches.')
  if (order) {
    if (order.id !== record.orderId || order.branchId !== record.branchId || order.tillId !== record.tillId) throw new Error('Ingredient consumption must use the original order till and branch.')
    const quantities = rows => JSON.stringify(rows.map(({ productId, quantity }) => ({ productId, quantity })).sort((a,b) => a.productId.localeCompare(b.productId)))
    if (quantities(record.ingredients) !== quantities(recipeRequirements(order))) throw new Error('Ingredient consumption does not match the saved recipe.')
  }
}
function event(record, row) {
  return { id: `${record.id}:${row.productId}`, branchId: record.branchId, productId: row.productId, delta: -row.quantity, createdAt: record.updatedAt, category: 'recipe-consumption', reason: `Prepare order ${record.orderId}`, allocations: row.allocations, unitCost: row.unitCost }
}
function movement(record, row, organizationId) {
  const columns = organizationId ? 'id,organization_id,product_id,quantity,reason,created_at,branch_id' : 'id,product_id,quantity,reason,created_at,branch_id'
  const values = [`${record.id}:${row.productId}`, ...(organizationId ? [organizationId] : []), row.productId, -row.quantity, `Recipe: order ${record.orderId}`, record.updatedAt, record.branchId]
  return [`INSERT OR IGNORE INTO inventory_movements (${columns}) VALUES (${values.map(() => '?').join(',')})`, values]
}
export async function consumeRecipe(db, order, updatedAt, organizationId) {
  const record = { id: consumptionId(order.id), kind: 'counter-consumption', orderId: order.id, branchId: order.branchId, tillId: order.tillId, updatedAt, expectedUpdatedAt: '', staffId: order.staffId, ingredients: [], totalCost: 0 }
  for (const row of recipeRequirements(order)) {
    const stock = (await db.query('SELECT stock FROM branch_inventory WHERE branch_id=? AND product_id=?', [order.branchId, row.productId])).values[0]
    if (!stock || Number(stock.stock) + 0.000001 < row.quantity) throw new Error(`Not enough ${row.name || 'ingredient'} to prepare this order. Restock or reduce the queued order.`)
    const captured = await stockChange(db, { ...event(record, row), allocations: undefined, unitCost: undefined })
    const ingredient = { ...row, unitCost: captured.unitCost, allocations: captured.allocations }
    record.ingredients.push(ingredient)
    await db.run('UPDATE branch_inventory SET stock=ROUND(stock-?,3),updated_at=? WHERE branch_id=? AND product_id=?', [row.quantity, updatedAt, order.branchId, row.productId], false)
    const [sql, params] = movement(record, row, organizationId)
    await db.run(sql, params, false)
  }
  record.totalCost = Math.round(record.ingredients.reduce((sum, row) => sum + row.quantity * row.unitCost, 0) * 100) / 100
  validateConsumption(record, order)
  return record
}
// A consumed ingredient cannot be put back by a refund or a rejected status edit.
// Replay the physical preparation event once, independently of mutable orders.
export async function applyConsumption(db, record, organizationId) {
  validateConsumption(record)
  for (const row of record.ingredients) {
    const input = event(record, row)
    if ((await db.query('SELECT id FROM stock_events WHERE id=?', [input.id])).values.length) continue
    await stockChange(db, { ...input, completedSale: true })
    await db.run('UPDATE branch_inventory SET stock=ROUND(stock-?,3),updated_at=? WHERE branch_id=? AND product_id=?', [row.quantity, record.updatedAt, record.branchId, row.productId], false)
    const [sql, params] = movement(record, row, organizationId)
    await db.run(sql, params, false)
  }
}
export function applyConsumptionSync(db, record, organizationId) {
  validateConsumption(record)
  for (const row of record.ingredients) {
    const input = event(record, row)
    if (db.query('SELECT id FROM stock_events WHERE id=?', [input.id]).values.length) continue
    stockChangeSync(db, { ...input, completedSale: true })
    db.run('UPDATE branch_inventory SET stock=ROUND(stock-?,3),updated_at=? WHERE branch_id=? AND product_id=?', [row.quantity, record.updatedAt, record.branchId, row.productId])
    const [sql, params] = movement(record, row, organizationId)
    db.run(sql, params)
  }
}
