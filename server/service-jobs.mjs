import { validateChurchLink } from './church-ledger.mjs'
import { validQuantity } from './quantities.mjs'
import { priceOrder, posSettings } from './pos-pricing.mjs'
import { recordPayment, paymentResult } from './payment.mjs'
import { receiptSettings } from './receipts.mjs'
import { saveRestaurantSale } from './restaurant-payments.mjs'
const cents = value => Math.round(Number(value) * 100)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const text = (value, max = 200) => { if (typeof value !== 'string' || value.length > max) throw new Error('Enter valid job details.'); return value.trim() }
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
    seen.add(sale.id)
    if(sale.paymentDetails.pos?.tillId!==job.tillId || sale.paymentDetails.servicePayment?.customerName!==job.customerName || sale.paymentDetails.servicePayment?.customerPhone!==job.customerPhone || sale.paymentDetails.serviceJob.title!==job.title)throw new Error('Payment must match the saved customer and till.')
    if (cents(sale.paymentDetails.serviceJob.invoiceTotal)!==cents(job.pricing.total)) throw new Error('Invalid invoice total.')
  }
  if (!snapshot && previous) {
    if (job.expectedUpdatedAt!==previous.updatedAt) throw new Error('This job changed. Refresh before continuing.')
    for (const key of ['church','id','kind','branchId','tillId','currency','businessName','createdAt','customerName','customerPhone','customerId','title','note','dueDate','lines','pricing','profile']) if (!same(job[key], previous[key])) throw new Error('Issued job details and prices cannot be overwritten. Cancel and create a replacement.')
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
  for (const entry of job.payments) await saveRestaurantSale(db,entry.sale,organizationId)
}
export const requiresServiceJobSync = operation => operation.payload?.kind==='service-job' || Boolean(operation.payload?.paymentDetails?.serviceJob)
export async function handleServiceJobs({db,scope,organizationId,branchId,user,path,method,input,tillId,sales,publish,saveRecord}) {
  const rows=()=>db.query("SELECT payload FROM pos_records WHERE scope=? AND kind='service-job' AND branch_id=? ORDER BY updated_at DESC",[scope,branchId])
  const returns=async()=> (await db.query("SELECT payload FROM pos_records WHERE scope=? AND kind='return' AND branch_id=?",[scope,branchId])).values.map(row=>JSON.parse(row.payload))
  if (method==='GET') { const jobs=(await rows()).values.map(row=>JSON.parse(row.payload)); const refunds=await returns(); return {jobs:jobs.filter(job=>!job.church).map(job=>({...job,balance:serviceJobBalance(job,refunds)})),customers:(await db.query(`SELECT id,name,phone,balance FROM customers ${organizationId?'WHERE organization_id=?':''}`,organizationId?[organizationId]:[])).values} }
  if (!tillId || !String(input.id).startsWith('service-job:') || typeof input.commandId!=='string' || !input.commandId) throw new Error('A registered till and job command are required.')
  const previousRow=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,input.id])).values[0]
  const previous=previousRow ? JSON.parse(previousRow.payload) : null
  if (previous && (previous.kind!=='service-job' || previous.branchId!==branchId || previous.tillId!==tillId)) throw new Error('Manage this job on its original till and branch.')
  const request=JSON.stringify(input)
  const retry=previous?.payments.find(entry=>entry.sale.id==='service-payment:'+input.commandId)
  if (retry) { if(retry.request!==request)throw new Error('This payment ID already has different details.');return {job:previous,sale:retry.sale} }
  if (previous?.lastCommandId===input.commandId) { if(previous.lastRequest!==request)throw new Error('This command ID already has different details.');return {job:previous} }
  if ((previous?.updatedAt||'')!==input.expectedUpdatedAt) throw new Error('This job changed. Refresh before continuing.')
  const updatedAt=new Date(Math.max(Date.now(),Date.parse(previous?.updatedAt||'')+1||0)).toISOString()
  const stamp={updatedAt,expectedUpdatedAt:previous?.updatedAt||'',lastCommandId:input.commandId,lastRequest:request,staffId:user.id,staffName:user.name}
  let job, sale
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
    const lines=input.lines.map(line=>({id:text(line.id,100),description:text(line.description,150),quantity:Number(line.quantity),price:Number(line.price)}))
    if(input.customerId) {
      const customer=(await db.query(`SELECT id,name,phone,balance FROM customers WHERE id=?${organizationId?' AND organization_id=?':''}`,[input.customerId,...(organizationId?[organizationId]:[])])).values[0]
      if(!customer || customer.name.trim()!==String(input.customerName||'').trim() || String(customer.phone||'').trim()!==String(input.customerPhone||'').trim())throw new Error('Choose the matching customer account or enter this customer manually.')
    }
    job={...stamp,...(church?{church}:{}),...(input.customerId?{customerId:text(input.customerId,150)}:{}),id:input.id,kind:'service-job',branchId,tillId,status:input.estimate?'estimate':'new',createdAt:updatedAt,businessName:profile.businessName||settings.businessName,currency:settings.currency,customerName:text(input.customerName),customerPhone:text(input.customerPhone||'',80),title:text(input.title),note:text(input.note||'',1000),dueDate:text(input.dueDate||'',10),lines,profile,pricing:priceOrder(lines.map(line=>({productId:'service:'+line.id,quantity:line.quantity,price:line.price})),{tax:profile}),payments:[]}
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
      const link={...(job.church?{church:job.church}:{}),id:job.id,number:job.id.slice(-8).toUpperCase(),title:job.title,invoiceTotal:job.pricing.total,balanceDue:(cents(balance.due)-cents(amount))/100}
      const policyRow=(await db.query(`SELECT payment_policy FROM app_settings ${organizationId?'WHERE organization_id=?':'WHERE id=1'}`,organizationId?[organizationId]:[])).values[0]
      sale=recordPayment({id,branchId,organizationId,businessName:job.businessName,currency:job.currency,createdAt:updatedAt,staffId:user.id,staffName:user.name,items:[{productId:'service:'+job.id,productName:`${balance.netPaid===0 && amount<balance.due?'Deposit':'Payment'} - ${job.title}`.slice(0,200),quantity:1,price:amount}],total:amount,paymentMethod:input.method,paymentReference:text(input.reference||''),terminalProvider:text(input.provider||''),paymentDetails:{...(input.method==='wallet'?{customerId:job.customerId}:{}),...(input.method==='multiple'?{allocations:input.parts?.map(part=>({...part,amount:Number(part.amount)})),cashReceived:input.cash||undefined}:{}),amountReceived:input.method==='cash'?(input.cash||amount):amount,serviceJob:link,servicePayment:{customerName:job.customerName,customerPhone:job.customerPhone}}},policyRow?.payment_policy)
      const tax=cents(job.pricing.tax)*(cents(balance.netPaid)+cents(amount))/cents(job.pricing.total)
      const allocatedTax=(Math.round(tax)-Math.round(cents(job.pricing.tax)*cents(balance.netPaid)/cents(job.pricing.total)))/100
      const subtotal=(cents(amount)-cents(allocatedTax))/100
      const register=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND kind='register' AND branch_id=?",[scope,branchId])).values.map(row=>JSON.parse(row.payload)).find(session=>!session.closedAt && session.staffId===user.id && (!session.tillId||session.tillId===tillId))
      sale.paymentDetails.pos={tillId,registerId:register?.id,pricing:{subtotal,discount:0,tax:allocatedTax,total:amount,taxSettings:posSettings({...job.profile,taxIncluded:false}),lines:[{productId:'service:'+job.id,quantity:1,subtotal,discount:0,tax:allocatedTax,total:amount}]}}
      sale.paymentDetails.receipt={address:job.profile.address,phone:job.profile.phone,email:job.profile.email,footer:job.profile.footer,number:'REC-'+id.slice(-8).toUpperCase(),transactionType:job.church?'Collection / donation':'Invoice payment',cardType:''}
      job.payments=[...job.payments,{sale,request}]
    } else throw new Error('Unknown service job action.')
  }
  validateServiceJob(job,previous,false,await returns())
  await db.beginTransaction()
  try {
    const current=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,job.id])).values[0]
    if((current?JSON.parse(current.payload).updatedAt:'')!==job.expectedUpdatedAt)throw new Error('This job changed. Refresh before continuing.')
    validateServiceJob(job,current?JSON.parse(current.payload):null,false,await returns())
    if(sale) await saveRestaurantSale(db,sale,organizationId);await saveRecord(db,scope,job);await publish(job);await db.commitTransaction() } catch(error){await db.rollbackTransaction();throw error}
  return {job,sale}
}
