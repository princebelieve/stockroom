import test from 'node:test'
import assert from 'node:assert/strict'
import { productExportEligibility } from '../server/product-export-policy.mjs'

test('catalogue export requires current entitlement and the configured fee', () => {
  const active = { blocked: false, status: 'active' }
  assert.equal(productExportEligibility(active, null).canExport, true)
  assert.equal(productExportEligibility(active, null, { productExportFeeAmount: 1000 }).canExport, false)
  assert.equal(productExportEligibility(active, { reference: 'paid', amount: 1000, paidAt: new Date() }, { productExportFeeAmount: 2000 }).canExport, true)
  for (const status of ['grace', 'expired', 'unpaid', 'trial-expired', 'unknown', 'suspended']) {
    assert.equal(productExportEligibility({ blocked: status !== 'grace', status }, { paidAt: new Date() }).canExport, false, status)
  }
  for (const status of ['trial', 'test']) assert.equal(productExportEligibility({ blocked: false, status }, null).canExport, true)
  assert.equal(productExportEligibility(active, { closedAt: new Date() }).canExport, false)
})

test('started export retains its quoted fee when developer settings change', () => {
  const active = { blocked: false, status: 'active' }
  assert.equal(productExportEligibility(active, { reference: 'pending', amount: 1000 }, { productExportFeeAmount: 0 }).canExport, false)
  assert.equal(productExportEligibility(active, { exportedAt: new Date(), amount: 0 }, { productExportFeeAmount: 1000 }).canExport, true)
})
