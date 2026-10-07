import { validateChurchRecord, churchSummary } from './church-ledger.mjs'
import { normalizeShopProfile } from './shop-profile.mjs'
export async function handleChurch({db,scope,organizationId,branchId,user,method,input,saveRecord,publish,tillId}) {
  const records=async kind=>(await db.query('SELECT payload FROM pos_records WHERE scope=? AND kind=? AND branch_id=?',[scope,kind,branchId])).values.map(row=>JSON.parse(row.payload))
  if(method==='GET'){
    const jobs=(await records('service-job')).filter(row=>row.church),returns=await records('return')
    const settings=(await db.query(`SELECT shop_profile FROM app_settings ${organizationId?'WHERE organization_id=?':'WHERE id=1'}`,organizationId?[organizationId]:[])).values[0]
    const timeZone=normalizeShopProfile(settings?.shop_profile).reportingTimeZone
    return {funds:await records('church-fund'),donors:await records('church-donor'),jobs,returns,timeZone,summary:churchSummary(jobs,returns,{timeZone})}
  }
  if(method!=='POST'||!['owner','admin'].includes(user.role)||!tillId)throw new Error('Owner or admin access and a registered till are required to manage funds and donors.')
  if(!['church-fund','church-donor'].includes(input.kind)||!input.commandId||!['create','archive'].includes(input.action))throw new Error('Choose a valid fund or donor action.')
  const found=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,input.id])).values[0],previous=found?JSON.parse(found.payload):null
  const request=JSON.stringify(input),retry=previous?.events.find(event=>event.commandId===input.commandId)
  if(retry){if(retry.request!==request)throw new Error('This command already has different details.');return previous}
  if((previous?.updatedAt||'')!==input.expectedUpdatedAt)throw new Error('This fund or donor changed. Refresh before continuing.')
  const updatedAt=new Date(Math.max(Date.now(),Date.parse(previous?.updatedAt||'')+1||0)).toISOString()
  const record=previous?{...previous,status:'archived'}:{id:input.id,kind:input.kind,branchId,name:String(input.name||'').trim(),phone:input.kind==='church-donor'?String(input.phone||'').trim():'',status:'active',events:[]}
  if(record.branchId!==branchId||record.kind!==input.kind||(!previous&&input.action!=='create')||(previous&&input.action!=='archive'))throw new Error('Choose a matching fund or donor action in this branch.')
  Object.assign(record,{updatedAt,expectedUpdatedAt:previous?.updatedAt||'',events:[...record.events,{commandId:input.commandId,action:input.action,at:updatedAt,staffId:user.id,staffName:user.name,request}]})
  validateChurchRecord(record,previous)
  await db.beginTransaction()
  try{const current=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,input.id])).values[0];if((current?JSON.parse(current.payload).updatedAt:'')!==record.expectedUpdatedAt)throw new Error('This fund or donor changed. Refresh before continuing.');await saveRecord(db,scope,record);await publish(record);await db.commitTransaction()}catch(error){await db.rollbackTransaction();throw error}
  return record
}
