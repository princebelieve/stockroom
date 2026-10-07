import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

function fixture() {
  const values = new Map(), settings = { automaticPreparation: true, kitchen: 'Kitchen queue', bar: 'Bar queue' }
  let tail = Promise.resolve()
  const context = { Error, localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }, printerSettings: () => settings, window: { stockroomDesktop: {} }, navigator: { locks: { request: (_, task) => { const next = tail.catch(() => {}).then(task); tail = next; return next } } } }
  const source = readFileSync('src/lib/preparationPrinting.ts', 'utf8').replace(/^import .*$/gm, '')
  runInNewContext(stripTypeScriptTypes(source).replaceAll('export ', '') + '\nglobalThis.api={routePreparation,retryPreparation,preparationJobs}', context)
  return { ...context.api, settings, context }
}
const order = { id: 'order', updatedAt: 'revision-one', status: 'queued', note: '', lines: [{ id: 'meal', name: 'Meal', station: 'kitchen' }, { id: 'drink', name: 'Drink', station: 'bar' }] }
test('tickets route only their station lines and repeated/concurrent commands do not print twice', async () => {
  const f = fixture(), calls = [], print = async (ticket, station) => calls.push({ ticket, station })
  await Promise.all([f.routePreparation('shop', order, print), f.routePreparation('shop', order, print)])
  assert.equal(calls.length, 2)
  assert.equal(calls[0].station, 'kitchen'); assert.equal(calls[0].ticket.lines[0].name, 'Meal')
  assert.equal(calls[1].station, 'bar'); assert.equal(calls[1].ticket.lines[0].name, 'Drink')
})
test('printer failures persist for explicit retry without reprinting successful station tickets', async () => {
  const f = fixture(), calls = []
  await f.routePreparation('shop', order, async (_, station) => { calls.push(station); if (station === 'bar') throw new Error('Printer offline') })
  const failed = f.preparationJobs('shop').find(job => job.state === 'failed')
  assert.equal(failed.station, 'bar'); assert.match(failed.error, /offline/)
  await f.routePreparation('shop', order, async () => { throw new Error('Must not automatically retry') })
  await f.retryPreparation('shop', failed.id, async (_, station) => calls.push(station))
  assert.deepEqual(calls, ['kitchen', 'bar', 'bar'])
})
test('preparation progress does not create another ticket for the same submission', async () => {
  const f = fixture(), calls = []
  const queued = { ...order, events: [{ action: 'create', at: 'submitted-at' }] }
  await f.routePreparation('shop', queued, async (_, station) => calls.push(station))
  await f.routePreparation('shop', { ...queued, status: 'preparing', updatedAt: 'later-progress' }, async (_, station) => calls.push(station))
  assert.deepEqual(calls, ['kitchen', 'bar'])
})
test('edits notify removed stations and cancellations are labelled clearly', async () => {
  const f = fixture(), calls = []
  await f.routePreparation('shop', { ...order, updatedAt: 'revision-two', changeReason: 'Remove drink', lines: [order.lines[0]] }, async (ticket, station) => calls.push({ ticket, station }), order)
  const bar = calls.find(call => call.station === 'bar')
  assert.match(bar.ticket.note, /CANCEL STATION ITEMS/); assert.equal(bar.ticket.lines[0].name, 'Drink')
  await f.routePreparation('shop', { ...order, status: 'cancelled', updatedAt: 'revision-three' }, async ticket => assert.match(ticket.note, /CANCEL/))
})
test('automatic printing is disabled outside desktop and missing queues stay actionable', async () => {
  const f = fixture(); delete f.context.window.stockroomDesktop
  await f.routePreparation('shop', order, async () => assert.fail('Browser must use manual dialog'))
  assert.equal(f.preparationJobs('shop').length, 0)
  f.context.window.stockroomDesktop = {}; f.settings.bar = ''
  await f.routePreparation('shop', order, async () => {})
  assert.match(f.preparationJobs('shop').find(job => job.station === 'bar').error, /Select an installed bar printer/)
})
