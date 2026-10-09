import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { createPortal } from 'react-dom'
export type ToolDestination={label:string;open:()=>void}
export function ToolSearch({tools}:{tools:ToolDestination[]}) {
 const [query,setQuery]=useState('')
 const container=useRef<HTMLDivElement>(null)
 const results=useRef<HTMLDivElement>(null)
 const [placement,setPlacement]=useState<{top:number;left:number;width:number}>({top:0,left:0,width:0})
 const matches=tools.filter(tool=>tool.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
 useEffect(()=>{
  if(!query.trim())return
  const place=()=>{
   const field=container.current?.querySelector('label')
   if(!field)return
   const rect=field.getBoundingClientRect()
   const sidebar=container.current?.closest('.sidebar')?.getBoundingClientRect()
   const width=Math.min(340,Math.max(220,window.innerWidth-24))
   let left=Math.max(12,(sidebar?.right??rect.right)+8)
   if(left+width>window.innerWidth-12)left=Math.max(12,window.innerWidth-width-12)
   const maxHeight=Math.min(360,window.innerHeight-24)
   setPlacement({top:Math.max(12,Math.min(rect.top,window.innerHeight-maxHeight-12)),left,width:Math.min(width,window.innerWidth-left-12)})
  }
  place()
  window.addEventListener('resize',place)
  window.addEventListener('scroll',place,true)
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true)}
 },[query])
 return <div ref={container} className="tool-search" onBlur={event=>{const next=event.relatedTarget as Node|null;if(!container.current?.contains(next)&&!results.current?.contains(next))setQuery('')}}><label><Search size={17} aria-hidden="true"/><input type="search" aria-label="Find a tool" placeholder="Find a tool…" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape')setQuery('');if(event.key==='ArrowDown'){event.preventDefault();results.current?.querySelector<HTMLButtonElement>('button')?.focus()}if(event.key==='Enter'&&query.trim()&&matches.length===1){event.preventDefault();matches[0].open();setQuery('')}}}/></label>{query.trim()&&createPortal(<div ref={results} className="tool-search-results" style={{position:'fixed',top:placement.top,left:placement.left,width:placement.width}} onBlur={event=>{const next=event.relatedTarget as Node|null;if(!results.current?.contains(next)&&!container.current?.contains(next))setQuery('')}}><p>{matches.length} matching tools</p>{matches.map(tool=><button type="button" key={tool.label} onClick={()=>{tool.open();setQuery('')}}>{tool.label}</button>)}{!matches.length&&<p>Try “staff”, “stock”, “receipt” or “settings”.</p>}</div>,document.body)}</div>
}
