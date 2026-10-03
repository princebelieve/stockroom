import { useState } from 'react'
import { Search, ScanLine, Plus } from 'lucide-react'
import type { Product } from './types'

export function PosCatalog({ products, matches, query, setQuery, cart, add, scan, scanKey, acceptBarcode, money, options = [] }: {
  products: Product[]; matches: Product[]; query: string; setQuery: (value: string) => void; cart: Record<string, number>;
  add: (product: Product) => void; scan: () => void; scanKey: string; acceptBarcode: (code: string) => void; money: (amount: number) => string;
  options?: Array<{ productId: string; variantGroup?: string; variantLabel?: string }>
}) {
  const [category, setCategory] = useState('')
  const [variantGroup, setVariantGroup] = useState('')
  const categories = [...new Set(products.map(product => product.category).filter(Boolean))].sort()
  const selectedCategory = categories.includes(category) ? category : ''
  const visible = matches.filter(product => (!selectedCategory || product.category === selectedCategory) && (!variantGroup || options.find(option => option.productId === product.id)?.variantGroup === variantGroup))
  return <div className="panel pos-catalog">
    <div className="panel-heading"><div><h2>Choose products</h2><p>Tap a product to add it to the sale.</p></div></div>
    <div className="pos-find"><div className="search-box"><Search size={18} /><input aria-label="Search products for sale" placeholder="Name, SKU or barcode" value={query} onChange={event => { setQuery(event.target.value); setCategory('') }} onKeyDown={event => { if (event.key === scanKey) { event.preventDefault(); acceptBarcode(query) } }} /></div><button type="button" className="filter-button" onClick={scan} aria-label="Scan barcode"><ScanLine size={19} />Scan</button></div>
    <label className="pos-category">Category<select value={selectedCategory} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(item => <option key={item}>{item}</option>)}</select><span>{visible.length} products</span></label>
    {options.some(option => option.variantGroup) && <label className="pos-category">Variant group<select value={variantGroup} onChange={event => setVariantGroup(event.target.value)}><option value="">All variants</option>{[...new Set(options.map(option => option.variantGroup).filter(Boolean))].map(group => <option key={group}>{group}</option>)}</select></label>}
    <div className="pos-products">{visible.map(product => {
      const quantity = cart[product.id] || 0
      const available = Math.max(0, product.stock - quantity)
      return <button type="button" className={`pos-product${quantity ? ' in-cart' : ''}`} key={product.id} disabled={available < 0.001} onClick={() => add(product)} aria-label={`Add ${product.name}, ${money(product.price)}${available < 0.001 ? ', unavailable' : ''}`}>
        <span className="pos-product-top"><small>{product.category}</small>{quantity > 0 && <em>{quantity} in cart</em>}</span>
        <strong>{product.name}</strong>{options.find(option => option.productId === product.id)?.variantLabel && <small>{options.find(option => option.productId === product.id)?.variantLabel}</small>}<small>{available < 0.001 ? (product.stock < 0.001 ? 'Out of stock' : 'All available stock in cart') : `${Math.round(available * 1000) / 1000} ${product.unit} available`}</small>
        <span className="pos-product-bottom"><b>{money(product.price)}</b><Plus size={18} /></span>
      </button>
    })}</div>
    {!visible.length && <div className="empty-state"><strong>{products.length ? 'No matching products' : 'No products yet'}</strong><p>{products.length ? 'Try another name, barcode or category.' : 'Add products in Inventory to start selling.'}</p>{products.length > 0 && <button type="button" className="filter-button" onClick={() => { setQuery(''); setCategory('') }}>Show all products</button>}</div>}
  </div>
}
