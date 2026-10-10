import { useState } from 'react'
import { Search, ScanLine } from 'lucide-react'
import { AsyncButton } from './AsyncControls'
import type { Product } from './types'
import type { ProductDraft } from './lib/productIntake'
import { lookupProductBarcode, validGtin } from './lib/productIntake'
import type { ShopProfile, CatalogueWorkspace } from '../server/shop-profile.mjs'

export function ProductSearch({ products, add, open, scan, openStarters, lookupApiUrl = '', shopProfile, catalogueWorkspace = 'product-sales' }: { products: Product[]; add: (draft?: ProductDraft) => void; open: (product: Product) => void; scan: () => Promise<string | undefined>; openStarters: () => void; lookupApiUrl?: string; shopProfile?: ShopProfile; catalogueWorkspace?: CatalogueWorkspace }) {
  const [query, setQuery] = useState('')
  const [missing, setMissing] = useState<ProductDraft | null>(null)
  const [lookupProblem, setLookupProblem] = useState('')
  const matches = query.trim() ? products.filter(product => [product.name, product.barcode, product.sku].some(value => value?.toLowerCase().includes(query.trim().toLowerCase()))).slice(0, 30) : []

  async function scanForProduct() {
    const code = await scan()
    if (!code) return
    const found = products.find(product => product.barcode === code || product.sku === code)
    if (found) { open(found); return }
    let draft: ProductDraft = { name: '', barcode: code }
    setLookupProblem('')
    if (validGtin(code)) {
      try { draft = await lookupProductBarcode(code, lookupApiUrl, shopProfile, catalogueWorkspace) || draft }
      catch (error) { setLookupProblem(error instanceof Error ? error.message : 'The product lookup service is unavailable.') }
    } else setLookupProblem('This barcode format could not be checked online. You can still add the product manually.')
    setMissing(draft)
  }

  return <section className="panel product-search">
    <h2>Add or search product</h2>
    <label><Search size={18} /><span className="sr-only">Search products to add or edit</span><input type="search" value={query} placeholder="Product name or barcode" onChange={event => setQuery(event.target.value)} /></label>
    {matches.map(product => <button type="button" className="product-search-result" key={product.id} onClick={() => open(product)}>{product.name}<small>{product.barcode || product.sku}</small></button>)}
    {query.trim() && !matches.length && <p role="status">No matching product</p>}
    <div className="product-search-actions">
      <button type="button" className="primary-button" onClick={() => add(query.trim() ? { name: query.trim() } : undefined)}>Add product</button>
      <AsyncButton className="filter-button" onClick={scanForProduct}><ScanLine size={20} />Scan barcode</AsyncButton>
      <button type="button" className="filter-button" onClick={openStarters}>Browse starter products</button>
    </div>
    {missing && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="missing-product-title">
      <h2 id="missing-product-title">Add product</h2>
      {missing.name
        ? <p>{missing.catalogueSource || 'Product catalogue'} suggests <strong>{missing.name}</strong>. This is an editable starting name for your upload. Price, cost and stock still come from your business.</p>
        : lookupProblem
          ? <p role="alert">The barcode was scanned, but the lookup could not be completed: {lookupProblem} The barcode is filled in; you can still add the product manually.</p>
          : <p>No catalogue name was returned for this barcode. It is still ready to upload: the barcode is filled in, and you can enter the product name and your store details.</p>}
      <div className="product-search-actions">
        <button type="button" className="filter-button" onClick={() => { setMissing(null); setLookupProblem('') }}>Dismiss</button>
        <button type="button" className="primary-button" onClick={() => { add(missing); setMissing(null); setLookupProblem('') }}>Review product details</button>
      </div>
    </section></div>}
  </section>
}
