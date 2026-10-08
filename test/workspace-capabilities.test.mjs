import test from 'node:test'
import assert from 'node:assert/strict'
import { applyBusinessPreset, normalizeShopProfile } from '../server/shop-profile.mjs'
import { workspaceCapabilities, workspaceScreenAvailable } from '../server/workspace-capabilities.mjs'

const preset = key => applyBusinessPreset(normalizeShopProfile(), key)
test('retail stock does not expose food, jobs or church access', () => {
  const profile = preset('retail'), options = workspaceCapabilities(profile)
  for (const key of ['productSales','inventory','purchasing','stocktake']) assert.ok(options[key])
  for (const key of ['counter','restaurant','production','serviceJobs','church','payments','oilSales']) assert.equal(options[key], undefined)
  assert.equal(workspaceScreenAvailable(profile,'RetailOrders'), true)
})
test('ingredient stock is not a retail online-order workspace', () => {
  for (const key of ['takeaway','restaurant','bar']) {
    const profile = preset(key)
    assert.ok(workspaceCapabilities(profile).production)
    assert.equal(workspaceScreenAvailable(profile,'RetailOrders'), false)
    assert.equal(workspaceScreenAvailable(profile,'POS'), false)
  }
})
test('oil orders and service material permissions follow their workspace', () => {
  assert.equal(workspaceScreenAvailable(preset('liquids'),'RetailOrders'), true)
  const printing = workspaceCapabilities(preset('printing'))
  assert.ok(printing.serviceJobs)
  assert.equal(printing.production,'Job materials and costs')
  for (const key of ['church','counter','restaurant','stocktake','productSales']) assert.equal(printing[key],undefined)
  assert.ok(workspaceCapabilities(preset('services')).church)
})
test('combined workspaces retain all enabled operations', () => {
  const profile = normalizeShopProfile({...preset('retail'),workflows:'both',fastFood:true,restaurant:true})
  const options = workspaceCapabilities(profile)
  for (const key of ['productSales','payments','counter','restaurant','production','serviceJobs']) assert.ok(options[key])
  for (const screen of ['POS','Payments','Counter','Restaurant','RetailOrders']) assert.equal(workspaceScreenAvailable(profile,screen),true)
})
