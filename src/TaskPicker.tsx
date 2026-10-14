import { Check, ChevronDown, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { matchesSearchText } from './lib/searchText'

export type TaskOption = { id: string; label: string; hint: string }

export function TaskPicker({ items, value, onChange, scope }: { items: TaskOption[]; value: string; onChange: (id: string) => void; scope: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const index = items.findIndex(item => item.id === value)
  const current = items[index]
  const filteredItems = items.filter(item => matchesSearchText(query,[item.label,item.hint]))

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

  return <section className="task-picker" aria-label={`${scope} tasks`} ref={rootRef}>
    <div className="task-picker-control">
      <span className="overview-eyebrow">{scope} · {index + 1} of {items.length}</span>
      <button type="button" className="task-picker-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => {
        setOpen(value => !value)
        setQuery('')
        requestAnimationFrame(() => inputRef.current?.focus())
      }}>
        <span className="task-picker-current"><small>Looking for a screen or task?</small><strong>{current.label}</strong></span><ChevronDown size={19} aria-hidden="true" />
      </button>
      {open && <div className="task-picker-menu">
        <label className="task-picker-search">
          <Search size={18} aria-hidden="true" />
          <input ref={inputRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={`Looking for a screen? Search ${scope.toLocaleLowerCase()} tasks`} aria-label={`Search ${scope.toLocaleLowerCase()} tasks`} aria-controls="task-picker-options" />
        </label>
        <div className="task-picker-options" id="task-picker-options" role="listbox" aria-label={`${scope} tasks`}>
          {filteredItems.length ? filteredItems.map(item => <button type="button" role="option" aria-selected={item.id === current.id} key={item.id} onClick={() => selectTask(item.id)}>
            <span><strong>{item.label}</strong><small>{item.hint}</small></span>{item.id === current.id && <Check size={17} aria-hidden="true" />}
          </button>) : <p className="task-picker-empty">No matching tasks</p>}
        </div>
      </div>}
    </div>
  </section>
}
