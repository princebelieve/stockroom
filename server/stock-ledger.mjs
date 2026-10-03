import { quantity } from './quantities.mjs'

export const stockSchema = `CREATE TABLE IF NOT EXISTS stock_batches (
  id TEXT NOT NULL, branch_id TEXT NOT NULL, product_id TEXT NOT NULL,
  batch_number TEXT NOT NULL DEFAULT '', expiry TEXT NOT NULL DEFAULT '',
  quantity REAL NOT NULL CHECK(quantity>=0), unit_cost REAL NOT NULL CHECK(unit_cost>=0),
  received_at TEXT NOT NULL, source_id TEXT NOT NULL, PRIMARY KEY(id,branch_id));
  CREATE INDEX IF NOT EXISTS stock_batches_product ON stock_batches(branch_id,product_id,expiry);
  CREATE TABLE IF NOT EXISTS stock_events(id TEXT PRIMARY KEY,payload TEXT NOT NULL);`
const q = value => Math.round(Number(value) * 1000) / 1000
export function expiryDate(value) {
  if (!value) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value) throw new Error('Enter a valid expiry date.')
  return value
}
export function allocateStock(lots, amount, today, allowExpired=false) {
  let remaining=quantity(amount,0.001)
  const allocations=[]
  const sorted=[...lots].sort((a,b)=>(a.expiry||'9999').localeCompare(b.expiry||'9999') || a.received_at.localeCompare(b.received_at) || a.id.localeCompare(b.id))
  for(const lot of sorted) {
    if(!allowExpired && lot.expiry && lot.expiry < today)continue
    const units=q(Math.min(remaining,Number(lot.quantity)))
    if(units>0)allocations.push({id:lot.id,quantity:units,unitCost:Number(lot.unit_cost),batchNumber:lot.batch_number,expiry:lot.expiry})
    remaining=q(remaining-units)
    if(!remaining)break
  }
  if(remaining>0)throw new Error('Insufficient sellable stock. Review expired batches or synchronize this till.')
  return allocations
}
// One SQL program is executed synchronously on desktop and asynchronously on
// native/browser SQLite. Caller owns the enclosing operation transaction.
function* changeStock(input) {
  const {id,branchId,productId,delta,allowExpired=false,sourceId=id,expiry='',batchNumber='',unitCost,allocations:recorded}=input
  if(!id || !Number.isFinite(delta))throw new Error('Invalid stock event.')
  const existing=(yield ['query','SELECT payload FROM stock_events WHERE id=?',[id]]).values[0]
  if(existing)return JSON.parse(existing.payload)
  const product=(yield ['query','SELECT i.stock,p.cost_price AS cost FROM branch_inventory i JOIN products p ON p.id=i.product_id WHERE i.branch_id=? AND i.product_id=?',[branchId,productId]]).values[0]
  if(!product)throw new Error('Synchronize the product and branch before allocating stock.')
  let lots=(yield ['query','SELECT * FROM stock_batches WHERE branch_id=? AND product_id=? AND quantity>0',[branchId,productId]]).values
  const discrepancy=input.reconcile===false?0:q(Number(product.stock)-lots.reduce((sum,lot)=>sum+Number(lot.quantity),0))
  if(discrepancy>0) {
    const legacy={id:`opening:${branchId}:${productId}`,branch_id:branchId,product_id:productId,batch_number:'Opening / adjusted stock',expiry:'',quantity:discrepancy,unit_cost:Number(product.cost)||0,received_at:'1970-01-01T00:00:00.000Z',source_id:id}
    yield ['run','INSERT INTO stock_batches VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id,branch_id) DO UPDATE SET quantity=ROUND(stock_batches.quantity+excluded.quantity,3)',Object.values(legacy)]
    lots.push(legacy)
  } else if(discrepancy<0) {
    for(const part of allocateStock(lots,-discrepancy,'',true)) {
      yield ['run','UPDATE stock_batches SET quantity=ROUND(quantity-?,3) WHERE id=? AND branch_id=?',[part.quantity,part.id,branchId]]
      lots.find(lot=>lot.id===part.id).quantity=q(lots.find(lot=>lot.id===part.id).quantity-part.quantity)
    }
  }
  let allocations=[]
  if(delta>0) {
    const incomingCost=Number(unitCost ?? product.cost ?? 0)
    if(!Number.isFinite(incomingCost)||incomingCost<0)throw new Error('Invalid stock cost.')
    expiryDate(expiry)
    const lotId=input.lotId || id
    yield ['run',`INSERT INTO stock_batches(id,branch_id,product_id,batch_number,expiry,quantity,unit_cost,received_at,source_id)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id,branch_id) DO UPDATE SET quantity=ROUND(stock_batches.quantity+excluded.quantity,3)`,[lotId,branchId,productId,batchNumber,expiry,quantity(delta,0.001),incomingCost,input.createdAt,sourceId]]
    allocations=[{id:lotId,quantity:delta,unitCost:incomingCost,batchNumber,expiry}]
  } else if(delta<0) {
    allocations=recorded || allocateStock(lots,-delta,input.createdAt.slice(0,10),allowExpired)
    if(q(allocations.reduce((sum,part)=>sum+Number(part.quantity),0))!==q(-delta))throw new Error('Stock allocation does not match the quantity.')
    for(const part of allocations) {
      const lot=lots.find(row=>row.id===part.id)
      if(!lot || Number(lot.quantity)+0.000001<quantity(part.quantity,0.001))throw new Error('Batch changed on another till. Synchronize and resolve the stock conflict.')
      yield ['run','UPDATE stock_batches SET quantity=ROUND(quantity-?,3) WHERE id=? AND branch_id=?',[part.quantity,part.id,branchId]]
    }
  }
  const result={...input,allocations,unitCost:allocations.reduce((sum,part)=>sum+part.quantity*part.unitCost,0)/(Math.abs(delta)||1)}
  if(delta)yield ['run','INSERT INTO stock_events VALUES (?,?)',[id,JSON.stringify(result)]]
  return result
}
export function stockChangeSync(db,input) {
  const program=changeStock(input);let next=program.next()
  while(!next.done){const [method,sql,params]=next.value;next=program.next(db[method](sql,params))}
  return next.value
}
export async function stockChange(db,input) {
  const program=changeStock(input);let next=program.next()
  while(!next.done){const [method,sql,params]=next.value;next=program.next(await db[method](sql,params,false))}
  return next.value
}
export async function batchReport(db,branchId,today=new Date().toISOString().slice(0,10),days=30) {
  const balances=(await db.query('SELECT i.product_id,i.stock,i.updated_at FROM branch_inventory i WHERE i.branch_id=?',[branchId])).values
  for(const row of balances)await stockChange(db,{id:`reconcile:${branchId}:${row.product_id}:${row.stock}:${row.updated_at}`,branchId,productId:row.product_id,delta:0,createdAt:new Date().toISOString()})
  const lots=(await db.query('SELECT b.*,p.name AS productName,p.unit FROM stock_batches b JOIN products p ON p.id=b.product_id WHERE b.branch_id=? AND b.quantity>0 ORDER BY b.expiry,b.received_at',[branchId])).values
  const cutoff=new Date(today+'T00:00:00Z');cutoff.setUTCDate(cutoff.getUTCDate()+days)
  return {lots,expired:lots.filter(lot=>lot.expiry && lot.expiry<today),expiring:lots.filter(lot=>lot.expiry && lot.expiry>=today && lot.expiry<=cutoff.toISOString().slice(0,10)),costValue:lots.reduce((sum,lot)=>sum+lot.quantity*lot.unit_cost,0)}
}

