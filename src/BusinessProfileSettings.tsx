import { businessModes, type BusinessMode } from '../server/shop-profile.mjs'
import { SearchableSelect } from './SearchableSelect'
export { businessModes }
export type { BusinessMode }
export function BusinessProfileSettings({ value, onChange }: { value: BusinessMode; onChange: (value: BusinessMode) => void }) {
  return <label>Business type<span>{businessModes[value].note}</span><SearchableSelect ariaLabel="Business type" placeholder="Search business types" value={value} options={Object.entries(businessModes).map(([key, mode]) => ({ value: key, label: mode.label }))} onChange={next => onChange(next as BusinessMode)} /></label>
}
