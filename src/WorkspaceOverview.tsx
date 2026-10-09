import { useEffect, useState } from 'react'
import { posRequest } from './PosTools'
import { restaurantBillLines } from '../server/restaurant-payments.mjs'
import { EmptyScreen, ScreenPicker } from './EmptyScreen'
import type { Sale } from './types'

type Workspace = { stock:boolean; productSales?:boolean; oil?:boolean; payments:boolean; fastFood:boolean; restaurant:boolean }
type SellingScreen = 'Oil' | 'POS' | 'Payments' | 'Counter' | 'Restaurant'
export function WorkspaceOverview({workspace,headers,receipts,money,open,configure,openRecords,openCustomers,openExpenses,scanProducts,readProductList,hasProducts=true,timeZone='UTC'}:{configure?:(tab:'food'|'restaurant'|'products'|'starters'|'import'|'handwritten')=>void;openRecords?:()=>void;openCustomers?:()=>void;openExpenses?:()=>void;scanProducts?:()=>void;readProductList?:()=>void;hasProducts?:boolean;timeZone?:string;workspace:Workspace;headers:Record<string,string>;receipts:Sale[];money:(n:number)=>string;open:(screen:SellingScreen)=>void}) {
  const choices:{id:SellingScreen;label:string;action:string}[] = [
    ...(workspace.productSales?[{id:'POS' as const,label:'Product sales',action:'New sale'}]:[]),
    ...(workspace.oil?[{id:'Oil' as const,label:'Oil sales',action:'New oil sale'}]:[]),
    ...(workspace.payments?[{id:'Payments' as const,label:'Payments & receipts',action:'Record payment'}]:[]),
    ...(workspace.fastFood?[{id:'Counter' as const,label:'Order counter',action:'New order'}]:[]),
    ...(workspace.restaurant?[{id:'Restaurant' as const,label:'Tables & tabs',action:'Open tables & tabs'}]:[]),
  ]
  const [selected,setSelected] = useState('')
  const choice = choices.find(item=>item.id===selected) || choices[0]
  const kind=(sale:Sale)=>sale.paymentDetails?.restaurantBill||sale.paymentDetails?.counterOrder?.tableService?'Restaurant':sale.paymentDetails?.counterOrder?'Counter':sale.paymentDetails?.servicePayment?'Payments':sale.paymentDetails?.pos?.workspace==='oil'?'Oil':'POS'
  const workspaceReceipts=receipts.filter(receipt=>kind(receipt)===choice?.id)
  const day=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'})
  const today=day.format(new Date())
  const totalToday=workspaceReceipts.filter(receipt=>day.format(new Date(receipt.createdAt))===today).reduce((sum,receipt)=>sum+receipt.total,0)
  const [live,setLive]=useState<{count:number;description:string}|null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{
    let cancelled=false
    setLive(null);setError('')
    async function load(){
      let result:{count:number;description:string}|null=null
      if(choice?.id==='Counter'){
        const data=await posRequest('/api/pos/counter',headers)
        const orders=data.orders.filter((order:any)=>!['collected','cancelled'].includes(order.status))
        result={count:orders.length,description:`${orders.length} active orders · ${orders.filter((order:any)=>!order.receiptId).length} awaiting payment`}
      }else if(choice?.id==='Restaurant'){
        const data=await posRequest('/api/pos/restaurant',headers)
        const bills=data.tabs.filter((bill:any)=>bill.status==='open'&&!bill.mergedInto)
        const due=bills.reduce((total:number,bill:any)=>total+restaurantBillLines(bill,data.orders,data.receipts).reduce((sum:number,line:any)=>sum+line.remainingAmount,0),0)
        result={count:bills.length,description:`${bills.length} open bills · ${money(due)} awaiting payment`}
      }else if(choice?.id==='Payments'){
        const data=await posRequest('/api/pos/service-jobs',headers)
        const jobs=data.jobs.filter((job:any)=>!['estimate','cancelled'].includes(job.status)&&job.balance.due>0)
        result={count:jobs.length,description:`${jobs.length} unpaid invoices · ${money(jobs.reduce((sum:number,job:any)=>sum+job.balance.due,0))} due`}
      }
      if(!cancelled)setLive(result)
    }
    void load().catch(()=>{if(!cancelled)setError('Could not load current work. Open the selling screen to check your orders or invoices.')})
    return()=>{cancelled=true}
  },[choice?.id,headers.Authorization,headers['x-stockroom-branch']])
  const needsProducts = choice && ['POS','Oil'].includes(choice.id) && !hasProducts
  const start = <button type="button" className="primary-button" onClick={()=>needsProducts&&configure?configure('products'):choice&&open(choice.id)}>{needsProducts&&configure?'Add your first product':choice?.action || 'Choose a workspace'}</button>
  const history = openRecords&&<button type="button" className="filter-button" onClick={openRecords}>View earlier sales</button>
  return <section className="daily-screen" aria-label="Daily work">
    {choices.length>1 && <ScreenPicker value={choice?.id||''} options={choices} change={setSelected} label="Selling workspace" />}
    {live && live.count>0 && <p role="status">{live.description}</p>}
    {error && <p role="alert">{error}</p>}
    {workspaceReceipts.length===0 && !live?.count ? <EmptyScreen title={needsProducts?'Start with your products':'Ready for your first transaction'} description={needsProducts?'Add products one at a time, use a starter list or import a spreadsheet. You can begin with what you have and fill in the rest later.':'Record your first sale or payment. Receipts and reports will build up as you use the app.'} action={choice?start:undefined} /> : <section className="daily-summary"><h2>Today</h2><strong>{money(totalToday)}</strong><p>Recorded payments today</p>{start}</section>}
    <nav className="overview-shortcuts" aria-label="Related records">
      {history}
      {workspace.stock&&configure&&<button type="button" className="filter-button" onClick={()=>configure('products')}>Products</button>}
      {openCustomers&&<button type="button" className="filter-button" onClick={openCustomers}>Customers</button>}
      {openExpenses&&<button type="button" className="filter-button" onClick={openExpenses}>Expenses</button>}
    </nav>
    {!hasProducts&&workspace.stock&&configure&&<section className="overview-start-options" aria-label="Ways to start your product catalogue"><h2>Bring in your products</h2><p>No file from your old app? Start with a few products, scan items as you need them, or choose starter items. Import a spreadsheet if you can export one.</p><div><button type="button" className="filter-button" onClick={()=>configure('starters')}>Use starter items</button><button type="button" className="filter-button" onClick={()=>configure('import')}>Import a spreadsheet</button>{scanProducts&&<button type="button" className="filter-button" onClick={scanProducts}>Scan a product</button>}{readProductList&&<button type="button" className="filter-button" onClick={readProductList}>Read a product list</button>}</div></section>}
  </section>
}
