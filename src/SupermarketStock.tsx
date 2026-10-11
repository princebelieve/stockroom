import { WorkspaceHelp } from './WorkspaceHelp'
import { useEffect, useState } from 'react'
import type { Product } from './types'
import { posRequest } from './PosTools'
import { AsyncForm, SubmitButton } from './AsyncControls'

type StockData = { records:any[]; batches:{lots:any[];expired:any[];expiring:any[];costValue:number} }

export function SupermarketStock({headers,products,branchId,refresh,money}:{headers:Record<string,string>;products:Product[];branchId:string;refresh:()=>Promise<void>;money:(n:number)=>string}) {
  const [data,setData]=useState<StockData>({records:[],batches:{lots:[],expired:[],expiring:[],costValue:0}})
  const [error,setError]=useState(''),[productId,setProductId]=useState(''),[batchId,setBatchId]=useState('')
  const [task,setTask]=useState<'batch'|'product'|''>('')
  async function reload(){setData(await posRequest('/api/retail',headers))}
  useEffect(()=>{void reload().catch(caught=>setError(caught.message))},[branchId,headers.Authorization,products])
  const product=products.find(row=>row.id===productId),batch=data.batches.lots.find((row:any)=>row.id===batchId)
  async function save(input:any){setError('');try{await posRequest('/api/retail',headers,{id:crypto.randomUUID(),...input});await refresh();await reload();setTask('')}catch(caught){setError(caught instanceof Error?caught.message:'Could not save changes.');throw caught}}
  return <section className="panel full-panel stock-costs-screen">
    <div className="panel-heading"><div><h2>Stock costs &amp; expiry</h2></div><WorkspaceHelp title="Stock costs and expiry"><p>Expiry dates and batch labels are optional. Ordinary stock is tracked automatically. Opening stock keeps its catalogue cost until a delivery records a purchase cost.</p></WorkspaceHelp></div>
    {error&&<p role="alert">{error}</p>}
    <div className="stock-cost-metrics" aria-label="Stock cost and expiry summary">
      <div><span>Stock at purchase cost</span><strong>{money(data.batches.costValue)}</strong></div>
      <div><span>Tracked batches</span><strong>{data.batches.lots.length}</strong></div>
      <div className={data.batches.expiring.length?'attention':''}><span>Expiring in 30 days</span><strong>{data.batches.expiring.length}</strong></div>
      <div className={data.batches.expired.length?'danger':''}><span>Expired</span><strong>{data.batches.expired.length}</strong></div>
    </div>
    {data.batches.expired.length>0&&<p role="alert" className="stock-cost-alert">Expired batches cannot be sold. Record disposal in Purchasing.</p>}
    {data.batches.expiring.length>0&&<p role="status" className="stock-cost-alert">Review the batches expiring soon below.</p>}
    <div className="stock-cost-actions"><button type="button" className="filter-button" onClick={()=>setTask(task==='batch'?'':'batch')}>Correct batch or expiry</button><button type="button" className="filter-button" onClick={()=>setTask(task==='product'?'':'product')}>Edit product cost or price</button></div>
    {task==='batch'&&<section className="stock-cost-task" aria-label="Correct batch details"><h3>Correct batch details</h3><label>Batch<select aria-label="Batch" value={batchId} onChange={event=>setBatchId(event.target.value)}><option value="">Choose batch</option>{data.batches.lots.map((row:any)=><option key={row.id} value={row.id}>{row.productName} · {row.batch_number||'Unlabelled batch'}</option>)}</select></label>{batch&&<AsyncForm key={batchId} className="stock-cost-form" busyLabel="Saving batch…" onSubmit={event=>{const form=new FormData(event.currentTarget);return save({kind:'batch-update',batchId,batchNumber:form.get('batchNumber'),expiry:form.get('expiry'),reason:form.get('reason')})}}><label>Batch number<input name="batchNumber" maxLength={100} defaultValue={batch.batch_number}/></label><label>Expiry date<input name="expiry" type="date" defaultValue={batch.expiry}/></label><label>Reason<input name="reason" required maxLength={200} placeholder="Why is this correction needed?"/></label><SubmitButton className="primary-button">Save batch</SubmitButton></AsyncForm>}</section>}
    {task==='product'&&<section className="stock-cost-task" aria-label="Edit product cost or price"><h3>Edit product cost or price</h3><label>Product<select aria-label="Pricing product" value={productId} onChange={event=>setProductId(event.target.value)}><option value="">Choose product</option>{products.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>{product&&<AsyncForm key={`${productId}:${product.updated}`} className="stock-cost-form" busyLabel="Saving product…" onSubmit={event=>{const form=new FormData(event.currentTarget);return save({kind:'pricing',productId,expectedUpdatedAt:product.updated,price:form.get('price'),cost:form.get('cost'),barcode:form.get('barcode'),reason:form.get('reason')})}}><label>Selling price<input name="price" type="number" min="0" step="0.01" required defaultValue={product.price}/></label><label>Cost for opening / adjusted stock<input name="cost" type="number" min="0" step="0.01" required defaultValue={product.cost||0}/></label><label>Barcode<input name="barcode" maxLength={100} defaultValue={product.barcode||''}/></label><label>Reason<input name="reason" required maxLength={200} placeholder="Why is this changing?"/></label><SubmitButton className="primary-button">Save product changes</SubmitButton></AsyncForm>}</section>}
    <section className="stock-batch-list"><h3>Batch stock</h3>{data.batches.lots.length?<div className="table-wrap"><table><thead><tr><th>Product</th><th>Batch</th><th>Expiry</th><th>Stock</th><th>Cost per unit</th></tr></thead><tbody>{data.batches.lots.map((row:any)=><tr key={`${row.id}:${row.branch_id}`}><td>{row.productName}</td><td>{row.batch_number||'Unlabelled'}</td><td>{row.expiry||'—'}{row.expiry&&row.expiry<new Date().toISOString().slice(0,10)&&<span className="table-subtext">Expired</span>}</td><td>{row.quantity} {row.unit}</td><td>{money(row.unit_cost)}</td></tr>)}</tbody></table></div>:<p className="muted">No delivery batches recorded yet.</p>}</section>
    <details className="stock-cost-history"><summary>Correction history</summary>{data.records.filter((row:any)=>['pricing','batch-update'].includes(row.kind)).length?data.records.filter((row:any)=>['pricing','batch-update'].includes(row.kind)).map((row:any)=><p key={row.id}>{new Date(row.createdAt).toLocaleString()} · {row.staffName} · {products.find(product=>product.id===row.productId)?.name||'Batch'} · {row.kind==='pricing'?`${money(row.before.price)} → ${money(row.price)}`:`${row.before.expiry||'No expiry'} → ${row.expiry||'No expiry'}`} · {row.reason}</p>):<p>No corrections recorded.</p>}</details>
  </section>
}
