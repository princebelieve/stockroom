import { CircleHelp } from 'lucide-react'
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Topic = { title:string; children:ReactNode; marker:HTMLSpanElement|null }
type Registry = { register:(id:string,topic:React.RefObject<Topic>)=>()=>void; open:(screenTopic?:Pick<Topic,'title'|'children'>)=>void }
const HelpContext=createContext<Registry|null>(null)

export function WorkspaceHelpProvider({children}:{children:ReactNode}) {
  const registry=useRef(new Map<string,React.RefObject<Topic>>())
  const dialog=useRef<HTMLDialogElement>(null)
  const [topics,setTopics]=useState<Topic[]>([])
  const context=useMemo<Registry>(()=>({
    register(id,topic){registry.current.set(id,topic);return()=>{registry.current.delete(id)}},
    open(screenTopic){
      const visible=[...registry.current.values()].map(item=>item.current).filter(topic=>{
        const parent=topic.marker?.parentElement
        return parent && !parent.closest('[hidden]') && parent.getClientRects().length>0
      })
      if(screenTopic)visible.push({...screenTopic,marker:null})
      setTopics(visible);dialog.current?.showModal()
    },
  }),[])
  return <HelpContext.Provider value={context}>{children}{createPortal(<dialog ref={dialog} className="workspace-tutorial" aria-labelledby="screen-help-title" onClick={event=>{if(event.target===event.currentTarget)dialog.current?.close()}}><header><h2 id="screen-help-title">Help for this screen</h2><button type="button" className="filter-button" aria-label="Close screen help" onClick={()=>dialog.current?.close()}>Close</button></header><div className="tutorial-content">{topics.length?topics.map((topic,index)=><details key={index} open={index===topics.length-1}><summary>{topic.title}</summary>{topic.children}</details>):<p>Open the user guide for setup and workflow help.</p>}</div></dialog>,document.body)}</HelpContext.Provider>
}

export function useScreenHelp(){return useContext(HelpContext)?.open}

export function WorkspaceHelp({children,title='How this screen works'}:{children:ReactNode;title?:string}) {
  const context=useContext(HelpContext)
  const id=useId()
  const marker=useRef<HTMLSpanElement>(null)
  const topic=useRef<Topic>({title,children,marker:null})
  topic.current={title,children,marker:marker.current}
  useEffect(()=>{topic.current.marker=marker.current;return context?.register(id,topic)},[context,id])
  const dialog=useRef<HTMLDialogElement>(null)
  if(context)return <span hidden ref={marker}/>
  return <div className="workspace-help"><button type="button" className="tutorial-trigger" aria-label={`Help: ${title}`} onClick={()=>dialog.current?.showModal()}><CircleHelp size={17}/></button>{createPortal(<dialog ref={dialog} className="workspace-tutorial" aria-label={title}><header><h2>{title}</h2><button type="button" onClick={()=>dialog.current?.close()}>Close</button></header>{children}</dialog>,document.body)}</div>
}
