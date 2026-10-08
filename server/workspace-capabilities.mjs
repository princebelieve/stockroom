import { businessWorkspace, normalizeShopProfile } from './shop-profile.mjs'
import { staffCapabilities } from './staff-permissions.mjs'

export function workspaceCapabilities(profile) {
  const p = normalizeShopProfile(profile), w = businessWorkspace(p)
  const available = {
    productSales:w.productSales, oilSales:w.oil, payments:w.payments,
    counter:w.fastFood, restaurant:w.restaurant, inventory:w.stock || w.payments,
    purchasing:w.stock || w.payments, stocktake:w.stock, movements:w.stock,
    serviceJobs:w.payments, production:w.fastFood || w.restaurant || w.payments,
    church:w.payments && p.industry === 'services',
  }
  const labels = { ...staffCapabilities }
  if (!w.stock && w.payments) {
    labels.inventory = 'Material stock and changes'
    labels.purchasing = 'Material purchasing and suppliers'
  }
  if (!w.fastFood && !w.restaurant && w.payments) labels.production = 'Job materials and costs'
  return Object.fromEntries(Object.entries(labels).filter(([key]) => available[key] !== false))
}

export function workspaceScreenAvailable(profile, screen) {
  const w = businessWorkspace(profile)
  const available = { POS:w.productSales, Oil:w.oil, Payments:w.payments,
    Counter:w.fastFood, Restaurant:w.restaurant, RetailOrders:w.productSales || w.oil,
    Inventory:w.stock, Stocktake:w.stock, Movements:w.stock, Display:w.productSales || w.oil }
  return available[screen] !== false
}
