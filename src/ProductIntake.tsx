import { saveReferenceCatalogue, findReferenceBarcode, searchReferenceCatalogue } from './lib/referenceCatalogue'
import { importFields, mappedProducts, suggestImportMapping, importMatches } from '../server/product-import.mjs'
import type { ShopProfile } from '../server/shop-profile.mjs'
import type { CatalogueWorkspace } from '../server/shop-profile.mjs'
import { CustomFieldEditor, customFieldProblem } from './ShopProductFields'
import { useRef, useState } from 'react'
import { Check, ScanLine, X } from 'lucide-react'
import { readReceiptPhoto } from './lib/receiptOcr'
import { parseReport } from './lib/reconciliation'
import { documentSuggestions, draftProblem, labelSuggestion, lookupProductBarcode, lookupProductNafdac, validGtin } from './lib/productIntake'
import type { ProductDraft } from './lib/productIntake'
import type { Product } from './types'

type Row = { id: number; draft: ProductDraft; source: string; selected: boolean }
type BarcodeLookupReport = { barcode: string; registrationNumber?: string; draft: ProductDraft; state: 'match' | 'saved-reference' | 'existing' | 'not-found' | 'unavailable' | 'invalid'; message: string }
const numericFields = ['price', 'cost', 'stock', 'reorder'] as const
const fields = ['name', 'sku', 'barcode', 'category', 'unit', ...numericFields] as const
const labels = { name: 'Name', sku: 'SKU', barcode: 'Barcode', category: 'Category', unit: 'Sell by', price: 'Selling price', cost: 'Unit cost', stock: 'Current stock', reorder: 'Reorder point' }


