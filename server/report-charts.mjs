// Display aggregates only. Financial reporting and entitlement logic are unchanged.
export function reportCharts({sales,items,expenses,returns,sellers,calendar,month,day}) {
 const round=value=>Math.round((value+Number.EPSILON)*100)/100
 const within=value=>{const date=calendar(value);return date&&date>=month&&date<=day}
 const dates=new Map(),payments=new Map(),categories=new Map()
 for(let date=new Date(`${month}T00:00:00Z`);date.toISOString().slice(0,10)<=day;date.setUTCDate(date.getUTCDate()+1))dates.set(date.toISOString().slice(0,10),0)
 const labels={'cash':'Cash','bank-transfer':'Bank transfer','external-pos':'External POS','wallet':'Wallet','multiple':'Split payment'}
 for(const sale of sales.filter(row=>within(row.createdAt))){const date=calendar(sale.createdAt);dates.set(date,(dates.get(date)||0)+Number(sale.total));const label=labels[sale.paymentMethod]||sale.paymentMethod||'Unspecified';payments.set(label,(payments.get(label)||0)+Number(sale.total))}
 for(const refund of returns.filter(row=>within(row.updatedAt))){const date=calendar(refund.updatedAt);dates.set(date,(dates.get(date)||0)-Number(refund.total))}
 for(const expense of expenses.filter(row=>within(row.incurredAt))){const label=expense.category||'Uncategorised';categories.set(label,(categories.get(label)||0)+Number(expense.amount))}
 const rows=map=>[...map].map(([label,value])=>({label,value:round(value)}))
 return {daily:rows(dates),payments:rows(payments).sort((a,b)=>b.value-a.value),products:[...sellers.values()].filter(row=>row.quantity>0).sort((a,b)=>b.quantity-a.quantity).slice(0,8).map(row=>({label:row.productName,value:round(row.quantity)})),expenses:rows(categories).sort((a,b)=>b.value-a.value)}
}
