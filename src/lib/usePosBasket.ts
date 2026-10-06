import { checkoutTillId } from './checkoutTill'
import { useEffect, useState } from 'react'
import type { Product } from '../types'
import { emptyPosData, posRequest, type PosData } from '../PosTools'
import { priceOrder } from '../../server/pos-pricing.mjs'

export function usePosBasket({ user, branchId, headers, cart, setCart, orderId, setOrderId, products, workspaceId = 'products' }: {
  user: { id: string; organizationId: string; role: string } | null; branchId: string; headers: Record<string, string>; cart: Record<string, number>; setCart: (cart: Record<string, number>) => void; orderId: string; setOrderId: (id: string) => void; products: Product[]; workspaceId?: 'products' | 'oil'
}) {
  const [data, setData] = useState<PosData>(emptyPosData)
  const [error, setError] = useState('')
  const [lines, setLines] = useState<Product[]>([])
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  const [discountType, setDiscountType] = useState('amount')
  const [discountValue, setDiscountValue] = useState('0')
  const [customerId, setCustomerId] = useState('')
  const [loyaltyRedeemed, setLoyaltyRedeemed] = useState('0')
  const [note, setNote] = useState('')
  const [ready, setReady] = useState('')
  const baseKey = user ? `stockroom-pos-draft:${user.organizationId}:${user.id}:${branchId}` : ''
  const key = baseKey ? `${baseKey}${workspaceId === 'oil' ? ':oil' : ''}` : ''
  const snapshot = { cart, orderId, lines, overrides, discountType, discountValue, customerId, note, loyaltyRedeemed }
  function restore(draft: any) {
    setCart(draft.cart || {}); setOrderId(draft.orderId || crypto.randomUUID()); setLines(draft.lines || []); setOverrides(draft.overrides || {}); setDiscountType(draft.discountType || 'amount'); setDiscountValue(draft.discountValue || '0'); setCustomerId(draft.customerId || ''); setNote(draft.note || ''); setLoyaltyRedeemed(draft.loyaltyRedeemed || '0')
  }
  function clear() { restore({}) }
  useEffect(() => {
    setData(emptyPosData)
    if (!key) { clear(); setReady(''); return }
    try { restore(JSON.parse(localStorage.getItem(key) || '{}')); setReady(key) } catch { setError('Could not open the saved basket.'); setReady('') }
  }, [key])
  useEffect(() => {
    if (!key || ready !== key) return
    try { localStorage.setItem(key, JSON.stringify(snapshot)) } catch { setError('Could not save the basket on this device. Free some storage before closing the app.') }
  }, [key, ready, JSON.stringify(snapshot)])
  async function reload() { if (user) setData(await posRequest('/api/pos', headers)) }
  useEffect(() => { if (user) void reload().catch(caught => setError(caught.message)) }, [key, headers.Authorization])
  async function hold(label: string) {
    await posRequest('/api/pos/baskets', headers, { id: orderId, label, draft: snapshot, workspace: workspaceId }); clear(); await reload()
  }
  async function resume(basket: any) {
    if (Object.values(cart).some(quantity => quantity > 0)) throw new Error('Hold or clear the current basket first.')
    localStorage.setItem(key, JSON.stringify(basket.draft))
    restore(basket.draft)
    await posRequest('/api/pos/baskets', headers, { ...basket, deleted: true }); await reload()
  }
  const saleProducts = products.flatMap(product => [product, ...(workspaceId === 'oil' ? data.saleConversions.filter(row => row.productId === product.id).map(row => ({ ...product, id: `${product.id}:sale-unit:${row.id}`, baseProductId: product.id, name: `${product.name} · ${row.label}`, unit: row.label, baseUnit: product.unit, saleUnit: row.label, saleFactor: Number(row.factor), saleConversionId: row.id, price: Number(row.salePrice) })) : [])])
  const catalogue = [...saleProducts, ...lines.map(line => ({ ...line, stock: products.find(product => product.id === line.baseProductId)?.stock || 0 }))].map(product => ({ ...product, price: overrides[product.id] ?? product.price }))
  const selected = catalogue.filter(product => Number(cart[product.id]) > 0)
  const items = selected.map(product => { const factor = product.saleFactor || 1; return { productId: product.baseProductId || product.id, productName: factor > 1 ? `${product.name} (${factor} ${products.find(row => row.id === product.baseProductId)?.unit || 'units'} per pack)` : product.name, quantity: Math.round(cart[product.id] * factor * 1000) / 1000, price: Math.round(product.price / factor * 1000000) / 1000000 } })
  let pricingError = '', pricing = priceOrder([])
  try { pricing = priceOrder(items, { discountType, discountValue: Number(discountValue), tax: data.settings, customerId, loyaltyRedeemed: data.settings.loyaltyEnabled && customerId ? Number(loyaltyRedeemed) : 0 }) } catch (caught) { pricingError = caught instanceof Error ? caught.message : 'Invalid pricing.' }
  if (data.settings.loyaltyEnabled && customerId && Number(loyaltyRedeemed) > Math.max(0, data.loyaltyBalances[customerId] || 0)) pricingError = 'The rewards used exceed the available customer balance.'
  if (data.settings.offlineStockPoolsEnabled && data.settings.stockPools[checkoutTillId()] !== branchId) pricingError = 'Choose the assigned stock location for this till before selling.'
  const workspaceBaskets = data.baskets.filter(basket => workspaceId === 'oil' ? basket.workspace === 'oil' : basket.workspace !== 'oil')
  return { loyaltyRedeemed: data.settings.loyaltyEnabled && customerId ? loyaltyRedeemed : '0', setLoyaltyRedeemed, data: { ...data, baskets: workspaceBaskets }, error, setError, reload, clear, hold, resume, lines, setLines, overrides, setOverrides, discountType, setDiscountType, discountValue, setDiscountValue, customerId, setCustomerId, note, setNote, catalogue, items, pricing, pricingError }
}
