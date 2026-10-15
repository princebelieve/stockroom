import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'
import { createPortal } from 'react-dom'

export type ToolDestination = { label: string; open: () => void }
const HISTORY_KEY = 'stockroom-tool-search-history'

function readHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as string[] } catch { return [] }
}

export function ToolSearch({ tools }: { tools: ToolDestination[] }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [history, setHistory] = useState<string[]>(readHistory)
  const container = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const mobile = typeof window !== 'undefined' && window.matchMedia('(max-width:1023px)').matches
  const matches = useMemo(() => tools.filter(tool => tool.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [tools, query])

  useEffect(() => {
    if (!focused) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setFocused(false); setQuery(''); input.current?.blur() } }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focused])

  function close() { setFocused(false); setQuery(''); input.current?.blur() }
  function openTool(tool: ToolDestination) {
    const next = [tool.label, ...history.filter(item => item !== tool.label)].slice(0, 8)
    setHistory(next)
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch { /* Search still works when storage is unavailable. */ }
    close()
    tool.open()
  }

  const list = <div className={`tool-search-results${mobile ? ' tool-search-fullscreen-results' : ''}`} role="listbox">
    {query.trim() ? <p>{matches.length} matching tools</p> : <p>{history.length ? 'Recent searches' : 'All tools'}</p>}
    {(query.trim() ? matches : history.length ? history.map(label => tools.find(tool => tool.label === label)).filter((tool): tool is ToolDestination => Boolean(tool)) : tools).map(tool => <button type="button" role="option" key={tool.label} onClick={() => openTool(tool)}>{tool.label}</button>)}
    {query.trim() && !matches.length && <p>Try “staff”, “stock”, “receipt” or “settings”.</p>}
  </div>

  return <div ref={container} className="tool-search">
    <label><Search size={17} aria-hidden="true"/><input ref={input} type="search" aria-label="Find a tool" aria-expanded={focused} placeholder="Find a tool…" value={query} onFocus={() => setFocused(true)} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); container.current?.querySelector<HTMLButtonElement>('.tool-search-results button')?.focus() } if (event.key === 'Enter' && query.trim() && matches.length === 1) { event.preventDefault(); openTool(matches[0]) } }} /></label>
    {focused && mobile && createPortal(<div className="tool-search-mobile-overlay"><div className="tool-search-mobile-top"><button type="button" aria-label="Back" onClick={close}><ArrowLeft size={21}/></button><div className="tool-search-mobile-field"><Search size={18} aria-hidden="true"/><input type="search" aria-label="Find a tool" placeholder="Find a tool…" autoFocus value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && query.trim() && matches.length === 1) openTool(matches[0]) }} /></div>{query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={20}/></button>}</div>{list}</div>, document.body)}
    {focused && !mobile && list}
  </div>
}
