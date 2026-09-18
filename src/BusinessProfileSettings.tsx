export type BusinessMode = 'general' | 'grocery' | 'building' | 'bulk'
export const businessModes: Record<BusinessMode, { label: string; unit: string; note: string }> = {
  general: { label: 'General retail', unit: 'item', note: 'Use for mixed packaged goods and everyday retail.' },
  grocery: { label: 'Grocery and provisions', unit: 'bag', note: 'New products default to bag; change the unit per product when needed.' },
  building: { label: 'Building materials', unit: 'bag', note: 'New products default to bag for cement and similar materials.' },
  bulk: { label: 'Bulk or measured goods', unit: 'kg', note: 'New products default to kg. This is a unit label only; stock and sales remain whole quantities in this release.' },
}
export function BusinessProfileSettings({ value, onChange }: { value: BusinessMode; onChange: (value: BusinessMode) => void }) {
  return <label>Business type<span>{businessModes[value].note}</span><select value={value} onChange={event => onChange(event.target.value as BusinessMode)}>{Object.entries(businessModes).map(([key, mode]) => <option key={key} value={key}>{mode.label}</option>)}</select></label>
}
