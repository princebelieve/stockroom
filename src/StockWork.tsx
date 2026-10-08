import { WorkspaceHelp } from './WorkspaceHelp'
import { lazy, Suspense, useEffect, useState } from 'react'
import { AsyncButton, AsyncForm, SubmitButton } from './AsyncControls'
import { posRequest } from './PosTools'
import type { Product } from './types'
const Purchasing=lazy(()=>import('./Purchasing').then(module=>({default:module.Purchasing})))

type Ingredient = { productId: string; quantity: string }
type Draft = { id: string; note: string; ingredients: Ingredient[]; outputProductId: string; outputQuantity: string; expectedQuantity: string; expiry: string }
const fresh = (): Draft => ({id:'stock-work:'+crypto.randomUUID(),note:'',ingredients:[{productId:'',quantity:''}],outputProductId:'',outputQuantity:'',expectedQuantity:'',expiry:''})

export function StockWork({headers,storageKey,money,job,refresh}: {
  headers:Record<string,string>;storageKey:string;money:(value:number)=>string;
  job?:{id:string;title:string;status:string};refresh?:()=>Promise<void>
}) {
  const key=storageKey+':stock-work:'+(job?.id||'production')
  const [draft,setDraft]=useState<Draft>(()=>{try{return {...fresh(),...JSON.parse(localStorage.getItem(key)||'{}')}}catch{return fresh()}})
  const [products,setProducts]=useState<Product[]>([]),[records,setRecords]=useState<any[]>([])
  const [review,setReview]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
  const [purchasing,setPurchasing]=useState(false)
  const [saving,setSaving]=useState(false)
  async function reload() {
    const [stock,work]=await Promise.all([posRequest('/api/products',headers),posRequest('/api/pos/stock-work',headers)])
    setProducts(stock.products||[]);setRecords(work.records||[])
  }
  useEffect(()=>{let live=true;const load=()=>{void Promise.all([posRequest('/api/products',headers),posRequest('/api/pos/stock-work',headers)]).then(([stock,work])=>{if(live){setProducts(stock.products||[]);setRecords(work.records||[])}}).catch(e=>{if(live)setError(e.message)})};load();window.addEventListener('stockroom-data-refreshed',load);return()=>{live=false;window.removeEventListener('stockroom-data-refreshed',load)}},[headers.Authorization,headers['X-Stockroom-Branch']])
  useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(draft))}catch{setError('This stock work draft could not be saved. Keep the screen open.')}},[draft,key])
  const visible=records.filter(row=>job?row.kind==='service-materials'&&row.jobId===job.id:row.kind==='food-production')
  const estimated=draft.ingredients.reduce((sum,row)=>sum+Number(row.quantity||0)*(products.find(product=>product.id===row.productId)?.cost||0),0)
  const rows=(patch:Partial<Ingredient>,index:number)=>setDraft({...draft,ingredients:draft.ingredients.map((row,i)=>i===index?{...row,...patch}:row)})
  return <section className="panel stock-work"><h3>{job?'Job materials and costs':'Food batch production'}</h3>
    <p>{job?'Record paper, ink or other stock actually used for this job. Materials reduce stock and estimated profit when used, even if the job is later refunded. Customer payment does not consume materials.':'Record ingredients actually used and the finished units produced. Ingredient cost moves into the finished stock batch. It becomes a cost when that stock is sold, prepared or written off.'}</p>
    {!job&&<WorkspaceHelp title="Production and stock use"><p>Create a separate finished product below, then link it in Menu using Stocked goods. For a recipe assembled to order, use the finished product as its ingredient. Use either raw ingredients or finished stock for the same portion to avoid consuming both.</p></WorkspaceHelp>}
    {job&&<p>Total recorded material cost for this job: <strong>{money(visible.reduce((n,row)=>n+row.totalCost,0))}</strong>. This excludes labour, overheads and any materials not recorded.</p>}
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    {!review?<AsyncForm className="settings-form" onSubmit={async()=>{setError('');setReview(true)}}>
      <label>Work reference / reason<input required maxLength={200} value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/></label>
      {draft.ingredients.map((row,index)=><fieldset key={index}><legend>{job?'Material':'Ingredient'} {index+1}</legend>
        <label>Stock used<select aria-label="Stock used" required value={row.productId} onChange={e=>rows({productId:e.target.value},index)}><option value="">Choose stock</option>{products.map(product=><option key={product.id} value={product.id}>{product.name} / {product.stock} {product.unit} available</option>)}</select></label>
        <label>Actual quantity used<input required type="number" min="0.001" step="0.001" value={row.quantity} onChange={e=>rows({quantity:e.target.value},index)}/></label>
        {draft.ingredients.length>1&&<button type="button" className="filter-button" onClick={()=>setDraft({...draft,ingredients:draft.ingredients.filter((_,i)=>i!==index)})}>Remove stock line</button>}
      </fieldset>)}
      <button type="button" className="filter-button" disabled={draft.ingredients.length>=50} onClick={()=>setDraft({...draft,ingredients:[...draft.ingredients,{productId:'',quantity:''}]})}>Add stock line</button>
      {!job&&<><label>Finished stock product<select aria-label="Finished stock product" required value={draft.outputProductId} onChange={e=>setDraft({...draft,outputProductId:e.target.value})}><option value="">Choose finished product</option>{products.filter(product=>!draft.ingredients.some(row=>row.productId===product.id)).map(product=><option key={product.id} value={product.id}>{product.name} / {product.unit}</option>)}</select></label>
        <label>Expected finished quantity<input required type="number" min="0.001" step="0.001" value={draft.expectedQuantity} onChange={e=>setDraft({...draft,expectedQuantity:e.target.value})}/></label>
        <label>Actual usable finished quantity<input required type="number" min="0.001" step="0.001" value={draft.outputQuantity} onChange={e=>setDraft({...draft,outputQuantity:e.target.value})}/></label>
        <label>Finished batch expiry (optional)<input type="date" value={draft.expiry} onChange={e=>setDraft({...draft,expiry:e.target.value})}/></label>
        <p>Yield difference: {Number(draft.outputQuantity||0)-Number(draft.expectedQuantity||0)}. All ingredient cost is allocated to usable output. If the whole batch failed, record the ingredients through stock wastage.</p></>}
      <p>Estimated stock cost: {money(estimated)}. Saving captures the actual batches used. Labour and other running costs belong in Expenses.</p>
      <SubmitButton className="primary-button" disabled={Boolean(job&&['estimate','cancelled'].includes(job.status))}>Review stock changes</SubmitButton>
    </AsyncForm>:<section className="account-delete-dialog" role="region" aria-label="Confirm stock work">
      <h4>Confirm physical stock changes</h4><p>{draft.note}</p>
      {draft.ingredients.map(row=><p key={row.productId}>Consume {row.quantity} {products.find(product=>product.id===row.productId)?.unit}: {products.find(product=>product.id===row.productId)?.name}</p>)}
      {!job&&<p>Produce {draft.outputQuantity}: {products.find(product=>product.id===draft.outputProductId)?.name}. Expected: {draft.expectedQuantity}.</p>}
      <WorkspaceHelp title="Production and stock use"><p>Confirm only after the work happened. Saving permanently records these stock movements. Refunds and cancelled jobs do not put used materials back.</p></WorkspaceHelp>
      <button type="button" className="filter-button" disabled={saving} onClick={()=>setReview(false)}>Cancel</button>
      <AsyncButton className="closure-confirm" busyLabel="Recording stock..." onClick={async()=>{
        setSaving(true)
        try {
        const result=await posRequest('/api/pos/stock-work',headers,{...draft,kind:job?'service-materials':'food-production',...(job?{jobId:job.id}:{}),ingredients:draft.ingredients.map(row=>({...row,quantity:Number(row.quantity)})),outputQuantity:Number(draft.outputQuantity),expectedQuantity:Number(draft.expectedQuantity)})
        setDraft(fresh());setReview(false);setMessage(`Stock work saved. Captured material cost: ${money(result.totalCost)}.`)
        window.dispatchEvent(new Event('stockroom-data-refreshed'));await reload();await refresh?.()
        }finally{setSaving(false)}
      }}>Confirm stock changes</AsyncButton>
    </section>}
    <details><summary>{job?'Add material stock':'Add ingredient or finished product'}</summary><WorkspaceHelp title="Production and stock use"><p>Use consistent stock units. Opening stock uses the purchase cost entered here. Use Purchasing for later supplier receipts, costs and expiry dates.</p></WorkspaceHelp>
      <AsyncForm className="settings-form" onSubmit={async event=>{const form=event.currentTarget,data=new FormData(form);await posRequest('/api/products',headers,{name:data.get('name'),sku:'WORK-'+crypto.randomUUID(),category:job?'Service materials':'Food production',unit:data.get('unit'),cost:Number(data.get('cost')),price:Number(data.get('price')),stock:Number(data.get('stock')),reorder:0});form.reset();await reload();await refresh?.();window.dispatchEvent(new Event('stockroom-data-refreshed'));setMessage('Stock product added.') }}>
        <label>Stock product name<input name="name" required maxLength={100}/></label><label>Stock unit<input name="unit" required maxLength={20} placeholder="piece, sheet, kg, litre"/></label><label>Purchase cost per unit<input name="cost" required type="number" min="0" step="0.01" defaultValue="0"/></label><label>Selling price per unit<input name="price" required type="number" min="0" step="0.01" defaultValue="0"/></label><label>Opening quantity<input name="stock" required type="number" min="0" step="0.001" defaultValue="0"/></label><SubmitButton className="filter-button">Add stock product</SubmitButton>
      </AsyncForm>
    </details>
    <button type="button" className="filter-button" aria-expanded={purchasing} onClick={()=>setPurchasing(!purchasing)}>Purchasing and wastage</button>
    {purchasing&&<Suspense fallback={<p>Loading purchasing...</p>}><Purchasing headers={headers} products={products} businessId={storageKey} branchId={headers['X-Stockroom-Branch']||'main'} refresh={async()=>{await reload();await refresh?.();window.dispatchEvent(new Event('stockroom-data-refreshed'))}}/></Suspense>}
    <h4>{job?'Material use history':'Production history'}</h4>
    {visible.length?visible.map(row=><div className="customer-row" key={row.id}><div><strong>{row.note} / {money(row.totalCost)}</strong><small>{new Date(row.updatedAt).toLocaleString()} / {row.staffName}</small>{row.ingredients.map((item:any)=><p key={item.productId}>{item.name}: {item.quantity} {item.unit} / {money(item.quantity*item.unitCost)}</p>)}{row.ingredients.some((item:any)=>!item.unitCost)&&<p role="alert">Some used stock has zero cost. Review purchase costs before relying on profit.</p>}{row.output&&<p>{row.output.name}: {row.output.quantity} {row.output.unit} produced / Expected {row.output.expectedQuantity} / Cost per unit {money(row.output.unitCost)}{row.output.expiry&&' / Expires '+row.output.expiry}</p>}</div>{!job&&<button type="button" className="filter-button" disabled={review} onClick={()=>{setDraft({...fresh(),note:row.note,ingredients:row.ingredients.map((item:any)=>({productId:item.productId,quantity:String(item.quantity)})),outputProductId:row.output.productId,outputQuantity:String(row.output.quantity),expectedQuantity:String(row.output.expectedQuantity)});setMessage('Previous batch copied. Review actual ingredients, yield and expiry for this new batch.')}}>Use for new batch</button>}</div>):<p>No stock work recorded.</p>}
  </section>
}
