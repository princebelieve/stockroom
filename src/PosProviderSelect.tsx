import { useEffect, useId } from 'react'
export function PosProviderSelect({ providers, value, onChange, disabled = false }: { providers: string[]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId()
  const selected = providers.includes(value) ? value : providers[0] || ''
  useEffect(() => { if (selected !== value) onChange(selected) }, [selected, value, onChange])
  return <div><label htmlFor={id}>POS provider</label><select id={id} required disabled={disabled} value={selected} onChange={event => onChange(event.target.value)}><option value="">Choose POS provider</option>{providers.map(provider => <option key={provider} value={provider}>{provider}</option>)}</select>{!providers.length && <small>Select POS terminals in Business settings first.</small>}</div>
}
