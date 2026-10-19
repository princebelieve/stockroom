const accounts = [
  { code: '1000', name: 'Cash and bank', type: 'asset' },
  { code: '1100', name: 'Guest receivables', type: 'asset' },
  { code: '1200', name: 'Inventory', type: 'asset' },
  { code: '2000', name: 'Tax payable', type: 'liability' },
  { code: '2100', name: 'Guest deposits', type: 'liability' },
  { code: '2200', name: 'Unearned hospitality revenue', type: 'liability' },
  { code: '2300', name: 'Trade payables', type: 'liability' },
  { code: '3000', name: 'Owner equity', type: 'equity' },
  { code: '4000', name: 'Room revenue', type: 'income' },
  { code: '4100', name: 'Event and venue revenue', type: 'income' },
  { code: '4200', name: 'Food and beverage revenue', type: 'income' },
  { code: '5000', name: 'Room and event operating costs', type: 'expense' },
  { code: '5100', name: 'Housekeeping and laundry', type: 'expense' },
  { code: '5200', name: 'Repairs and maintenance', type: 'expense' },
  { code: '5300', name: 'Utilities and occupancy', type: 'expense' },
  { code: '5400', name: 'Payroll and staff costs', type: 'expense' },
]
const cents = value => Math.round(Number(value) * 100)
const isoDate = value => { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const parsed = new Date(`${value}T00:00:00.000Z`); return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value }
export const hotelAccounts = () => accounts.map(account => ({ ...account }))
export function validateHotelJournal(record, previous) {
  if (!record || !String(record.id || '').startsWith('hotel-journal:') || record.kind !== 'hotel-journal-entry' || !record.branchId || !isoDate(record.date) || !Number.isFinite(Date.parse(record.createdAt)) || !Number.isFinite(Date.parse(record.updatedAt))) throw new Error('Enter a valid hotel ledger entry.')
  if (previous) throw new Error('Posted ledger entries are permanent; enter a correcting journal instead.')
  if (typeof record.memo !== 'string' || !record.memo.trim() || record.memo.length > 240 || !Array.isArray(record.lines) || record.lines.length < 2 || record.lines.length > 20) throw new Error('Enter a memo and two to twenty journal lines.')
  const codes = new Set(accounts.map(account => account.code))
  let debit = 0, credit = 0
  for (const line of record.lines) {
    if (!codes.has(String(line.accountCode)) || !Number.isFinite(Number(line.debit)) || !Number.isFinite(Number(line.credit)) || Number(line.debit) < 0 || Number(line.credit) < 0 || cents(line.debit) % 1 || cents(line.credit) % 1 || Number(line.debit) > 0 && Number(line.credit) > 0 || Number(line.debit) === Number(line.credit)) throw new Error('Each journal line must use a valid account and have either a debit or a credit.')
    debit += cents(line.debit); credit += cents(line.credit)
  }
  if (debit <= 0 || debit !== credit) throw new Error('Journal debits and credits must be equal and greater than zero.')
  return record
}
export function validateHotelDayClose(record, previous) {
  const expectedId=record?.branchId&&record?.businessDate?`hotel-day-close:${record.branchId}:${record.businessDate}`:''
  const legacyId=record?.businessDate?`hotel-day-close:${record.businessDate}`:''
  if(!record||record.kind!=='hotel-day-close'||!String(record.id||'').startsWith('hotel-day-close:')||record.id!==expectedId&&record.id!==legacyId||!record.branchId||!isoDate(record.businessDate)||!Number.isFinite(Date.parse(record.createdAt))||!Number.isFinite(Date.parse(record.updatedAt))||!record.summary||!Number.isInteger(record.summary.arrivals)||!Number.isInteger(record.summary.departures)||!Number.isInteger(record.summary.inHouse)||!Number.isInteger(record.summary.noShows)||!Number.isInteger(record.summary.unresolved)||!Number.isFinite(record.summary.roomRevenue)||record.summary.roomRevenue<0)throw new Error('Enter a valid hotel business-date close.')
  if(previous)throw new Error('A closed hotel business date is permanent; post a correction for an accounting adjustment.')
  if(Object.values(record.summary).some(value=>value<0))throw new Error('Hotel close totals cannot be negative.')
  if(record.summary.occupiedRooms!==undefined&&!Number.isInteger(record.summary.occupiedRooms)||record.summary.roomReceivables!==undefined&&(!Number.isFinite(record.summary.roomReceivables)||record.summary.roomReceivables<0))throw new Error('Enter valid room occupancy and receivable totals for the hotel close.')
  return record
}
function businessDateOf(timestamp, timeZone) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return ''
  try { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date) } catch { return date.toISOString().slice(0, 10) }
}
export function hotelCashierAudit(reconciliation, dayCloses, businessDate, timeZone = 'UTC', submitted = {}, canReview = true, reviewedAt = '') {
  const prior = dayCloses.flatMap(row => row.summary?.cashierReview?.sessions || [])
  const priorSessions = new Set(prior.map(row => row.sessionId))
  const priorReceipts = new Set(dayCloses.flatMap(row => row.summary?.cashierReview?.unassignedCashTransactions || []).map(row => row.saleId))
  const sessionIds = new Set(Array.isArray(submitted.sessionIds) ? submitted.sessionIds.map(String) : [])
  const receiptIds = new Set(Array.isArray(submitted.receiptIds) ? submitted.receiptIds.map(String) : [])
  const sessionNotes = submitted.sessionNotes && typeof submitted.sessionNotes === 'object' ? submitted.sessionNotes : {}
  const receiptNotes = submitted.receiptNotes && typeof submitted.receiptNotes === 'object' ? submitted.receiptNotes : {}
  const pendingSessions = [], openSessions = [], pendingReceipts = [], blockers = []
  for (const session of reconciliation?.sessions || []) {
    const sessionDate = businessDateOf(session.closedAt || session.openedAt, timeZone)
    if (!sessionDate || sessionDate > businessDate || priorSessions.has(session.id)) continue
    if (!session.closedAt) { openSessions.push({ sessionId: session.id, sessionDate, staffName: session.staffName, cashPayments: session.cashPayments, cashRefunds: session.cashRefunds, hotelPaymentCount: session.hotelPaymentCount }); continue }
    const item = { sessionId: session.id, sessionDate, staffName: session.staffName, tillId: session.tillId, cashPayments: session.cashPayments, cashRefunds: session.cashRefunds, netHotelCash: session.netHotelCash, hotelPaymentCount: session.hotelPaymentCount, expectedCash: Number(session.expectedCash || 0), countedCash: Number(session.countedCash || 0), difference: Number(session.difference || 0), otherCashSales: Number(session.otherCashSales || 0), closedAt: session.closedAt }
    pendingSessions.push(item)
  }
  for (const receipt of [...(reconciliation?.unassignedCashPayments || []).map(row=>({...row,direction:'receipt'})),...(reconciliation?.unassignedCashRefunds||[]).map(row=>({...row,direction:'refund'}))]) {
    const receiptDate = businessDateOf(receipt.createdAt, timeZone)
    if (!receiptDate || receiptDate > businessDate || priorReceipts.has(receipt.saleId)) continue
    pendingReceipts.push({ saleId: receipt.saleId, jobId: receipt.jobId, amount: receipt.amount, method: receipt.method, direction:receipt.direction, receiptDate, sourceSaleId:receipt.sourceSaleId||'' })
  }
  if (openSessions.length) blockers.push(`${openSessions.length} Register session(s) with hotel payments must be closed before night audit.`)
  if ((pendingSessions.length || pendingReceipts.length) && !canReview) blockers.push('Register permission is required to review hotel cash receipts and sign off cashier sessions.')
  if (canReview) {
    const missingSessions = pendingSessions.filter(row => !sessionIds.has(row.sessionId))
    const missingReceipts = pendingReceipts.filter(row => !receiptIds.has(row.saleId))
    if (missingSessions.length) blockers.push(`${missingSessions.length} closed Register session(s) with hotel payments need cashier sign-off.`)
    if (missingReceipts.length) blockers.push(`${missingReceipts.length} hotel cash receipt(s) without a Register session need review.`)
    const unexplainedSessions = pendingSessions.filter(row => Math.abs(row.difference) >= 0.005 && String(sessionNotes[row.sessionId] || '').trim().length < 10)
    const unexplainedReceipts = pendingReceipts.filter(row => String(receiptNotes[row.saleId] || '').trim().length < 10)
    if (unexplainedSessions.length) blockers.push(`${unexplainedSessions.length} Register variance(s) need an explanation of at least 10 characters.`)
    if (unexplainedReceipts.length) blockers.push(`${unexplainedReceipts.length} off-register cash receipt(s) need an explanation of at least 10 characters.`)
  }
  const sessions = canReview ? pendingSessions.filter(row => sessionIds.has(row.sessionId)).map(row => ({ ...row, reviewNote: String(sessionNotes[row.sessionId] || '').trim().slice(0, 500) })) : []
  const unassignedReceipts = canReview ? pendingReceipts.filter(row => receiptIds.has(row.saleId)).map(row => ({ ...row, reviewNote: String(receiptNotes[row.saleId] || '').trim().slice(0, 500) })) : []
  const snapshot = sessions.length || unassignedReceipts.length ? { reviewedAt, sessions, unassignedCashTransactions: unassignedReceipts } : null
  return { blockers, pendingSessions: canReview ? pendingSessions : [], openSessions: canReview ? openSessions : [], pendingReceipts: canReview ? pendingReceipts : [], snapshot, canReview }
}
export function buildHotelNightAudit(businessDate, stays, rooms, shifts, jobs, latestClosedDate = '', cashierAudit = { blockers: [] }) {
  const dayStays = stays
  const dayRooms = new Map(rooms.map(room => [room.id, room]))
  const invoicesByStay = new Map()
  for (const job of jobs) if (job.hospitality?.recordKind === 'hotel-stay' && !job.hospitality.chargeType) invoicesByStay.set(job.hospitality.recordId, job)
  const arrivalExceptions = dayStays.filter(stay => stay.status === 'booked' && stay.checkIn <= businessDate)
  const departureExceptions = dayStays.filter(stay => stay.status === 'checked-in' && stay.checkOut <= businessDate)
  const activeStays = dayStays.filter(stay => ['checked-in', 'checked-out'].includes(stay.status) && stay.checkIn <= businessDate && stay.checkOut > businessDate)
  const missingFolios = activeStays.filter(stay => { const invoice = invoicesByStay.get(stay.id); return !invoice || ['cancelled', 'estimate'].includes(invoice.status) })
  const unassignedRooms = activeStays.filter(stay => !stay.roomId || !dayRooms.has(stay.roomId))
  const roomAssignments = new Map()
  for (const stay of activeStays.filter(stay => stay.status === 'checked-in' && stay.roomId)) roomAssignments.set(stay.roomId, [...(roomAssignments.get(stay.roomId) || []), stay])
  const roomConflicts = [...roomAssignments.entries()].filter(([, occupants]) => occupants.length > 1)
  const openShifts = shifts.filter(shift => shift.businessDate <= businessDate && shift.status !== 'closed')
  const operationBlockers = [
    ...(latestClosedDate && businessDate !== new Date(Date.parse(`${latestClosedDate}T00:00:00.000Z`) + 86400000).toISOString().slice(0, 10) ? [`Close business dates in sequence. The next date to close is ${new Date(Date.parse(`${latestClosedDate}T00:00:00.000Z`) + 86400000).toISOString().slice(0, 10)}.`] : []),
    ...(arrivalExceptions.length ? [`${arrivalExceptions.length} due arrival(s) still need check-in, cancellation or no-show resolution.`] : []),
    ...(departureExceptions.length ? [`${departureExceptions.length} due departure(s) still need checkout or an approved stay extension.`] : []),
    ...(missingFolios.length ? [`${missingFolios.length} in-house stay(s) need a valid accommodation folio.`] : []),
    ...(unassignedRooms.length ? [`${unassignedRooms.length} in-house stay(s) need a registered room assignment.`] : []),
    ...(roomConflicts.length ? [`${roomConflicts.length} room(s) have multiple checked-in guests assigned.`] : []),
    ...(openShifts.length ? [`${openShifts.length} front-desk shift(s) still need handoff acknowledgment.`] : []),
  ]
  const blockers=[...operationBlockers,...(cashierAudit.blockers||[])]
  const roomRevenue = activeStays.reduce((sum, stay) => sum + Number(stay.nightlyRates?.find(row => row.date === businessDate)?.nightlyRate ?? stay.nightlyRate ?? 0), 0)
  const roomReceivables = activeStays.reduce((sum, stay) => sum + Math.max(0, Number(invoicesByStay.get(stay.id)?.balance?.due || 0)), 0)
  const summary = {
    arrivals: dayStays.filter(stay => stay.checkIn === businessDate && ['checked-in', 'checked-out'].includes(stay.status)).length,
    departures: dayStays.filter(stay => stay.checkOut === businessDate && stay.status === 'checked-out').length,
    inHouse: activeStays.filter(stay => stay.status === 'checked-in').length,
    noShows: dayStays.filter(stay => stay.status === 'no-show' && stay.checkIn === businessDate).length,
    unresolved: blockers.length,
    roomRevenue: Math.round(roomRevenue * 100) / 100,
    occupiedRooms: activeStays.filter(stay => stay.status === 'checked-in').length,
    roomReceivables: Math.round(roomReceivables * 100) / 100,
  }
  const warnings = []
  if (roomReceivables > 0) warnings.push(`${summary.inHouse} in-house folio(s) have ${summary.roomReceivables.toFixed(2)} outstanding; review guest credit and collection arrangements.`)
  const outOfService = activeStays.filter(stay => { const room = dayRooms.get(stay.roomId); return room && room.status !== 'active' })
  if (outOfService.length) warnings.push(`${outOfService.length} in-house stay(s) occupy a room marked out of service.`)
  return { businessDate, readyToClose: blockers.length === 0, operationallyReady:operationBlockers.length===0, blockers, warnings, summary, cashierReview:cashierAudit }
}
export function hotelTrialBalance(entries, throughDate) {
  const balances = new Map(accounts.map(account => [account.code, { ...account, debit: 0, credit: 0, balance: 0 }]))
  for (const entry of entries) if (['hotel-journal-entry','hotel-system-entry'].includes(entry.kind) && entry.date <= throughDate) for (const line of entry.lines || []) {
    const row = balances.get(line.accountCode)
    if (!row) continue
    row.debit += Number(line.debit || 0); row.credit += Number(line.credit || 0)
    row.balance += row.type === 'asset' || row.type === 'expense' ? Number(line.debit || 0) - Number(line.credit || 0) : Number(line.credit || 0) - Number(line.debit || 0)
  }
  return [...balances.values()].filter(row => row.debit || row.credit).map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'number' ? Math.round(value * 100) / 100 : value])))
}
export function hotelIncomeStatement(entries, fromDate, throughDate) {
  const totals={revenue:0,expenses:0}
  const byCode=new Map(accounts.map(row=>[row.code,row]))
  for(const entry of entries)if(['hotel-journal-entry','hotel-system-entry'].includes(entry.kind)&&entry.date>=fromDate&&entry.date<=throughDate)for(const line of entry.lines||[]){const account=byCode.get(line.accountCode);if(account?.type==='income')totals.revenue+=Number(line.credit||0)-Number(line.debit||0);if(account?.type==='expense')totals.expenses+=Number(line.debit||0)-Number(line.credit||0)}
  return {revenue:Math.round(totals.revenue*100)/100,expenses:Math.round(totals.expenses*100)/100,operatingResult:Math.round((totals.revenue-totals.expenses)*100)/100,fromDate,throughDate}
}
export function hotelCashierReconciliation(registers, hospitalityJobs, refunds = []) {
  const hotelSales = hospitalityJobs.filter(job => job.hospitality?.recordKind === 'hotel-stay').flatMap(job => (job.payments || []).map(payment => ({ sale: payment.sale, jobId: job.id }))).filter(row => row.sale?.id)
  const saleIds = new Set(hotelSales.map(row => row.sale.id))
  const cashPortion = sale => sale.paymentMethod === 'cash'
    ? Number(sale.total || 0) + Number(sale.paymentDetails?.extraKept || 0)
    : (sale.paymentDetails?.allocations || []).filter(part => part.method === 'cash').reduce((sum, part) => sum + Number(part.amount || 0), 0)
  const byRegister = new Map()
  const unassigned = []
  for (const { sale, jobId } of hotelSales) {
    const registerId = sale.paymentDetails?.pos?.registerId
    const entry = { amount: Math.round(cashPortion(sale) * 100) / 100, method: sale.paymentMethod, jobId, saleId: sale.id }
    if (registerId) byRegister.set(registerId, [...(byRegister.get(registerId) || []), entry])
    else if (entry.amount > 0) unassigned.push({ ...entry, createdAt: sale.createdAt || '' })
  }
  const refundByRegister = new Map()
  const unassignedCashRefunds=[]
  for (const refund of refunds) if (saleIds.has(refund.saleId) && refund.method === 'cash') {
    if(refund.registerId)refundByRegister.set(refund.registerId,(refundByRegister.get(refund.registerId)||0)+Number(refund.total||0))
    else unassignedCashRefunds.push({amount:Math.round(Number(refund.total||0)*100)/100,method:'cash',jobId:hotelSales.find(row=>row.sale.id===refund.saleId)?.jobId||'',saleId:refund.id,sourceSaleId:refund.saleId,createdAt:refund.updatedAt||''})
  }
  return {
    unassignedCashPayments: unassigned,
    unassignedCashRefunds,
    sessions: registers.map(register => {
      const payments = byRegister.get(register.id) || [], cashPayments = Math.round(payments.reduce((sum, payment) => sum + payment.amount, 0) * 100) / 100
      const cashRefunds = Math.round((refundByRegister.get(register.id) || 0) * 100) / 100
      return { id: register.id, staffId: register.staffId, staffName: register.staffName || '', tillId: register.tillId || '', openedAt: register.openedAt, closedAt: register.closedAt || '', cashPayments, cashRefunds, netHotelCash: Math.round((cashPayments - cashRefunds) * 100) / 100, hotelPaymentCount: payments.length, expectedCash: register.expectedCash, countedCash: register.countedCash, difference: register.difference, cashSales: register.cashSales, cashReturns: register.cashReturns, otherCashSales: register.closedAt ? Math.round((Number(register.cashSales || 0) - cashPayments) * 100) / 100 : null }
    }).filter(session => session.hotelPaymentCount || session.cashRefunds)
  }
}
export function hotelInvoiceJournalEntries(jobs, hospitalityRecords = [], refunds = [], businessExpenses = [], throughDate = '9999-12-31') {
  const result = []
  const records = new Map(hospitalityRecords.map(record => [record.id,record]))
  const refundsBySale = new Map()
  for (const refund of refunds) refundsBySale.set(refund.saleId,[...(refundsBySale.get(refund.saleId)||[]),refund])
  for (const job of jobs) {
    if (!job.hospitality || !['hotel-stay','nightclub-entry'].includes(job.hospitality.recordKind) || job.status === 'estimate') continue
    const total = Math.round(Number(job.pricing?.total || 0) * 100) / 100
    const tax = Math.min(total, Math.round(Number(job.pricing?.tax || 0) * 100) / 100)
    if (total <= 0) continue
    const revenueCode = job.hospitality.recordKind === 'hotel-stay' ? '4000' : '4100'
    const date = String(job.createdAt || job.updatedAt || '').slice(0,10)
    const issuedLines=[{accountCode:'1100',debit:total,credit:0},{accountCode:'2200',debit:0,credit:Math.round((total-tax)*100)/100},...(tax? [{accountCode:'2000',debit:0,credit:tax}]:[])]
    if (isoDate(date) && date <= throughDate) result.push({ id:`system:${job.id}:invoice`,kind:'hotel-system-entry',date,memo:`Invoice issued · ${job.title}`.slice(0,240),sourceId:job.id,lines:issuedLines })
    const stockCost=Math.round((job.hospitality.stockItems||[]).flatMap(item=>item.allocations||[]).reduce((sum,part)=>sum+Number(part.quantity||0)*Number(part.unitCost||0),0)*100)/100
    if(stockCost>0&&isoDate(date)&&date<=throughDate)result.push({id:`system:${job.id}:stock-cost`,kind:'hotel-system-entry',date,memo:`Guest folio stock cost · ${job.title}`.slice(0,240),sourceId:job.id,lines:[{accountCode:'5000',debit:stockCost,credit:0},{accountCode:'1200',debit:0,credit:stockCost}]})
    for (const payment of job.payments || []) {
      const sale = payment.sale, amount = Math.round(Number(sale?.total || 0) * 100) / 100, paidDate = String(sale?.createdAt || '').slice(0,10)
      if (amount <= 0 || !isoDate(paidDate) || paidDate > throughDate) continue
      const settlementAccount = sale.paymentMethod === 'wallet' ? '2100' : '1000'
      result.push({id:`system:${job.id}:${sale.id}`,kind:'hotel-system-entry',date:paidDate,memo:`Invoice payment · ${job.title}`.slice(0,240),sourceId:job.id,lines:[{accountCode:settlementAccount,debit:amount,credit:0},{accountCode:'1100',debit:0,credit:amount}]})
      for(const refund of refundsBySale.get(sale.id)||[]) {
        const refundDate=String(refund.updatedAt||'').slice(0,10),refundAmount=Math.round(Number(refund.total||0)*100)/100
        if(refundAmount>0&&isoDate(refundDate)&&refundDate<=throughDate)result.push({id:`system:${job.id}:${refund.id}`,kind:'hotel-system-entry',date:refundDate,memo:`Payment refund · ${job.title}`.slice(0,240),sourceId:job.id,lines:[{accountCode:'1100',debit:refundAmount,credit:0},{accountCode:refund.method==='wallet'?'2100':'1000',debit:0,credit:refundAmount}]})
      }
    }
    if(job.status==='cancelled') {
      const cancelledDate=String(job.cancelledAt||job.updatedAt||'').slice(0,10)
      if(isoDate(cancelledDate)&&cancelledDate<=throughDate)result.push({id:`system:${job.id}:cancel`,kind:'hotel-system-entry',date:cancelledDate,memo:`Invoice cancelled · ${job.title}`.slice(0,240),sourceId:job.id,lines:[{accountCode:'2200',debit:Math.round((total-tax)*100)/100,credit:0},...(tax?[{accountCode:'2000',debit:tax,credit:0}]:[]),{accountCode:'1100',debit:0,credit:total}]})
      continue
    }
    const source=records.get(job.hospitality.recordId),subtotal=Math.round((total-tax)*100)/100
    if(job.hospitality.recordKind==='hotel-stay'&&job.hospitality.chargeType==='extra'){
      if(isoDate(date)&&date<=throughDate)result.push({id:`system:${job.id}:recognition`,kind:'hotel-system-entry',date,memo:`Folio revenue recognized · ${job.title}`.slice(0,240),sourceId:job.id,lines:[{accountCode:'2200',debit:subtotal,credit:0},{accountCode:revenueCode,debit:0,credit:subtotal}]})
    } else if(job.hospitality.recordKind==='hotel-stay'&&['checked-in','checked-out'].includes(source?.status)){
      const legacyNights=source.nightlyRates?[]:Array.from({length:Math.max(0,(Date.parse(`${source.checkOut}T00:00:00Z`)-Date.parse(`${source.checkIn}T00:00:00Z`))/86400000)},(_,index)=>({date:new Date(Date.parse(`${source.checkIn}T00:00:00Z`)+index*86400000).toISOString().slice(0,10),nightlyRate:Number(source.nightlyRate||0)})),nights=source.nightlyRates||legacyNights,weight=nights.reduce((sum,row)=>sum+Number(row.nightlyRate||0),0),closedDates=new Set(hospitalityRecords.filter(row=>row.kind==='hotel-day-close'&&row.businessDate<=throughDate).map(row=>row.businessDate))
      if(nights.length&&weight>0){let allocated=0;for(const [index,night] of nights.entries()){const amount=index===nights.length-1?Math.round((subtotal-allocated)*100)/100:Math.round(subtotal*Number(night.nightlyRate)/weight*100)/100;allocated+=amount;if(amount>0&&closedDates.has(night.date))result.push({id:`system:${job.id}:room-night:${night.date}`,kind:'hotel-system-entry',date:night.date,memo:`Room revenue · ${job.title}`.slice(0,240),sourceId:job.id,lines:[{accountCode:'2200',debit:amount,credit:0},{accountCode:revenueCode,debit:0,credit:amount}]})}}
    } else if(job.hospitality.recordKind==='nightclub-entry'&&source?.status==='checked-in'){
      const recognizedDate=String(source.updatedAt||'').slice(0,10);if(isoDate(recognizedDate)&&recognizedDate<=throughDate)result.push({id:`system:${job.id}:recognition`,kind:'hotel-system-entry',date:recognizedDate,memo:`Event revenue recognized · ${job.title}`.slice(0,240),sourceId:job.id,lines:[{accountCode:'2200',debit:subtotal,credit:0},{accountCode:revenueCode,debit:0,credit:subtotal}]})
    }
  }
  for(const expense of businessExpenses){const amount=Math.round(Number(expense.amount||0)*100)/100,date=String(expense.incurredAt||'').slice(0,10),category=String(expense.category||'').toLowerCase(),accountCode=/payroll|salary|wage|staff/.test(category)?'5400':/repair|maintenance/.test(category)?'5200':/housekeep|laundry|linen/.test(category)?'5100':/utilit|electric|water|gas/.test(category)?'5300':'5000';if(amount>0&&isoDate(date)&&date<=throughDate)result.push({id:`system:expense:${expense.id}`,kind:'hotel-system-entry',date,memo:`Expense · ${expense.description||expense.category}`.slice(0,240),sourceId:expense.id,lines:[{accountCode,debit:amount,credit:0},{accountCode:'1000',debit:0,credit:amount}]})}
  for(const room of hospitalityRecords.filter(record=>record.kind==='hotel-room'))for(const work of room.maintenanceOrders||[]){const amount=Math.round(Number(work.cost||0)*100)/100,date=String(work.updatedAt||'').slice(0,10);if(amount>0&&work.status==='completed'&&isoDate(date)&&date<=throughDate)result.push({id:`system:${work.id}:repair`,kind:'hotel-system-entry',date,memo:`Room repair · ${room.roomName} · ${work.title}`.slice(0,240),sourceId:work.id,lines:[{accountCode:'5200',debit:amount,credit:0},{accountCode:'2300',debit:0,credit:amount}]})}
  return result
}
