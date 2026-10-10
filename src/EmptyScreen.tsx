import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyScreen({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <section className="empty-screen" role="status"><Inbox size={76} strokeWidth={1} aria-hidden="true" /><h2>{title}</h2><p>{description}</p>{action && <div className="empty-screen-action">{action}</div>}</section>
}

export function ScreenPicker({ value, options, change, label = 'Choose screen', buttons = false }: { value: string; options: { id: string; label: string }[]; change: (id: string) => void; label?: string; buttons?: boolean }) {
  return buttons
    ? <nav className="screen-picker screen-picker-buttons" aria-label={label}>{options.map(option => <button type="button" key={option.id} className={value === option.id ? 'primary-button' : 'filter-button'} aria-current={value === option.id ? 'page' : undefined} onClick={() => change(option.id)}>{option.label}</button>)}</nav>
    : <label className="screen-picker"><span>{label}</span><select aria-label={label} value={value} onChange={event => change(event.target.value)}>{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
}
