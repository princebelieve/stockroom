import { SupportContacts } from './SupportContacts'
import { useEffect, useRef } from 'react'
export function HelpMenu({guide,headers,scope}:{guide?:()=>void;headers?:Record<string,string>;scope?:string}){
 const menu=useRef<HTMLDetailsElement>(null)
 useEffect(()=>{const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&menu.current)menu.current.open=false};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&menu.current?.open){menu.current.open=false;menu.current.querySelector('summary')?.focus()}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}},[])
 return <details ref={menu} className="help-menu"><summary>Help &amp; support</summary><div className="help-menu-panel">{guide&&<button type="button" className="filter-button" onClick={()=>{if(menu.current)menu.current.open=false;guide()}}>Open the user guide</button>}<SupportContacts headers={headers} scope={scope}/></div></details>
}
