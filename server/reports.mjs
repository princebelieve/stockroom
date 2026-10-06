import { supplierAccounts } from './supplier-accounts.mjs'
import { reportCalendar, reportTimeZone } from './report-timezone.mjs'
// All adapters use receipt totals once and the costs captured at sale time.
export function buildReports({ sales, items, products, expenses, returns = [], retail = [], batches = [], adjustments = [], registers = [], reportingTimeZone = 'UTC' }, date = new Date()) {
  reportingTimeZone = reportTimeZone(reportingTimeZone)
  const calendar = reportCalendar(reportingTimeZone, date)
  const day = calendar(date.toISOString())
  const monday = new Date(`${day}T00:00:00Z`); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  const week = monday.toISOString().slice(0, 10)
  const month = `${day.slice(0, 7)}-01`
  const within = (value, start) => { const civil = calendar(value); return Boolean(civil && civil >= start && civil <= day) }
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100
  const window = start => {
    const selected = sales.filter(sale => within(sale.createdAt, start))
    const refunded = returns.filter(record => within(record.updatedAt, start)).reduce((sum, record) => sum + Number(record.total), 0)
    return { total: round(selected.reduce((sum, sale) => sum + Number(sale.total), 0) - refunded), count: selected.length }
  }
  const monthlySales = new Set(sales.filter(sale => within(sale.createdAt, month)).map(sale => sale.id))
  let cost = items.filter(item => monthlySales.has(item.saleId)).reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitCost || 0), 0)
  for (const record of returns.filter(record => within(record.updatedAt, month))) {
    const original = items.filter(item => item.saleId === record.saleId)
    for (const item of record.items) {
      // Unrestocked goods remain a cost to the business.
      if (item.restock) cost -= item.batchAllocations?.length
        ? item.batchAllocations.reduce((sum, part) => sum + Number(part.quantity) * Number(part.unitCost), 0)
        : Number(item.quantity) * Number(item.unitCost ?? original[item.lineIndex]?.unitCost ?? 0)
    }
  }
  const parse=value=>typeof value==='string'?JSON.parse(value):value
  const taxOf=sale=>Number(parse(sale.paymentDetails)?.pos?.pricing?.tax||0)
  let tax=sales.filter(sale=>within(sale.createdAt,month)).reduce((sum,sale)=>sum+taxOf(sale),0)
  for (const refund of returns.filter(record => within(record.updatedAt, month))) {
    const sale = sales.find(row => row.id === refund.saleId)
    const pricing = parse(sale?.paymentDetails)?.pos?.pricing
    for (const item of refund.items || []) {
      const originalQuantity = Number(sale?.items?.[item.lineIndex]?.quantity || items.filter(row => row.saleId === refund.saleId)[item.lineIndex]?.quantity || 1)
      tax -= Number(item.tax ?? Number(pricing?.lines?.[item.lineIndex]?.tax || 0) * item.quantity / originalQuantity)
    }
  }
  const waste=retail.filter(record=>record.kind==='waste' && within(record.createdAt,month)).reduce((sum,record)=>sum+record.lines.reduce((total,line)=>total+line.units*line.unitCost,0),0)
  const purchases=retail.filter(record=>['receipt','supplier-return'].includes(record.kind) && within(record.createdAt,month)).reduce((sum,record)=>sum+record.lines.reduce((total,line)=>total+line.units*line.unitCost,0)*(record.kind==='receipt'?1:-1),0)
  const outstanding=retail.filter(record=>record.kind==='order').flatMap(order=>order.lines.map(line=>({orderId:order.id,reference:order.reference,productName:line.productName,quantity:Math.max(0,line.units-retail.filter(record=>record.kind==='receipt' && record.orderId===order.id).flatMap(record=>record.lines).filter(row=>row.productId===line.productId).reduce((sum,row)=>sum+row.units,0))}))).filter(row=>row.quantity>0)
  const sellers=new Map()
  for(const item of items.filter(row=>monthlySales.has(row.saleId))){const key=item.productId||item.productName||'Product';const row=sellers.get(key)||{productName:item.productName||key,quantity:0};row.quantity+=Number(item.quantity);sellers.set(key,row)}
  for (const record of returns.filter(row => within(row.updatedAt, month))) {
    for (const item of record.items || []) {
      const original = items.filter(row => row.saleId === record.saleId)[item.lineIndex]
      const key = item.productId || original?.productId || item.productName || original?.productName || 'Product'
      const row = sellers.get(key)
      if (row) row.quantity = Math.max(0, row.quantity - Number(item.quantity))
    }
  }
  const zeroCostSaleLines = items.filter(item => monthlySales.has(item.saleId) && !String(item.productId || '').startsWith('service:') && !(Number(item.unitCost) > 0)).length
  const costValue=products.reduce((sum,product)=>{const lots=batches.filter(lot=>lot.product_id===product.id);const tracked=lots.reduce((total,lot)=>total+lot.quantity,0);return sum+lots.reduce((total,lot)=>total+lot.quantity*lot.unit_cost,0)+Math.max(0,Number(product.stock)-tracked)*Number(product.cost||0)},0)
  const stockLoss=adjustments.filter(row=>row.category==='stock-loss' && within(row.createdAt,month)).reduce((sum,row)=>sum+Math.max(0,-Number(row.delta))*Number(row.unitCost||0),0)
  const ingredientCost=adjustments.filter(row=>row.category==='recipe-consumption' && within(row.createdAt,month)).reduce((sum,row)=>sum+Math.max(0,-Number(row.delta))*Number(row.unitCost||0),0)
  const cashDifference=registers.filter(row=>row.closedAt && within(row.closedAt,month)).reduce((sum,row)=>sum+Number(row.difference||0),0)
  const revenue = round(window(month).total-tax)
  const expenseTotal = expenses.filter(expense => within(expense.incurredAt, month)).reduce((sum, expense) => sum + Number(expense.amount), 0)
  return {
    reportingTimeZone,
    daily: window(day), weekly: window(week), monthly: window(month),
    inventory: { value: round(products.reduce((sum, product) => sum + Number(product.stock || 0) * Number(product.price || 0), 0)), products: products.length, lowStock: products.filter(product => Number(product.stock) <= Number(product.reorder)).length },
    supermarket: { suppliers:supplierAccounts(retail), stockLoss:round(stockLoss),cashShortage:round(registers.filter(row=>row.closedAt && within(row.closedAt,month)).reduce((sum,row)=>sum+Math.max(0,-Number(row.difference||0)),0)),cashSurplus:round(registers.filter(row=>row.closedAt && within(row.closedAt,month)).reduce((sum,row)=>sum+Math.max(0,Number(row.difference||0)),0)),zeroCostSaleLines, tax:round(tax),costValue: round(costValue), purchases: round(purchases), wastage: round(waste), outstanding, bestSellers: [...sellers.values()].filter(row=>row.quantity>0).sort((a,b)=>b.quantity-a.quantity).slice(0,20), expired: batches.filter(lot=>lot.quantity>0 && lot.expiry && lot.expiry<day) },
    profit: { revenue, cost: round(cost + ingredientCost), ...(ingredientCost ? { ingredientCost: round(ingredientCost) } : {}), expenses: round(expenseTotal), amount: round(revenue - cost - ingredientCost - expenseTotal - waste - stockLoss + cashDifference) },
  }
}
