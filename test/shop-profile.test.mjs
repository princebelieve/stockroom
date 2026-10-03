import test from 'node:test'
import assert from 'node:assert/strict'
import { businessModes, businessWorkspace, normalizeShopProfile, validateShopProfile } from '../server/shop-profile.mjs'
import { validateCustomValues, readCustomValues } from '../server/shop-fields.mjs'

test('supermarket workspace defaults and owner feature overrides survive normalization', () => {
  const profile = normalizeShopProfile({ mode: 'suggested', industry: 'supermarket' })
  assert.equal(businessWorkspace(profile).checkoutLabel, 'Checkout')
  assert.equal(businessWorkspace(profile).services, false)
  const enabled = validateShopProfile({ ...profile, features: { services: true } })
  assert.equal(businessWorkspace(JSON.stringify(enabled)).services, true)
  assert.equal(businessWorkspace({ mode: 'suggested', industry: 'services' }).services, true)
})

test('general setup and every suggestion have valid defaults', () => {
  assert.equal(normalizeShopProfile().inventoryLabel, 'Inventory')
  assert.equal(normalizeShopProfile({ mode: 'suggested', industry: '__proto__' }).industry, 'general')
  for (const industry of Object.keys(businessModes)) {
    const profile = validateShopProfile({ mode: 'suggested', industry })
    assert.ok(profile.itemLabel && profile.inventoryLabel && profile.unit)
    assert.ok(Array.isArray(profile.categories))
  }
  assert.equal(normalizeShopProfile({ mode: 'suggested', industry: 'printing' }).unit, 'copy')
  assert.equal(normalizeShopProfile({ mode: 'suggested', industry: 'food-service' }).itemLabel, 'Menu item')
})

test('editable fields retain identities, protect accounting fields and validate custom types', () => {
  const profile = normalizeShopProfile({ mode: 'suggested', industry: 'printing' })
  const field = profile.fields.find(field => field.id === 'custom_printing_finish')
  Object.assign(field, { label: 'Finishing', type: 'select', options: ['Gloss', 'Matte'], required: true })
  assert.equal(validateShopProfile(profile).fields.find(item => item.id === field.id).label, 'Finishing')
  assert.throws(() => validateCustomValues({}, profile), /Finishing/)
  assert.throws(() => validateCustomValues({ [field.id]: 'unknown' }, profile), /Choose/)
  assert.equal(validateCustomValues({ [field.id]: 'Gloss' }, profile)[field.id], 'Gloss')
  field.visible = false
  assert.equal(validateCustomValues({ [field.id]: 'Old finish' }, profile)[field.id], 'Old finish')
  profile.fields.find(field => field.id === 'price').visible = false
  assert.throws(() => validateShopProfile(profile), /stock and sales/)
  assert.throws(() => readCustomValues(JSON.parse('{"__proto__":"bad"}')))
  assert.throws(() => readCustomValues({ custom_long: 'a'.repeat(2001) }))
  const dateProfile = normalizeShopProfile({ mode: 'suggested', industry: 'pharmacy' })
  assert.throws(() => validateCustomValues({ custom_pharmacy_expiry: '2027-02-30' }, dateProfile), /valid date/)
})
test('custom setup preserves user labels, deduplicates categories and rejects invalid fields', () => {
  const profile = validateShopProfile({ mode: 'custom', industry: 'printing', itemLabel: ' Print service ', inventoryLabel: 'Our catalogue', unit: 'sheet', categories: ['Paper', 'Paper', ' Cards '] })
  assert.equal(profile.itemLabel, 'Print service')
  assert.deepEqual(profile.categories, ['Paper', 'Cards'])
  assert.deepEqual(normalizeShopProfile(JSON.stringify(profile)), profile)
  assert.throws(() => validateShopProfile({ ...profile, itemLabel: '' }))
  assert.throws(() => validateShopProfile({ ...profile, categories: ['x'.repeat(81)] }))
  assert.throws(() => validateShopProfile({ mode: 'unknown', industry: 'general' }))
  assert.equal(normalizeShopProfile({ ...profile, mode: 'general' }).unit, 'item')
})
