import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { PackagePlus, Plus, ScanLine, Search } from 'lucide-react'
import type { Product } from './types'
import type { ProductDraft } from './lib/productIntake'

export function PosCatalog({ products, matches, query, setQuery, cart, add, scan, scanKey, acceptBarcode, money, options = [], oilMode = false, canAddProduct = false, addMissing, onlineSuggestion = '' }: {
  products: Product[]; matches: Product[]; query: string; setQuery: (value: string) => void; cart: Record<string, number>;
  add: (product: Product) => void | Promise<void>; scan: () => void; scanKey: string; acceptBarcode: (code: string) => void; money: (amount: number) => string;
  options?: Array<{ productId: string; variantGroup?: string; variantLabel?: string }>; oilMode?: boolean; canAddProduct?: boolean; addMissing?: (draft: ProductDraft) => void; onlineSuggestion?: string
}) {
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [suggestionPlacement, setSuggestionPlacement] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 12, width: 320 })
  const findRef = useRef<HTMLDivElement>(null)
  const term = query.trim()
  const hasSearch = term.length >= 3
  const visible = hasSearch ? matches : []

  useEffect(() => {
    if (!visible.length) return
    const placeSuggestions = () => {
      const anchor = findRef.current?.querySelector('.search-box')?.getBoundingClientRect()
      if (!anchor) return
      const mobile = window.matchMedia('(max-width: 1023px)').matches
      const sidebar = document.querySelector('.app-shell > .sidebar')?.getBoundingClientRect()
      let width = Math.min(anchor.width, window.innerWidth - 24)
      let left = mobile ? (window.innerWidth - width) / 2 : Math.max(anchor.left, (sidebar?.right ?? 0) + 8)
      if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12
      left = Math.max(12, left)
      width = Math.min(width, window.innerWidth - left - 12)
      const maxHeight = Math.min(window.innerHeight * 0.55, 420)
      const top = Math.max(12, Math.min(anchor.bottom + 6, window.innerHeight - maxHeight - 12))
      setSuggestionPlacement({ top, left, width })
    }
    placeSuggestions()
    window.addEventListener('resize', placeSuggestions)
    window.addEventListener('scroll', placeSuggestions, true)
    return () => {
      window.removeEventListener('resize', placeSuggestions)
      window.removeEventListener('scroll', placeSuggestions, true)
    }
  }, [visible.length])

  async function choose(product: Product) {
    await add(product)
    setQuery('')
    setActiveSuggestion(0)
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && visible.length) {
      event.preventDefault()
      setActiveSuggestion(index => (index + 1) % visible.length)
      return
    }
    if (event.key === 'ArrowUp' && visible.length) {
      event.preventDefault()
      setActiveSuggestion(index => (index - 1 + visible.length) % visible.length)
      return
    }
    if (event.key === scanKey && event.key !== 'Enter') {
      event.preventDefault()
      acceptBarcode(term)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const exact = products.find(product => product.barcode === term || product.sku === term)
      if (exact || /^\d{8,14}$/.test(term) || !visible.length) acceptBarcode(term)
      else void choose(visible[activeSuggestion] || visible[0])
      return
    }
  }

  return <div className="panel pos-catalog">
    <div className="pos-catalog-header"><div><span className="pos-section-kicker">{oilMode ? 'OIL SALES' : 'NEW SALE'}</span><h2>{oilMode ? 'Find oil' : 'Find a product'}</h2></div><span className="pos-result-count">{hasSearch ? `${visible.length} ${visible.length === 1 ? 'match' : 'matches'}` : 'Scan or search'}</span></div>
    <div className="pos-find" ref={findRef}>
      <div className="pos-search-autocomplete">
        <div className="search-box"><Search size={18} aria-hidden="true"/><input aria-label={oilMode ? 'Search oils for sale' : 'Search products for sale'} aria-autocomplete="list" aria-expanded={visible.length > 0} aria-controls="pos-product-suggestions" placeholder={oilMode ? 'Search oil name or SKU' : 'Search product name or SKU'} value={query} onChange={event => { setQuery(event.target.value); setActiveSuggestion(0) }} onKeyDown={onSearchKeyDown} /></div>
        {visible.length > 0 && createPortal(<div className="pos-product-suggestions" id="pos-product-suggestions" role="listbox" aria-label="Matching products" style={suggestionPlacement}>{visible.map((product, index) => {
          const factor = product.saleFactor || 1
          const baseId = product.baseProductId || product.id
          const usedBase = products.filter(line => (line.baseProductId || line.id) === baseId).reduce((sum, line) => sum + (cart[line.id] || 0) * (line.saleFactor || 1), 0)
          const available = Math.max(0, Math.floor((product.stock - usedBase) / factor * 1000) / 1000)
          const variant = options.find(option => option.productId === product.id)?.variantLabel
          const metadata = [product.sku, variant, `${available} ${factor > 1 ? product.saleUnit : product.unit} available`].filter(Boolean).join(' · ')
          return <button type="button" role="option" aria-selected={index === activeSuggestion} className="pos-product-suggestion" key={product.id} disabled={available < 0.001} onMouseEnter={() => setActiveSuggestion(index)} onClick={() => void choose(product)}>
            <span className="pos-product-suggestion-copy"><strong>{product.name}</strong><small>{metadata}</small></span><b>{money(product.price)}{factor > 1 ? ` / ${product.saleUnit}` : ''}</b><Plus size={17} aria-hidden="true"/>
          </button>
        })}</div>, document.body)}
      </div>
      <button type="button" className="filter-button pos-scan-button" onClick={scan} aria-label="Scan product barcode" title="Scan product barcode"><ScanLine size={19}/><span>Scan barcode</span></button>
    </div>
    {term.length > 0 && !hasSearch && <p className="pos-search-hint" role="status">Type at least 3 characters, or scan a barcode.</p>}
    {hasSearch && !visible.length && <div className="pos-search-empty" role="status"><strong>{onlineSuggestion ? `Catalogue suggestion: ${onlineSuggestion}` : 'No matching product'}</strong><span>{onlineSuggestion ? 'Confirm the exact item before adding it.' : 'Check the product name, SKU or barcode and try again.'}</span>{/^\d{8,14}$/.test(term) && canAddProduct && <button type="button" className="text-button" onClick={() => addMissing?.({ name: '', barcode: term })}>Add this barcode as a product</button>}</div>}
    {!products.length && !term && <div className="empty-state pos-catalog-empty"><PackagePlus size={28} aria-hidden="true"/><strong>No products saved yet</strong><p>{canAddProduct ? 'Add a product to start selling.' : 'Ask a manager to add products before starting a sale.'}</p>{canAddProduct && <button type="button" className="primary-button" onClick={() => addMissing?.({ name: '' })}>Add product <Plus size={17}/></button>}</div>}
  </div>
}
