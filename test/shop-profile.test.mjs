import test from 'node:test'
import assert from 'node:assert/strict'
import { businessModes, businessPresets, applyBusinessPreset, businessWorkspace, normalizeShopProfile, validateShopProfile } from '../server/shop-profile.mjs'
import { validateCustomValues, readCustomValues } from '../server/shop-fields.mjs'

test('every selling choice supplies its required stock tools without enabling another checkout', () => {
  for (const workflows of ['payments', 'stock', 'both', 'fast-food', 'restaurant']) {
    const workspace = businessWorkspace({ workflows })
    assert.equal(workspace.stock, workflows !== 'payments', workflows)
    assert.equal(workspace.productSales, ['stock', 'both'].includes(workflows), workflows)
    assert.equal(workspace.payments, ['payments', 'both'].includes(workflows), workflows)
    assert.equal(workspace.fastFood, workflows === 'fast-food', workflows)
    assert.equal(workspace.restaurant, workflows === 'restaurant', workflows)
  }
  for (const option of ['fastFood', 'restaurant']) {
    const workspace = businessWorkspace({ workflows: 'payments', [option]: true })
    assert.equal(workspace.stock, true)
    assert.equal(workspace.productSales, false)
    assert.equal(workspace.payments, true)
  }
  for (const industry of Object.keys(businessModes)) {
    for (const workflows of ['payments', 'stock', 'both', 'fast-food', 'restaurant']) {
      const workspace = businessWorkspace({ mode: 'suggested', industry, workflows })
      assert.equal(workspace.stock, industry === 'liquids' || workflows !== 'payments')
    }
  }
})

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

test('workspace-specific product templates provide source lookup fields and add them to existing profiles', () => {
  const oldPharmacy = normalizeShopProfile({ mode: 'suggested', industry: 'pharmacy', fields: normalizeShopProfile({ mode: 'suggested', industry: 'pharmacy' }).fields.filter(field => !field.lookupKey) })
  assert.ok(oldPharmacy.fields.some(field => field.lookupKey === 'activeIngredients'))
  assert.ok(oldPharmacy.fields.some(field => field.id === 'custom_pharmacy_expiry'))
  const electronics = normalizeShopProfile({ mode: 'suggested', industry: 'electronics' })
  assert.ok(electronics.fields.some(field => field.lookupKey === 'model'))
  const groceries = normalizeShopProfile({ mode: 'suggested', industry: 'grocery' })
  assert.ok(groceries.fields.some(field => field.lookupKey === 'allergens'))
  assert.ok(groceries.fields.some(field => field.lookupKey === 'imageUrl'))
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

test('explicit business presets activate only their operational workspace and preserve custom configuration', () => {
  const current = normalizeShopProfile({ mode: 'custom', industry: 'printing', itemLabel: 'Our item', inventoryLabel: 'Our list', unit: 'sheet', categories: ['Special'], restaurant: true, fastFood: true })
  for (const [key, preset] of Object.entries(businessPresets)) {
    const result = applyBusinessPreset(current, key)
    const workspace = businessWorkspace(result)
    assert.equal(result.workflows, preset.workflow)
    assert.equal(workspace.stock, ['POS', 'Oil', 'Counter', 'Restaurant'].includes(preset.screen))
    assert.equal(workspace.oil, preset.screen === 'Oil')
    assert.equal(workspace.productSales, preset.screen === 'POS')
    assert.equal(workspace.payments, preset.screen === 'Payments')
    assert.equal(workspace.fastFood, preset.screen === 'Counter')
    assert.equal(workspace.restaurant, preset.screen === 'Restaurant')
    assert.deepEqual(result.fields.slice(0, current.fields.length), current.fields)
    assert.ok(result.fields.some(field => field.lookupKey), preset.industry)
    assert.deepEqual(result.categories, current.categories)
    assert.equal(result.unit, 'sheet')
    assert.equal(result.itemLabel, 'Our item')
  }
  assert.equal(current.restaurant, true)
  assert.throws(() => applyBusinessPreset(current, '__proto__'), /Choose/)
})


test('reporting timezone survives normalization, presets and serialized settings', () => {
  const profile = validateShopProfile({ ...normalizeShopProfile(), reportingTimeZone: 'Africa/Lagos' })
  assert.equal(normalizeShopProfile(JSON.stringify(profile)).reportingTimeZone, 'Africa/Lagos')
  assert.equal(applyBusinessPreset(profile, 'restaurant').reportingTimeZone, 'Africa/Lagos')
  assert.equal(normalizeShopProfile().reportingTimeZone, 'UTC')
  assert.throws(() => validateShopProfile({ ...profile, reportingTimeZone: 'invalid/zone' }), /valid reporting timezone/)
})
