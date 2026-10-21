import { ChevronDown, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { matchesSearchText } from './lib/searchText'

export type SearchOption = { value: string; label: string }

export function SearchableSelect({ value, options, onChange, placeholder = 'Search options', disabled = false, required = false, ariaLabel, fitViewport = false }: {
  value: string
  options: SearchOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  ariaLabel: string
  fitViewport?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [viewportPlacement,setViewportPlacement]=useState<{left:number;top:number;width:number;maxHeight:number;optionsMaxHeight:number}>()
  const selected = options.find(option => option.value === value)
  const matches = options.filter(option => matchesSearchText(query,[option.label,option.value]))

  function placeInViewport() {
    const rect=trigger.current?.getBoundingClientRect()
    if(!rect)return
    const width=Math.min(300,Math.max(0,window.innerWidth-24))
    const left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12))
    const maxHeight=Math.max(140,Math.min(440,window.innerHeight-24))
    const below=window.innerHeight-rect.bottom-12
    const top=below>=140||rect.top<maxHeight?Math.max(12,rect.bottom+6):Math.max(12,rect.top-maxHeight-6)
    const optionsMaxHeight=Math.max(70,Math.min(300,window.innerHeight*0.55,maxHeight-74))
    setViewportPlacement({left,top,width,maxHeight,optionsMaxHeight})
  }

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    if (!open || !fitViewport) return
    const reposition=()=>placeInViewport()
    window.addEventListener('resize',reposition)
    window.addEventListener('scroll',reposition,true)
    return()=>{window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition,true)}
  }, [open,fitViewport])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); setQuery('') } }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [open])

  function show() {
    if (disabled) return
    setQuery('')
    if(fitViewport)placeInViewport()
    setOpen(true)
    requestAnimationFrame(() => input.current?.focus())
  }

  return <div className="searchable-select" ref={root}>
    {required && <select className="searchable-select-validity" tabIndex={-1} aria-hidden="true" required disabled={disabled} value={value} onChange={() => undefined} onInvalid={event => { event.preventDefault(); trigger.current?.focus() }}><option value="">Choose an option</option>{selected && <option value={selected.value}>{selected.label}</option>}</select>}
    <button ref={trigger} type="button" className="searchable-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-required={required || undefined} disabled={disabled} onClick={show}>
      <span>{selected?.label || placeholder}</span><ChevronDown size={18} aria-hidden="true" />
    </button>
    {open && <div className={`searchable-select-menu${fitViewport?' searchable-select-menu-viewport':''}`} style={fitViewport&&viewportPlacement?{left:viewportPlacement.left,top:viewportPlacement.top,width:viewportPlacement.width,maxHeight:viewportPlacement.maxHeight}:undefined}>
      <label className="searchable-select-search"><Search size={17} aria-hidden="true" /><input ref={input} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={placeholder} aria-label={`Search ${ariaLabel.toLocaleLowerCase()}`} /></label>
      <div className="searchable-select-options" style={fitViewport&&viewportPlacement?{maxHeight:viewportPlacement.optionsMaxHeight}:undefined} role="listbox" aria-label={ariaLabel}>
        {matches.length ? matches.map(option => <button type="button" role="option" aria-selected={option.value === value} key={option.value} onClick={() => { onChange(option.value); setOpen(false); setQuery('') }}>{option.label}</button>) : <p>No matching options.</p>}
      </div>
    </div>}
  </div>
}
