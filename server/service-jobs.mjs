import { validateChurchLink } from './church-ledger.mjs'
import { validQuantity } from './quantities.mjs'
import { priceOrder, posSettings } from './pos-pricing.mjs'
import { recordPayment, paymentResult } from './payment.mjs'
import { receiptSettings } from './receipts.mjs'
import { saveRestaurantSale } from './restaurant-payments.mjs'
import { stockChange } from './stock-ledger.mjs'
const cents = value => Math.round(Number(value) * 100)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const text = (value, max = 200) => { if (typeof value !== 'string' || value.length > max) throw new Error('Enter valid job details.'); return value.trim() }
export function validateHospitalityInvoice(job,record){
  if(!job.hospitality)return job
  if(!record||record.id!==job.hospitality.recordId||record.kind!==job.hospitality.recordKind||record.branchId!==job.branchId||record.status==='cancelled'&&job.status!=='cancelled')throw new Error('The linked hotel stay or guest entry is unavailable for billing.')
  if(record.kind==='hotel-stay'){
    if(job.hospitality.chargeType==='extra'){
      if(!job.lines.length||job.lines.length>100)throw new Error('Add a valid guest folio charge.')
      if(job.hospitality.stockItems!==undefined){if(!Array.isArray(job.hospitality.stockItems)||job.hospitality.stockItems.length!==1)throw new Error('Invalid stocked folio item.');const item=job.hospitality.stockItems[0],line=job.lines.find(row=>row.id===item.lineId);if(!line||!item.productId||!item.name||!item.unit||!validQuantity(item.quantity,0.001)||!Number.isFinite(item.price)||item.price<0||line.description!==`Room service: ${item.name}`||line.quantity!==item.quantity||cents(line.price)!==cents(item.price))throw new Error('The stocked folio line does not match its saved product.');if(!Array.isArray(item.allocations)||!item.allocations.length||item.allocations.some(part=>!part.id||!validQuantity(part.quantity,0.001)||!Number.isFinite(part.unitCost)||part.unitCost<0)||Math.abs(item.allocations.reduce((sum,part)=>sum+part.quantity,0)-item.quantity)>0.000001)throw new Error('The stocked folio item needs a complete stock allocation.')}
      return job
    }
    if(job.hospitality.chargeType)throw new Error('Unsupported hotel folio charge type.')
    const nights=(Date.parse(`${record.checkOut}T00:00:00Z`)-Date.parse(`${record.checkIn}T00:00:00Z`))/86400000
    if(!Number.isInteger(nights)||nights<1||!Number.isFinite(record.nightlyRate)||record.nightlyRate<=0||job.lines.length!==1||job.lines[0].description!==`Accommodation: ${record.roomName}`||job.lines[0].quantity!==nights||cents(job.lines[0].price)!==cents(record.nightlyRate))throw new Error('The hotel invoice must match the saved room, number of nights and nightly rate.')
  } else if(record.kind==='nightclub-entry'){
    if(!Number.isFinite(record.admissionPrice)||record.admissionPrice<=0||job.lines.length!==1||job.lines[0].description!==`Admission: ${record.eventName}`.slice(0,150)||job.lines[0].quantity!==1||cents(job.lines[0].price)!==cents(record.admissionPrice))throw new Error('The admission invoice must match the event entry price.')
  } else throw new Error('Unsupported hospitality invoice link.')
  return job
}
export function serviceJobBalance(job, returns = []) {
  const paid = job.payments.reduce((n, entry) => n + cents(entry.sale.total), 0)
  const refunded = returns.filter(record => job.payments.some(entry => entry.sale.id === record.saleId)).reduce((n, record) => n + cents(record.total), 0)
  return { paid: paid / 100, refunded: refunded / 100, netPaid: (paid - refunded) / 100, due: job.status==='cancelled'?0:Math.max(0, cents(job.pricing.total) - paid + refunded) / 100 }
}
export function validateServiceJob(job, previous, snapshot = false, refunds = []) {
  if (job.kind !== 'service-job' || !String(job.id).startsWith('service-job:') || !['estimate','new','in-progress','ready','completed','cancelled'].includes(job.status) || !job.branchId || !job.tillId || !Number.isFinite(Date.parse(job.updatedAt)) || !Number.isFinite(Date.parse(job.createdAt))) throw new Error('Invalid service job.')
  if (!job.customerName?.trim() || !job.title?.trim()) throw new Error('Enter a customer and job description.')
  if(job.church){validateChurchLink(job.church);if(!['new','cancelled'].includes(job.status)||job.profile.taxEnabled||job.pricing.tax!==0||job.customerName!==job.church.donorName||job.customerPhone!==job.church.donorPhone)throw new Error('Church contributions must preserve donor identity and have no sales tax.')}
  if (job.customerId !== undefined) text(job.customerId,150)
  if(job.hospitality){if(job.church||!['hotel-stay','nightclub-entry'].includes(job.hospitality.recordKind)||!String(job.hospitality.recordId||'').startsWith(`${job.hospitality.recordKind}:`)||job.hospitality.chargeType!==undefined&&!(job.hospitality.recordKind==='hotel-stay'&&job.hospitality.chargeType==='extra'))throw new Error('Invalid hospitality invoice link.');text(job.hospitality.recordId,150);text(job.hospitality.recordKind,40)}
  text(job.id,150);text(job.tillId,100);text(job.branchId,100);text(job.customerName); text(job.customerPhone, 80); text(job.title); text(job.note, 1000); text(job.businessName, 100)
  if (!/^[A-Z]{3}$/.test(job.currency) || (job.dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(job.dueDate) || new Date(job.dueDate).toISOString().slice(0,10) !== job.dueDate))) throw new Error('Enter a valid currency and due date.')
  if (!Array.isArray(job.lines) || !job.lines.length || job.lines.length > 100 || new Set(job.lines.map(line=>line.id)).size !== job.lines.length) throw new Error('Add 1 to 100 job items.')
  for (const line of job.lines) { if (!line.id || !text(line.description,150) || !validQuantity(line.quantity,0.001) || !Number.isFinite(line.price) || line.price<0 || !Number.isSafeInteger(cents(line.price)) || Math.abs(line.price*100-cents(line.price))>0.000001) throw new Error('Enter valid descriptions, quantities and prices.') }
  const pricing = priceOrder(job.lines.map(line=>({productId:'service:'+line.id,quantity:line.quantity,price:line.price})), {tax:job.profile})
  if (!same(pricing, job.pricing) || pricing.total <= 0 || !Array.isArray(job.payments) || job.payments.length > 200) throw new Error('Invalid invoice pricing or payments.')
  const seen = new Set()
  for (const entry of job.payments) {
    const sale = entry.sale
    validateServiceJobPayment(sale)
    if(sale.paymentMethod==='wallet'&&(!job.customerId||sale.paymentDetails.customerId!==job.customerId))throw new Error('Wallet payment must match the invoice-linked customer.')
    if (seen.has(sale.id) || sale.paymentDetails.serviceJob.id!==job.id || sale.branchId!==job.branchId || sale.currency!==job.currency || sale.businessName!==job.businessName) throw new Error('Invalid invoice payment link.')
    if(!same(sale.paymentDetails.serviceJob.church,job.church))throw new Error('Preserve the contribution fund and donor.');
    if(!same(sale.paymentDetails.serviceJob.hospitality||null,job.hospitality||null))throw new Error('Preserve the hotel stay or admission linked to this invoice.')
    const receiptType=job.church?'Collection / donation':job.hospitality?.chargeType==='extra'?'Hotel folio payment':job.hospitality?.recordKind==='hotel-stay'?'Hotel accommodation payment':job.hospitality?.recordKind==='nightclub-entry'?'Nightclub admission payment':'Invoice payment'
    if(sale.paymentDetails.receipt?.transactionType!==receiptType)throw new Error('The receipt type must match the invoice.')
    seen.add(sale.id)
    if(sale.paymentDetails.pos?.tillId!==job.tillId || sale.paymentDetails.servicePayment?.customerName!==job.customerName || sale.paymentDetails.servicePayment?.customerPhone!==job.customerPhone || sale.paymentDetails.serviceJob.title!==job.title)throw new Error('Payment must match the saved customer and till.')
    if (cents(sale.paymentDetails.serviceJob.invoiceTotal)!==cents(job.pricing.total)) throw new Error('Invalid invoice total.')
  }
  if (!snapshot && previous) {
    if (job.expectedUpdatedAt!==previous.updatedAt) throw new Error('This job changed. Refresh before continuing.')
    for (const key of ['church','hospitality','id','kind','branchId','tillId','currency','businessName','createdAt','customerName','customerPhone','customerId','title','note','dueDate','lines','pricing','profile']) if (!same(job[key], previous[key])) throw new Error('Issued job details and prices cannot be overwritten. Cancel and create a replacement.')
    if (!same(job.payments.slice(0,previous.payments.length),previous.payments) || job.payments.length<previous.payments.length || job.payments.length>previous.payments.length+1) throw new Error('Preserve saved invoice payments.')
    if (job.payments.length>previous.payments.length && (job.status!==previous.status || ['estimate','cancelled'].includes(job.status))) throw new Error('Issue the invoice before taking payment.')
    const balance = serviceJobBalance(previous, refunds)
    if (job.payments.length>previous.payments.length) {
      const sale=job.payments.at(-1).sale
      if (cents(sale.total)>cents(balance.due) || cents(sale.paymentDetails.serviceJob.balanceDue)!==cents(balance.due)-cents(sale.total)) throw new Error('Payment exceeds the invoice balance.')
      const tax=(Math.round(cents(job.pricing.tax)*(cents(balance.netPaid)+cents(sale.total))/cents(job.pricing.total))-Math.round(cents(job.pricing.tax)*cents(balance.netPaid)/cents(job.pricing.total)))/100
      if(cents(sale.paymentDetails.pos?.pricing?.tax)!==cents(tax))throw new Error('Invoice payment tax does not reconcile.')
    }
    if(job.status==='completed' && balance.due>0)throw new Error('Collect the balance before completion.')
    if(job.status==='cancelled' && balance.netPaid>0)throw new Error('Refund retained payments before cancellation.')
    if (job.status!==previous.status) {
      const allowed = { estimate:['new','cancelled'], new:['in-progress','ready','cancelled'], 'in-progress':['ready','cancelled'], ready:['completed','cancelled'], completed:['cancelled'], cancelled:[] }
      if (!allowed[previous.status].includes(job.status) || job.payments.length!==previous.payments.length) throw new Error('Follow the job stages.')
    }
  } else if (!snapshot && (job.expectedUpdatedAt!=='' || job.payments.length || !['estimate','new'].includes(job.status))) throw new Error('Create the job before taking payment.')
  return job
}
export function validateServiceJobPayment(sale) {
  if (!['cash','external-pos','bank-transfer','multiple','wallet'].includes(sale.paymentMethod)) throw new Error('Choose a supported invoice payment method.')
  if (sale.paymentMethod === 'multiple') paymentResult(sale, sale.paymentDetails?.policy)
  const link=sale.paymentDetails?.serviceJob
  if (!link || !String(sale.id).startsWith('service-payment:') || !String(link.id).startsWith('service-job:') || !Number.isFinite(link.invoiceTotal) || link.invoiceTotal<=0 || !Number.isFinite(link.balanceDue) || link.balanceDue<0 || sale.items?.length!==1 || !sale.items[0].productId.startsWith('service:') || sale.items[0].quantity!==1 || cents(sale.items[0].price)!==cents(sale.total) || !Number.isFinite(sale.total) || sale.total<=0) throw new Error('Invalid job payment.')
  if(link.church)validateChurchLink(link.church)
  text(sale.id,150);text(link.number,30);text(link.title);text(sale.staffId,150);text(sale.staffName,200)
  if(!Number.isFinite(Date.parse(sale.createdAt)) || !Number.isSafeInteger(cents(sale.total)) || Math.abs(sale.total*100-cents(sale.total))>0.000001)throw new Error('Invalid payment date or amount.')
  const pricing=sale.paymentDetails.pos?.pricing
  if (pricing && (pricing.lines?.length!==1 || cents(pricing.lines[0].tax)!==cents(pricing.tax) || cents(pricing.lines[0].total)!==cents(pricing.total) || cents(pricing.tax)<0 || cents(pricing.subtotal)<0 || cents(pricing.total)!==cents(sale.total) || cents(pricing.subtotal)+cents(pricing.tax)!==cents(sale.total))) throw new Error('Invalid payment allocation.')
  return sale
}
export async function applyServiceJob(db, scope, job, organizationId) {
  validateServiceJob(job, undefined, true)
  if(job.hospitality){const linked=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,job.hospitality.recordId])).values[0];const record=linked&&JSON.parse(linked.payload);validateHospitalityInvoice(job,record);if(record.kind==='nightclub-entry'){const eventRow=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,record.eventId])).values[0];const event=eventRow&&JSON.parse(eventRow.payload);if(!event||event.kind!=='nightclub-event'||event.status==='cancelled')throw new Error('The linked nightclub event is unavailable.') }}
  for (const entry of job.payments) await saveRestaurantSale(db,entry.sale,organizationId)
  for (const item of job.hospitality?.stockItems||[]) {
    const eventId=`${job.id}:hospitality-stock:${item.productId}`
    if((await db.query('SELECT id FROM stock_events WHERE id=?',[eventId])).values.length)continue
    await stockChange(db,{id:eventId,branchId:job.branchId,productId:item.productId,delta:-item.quantity,createdAt:job.createdAt,unitCost:item.unitCost,allocations:item.allocations,completedSale:true,category:'hotel-folio',reason:`Hotel folio ${job.hospitality.recordId}`})
    await db.run('UPDATE branch_inventory SET stock=ROUND(stock-?,3),updated_at=? WHERE branch_id=? AND product_id=?',[item.quantity,job.createdAt,job.branchId,item.productId])
    const columns=organizationId?'id,organization_id,product_id,quantity,reason,created_at,branch_id':'id,product_id,quantity,reason,created_at,branch_id',args=[eventId,...(organizationId?[organizationId]:[]),item.productId,-item.quantity,`Hotel folio ${job.hospitality.recordId}`,job.createdAt,job.branchId]
    await db.run(`INSERT OR IGNORE INTO inventory_movements (${columns}) VALUES (${args.map(()=>'?').join(',')})`,args)
  }
}
export const requiresServiceJobSync = operation => operation.payload?.kind==='service-job' || Boolean(operation.payload?.paymentDetails?.serviceJob)
export async function handleServiceJobs({db,scope,organizationId,branchId,user,path,method,input,tillId,sales,publish,saveRecord}) {
  const rows=()=>db.query("SELECT payload FROM pos_records WHERE scope=? AND kind='service-job' AND branch_id=? ORDER BY updated_at DESC",[scope,branchId])
  const returns=async()=> (await db.query("SELECT payload FROM pos_records WHERE scope=? AND kind='return' AND branch_id=?",[scope,branchId])).values.map(row=>JSON.parse(row.payload))
  if (method==='GET') { const jobs=(await rows()).values.map(row=>JSON.parse(row.payload)); const refunds=await returns(); return {jobs:jobs.filter(job=>!job.church).map(job=>({...job,balance:serviceJobBalance(job,refunds)})),customers:(await db.query(`SELECT id,name,phone,balance FROM customers ${organizationId?'WHERE organization_id=?':''}`,organizationId?[organizationId]:[])).values} }
  if (!tillId || !String(input.id).startsWith('service-job:') || typeof input.commandId!=='string' || !input.commandId) throw new Error('A registered till and job command are required.')
  const previousRow=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,input.id])).values[0]
  const previous=previousRow ? JSON.parse(previousRow.payload) : null
  if(input.hospitalityStock&&!input.hospitality)throw new Error('Stocked folio items must belong to a hotel stay.')
  if (previous && (previous.kind!=='service-job' || previous.branchId!==branchId || previous.tillId!==tillId)) throw new Error('Manage this job on its original till and branch.')
  const request=JSON.stringify(input)
  const retry=previous?.payments.find(entry=>entry.sale.id==='service-payment:'+input.commandId)
  if (retry) { if(retry.request!==request)throw new Error('This payment ID already has different details.');return {job:previous,sale:retry.sale} }
  if (previous?.lastCommandId===input.commandId) { if(previous.lastRequest!==request)throw new Error('This command ID already has different details.');return {job:previous} }
  if ((previous?.updatedAt||'')!==input.expectedUpdatedAt) throw new Error('This job changed. Refresh before continuing.')
  const updatedAt=new Date(Math.max(Date.now(),Date.parse(previous?.updatedAt||'')+1||0)).toISOString()
  const stamp={updatedAt,expectedUpdatedAt:previous?.updatedAt||'',lastCommandId:input.commandId,lastRequest:request,staffId:user.id,staffName:user.name}
  let job, sale, pendingHospitalityStock
  if (!previous) {
    if (path!=='/api/pos/service-jobs') throw new Error('Create the job first.')
    const settings=(await db.query(`SELECT app_name AS businessName,currency FROM app_settings ${organizationId?'WHERE organization_id=?':'WHERE id=1'}`,organizationId?[organizationId]:[])).values[0]
    const profileRow=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND id='receipt-settings'",[scope])).values[0]
    let profile=receiptSettings(profileRow?JSON.parse(profileRow.payload).value:{})
    let church
    if(input.church){
      const fundRow=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,input.church.fundId])).values[0]
      const donorRow=input.church.donorId?(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,input.church.donorId])).values[0]:null
      const fund=fundRow?JSON.parse(fundRow.payload):null,donor=donorRow?JSON.parse(donorRow.payload):null
      if(!fund||fund.kind!=='church-fund'||fund.branchId!==branchId||fund.status!=='active'||input.church.donorId&&(!donor||donor.kind!=='church-donor'||donor.branchId!==branchId||donor.status!=='active'))throw new Error('Choose an active fund and donor in this branch.')
      church={type:input.church.type,fundId:fund.id,fundName:fund.name,donorId:donor?.id||'',donorName:donor?.name||'Anonymous donor',donorPhone:donor?.phone||''}
      validateChurchLink(church)
      input={...input,customerName:church.donorName,customerPhone:church.donorPhone}
      profile={...profile,taxEnabled:false,taxRate:0,taxIncluded:false}
      if(input.estimate)throw new Error('Pledges are commitments, not estimates.')
    }
    let hospitality
    if(input.hospitality){
      const recordRow=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,input.hospitality.recordId])).values[0]
      const record=recordRow?JSON.parse(recordRow.payload):null
      if(!record||record.kind!==input.hospitality.recordKind||record.branchId!==branchId)throw new Error('Choose an existing hotel stay or nightclub admission in this branch.')
      if(record.kind==='nightclub-entry'){const eventRow=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,record.eventId])).values[0];const event=eventRow&&JSON.parse(eventRow.payload);if(!event||event.kind!=='nightclub-event'||!['scheduled','closed'].includes(event.status))throw new Error('This event is unavailable for admission billing.')}
      const chargeType=input.hospitality.chargeType==='extra'?'extra':undefined
      if(!chargeType&&(await db.query("SELECT payload FROM pos_records WHERE scope=? AND kind='service-job' AND branch_id=?",[scope,branchId])).values.some(row=>{const job=JSON.parse(row.payload);return job.hospitality?.recordId===record.id&&!job.hospitality.chargeType&&job.status!=='cancelled'}))throw new Error('This stay or admission already has an active invoice.')
      if(chargeType&&record.kind!=='hotel-stay')throw new Error('Only hotel stays can have guest folio charges.')
      if(chargeType&&record.status!=='checked-in')throw new Error('Additional folio charges can be added while the guest is checked in.')
      hospitality={recordId:record.id,recordKind:record.kind,...(chargeType?{chargeType}:{})}
      if(record.kind==='hotel-stay'){
        if(chargeType){input={...input,customerName:record.guestName,customerPhone:record.guestPhone||'',title:`Hotel folio - ${record.roomName}`.slice(0,200),note:`Additional guest charges for ${record.guestName}; stay ${record.checkIn} to ${record.checkOut}.`};if(input.hospitalityStock){const quantity=Number(input.hospitalityStock.quantity),productId=text(input.hospitalityStock.productId,150),product=(await db.query(`SELECT p.id,p.name,p.unit,p.price,i.stock FROM products p JOIN branch_inventory i ON i.product_id=p.id WHERE p.id=? AND i.branch_id=?${organizationId?' AND p.organization_id=?':''}`,[productId,branchId,...(organizationId?[organizationId]:[])])).values[0];if(!product||!validQuantity(quantity,0.001)||Number(product.stock)<quantity||Number(product.price)<=0)throw new Error('Choose a stocked product with a valid price and enough available quantity.');pendingHospitalityStock={productId,quantity};input={...input,lines:[{id:`hotel-stock:${product.id}`,description:`Room service: ${product.name}`,quantity,price:Number(product.price)}]}}}
        else {const nights=(Date.parse(`${record.checkOut}T00:00:00Z`)-Date.parse(`${record.checkIn}T00:00:00Z`))/86400000;input={...input,customerName:record.guestName,customerPhone:record.guestPhone||'',title:`Hotel stay - ${record.roomName}`,note:`Room ${record.roomName}; ${record.checkIn} to ${record.checkOut} (${nights} night${nights===1?'':'s'}).`,lines:[{id:record.id,description:`Accommodation: ${record.roomName}`,quantity:nights,price:record.nightlyRate}]}}
      }else if(record.kind==='nightclub-entry'){
        input={...input,customerName:record.guestName,customerPhone:record.guestPhone||'',title:`Nightclub admission - ${record.eventName}`.slice(0,200),note:`Admission for ${record.eventName}.`,lines:[{id:record.id,description:`Admission: ${record.eventName}`.slice(0,150),quantity:1,price:record.admissionPrice}]}
      }else throw new Error('Only hotel stays and nightclub guest entries can be invoiced.')
    }
    const lines=input.lines.map(line=>({id:text(line.id,100),description:text(line.description,150),quantity:Number(line.quantity),price:Number(line.price)}))
    if(input.customerId) {
      const customer=(await db.query(`SELECT id,name,phone,balance FROM customers WHERE id=?${organizationId?' AND organization_id=?':''}`,[input.customerId,...(organizationId?[organizationId]:[])])).values[0]
      if(!customer || customer.name.trim()!==String(input.customerName||'').trim() || String(customer.phone||'').trim()!==String(input.customerPhone||'').trim())throw new Error('Choose the matching customer account or enter this customer manually.')
    }
    job={...stamp,...(church?{church}:{}),...(hospitality?{hospitality}:{}),...(input.customerId?{customerId:text(input.customerId,150)}:{}),id:input.id,kind:'service-job',branchId,tillId,status:input.estimate?'estimate':'new',createdAt:updatedAt,businessName:profile.businessName||settings.businessName,currency:settings.currency,customerName:text(input.customerName),customerPhone:text(input.customerPhone||'',80),title:text(input.title),note:text(input.note||'',1000),dueDate:text(input.dueDate||'',10),lines,profile,pricing:priceOrder(lines.map(line=>({productId:'service:'+line.id,quantity:line.quantity,price:line.price})),{tax:profile}),payments:[]}
    if(hospitality){const linked=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,hospitality.recordId])).values[0];validateHospitalityInvoice(job,linked&&JSON.parse(linked.payload))}
  } else {
    job={...previous,...stamp}
    const balance=serviceJobBalance(previous,await returns())
    if (path==='/api/pos/service-jobs/status') {
      if (input.status==='cancelled' && (!['owner','admin'].includes(user.role) || balance.netPaid>0)) throw new Error('An owner or admin must refund retained payments before cancellation.')
      if(input.status==='completed' && balance.due>0)throw new Error('Collect the remaining balance before completing the job.')
      job.status=input.status
    } else if (path==='/api/pos/service-jobs/pay') {
      if(['estimate','cancelled'].includes(job.status))throw new Error('Issue the invoice before recording payment.')
      const amount=Number(input.amount)
      if(!/^\d+(?:\.\d{1,2})?$/.test(String(input.amount)) || !Number.isFinite(amount) || amount<=0 || cents(amount)>cents(balance.due))throw new Error('Enter a payment up to the remaining balance.')
      if(!['cash','external-pos','bank-transfer','multiple','wallet'].includes(input.method))throw new Error('Choose a supported Payment Method.')
      if(input.method==='wallet'&&(!job.customerId||input.customerId!==job.customerId))throw new Error('Use the invoice-linked customer wallet.')
      const id='service-payment:'+input.commandId
      if((await db.query('SELECT id FROM sales WHERE id=?',[id])).values[0])throw new Error('This payment ID is already used by another job.')
      const link={...(job.church?{church:job.church}:{}),...(job.hospitality?{hospitality:job.hospitality}:{}),id:job.id,number:job.id.slice(-8).toUpperCase(),title:job.title,invoiceTotal:job.pricing.total,balanceDue:(cents(balance.due)-cents(amount))/100}
      const policyRow=(await db.query(`SELECT payment_policy FROM app_settings ${organizationId?'WHERE organization_id=?':'WHERE id=1'}`,organizationId?[organizationId]:[])).values[0]
      sale=recordPayment({id,branchId,organizationId,businessName:job.businessName,currency:job.currency,createdAt:updatedAt,staffId:user.id,staffName:user.name,items:[{productId:'service:'+job.id,productName:`${balance.netPaid===0 && amount<balance.due?'Deposit':'Payment'} - ${job.title}`.slice(0,200),quantity:1,price:amount}],total:amount,paymentMethod:input.method,paymentReference:text(input.reference||''),terminalProvider:text(input.provider||''),paymentDetails:{...(input.method==='wallet'?{customerId:job.customerId}:{}),...(input.method==='multiple'?{allocations:input.parts?.map(part=>({...part,amount:Number(part.amount)})),cashReceived:input.cash||undefined}:{}),amountReceived:input.method==='cash'?(input.cash||amount):amount,serviceJob:link,servicePayment:{customerName:job.customerName,customerPhone:job.customerPhone}}},policyRow?.payment_policy)
      const tax=cents(job.pricing.tax)*(cents(balance.netPaid)+cents(amount))/cents(job.pricing.total)
      const allocatedTax=(Math.round(tax)-Math.round(cents(job.pricing.tax)*cents(balance.netPaid)/cents(job.pricing.total)))/100
      const subtotal=(cents(amount)-cents(allocatedTax))/100
      const register=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND kind='register' AND branch_id=?",[scope,branchId])).values.map(row=>JSON.parse(row.payload)).find(session=>!session.closedAt && session.staffId===user.id && (!session.tillId||session.tillId===tillId))
      sale.paymentDetails.pos={tillId,registerId:register?.id,pricing:{subtotal,discount:0,tax:allocatedTax,total:amount,taxSettings:posSettings({...job.profile,taxIncluded:false}),lines:[{productId:'service:'+job.id,quantity:1,subtotal,discount:0,tax:allocatedTax,total:amount}]}}
      sale.paymentDetails.receipt={address:job.profile.address,phone:job.profile.phone,email:job.profile.email,footer:job.profile.footer,number:'REC-'+id.slice(-8).toUpperCase(),transactionType:job.church?'Collection / donation':job.hospitality?.chargeType==='extra'?'Hotel folio payment':job.hospitality?.recordKind==='hotel-stay'?'Hotel accommodation payment':job.hospitality?.recordKind==='nightclub-entry'?'Nightclub admission payment':'Invoice payment',cardType:''}
      job.payments=[...job.payments,{sale,request}]
    } else throw new Error('Unknown service job action.')
  }
  validateServiceJob(job,previous,false,await returns())
  await db.beginTransaction()
  try {
    const current=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,job.id])).values[0]
    if((current?JSON.parse(current.payload).updatedAt:'')!==job.expectedUpdatedAt)throw new Error('This job changed. Refresh before continuing.')
    if(pendingHospitalityStock){const item=pendingHospitalityStock,product=(await db.query(`SELECT p.id,p.name,p.unit,p.price,i.stock FROM products p JOIN branch_inventory i ON i.product_id=p.id WHERE p.id=? AND i.branch_id=?${organizationId?' AND p.organization_id=?':''}`,[item.productId,branchId,...(organizationId?[organizationId]:[])])).values[0];if(!product||Number(product.stock)<item.quantity)throw new Error('Stock changed. Refresh before charging this item to the guest folio.');const eventId=`${job.id}:hospitality-stock:${product.id}`,captured=await stockChange(db,{id:eventId,branchId,productId:product.id,delta:-item.quantity,createdAt:job.createdAt,category:'hotel-folio',reason:`Hotel folio ${job.hospitality.recordId}`});job.hospitality={...job.hospitality,stockItems:[{lineId:`hotel-stock:${product.id}`,productId:product.id,name:product.name,unit:product.unit,quantity:item.quantity,price:Number(product.price),unitCost:captured.unitCost,allocations:captured.allocations}]};await db.run('UPDATE branch_inventory SET stock=ROUND(stock-?,3),updated_at=? WHERE branch_id=? AND product_id=?',[item.quantity,job.createdAt,branchId,product.id],false);const columns=organizationId?'id,organization_id,product_id,quantity,reason,created_at,branch_id':'id,product_id,quantity,reason,created_at,branch_id',args=[eventId,...(organizationId?[organizationId]:[]),product.id,-item.quantity,`Hotel folio ${job.hospitality.recordId}`,job.createdAt,branchId];await db.run(`INSERT OR IGNORE INTO inventory_movements (${columns}) VALUES (${args.map(()=>'?').join(',')})`,args,false)}
    validateServiceJob(job,current?JSON.parse(current.payload):null,false,await returns())
    if(sale) await saveRestaurantSale(db,sale,organizationId);await saveRecord(db,scope,job);await publish(job);await db.commitTransaction() } catch(error){await db.rollbackTransaction();throw error}
  return {job,sale}
}
