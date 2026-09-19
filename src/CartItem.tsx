import { useState } from 'react'
import { Check, Minus, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { Product } from './types'

export function CartItem({ product, quantity, money, onChange }: {
  product: Product
  quantity: number
  money: (amount: number) => string
  onChange: (quantity: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const valid = /^\d+$/.test(draft) && Number.isSafeInteger(Number(draft)) && Number(draft) > 0
  function save() {
    if (!valid) return
    onChange(Number(draft))
    setEditing(false)
  }
  return <div className="cart-row">
    <div>
      <strong>{product.name}</strong>
      <span>{quantity} × {money(product.price)} = {money(Math.round(product.price * 100) * quantity / 100)}</span>
      <div className="cart-quantity-controls">
        {editing ? <>
          <input autoFocus type="number" inputMode="numeric" min="1" step="1" aria-label={`Quantity for ${product.name}`} aria-invalid={!valid} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); save() }
            if (event.key === 'Escape') { event.preventDefault(); setEditing(false) }
          }} />
          <button type="button" disabled={!valid} aria-label={`Save quantity for ${product.name}`} title="Save quantity" onClick={save}><Check size={16} /></button>
          <button type="button" aria-label={`Cancel quantity edit for ${product.name}`} title="Cancel" onClick={() => setEditing(false)}><X size={16} /></button>
        </> : <>
          <button type="button" aria-label={`Decrease quantity of ${product.name}`} title="Decrease quantity (removes item at zero)" onClick={() => onChange(quantity - 1)}><Minus size={16} /></button>
          <output aria-label={`Quantity for ${product.name}`}>{quantity}</output>
          <button type="button" disabled={!Number.isSafeInteger(quantity + 1)} aria-label={`Increase quantity of ${product.name}`} title="Increase quantity" onClick={() => onChange(quantity + 1)}><Plus size={16} /></button>
          <button type="button" aria-label={`Edit quantity of ${product.name}`} title="Enter quantity" onClick={() => { setDraft(String(quantity)); setEditing(true) }}><Pencil size={16} /></button>
        </>}
      </div>
      {editing && !valid && <small role="status">Enter a whole number greater than zero.</small>}
    </div>
    <button type="button" aria-label={`Remove ${product.name} from sale`} title="Remove item" onClick={() => onChange(0)}><Trash2 size={17} /></button>
  </div>
}
