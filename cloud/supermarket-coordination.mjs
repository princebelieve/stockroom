// MongoDB transactions serialize competing events across cloud instances.
// Financial events already completed offline are retained and discrepancies
// are reported for owner reconciliation instead of silently dropping receipts.
export function coordinationChanges(document, original) {
  const p=document.payload||{},changes=[]
  const stock=(branch,product,delta,before)=>{if(!String(product).startsWith('service:'))changes.push({key:`stock:${branch||'main'}:${product}`,delta,initial:Number(before)||0,label:'Stock oversold across tills'})}
  if(document.entityType==='stock' && document.action==='adjust')stock(p.branchId,p.productId||document.entityId,Number(p.amount),p.beforeStock)
  if(document.entityType==='sale' && document.action==='create')for(const [index,line] of (p.items||[]).entries()){
    stock(p.branchId,line.productId,-Number(line.quantity),line.beforeStock)
    changes.push({key:`return:${p.id}:${index}`,delta:Number(line.quantity),initial:0,label:'Receipt return quantity exceeded'})
  }
  if(document.entityType==='sale' && document.action==='create' && p.paymentDetails?.pos?.customerId) {
    const pos=p.paymentDetails.pos
    changes.push({key:`loyalty:${p.branchId||'main'}:${pos.customerId}`,delta:Number(pos.loyaltyEarned||0)-Number(pos.loyaltyRedeemed||0),initial:Number(pos.loyaltyBeforeBalance||0),label:'Customer rewards spent across offline tills'})
  }
  if(document.entityType==='pos_record' && p.kind==='return' && p.loyaltyCustomerId)changes.push({key:`loyalty:${p.branchId||'main'}:${p.loyaltyCustomerId}`,delta:Number(p.loyaltyRestored||0)-Number(p.loyaltyReversed||0),initial:0,label:'Customer rewards reversed after returns'})
  if(document.entityType==='branch_transfer') {stock(p.fromBranchId,p.productId,-Number(p.quantity),p.sourceBeforeStock);stock(p.toBranchId,p.productId,Number(p.quantity),p.destinationBeforeStock)}
  if(document.entityType==='stocktake' && document.action==='approved')for(const line of p.counts||[])stock(p.branchId,line.productId,Number(line.variance),line.beforeStock)
  if(document.entityType==='retail_record') {
    if(p.kind==='order')for(const line of p.lines)changes.push({key:`order:${p.id}:${line.productId}`,delta:line.units,initial:0,label:'Order delivery quantity exceeded'})
    if(['receipt','waste','supplier-return'].includes(p.kind))for(const line of p.lines){
      stock(p.branchId,line.productId,p.kind==='receipt'?line.units:-line.units,line.beforeStock)
      if(p.kind==='receipt'){changes.push({key:`supplier-return:${p.id}:${line.productId}`,delta:line.units,initial:0,label:'Supplier return quantity exceeded'});if(p.orderId)changes.push({key:`order:${p.orderId}:${line.productId}`,delta:-line.units,initial:original?.lines?.find(row=>row.productId===line.productId)?.units||0,label:'Order delivery quantity exceeded'})}
      if(p.kind==='supplier-return')changes.push({key:`supplier-return:${p.receiptId}:${line.productId}`,delta:-line.units,initial:original?.lines?.find(row=>row.productId===line.productId)?.units||0,label:'Supplier return quantity exceeded'})
    }
  }
  if(document.entityType==='pos_record' && p.kind==='return')for(const line of p.items||[]){
    const originalLine=original?.items?.[line.lineIndex]
    changes.push({key:`return:${p.saleId}:${line.lineIndex}`,delta:-line.quantity,initial:originalLine?.quantity||0,label:'Receipt return quantity exceeded'})
    if(line.restock)stock(p.branchId,line.productId,line.quantity,0)
  }
  return changes
}
export function createSupermarketCoordinator(database,client) {
  const resources=database.collection('supermarket_resources'),admissions=database.collection('supermarket_admissions'),operations=database.collection('sync_operations')
  return async document=>{
    const session=client.startSession();let warnings=[]
    try {await session.withTransaction(async()=>{
      const admissionId=`${document.businessId}:${document.operationId}`
      const previous=await admissions.findOne({_id:admissionId},{session})
      if(previous){warnings=previous.warnings;return}
      const p=document.payload||{}
      let original
      if(document.entityType==='pos_record' && p.kind==='return')original=(await operations.findOne({businessId:document.businessId,entityType:'sale',entityId:p.saleId},{session}))?.payload
      if(document.entityType==='retail_record' && (p.orderId||p.receiptId))original=(await operations.findOne({businessId:document.businessId,entityType:'retail_record',entityId:p.orderId||p.receiptId},{session}))?.payload
      warnings=[]
      for(const change of coordinationChanges(document,original)){
        if(!Number.isFinite(change.delta))throw new Error('Invalid coordinated quantity.')
        const key=`${document.businessId}:${change.key}`
        const current=await resources.findOne({_id:key},{session})
        const value=Math.round(((current?.value??change.initial)+change.delta)*1000)/1000
        if(value<0)warnings.push(`${change.label}: ${change.key} is short by ${-value}. Review the original receipts and reconcile ${change.key.startsWith('loyalty:') ? 'customer rewards' : 'stock'}.`)
        await resources.updateOne({_id:key},{$set:{businessId:document.businessId,value,updatedAt:new Date(),operationId:document.operationId}},{upsert:true,session})
      }
      await admissions.insertOne({_id:admissionId,warnings,createdAt:new Date()},{session})
    })}finally{await session.endSession()}
    return warnings
  }
}
