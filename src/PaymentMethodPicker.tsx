import { Banknote, CreditCard, Landmark, MoreHorizontal, WalletCards, Split } from 'lucide-react'
import { useState } from 'react'
import type { Sale } from './types'

const primaryMethods: Array<{ value: Sale['paymentMethod']; label: string; icon: typeof Banknote }> = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'external-pos', label: 'POS terminal', icon: CreditCard },
  { value: 'bank-transfer', label: 'Transfer', icon: Landmark },
]
const otherMethods: Array<{ value: Sale['paymentMethod']; label: string; icon: typeof Banknote }> = [
  { value: 'multiple', label: 'Split payment', icon: Split },
  { value: 'wallet', label: 'Customer wallet', icon: WalletCards },
]

export function PaymentMethodPicker({ value, onChange, walletEnabled, disabled }: {
  value: Sale['paymentMethod']
  onChange: (value: Sale['paymentMethod']) => void
  walletEnabled: boolean
  disabled: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const selectedOther = otherMethods.find(method => method.value === value)
  return <div className="payment-method-picker" role="group" aria-label="Payment method" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setMenuOpen(false)}} onKeyDown={event=>{if(event.key==='Escape')setMenuOpen(false)}}>
    {primaryMethods.map(({ value: method, label, icon: Icon }) => <button key={method} type="button" className={`payment-method-choice${value === method ? ' active' : ''}`} aria-pressed={value === method} disabled={disabled} onClick={() => { setMenuOpen(false); onChange(method) }}>
      <Icon size={18} aria-hidden="true" /><span>{label}</span>
    </button>)}
    <div className="payment-method-overflow"><button type="button" className={`payment-method-choice${selectedOther ? ' active' : ''}`} aria-haspopup="menu" aria-expanded={menuOpen} aria-pressed={Boolean(selectedOther)} disabled={disabled} onClick={() => setMenuOpen(open => !open)}><MoreHorizontal size={18} aria-hidden="true" /><span>{selectedOther?.label || 'More'}</span></button>
      {menuOpen && <div className="payment-method-menu" role="menu" aria-label="Other payment methods">{otherMethods.filter(method => method.value !== 'wallet' || walletEnabled).map(({ value: method, label, icon: Icon }) => <button key={method} type="button" role="menuitemradio" aria-checked={value === method} onClick={() => { setMenuOpen(false); onChange(method) }}><Icon size={17} aria-hidden="true" />{label}</button>)}</div>}
    </div>
  </div>
}