function* transferStock(input){
  yield ['run','INSERT OR IGNORE INTO branch_inventory(branch_id,product_id,stock,reorder_point,updated_at) SELECT ?,id,0,reorder_point,? FROM products WHERE id=?',[input.toBranchId,input.createdAt,input.productId]]
  const out=yield* changeStock({id:`${input.id}:transfer:out`,branchId:input.fromBranchId,productId:input.productId,delta:-input.quantity,createdAt:input.createdAt,allowExpired:true,allocations:input.batchAllocations})
  for(const [index,part] of out.allocations.entries())yield* changeStock({id:`${input.id}:transfer:in:${index}`,lotId:part.id,branchId:input.toBranchId,productId:input.productId,delta:part.quantity,reconcile:index===0,unitCost:part.unitCost,expiry:part.expiry||'',batchNumber:part.batchNumber||'',createdAt:input.createdAt})
  return out.allocations
}
export function stockTransferSync(db,input){const program=transferStock(input);let next=program.next();while(!next.done){const [method,sql,args]=next.value;next=program.next(db[method](sql,args))}return next.value}
export async function stockTransfer(db,input){const program=transferStock(input);let next=program.next();while(!next.done){const [method,sql,args]=next.value;next=program.next(await db[method](sql,args,false))}return next.value}

export async function applySyncedSale(db,payload,operation,walletDebit){
  const run=(sql,args=[])=>db.run(sql,args,false)
  await db.beginTransaction()
  try{
    if((await db.query('SELECT id FROM sales WHERE id=?',[payload.id])).values.length){await db.commitTransaction();return}
    if(payload.paymentMethod==='wallet')await walletDebit(db,payload)
    const branchId=payload.branchId||'main',createdAt=payload.createdAt||operation.createdAt
    await run('INSERT INTO sales(id,total,payment_method,payment_reference,terminal_provider,staff_id,staff_name,created_at,cash_received,change_given,payment_details,branch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[payload.id,payload.total,payload.paymentMethod||'cash',payload.paymentReference||'',payload.terminalProvider||'',payload.staffId||'',payload.staffName||'',createdAt,payload.cashReceived??null,payload.changeGiven??null,payload.paymentDetails?JSON.stringify(payload.paymentDetails):null,branchId])
    for(const [index,item] of (payload.items||[]).entries()){
      const service=String(item.productId).startsWith('service:')
      let captured=Number(item.unitCost)||0
      if(!service){const allocation=await stockChange(db,{id:`${payload.id}:sale:${index}`,branchId,productId:item.productId,delta:-Number(item.quantity),createdAt,allowExpired:true,allocations:item.batchAllocations});captured=item.unitCost??allocation.unitCost;await run('UPDATE branch_inventory SET stock=ROUND(stock-?,3) WHERE branch_id=? AND product_id=?',[item.quantity,branchId,item.productId])}
      await run('INSERT INTO sale_items(id,sale_id,product_id,product_name,quantity,unit_price,unit_cost,batch_allocations) VALUES(?,?,?,?,?,?,?,?)',[`${payload.id}:item:${index}`,payload.id,item.productId,item.productName||item.productId,item.quantity,item.price,captured,JSON.stringify(item.batchAllocations||[])])
    }
    await db.commitTransaction()
  }catch(error){await db.rollbackTransaction();throw error}
}
