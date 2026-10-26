import { SupportContacts } from './SupportContacts'
import { useScreenHelp } from './WorkspaceHelp'
import { useEffect, useRef, useState } from 'react'
import { MessageCircle } from 'lucide-react'
type HelpDestination = { question?: RegExp; title: string; answer: string; screen: string; section?: string }
const navigationHelp: HelpDestination[] = [
 {question:/receipt|reprint|print.*sale/i,title:'Receipt history',answer:'Open Sales → Receipt history. Search by receipt number, product, cashier or payment reference, then choose Reprint receipt. Reprinting does not create another sale.',screen:'Sales',section:'sales-receipt-history'},
 {question:/barcode|scanner|scan product/i,title:'Barcode scanner setup',answer:'Open Printers & devices → Barcode scanner. A USB scanner usually works as a keyboard: pair it in Windows, choose keyboard/HID mode, and set the same Enter or Tab terminator in the app and scanner.',screen:'Device'},
 {question:/printer|print.*setup|receipt.*printer/i,title:'Printer setup',answer:'Open Printers & devices on the checkout device. Windows printers need their Windows driver installed first; then select the installed printer queue in Stockroom.',screen:'Device'},
 {question:/product|inventory|stock item/i,title:'Products',answer:'Open Inventory → Products to search, add, or edit products. Stock received from a supplier should be recorded in Purchasing so the stock movement is tracked.',screen:'Inventory',section:'products'},
 {question:/staff|employee|cashier|permission/i,title:'Staff & access',answer:'Open Team → Team members to manage staff accounts and roles. Use Access permissions to control which screens and operations each person can use.',screen:'Team',section:'team-members'},
 {question:/help|guide|how do i/i,title:'User guide',answer:'Open the user guide for step-by-step help, or ask a specific question here and I’ll suggest a screen to open.',screen:'Guide'},
]
function contextualQuestion(topic?:{title:string;description:string}) {
 const title=(topic?.title||'').toLowerCase()
 if(/receipt|payment history/.test(title))return 'How can I reprint a receipt?'
 if(/device|printer|scanner/.test(title))return 'How do I set up a barcode scanner?'
 if(/inventory|product|stock|purchas/.test(title))return 'How do I add a product?'
 if(/staff|team|access/.test(title))return 'Where do I manage staff access?'
 if(/sales|transaction/.test(title))return 'Where can I find a saved receipt?'
 if(/payment/.test(title))return 'Where can I find a payment receipt?'
 return 'How do I find a screen in Stockroom?'
}
function SupportNavigationHelp({navigate,topic}:{navigate:(screen:string,section?:string)=>void;topic?:{title:string;description:string}}) {
 const [question,setQuestion]=useState(''),[answer,setAnswer]=useState<HelpDestination|null>(null)
 function ask(value=question){
  const match=navigationHelp.find(item=>item.question?.test(value.trim()))
  setQuestion(value);setAnswer(match||{title:'Try another question',answer:'I can help with receipts, barcode scanners, printers, products and staff access. Try one of those topics or open the user guide.',screen:'Guide'})
 }
 const example=contextualQuestion(topic)
 return <section className="help-navigation-assistant" aria-label="Navigation help"><h2>Where can I help you?</h2><p>Ask in your own words. I’ll explain the steps and help you open the right screen.</p><form onSubmit={event=>{event.preventDefault();ask()}}><label htmlFor="help-navigation-question">What are you looking for?</label><input id="help-navigation-question" value={question} onChange={event=>setQuestion(event.target.value)} placeholder="How can I reprint a receipt?" maxLength={200}/><button className="primary-button" type="submit" disabled={!question.trim()}>Ask</button></form><button type="button" className="text-button help-navigation-suggestion" onClick={()=>setQuestion(example)}>Example for this screen: “{example}”</button>{answer&&<div className="help-navigation-answer" role="status"><strong>{answer.title}</strong><p>{answer.answer}</p><button type="button" className="filter-button" onClick={()=>navigate(answer.screen,answer.section)}>Open {answer.title}</button></div>}</section>
}
export function HelpMenu({guide,headers,scope,className,screenHelpTopic,navigate}:{guide?:()=>void;headers?:Record<string,string>;scope?:string;className?:string;screenHelpTopic?:{title:string;description:string};navigate?:(screen:string,section?:string)=>void}){
 const menu=useRef<HTMLDetailsElement>(null)
 const [proactiveSuggestion,setProactiveSuggestion]=useState(false)
 const screenHelp=useScreenHelp()
 useEffect(()=>{
  if(!scope||!navigate)return
  const key=`stockroom-help-suggestion:${scope}`
  try { if(Date.now()-Number(localStorage.getItem(key)||0)<7*24*60*60*1000)return } catch { return }
  let timer:number|undefined
  const schedule=()=>{if(timer)window.clearTimeout(timer);setProactiveSuggestion(false);if(document.visibilityState!=='visible')return;timer=window.setTimeout(()=>{if(document.visibilityState!=='visible'||menu.current?.open)return;try{localStorage.setItem(key,String(Date.now()))}catch{};setProactiveSuggestion(true)},60_000)}
  const onVisibility=()=>schedule()
  document.addEventListener('pointerdown',schedule);document.addEventListener('keydown',schedule);document.addEventListener('scroll',schedule,true);document.addEventListener('visibilitychange',onVisibility);schedule()
  return()=>{if(timer)window.clearTimeout(timer);document.removeEventListener('pointerdown',schedule);document.removeEventListener('keydown',schedule);document.removeEventListener('scroll',schedule,true);document.removeEventListener('visibilitychange',onVisibility)}
 },[scope,Boolean(navigate),screenHelpTopic?.title])
 useEffect(()=>{const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&menu.current)menu.current.open=false};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&menu.current?.open){menu.current.open=false;menu.current.querySelector('summary')?.focus()}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}},[])
 return <details ref={menu} className={`help-menu${className?` ${className}`:''}`} onToggle={()=>setProactiveSuggestion(false)}><summary aria-label={proactiveSuggestion?'Are you looking for something? I can help you find it.':'Help and support'} title={proactiveSuggestion?'Are you looking for something? I can help you find it.':'Help and support'} data-suggesting={proactiveSuggestion}><MessageCircle size={18} aria-hidden="true"/>Help &amp; support</summary><div className="help-menu-panel">{screenHelp&&<button type="button" className="filter-button" onClick={()=>{if(menu.current)menu.current.open=false;screenHelp(screenHelpTopic?{title:screenHelpTopic.title,children:<p>{screenHelpTopic.description}</p>}:undefined)}}>Help for this screen</button>}{guide&&<button type="button" className="filter-button" onClick={()=>{if(menu.current)menu.current.open=false;guide()}}>Open the user guide</button>}{navigate&&<SupportNavigationHelp topic={screenHelpTopic} navigate={(screen,section)=>{if(menu.current)menu.current.open=false;navigate(screen,section)}}/>}<SupportContacts headers={headers} scope={scope}/></div></details>
}
