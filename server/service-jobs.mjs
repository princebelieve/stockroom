import { validateChurchLink } from './church-ledger.mjs'
import { validQuantity } from './quantities.mjs'
import { priceOrder, posSettings } from './pos-pricing.mjs'
import { recordPayment, paymentResult } from './payment.mjs'
import { receiptSettings } from './receipts.mjs'
import { saveRestaurantSale } from './restaurant-payments.mjs'
import { stockChange } from './stock-ledger.mjs'
import { hotelFolios } from './hotel-folios.mjs'
import { hasPermission } from './staff-permissions.mjs'
const cents = value => Math.round(Number(value) * 100)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const text = (value, max = 200) => { if (typeof value !== 'string' || value.length > max) throw new Error('Enter valid job details.'); return value.trim() }
export function validateHospitalityInvoice(job,record){
  if(!job.hospitality)return job
  if(!record||record.id!==job.hospitality.recordId||record.kind!==job.hospitality.recordKind||record.branchId!==job.branchId||record.status==='cancelled'&&job.status!=='cancelled')throw new Error('The linked hotel stay or guest entry is unavailable for billing.')
  if(job.hospitality.groupId!==undefined&&(!record.groupId||job.hospitality.groupId!==record.groupId||!hotelFolios(record).some(folio=>folio.id===job.hospitality.folioId&&folio.groupMaster)))throw new Error('The group master folio link does not match this stay.')
  if(record.kind==='hotel-stay'){
    const folioId=job.hospitality.folioId||'guest'
    const folio=hotelFolios(record).find(row=>row.id===folioId)
    if(!folio)throw new Error('The invoice must be routed to a folio on this stay.')
    if(Boolean(folio.groupMaster)!==Boolean(job.hospitality.groupId)||folio.groupMaster&&job.hospitality.groupId!==record.groupId)throw new Error('The invoice group reference must match the selected folio.')
    if((folio.id!=='guest'||!record.customerId)&&(job.customerName!==folio.payerName||String(job.customerPhone||'')!==String(folio.payerPhone||'')))throw new Error('The invoice payer must match the selected hotel folio.')
    if(job.customerPortalId&&(folio.id!=='guest'||job.customerPortalId!==record.customerPortalId))throw new Error('Only the guest folio can use the booking customer’s online payment account.')
    if(job.hospitality.chargeType==='extra'){
      if(!job.lines.length||job.lines.length>100)throw new Error('Add a valid guest folio charge.')
      if(job.hospitality.stockItems!==undefined){if(!Array.isArray(job.hospitality.stockItems)||job.hospitality.stockItems.length!==1)throw new Error('Invalid stocked folio item.');const item=job.hospitality.stockItems[0],line=job.lines.find(row=>row.id===item.lineId);if(!line||!item.productId||!item.name||!item.unit||!validQuantity(item.quantity,0.001)||!Number.isFinite(item.price)||item.price<0||line.description!==`Room service: ${item.name}`||line.quantity!==item.quantity||cents(line.price)!==cents(item.price))throw new Error('The stocked folio line does not match its saved product.');if(!Array.isArray(item.allocations)||!item.allocations.length||item.allocations.some(part=>!part.id||!validQuantity(part.quantity,0.001)||!Number.isFinite(part.unitCost)||part.unitCost<0)||Math.abs(item.allocations.reduce((sum,part)=>sum+part.quantity,0)-item.quantity)>0.000001)throw new Error('The stocked folio item needs a complete stock allocation.')}
      return job
    }
    if(job.hospitality.chargeType)throw new Error('Unsupported hotel folio charge type.')
    const nights=(Date.parse(`${record.checkOut}T00:00:00Z`)-Date.parse(`${record.checkIn}T00:00:00Z`))/86400000,breakdown=record.rateBreakdown||[{nightlyRate:record.nightlyRate,nights}],expected=breakdown.map((row,index)=>({id:index===0?record.id:`${record.id}:rate:${index}`,description:`Accommodation: ${record.roomName}`,quantity:row.nights,price:row.nightlyRate}))
    if(!Number.isInteger(nights)||nights<1||!Number.isFinite(record.nightlyRate)||record.nightlyRate<=0||expected.reduce((sum,row)=>sum+row.quantity,0)!==nights||job.lines.length!==expected.length||expected.some((row,index)=>job.lines[index]?.id!==row.id||job.lines[index]?.description!==row.description||job.lines[index]?.quantity!==row.quantity||cents(job.lines[index]?.price)!==cents(row.price)))throw new Error('The hotel invoice must match the saved room, stay dates and rate schedule.')
  } else if(record.kind==='nightclub-entry'){
    if(record.status==='waitlisted')throw new Error('Promote the guest from the waitlist before creating an admission invoice.')
    if(!Number.isFinite(record.admissionPrice)||record.admissionPrice<=0||job.lines.length!==1||job.lines[0].description!==`Admission: ${record.eventName}`.slice(0,150)||job.lines[0].quantity!==1||cents(job.lines[0].price)!==cents(record.admissionPrice))throw new Error('The admission invoice must match the event entry price.')
  } else if(record.kind==='nightclub-inquiry'){
    const description=`Private event: ${record.eventType}`.slice(0,150)
    if(!['quoted','confirmed'].includes(record.status)||!Number.isFinite(record.quotedTotal)||record.quotedTotal<=0||job.lines.length!==1||job.lines[0].description!==description||job.lines[0].quantity!==1||cents(job.lines[0].price)!==cents(record.quotedTotal))throw new Error('The private-event estimate must match an active quoted inquiry.')
  } else throw new Error('Unsupported hospitality invoice link.')
  return job
}
export function serviceJobBalance(job, returns = []) {
  const paid = job.payments.reduce((n, entry) => n + cents(entry.sale.total), 0)
  const refunded = returns.filter(record => job.payments.some(entry => entry.sale.id === record.saleId)).reduce((n, record) => n + cents(record.total), 0)
  return { paid: paid / 100, refunded: refunded / 100, netPaid: (paid - refunded) / 100, due: job.status==='cancelled'?0:Math.max(0, cents(job.pricing.total) - paid + refunded) / 100 }
}
function validateHotelFolioCorrectionLink(value){if(!value||typeof value!=='object'||!/^service-job:[A-Za-z0-9_-]{3,140}$/.test(value.originalJobId||'')||typeof value.commandId!=='string'||!value.commandId||value.commandId.length>150||typeof value.reason!=='string'||!value.reason.trim()||value.reason.length>500||typeof value.staffId!=='string'||!value.staffId||typeof value.staffName!=='string'||!value.staffName||!Number.isFinite(Date.parse(value.correctedAt)))throw new Error('Invalid hotel invoice correction history.')}
export function createHostedServiceJobPayment(job, { amount, reference, transactionId, createdAt = new Date().toISOString() }) {
  const balance=serviceJobBalance(job),amountCents=cents(amount)
  if(!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>cents(balance.due)||!String(reference||'').trim()||!String(transactionId||'').trim())throw new Error('The hosted payment amount or reference is invalid for this invoice balance.')
  const id=`service-payment:paystack-${String(transactionId).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100)}`
  const link={...(job.church?{church:job.church}:{}),...(job.hospitality?{hospitality:job.hospitality}:{}),id:job.id,number:job.id.slice(-8).toUpperCase(),title:job.title,invoiceTotal:job.pricing.total,balanceDue:(cents(balance.due)-amountCents)/100}
  let sale=recordPayment({id,branchId:job.branchId,businessName:job.businessName,currency:job.currency,createdAt,staffId:`paystack:${transactionId}`,staffName:'Paystack online',items:[{productId:'service:'+job.id,productName:`${balance.netPaid===0&&amountCents<cents(balance.due)?'Deposit':'Payment'} - ${job.title}`.slice(0,200),quantity:1,price:amountCents/100}],total:amountCents/100,paymentMethod:'external-pos',paymentReference:String(reference).slice(0,200),terminalProvider:'Paystack',paymentDetails:{amountReceived:amountCents/100,serviceJob:link,servicePayment:{customerName:job.customerName,customerPhone:job.customerPhone}}})
  const allocatedTax=(Math.round(cents(job.pricing.tax)*(cents(balance.netPaid)+amountCents)/cents(job.pricing.total))-Math.round(cents(job.pricing.tax)*cents(balance.netPaid)/cents(job.pricing.total)))
  const subtotal=(amountCents-allocatedTax)/100
  sale.paymentDetails.pos={tillId:job.tillId,pricing:{subtotal,discount:0,tax:allocatedTax/100,total:amountCents/100,taxSettings:posSettings({...job.profile,taxIncluded:false}),lines:[{productId:'service:'+job.id,quantity:1,subtotal,discount:0,tax:allocatedTax/100,total:amountCents/100}]}}
  sale.paymentDetails.receipt={address:job.profile.address,phone:job.profile.phone,email:job.profile.email,footer:job.profile.footer,number:'REC-'+id.slice(-8).toUpperCase(),transactionType:job.hospitality?.chargeType==='extra'?'Hotel folio payment':job.hospitality?.recordKind==='hotel-stay'?'Hotel accommodation payment':job.hospitality?.recordKind==='nightclub-entry'?'Nightclub admission payment':job.hospitality?.recordKind==='nightclub-inquiry'?'Private event payment':'Invoice payment',cardType:''}
  const updatedAt=createdAt,commandId=`paystack-${transactionId}`,request=JSON.stringify({provider:'Paystack',reference:String(reference),transactionId:String(transactionId),amount:amountCents/100})
  const updated={...job,updatedAt,expectedUpdatedAt:job.updatedAt,lastCommandId:commandId,lastRequest:request,payments:[...job.payments,{sale,request}]}
  validateServiceJob(updated,job,false)
  return {job:updated,sale,request}
}
export function validateServiceJob(job, previous, snapshot = false, refunds = []) {
  if (job.kind !== 'service-job' || !String(job.id).startsWith('service-job:') || !['estimate','new','in-progress','ready','completed','cancelled'].includes(job.status) || !job.branchId || !job.tillId || !Number.isFinite(Date.parse(job.updatedAt)) || !Number.isFinite(Date.parse(job.createdAt))) throw new Error('Invalid service job.')
  if (!job.customerName?.trim() || !job.title?.trim()) throw new Error('Enter a customer and job description.')
  if(job.church){validateChurchLink(job.church);if(!['new','cancelled'].includes(job.status)||job.profile.taxEnabled||job.pricing.tax!==0||job.customerName!==job.church.donorName||job.customerPhone!==job.church.donorPhone)throw new Error('Church contributions must preserve donor identity and have no sales tax.')}
  if (job.customerId !== undefined) text(job.customerId,150)
  if (job.customerPortalId !== undefined) text(job.customerPortalId,150)
  if(job.cancelledAt!==undefined&&(!Number.isFinite(Date.parse(job.cancelledAt))||job.status!=='cancelled'))throw new Error('Invalid hotel invoice cancellation date.')
  if(job.hospitality){if(job.church||!['hotel-stay','nightclub-entry','nightclub-inquiry'].includes(job.hospitality.recordKind)||!String(job.hospitality.recordId||'').startsWith(`${job.hospitality.recordKind}:`)||job.hospitality.chargeType!==undefined&&!(job.hospitality.recordKind==='hotel-stay'&&job.hospitality.chargeType==='extra')||job.hospitality.folioId!==undefined&&job.hospitality.recordKind!=='hotel-stay'||job.hospitality.groupId!==undefined&&(job.hospitality.recordKind!=='hotel-stay'||!/^hotel-group:[0-9a-f-]{36}$/i.test(job.hospitality.groupId)))throw new Error('Invalid hospitality invoice link.');text(job.hospitality.recordId,150);text(job.hospitality.recordKind,40);if(job.hospitality.folioId!==undefined)text(job.hospitality.folioId,80)}
  if(job.folioTransferHistory!==undefined&&(!Array.isArray(job.folioTransferHistory)||job.folioTransferHistory.length>100||job.folioTransferHistory.some(entry=>!entry||typeof entry.fromFolioId!=='string'||typeof entry.toFolioId!=='string'||entry.fromFolioId===entry.toFolioId||typeof entry.reason!=='string'||!entry.reason.trim()||entry.reason.length>500||typeof entry.staffId!=='string'||!entry.staffId||!Number.isFinite(Date.parse(entry.transferredAt)))))throw new Error('Invalid hotel folio transfer history.')
  if(job.correctionOf!==undefined)validateHotelFolioCorrectionLink(job.correctionOf)
  if(job.folioCorrection!==undefined&&(!job.folioCorrection||typeof job.folioCorrection!=='object'||!/^service-job:[A-Za-z0-9_-]{3,140}$/.test(job.folioCorrection.replacementJobId||'')||typeof job.folioCorrection.reason!=='string'||!job.folioCorrection.reason.trim()||job.folioCorrection.reason.length>500||typeof job.folioCorrection.staffId!=='string'||!job.folioCorrection.staffId||typeof job.folioCorrection.staffName!=='string'||!job.folioCorrection.staffName||!Number.isFinite(Date.parse(job.folioCorrection.correctedAt))))throw new Error('Invalid hotel invoice correction history.')
  if(job.hospitality?.restaurantBill){const bill=job.hospitality.restaurantBill;if(job.hospitality.recordKind!=='hotel-stay'||job.hospitality.chargeType!=='extra'||!/^restaurant-tab:[A-Za-z0-9:_-]{3,150}$/.test(bill.tabId)||typeof bill.sessionId!=='string'||!bill.sessionId||bill.sessionId.length>150||bill.folioId!==job.hospitality.folioId||!Array.isArray(bill.selections)||!bill.selections.length||bill.selections.length>1000||bill.selections.some(part=>!part||typeof part.orderId!=='string'||part.orderId.length>150||typeof part.lineId!=='string'||!part.lineId||part.lineId.length>150||!Number.isFinite(part.quantity)||part.quantity<=0||!Number.isFinite(part.total)||part.total<=0)||Math.abs(bill.selections.reduce((sum,part)=>sum+part.total,0)-job.pricing.total)>0.005)throw new Error('Invalid restaurant bill folio transfer.')}
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
    const receiptType=job.church?'Collection / donation':job.hospitality?.chargeType==='extra'?'Hotel folio payment':job.hospitality?.recordKind==='hotel-stay'?'Hotel accommodation payment':job.hospitality?.recordKind==='nightclub-entry'?'Nightclub admission payment':job.hospitality?.recordKind==='nightclub-inquiry'?'Private event payment':'Invoice payment'
    if(sale.paymentDetails.receipt?.transactionType!==receiptType)throw new Error('The receipt type must match the invoice.')
    seen.add(sale.id)
    if(sale.paymentDetails.pos?.tillId!==job.tillId || sale.paymentDetails.servicePayment?.customerName!==job.customerName || sale.paymentDetails.servicePayment?.customerPhone!==job.customerPhone || sale.paymentDetails.serviceJob.title!==job.title)throw new Error('Payment must match the saved customer and till.')
    if (cents(sale.paymentDetails.serviceJob.invoiceTotal)!==cents(job.pricing.total)) throw new Error('Invalid invoice total.')
  }
  if (!snapshot && previous) {
    if (job.expectedUpdatedAt!==previous.updatedAt) throw new Error('This job changed. Refresh before continuing.')
    const folioTransfer=job.lastCommandType==='hotel-folio-transfer'&&previous.hospitality?.recordKind==='hotel-stay'&&previous.payments.length===0&&job.payments.length===0&&job.status===previous.status&&job.hospitality?.recordId===previous.hospitality.recordId&&job.hospitality?.recordKind===previous.hospitality.recordKind&&job.hospitality?.chargeType===previous.hospitality.chargeType&&job.hospitality?.folioId!==previous.hospitality.folioId&&Array.isArray(job.folioTransferHistory)&&job.folioTransferHistory.length===(previous.folioTransferHistory||[]).length+1&&same(job.folioTransferHistory.slice(0,-1),previous.folioTransferHistory||[])
    const correction=job.lastCommandType==='hotel-folio-correction'&&previous.hospitality?.recordKind==='hotel-stay'&&previous.status==='cancelled'&&job.status==='cancelled'&&previous.folioCorrection===undefined&&job.folioCorrection?.replacementJobId&&job.payments.length===previous.payments.length&&same(job.payments,previous.payments)
    if(correction){const originalBalance=serviceJobBalance(previous,refunds);if(originalBalance.paid<=0||originalBalance.netPaid!==0||cents(originalBalance.refunded)!==cents(originalBalance.paid))throw new Error('Fully refund the original invoice before recording a folio correction.')}
    if(previous.cancelledAt!==undefined&&job.cancelledAt!==previous.cancelledAt||previous.cancelledAt===undefined&&job.cancelledAt!==undefined&&!correction&&(previous.status==='cancelled'||job.status!=='cancelled')||previous.status!=='cancelled'&&job.status==='cancelled'&&job.cancelledAt!==job.updatedAt)throw new Error('Preserve the saved invoice cancellation date.')
    for (const key of ['church',...(folioTransfer?[]:['hospitality']),'correctionOf','id','kind','branchId','tillId','currency','businessName','createdAt',...(folioTransfer?[]:['customerName','customerPhone','customerId','customerPortalId']),'title','note','dueDate','lines','pricing','profile',...(correction?[]:['folioCorrection'])]) if (!same(job[key], previous[key])) throw new Error('Issued job details and prices cannot be overwritten. Cancel and create a replacement.')
    if(folioTransfer&&(!job.folioTransferHistory.at(-1)?.fromFolioId||job.folioTransferHistory.at(-1).fromFolioId!==(previous.hospitality.folioId||'guest')||job.folioTransferHistory.at(-1).toFolioId!==job.hospitality.folioId))throw new Error('The folio transfer history must match the invoice change.')
    if(!same(job.folioTransferHistory||[],previous.folioTransferHistory||[])&&!folioTransfer)throw new Error('Preserve the hotel folio transfer history.')
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
  const settlement=sale.paymentDetails?.serviceSettlement
  if(settlement!==undefined&&(!settlement||typeof settlement.id!=='string'||!settlement.id||settlement.id.length>150||typeof settlement.request!=='string'||settlement.request.length>1000||!Number.isInteger(settlement.index)||settlement.index<0||!Number.isInteger(settlement.count)||settlement.count<1||settlement.index>=settlement.count))throw new Error('Invalid folio settlement allocation.')
  text(sale.id,150);text(link.number,30);text(link.title);text(sale.staffId,150);text(sale.staffName,200)
  if(!Number.isFinite(Date.parse(sale.createdAt)) || !Number.isSafeInteger(cents(sale.total)) || Math.abs(sale.total*100-cents(sale.total))>0.000001)throw new Error('Invalid payment date or amount.')
  const pricing=sale.paymentDetails.pos?.pricing
  if (pricing && (pricing.lines?.length!==1 || cents(pricing.lines[0].tax)!==cents(pricing.tax) || cents(pricing.lines[0].total)!==cents(pricing.total) || cents(pricing.tax)<0 || cents(pricing.subtotal)<0 || cents(pricing.total)!==cents(sale.total) || cents(pricing.subtotal)+cents(pricing.tax)!==cents(sale.total))) throw new Error('Invalid payment allocation.')
  return sale
}
export async function applyServiceJob(db, scope, job, organizationId) {
  validateServiceJob(job, undefined, true)
  const currentRow=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,job.id])).values[0],current=currentRow&&JSON.parse(currentRow.payload)
  if(current&&(job.folioCorrection||current.folioCorrection)){const refunds=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND kind='return' AND branch_id=?",[scope,job.branchId])).values.map(row=>JSON.parse(row.payload));validateServiceJob(job,current,false,refunds)}
  if(job.correctionOf){const originalRow=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,job.correctionOf.originalJobId])).values[0],original=originalRow&&JSON.parse(originalRow.payload);if(!original||original.status!=='cancelled'||original.folioCorrection?.replacementJobId!==job.id||original.folioCorrection.reason!==job.correctionOf.reason||original.folioCorrection.staffId!==job.correctionOf.staffId)throw new Error('The corrected invoice must sync with its cancelled original invoice.')}
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
async function correctHotelFolio({db,scope,organizationId,branchId,user,method,input,tillId,publish,saveRecord}){
  if(method!=='POST'||!tillId||!['owner','admin'].includes(user.role)||!hasPermission(user,'hotelOperations'))throw new Error('An owner or admin with Hotel operations access must correct a hotel invoice.')
  const originalId=String(input.id||''),replacementId=text(String(input.replacementId||''),150),commandId=text(String(input.commandId||''),150),reason=text(String(input.reason||''),500)
  if(!originalId.startsWith('service-job:')||!replacementId.startsWith('service-job:')||replacementId===originalId||!commandId||!reason)throw new Error('Choose an invoice, a new replacement invoice ID and a correction reason.')
  const allJobs=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND kind='service-job' AND branch_id=?",[scope,branchId])).values.map(row=>JSON.parse(row.payload))
  const retry=allJobs.find(job=>job.correctionOf?.commandId===commandId)
  if(retry){if(retry.id!==replacementId||retry.correctionOf.originalJobId!==originalId||retry.hospitality?.folioId!==input.folioId||retry.correctionOf.reason!==reason)throw new Error('This correction ID has already been used with different details.');return {job:retry,alreadyProcessed:true}}
  const previous=allJobs.find(job=>job.id===originalId)
  if(!previous||previous.tillId!==tillId||previous.hospitality?.recordKind!=='hotel-stay'||previous.branchId!==branchId||previous.status!=='cancelled'||previous.folioCorrection)throw new Error('Choose an uncorrected, cancelled hotel invoice on its original till.')
  if(input.expectedUpdatedAt!==previous.updatedAt)throw new Error('The original invoice changed. Refresh before correcting it.')
  const allReturns=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND kind='return' AND branch_id=?",[scope,branchId])).values.map(row=>JSON.parse(row.payload)),balance=serviceJobBalance(previous,allReturns)
  if(!previous.payments.length||balance.paid<=0||balance.netPaid!==0||cents(balance.refunded)!==cents(balance.paid))throw new Error('Refund the full original invoice payments before creating a corrected replacement.')
  const stayRow=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,previous.hospitality.recordId])).values[0],stay=stayRow?JSON.parse(stayRow.payload):null
  if(!stay||stay.kind!=='hotel-stay'||stay.branchId!==branchId||!['booked','checked-in','checked-out'].includes(stay.status))throw new Error('The linked hotel stay is no longer eligible for a folio correction.')
  const folio=hotelFolios(stay).find(item=>item.id===text(String(input.folioId||''),80))
  if(!folio||!['booked','checked-in','checked-out'].includes(stay.status))throw new Error('Choose a valid payer folio on the linked stay.')
  if((await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,replacementId])).values[0])throw new Error('The replacement invoice ID is already in use.')
  const updatedAt=new Date(Math.max(Date.now(),Date.parse(previous.updatedAt||'')+1||0)).toISOString(),stamp={updatedAt,expectedUpdatedAt:previous.updatedAt,lastCommandId:commandId,lastRequest:JSON.stringify({originalId,replacementId,folioId:folio.id,reason}),staffId:user.id,staffName:user.name,lastCommandType:'hotel-folio-correction'}
  const original={...previous,...stamp,cancelledAt:previous.cancelledAt||previous.updatedAt,folioCorrection:{replacementJobId:replacementId,reason,staffId:String(user.id),staffName:String(user.name),correctedAt:updatedAt}}
  const replacement={...previous,id:replacementId,status:'new',createdAt:updatedAt,updatedAt,expectedUpdatedAt:'',lastCommandId:commandId,lastRequest:stamp.lastRequest,lastCommandType:'hotel-folio-correction-replacement',staffId:user.id,staffName:user.name,customerName:folio.payerName,customerPhone:folio.payerPhone||'',hospitality:{...previous.hospitality,folioId:folio.id,...(folio.groupMaster?{groupId:stay.groupId}:{})},correctionOf:{originalJobId:originalId,commandId,reason,staffId:String(user.id),staffName:String(user.name),correctedAt:updatedAt},payments:[]}
  delete replacement.cancelledAt
  if(!folio.groupMaster)delete replacement.hospitality.groupId
  delete replacement.hospitality.stockItems
  if(folio.id==='guest'&&stay.customerId){replacement.customerId=stay.customerId;delete replacement.customerPortalId}else{delete replacement.customerId;delete replacement.customerPortalId}
  validateServiceJob(original,previous,false,allReturns)
  validateServiceJob(replacement,null,false,allReturns)
  validateHospitalityInvoice(replacement,stay)
  await db.beginTransaction()
  try{
    const current=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,originalId])).values[0],currentJob=current&&JSON.parse(current.payload)
    if(!currentJob||currentJob.updatedAt!==previous.updatedAt||currentJob.status!=='cancelled'||currentJob.folioCorrection)throw new Error('The original invoice changed. Refresh before correcting it.')
    if((await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,replacementId])).values[0])throw new Error('The replacement invoice ID is already in use.')
    await saveRecord(db,scope,original);await publish(original)
    await saveRecord(db,scope,replacement);await publish(replacement)
    await db.commitTransaction()
  }catch(error){await db.rollbackTransaction();throw error}
  return {job:replacement,original,alreadyProcessed:false}
}
async function settleHotelFolio(options){
  const {db,scope,branchId,user,path,method,input,tillId}=options
  const stayId=String(input.stayId||''),groupId=String(input.groupId||''),settleGroup=Boolean(groupId)
  if(method!=='POST'||!tillId||typeof input.commandId!=='string'||!input.commandId||Boolean(stayId)===settleGroup)throw new Error('A registered till and exactly one stay or group settlement target are required.')
  if(!hasPermission(user,'hotelOperations'))throw new Error('Hotel operations access is required to settle a guest folio.')
  const allStays=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND kind='hotel-stay' AND branch_id=?",[scope,branchId])).values.map(row=>JSON.parse(row.payload))
  let targetStays
  if(settleGroup){
    if(!/^hotel-group:[0-9a-f-]{36}$/i.test(groupId))throw new Error('Choose a valid group reservation.')
    const members=allStays.filter(stay=>stay.groupId===groupId),expectedSize=Number(members[0]?.groupSize||0)
    if(members.length<2||members.length!==expectedSize||new Set(members.map(stay=>stay.id)).size!==expectedSize)throw new Error('Refresh the stays; this group reservation is incomplete.')
    targetStays=members.filter(stay=>['booked','checked-in','checked-out'].includes(stay.status))
    if(!targetStays.length)throw new Error('This group has no active or checked-out stays to settle.')
  }else{
    if(!stayId.startsWith('hotel-stay:'))throw new Error('Choose a valid hotel stay.')
    const stay=allStays.find(row=>row.id===stayId)
    if(!stay||!['booked','checked-in','checked-out'].includes(stay.status))throw new Error('Only a booked, checked-in or checked-out stay can be settled.')
    targetStays=[stay]
  }
  const folioId=String(input.folioId||'guest'),folioSource=targetStays.find(stay=>hotelFolios(stay).some(row=>row.id===folioId)),folio=folioSource&&hotelFolios(folioSource).find(row=>row.id===folioId)
  if(!folio)throw new Error('Choose an existing folio on this stay or group.')
  if(settleGroup&&targetStays.some(stay=>!hotelFolios(stay).some(row=>row.id===folioId&&row.payerName===folio.payerName)))throw new Error('The selected group folio is not shared consistently across its stays.')
  const targetStayIds=new Set(targetStays.map(stay=>stay.id)),allJobs=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND kind='service-job' AND branch_id=? ORDER BY id",[scope,branchId])).values.map(row=>JSON.parse(row.payload)).filter(job=>job.hospitality?.recordKind==='hotel-stay'),jobs=allJobs.filter(job=>targetStayIds.has(job.hospitality.recordId)&&(job.hospitality.folioId||'guest')===folioId)
  const settlementParts=Array.isArray(input.parts)?input.parts.map(part=>({method:String(part.method||''),amount:Number(part.amount),provider:String(part.provider||''),reference:String(part.reference||'')})):[]
  const fingerprint=JSON.stringify({...(settleGroup?{groupId}:{stayId}),folioId,method:String(input.method||''),provider:String(input.provider||''),reference:String(input.reference||''),...(settlementParts.length?{parts:settlementParts}:{})})
  const settlementId=String(input.commandId)
  const prior=allJobs.flatMap(job=>job.payments||[]).filter(entry=>entry.sale?.paymentDetails?.serviceSettlement?.id===settlementId)
  if(prior.length){if(prior.some(entry=>entry.sale.paymentDetails.serviceSettlement.request!==fingerprint)||prior.length!==new Set(prior.map(entry=>entry.sale.paymentDetails.serviceSettlement.index)).size||prior.some(entry=>entry.sale.paymentDetails.serviceSettlement.count!==prior.length))throw new Error('This folio settlement ID has already been used with different details.');return {settlementId,alreadyProcessed:true,jobs:jobs.filter(job=>job.payments?.some(entry=>entry.sale?.paymentDetails?.serviceSettlement?.id===settlementId))}}
  if(!['cash','bank-transfer','external-pos','multiple'].includes(input.method))throw new Error('Choose cash, a verified bank transfer, a verified POS terminal or split payment.')
  const allReturns=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND kind='return' AND branch_id=?",[scope,branchId])).values.map(row=>JSON.parse(row.payload))
  const dueJobs=jobs.filter(job=>!['estimate','cancelled'].includes(job.status)).map(job=>({job,balance:serviceJobBalance(job,allReturns)})).filter(row=>row.balance.due>0)
  if(!dueJobs.length)throw new Error('This folio has no outstanding invoices to settle.')
  if(dueJobs.some(({job})=>job.payments?.some(entry=>entry.sale?.paymentDetails?.serviceSettlement?.id)))throw new Error('An invoice already belongs to another folio settlement; refresh the folio and try again.')
  if(input.method==='bank-transfer'&&(!String(input.provider||'').trim()||!String(input.reference||'').trim()))throw new Error('Enter the bank and verified transfer reference.')
  if(input.method==='external-pos'&&(!String(input.provider||'').trim()||!String(input.reference||'').trim()))throw new Error('Enter the terminal provider and verified approval reference.')
  if(input.method==='multiple'){
    if(settlementParts.length<2||settlementParts.length>3||new Set(settlementParts.map(part=>part.method)).size!==settlementParts.length||settlementParts.some(part=>!['cash','bank-transfer','external-pos'].includes(part.method)||!Number.isSafeInteger(cents(part.amount))||cents(part.amount)<=0||part.method!=='cash'&&(!part.provider.trim()||!part.reference.trim()))||settlementParts.reduce((sum,part)=>sum+cents(part.amount),0)!==dueJobs.reduce((sum,row)=>sum+cents(row.balance.due),0))throw new Error('Split tender amounts must add up exactly to the full folio balance and include provider references for each transfer or terminal part.')
  }
  const txDb={...db,beginTransaction:async()=>{},commitTransaction:async()=>{},rollbackTransaction:async()=>{}}
  const results=[]
  await db.beginTransaction()
  try{
    const remainingParts=settlementParts.map(part=>({...part,remaining:cents(part.amount)}))
    for(const [index,{job,balance}] of dueJobs.entries()){
      const subCommand=`${settlementId}-${index+1}`
      let paymentMethod=input.method,paymentParts=[],provider=input.provider||'',reference=input.reference||''
      if(input.method==='multiple'){
        let invoiceRemainder=cents(balance.due)
        for(const part of remainingParts){const amount=Math.min(invoiceRemainder,part.remaining);if(amount>0){paymentParts.push({...part,amount:amount/100});part.remaining-=amount;invoiceRemainder-=amount}if(!invoiceRemainder)break}
        if(invoiceRemainder)throw new Error('Split tender allocation did not cover every folio invoice.')
        if(paymentParts.length===1){paymentMethod=paymentParts[0].method;provider=paymentParts[0].provider;reference=paymentParts[0].reference}
      }
      const result=await handleServiceJobs({...options,db:txDb,path:'/api/pos/service-jobs/pay',method:'POST',input:{id:job.id,commandId:subCommand,expectedUpdatedAt:job.updatedAt,amount:balance.due.toFixed(2),method:paymentMethod,provider,reference,cash:paymentMethod==='cash'?balance.due.toFixed(2):'',...(paymentMethod==='multiple'?{parts:paymentParts}:{}),settlementId,settlementRequest:fingerprint,settlementIndex:index,settlementCount:dueJobs.length}})
      results.push(result.job)
    }
    if(remainingParts.some(part=>part.remaining!==0))throw new Error('Split tender allocation did not match the folio balance.')
    await db.commitTransaction()
  }catch(error){await db.rollbackTransaction();throw error}
  return {settlementId,alreadyProcessed:false,jobs:results}
}
export async function handleServiceJobs({db,scope,organizationId,branchId,user,path,method,input,tillId,sales,publish,saveRecord,restaurantBillContext}) {
  const rows=()=>db.query("SELECT payload FROM pos_records WHERE scope=? AND kind='service-job' AND branch_id=? ORDER BY updated_at DESC",[scope,branchId])
  const returns=async()=> (await db.query("SELECT payload FROM pos_records WHERE scope=? AND kind='return' AND branch_id=?",[scope,branchId])).values.map(row=>JSON.parse(row.payload))
  if (method==='GET') { const jobs=(await rows()).values.map(row=>JSON.parse(row.payload)); const refunds=await returns(); return {jobs:jobs.filter(job=>!job.church).map(job=>({...job,balance:serviceJobBalance(job,refunds)})),customers:(await db.query(`SELECT id,name,phone,balance FROM customers ${organizationId?'WHERE organization_id=?':''}`,organizationId?[organizationId]:[])).values} }
  if(path==='/api/pos/service-jobs/settle-folio')return settleHotelFolio({db,scope,branchId,user,path,method,input,tillId,organizationId,sales,publish,saveRecord,restaurantBillContext})
  if(path==='/api/pos/service-jobs/correct-hotel-folio')return correctHotelFolio({db,scope,organizationId,branchId,user,method,input,tillId,publish,saveRecord})
  if (!tillId || !String(input.id).startsWith('service-job:') || typeof input.commandId!=='string' || !input.commandId) throw new Error('A registered till and job command are required.')
  const previousRow=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,input.id])).values[0]
  const previous=previousRow ? JSON.parse(previousRow.payload) : null
  if(input.hospitalityStock&&!input.hospitality)throw new Error('Stocked folio items must belong to a hotel stay.')
  if(input.hospitality?.restaurantBill&&!restaurantBillContext||restaurantBillContext&&!input.hospitality?.restaurantBill)throw new Error('Restaurant folio invoices must be created from the linked open table bill.')
  if (previous && (previous.kind!=='service-job' || previous.branchId!==branchId || previous.tillId!==tillId)) throw new Error('Manage this job on its original till and branch.')
  const request=JSON.stringify(input)
  const retry=previous?.payments.find(entry=>entry.sale.id==='service-payment:'+input.commandId)
  if (retry) { if(retry.request!==request)throw new Error('This payment ID already has different details.');return {job:previous,sale:retry.sale} }
  if (previous?.lastCommandId===input.commandId) { if(previous.lastRequest!==request)throw new Error('This command ID already has different details.');return {job:previous} }
  if ((previous?.updatedAt||'')!==input.expectedUpdatedAt) throw new Error('This job changed. Refresh before continuing.')
  const updatedAt=new Date(Math.max(Date.now(),Date.parse(previous?.updatedAt||'')+1||0)).toISOString()
  const stamp={updatedAt,expectedUpdatedAt:previous?.updatedAt||'',lastCommandId:input.commandId,lastRequest:request,staffId:user.id,staffName:user.name}
  let job, sale, pendingHospitalityStock, hospitalityCustomerPortalId=''
  if (!previous) {
    if (path!=='/api/pos/service-jobs') throw new Error('Create the job first.')
    const settings=(await db.query(`SELECT app_name AS businessName,currency FROM app_settings ${organizationId?'WHERE organization_id=?':'WHERE id=1'}`,organizationId?[organizationId]:[])).values[0]
    const profileRow=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND id='receipt-settings'",[scope])).values[0]
    let profile=receiptSettings(profileRow?JSON.parse(profileRow.payload).value:{})
    if(restaurantBillContext)profile={...profile,taxEnabled:restaurantBillContext.taxEnabled===true,taxIncluded:restaurantBillContext.taxIncluded===true,taxRate:Number(restaurantBillContext.taxRate||0),taxLabel:String(restaurantBillContext.taxLabel||'Tax').slice(0,40)}
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
      if(!record||record.kind!==input.hospitality.recordKind||record.branchId!==branchId)throw new Error('Choose an existing hotel stay, nightclub admission or quoted private event in this branch.')
      if(record.kind==='nightclub-entry'){const eventRow=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,record.eventId])).values[0];const event=eventRow&&JSON.parse(eventRow.payload);if(!event||event.kind!=='nightclub-event'||!['scheduled','closed'].includes(event.status))throw new Error('This event is unavailable for admission billing.')}
      const chargeType=input.hospitality.chargeType==='extra'?'extra':undefined
      const hotelFolio=record.kind==='hotel-stay'?hotelFolios(record).find(folio=>folio.id===String(input.hospitality.folioId||'guest')):null
      if(record.kind==='hotel-stay'&&!hotelFolio)throw new Error('Choose a folio account on this stay before routing the invoice.')
      if(!chargeType&&(await db.query("SELECT payload FROM pos_records WHERE scope=? AND kind='service-job' AND branch_id=?",[scope,branchId])).values.some(row=>{const job=JSON.parse(row.payload);return job.hospitality?.recordId===record.id&&!job.hospitality.chargeType&&job.status!=='cancelled'}))throw new Error('This stay or admission already has an active invoice.')
      if(chargeType&&record.kind!=='hotel-stay')throw new Error('Only hotel stays can have guest folio charges.')
      if(chargeType&&record.status!=='checked-in')throw new Error('Additional folio charges can be added while the guest is checked in.')
      hospitality={recordId:record.id,recordKind:record.kind,...(chargeType?{chargeType}:{}),...(hotelFolio?{folioId:hotelFolio.id}:{}),...(record.kind==='hotel-stay'&&hotelFolio?.groupMaster?{groupId:record.groupId}:{}),...(restaurantBillContext?{restaurantBill:input.hospitality.restaurantBill}:{})}
      if(record.kind==='hotel-stay'){
        input={...input,customerName:hotelFolio.payerName,customerPhone:hotelFolio.payerPhone||'',title:chargeType?`Hotel folio - ${record.roomName}`.slice(0,200):`Hotel stay - ${record.roomName}`,note:chargeType?`Additional guest charges for ${record.guestName}; stay ${record.checkIn} to ${record.checkOut}; folio ${hotelFolio.name}.`:`Room ${record.roomName}; ${record.checkIn} to ${record.checkOut}; folio ${hotelFolio.name}.`}
        if(chargeType){if(input.hospitalityStock){const quantity=Number(input.hospitalityStock.quantity),productId=text(input.hospitalityStock.productId,150),product=(await db.query(`SELECT p.id,p.name,p.unit,p.price,i.stock FROM products p JOIN branch_inventory i ON i.product_id=p.id WHERE p.id=? AND i.branch_id=?${organizationId?' AND p.organization_id=?':''}`,[productId,branchId,...(organizationId?[organizationId]:[])])).values[0];if(!product||!validQuantity(quantity,0.001)||Number(product.stock)<quantity||Number(product.price)<=0)throw new Error('Choose a stocked product with a valid price and enough available quantity.');pendingHospitalityStock={productId,quantity};input={...input,lines:[{id:`hotel-stock:${product.id}`,description:`Room service: ${product.name}`,quantity,price:Number(product.price)}]}}}
        else {const nights=(Date.parse(`${record.checkOut}T00:00:00Z`)-Date.parse(`${record.checkIn}T00:00:00Z`))/86400000,breakdown=record.rateBreakdown||[{nightlyRate:record.nightlyRate,nights}],lines=breakdown.map((row,index)=>({id:index===0?record.id:`${record.id}:rate:${index}`,description:`Accommodation: ${record.roomName}`,quantity:row.nights,price:row.nightlyRate}));input={...input,note:`Room ${record.roomName}; ${record.checkIn} to ${record.checkOut} (${nights} night${nights===1?'':'s'}); folio ${hotelFolio.name}.`,lines}}
      }else if(record.kind==='nightclub-entry'){
        input={...input,customerName:record.guestName,customerPhone:record.guestPhone||'',title:`Nightclub admission - ${record.eventName}`.slice(0,200),note:`Admission for ${record.eventName}.`,lines:[{id:record.id,description:`Admission: ${record.eventName}`.slice(0,150),quantity:1,price:record.admissionPrice}]}
      }else if(record.kind==='nightclub-inquiry'){
        if(!['quoted','confirmed'].includes(record.status)||!record.proposal||!Number.isFinite(record.quotedTotal)||record.quotedTotal<=0)throw new Error('Prepare a valid quote for this private event before creating an estimate.')
        input={...input,estimate:true,customerName:record.guestName,customerPhone:record.guestPhone||'',title:`Private event proposal - ${record.eventType}`.slice(0,200),note:record.proposal,lines:[{id:record.id,description:`Private event: ${record.eventType}`.slice(0,150),quantity:1,price:record.quotedTotal}]}
      }else throw new Error('Only hotel stays, nightclub guest entries and quoted private event inquiries can be invoiced.')
      if(record.customerPortalId&&(!hotelFolio||hotelFolio.id==='guest'))hospitalityCustomerPortalId=record.customerPortalId
      if(record.customerId&&(!hotelFolio||hotelFolio.id==='guest')){if(input.customerId&&input.customerId!==record.customerId)throw new Error('Use the customer account linked to this hospitality booking.');const customer=(await db.query(`SELECT id,name,phone FROM customers WHERE id=?${organizationId?' AND organization_id=?':''}`,[record.customerId,...(organizationId?[organizationId]:[])])).values[0];if(!customer)throw new Error('Sync the customer account linked to this booking before invoicing.');input={...input,customerId:record.customerId,customerName:customer.name,customerPhone:customer.phone||''}}
    }
    const lines=input.lines.map(line=>({id:text(line.id,100),description:text(line.description,150),quantity:Number(line.quantity),price:Number(line.price)}))
    if(input.customerId) {
      const customer=(await db.query(`SELECT id,name,phone,balance FROM customers WHERE id=?${organizationId?' AND organization_id=?':''}`,[input.customerId,...(organizationId?[organizationId]:[])])).values[0]
      if(!customer || customer.name.trim()!==String(input.customerName||'').trim() || String(customer.phone||'').trim()!==String(input.customerPhone||'').trim())throw new Error('Choose the matching customer account or enter this customer manually.')
    }
    job={...stamp,...(church?{church}:{}),...(hospitality?{hospitality}:{}),...(input.customerId?{customerId:text(input.customerId,150)}:{}),...(hospitalityCustomerPortalId?{customerPortalId:text(hospitalityCustomerPortalId,150)}:{}),id:input.id,kind:'service-job',branchId,tillId,status:input.estimate?'estimate':'new',createdAt:updatedAt,businessName:profile.businessName||settings.businessName,currency:settings.currency,customerName:text(input.customerName),customerPhone:text(input.customerPhone||'',80),title:text(input.title),note:text(input.note||'',1000),dueDate:text(input.dueDate||'',10),lines,profile,pricing:priceOrder(lines.map(line=>({productId:'service:'+line.id,quantity:line.quantity,price:line.price})),{tax:profile}),payments:[]}
    if(hospitality){const linked=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,hospitality.recordId])).values[0];validateHospitalityInvoice(job,linked&&JSON.parse(linked.payload))}
  } else {
    job={...previous,...stamp}
    const balance=serviceJobBalance(previous,await returns())
    if (path==='/api/pos/service-jobs/transfer-folio') {
      if(!hasPermission(user,'hotelOperations'))throw new Error('Hotel operations access is required to transfer an invoice between folios.')
      if(job.hospitality?.recordKind!=='hotel-stay'||!job.hospitality.recordId||!['estimate','new','in-progress','ready'].includes(job.status))throw new Error('Only an active hotel-stay estimate or unpaid invoice can be transferred.')
      if(previous.payments.length||balance.paid>0||balance.refunded>0)throw new Error('An invoice with payment or refund history cannot be moved; correct it with an auditable credit and replacement invoice.')
      const stayRow=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,job.hospitality.recordId])).values[0],stay=stayRow?JSON.parse(stayRow.payload):null
      if(!stay||stay.kind!=='hotel-stay'||stay.branchId!==branchId||!['booked','checked-in'].includes(stay.status))throw new Error('Only a booked or checked-in stay can receive a folio transfer.')
      const folioId=text(String(input.folioId||''),80),folio=hotelFolios(stay).find(item=>item.id===folioId)
      if(!folio)throw new Error('Choose an existing folio on the linked hotel stay.')
      const fromFolioId=job.hospitality.folioId||'guest'
      if(fromFolioId===folio.id)throw new Error('Choose a different folio for the transfer.')
      const reason=text(String(input.reason||''),500)
      if(!reason)throw new Error('Enter a reason for the folio transfer.')
      job.hospitality={...job.hospitality,folioId:folio.id}
      if(folio.groupMaster)job.hospitality.groupId=stay.groupId;else delete job.hospitality.groupId
      job.customerName=folio.payerName;job.customerPhone=folio.payerPhone||''
      delete job.customerId;delete job.customerPortalId
      job.lastCommandType='hotel-folio-transfer'
      job.folioTransferHistory=[...(previous.folioTransferHistory||[]),{fromFolioId,toFolioId:folio.id,reason,staffId:String(user.id),staffName:String(user.name),transferredAt:updatedAt}]
      validateHospitalityInvoice(job,stay)
    } else if (path==='/api/pos/service-jobs/status') {
      if (input.status==='cancelled' && (!['owner','admin'].includes(user.role) || balance.netPaid>0)) throw new Error('An owner or admin must refund retained payments before cancellation.')
      if(input.status==='completed' && balance.due>0)throw new Error('Collect the remaining balance before completing the job.')
      job.status=input.status;if(input.status==='cancelled')job.cancelledAt=updatedAt
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
      sale=recordPayment({id,branchId,organizationId,businessName:job.businessName,currency:job.currency,createdAt:updatedAt,staffId:user.id,staffName:user.name,items:[{productId:'service:'+job.id,productName:`${balance.netPaid===0 && amount<balance.due?'Deposit':'Payment'} - ${job.title}`.slice(0,200),quantity:1,price:amount}],total:amount,paymentMethod:input.method,paymentReference:text(input.reference||''),terminalProvider:text(input.provider||''),paymentDetails:{...(input.method==='wallet'?{customerId:job.customerId}:{}),...(input.method==='multiple'?{allocations:input.parts?.map(part=>({...part,amount:Number(part.amount)})),cashReceived:input.cash||undefined}:{}),...(input.settlementId?{serviceSettlement:{id:text(input.settlementId,150),request:text(input.settlementRequest||'',1000),index:Number(input.settlementIndex),count:Number(input.settlementCount)}}:{}),amountReceived:input.method==='cash'?(input.cash||amount):amount,serviceJob:link,servicePayment:{customerName:job.customerName,customerPhone:job.customerPhone}}},policyRow?.payment_policy)
      if(input.settlementId)sale.paymentDetails.serviceSettlement={id:text(input.settlementId,150),request:text(input.settlementRequest||'',1000),index:Number(input.settlementIndex),count:Number(input.settlementCount)}
      const tax=cents(job.pricing.tax)*(cents(balance.netPaid)+cents(amount))/cents(job.pricing.total)
      const allocatedTax=(Math.round(tax)-Math.round(cents(job.pricing.tax)*cents(balance.netPaid)/cents(job.pricing.total)))/100
      const subtotal=(cents(amount)-cents(allocatedTax))/100
      const register=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND kind='register' AND branch_id=?",[scope,branchId])).values.map(row=>JSON.parse(row.payload)).find(session=>!session.closedAt && session.staffId===user.id && (!session.tillId||session.tillId===tillId))
      sale.paymentDetails.pos={tillId,registerId:register?.id,pricing:{subtotal,discount:0,tax:allocatedTax,total:amount,taxSettings:posSettings({...job.profile,taxIncluded:false}),lines:[{productId:'service:'+job.id,quantity:1,subtotal,discount:0,tax:allocatedTax,total:amount}]}}
      sale.paymentDetails.receipt={address:job.profile.address,phone:job.profile.phone,email:job.profile.email,footer:job.profile.footer,number:'REC-'+id.slice(-8).toUpperCase(),transactionType:job.church?'Collection / donation':job.hospitality?.chargeType==='extra'?'Hotel folio payment':job.hospitality?.recordKind==='hotel-stay'?'Hotel accommodation payment':job.hospitality?.recordKind==='nightclub-entry'?'Nightclub admission payment':job.hospitality?.recordKind==='nightclub-inquiry'?'Private event payment':'Invoice payment',cardType:''}
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
