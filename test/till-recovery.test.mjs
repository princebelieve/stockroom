import test from 'node:test'
import assert from 'node:assert/strict'
import { createTillRecovery } from '../cloud/till-recovery.mjs'
import { registerCheckoutTill } from '../server/till-binding.mjs'

function matches(row, query) {
  return Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some(part => matches(row, part))
    const actual = key.split('.').reduce((object, field) => object?.[field], row)
    if (value && typeof value === 'object') return Object.entries(value).every(([operator, wanted]) => operator === '$in' ? wanted.includes(actual) : operator === '$exists' ? (actual !== undefined) === wanted : false)
    return actual === value
  })
}
function fixture() {
  const stores = new Map(), failures = new Map()
  const collection = name => {
    if (!stores.has(name)) stores.set(name, [])
    const rows = stores.get(name)
    return { rows, findOne: async query => structuredClone(rows.find(row => matches(row, query)) || null), find: query => ({ toArray: async () => structuredClone(rows.filter(row => matches(row, query))) }),
      insertOne: async row => { rows.push(structuredClone(row)) },
      updateOne: async (query, update, options = {}) => {
        if (failures.get(name)?.(query, update)) { failures.delete(name); throw new Error('connection interrupted') }
        let row = rows.find(row => matches(row, query))
        if (!row && options.upsert) { row = { ...query, ...structuredClone(update.$setOnInsert || {}) }; rows.push(row) }
        if (!row) return { matchedCount: 0, modifiedCount: 0 }
        Object.assign(row, structuredClone(update.$set || {})); for (const field of Object.keys(update.$unset || {})) delete row[field]; return { matchedCount: 1, modifiedCount: 1 }
      } }
  }
  const devices = collection('devices'), heads = collection('heads'), operations = collection('operations')
  devices.rows.push({ businessId: 'shop', deviceId: 'old-device', label: 'Lost till' }, { businessId: 'shop', deviceId: 'new-device' }, { businessId: 'shop', deviceId: 'other-replacement' })
  collection('checkout_tills').rows.push({ businessId: 'shop', tillId: 'old-till', deviceId: 'old-device' }, { businessId: 'shop', tillId: 'new-till', deviceId: 'new-device' }, { businessId: 'shop', tillId: 'other-till', deviceId: 'other-replacement' })
  heads.rows.push({ businessId: 'shop', entityType: 'pos_record', payload: { id: 'order', tillId: 'old-till', kind: 'counter-order', status: 'preparing', total: 20 } })
  operations.rows.push({ businessId: 'shop', entityType: 'sale', payload: { id: 'receipt', total: 20 } })
  let chain = Promise.resolve(), claims = { kind: 'access', role: 'owner', businessId: 'shop', sub: 'owner' }
  const serialize = (_, task) => { const next = chain.catch(() => {}).then(task); chain = next; return next }
  const api = createTillRecovery({ database: { collection }, devices, entityHeads: heads, operations, serialize, verifyToken: () => claims, ownerIsActive: async () => true, ownerPasswordIsValid: async (_, password) => password === 'owner-password', readJson: async request => request.input, send: (response, status, data) => Object.assign(response, { status, data }) })
  const input = { sourceDeviceId: 'old-device', targetDeviceId: 'new-device', tillId: 'old-till', currentTillId: 'new-till', requestId: 'request-one', confirmation: 'RECOVER', sourceStopped: true, activityReviewed: true }
  return { api, input, collection, heads, operations, devices, failures, claims: value => { claims = value } }
}

