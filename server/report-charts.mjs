// Display aggregates only. Financial reporting and entitlement logic are unchanged.
export function reportCharts({sales,items,expenses,returns,sellers,calendar,month,day,from=month,to=day}) {
 const round=value=>Math.round((value+Number.EPSILON)*100)/100
 const within=value=>{const date=calendar(value);return date&&date>=from&&date<=to}
 const dates=new Map(),payments=new Map(),categories=new Map()
 for(let date=new Date(`${from}T00:00:00Z`),end=new Date(`${to}T00:00:00Z`),count=0;date<=end&&count<366;date.setUTCDate(date.getUTCDate()+1),count++)dates.set(date.toISOString().slice(0,10),0)
 const labels={'cash':'Cash','bank-transfer':'Bank transfer','external-pos':'External POS','wallet':'Wallet','multiple':'Split payment'}
 const selectedSales=sales.filter(row=>within(row.createdAt))
 for(const sale of selectedSales){const date=calendar(sale.createdAt);dates.set(date,(dates.get(date)||0)+Number(sale.total));const label=labels[sale.paymentMethod]||sale.paymentMethod||'Unspecified';payments.set(label,(payments.get(label)||0)+Number(sale.total))}
 for(const refund of returns.filter(row=>within(row.updatedAt))){const date=calendar(refund.updatedAt);dates.set(date,(dates.get(date)||0)-Number(refund.total))}
 for(const expense of expenses.filter(row=>within(row.incurredAt))){const label=expense.category||'Uncategorised';categories.set(label,(categories.get(label)||0)+Number(expense.amount))}
 const rows=map=>[...map].map(([label,value])=>({label,value:round(value)}))
 const selectedSaleIds=new Set(selectedSales.map(sale=>sale.id)),products=new Map()
 for(const item of items.filter(row=>selectedSaleIds.has(row.saleId))){const key=item.productId||item.productName||'Product',entry=products.get(key)||{label:item.productName||key,value:0};entry.value+=Number(item.quantity||0);products.set(key,entry)}
 for(const refund of returns.filter(row=>within(row.updatedAt)))for(const item of refund.items||[]){const original=items.filter(row=>row.saleId===refund.saleId)[item.lineIndex],key=item.productId||original?.productId||item.productName||original?.productName||'Product',entry=products.get(key);if(entry)entry.value=Math.max(0,entry.value-Number(item.quantity||0))}
 return {from,to,daily:rows(dates),payments:rows(payments).sort((a,b)=>b.value-a.value),products:[...products.values()].filter(row=>row.value>0).sort((a,b)=>b.value-a.value).slice(0,8).map(row=>({...row,value:round(row.value)})),expenses:rows(categories).sort((a,b)=>b.value-a.value)}
}
