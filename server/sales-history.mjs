import { businessDayStart, nextBusinessDate } from './report-timezone.mjs'

export async function salesHistory(db, { branchId, organizationId, timeZone = 'UTC', query = '', from = '', to = '', page = 0, pageSize = 50, order = 'newest' }) {
  const size = Math.min(100, Math.max(1, Number(pageSize) || 50)), index = Math.max(0, Math.floor(Number(page) || 0))
  const where = ['s.branch_id = ?'], params = [branchId]
  if (organizationId) { where.push('s.organization_id = ?'); params.push(organizationId) }
  if (from) { where.push('s.created_at >= ?'); params.push(businessDayStart(from,timeZone)) }
  if (to) { where.push('s.created_at < ?'); params.push(businessDayStart(nextBusinessDate(to),timeZone)) }
  if (from && to && from > to) throw new Error('Start date must not follow end date.')
  const search = String(query).trim().slice(0,200).replace(/[\\%_]/g, '\\$&')
  if (search) {
    where.push("(s.id LIKE ? ESCAPE '\\' OR s.staff_name LIKE ? ESCAPE '\\' OR s.payment_method LIKE ? ESCAPE '\\' OR s.payment_reference LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM sale_items i WHERE i.sale_id=s.id AND i.product_name LIKE ? ESCAPE '\\'))")
    params.push(...Array(5).fill(`%${search}%`))
  }
  const filter = where.join(' AND ')
  const total = Number((await db.query(`SELECT COUNT(*) AS total FROM sales s WHERE ${filter}`,params)).values[0].total)
  const sales = (await db.query(`SELECT s.id,s.total,s.created_at AS createdAt,s.staff_name AS staffName,s.payment_method AS paymentMethod,s.payment_reference AS paymentReference FROM sales s WHERE ${filter} ORDER BY s.created_at ${order==='oldest'?'ASC':'DESC'},s.id ${order==='oldest'?'ASC':'DESC'} LIMIT ? OFFSET ?`,[...params,size,index*size])).values
  for (const sale of sales) sale.items = (await db.query('SELECT product_name AS productName,quantity FROM sale_items WHERE sale_id=? ORDER BY rowid',[sale.id])).values
  return { sales,total,page:index,pageSize:size,timeZone }
}
