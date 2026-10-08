import { useEffect,useState } from 'react'
export function ReadingControls(){
 const [visible,setVisible]=useState(false)
 useEffect(()=>{const update=()=>setVisible(window.scrollY>500);window.addEventListener('scroll',update,{passive:true});return()=>window.removeEventListener('scroll',update)},[])
 return visible?<div className="reading-controls" aria-label="Page scrolling"><button type="button" onClick={()=>window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}>↑ Top</button><button type="button" onClick={()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}>↓ Bottom</button></div>:null
}
