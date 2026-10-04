import { billContains,billSeat } from './restaurant-floor.mjs'
import { posSettings, priceOrder } from './pos-pricing.mjs'
import { stockChange } from './stock-ledger.mjs'
const cents = n => Math.round((Number(n)+Number.EPSILON)*100)
const units = n => Math.round(Number(n)*1000)
export const restaurantLedgerId = sessionId => `restaurant-ledger:${sessionId}`
const originalPricing = order => order.pos?.pricing || priceOrder(order.lines.map(line=>({productId:line.productId||`service:counter:${line.id}`,quantity:line.quantity,price:line.price})))
export function selectionsForOrder(sale, order) {
  if(sale.paymentDetails?.counterOrder?.id===order.id) return order.lines.map((line,index)=>({orderId:order.id,lineId:line.id,quantity:line.quantity,total:originalPricing(order).lines[index].total}))
  return (sale.paymentDetails?.restaurantBill?.selections||[]).filter(part=>part.orderId===order.id)
}
export function restaurantOrderPayment(order,sales) {
  const matching=sales.filter(sale=>selectionsForOrder(sale,order).length)
  const parts=matching.flatMap(sale=>selectionsForOrder(sale,order))
  const paid=parts.reduce((sum,part)=>sum+cents(part.total),0)/100
  return {paidAmount:paid,paymentStarted:matching.length>0,receiptIds:matching.map(sale=>sale.id),receiptId:paid>=order.total-0.000001 ? matching.at(-1)?.id||'' : ''}
}
export function restaurantBillLines(tab,orders,sales) {
  return orders.filter(order=>billContains(tab,order) && order.status!=='cancelled').flatMap(order=>{
    const pricing=originalPricing(order)
    const paid=sales.flatMap(sale=>selectionsForOrder(sale,order))
    return order.lines.map((line,index)=>{
      const covered=paid.filter(part=>part.lineId===line.id)
      const paidUnits=covered.reduce((sum,part)=>sum+units(part.quantity),0)
      const paidAmount=covered.reduce((sum,part)=>sum+cents(part.total),0)
      return {orderId:order.id,lineId:line.id,name:line.name,description:[line.name,...line.options.map(option=>option.name)].join(' / '),seat:billSeat(tab,order),quantity:line.quantity,price:line.price,remaining:Math.max(0,units(line.quantity)-paidUnits)/1000,paidQuantity:paidUnits/1000,paidAmount:paidAmount/100,remainingAmount:Math.max(0,cents(pricing.lines[index].total)-paidAmount)/100,pricing:pricing.lines[index]}
    })
  })
}
export function restaurantPortion(tab,orders,sales,selections) {
  if(!Array.isArray(selections)||!selections.length||selections.length>1000) throw new Error('Select 1 to 1000 bill items to pay for.')
  const available=restaurantBillLines(tab,orders,sales)
  const seen=new Set(), parts=[], items=[], financial=[]
  let redeemed=0,earned=0
  const customers=new Set()
  for(const selection of selections) {
    const key=selection.orderId+':'+selection.lineId
    if(seen.has(key)) throw new Error('Select each bill line once.')
    seen.add(key)
    const row=available.find(row=>row.orderId===selection.orderId && row.lineId===selection.lineId)
    const count=Number(selection.quantity), milli=units(count)
    if(!row || !Number.isFinite(count) || count<=0 || Math.abs(count*1000-milli)>0.000001 || milli>units(row.remaining)) throw new Error('Payment quantity exceeds the unpaid quantity. Refresh this bill.')
    const order=orders.find(order=>order.id===row.orderId),line=order.lines.find(line=>line.id===row.lineId)
    if(order.currency!==tab.currency || order.tillId!==tab.tillId || order.branchId!==tab.branchId) throw new Error('Bill orders must use the same currency, branch and original till.')
    const before=units(row.paidQuantity),after=before+milli,whole=units(row.quantity)
    const share=value=>(Math.round(cents(value)*after/whole)-Math.round(cents(value)*before/whole))/100
    const total=share(row.pricing.total),discount=share(row.pricing.discount),taxIncluded=originalPricing(order).taxSettings.taxIncluded
    // Allocate tax within cumulative paid cents so every printed portion
    // reconciles and a tiny fractional payment cannot have negative subtotal.
    const cumulativeTax=paid=>cents(row.pricing.total)?Math.round(cents(row.pricing.tax)*paid/cents(row.pricing.total)):0
    const tax=(cumulativeTax(Math.round(cents(row.pricing.total)*after/whole))-cumulativeTax(Math.round(cents(row.pricing.total)*before/whole)))/100
    const subtotal=(cents(total)+cents(discount)-(taxIncluded?0:cents(tax)))/100
    const part={orderId:row.orderId,lineId:row.lineId,quantity:count,subtotal,discount,tax,total,taxIncluded,seat:row.seat}
    parts.push(part)
    const productId=line.productId||`service:restaurant:${order.id}:${line.id}`
    items.push({productId,productName:row.description,quantity:count,price:line.price})
    financial.push({productId,quantity:count,subtotal:part.subtotal,discount:part.discount,tax:part.tax,total:part.total})
    if(order.pos?.customerId) {
      customers.add(order.pos.customerId)
      const allocate=reward=>{
        const values=originalPricing(order).lines.map(line=>cents(reward)*line.subtotal/originalPricing(order).subtotal)
        const allocated=values.map(Math.floor)
        let left=cents(reward)-allocated.reduce((a,b)=>a+b,0)
        for(const index of values.map((_,i)=>i).sort((a,b)=>(values[b]-allocated[b])-(values[a]-allocated[a])||a-b)){if(left<=0)break;allocated[index]++;left--}
        return allocated[order.lines.findIndex(line=>line.id===row.lineId)]/100
      }
      redeemed+=share(allocate(order.pos.loyaltyRedeemed||0))
      earned+=share(allocate(cents(order.total*(originalPricing(order).taxSettings.loyaltyEnabled?originalPricing(order).taxSettings.loyaltyRate:0)/100)/100))
    }
  }
  if(customers.size>1) throw new Error('Pay items belonging to different loyalty accounts separately.')
  const sum=key=>parts.reduce((total,part)=>total+cents(part[key]),0)/100
  const taxSettings=posSettings({taxEnabled:parts.some(part=>part.tax>0),taxLabel:'Tax',taxIncluded:parts.every(part=>part.taxIncluded)})
  const pricing={subtotal:sum('subtotal'),discount:sum('discount'),tax:sum('tax'),total:sum('total'),lines:financial,taxSettings,addedTax:parts.filter(part=>!part.taxIncluded).reduce((n,part)=>n+cents(part.tax),0)/100,includedTax:parts.filter(part=>part.taxIncluded).reduce((n,part)=>n+cents(part.tax),0)/100}
  if(pricing.total<=0) throw new Error('Select a positive payment amount.')
  const customerId=[...customers][0]||''
  const pos={tillId:tab.tillId,customerId,customerName:orders.find(order=>order.pos?.customerId===customerId)?.pos?.customerName||'',loyaltyRedeemed:cents(redeemed)/100,loyaltyEarned:cents(earned)/100,tax:taxSettings,pricing,note:`${tab.name} / Bill ${tab.sessionId.slice(0,8).toUpperCase()}`}
  return {parts,items,pricing,pos}
}
export function validateRestaurantPaymentShape(sale) {
  const bill=sale.paymentDetails?.restaurantBill
  if(!bill || !String(sale.id).startsWith('restaurant-payment:') || typeof bill.tabId!=='string' || typeof bill.sessionId!=='string' || typeof bill.name!=='string' || typeof bill.tillId!=='string' || typeof bill.command!=='string' || !Array.isArray(bill.selections) || bill.selections.length!==sale.items?.length || bill.selections.length>1000) throw new Error('Invalid restaurant payment link.')
  const pricing=sale.paymentDetails?.pos?.pricing
  if(!pricing || pricing.lines.length!==sale.items.length || cents(pricing.total)!==cents(sale.total) || cents(pricing.lines.reduce((sum,line)=>sum+line.total,0))!==cents(sale.total)) throw new Error('Invalid restaurant payment pricing.')
  for(const [index,item] of sale.items.entries()) {
    const part=bill.selections[index]
    if(!part.orderId || !part.lineId || !Number.isFinite(item.quantity) || item.quantity<=0 || units(item.quantity)!==units(part.quantity) || !Number.isFinite(item.price) || item.price<0 || cents(part.total)!==cents(pricing.lines[index].total)) throw new Error('Invalid restaurant payment items.')
  }
  return sale
}
export function restaurantPaymentFingerprint(sale) {
  return JSON.stringify([sale.id,sale.branchId,sale.currency,sale.total,sale.items.map(item=>[item.productId,item.productName,item.quantity,item.price??item.unitPrice]),sale.paymentMethod,sale.paymentReference||'',sale.terminalProvider||'',sale.paymentDetails?.amountReceived,sale.paymentDetails?.changeGiven,sale.paymentDetails?.allocations,sale.paymentDetails?.restaurantBill,sale.paymentDetails?.pos,sale.paymentDetails?.receipt])
}
export async function restaurantReceiptHash(sale) {
  const bytes=new TextEncoder().encode(restaurantPaymentFingerprint(sale))
  const hash=await crypto.subtle.digest('SHA-256',bytes)
  return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('')
}
export function validateRestaurantPayment(sale,tab,orders,previousSales) {
  validateRestaurantPaymentShape(sale)
  if(!tab || tab.kind!=='restaurant-tab' || tab.mergedInto || tab.status!=='open' || tab.sessionId!==sale.paymentDetails.restaurantBill.sessionId || tab.id!==sale.paymentDetails.restaurantBill.tabId || tab.branchId!==sale.branchId || tab.currency!==sale.currency || sale.businessName!==tab.businessName || sale.paymentDetails.restaurantBill.currency!==tab.currency || sale.paymentDetails.restaurantBill.businessName!==tab.businessName || tab.tillId!==sale.paymentDetails.restaurantBill.tillId) throw new Error('Synchronize the open bill before its payment.')
  const portion=restaurantPortion(tab,orders,previousSales,sale.paymentDetails.restaurantBill.selections)
  if(['customerId','customerName','loyaltyRedeemed','loyaltyEarned','tax','note','tillId'].some(key=>JSON.stringify(sale.paymentDetails.pos[key])!==JSON.stringify(portion.pos[key]))) throw new Error('Payment rewards and customer must match the saved bill.')
  const actual=sale.items.map(({productId,productName,quantity,price})=>({productId,productName,quantity,price}))
  if(JSON.stringify(portion.parts)!==JSON.stringify(sale.paymentDetails.restaurantBill.selections)||JSON.stringify(portion.items)!==JSON.stringify(actual)||JSON.stringify(portion.pricing)!==JSON.stringify(sale.paymentDetails.pos.pricing)||sale.total!==portion.pricing.total) throw new Error('Payment must match the saved bill items, tax and discounts.')
}
export async function validateRestaurantLedger(record,previous,tab,orders,legacySales=[]) {
  if(record.kind!=='restaurant-ledger' || record.id!==restaurantLedgerId(record.sessionId) || record.tabId!==tab?.id || record.sessionId!==tab?.sessionId || record.branchId!==tab.branchId || !Array.isArray(record.payments) || !Number.isFinite(Date.parse(record.updatedAt)) || record.expectedUpdatedAt!==(previous?.updatedAt||'')) throw new Error('Invalid restaurant payment revision.')
  if(new Set(record.payments.map(payment=>payment.id)).size!==record.payments.length)throw new Error('Use a unique receipt ID for each bill payment.')
  if(previous && ['id','kind','branchId','sessionId','tabId'].some(key=>record[key]!==previous[key]))throw new Error('Preserve the payment ledger identity.')
  const before=previous?.payments||[],entry=record.payments.at(-1),sale=record.latestSale
  if(record.payments.length!==before.length+1||JSON.stringify(record.payments.slice(0,-1))!==JSON.stringify(before)||entry?.id!==sale?.id||entry.receiptHash!==await restaurantReceiptHash(sale)||JSON.stringify(entry.selections)!==JSON.stringify(sale.paymentDetails.restaurantBill.selections)) throw new Error('Preserve previous restaurant payments.')
  const recorded=before.map(payment=>({id:payment.id,paymentDetails:{restaurantBill:{selections:payment.selections}}}))
  validateRestaurantPayment(sale,tab,orders,[...legacySales,...recorded])
}
export function restaurantSaleStatements(sale,organizationId) {
  const columns=['id',...(organizationId?['organization_id']:[]),'total','payment_method','payment_reference','terminal_provider','staff_id','staff_name','created_at','cash_received','change_given','payment_details','branch_id']
  const values=[sale.id,...(organizationId?[organizationId]:[]),sale.total,sale.paymentMethod,sale.paymentReference||'',sale.terminalProvider||'',sale.staffId||'',sale.staffName||'',sale.createdAt,sale.cashReceived??null,sale.changeGiven??null,JSON.stringify(sale.paymentDetails),sale.branchId]
  return [[`INSERT INTO sales (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,values],...sale.items.map((item,index)=>['INSERT INTO sale_items (id,sale_id,product_id,product_name,quantity,unit_price,unit_cost) VALUES (?,?,?,?,?,?,?)',[`${sale.id}:${index}`,sale.id,item.productId,item.productName,item.quantity,item.price,item.unitCost||0]])]
}
export async function saveRestaurantSale(db,sale,organizationId,consumeStock=false) {
  if((await db.query('SELECT id FROM sales WHERE id=?',[sale.id])).values.length) return
  if(consumeStock) for(const [index,item] of sale.items.entries()) if(!item.productId.startsWith('service:')) {
    const product=(await db.query('SELECT stock FROM branch_inventory WHERE product_id=? AND branch_id=?',[item.productId,sale.branchId])).values[0]
    if(!product || (consumeStock!=='remote' && product.stock<item.quantity)) throw new Error('Insufficient packaged stock for this older order.')
    const allocation=await stockChange(db,{id:`${sale.id}:sale:${index}`,branchId:sale.branchId,productId:item.productId,delta:-item.quantity,createdAt:sale.createdAt,completedSale:consumeStock==='remote',allocations:consumeStock==='remote'?item.batchAllocations:undefined,unitCost:item.unitCost})
    item.unitCost=allocation.unitCost;item.batchAllocations=allocation.allocations
    const movementColumns=organizationId?'id,organization_id,product_id,quantity,reason,created_at,branch_id':'id,product_id,quantity,reason,created_at,branch_id'
    await db.run(`INSERT INTO inventory_movements (${movementColumns}) VALUES (${movementColumns.split(',').map(()=>'?').join(',')})`,[`${sale.id}:movement:${index}`,...(organizationId?[organizationId]:[]),item.productId,-item.quantity,'sale',sale.createdAt,sale.branchId])
    await db.run('UPDATE branch_inventory SET stock=stock-? WHERE product_id=? AND branch_id=?',[item.quantity,item.productId,sale.branchId])
  }
  for(const [sql,args] of restaurantSaleStatements(sale,organizationId)) await db.run(sql,args)
  for(const [index,item] of sale.items.entries()) if(item.batchAllocations) await db.run('UPDATE sale_items SET batch_allocations=? WHERE id=?',[JSON.stringify(item.batchAllocations),`${sale.id}:${index}`])
}
