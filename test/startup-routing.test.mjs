import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveStartupState } from '../src/lib/startupState.mjs'

test('owner-configured device without cloud enrollment still routes to login instead of installer', () => {
  const state = resolveStartupState({ ownerConfigured: true, cloudConfigured: false, existingBusiness: false })
  assert.equal(state.installerRequired, false)
  assert.equal(state.setupRequired, false)
  assert.equal(state.hasExistingDevice, true)
})

test('new device without owner still requires installer/setup', () => {
  const state = resolveStartupState({ ownerConfigured: false, cloudConfigured: false, existingBusiness: false })
  assert.equal(state.installerRequired, true)
  assert.equal(state.setupRequired, true)
})

test('cloud-enrolled device routes to login even when owner state is stale', () => {
  const state = resolveStartupState({ ownerConfigured: false, cloudConfigured: true, existingBusiness: false })
  assert.equal(state.installerRequired, false)
  assert.equal(state.setupRequired, false)
  assert.equal(state.hasExistingDevice, true)
})
