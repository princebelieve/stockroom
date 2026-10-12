import { buildReports } from '../../server/reports.mjs'
import { normalizeShopProfile } from '../../server/shop-profile.mjs'

type LocalDatabase = {
  query: (sql: string, parameters?: unknown[]) => Promise<{ values?: Record<string, any>[] }>
}

// Owner metrics are read from the same local SQLite database and report
// calculation as the rest of the app. This is important for browser PWA and
// Android, where /api requests are handled locally rather than by server/index.
export async function getLocalOwnerMetrics(db: LocalDatabase, branchId: string) {
  const sales = (await db.query(
    'SELECT id, total, created_at AS createdAt FROM sales WHERE branch_id = ?',
    [branchId],
  )).values || []
  const products = (await db.query(
    'SELECT p.id, COALESCE(i.stock, 0) AS stock, COALESCE(i.reorder_point, p.reorder_point) AS reorder, p.price FROM products p LEFT JOIN branch_inventory i ON i.product_id = p.id AND i.branch_id = ?',
    [branchId],
  )).values || []
  const returns = ((await db.query(
    "SELECT payload FROM pos_records WHERE scope = 'business' AND branch_id = ? AND kind = 'return'",
    [branchId],
  )).values || []).map(row => JSON.parse(String(row.payload)))
  const settings = (await db.query('SELECT shop_profile FROM app_settings WHERE id = 1')).values?.[0]
  const reports = buildReports({
    sales,
    items: [],
    products,
    expenses: [],
    returns,
    reportingTimeZone: normalizeShopProfile(settings?.shop_profile).reportingTimeZone,
  })

  return {
    salesToday: reports.daily.total,
    saleCount: reports.daily.count,
    inventoryValue: reports.inventory.value,
    productCount: reports.inventory.products,
    lowStock: reports.inventory.lowStock,
  }
}
