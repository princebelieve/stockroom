import { useRef, useState } from 'react'
import { Search } from 'lucide-react'
export type ToolDestination={label:string;open:()=>void}
export function ToolSearch({tools}:{tools:ToolDestination[]}) {
 const [query,setQuery]=useState('')
 const container=useRef<HTMLDivElement>(null)
 const matches=tools.filter(tool=>tool.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
 return <div ref={container} className="tool-search" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setQuery('')}}><label><Search size={17} aria-hidden="true"/><input type="search" aria-label="Find a tool" placeholder="Find a tool…" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape')setQuery('');if(event.key==='ArrowDown'){event.preventDefault();container.current?.querySelector<HTMLButtonElement>('.tool-search-results button')?.focus()}if(event.key==='Enter'&&query.trim()&&matches.length===1){event.preventDefault();matches[0].open();setQuery('')}}}/></label>{query.trim()&&<div className="tool-search-results"><p>{matches.length} matching tools</p>{matches.map(tool=><button type="button" key={tool.label} onClick={()=>{tool.open();setQuery('')}}>{tool.label}</button>)}{!matches.length&&<p>Try “staff”, “stock”, “receipt” or “settings”.</p>}</div>}</div>
}
