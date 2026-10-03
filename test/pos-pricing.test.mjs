import test from 'node:test'
import assert from 'node:assert/strict'
import { priceOrder, refundFor, validatePosSale, loyaltyBalances, validateLoyaltyBalance, validateCheckoutSettings, posSettings } from '../server/pos-pricing.mjs'

test('tax is opt-in, added and included tax preserve discounted line totals', () => {
  const items = [{ productId: 'rice', quantity: 0.125, price: 800 }]
  assert.equal(priceOrder(items).total, 100)
  const added = priceOrder(items, { discountType: 'percent', discountValue: 10, tax: { taxEnabled: true, taxRate: 10 } })
  assert.equal(added.total, 99)
  assert.equal(added.tax, 9)
  const included = priceOrder(items, { tax: { taxEnabled: true, taxIncluded: true, taxRate: 10 } })
  assert.equal(included.total, 100)
  assert.equal(included.tax, 9.09)
  assert.throws(() => validatePosSale({ items, total: 100, paymentDetails: { pos: { tax: { taxEnabled: true, taxRate: 10 } } } }), /total does not match/)
})

test('discount allocation never makes a tiny line negative and preserves every cent', () => {
  const items = Array.from({ length: 101 }, (_, index) => ({ productId: String(index), quantity: 1, price: index === 100 ? 0 : 0.01 }))
  const pricing = priceOrder(items, { discountType: 'percent', discountValue: 50 })
  assert.equal(pricing.total, 0.5)
  assert.ok(pricing.lines.every(line => line.total >= 0))
  assert.equal(Math.round(pricing.lines.reduce((sum, line) => sum + line.discount, 0) * 100), 50)
})

test('successive partial returns refund the original discounted tax-inclusive amount exactly', () => {
  const items = [{ productId: 'item', quantity: 3, price: 0.99 }]
  const pricing = priceOrder(items, { discountValue: 0.02, tax: { taxEnabled: true, taxRate: 7.5 } })
  const sale = { items, paymentDetails: { pos: { pricing } } }
  const previous = []
  for (let i = 0; i < 3; i++) previous.push(refundFor(sale, previous, [{ lineIndex: 0, quantity: 1, restock: true }]))
  assert.equal(Math.round(previous.reduce((sum, record) => sum + record.total, 0) * 100), Math.round(pricing.total * 100))
  assert.throws(() => refundFor(sale, previous, [{ lineIndex: 0, quantity: 1 }]), /remaining/)
  assert.throws(() => refundFor(sale, [], [{ lineIndex: 0, quantity: 1 }, { lineIndex: 0, quantity: 1 }]), /once/)
})

test('partial returns preserve the actual returned batch cost and cumulative tax rounding', () => {
  const items = [{ productId: 'milk', quantity: 3, price: 0.99, unitCost: 4,
    batchAllocations: [{ id: 'first', quantity: 1, unitCost: 2 }, { id: 'second', quantity: 2, unitCost: 5 }] }]
  const pricing = priceOrder(items, { tax: { taxEnabled: true, taxRate: 7.5 } })
  const sale = { items, paymentDetails: { pos: { pricing } } }
  const returns = []
  for (let i = 0; i < 3; i++) returns.push(refundFor(sale, returns, [{ lineIndex: 0, quantity: 1, restock: true }]))
  assert.deepEqual(returns.map(record => record.items[0].unitCost), [2, 5, 5])
  assert.equal(Math.round(returns.reduce((sum, record) => sum + record.items[0].tax, 0) * 100), Math.round(pricing.tax * 100))
})


test('mixed and exempt tax rates preserve discounts, included tax and partial refunds', () => {
  const items = [{productId:'taxed',quantity:3,price:10},{productId:'exempt',quantity:1,price:10}]
  const tax = {taxEnabled:true,taxRate:20,taxRates:{taxed:10,exempt:0}}
  const pricing = priceOrder(items,{tax,discountValue:4})
  assert.equal(pricing.tax,2.7)
  assert.equal(pricing.total,38.7)
  const sale={items,total:pricing.total,paymentDetails:{pos:{pricing}}}
  const first=refundFor(sale,[],[{lineIndex:0,quantity:1}])
  const rest=refundFor(sale,[first],[{lineIndex:0,quantity:2},{lineIndex:1,quantity:1}])
  assert.equal(Math.round((first.total+rest.total)*100),3870)
  const included=priceOrder(items,{tax:{...tax,taxIncluded:true}})
  assert.equal(included.total,40)
  assert.equal(included.tax,2.73)
  assert.throws(()=>priceOrder(items,{tax:{...tax,taxRates:{taxed:-1}}}),/rates/)
})

test('offline rewards spend only an existing balance and returns restore all cents once', () => {
  const opening={id:'earned',paymentDetails:{pos:{customerId:'c',loyaltyEarned:5}}}
  const items=[{productId:'a',quantity:3,price:1.01},{productId:'b',quantity:1,price:2}]
  const pos={customerId:'c',loyaltyRedeemed:1.03,tax:{loyaltyEnabled:true,loyaltyRate:10}}
  const pricing=priceOrder(items,pos)
  const sale=validatePosSale({id:'spent',items,total:pricing.total,paymentDetails:{pos}})
  validateLoyaltyBalance(sale,[opening],[])
  assert.equal(sale.paymentDetails.pos.loyaltyBeforeBalance,5)
  assert.equal(sale.paymentDetails.pos.loyaltyEarned,0.4)
  const returns=[]
  for(let i=0;i<3;i++)returns.push(refundFor(sale,returns,[{lineIndex:0,quantity:1}]))
  returns.push(refundFor(sale,returns,[{lineIndex:1,quantity:1}]))
  assert.equal(Math.round(returns.reduce((n,r)=>n+r.loyaltyRestored,0)*100),103)
  assert.equal(Math.round(returns.reduce((n,r)=>n+r.loyaltyReversed,0)*100),40)
  assert.equal(loyaltyBalances([opening,sale],returns).c,5)
  assert.equal(Math.round(returns.reduce((n,r)=>n+r.total,0)*100),400)
  assert.throws(()=>validateLoyaltyBalance(sale,[],[]),/Insufficient/)
  assert.throws(()=>priceOrder(items,{...pos,customerId:''}),/select a customer/)
  assert.throws(()=>validateCheckoutSettings(sale,{}),/settings changed/)
  validateCheckoutSettings(sale,pos.tax)
})


test('optional offline stock pools restrict every till to its own allocated inventory',()=>{
  const settings={offlineStockPoolsEnabled:true,stockPools:{tillA:'counter-a',tillB:'counter-b'}}
  const sale={branchId:'counter-a',items:[],paymentDetails:{pos:{tillId:'tillA',tax:settings}}}
  validateCheckoutSettings(sale,settings)
  assert.throws(()=>validateCheckoutSettings({...sale,branchId:'counter-b'},settings),/assigned stock/)
  assert.throws(()=>validateCheckoutSettings({...sale,paymentDetails:{pos:{tillId:'unknown'}}},settings),/assigned stock/)
  assert.throws(()=>posSettings({...settings,stockPools:{tillA:'same',tillB:'same'}}),/own stock/)
  assert.throws(()=>posSettings({offlineStockPoolsEnabled:true}),/Assign/)
  validateCheckoutSettings({branchId:'main',items:[]},{})
})
