export function customerOrderSettings(value = {}) {
  const text = (key, max) => String(value?.[key] || '').trim().slice(0, max)
  const fee = Number(value?.deliveryFee || 0)
  const ids = new Set()
  const deliveryZones = (Array.isArray(value?.deliveryZones) ? value.deliveryZones : []).slice(0, 50).flatMap(zone => {
    const id = String(zone?.id || '').trim(), name = String(zone?.name || '').trim(), fee = Number(zone?.fee)
    if (!id || id.length > 100 || ids.has(id) || !name || name.length > 100 || !Number.isFinite(fee) || fee < 0 || fee > 1000000) return []
    ids.add(id)
    return [{ id, name, fee: Math.round(fee * 100) / 100 }]
  })
  return { retailEnabled: value?.retailEnabled === true, retailProductIds: [...new Set((Array.isArray(value?.retailProductIds) ? value.retailProductIds : []).filter(id=>typeof id==='string' && id.length<=100))].slice(0,2000), bankName: text('bankName', 100), accountName: text('accountName', 120), accountNumber: text('accountNumber', 40), transferInstructions: text('transferInstructions', 300), deliveryEnabled: value?.deliveryEnabled === true, deliveryFee: Number.isFinite(fee) && fee >= 0 && fee <= 1000000 ? Math.round(fee * 100) / 100 : 0, deliveryZones }
}
export function customerHandoff(settings, input, restaurant = false) {
  const config = customerOrderSettings(settings)
  if (input.paymentMethod === 'bank-transfer' && !(config.bankName && config.accountName && config.accountNumber)) throw new Error('Bank transfer is not configured. Choose payment at pickup.')
  if (input.diningOption !== 'Delivery') return restaurant ? {} : { diningOption: ['Takeaway', 'Dine in'].includes(input.diningOption) ? input.diningOption : 'Takeaway' }
  if (restaurant || !config.deliveryEnabled) throw new Error('Delivery is not available for this menu.')
  const phone = String(input.delivery?.phone || '').trim(), address = String(input.delivery?.address || '').trim()
  if (phone.length < 6 || phone.length > 40 || address.length < 8 || address.length > 300) throw new Error('Enter a delivery phone number and complete address.')
  const zone = config.deliveryZones.find(zone => zone.id === input.delivery?.zoneId)
  if (config.deliveryZones.length && !zone) throw new Error('Choose a delivery area served by this business.')
  return { diningOption: 'Delivery', delivery: { phone, address, fee: zone?.fee ?? config.deliveryFee, ...(zone ? { zoneId: zone.id, zoneName: zone.name } : {}) } }
}
