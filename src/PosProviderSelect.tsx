import { useEffect } from 'react'
import { SearchableSelect } from './SearchableSelect'
export function PosProviderSelect({ providers, value, onChange, disabled = false }: { providers: string[]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const selected = providers.includes(value) ? value : providers[0] || ''
  useEffect(() => { if (selected !== value) onChange(selected) }, [selected, value, onChange])
  return <div><label>POS provider<SearchableSelect ariaLabel="POS provider" placeholder="Search POS providers" required disabled={disabled || !providers.length} value={selected} options={providers.map(provider => ({ value: provider, label: provider }))} onChange={onChange} /></label>{!providers.length && <small>Select POS terminals in Business settings first.</small>}</div>
}
