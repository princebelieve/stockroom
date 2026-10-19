import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHotelNightAudit, hotelCashierAudit, hotelCashierReconciliation } from '../server/hotel-accounting.mjs'

const date = '2026-10-17'
const stayJob = (id, sale) => ({ id: `service-job:${id}`, hospitality: { recordKind: 'hotel-stay' }, payments: [{ sale: { id, paymentMethod: 'cash', total: 100, createdAt: `${date}T12:00:00.000Z`, ...sale } }] })

test('night audit blocks an open register containing hotel payments', () => {
  const reconciliation = hotelCashierReconciliation([{ id: 'register:1', staffName: 'Cashier', openedAt: `${date}T08:00:00.000Z` }], [stayJob('sale:1', { paymentDetails: { pos: { registerId: 'register:1' } } })])
  const review = hotelCashierAudit(reconciliation, [], date, 'UTC', {}, true)
  const audit = buildHotelNightAudit(date, [], [], [], [], '', review)
  assert.equal(review.openSessions.length, 1)
  assert.equal(audit.readyToClose, false)
  assert.match(audit.blockers.join(' '), /must be closed before night audit/)
})

test('night audit requires cashier sign-off and an explanation for drawer variance', () => {
  const register = { id: 'register:1', staffName: 'Cashier', tillId: 'till:1', openedAt: `${date}T08:00:00.000Z`, closedAt: `${date}T22:00:00.000Z`, expectedCash: 120, countedCash: 115, difference: -5, cashSales: 120 }
  const reconciliation = hotelCashierReconciliation([register], [stayJob('sale:1', { paymentDetails: { pos: { registerId: register.id } } })])
  const pending = hotelCashierAudit(reconciliation, [], date, 'UTC', {}, true)
  assert.equal(pending.blockers.some(reason => /need cashier sign-off/.test(reason)), true)
  const reviewedWithoutNote = hotelCashierAudit(reconciliation, [], date, 'UTC', { sessionIds: [register.id] }, true)
  assert.equal(reviewedWithoutNote.blockers.some(reason => /need an explanation/.test(reason)), true)
  const reviewed = hotelCashierAudit(reconciliation, [], date, 'UTC', { sessionIds: [register.id], sessionNotes: { [register.id]: 'Counted cash was short by five.' } }, true)
  assert.deepEqual(reviewed.blockers, [])
  assert.equal(reviewed.snapshot.sessions[0].reviewNote, 'Counted cash was short by five.')
  assert.equal(buildHotelNightAudit(date, [], [], [], [], '', reviewed).readyToClose, true)
})

test('cashier review is required for cash payments made outside a register', () => {
  const reconciliation = hotelCashierReconciliation([], [stayJob('sale:offline', { paymentDetails: {} })])
  const pending = hotelCashierAudit(reconciliation, [], date, 'UTC', {}, true)
  assert.equal(pending.pendingReceipts.length, 1)
  assert.equal(pending.blockers.some(reason => /need review/.test(reason)), true)
  const reviewed = hotelCashierAudit(reconciliation, [], date, 'UTC', { receiptIds: ['sale:offline'], receiptNotes: { 'sale:offline': 'Cash was received at the front desk.' } }, true)
  assert.deepEqual(reviewed.blockers, [])
  assert.equal(reviewed.snapshot.unassignedCashTransactions[0].direction, 'receipt')
})

test('staff without register permission cannot close over unreviewed hotel cash', () => {
  const register = { id: 'register:1', staffName: 'Cashier', openedAt: `${date}T08:00:00.000Z`, closedAt: `${date}T22:00:00.000Z` }
  const reconciliation = hotelCashierReconciliation([register], [stayJob('sale:1', { paymentDetails: { pos: { registerId: register.id } } })])
  const review = hotelCashierAudit(reconciliation, [], date, 'UTC', {}, false)
  const audit = buildHotelNightAudit(date, [], [], [], [], '', review)
  assert.equal(review.canReview, false)
  assert.equal(audit.readyToClose, false)
  assert.match(audit.blockers.join(' '), /Register permission is required/)
})
