import type { Product } from '../types'

export function summarizeCart(products: Product[], quantities: Record<string, number>) {
  // A cart has one line per product ID, even if a refreshed catalogue repeats it.
  const selected = new Map<string, Product>()
  for (const product of products) {
    if (Number.isSafeInteger(quantities[product.id]) && quantities[product.id] > 0) {
      selected.set(product.id, product)
    }
  }
  const cartProducts = [...selected.values()]
  const totalCents = cartProducts.reduce((sum, product) =>
    sum + Math.round(Number(product.price) * 100) * quantities[product.id], 0)
  return { cartProducts, cartTotal: totalCents / 100 }
}
