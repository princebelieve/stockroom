export function customerOrderSettings(value = {}) {
  const text = (key, max) => String(value?.[key] || '').trim().slice(0, max)
  const fee = Number(value?.deliveryFee || 0)
  return { bankName: text('bankName', 100), accountName: text('accountName', 120), accountNumber: text('accountNumber', 40), transferInstructions: text('transferInstructions', 300), deliveryEnabled: value?.deliveryEnabled === true, deliveryFee: Number.isFinite(fee) && fee >= 0 && fee <= 1000000 ? Math.round(fee * 100) / 100 : 0 }
}
export function customerHandoff(settings, input, restaurant = false) {
  const config = customerOrderSettings(settings)
  if (input.paymentMethod === 'bank-transfer' && !(config.bankName && config.accountName && config.accountNumber)) throw new Error('Bank transfer is not configured. Choose payment at pickup.')
  if (input.diningOption !== 'Delivery') return restaurant ? {} : { diningOption: ['Takeaway', 'Dine in'].includes(input.diningOption) ? input.diningOption : 'Takeaway' }
  if (restaurant || !config.deliveryEnabled) throw new Error('Delivery is not available for this menu.')
  const phone = String(input.delivery?.phone || '').trim(), address = String(input.delivery?.address || '').trim()
  if (phone.length < 6 || phone.length > 40 || address.length < 8 || address.length > 300) throw new Error('Enter a delivery phone number and complete address.')
  return { diningOption: 'Delivery', delivery: { phone, address, fee: config.deliveryFee } }
}
