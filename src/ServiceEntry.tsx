import { useState } from 'react'

export function ServiceEntry({ disabled, add }: { disabled: boolean; add: (name: string, quantity: number, price: number) => void }) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState('')
  const valid = name.trim().length > 0 && Number(quantity) > 0 && Number.isFinite(Number(quantity)) && Math.abs(Number(quantity) * 1000 - Math.round(Number(quantity) * 1000)) < 0.000001 && price !== '' && Number.isFinite(Number(price)) && Number(price) >= 0
  return <form className="panel settings-form" onSubmit={event => {
    event.preventDefault()
    if (disabled || !valid) return
    add(name.trim(), Number(quantity), Number(price))
    setName(''); setQuantity('1'); setPrice('')
  }}>
    <h2>Charge for a service</h2>
    <p>Describe the work, enter its quantity and price, then take payment and issue a receipt. No inventory setup is needed.</p>
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0 }}>
      <label>Service description<input required maxLength={200} placeholder="e.g. A4 printing — customer supplied design" value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Service quantity<input required type="number" min="0.001" step="0.001" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
      <label>Price per service / unit<input required type="number" min="0" step="0.01" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} /></label>
      <button className="primary-button" type="submit" disabled={!valid}>Add service to basket</button>
    </fieldset>
  </form>
}
