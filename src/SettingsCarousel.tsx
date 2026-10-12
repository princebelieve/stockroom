import { Check, ChevronDown, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export type SettingsSlide = { id: string; label: string; hint: string }

export function SettingsCarousel({ items, value, onChange }: { items: SettingsSlide[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const index = Math.max(0, items.findIndex(item => item.id === value))
  const current = items[index]
  const filteredItems = items.filter(item => `${item.label} ${item.hint}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [open])

  if (!current) return null
  const selectTask = (id: string) => {
    onChange(id)
    setQuery('')
    setOpen(false)
  }

  return <section className="settings-carousel" aria-label="Business settings tasks" ref={rootRef}>
    <div className="settings-task-picker">
      <span className="overview-eyebrow">Settings · {index + 1} of {items.length}</span>
      <button type="button" className="settings-task-picker-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => {
        setOpen(value => !value)
        setQuery('')
        requestAnimationFrame(() => inputRef.current?.focus())
      }}>
        <span>{current.label}</span><ChevronDown size={19} aria-hidden="true" />
      </button>
      {open && <div className="settings-task-picker-menu">
        <label className="settings-task-picker-search">
          <Search size={18} aria-hidden="true" />
          <input ref={inputRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search settings tasks" aria-label="Search settings tasks" aria-controls="settings-task-options" />
        </label>
        <div className="settings-task-picker-options" id="settings-task-options" role="listbox" aria-label="Settings tasks">
          {filteredItems.length ? filteredItems.map(item => <button type="button" role="option" aria-selected={item.id === current.id} key={item.id} onClick={() => selectTask(item.id)}>
            <span><strong>{item.label}</strong><small>{item.hint}</small></span>{item.id === current.id && <Check size={17} aria-hidden="true" />}
          </button>) : <p className="settings-task-picker-empty">No matching settings tasks</p>}
        </div>
      </div>}
    </div>
  </section>
}
