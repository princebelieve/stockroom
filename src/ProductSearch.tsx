import { useState } from 'react'
import { Search, ScanLine } from 'lucide-react'
import { AsyncButton } from './AsyncControls'
import type { Product } from './types'
import type { ProductDraft } from './lib/productIntake'

export function ProductSearch({products,add,open,scan}:{products:Product[];add:(draft?:ProductDraft)=>void;open:(product:Product)=>void;scan:()=>Promise<string|undefined>}) {
  const [query,setQuery]=useState('')
  const [missing,setMissing]=useState('')
  const matches=query.trim()?products.filter(product=>[product.name,product.barcode,product.sku].some(value=>value?.toLowerCase().includes(query.trim().toLowerCase()))).slice(0,30):[]
  return <section className="panel product-search"><h2>Add or search product</h2><label><Search size={18}/><span className="sr-only">Search products to add or edit</span><input type="search" value={query} placeholder="Product name or barcode" onChange={event=>setQuery(event.target.value)}/></label>{matches.map(product=><button type="button" className="product-search-result" key={product.id} onClick={()=>open(product)}>{product.name}<small>{product.barcode || product.sku}</small></button>)}{query.trim()&&!matches.length&&<p role="status">No matching product</p>}<div className="product-search-actions"><button type="button" className="primary-button" onClick={()=>add(query.trim()?{name:query.trim()}:undefined)}>Add product</button><AsyncButton className="filter-button" onClick={async()=>{const code=await scan();if(!code)return;const found=products.find(product=>product.barcode===code||product.sku===code);if(found)open(found);else setMissing(code)}}><ScanLine size={20}/>Scan barcode</AsyncButton></div>{missing&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="missing-product-title"><h2 id="missing-product-title">Add product</h2><p>This barcode is not in your product list.</p><div className="product-search-actions"><button type="button" className="filter-button" onClick={()=>setMissing('')}>Dismiss</button><button type="button" className="primary-button" onClick={()=>{add({name:'',barcode:missing});setMissing('')}}>Add product</button></div></section></div>}</section>
}
