import { saveReferenceCatalogue, findReferenceBarcode, searchReferenceCatalogue } from './lib/referenceCatalogue'
import { importFields, mappedProducts, suggestImportMapping, importMatches } from '../server/product-import.mjs'
import type { ShopProfile } from '../server/shop-profile.mjs'
import { CustomFieldEditor, customFieldProblem } from './ShopProductFields'
import { useRef, useState } from 'react'
import { ScanLine } from 'lucide-react'
import { readReceiptPhoto } from './lib/receiptOcr'
import { parseReport } from './lib/reconciliation'
import { documentSuggestions, draftProblem, labelSuggestion, lookupFoodBarcode, validGtin } from './lib/productIntake'
import type { ProductDraft } from './lib/productIntake'
import type { Product } from './types'

type Row = { id: number; draft: ProductDraft; source: string; selected: boolean }
const numericFields = ['price', 'cost', 'stock', 'reorder'] as const
const fields = ['name', 'sku', 'barcode', 'category', 'unit', ...numericFields] as const
const labels = { name: 'Name', sku: 'SKU', barcode: 'Barcode', category: 'Category', unit: 'Sell by', price: 'Selling price', cost: 'Unit cost', stock: 'Current stock', reorder: 'Reorder point' }


export function ProductIntake({ businessId = 'local', openProduct, shopProfile, create, products, defaultUnit, scan, screen, navigate }: { businessId?: string; openProduct?: (draft: ProductDraft) => void; shopProfile?: ShopProfile; create: (product: ProductDraft) => Promise<void>; products: Product[]; defaultUnit: string; scan: () => Promise<string | undefined>; screen: string; navigate: (screen: string) => void }) {
  const [referenceQuery,setReferenceQuery]=useState('');const [referenceResults,setReferenceResults]=useState<ProductDraft[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [csvTable,setCsvTable]=useState<string[][]>([])
  const [csvName,setCsvName]=useState('')
  const [mapping,setMapping]=useState<Record<string,number>>({})
  const [skipExisting,setSkipExisting]=useState(true)
  const [barcode, setBarcode] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'package' | 'document'>('package')
  const [text, setText] = useState('')
  const [sourceName, setSourceName] = useState('Pasted text')
  const nextId = useRef(0)
  const working = useRef(false)
  const matches = (row:Row) => importMatches(row.draft,products)
  const selected = rows.filter(row => row.selected && !(skipExisting && matches(row).length===1))
  const existingBarcodes = products.flatMap(product => [product.barcode || '', product.sku])
  const problem = (row: Row) => matches(row).length>1?'Barcode and SKU identify different existing products. Correct this row.': matches(row).length?'This product already exists. Enable skipping or remove the row; its current stock is preserved.':selected.some(other=>other.id!==row.id && row.draft.sku && other.draft.sku===row.draft.sku)?'This SKU occurs in another selected row.':customFieldProblem(row.draft.customValues, shopProfile) || draftProblem(row.draft, existingBarcodes, selected.filter(other => other.id !== row.id).map(other => other.draft.barcode?.trim() || ''))
  const add = (draft: ProductDraft, source: string, selected = true) => {
    const row = { id: nextId.current++, draft: { ...draft, unit: draft.unit || defaultUnit }, source, selected }
    setRows(current => [...current, row])
  }
  async function run(action: () => Promise<void>) {
    if (working.current) return
    working.current = true; setBusy(true)
    try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not finish. Your review rows are still available.') }
    finally { working.current = false; setBusy(false) }
  }
  async function lookup(code: string) {
    code = code.trim()
    if (!/^\S{3,200}$/.test(code)) { setMessage('Enter or scan a barcode first.'); return }
    if (products.some(product => product.barcode === code || product.sku === code)) { setMessage('This product is already in your catalogue. Use its inventory entry to change stock or details.'); return }
    const reference=await findReferenceBarcode(businessId,code).catch(()=>null)
    if(reference){if(openProduct)openProduct(reference);else { add(reference,'Your offline reference catalogue'); navigate('import-review') }setMessage('Reference found offline. Check the product and enter your own price, cost and stock.');return}
    let draft: ProductDraft = { name: '', barcode: code }
    let source = 'Scanned or entered barcode'
    let status = 'No online match. Add a package photo or complete the blank fields below.'
    if (validGtin(code)) {
      setMessage('Looking up barcode online...')
      try {
        const match = await lookupFoodBarcode(code)
        if (match) { draft = match; source = 'Open Facts barcode catalogue'; status = 'Online suggestion added. Check the exact product and pack size, then complete price and current stock.' }
      } catch (error) { status = `${error instanceof Error ? error.message : 'Online lookup failed.'} The barcode has been kept below.` }
    }
    if (openProduct) { openProduct(draft); setMessage('Complete the Add Product form to save.'); return }
    add(draft, source); navigate('import-review'); setMessage(status)
  }
  async function suggest(content = text, source = sourceName) {
    if (!content.trim()) { setMessage('No text found. Try a clearer photo or add the details yourself.'); return }
    if (mode === 'package') {
      const draft = labelSuggestion(content)
      let lookupSource = ''
      if (draft.barcode && !existingBarcodes.includes(draft.barcode)) {
        setMessage('Checking the barcode found on the package...')
        try {
          const match = await lookupFoodBarcode(draft.barcode)
          if (match) { draft.name = match.name; lookupSource = 'Open Facts (food, beauty, pet food and products); ' }
        } catch { /* The image suggestion remains useful when lookup is unavailable. */ }
      }
      if (openProduct) { openProduct(draft); setMessage('Details opened in Add Product. Check and save the form.'); return }
      const pending = draft.barcode ? rows.find(row => !row.draft.name.trim() && row.draft.barcode === draft.barcode) : undefined
      if (pending) setRows(current => current.map(row => row.id === pending.id ? { ...row, draft: { ...row.draft, ...draft, barcode: draft.barcode || row.draft.barcode }, source: `${lookupSource}${source}: ${content}` } : row))
      else add(draft, `${lookupSource}${source}: ${content}`)
      navigate('import-review')
      setMessage('Product details filled below. Check them, then add your selling price and current stock.')
    } else {
      const suggestions = documentSuggestions(content)
      suggestions.forEach(item => add(item.draft, `${source}: ${item.source}`, false))
      if (suggestions.length) navigate('import-review')
      setMessage(suggestions.length ? 'Choose the products to save below. Check each detail and enter your current stock.' : 'No products found. Try a clearer photo or add a product below.')
    }
  }
  async function importSelected() {
    const invalid = selected.find(row => problem(row))
    if (invalid) { setMessage(problem(invalid)); return }
    let saved = 0
    try {
      for (const row of selected) {
        if(importMatches(row.draft,products).length)throw new Error('An existing product matches this row. Enable skipping or remove it; existing stock will not be replaced.')
        await create({ ...row.draft, name: row.draft.name.trim(), barcode: row.draft.barcode?.trim() })
        saved++
        setRows(current => current.filter(item => item.id !== row.id))
      }
      setMessage(`Imported ${saved} product${saved === 1 ? '' : 's'}.`)
    } catch (error) { setMessage(`Imported ${saved}; stopped on the next product. Confirmed saved rows have been removed. If the connection failed, refresh inventory before retrying to check whether the last product was saved. ${error instanceof Error ? error.message : ''}`) }
  }
  const page = screen === 'import' ? 'home' : screen.replace('import-', '')
  return <section className="panel full-panel product-intake">
    {page !== 'home' && <button type="button" className="filter-button task-back-button" onClick={() => navigate('import')}>Import products</button>}
    {page === 'home' && <nav className="screen-picker screen-picker-buttons" aria-label="Import product task"><button type="button" className="filter-button" onClick={() => navigate('import-csv')}>Import CSV</button><button type="button" className="filter-button" onClick={() => navigate('import-barcode')}>Find by barcode</button><button type="button" className="filter-button" onClick={() => navigate('import-photo')}>Read product photo</button><button type="button" className="filter-button" onClick={() => navigate('import-reference')}>Find saved reference</button>{rows.length > 0 && <button type="button" className="filter-button" onClick={() => navigate('import-review')}>Review imported products ({rows.length})</button>}</nav>}
    <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
      <div className="payment-options">
        {page === 'csv' && <>
        <label>CSV product file<input type="file" accept=".csv,text/csv" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ''
          if (file) void run(async () => {
            if (file.size > 20_000_000) throw new Error('Choose a CSV smaller than 20 MB.')
            const table=parseReport(await file.text())
            if(!table.length)throw new Error('The CSV is empty.')
            setCsvTable(table);setCsvName(file.name);setMapping(suggestImportMapping(table[0]))
            setMessage('Match your file columns, then load products for review.')
          })
        }} /></label>
        {csvTable.length>0 && <><h3>Match CSV columns: {csvName}</h3><div className="form-grid">{importFields.map(field=><label key={field}>{labels[field as keyof typeof labels]} column<select aria-label={`${labels[field as keyof typeof labels]} column`} value={mapping[field]??-1} onChange={event=>setMapping(current=>({...current,[field]:Number(event.target.value)}))}><option value={-1}>Not in this file</option>{csvTable[0].map((column,index)=><option key={index} value={index}>{column||`Column ${index+1}`}</option>)}</select></label>)}</div><div className="report-actions"><button type="button" className="primary-button" onClick={()=>void run(async()=>{const drafts=mappedProducts(csvTable,mapping);if(drafts.length>2000)throw new Error('Review at most 2,000 inventory products at a time.');drafts.forEach(draft=>add(draft,csvName));setCsvTable([]);navigate('import-review');setMessage('Products loaded for review.')} )}>Load products for review</button><button type="button" className="filter-button" onClick={()=>navigate('import-save-reference')}>Save as offline reference</button></div></>}
        <label><input type="checkbox" checked={skipExisting} onChange={event=>setSkipExisting(event.target.checked)}/>Skip products already matched by barcode or SKU</label>
        </>}
        {page === 'barcode' && <>
        <label>Barcode<div className="barcode-field"><input value={barcode} onChange={event => setBarcode(event.target.value)} placeholder="Enter or scan barcode" /><button type="button" className="barcode-scan-button" aria-label="Scan barcode" onClick={() => void run(async () => { const code = await scan(); if (code) { setBarcode(code); await lookup(code) } })}><ScanLine size={19} /></button></div></label>
        <button type="button" className="filter-button" onClick={() => void run(() => lookup(barcode))}>Find product details</button>
        </>}
        {page === 'photo' && <>
        <label>What are you reading?<select value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="package">One product package / carton</option><option value="document">Invoice / product-list screenshot</option></select></label>
        <label>Photo or screenshot<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ''
          if (file) void run(async () => { setMessage('Reading your photo...'); const content = await readReceiptPhoto(file, new AbortController().signal, () => setMessage('Reading your photo...'), mode === 'document'); setText(content); setSourceName(file.name); await suggest(content, file.name); })
        }} /></label>
        <label>Paste or correct text<textarea rows={7} value={text} onChange={event => { setText(event.target.value); setSourceName('Edited / pasted text') }} placeholder="Paste product details here" /></label>
        <button type="button" className="filter-button" onClick={() => void run(() => suggest())}>Suggest products from text</button>
        </>}
        {page === 'save-reference' && <>
        <h3>{csvName || 'CSV catalogue'}</h3><button type="button" className="primary-button" disabled={!csvTable.length} onClick={()=>void run(async()=>{const count=await saveReferenceCatalogue(businessId,mappedProducts(csvTable,mapping));setCsvTable([]);setMessage(`Saved ${count} barcode references. Inventory and stock were not changed.`)})}>Save offline references</button>
        </>}
        {page === 'reference' && <>
        <label>Product name begins with<input value={referenceQuery} onChange={event=>setReferenceQuery(event.target.value)}/></label><button type="button" className="filter-button" onClick={()=>void run(async()=>{const results=await searchReferenceCatalogue(businessId,referenceQuery);setReferenceResults(results);setMessage(results.length?'Choose a reference to review.':'No reference matched.')})}>Search catalogue</button>{referenceResults.map(draft=><button type="button" className="filter-button" key={draft.barcode} disabled={products.some(product=>product.barcode===draft.barcode||product.sku===draft.barcode)} onClick={()=>{if(openProduct)openProduct(draft);else {add(draft,'Your offline reference catalogue');navigate('import-review')}}}>{draft.name} / {draft.barcode}</button>)}
        </>}
      </div>
      {page === 'review' && rows.length > 0 && <>
        <p>Check each product, including whether you sell single items or cartons. Enter your selling price and current stock. Blank cost and reorder point save as 0.</p>
        <div className="table-wrap"><table><thead><tr><th>Import</th>{fields.map(field => <th key={field}>{labels[field]}</th>)}<th>Review</th><th>Remove</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id}>
          <td><input type="checkbox" aria-label={`Import row ${index + 1}`} checked={row.selected} onChange={event => setRows(current => current.map(item => item.id === row.id ? { ...item, selected: event.target.checked } : item))} /></td>
          {fields.map(field => { const numeric = numericFields.some(key => key === field); const value = row.draft[field]; return <td key={field}><input aria-label={`${labels[field]} row ${index + 1}`} style={{ minWidth: field === 'name' ? 200 : 100 }} type={numeric ? 'number' : 'text'} min={numeric ? 0 : undefined} step={numeric ? 'any' : undefined} value={typeof value === 'number' && !Number.isFinite(value) ? '' : value ?? ''} placeholder="Not found" onChange={event => { const raw = event.target.value; setRows(current => current.map(item => item.id === row.id ? { ...item, draft: { ...item.draft, [field]: numeric ? raw === '' ? undefined : Number(raw) : raw } } : item)) }} /></td> })}
          <td>{shopProfile && <CustomFieldEditor profile={shopProfile} values={row.draft.customValues} labelPrefix={`Row ${index + 1} `} onChange={customValues => setRows(current => current.map(item => item.id === row.id ? { ...item, draft: { ...item.draft, customValues } } : item))} />}{row.selected && <small>{skipExisting && matches(row).length===1?`Skipped: already exists as ${matches(row)[0].name}`:problem(row) || 'Ready for your review'}</small>}<details><summary>Source</summary><pre style={{ whiteSpace: 'pre-wrap', maxWidth: 300 }}>{row.source}</pre></details></td>
          <td><button type="button" className="filter-button" aria-label={`Remove row ${index + 1}`} onClick={() => setRows(current => current.filter(item => item.id !== row.id))}>Remove</button></td>
        </tr>)}</tbody></table></div>
        <button type="button" className="primary-button" disabled={!selected.length || selected.some(row => problem(row))} onClick={() => void run(importSelected)}>Import {selected.length} reviewed product{selected.length === 1 ? '' : 's'}</button>
      </>}
      {page === 'review' && rows.length === 0 && <button type="button" className="filter-button" onClick={() => navigate('import-csv')}>Import CSV</button>}
    </fieldset>
    {message && <p role="status">{message}</p>}
    {page === 'review' && /^Imported \d+ products?\.$/.test(message) && <button type="button" className="primary-button" onClick={() => navigate('products')}>Products</button>}
  </section>
}
