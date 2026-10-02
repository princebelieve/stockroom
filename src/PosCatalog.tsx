import { useState } from 'react'
import { Search, ScanLine, Plus } from 'lucide-react'
import type { Product } from './types'

export function PosCatalog({ products, matches, query, setQuery, cart, add, scan, scanKey, acceptBarcode, money }: {
  products: Product[]; matches: Product[]; query: string; setQuery: (value: string) => void; cart: Record<string, number>;
  add: (product: Product) => void; scan: () => void; scanKey: string; acceptBarcode: (code: string) => void; money: (amount: number) => string;
}) {
  const [category, setCategory] = useState('')
  const categories = [...new Set(products.map(product => product.category).filter(Boolean))].sort()
  const selectedCategory = categories.includes(category) ? category : ''
  const visible = matches.filter(product => !selectedCategory || product.category === selectedCategory)
  return <div className="panel pos-catalog">
    <div className="panel-heading"><div><h2>Choose products</h2><p>Tap a product to add it to the sale.</p></div></div>
    <div className="pos-find"><div className="search-box"><Search size={18} /><input aria-label="Search products for sale" placeholder="Name, SKU or barcode" value={query} onChange={event => { setQuery(event.target.value); setCategory('') }} onKeyDown={event => { if (event.key === scanKey) { event.preventDefault(); acceptBarcode(query) } }} /></div><button type="button" className="filter-button" onClick={scan} aria-label="Scan barcode"><ScanLine size={19} />Scan</button></div>
    <label className="pos-category">Category<select value={selectedCategory} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(item => <option key={item}>{item}</option>)}</select><span>{visible.length} products</span></label>
    <div className="pos-products">{visible.map(product => {
      const quantity = cart[product.id] || 0
      const available = Math.max(0, product.stock - quantity)
      return <button type="button" className={`pos-product${quantity ? ' in-cart' : ''}`} key={product.id} disabled={available < 1} onClick={() => add(product)} aria-label={`Add ${product.name}, ${money(product.price)}${available < 1 ? ', unavailable' : ''}`}>
        <span className="pos-product-top"><small>{product.category}</small>{quantity > 0 && <em>{quantity} in cart</em>}</span>
        <strong>{product.name}</strong><small>{available < 1 ? (product.stock < 1 ? 'Out of stock' : 'All available stock in cart') : `${available} ${product.unit} available`}</small>
        <span className="pos-product-bottom"><b>{money(product.price)}</b><Plus size={18} /></span>
      </button>
    })}</div>
    {!visible.length && <div className="empty-state"><strong>{products.length ? 'No matching products' : 'No products yet'}</strong><p>{products.length ? 'Try another name, barcode or category.' : 'Add products in Inventory to start selling.'}</p>{products.length > 0 && <button type="button" className="filter-button" onClick={() => { setQuery(''); setCategory('') }}>Show all products</button>}</div>}
  </div>
}
