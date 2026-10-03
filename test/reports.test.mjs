import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildReports } from '../server/reports.mjs'

const date = new Date(2026, 9, 14, 12)
const current = new Date(2026, 9, 14, 10).toISOString()
const old = new Date(2026, 8, 30, 10).toISOString()
const data = {
  sales: [{ id: 'basket', total: 30, createdAt: current }, { id: 'old', total: 100, createdAt: old }],
  items: [{ saleId: 'basket', quantity: 2, unitCost: 4 }, { saleId: 'basket', quantity: 1, unitCost: 6 }, { saleId: 'old', quantity: 1, unitCost: 40 }],
  products: [{ stock: 2.5, price: 10, reorder: 3 }],
  expenses: [{ amount: 3, incurredAt: current }, { amount: 50, incurredAt: old }],
}

test('reports count basket revenue once and use current-month sale costs and expenses', () => {
  const result = buildReports(data, date)
  assert.deepEqual(result.profit, { revenue: 30, cost: 14, expenses: 3, amount: 13 })
  assert.deepEqual(result.monthly, { total: 30, count: 1 })
  assert.equal(result.inventory.value, 25)
})

test('refunds reduce revenue on return date; only restocked goods reverse their original cost', () => {
  const returns = [{ saleId: 'basket', total: 10, updatedAt: current, items: [{ lineIndex: 0, quantity: 1, restock: true }] },
    { saleId: 'old', total: 20, updatedAt: current, items: [{ lineIndex: 0, quantity: 0.5, restock: false }] }]
  const result = buildReports({ ...data, returns }, date)
  assert.deepEqual(result.profit, { revenue: 0, cost: 10, expenses: 3, amount: -13 })
  assert.deepEqual(result.daily, { total: 0, count: 1 })
  returns[1].items[0].restock = true
  assert.equal(buildReports({ ...data, returns }, date).profit.cost, -10)
})

test('weekly reports start on Monday and exclude future receipts', () => {
  const sales = [
    { id: 'sunday', total: 10, createdAt: new Date(2026, 9, 11, 10).toISOString() },
    { id: 'monday', total: 20, createdAt: new Date(2026, 9, 12, 10).toISOString() },
    { id: 'future', total: 90, createdAt: new Date(2026, 9, 15, 10).toISOString() },
  ]
  assert.deepEqual(buildReports({ ...data, sales }, date).weekly, { total: 20, count: 1 })
})

test('profit deducts tax, actual restocked return cost, expenses and wastage without expensing unsold deliveries', () => {
  const result = buildReports({
    sales: [{ id: 'sale', total: 330, createdAt: current, paymentDetails: JSON.stringify({ pos: { pricing: { tax: 30 } } }) }],
    items: [{ saleId: 'sale', productId: 'milk', productName: 'Milk', quantity: 3, unitCost: 40 }],
    products: [{ id: 'milk', stock: 8, price: 100, cost: 50, reorder: 1 }],
    expenses: [{ amount: 20, incurredAt: current }, { amount: 500, incurredAt: old }],
    returns: [{ saleId: 'sale', total: 110, updatedAt: current, items: [{ lineIndex: 0, productId: 'milk', quantity: 1, unitCost: 20, tax: 10, restock: true }] }],
    retail: [{ kind: 'receipt', createdAt: current, lines: [{ units: 10, unitCost: 50 }] },
      { kind: 'waste', createdAt: current, lines: [{ units: 2, unitCost: 50 }] }],
    batches: [{ product_id: 'milk', quantity: 8, unit_cost: 50, expiry: '' }],
  }, date)
  assert.deepEqual(result.profit, { revenue: 200, cost: 100, expenses: 20, amount: -20 })
  assert.equal(result.supermarket.tax, 20)
  assert.equal(result.supermarket.purchases, 500)
  assert.equal(result.supermarket.wastage, 100)
  assert.equal(result.supermarket.costValue, 400)
  assert.equal(result.supermarket.bestSellers[0].quantity, 2)
})

test('zero-cost goods flag incomplete profit data while service lines do not', () => {
  const result = buildReports({ ...data, items: [
    { saleId: 'basket', productId: 'milk', quantity: 1, unitCost: 0 },
    { saleId: 'basket', productId: 'service:delivery', quantity: 1, unitCost: 0 },
  ] }, date)
  assert.equal(result.supermarket.zeroCostSaleLines, 1)
})

test('stock shortages and closed-register differences affect profit once; supplier settlement does not',()=>{
  const result=buildReports({...data,
    adjustments:[{category:'stock-loss',createdAt:current,delta:-2,unitCost:4},{category:'stock-adjustment',createdAt:current,delta:3,unitCost:4}],
    registers:[{closedAt:current,difference:-5},{closedAt:current,difference:2},{difference:-100}],
    retail:[{id:'supplier',kind:'supplier',name:'Supplier'},{kind:'supplier-payment',supplierId:'supplier',amount:100,createdAt:current}],
  },date)
  assert.equal(result.supermarket.stockLoss,8)
  assert.equal(result.supermarket.cashShortage,5)
  assert.equal(result.supermarket.cashSurplus,2)
  assert.equal(result.profit.amount,2)
  assert.equal(result.profit.expenses,3)
})
