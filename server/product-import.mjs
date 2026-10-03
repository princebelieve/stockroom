export const importFields = ['name','sku','barcode','category','unit','price','cost','stock','reorder']
const aliases = {
  name:['name','product','product name','title','item name','description'],
  sku:['sku','item code','product code','code'], barcode:['barcode','ean','upc','gtin'],
  category:['category','department'],unit:['unit','uom','selling unit'],
  price:['price','selling price','retail price'],cost:['cost','cost price','purchase price'],
  stock:['stock','quantity','opening stock','current stock','qty'],reorder:['reorder','reorder point','minimum stock'],
}
export function suggestImportMapping(header) {
  return Object.fromEntries(importFields.map(field=>[field,header.findIndex(value=>aliases[field].includes(String(value).trim().toLowerCase()))]))
}
export function mappedProducts(table,mapping=suggestImportMapping(table[0]||[])) {
  if(!table.length || !(Number(mapping.name)>=0))throw new Error('Map a column to Product name.')
  const selected=Object.values(mapping).filter(index=>Number(index)>=0).map(Number)
  if(new Set(selected).size!==selected.length)throw new Error('Map each source column to only one field.')
  const numeric=new Set(['price','cost','stock','reorder'])
  return table.slice(1).filter(row=>row.some(value=>String(value).trim())).map(row=>Object.fromEntries(importFields.map(field=>{
    const raw=Number(mapping[field])>=0?String(row[Number(mapping[field])]??'').trim():''
    if(!numeric.has(field))return[field,raw]
    const cleaned=raw.replace(/^(?:₦|NGN)\s*/i,'').replace(/,/g,'')
    return[field,raw===''?undefined:/^\d+(?:\.\d+)?$/.test(cleaned)?Number(cleaned):NaN]
  })))
}
export function importMatches(draft,products) {
  const barcode=String(draft.barcode||'').trim(),sku=String(draft.sku||'').trim()
  return products.filter(product=>(barcode && barcode===String(product.barcode||'').trim()) || (sku && sku===String(product.sku||'').trim()))
}
