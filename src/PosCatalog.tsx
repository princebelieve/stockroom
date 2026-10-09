import { useState } from 'react'
import { Search, ScanLine, Plus, PackagePlus } from 'lucide-react'
import type { Product } from './types'
import type { ProductDraft } from './lib/productIntake'

export function PosCatalog({ products, matches, query, setQuery, cart, add, scan, scanKey, acceptBarcode, money, options = [], oilMode = false, canAddProduct = false, addMissing }: {
  products: Product[]; matches: Product[]; query: string; setQuery: (value: string) => void; cart: Record<string, number>;
  add: (product: Product) => void; scan: () => void; scanKey: string; acceptBarcode: (code: string) => void; money: (amount: number) => string;
  options?: Array<{ productId: string; variantGroup?: string; variantLabel?: string }>; oilMode?: boolean; canAddProduct?: boolean; addMissing?: (draft: ProductDraft) => void
}) {
  const [category, setCategory] = useState('')
  const [variantGroup, setVariantGroup] = useState('')
  const categories = [...new Set(products.map(product => product.category).filter(Boolean))].sort()
  const selectedCategory = categories.includes(category) ? category : ''
  const visible = matches.filter(product => (!selectedCategory || product.category === selectedCategory) && (!variantGroup || options.find(option => option.productId === product.id)?.variantGroup === variantGroup))
  return <div className="panel pos-catalog">
    <div className="panel-heading"><div><h2>{oilMode ? 'Select oil and quantity' : 'Choose products'}</h2><p>{oilMode ? 'Choose a stock unit or configured container, then enter the measured quantity.' : 'Tap a product to add it to the sale.'}</p></div></div>
    <div className="pos-find"><div className="search-box"><Search size={18} /><input aria-label={oilMode ? 'Search oils for sale' : 'Search products for sale'} placeholder={oilMode ? 'Oil name, SKU or barcode' : 'Name, SKU or barcode'} value={query} onChange={event => { setQuery(event.target.value); setCategory('') }} onKeyDown={event => { if (event.key === scanKey) { event.preventDefault(); acceptBarcode(query) } }} /></div><button type="button" className="filter-button" onClick={scan} aria-label="Scan barcode"><ScanLine size={19} />Scan</button></div>
    <label className="pos-category">Category<select value={selectedCategory} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(item => <option key={item}>{item}</option>)}</select><span>{visible.length} products</span></label>
    {options.some(option => option.variantGroup) && <label className="pos-category">Variant group<select value={variantGroup} onChange={event => setVariantGroup(event.target.value)}><option value="">All variants</option>{[...new Set(options.map(option => option.variantGroup).filter(Boolean))].map(group => <option key={group}>{group}</option>)}</select></label>}
    <div className="pos-products">{visible.map(product => {
      const quantity = cart[product.id] || 0
      const factor = product.saleFactor || 1
      const baseId = product.baseProductId || product.id
      const usedBase = products.filter(line => (line.baseProductId || line.id) === baseId).reduce((sum, line) => sum + (cart[line.id] || 0) * (line.saleFactor || 1), 0)
      const available = Math.max(0, Math.floor((product.stock - usedBase) / factor * 1000) / 1000)
      return <button type="button" className={`pos-product${quantity ? ' in-cart' : ''}`} key={product.id} disabled={available < 0.001} onClick={() => add(product)} aria-label={`Add ${product.name}, ${money(product.price)}${available < 0.001 ? ', unavailable' : ''}`}>
        <span className="pos-product-top"><small>{product.category}</small>{quantity > 0 && <em>{quantity} in cart</em>}</span>
        <strong>{product.name}</strong>{options.find(option => option.productId === product.id)?.variantLabel && <small>{options.find(option => option.productId === product.id)?.variantLabel}</small>}<small>{available < 0.001 ? (product.stock < 0.001 ? 'Out of stock' : 'Not enough stock for another pack') : factor > 1 ? `${available} ${product.saleUnit} available · ${factor} ${product.baseUnit} each` : `${Math.round(available * 1000) / 1000} ${product.unit} available`}</small>
        <span className="pos-product-bottom"><b>{money(product.price)}{factor > 1 ? ` / ${product.saleUnit}` : ''}</b><Plus size={18} /></span>
      </button>
    })}</div>
    {!visible.length && <div className="empty-state pos-catalog-empty"><PackagePlus size={38} aria-hidden="true"/><strong>{products.length ? query.trim() ? 'New product?' : 'No matching products' : 'No products yet'}</strong><p>{products.length ? query.trim() ? 'Save this item once, then return to the sale with it ready.' : 'Try another name, barcode or category.' : 'Add products in Inventory to start selling.'}</p>{products.length > 0 && query.trim() && canAddProduct && <button type="button" className="primary-button" onClick={() => addMissing?.({ name: '', barcode: query.trim() })}>Add this product <Plus size={17}/></button>}{products.length > 0 && <button type="button" className="filter-button" onClick={() => { setQuery(''); setCategory('') }}>Show all products</button>}{products.length === 0 && canAddProduct && <button type="button" className="primary-button" onClick={() => addMissing?.({name:'',barcode:query.trim()})}>Add product <Plus size={17}/></button>}</div>}
  </div>
}
