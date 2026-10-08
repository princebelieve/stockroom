import { useState } from 'react'
import { EmptyScreen, ScreenPicker } from './EmptyScreen'
import { WorkspaceHelp } from './WorkspaceHelp'
import type { Sale } from './types'

type Workspace = { stock:boolean; productSales?:boolean; oil?:boolean; payments:boolean; fastFood:boolean; restaurant:boolean }
type SellingScreen = 'Oil' | 'POS' | 'Payments' | 'Counter' | 'Restaurant'
export function WorkspaceOverview({workspace,receipts,money,open,configure,hasProducts=true}:{configure?:(tab:'food'|'restaurant'|'products')=>void;hasProducts?:boolean;workspace:Workspace;headers:Record<string,string>;receipts:Sale[];money:(n:number)=>string;open:(screen:SellingScreen)=>void}) {
  const choices:{id:SellingScreen;label:string;action:string}[] = [
    ...(workspace.productSales?[{id:'POS' as const,label:'Product sales',action:'New sale'}]:[]),
    ...(workspace.oil?[{id:'Oil' as const,label:'Oil sales',action:'New oil sale'}]:[]),
    ...(workspace.payments?[{id:'Payments' as const,label:'Payments & receipts',action:'Record payment'}]:[]),
    ...(workspace.fastFood?[{id:'Counter' as const,label:'Order counter',action:'New order'}]:[]),
    ...(workspace.restaurant?[{id:'Restaurant' as const,label:'Tables & tabs',action:'Open tables & tabs'}]:[]),
  ]
  const [selected,setSelected] = useState('')
  const choice = choices.find(item=>item.id===selected) || choices[0]
  const needsProducts = choice && ['POS','Oil'].includes(choice.id) && !hasProducts
  const start = <button type="button" className="primary-button" onClick={()=>needsProducts&&configure?configure('products'):choice&&open(choice.id)}>{needsProducts&&configure?'Add your first product':choice?.action || 'Choose a workspace'}</button>
  return <section className="daily-screen" aria-label="Daily work">
    {choices.length>1 && <ScreenPicker value={choice?.id||''} options={choices} change={setSelected} label="Selling workspace" />}
    <WorkspaceHelp title="Starting your day"><p>Choose your selling screen to record a transaction. Add products or a food menu before your first sale. Previous payments are in Sales history; configuration is in Business settings.</p></WorkspaceHelp>
    {receipts.length===0 ? <EmptyScreen title="Ready for your first transaction" description={needsProducts?'Add products and opening stock, then start selling. Your saved transactions will appear in Sales history.':'Record your first sale or payment. Receipts and reports will build up as you use the app.'} action={choice?start:undefined} /> : <section className="daily-summary"><h2>Today</h2><strong>{money(receipts.filter(receipt=>new Date(receipt.createdAt).toDateString()===new Date().toDateString()).reduce((sum,receipt)=>sum+receipt.total,0))}</strong><p>Recorded payments today</p>{start}</section>}
  </section>
}