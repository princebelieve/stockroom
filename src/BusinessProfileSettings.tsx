import { businessModes, type BusinessMode } from '../server/shop-profile.mjs'
export { businessModes }
export type { BusinessMode }
export function BusinessProfileSettings({ value, onChange }: { value: BusinessMode; onChange: (value: BusinessMode) => void }) {
  return <label>Business type<span>{businessModes[value].note}</span><select value={value} onChange={event => onChange(event.target.value as BusinessMode)}>{Object.entries(businessModes).map(([key, mode]) => <option key={key} value={key}>{mode.label}</option>)}</select></label>
}
