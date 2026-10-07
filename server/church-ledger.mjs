import { businessDate } from './report-timezone.mjs'
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const text=(value,max=200)=>typeof value==='string'&&value.length<=max&&value===value.trim()
export function validateChurchLink(link) {
  if(!link||!['pledge','donation'].includes(link.type)||!/^church-fund:[\w-]+$/.test(link.fundId)||!text(link.fundName)||!link.fundName||!text(link.donorName)||!text(link.donorPhone,80)||!(link.donorId===''||/^church-donor:[\w-]+$/.test(link.donorId))||!link.donorName||link.type==='pledge'&&!link.donorId)throw new Error('Choose a fund and a registered donor for a pledge.')
  return link
}
export function validateChurchRecord(record,previous,snapshot=false) {
  if(!['church-fund','church-donor'].includes(record.kind)||!new RegExp('^'+record.kind+':[\\w-]+$').test(record.id)||!record.branchId||!text(record.name)||!record.name||!text(record.phone,80)||!['active','archived'].includes(record.status)||!Number.isFinite(Date.parse(record.updatedAt))||!Array.isArray(record.events)||!record.events.length||record.events.length>100)throw new Error('Invalid fund or donor record.')
  const commands=new Set()
  for(const event of record.events){if(!event.commandId||commands.has(event.commandId)||!Number.isFinite(Date.parse(event.at))||!event.staffId||!['create','archive'].includes(event.action))throw new Error('Preserve fund and donor history.');commands.add(event.commandId)}
  if(record.events[0].action!=='create'||record.events.at(-1).at!==record.updatedAt||record.status!==(record.events.at(-1).action==='archive'?'archived':'active'))throw new Error('Invalid fund or donor history.')
  if(!snapshot){
    if(previous){for(const key of ['id','kind','branchId','name','phone'])if(!same(record[key],previous[key]))throw new Error('Saved fund and donor identities cannot be rewritten.');if(previous.status!=='active'||record.status!=='archived'||record.expectedUpdatedAt!==previous.updatedAt||record.events.length!==previous.events.length+1||!same(record.events.slice(0,-1),previous.events))throw new Error('Preserve fund and donor history.')}
    else if(record.expectedUpdatedAt!==''||record.status!=='active'||record.events.length!==1)throw new Error('Create the fund or donor first.')
  }
  return record
}
export const requiresChurchSync=operation=>operation.payload?.kind?.startsWith('church-')||Boolean(operation.payload?.church||operation.payload?.paymentDetails?.serviceJob?.church)
export function churchSummary(jobs,returns=[],{from='',to='',timeZone='UTC',donorId='',fundId=''}={}) {
  const cents=value=>Math.round(Number(value)*100), date=instant=>businessDate(instant,timeZone)
  const rows=[];const funds=new Map();const pledges=[]
  for(const job of jobs){const link=job.church;if(!link||donorId&&link.donorId!==donorId||fundId&&link.fundId!==fundId)continue
    const payments=job.payments||[];let lifetime=0
    for(const entry of payments){const sale=entry.sale;lifetime+=cents(sale.total);const day=date(sale.createdAt);if((!from||day>=from)&&(!to||day<=to))rows.push({id:sale.id,date:day,kind:'Donation',fundId:link.fundId,fund:link.fundName,donorId:link.donorId,donor:link.donorName,currency:job.currency,amount:sale.total,reference:sale.paymentDetails?.receipt?.number||sale.id,pledgeId:link.type==='pledge'?job.id:''})}
    for(const refund of returns.filter(row=>payments.some(entry=>entry.sale.id===row.saleId))){lifetime-=cents(refund.total);const day=date(refund.updatedAt);if((!from||day>=from)&&(!to||day<=to))rows.push({id:refund.id,date:day,kind:'Refund',fundId:link.fundId,fund:link.fundName,donorId:link.donorId,donor:link.donorName,currency:job.currency,amount:-refund.total,reference:refund.saleId,pledgeId:link.type==='pledge'?job.id:''})}
    if(link.type==='pledge')pledges.push({id:job.id,title:job.title,donor:link.donorName,fund:link.fundName,currency:job.currency,dueDate:job.dueDate,status:job.status,total:job.pricing.total,netPaid:lifetime/100,outstanding:job.status==='cancelled'?0:Math.max(0,cents(job.pricing.total)-lifetime)/100})
  }
  for(const row of rows){const key=row.fundId+':'+row.currency;const total=funds.get(key)||{fundId:row.fundId,fund:row.fund,currency:row.currency,received:0,refunded:0,net:0};if(row.amount>=0)total.received+=cents(row.amount);else total.refunded-=cents(row.amount);total.net+=cents(row.amount);funds.set(key,total)}
  return {rows:rows.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)),funds:[...funds.values()].map(row=>({...row,received:row.received/100,refunded:row.refunded/100,net:row.net/100})),pledges}
}
