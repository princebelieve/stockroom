import { SupportContacts } from './SupportContacts'
import { useState } from 'react'
import { BookOpen, Download, Search } from 'lucide-react'
import chapters from './user-guide.json'

export function UserGuide({ role, headers, scope }: { role: string; headers?: Record<string,string>; scope?: string }) {
  const visibleChapters = chapters.filter(chapter => role === 'owner' || chapter.id !== 'section-33')
  const [query,setQuery]=useState(''),[topic,setTopic]=useState(chapters[0].id)
  const matches=visibleChapters.filter(chapter=>[chapter.title,...chapter.steps,chapter.note].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
  const current=matches.find(chapter=>chapter.id===topic)||matches[0]
  function download(){
    const text=visibleChapters.map(chapter=>chapter.title+'\n\n'+chapter.steps.map((step,index)=>(index+1)+'. '+step).join('\n')+'\n\nRemember: '+chapter.note).join('\n\n')
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}))
    const link=document.createElement('a');link.href=url;link.download='Stockroom-user-guide.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  return <section className="user-guide"><div className="panel guide-header"><h2><BookOpen size={22} aria-hidden="true"/> Owner and cashier guide</h2><p>Follow one topic at a time. Screens depend on your role, workspace and device.</p><button type="button" className="filter-button" onClick={download}><Download size={17} aria-hidden="true"/> Download full guide</button><label className="guide-search"><Search size={18} aria-hidden="true"/><span className="sr-only">Search guide</span><input type="search" placeholder="Search: setup, POS, receipt, recipe..." value={query} onChange={event=>setQuery(event.target.value)}/></label><label htmlFor="guide-topic">Guide topic</label><select id="guide-topic" value={current?.id||''} onChange={event=>setTopic(event.target.value)}>{matches.map(chapter=><option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></div>{current?<article className="panel guide-chapter"><h2>{current.title}</h2><ol>{current.steps.map((step,index)=><li key={index}>{step}</li>)}</ol>{current.note&&<aside className="guide-note"><strong>Remember</strong><p>{current.note}</p></aside>}</article>:<p role="status">No matching topics. Try a shorter search.</p>}<SupportContacts headers={headers} scope={scope} /></section>
}
