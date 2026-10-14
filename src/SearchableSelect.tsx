import { ChevronDown, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { matchesSearchText } from './lib/searchText'

export type SearchOption = { value: string; label: string }

export function SearchableSelect({ value, options, onChange, placeholder = 'Search options', disabled = false, required = false, ariaLabel }: {
  value: string
  options: SearchOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  ariaLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const selected = options.find(option => option.value === value)
  const matches = options.filter(option => matchesSearchText(query,[option.label,option.value]))

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); setQuery('') } }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [open])

  function show() {
    if (disabled) return
    setQuery('')
    setOpen(true)
    requestAnimationFrame(() => input.current?.focus())
  }

  return <div className="searchable-select" ref={root}>
    {required && <select className="searchable-select-validity" tabIndex={-1} aria-hidden="true" required disabled={disabled} value={value} onChange={() => undefined} onInvalid={event => { event.preventDefault(); trigger.current?.focus() }}><option value="">Choose an option</option>{selected && <option value={selected.value}>{selected.label}</option>}</select>}
    <button ref={trigger} type="button" className="searchable-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-required={required || undefined} disabled={disabled} onClick={show}>
      <span>{selected?.label || placeholder}</span><ChevronDown size={18} aria-hidden="true" />
    </button>
    {open && <div className="searchable-select-menu">
      <label className="searchable-select-search"><Search size={17} aria-hidden="true" /><input ref={input} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={placeholder} aria-label={`Search ${ariaLabel.toLocaleLowerCase()}`} /></label>
      <div className="searchable-select-options" role="listbox" aria-label={ariaLabel}>
        {matches.length ? matches.map(option => <button type="button" role="option" aria-selected={option.value === value} key={option.value} onClick={() => { onChange(option.value); setOpen(false); setQuery('') }}>{option.label}</button>) : <p>No matching options.</p>}
      </div>
    </div>}
  </div>
}
