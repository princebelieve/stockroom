import { createHash } from 'node:crypto'

// Public catalogue contains only explicitly published products, never costs or stock counts.
export function retailCatalogue(products, settings, taxRevision = '') {
  const allowed = new Set(settings?.retailProductIds || [])
  const items = products.filter(product => allowed.has(product.id) && !product.deleted && Number.isFinite(Number(product.price)) && Number(product.price) > 0 && Number.isSafeInteger(Math.round(Number(product.price)*100)) && typeof product.name === 'string' && product.name.length <= 100)
    .map(product => ({ id: product.id, name: product.name, price: Number(product.price), type: 'stock', productId: product.id, available: true, options: [], description: product.unit || '' })).sort((a,b)=>a.id.localeCompare(b.id))
  return { id: 'retail-catalogue', updatedAt: createHash('sha256').update(JSON.stringify([items,settings,taxRevision])).digest('hex'), items }
}
