const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100
export function supplierAccounts(records, branchId) {
  return records.filter(row => row.kind === 'supplier').map(supplier => {
    const entries = records.filter(row => row.supplierId === supplier.id && (!branchId || row.branchId === branchId))
    let balance = 0
    const ledger = []
    for (const row of [...entries].sort((a,b)=>a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
      let amount = 0
      if (row.kind === 'supplier-opening') amount = row.amount
      if (row.kind === 'receipt' && row.accountingVersion === 1) amount = money(row.lines.reduce((sum,line)=>sum+line.units*line.unitCost,0)) - Number(row.amountPaid || 0)
      if (row.kind === 'supplier-return') {
        const receipt = records.find(record=>record.id===row.receiptId)
        if (receipt?.accountingVersion === 1) amount = -money(row.lines.reduce((sum,line)=>sum+line.units*line.unitCost,0))
      }
      if (row.kind === 'supplier-payment') amount = -row.amount
      if (row.kind === 'supplier-refund') amount = row.amount
      if (!['receipt','supplier-return','supplier-opening','supplier-payment','supplier-refund'].includes(row.kind)) continue
      if (['receipt','supplier-return'].includes(row.kind) && !amount && row.accountingVersion !== 1 && !records.find(record=>record.id===row.receiptId)?.accountingVersion) continue
      balance = money(balance + amount)
      ledger.push({...row, accountAmount:money(amount), balance})
    }
    return {id:supplier.id,name:supplier.name,phone:supplier.phone,balance,ledger,
      legacyDeliveries:entries.filter(row=>row.kind==='receipt' && row.accountingVersion!==1).length}
  })
}
