import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveStartupState } from '../src/lib/startupState.mjs'

test('enrolled device routes to login even when owner is not configured', () => {
  const result = resolveStartupState({ ownerConfigured: false, cloudConfigured: true, existingBusiness: false })
  assert.equal(result.hasExistingDevice, true)
  assert.equal(result.installerRequired, false)
  assert.equal(result.setupRequired, false)
})

test('fresh unconfigured device still shows installer and setup flow', () => {
  const result = resolveStartupState({ ownerConfigured: false, cloudConfigured: false, existingBusiness: false })
  assert.equal(result.hasExistingDevice, false)
  assert.equal(result.installerRequired, true)
  assert.equal(result.setupRequired, true)
})

test('existing-business flag also routes to login without requiring owner setup', () => {
  const result = resolveStartupState({ ownerConfigured: false, cloudConfigured: false, existingBusiness: true })
  assert.equal(result.hasExistingDevice, true)
  assert.equal(result.installerRequired, false)
  assert.equal(result.setupRequired, false)
})
