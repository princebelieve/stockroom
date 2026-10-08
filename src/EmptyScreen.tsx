import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyScreen({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <section className="empty-screen" role="status"><Inbox size={76} strokeWidth={1} aria-hidden="true" /><h2>{title}</h2><p>{description}</p>{action && <div className="empty-screen-action">{action}</div>}</section>
}

export function ScreenPicker({ value, options, change, label = 'Choose screen' }: { value: string; options: { id: string; label: string }[]; change: (id: string) => void; label?: string }) {
  return <label className="screen-picker"><span>{label}</span><select value={value} onChange={event => change(event.target.value)}>{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
}
