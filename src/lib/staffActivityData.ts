type ActivityDb = {
  query(sql: string, parameters?: unknown[]): Promise<{ values?: Array<Record<string, unknown>> }>
}

export type StaffActivitySummary = {
  staffId: string; staffName: string; role: string
  salesCount: number; salesTotal: number
  expensesCount: number; expensesTotal: number
  voidsCount: number; voidsTotal: number
}
export type StaffActivityEvent = {
  id: string; staffId: string; staffName: string; type: 'sale' | 'expense' | 'void'
  amount: number; occurredAt: string; detail: string; recordedAt?: string
}

export async function collectStaffActivity(db: ActivityDb, branchId: string, from: string, to: string) {
  const [usersResult, salesResult, expensesResult, voidsResult] = await Promise.all([
    db.query("SELECT id, name, role FROM users ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, name"),
    db.query('SELECT id, staff_id AS staffId, staff_name AS staffName, total AS amount, payment_method AS detail, created_at AS occurredAt FROM sales WHERE branch_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at DESC', [branchId, from, to]),
    db.query('SELECT id, staff_id AS staffId, staff_name AS staffName, amount, incurred_at AS occurredAt, created_at AS recordedAt, category, description FROM expenses WHERE branch_id = ? AND incurred_at >= ? AND incurred_at < ? ORDER BY incurred_at DESC', [branchId, from, to]),
    db.query('SELECT id, staff_id AS staffId, staff_name AS staffName, quantity * unit_price AS amount, created_at AS occurredAt, quantity, product_name AS productName, reason FROM sale_item_voids WHERE branch_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at DESC', [branchId, from, to]),
  ])
  const staff = new Map<string, StaffActivitySummary>()
  for (const user of usersResult.values || []) staff.set(String(user.id), { staffId: String(user.id), staffName: String(user.name), role: String(user.role), salesCount: 0, salesTotal: 0, expensesCount: 0, expensesTotal: 0, voidsCount: 0, voidsTotal: 0 })
  const events: StaffActivityEvent[] = []
  const add = (type: StaffActivityEvent['type'], record: Record<string, unknown>) => {
    const staffId = String(record.staffId || '') || `legacy:${String(record.staffName || 'unknown')}`
    const staffName = String(record.staffName || '') || (staffId.startsWith('legacy:') ? 'Unattributed older record' : staff.get(staffId)?.staffName || 'Former staff account')
    let row = staff.get(staffId)
    if (!row) {
      row = { staffId, staffName, role: 'former/unknown', salesCount: 0, salesTotal: 0, expensesCount: 0, expensesTotal: 0, voidsCount: 0, voidsTotal: 0 }
      staff.set(staffId, row)
    }
    const amount = Number(record.amount) || 0
    if (type === 'sale') { row.salesCount++; row.salesTotal += amount }
    else if (type === 'expense') { row.expensesCount++; row.expensesTotal += amount }
    else { row.voidsCount++; row.voidsTotal += amount }
    const detail = type === 'sale'
      ? `Sale · ${String(record.detail || 'payment recorded')}`
      : type === 'expense'
        ? `Expense recorded · ${String(record.category || 'Other')}: ${String(record.description || '')}`
        : `Item void · ${Number(record.quantity) || 0} × ${String(record.productName || 'Item')}: ${String(record.reason || '')}`
    events.push({ id: `${type}:${String(record.id)}`, staffId, staffName, type, amount, occurredAt: String(record.occurredAt || ''), detail, ...(type === 'expense' ? { recordedAt: String(record.recordedAt || '') } : {}) })
  }
  for (const record of salesResult.values || []) add('sale', record)
  for (const record of expensesResult.values || []) add('expense', record)
  for (const record of voidsResult.values || []) add('void', record)
  events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  return { from, to, staff: [...staff.values()], events: events.slice(0, 300) }
}
