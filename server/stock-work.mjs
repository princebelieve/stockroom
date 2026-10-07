import { stockChange, stockChangeSync, expiryDate } from './stock-ledger.mjs'
import { quantity } from './quantities.mjs'
import { validateRecipe } from './counter-recipes.mjs'
import { posSettings } from './pos-pricing.mjs'

export const isStockWork = record => ['service-materials','food-production'].includes(record?.kind)
export const requiresStockWorkSync = operation => operation.entityType === 'pos_record' && isStockWork(operation.payload)
const q = n => Math.round(n * 1000) / 1000
const money = n => Math.round(n * 100) / 100
const text = (value, max = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Enter valid stock work details.')
  return value.trim()
}
function request(input) {
  if (!isStockWork(input)) throw new Error('Choose materials used or a food production batch.')
  validateRecipe(input.ingredients)
  if (!input.ingredients?.length) throw new Error('Add the stock actually used.')
  return {
    kind: input.kind, note: text(input.note),
    ingredients: input.ingredients.map(row => ({productId:row.productId,quantity:quantity(row.quantity,0.001)})).sort((a,b)=>a.productId.localeCompare(b.productId)),
    ...(input.kind === 'service-materials' ? {jobId:text(input.jobId,150)} : {
      outputProductId:text(input.outputProductId,150), outputQuantity:quantity(input.outputQuantity,0.001),
      expectedQuantity:quantity(input.expectedQuantity,0.001), expiry:expiryDate(input.expiry||'')
    })
  }
}
export function validateStockWork(record, previous, job) {
  if (!isStockWork(record) || !/^stock-work:[a-zA-Z0-9_-]{3,100}$/.test(record.id||'') || record.expectedUpdatedAt !== '' || !Number.isFinite(Date.parse(record.updatedAt))) throw new Error('Invalid stock work record.')
  for (const key of ['branchId','tillId','staffId','staffName','note']) text(record[key])
  const saved = request(record.request)
  if (JSON.stringify(saved) !== JSON.stringify(record.request) || saved.kind !== record.kind || saved.note !== record.note) throw new Error('Invalid saved stock work request.')
  if (previous && JSON.stringify(previous) !== JSON.stringify(record)) throw new Error('Stock work is permanent. Record a new batch or use stock adjustments with a reason.')
  if (!Array.isArray(record.ingredients) || record.ingredients.length !== saved.ingredients.length) throw new Error('Invalid material quantities.')
  for (const [index,row] of record.ingredients.entries()) {
    const original = saved.ingredients[index]
    if (row.productId!==original.productId || row.quantity!==original.quantity || !row.name || !row.unit || !Number.isFinite(row.unitCost) || row.unitCost<0 || !Array.isArray(row.allocations) || !row.allocations.length) throw new Error('Invalid captured material cost.')
    if (q(row.allocations.reduce((n,part)=>n+part.quantity,0))!==row.quantity || row.allocations.some(part=>!part.id || !Number.isFinite(part.unitCost) || part.unitCost<0 || !Number.isFinite(part.quantity) || part.quantity<=0 || q(part.quantity)!==part.quantity)) throw new Error('Material batches do not match the quantity.')
    if (Math.abs(row.unitCost-row.allocations.reduce((n,part)=>n+part.quantity*part.unitCost,0)/row.quantity)>0.000001) throw new Error('Material cost must match its batches.')
  }
  if (record.totalCost !== money(record.ingredients.reduce((n,row)=>n+row.quantity*row.unitCost,0))) throw new Error('Material cost total does not match its batches.')
  if (record.kind==='service-materials') {
    if (record.jobId!==saved.jobId || !record.jobTitle || record.output) throw new Error('Invalid job material link.')
    if (job && (job.kind!=='service-job' || job.id!==record.jobId || job.branchId!==record.branchId || job.tillId!==record.tillId || job.title!==record.jobTitle)) throw new Error('Use the saved job branch and original till.')
  } else {
    const output=record.output
    if (!output || output.productId!==saved.outputProductId || output.quantity!==saved.outputQuantity || output.expectedQuantity!==saved.expectedQuantity || output.expiry!==saved.expiry || !output.name || !output.unit || !Number.isFinite(output.unitCost) || Math.abs(output.unitCost-record.totalCost/output.quantity)>0.000001 || record.ingredients.some(row=>row.productId===output.productId)) throw new Error('Invalid production yield or output cost.')
  }
  return record
}
function inputEvent(record,row) {
  return {id:`${record.id}:input:${row.productId}`,branchId:record.branchId,productId:row.productId,delta:-row.quantity,createdAt:record.updatedAt,category:record.kind==='service-materials'?'service-materials':'production-input',reason:record.note,unitCost:row.unitCost,allocations:row.allocations}
}
function outputEvent(record) {
  const row=record.output
  return {id:`${record.id}:output`,branchId:record.branchId,productId:row.productId,delta:row.quantity,unitCost:row.unitCost,expiry:row.expiry,batchNumber:record.id,createdAt:record.updatedAt,category:'production-output',reason:record.note}
}
function* apply(record,organizationId) {
  validateStockWork(record)
  for (const event of [...record.ingredients.map(row=>inputEvent(record,row)),...(record.output?[outputEvent(record)]:[])]) {
    if ((yield ['query','SELECT id FROM stock_events WHERE id=?',[event.id]]).values.length) continue
    yield ['stock',event.delta<0?{...event,completedSale:true}:event]
    yield ['run','UPDATE branch_inventory SET stock=ROUND(stock+?,3),updated_at=? WHERE branch_id=? AND product_id=?',[event.delta,record.updatedAt,record.branchId,event.productId]]
    const columns=organizationId?'id,organization_id,product_id,quantity,reason,created_at,branch_id':'id,product_id,quantity,reason,created_at,branch_id'
    const args=[event.id,...(organizationId?[organizationId]:[]),event.productId,event.delta,record.note,record.updatedAt,record.branchId]
    yield ['run',`INSERT OR IGNORE INTO inventory_movements (${columns}) VALUES (${args.map(()=>'?').join(',')})`,args]
  }
}
export async function applyStockWork(db,record,organizationId) {
  const program=apply(record,organizationId);let next=program.next()
  while(!next.done){const [method,sql,args]=next.value;next=program.next(method==='stock'?await stockChange(db,sql):await db[method](sql,args,false))}
}
export function applyStockWorkSync(db,record,organizationId) {
  const program=apply(record,organizationId);let next=program.next()
  while(!next.done){const [method,sql,args]=next.value;next=program.next(method==='stock'?stockChangeSync(db,sql):db[method](sql,args))}
}
export async function handleStockWork({db,scope,organizationId,branchId,tillId,user,method,input,saveRecord,publish}) {
  if (!['owner','admin'].includes(user.role)) throw new Error('Owner or admin access required to record stock work.')
  if(method==='GET')return {records:(await db.query("SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind IN ('service-materials','food-production') ORDER BY updated_at DESC",[scope,branchId])).values.map(row=>JSON.parse(row.payload))}
  if(method!=='POST')throw new Error('Unknown stock work action.')
  const canonical=request(input), id=text(input.id,120)
  if (!/^stock-work:[a-zA-Z0-9_-]{3,100}$/.test(id)) throw new Error('Invalid stock work ID.')
  const previous=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,id])).values[0]
  if(previous){const record=JSON.parse(previous.payload);if(record.branchId!==branchId || record.tillId!==tillId || JSON.stringify(record.request)!==JSON.stringify(canonical))throw new Error('This stock work ID already has different details.');return record}
  const settings=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND id='pos-settings'",[scope])).values[0]
  const policy=posSettings(settings?JSON.parse(settings.payload).value:undefined)
  if(policy.offlineStockPoolsEnabled && policy.stockPools[tillId]!==branchId)throw new Error("Record stock work at this till's assigned stock location.")
  let job
  if(canonical.kind==='service-materials') {
    const row=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,canonical.jobId])).values[0]
    job=row?JSON.parse(row.payload):null
    if(!job || job.kind!=='service-job' || job.branchId!==branchId || job.tillId!==tillId || ['estimate','cancelled'].includes(job.status))throw new Error('Choose an issued job on its original till and branch.')
  }
  const record={id,kind:canonical.kind,request:canonical,branchId,tillId,expectedUpdatedAt:'',staffId:user.id,staffName:user.name,note:canonical.note,updatedAt:new Date().toISOString(),ingredients:[],totalCost:0,...(job?{jobId:job.id,jobTitle:job.title}:{})}
  const product=async productId=>(await db.query(`SELECT p.id,p.name,p.unit,i.stock FROM products p JOIN branch_inventory i ON i.product_id=p.id WHERE p.id=? AND i.branch_id=?${organizationId?' AND p.organization_id=?':''}`,[productId,branchId,...(organizationId?[organizationId]:[])])).values[0]
  await db.beginTransaction()
  try {
    for(const row of canonical.ingredients) {
      const found=await product(row.productId)
      if(!found || Number(found.stock)+0.000001<row.quantity)throw new Error(`Not enough ${found?.name||'material'} in this branch.`)
      const captured=await stockChange(db,{...inputEvent(record,row),unitCost:undefined,allocations:undefined})
      record.ingredients.push({...row,name:found.name,unit:found.unit,beforeStock:Number(found.stock),unitCost:captured.unitCost,allocations:captured.allocations})
      await db.run('UPDATE branch_inventory SET stock=ROUND(stock-?,3),updated_at=? WHERE branch_id=? AND product_id=?',[row.quantity,record.updatedAt,branchId,row.productId],false)
      const columns=organizationId?'id,organization_id,product_id,quantity,reason,created_at,branch_id':'id,product_id,quantity,reason,created_at,branch_id'
      const args=[captured.id,...(organizationId?[organizationId]:[]),row.productId,-row.quantity,record.note,record.updatedAt,branchId]
      await db.run(`INSERT INTO inventory_movements (${columns}) VALUES (${args.map(()=>'?').join(',')})`,args,false)
    }
    record.totalCost=money(record.ingredients.reduce((n,row)=>n+row.quantity*row.unitCost,0))
    if(canonical.kind==='food-production') {
      const found=await product(canonical.outputProductId)
      if(!found || canonical.ingredients.some(row=>row.productId===found.id))throw new Error('Choose a separate finished stock product in this branch.')
      record.output={productId:found.id,name:found.name,unit:found.unit,beforeStock:Number(found.stock),quantity:canonical.outputQuantity,expectedQuantity:canonical.expectedQuantity,expiry:canonical.expiry,unitCost:record.totalCost/canonical.outputQuantity}
      await stockChange(db,outputEvent(record))
      await db.run('UPDATE branch_inventory SET stock=ROUND(stock+?,3),updated_at=? WHERE branch_id=? AND product_id=?',[record.output.quantity,record.updatedAt,branchId,found.id],false)
      const columns=organizationId?'id,organization_id,product_id,quantity,reason,created_at,branch_id':'id,product_id,quantity,reason,created_at,branch_id'
      const args=[`${id}:output`,...(organizationId?[organizationId]:[]),found.id,record.output.quantity,record.note,record.updatedAt,branchId]
      await db.run(`INSERT INTO inventory_movements (${columns}) VALUES (${args.map(()=>'?').join(',')})`,args,false)
    }
    validateStockWork(record,undefined,job)
    await saveRecord(db,scope,record);await publish(record);await db.commitTransaction()
    return record
  }catch(error){await db.rollbackTransaction();throw error}
}
