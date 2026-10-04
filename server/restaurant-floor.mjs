const key=tab=>tab.id+':'+tab.sessionId
export const floorId=branch=>`restaurant-floor:${branch}`
export function restaurantTabs(tabs,floor) {
  return tabs.map(tab=>{
    const binding=floor?.bindings?.find(row=>row.tabId===tab.id && row.sessionId===tab.sessionId)
    const members=(floor?.bindings||[]).filter(row=>row.mergedInto?.tabId===tab.id && row.mergedInto.sessionId===tab.sessionId).map(row=>({tabId:row.tabId,sessionId:row.sessionId,seatOffset:row.seatOffset}))
    return {...tab,...(tab.history?{history:restaurantTabs(tab.history,floor)}:{}),displayTableId:binding?binding.tableId:tab.tableId,name:binding?.name||tab.name,guests:binding?.guests||tab.guests,billMembers:members,mergedInto:binding?.mergedInto,floorRevision:floor?.updatedAt||''}
  })
}
export function billContains(tab,order) {
  return order.tableService && ((order.tableService.tabId===tab.id && order.tableService.sessionId===tab.sessionId) || tab.billMembers?.some(member=>member.tabId===order.tableService.tabId && member.sessionId===order.tableService.sessionId))
}
export function billSeat(tab,order) {
  const seat=order.tableService?.seat||0
  return seat ? seat+(tab.billMembers?.find(member=>member.tabId===order.tableService.tabId && member.sessionId===order.tableService.sessionId)?.seatOffset||0) : 0
}
export function floorChange(previous,input,tabs,layout,sales) {
  const effective=restaurantTabs(tabs,previous)
  const source=effective.find(tab=>tab.id===input.tabId && tab.sessionId===input.sessionId && tab.status==='open' && !tab.mergedInto)
  if(!source || source.tillId!==input.tillId) throw new Error('Change this open bill on its original till.')
  const bindings=[...(previous?.bindings||[])].map(row=>({...row}))
  const set=(tab,change)=>{const row=bindings.find(row=>row.tabId===tab.id&&row.sessionId===tab.sessionId);const value={tabId:tab.id,sessionId:tab.sessionId,tableId:tab.displayTableId,name:tab.name,guests:tab.guests,...change};if(row)Object.assign(row,value);else bindings.push(value)}
  if(input.action==='move') {
    const table=layout.tables.find(table=>table.id===input.tableId)
    if(!table || source.guests>table.seats) throw new Error('Choose a table with enough seats.')
    if(effective.some(tab=>tab.status==='open' && !tab.mergedInto && tab.displayTableId===table.id && key(tab)!==key(source))) throw new Error('That table already has an open bill.')
    set(source,{tableId:table.id,name:table.name})
  }else if(input.action==='merge') {
    const target=effective.find(tab=>tab.id===input.targetId&&tab.sessionId===input.targetSessionId&&tab.status==='open'&&!tab.mergedInto)
    if(!target || key(target)===key(source) || source.tillId!==target.tillId || source.currency!==target.currency || source.businessName!==target.businessName) throw new Error('Merge different open bills with the same till and currency.')
    if(sales.some(sale=>sale.paymentDetails?.restaurantBill?.sessionId===source.sessionId || sale.paymentDetails?.counterOrder?.tableService?.sessionId===source.sessionId)) throw new Error('Refunding or moving saved payments between bills is not allowed. Merge a source bill before taking its payment.')
    const guests=source.guests+target.guests,table=layout.tables.find(table=>table.id===target.displayTableId)
    if(guests>100 || table && guests>table.seats) throw new Error('The combined guest count exceeds the destination seats. Use a larger table or a named tab.')
    for(const member of source.billMembers) {
      if(sales.some(sale=>sale.paymentDetails?.counterOrder?.tableService?.sessionId===member.sessionId)) throw new Error('The source bill already contains a saved payment.')
      const row=bindings.find(row=>row.tabId===member.tabId&&row.sessionId===member.sessionId)
      row.mergedInto={tabId:target.id,sessionId:target.sessionId};row.seatOffset=(row.seatOffset||0)+target.guests
    }
    set(source,{mergedInto:{tabId:target.id,sessionId:target.sessionId},seatOffset:target.guests})
    set(target,{guests})
  }else throw new Error('Choose move or merge.')
  return bindings
}
export function validateRestaurantFloor(record,previous,tabs,layout,sales) {
  if(record.kind!=='restaurant-floor'||record.id!==floorId(record.branchId)||record.expectedUpdatedAt!==(previous?.updatedAt||'')||!Number.isFinite(Date.parse(record.updatedAt))||!record.command||!Array.isArray(record.bindings)||record.bindings.length>10000) throw new Error('Invalid table arrangement revision.')
  if(JSON.stringify(record.bindings)!==JSON.stringify(floorChange(previous,record.command,tabs,layout,sales))) throw new Error('The table arrangement must preserve the saved bills.')
}

export function validateFloorSnapshot(record) {
  if(record?.kind!=='restaurant-floor'||record.id!==floorId(record.branchId)||!Number.isFinite(Date.parse(record.updatedAt))||!Array.isArray(record.bindings)||record.bindings.length>10000)throw new Error('Invalid accepted table arrangement.')
  const keys=new Set()
  for(const row of record.bindings){const id=row.tabId+':'+row.sessionId;if(keys.has(id)||typeof row.tabId!=='string'||!row.tabId.startsWith(`restaurant-tab:${record.branchId}:`)||typeof row.sessionId!=='string'||!row.sessionId||typeof row.tableId!=='string'||typeof row.name!=='string'||!row.name||!Number.isInteger(row.guests)||row.guests<1||row.guests>100||row.mergedInto&&(typeof row.mergedInto.tabId!=='string'||typeof row.mergedInto.sessionId!=='string'||!Number.isInteger(row.seatOffset)||row.seatOffset<1||row.seatOffset>100))throw new Error('Invalid accepted table binding.');keys.add(id)}
  return record
}