export function ProductIntake({ businessId = 'local', lookupApiUrl = '', openProduct, shopProfile, catalogueWorkspace = 'product-sales', create, products, defaultUnit, scan, scanKey = 'Enter', screen, navigate, compact = false }: { businessId?: string; lookupApiUrl?: string; openProduct?: (draft: ProductDraft, message?: string) => void; shopProfile?: ShopProfile; catalogueWorkspace?: CatalogueWorkspace; create: (product: ProductDraft) => Promise<void>; products: Product[]; defaultUnit: string; scan: () => Promise<string | undefined>; scanKey?: 'Enter' | 'Tab'; screen: string; navigate: (screen: string) => void; compact?: boolean }) {
  const [referenceQuery,setReferenceQuery]=useState('');const [referenceResults,setReferenceResults]=useState<ProductDraft[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [csvTable,setCsvTable]=useState<string[][]>([])
  const [csvName,setCsvName]=useState('')
  const [mapping,setMapping]=useState<Record<string,number>>({})
  const [skipExisting,setSkipExisting]=useState(true)
  const [barcode, setBarcode] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [barcodeReport, setBarcodeReport] = useState<BarcodeLookupReport | null>(null)
  const [lookupSource, setLookupSource] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploadFeedback, setUploadFeedback] = useState<{ state: 'success' | 'error'; text: string } | null>(null)
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
  async function lookup(code: string, registration = registrationNumber) {
    code = code.trim()
    if (!/^\S{3,200}$/.test(code)) { setMessage('Enter or scan a barcode first.'); return }
    const existing = products.find(product => product.barcode === code || product.sku === code)
    if (existing) { setBarcodeReport({ barcode: code, draft: { name: existing.name, barcode: existing.barcode || code, category: existing.category }, state: 'existing', message: 'This code already belongs to a product in your catalogue. Open it from Products to change its details or stock.' }); return }
    const reference=await findReferenceBarcode(businessId,code).catch(()=>null)
    let draft: ProductDraft = { name: '', barcode: code }
    let state: BarcodeLookupReport['state'] = 'not-found'
    let status = lookupSource ? `No exact barcode match was found in ${lookupSource}. Try another source or enter the product details.` : 'No catalogue match was returned. You can still add the product manually with this barcode.'
    if(reference){draft=reference;state='saved-reference';status='Found on this device. Confirm that the name, barcode and pack match the product in your hand; enter your own price, cost and stock.'}
    else if (validGtin(code)) {
      setMessage('Looking up barcode online...')
      try {
        const match = await lookupProductBarcode(code, lookupApiUrl, shopProfile, catalogueWorkspace, lookupSource, registration)
        if (match) { draft = match; state = 'match'; status = match.catalogueSource === 'NAFDAC Greenbook' ? 'NAFDAC Greenbook matched the registration number. Confirm that the package and barcode belong to this product; your business price, cost and stock are not supplied by the registry.' : `${match.catalogueSource || 'Online catalogue'} suggested this name. Confirm the exact product and pack; your business price, cost and stock are not supplied by the catalogue.` }
      } catch (error) { state = 'unavailable'; status = `${error instanceof Error ? error.message : 'Online lookup failed.'} The scanned barcode is preserved so you can continue manually.` }
    } else { state = 'invalid'; status = 'This code is not a supported product GTIN, so online catalogues could not verify it. You can still add it as your product barcode.' }
    setBarcodeReport({ barcode: code, registrationNumber: registration, draft, state, message: status })
    setMessage('')
  }
  async function searchByNafdac() {
    setMessage('Searching the NAFDAC Greenbook...')
    try {
      const draft = await lookupProductNafdac(registrationNumber, lookupApiUrl, shopProfile)
      setBarcodeReport({ barcode: '', registrationNumber, draft: draft || { name: '' }, state: draft ? 'match' : 'not-found', message: draft ? draft.catalogueSource === 'NAFDAC Greenbook' ? 'NAFDAC Greenbook matched this registration number. Confirm the product and enter or scan its barcode before saving.' : 'Brave Search found a page mentioning this registration number. Confirm the product and barcode against the package before saving.' : `No product details were found for ${registrationNumber}.` })
    } catch (error) {
      setBarcodeReport({ barcode: '', registrationNumber, draft: { name: '' }, state: 'unavailable', message: error instanceof Error ? error.message : 'NAFDAC Greenbook lookup failed.' })
    } finally { setMessage('') }
  }
  async function checkLookupSource(source: string) {
    if (!barcodeReport || !validGtin(barcodeReport.barcode)) return
    setMessage(source ? `Checking ${source}...` : 'Checking available catalogues...')
    try {
      const match = await lookupProductBarcode(barcodeReport.barcode, lookupApiUrl, shopProfile, catalogueWorkspace, source, registrationNumber)
      setBarcodeReport(match
        ? { barcode: barcodeReport.barcode, draft: match, state: 'match', message: match.catalogueSource === 'NAFDAC Greenbook' ? 'NAFDAC Greenbook matched the registration number. Confirm that the package and barcode belong to this product; set your own business price, cost and stock.' : `${match.catalogueSource || 'Online catalogue'} returned an exact barcode match. Confirm the exact product and pack; set your own business price, cost and stock.` }
        : { barcode: barcodeReport.barcode, draft: { name: '', barcode: barcodeReport.barcode }, state: 'not-found', message: source ? `No exact barcode match was found in ${source}. The barcode is preserved; choose another source or enter the product details.` : 'No catalogue match was returned. You can still add the product manually with this barcode.' })
    } catch (error) {
      setBarcodeReport({ ...barcodeReport, state: 'unavailable', message: `${error instanceof Error ? error.message : 'Online lookup failed.'} The barcode is preserved so you can try another source or continue manually.` })
    } finally { setMessage('') }
  }
  function continueWithLookupResult() {
    if (!barcodeReport) return
    const draft = barcodeReport.state === 'match' || barcodeReport.state === 'saved-reference'
      ? barcodeReport.draft
      : { name: '', barcode: barcodeReport.barcode }
    if (openProduct) { openProduct(draft, `${barcodeReport.message} Confirm the product details before saving.`); return }
    add(draft, barcodeReport.state === 'saved-reference' ? 'Your offline reference catalogue' : `${draft.catalogueSource || 'Barcode lookup'} suggestion`)
    navigate('import-review')
  }
  async function suggest(content = text, source = sourceName) {
    if (!content.trim()) { setMessage('No text found. Try a clearer photo or add the details yourself.'); return }
    if (mode === 'package') {
      const draft = labelSuggestion(content)
      const registration = content.toUpperCase().match(/\b[A-Z]\d{1,2}-\d{4,7}[A-Z]?\b/)?.[0] || ''
      if (registration) setRegistrationNumber(registration)
      let lookupSource = ''
      if (draft.barcode && !existingBarcodes.includes(draft.barcode)) {
        setMessage('Checking the barcode found on the package...')
        try {
          const match = await lookupProductBarcode(draft.barcode, lookupApiUrl, shopProfile, catalogueWorkspace, '', registration)
          if (match) { Object.assign(draft, match); lookupSource = `${match.catalogueSource || 'Online catalogue'}; ` }
        } catch { /* The image suggestion remains useful when lookup is unavailable. */ }
      }
      if (openProduct) { openProduct(draft, `${lookupSource ? 'Barcode catalogue suggestion added. ' : ''}Photo suggestions opened in Add Product. Check the name and barcode, then complete the business-specific fields before saving.`); return }
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
    setUploadFeedback(null)
    const invalid = selected.find(row => problem(row))
    if (invalid) { setUploadFeedback({ state: 'error', text: problem(invalid) }); return }
    let saved = 0
    try {
      for (const row of selected) {
        if(importMatches(row.draft,products).length)throw new Error('An existing product matches this row. Enable skipping or remove it; existing stock will not be replaced.')
        await create({ ...row.draft, name: row.draft.name.trim(), barcode: row.draft.barcode?.trim() })
        saved++
        setRows(current => current.filter(item => item.id !== row.id))
      }
      setMessage('')
      setUploadFeedback({ state: 'success', text: `Imported ${saved} product${saved === 1 ? '' : 's'}.` })
    } catch (error) { setMessage(''); setUploadFeedback({ state: 'error', text: `Imported ${saved}; stopped on the next product. Confirmed saved rows have been removed. If the connection failed, refresh inventory before retrying to check whether the last product was saved. ${error instanceof Error ? error.message : ''}` }) }
  }
  const page = screen === 'import' ? 'home' : screen.replace('import-', '')
  return <section className="panel full-panel product-intake">
    {page !== 'home' && <button type="button" className="filter-button task-back-button" onClick={() => { if(page==='barcode'&&barcodeReport){setBarcodeReport(null);setMessage('');return} navigate(page === 'save-reference' ? 'import-csv' : 'products') }}>{page === 'save-reference' ? 'Back to CSV import' : page === 'barcode' && barcodeReport ? 'New barcode lookup' : 'Products'}</button>}
    {busy && message && (page === 'barcode' || page === 'photo' && /barcode|catalogue/i.test(message)) && <div className="barcode-lookup-loading" role="status" aria-live="polite"><span className="barcode-lookup-spinner" aria-hidden="true"/><div><strong>{page === 'photo' ? 'Checking the barcode from your product photo' : 'Looking for a product match'}</strong><p>{message}</p></div></div>}
    {page === 'home' && <nav className="screen-picker screen-picker-buttons" aria-label="Import product task"><button type="button" className="filter-button" onClick={() => navigate('import-csv')}>Import CSV</button>{!compact && <><button type="button" className="filter-button" onClick={() => navigate('import-barcode')}>Find by barcode</button><button type="button" className="filter-button" onClick={() => navigate('import-photo')}>Read product photo</button><button type="button" className="filter-button" onClick={() => navigate('import-reference')}>Find saved reference</button></>}{rows.length > 0 && <button type="button" className="filter-button" onClick={() => navigate('import-review')}>Review imported products ({rows.length})</button>}</nav>}
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
        {page === 'barcode' && !barcodeReport && <>
        <label>Barcode<div className="barcode-field"><input value={barcode} onChange={event => setBarcode(event.target.value)} onKeyDown={event => { if (event.key === scanKey && barcode.trim()) { event.preventDefault(); void run(() => lookup(barcode)) } }} placeholder="Enter or scan barcode" /></div><button type="button" className="filter-button" onClick={() => void run(async () => { const code = await scan(); if (code) { setBarcode(code); await lookup(code) } })}><ScanLine size={19} />Scan product barcode</button></label>
        <label>NAFDAC registration number (optional)<input value={registrationNumber} onChange={event=>setRegistrationNumber(event.target.value)} placeholder="e.g. A7-102608L" /></label>
        <button type="button" className="filter-button" disabled={busy || !registrationNumber.trim()} onClick={()=>void run(searchByNafdac)}>Search product details by NAFDAC number</button>
        <label>Online catalogue<select value={lookupSource} onChange={event=>setLookupSource(event.target.value)}><option value="">Automatic best match</option><option>Open Food Facts</option><option>Open Beauty Facts</option><option>Open Pet Food Facts</option><option>Open Products Facts</option><option>UPCitemdb</option><option>EcomSource</option><option>openFDA Drug NDC Directory</option><option>AccessGUDID medical device registry</option><option>NAFDAC Greenbook</option><option>Web search (Brave)</option></select></label>
        <button type="button" className="filter-button" onClick={() => void run(() => lookup(barcode))}>Find product details</button>
        <p>For medicines and regulated health products, Stockroom can search the <a href="https://greenbook.nafdac.gov.ng/" target="_blank" rel="noreferrer">NAFDAC Greenbook</a> by registration number. To check who issued a GTIN, use <a href="https://www.gs1.org/services/verified-by-gs1" target="_blank" rel="noreferrer">Verified by GS1</a>. Package photos are read on this device and are not sent.</p>
        </>}
        {page === 'barcode' && barcodeReport && <section className={`barcode-lookup-report barcode-lookup-report-${barcodeReport.state}`} aria-labelledby="barcode-result-title">
          <div className="barcode-lookup-report-heading"><span className="barcode-lookup-status">{barcodeReport.state==='match'?(barcodeReport.draft.catalogueSource==='Web search'?'Web search suggestion':'Catalogue match'):barcodeReport.state==='saved-reference'?'Saved reference':barcodeReport.state==='existing'?'Already in Products':barcodeReport.state==='unavailable'?'Lookup unavailable':barcodeReport.state==='invalid'?'Code not verified':'No catalogue match'}</span><h2 id="barcode-result-title">{barcodeReport.state==='existing'?barcodeReport.draft.name:barcodeReport.draft.name||'Product details not found'}</h2><p>{barcodeReport.message}</p></div>
          <dl className="barcode-lookup-facts">{barcodeReport.barcode&&<div><dt>Barcode</dt><dd><code>{barcodeReport.barcode}</code></dd></div>}{barcodeReport.registrationNumber&&<div><dt>NAFDAC registration</dt><dd><code>{barcodeReport.registrationNumber}</code></dd></div>}{barcodeReport.draft.category&&<div><dt>Category</dt><dd>{barcodeReport.draft.category}</dd></div>}{barcodeReport.draft.catalogueSource&&<div><dt>Source</dt><dd>{barcodeReport.draft.catalogueSource}{barcodeReport.draft.catalogueUrl&&<> · <a href={barcodeReport.draft.catalogueUrl} target="_blank" rel="noreferrer">Open source page</a></>}</dd></div>}{barcodeReport.draft.customValues&&shopProfile?.fields.filter(field=>field.visible&&barcodeReport.draft.customValues?.[field.id]).map(field=><div key={field.id}><dt>{field.label}</dt><dd>{barcodeReport.draft.customValues?.[field.id]}</dd></div>)}</dl>
          {validGtin(barcodeReport.barcode) && barcodeReport.state !== 'existing' && <div className="barcode-source-check"><label>Check another source<select value={lookupSource} onChange={event=>setLookupSource(event.target.value)}><option value="">Automatic best match</option><option>Open Food Facts</option><option>Open Beauty Facts</option><option>Open Pet Food Facts</option><option>Open Products Facts</option><option>UPCitemdb</option><option>EcomSource</option><option>openFDA Drug NDC Directory</option><option>AccessGUDID medical device registry</option><option>NAFDAC Greenbook</option><option>Web search (Brave)</option></select></label><button type="button" className="filter-button" disabled={busy} onClick={()=>void run(()=>checkLookupSource(lookupSource))}>Check source</button></div>}
          {barcodeReport.state !== 'match' && barcodeReport.state !== 'saved-reference' && barcodeReport.state !== 'existing' && validGtin(barcodeReport.barcode) && <div className="barcode-source-check"><a href={`https://www.google.com/search?q=${encodeURIComponent(`"${barcodeReport.barcode}"`)}`} target="_blank" rel="noreferrer">Search the web for this barcode</a></div>}
          {(barcodeReport.state==='match'||barcodeReport.state==='saved-reference')&&<p className="barcode-lookup-note">This is a product identification suggestion. Confirm the exact item and pack. Set your own selling price, cost and stock when you continue.</p>}
          <div className="barcode-lookup-actions">{barcodeReport.state==='existing'?<button type="button" className="primary-button" onClick={()=>navigate('products')}>Open Products</button>:<button type="button" className="primary-button" onClick={continueWithLookupResult}>{barcodeReport.state==='match'||barcodeReport.state==='saved-reference'?'Use these details':'Enter product details'}</button>}<button type="button" className="filter-button" onClick={()=>{setBarcodeReport(null);setBarcode('');setMessage('')}}>Look up another barcode</button></div>
        </section>}
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
        <button type="button" className="primary-button" disabled={!selected.length || selected.some(row => problem(row)) || busy} aria-busy={busy} onClick={() => { setUploadFeedback(null); void run(importSelected) }}>{busy && <span className="button-spinner" aria-hidden="true"/>}{busy ? 'Importing products...' : `Import ${selected.length} reviewed product${selected.length === 1 ? '' : 's'}`}</button>
      </>}
      {page === 'review' && rows.length === 0 && <button type="button" className="filter-button" onClick={() => navigate('import-csv')}>Import CSV</button>}
    </fieldset>
    {message && !(busy && (page === 'barcode' || page === 'photo' && /barcode|catalogue/i.test(message))) && <p role="status">{message}</p>}
    {page === 'review' && uploadFeedback && <p className={`product-upload-feedback product-upload-feedback-${uploadFeedback.state}`} role={uploadFeedback.state === 'error' ? 'alert' : 'status'} aria-live="polite">{uploadFeedback.state === 'success' ? <Check size={18} aria-hidden="true"/> : <X size={18} aria-hidden="true"/>}<span>{uploadFeedback.text}</span></p>}
    {page === 'review' && uploadFeedback?.state === 'success' && <button type="button" className="primary-button" onClick={() => navigate('products')}>Products</button>}
  </section>
}