test('recovery retires the original device and preserves all financial and operational records', async () => {
  const f = fixture(), records = JSON.stringify([f.heads.rows, f.operations.rows])
  assert.equal((await f.api.recover('shop', 'owner', f.input)).tillId, 'old-till')
  assert.ok(f.devices.rows[0].recoveryRetiredAt)
  assert.equal(f.collection('checkout_tills').rows[0].deviceId, 'new-device')
  assert.equal(JSON.stringify([f.heads.rows, f.operations.rows]), records)
  await f.api.recover('shop', 'owner', f.input)
  assert.equal(f.collection('till_recoveries').rows.length, 1)
})
test('recovery refuses active replacement work and missing reconciliation confirmations', async () => {
  const f = fixture()
  await assert.rejects(f.api.recover('shop', 'owner', { ...f.input, activityReviewed: false }), /reconciled/)
  f.heads.rows.push({ businessId: 'shop', entityType: 'pos_record', payload: { kind: 'restaurant-tab', status: 'open', tillId: 'new-till' } })
  await assert.rejects(f.api.recover('shop', 'owner', f.input), /active work/)
  assert.equal(f.devices.rows[0].revokedAt, undefined)
})
test('competing replacement devices cannot both claim a lost till', async () => {
  const f = fixture()
  const results = await Promise.allSettled([f.api.recover('shop', 'owner', f.input), f.api.recover('shop', 'owner', { ...f.input, targetDeviceId: 'other-replacement', currentTillId: 'other-till', requestId: 'request-two' })])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(f.collection('checkout_tills').rows[0].deviceId, 'new-device')
})
test('retry resumes a crash after retirement and before identity transfer', async () => {
  const f = fixture()
  f.failures.set('checkout_tills', (_, update) => update.$set?.deviceId === 'new-device')
  await assert.rejects(f.api.recover('shop', 'owner', f.input), /interrupted/)
  assert.ok(f.devices.rows[0].recoveryRetiredAt)
  assert.equal(f.collection('checkout_tills').rows[0].deviceId, 'old-device')
  assert.equal(f.collection('till_recoveries').rows[0].status, 'pending')
  await f.api.recover('shop', 'owner', f.input)
  assert.equal(f.collection('till_recoveries').rows[0].status, 'completed')
})
test('retired devices cannot reclaim a till even if their ordinary revocation is cleared', async () => {
  const f = fixture(); await f.api.recover('shop', 'owner', f.input)
  f.devices.rows[0].revokedAt = null
  await assert.rejects(f.api.bind('shop', 'old-device', 'old-till'), /revoked/)
  await f.api.bind('shop', 'new-device', 'old-till')
  await assert.rejects(f.api.bind('shop', 'other-replacement', 'old-till'), /another device/)
})
test('a later loss can recover the same identity again without an old request reclaiming it', async () => {
  const f = fixture(); await f.api.recover('shop', 'owner', f.input)
  await f.api.recover('shop', 'owner', { ...f.input, sourceDeviceId: 'new-device', targetDeviceId: 'other-replacement', currentTillId: 'other-till', requestId: 'request-next-loss' })
  assert.equal(f.collection('checkout_tills').rows[0].deviceId, 'other-replacement')
  await assert.rejects(f.api.recover('shop', 'owner', f.input), /actively enrolled|ownership changed/)
})
test('owner role and password are enforced at the cloud route', async () => {
  const f = fixture(), response = {}
  f.claims({ kind: 'access', role: 'cashier', businessId: 'shop' })
  await f.api.handle({ method: 'POST', url: '/v1/till-recovery/recover', input: f.input }, response)
  assert.equal(response.status, 403)
  f.claims({ kind: 'access', role: 'owner', businessId: 'shop', sub: 'owner' })
  await f.api.handle({ method: 'POST', url: '/v1/till-recovery/recover', input: { ...f.input, ownerPassword: 'wrong' } }, response)
  assert.equal(response.status, 401)
  await f.api.handle({ method: 'POST', url: '/v1/till-recovery/recover', input: { ...f.input, ownerPassword: 'owner-password' } }, response)
  assert.equal(response.status, 200)
})
test('recovery cannot cross businesses or reuse a request ID for different devices', async () => {
  const f = fixture()
  await assert.rejects(f.api.recover('different-business', 'owner', f.input), /actively enrolled/)
  await f.api.recover('shop', 'owner', f.input)
  await assert.rejects(f.api.recover('shop', 'owner', { ...f.input, targetDeviceId: 'other-replacement' }), /different details/)
})
test('legacy ownership is inferred only from unambiguous original creation events', async () => {
  const f = fixture()
  const event = { businessId: 'shop', entityType: 'pos_record', deviceId: 'old-device', payload: { kind: 'counter-order', tillId: 'legacy-till', expectedUpdatedAt: '' } }
  f.operations.rows.push(event, { ...event, deviceId: 'new-device', payload: { ...event.payload, expectedUpdatedAt: 'later-revision' } })
  f.operations.rows.push({ ...event, payload: { ...event.payload, tillId: 'ambiguous-till' } }, { ...event, deviceId: 'new-device', payload: { ...event.payload, tillId: 'ambiguous-till' } })
  const discovered = await f.api.discover('shop')
  assert.equal(discovered.find(till => till.tillId === 'legacy-till').deviceId, 'old-device')
  assert.equal(discovered.some(till => till.tillId === 'ambiguous-till'), false)
})
test('ordinary sync tolerates an older server, while checkout registration reports authorization failures', async () => {
  const config = { url: 'https://example.test', token: 'device-token' }
  assert.equal(await registerCheckoutTill(config, 'till', async () => ({ status: 404 })), undefined)
  await assert.rejects(registerCheckoutTill(config, 'till', async () => ({ status: 401, ok: false, json: async () => ({ error: 'Device revoked' }) })), /revoked/)
})
