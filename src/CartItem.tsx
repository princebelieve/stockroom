import { useState } from 'react'
import { Ban, Check, Minus, Pencil, Plus, X } from 'lucide-react'
import type { Product } from './types'

export function CartItem({ product, quantity, money, onChange, onVoid }: {
  product: Product
  quantity: number
  money: (amount: number) => string
  onChange: (quantity: number) => void
  onVoid: (quantity?: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const valid = /^\d+(?:\.\d{1,3})?$/.test(draft) && Number.isFinite(Number(draft)) && Number(draft) > 0
  function save() {
    if (!valid) return
    const nextQuantity = Number(draft)
    onChange(nextQuantity)
    setEditing(false)
  }
  return <div className="cart-row">
    <div>
      <strong>{product.name}</strong>
      <span>{quantity} × {money(product.price)} = {money(Math.round(product.price * 100) * quantity / 100)}</span>
      <div className="cart-quantity-controls">
        {editing ? <>
          <input autoFocus type="number" inputMode="decimal" min="0.001" step="0.001" aria-label={`Quantity for ${product.name}`} aria-invalid={!valid} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); save() }
            if (event.key === 'Escape') { event.preventDefault(); setEditing(false) }
          }} />
          <button type="button" className="quantity-save" disabled={!valid} aria-label={`Save quantity for ${product.name}`} title="Save quantity" onClick={save}><Check size={16} /></button>
          <button type="button" className="quantity-cancel" aria-label={`Cancel quantity edit for ${product.name}`} title="Cancel" onClick={() => setEditing(false)}><X size={16} /></button>
        </> : <>
          <button type="button" className="quantity-decrease" aria-label={`Reduce ${product.name} quantity by one`} title="Reduce quantity" onClick={() => onChange(Math.max(0, Math.round((quantity - 1) * 1000) / 1000))}><Minus size={16} /></button>
          <output aria-label={`Quantity for ${product.name}`}>{quantity}</output>
          <button type="button" className="quantity-increase" aria-label={`Increase quantity of ${product.name}`} title="Increase quantity" onClick={() => onChange(Math.round((quantity + 1) * 1000) / 1000)}><Plus size={16} /></button>
          <button type="button" className="quantity-edit" aria-label={`Edit quantity of ${product.name}`} title="Enter quantity" onClick={() => { setDraft(String(quantity)); setEditing(true) }}><Pencil size={16} /></button>
        </>}
      </div>
      {editing && !valid && <small role="status">Enter a quantity greater than zero, with up to three decimals.</small>}
    </div>
    <button type="button" className="void-cart-item" aria-label={`Void rejected ${product.name}`} title="Void rejected item (reason required)" onClick={() => onVoid()}><Ban size={17} /></button>
  </div>
}
