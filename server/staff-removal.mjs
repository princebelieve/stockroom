export async function ensureStaffRemovals(db) {
  await db.run('CREATE TABLE IF NOT EXISTS staff_removals (id TEXT PRIMARY KEY, removed_at TEXT NOT NULL)')
}
export async function recordStaffRemoval(db, id, removedAt) {
  await ensureStaffRemovals(db)
  await db.run('INSERT OR IGNORE INTO staff_removals (id, removed_at) VALUES (?, ?)', [id, removedAt])
  await db.run('UPDATE users SET operational_access = 0 WHERE id = ? AND role IN (\'admin\', \'cashier\')', [id])
}
