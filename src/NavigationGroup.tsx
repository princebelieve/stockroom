import { Children, useEffect, useState, type ReactNode } from 'react'
export function NavigationGroup({title,children,current=false}:{title:string;children:ReactNode;current?:boolean}) {
  const [open,setOpen]=useState(current)
  useEffect(()=>{setOpen(current)},[current])
  if(!Children.toArray(children).some(child=>typeof child!=='string'||child.trim()))return null
  return <div className="navigation-group"><button type="button" className={`nav-item navigation-parent${current?' current':''}`} aria-expanded={open} onClick={()=>setOpen(!open)}>{title}<span aria-hidden="true">{open?'−':'+'}</span></button>{open&&<div className="sidebar-subnav">{children}</div>}</div>
}
