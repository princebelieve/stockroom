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
const fields = ['name', 'barcode', 'category', 'unit', ...numericFields] as const
const labels = { name: 'Name', barcode: 'Barcode', category: 'Category', unit: 'Sell by', price: 'Selling price', cost: 'Unit cost', stock: 'Current stock', reorder: 'Reorder point' }

function rowsFromCsv(source: string): ProductDraft[] {
  const [header, ...rows] = parseReport(source)
  const normalized = header.map(value => value.trim().toLowerCase())
  const value = (row: string[], names: string[]) => row[normalized.findIndex(column => names.includes(column))]?.trim() || ''
  const number = (raw: string) => raw === '' ? undefined : /^\d+(?:\.\d+)?$/.test(raw.replace(/,/g, '')) ? Number(raw.replace(/,/g, '')) : NaN
  if (!normalized.some(column => ['name', 'product', 'product name', 'title'].includes(column))) throw new Error('Include a Name or Product column in your CSV.')
  return rows.map(row => ({ name: value(row, ['name', 'product', 'product name', 'title']), barcode: value(row, ['barcode', 'ean', 'upc', 'gtin']), category: value(row, ['category', 'department']), unit: value(row, ['unit', 'uom']), price: number(value(row, ['price', 'selling price', 'retail price'])), cost: number(value(row, ['cost', 'cost price'])), stock: number(value(row, ['stock', 'quantity', 'opening stock'])), reorder: number(value(row, ['reorder', 'reorder point'])) }))
}

export function ProductIntake({ openProduct, shopProfile, create, products, defaultUnit, scan }: { openProduct?: (draft: ProductDraft) => void; shopProfile?: ShopProfile; create: (product: ProductDraft) => Promise<void>; products: Product[]; defaultUnit: string; scan: () => Promise<string | undefined> }) {
  const [rows, setRows] = useState<Row[]>([])
  const [barcode, setBarcode] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'package' | 'document'>('package')
  const [text, setText] = useState('')
  const [sourceName, setSourceName] = useState('Pasted text')
  const nextId = useRef(0)
  const working = useRef(false)
  const selected = rows.filter(row => row.selected)
  const existingBarcodes = products.flatMap(product => [product.barcode || '', product.sku])
  const problem = (row: Row) => customFieldProblem(row.draft.customValues, shopProfile) || draftProblem(row.draft, existingBarcodes, selected.filter(other => other.id !== row.id).map(other => other.draft.barcode?.trim() || ''))
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
    let draft: ProductDraft = { name: '', barcode: code }
    let source = 'Scanned or entered barcode'
    let status = 'No online match. Add a package photo or complete the blank fields below.'
    if (validGtin(code)) {
      setMessage('Looking up barcode online...')
      try {
        const match = await lookupFoodBarcode(code)
        if (match) { draft = match; source = 'Open Food Facts'; status = 'Online suggestion added. Check the exact product and pack size, then complete price and current stock.' }
      } catch (error) { status = `${error instanceof Error ? error.message : 'Online lookup failed.'} The barcode has been kept below.` }
    }
    if (openProduct) { openProduct(draft); setMessage('Complete the Add Product form to save.'); return }
    add(draft, source); setMessage(status)
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
          if (match) { draft.name = match.name; lookupSource = 'Open Food Facts; ' }
        } catch { /* The image suggestion remains useful when lookup is unavailable. */ }
      }
      if (openProduct) { openProduct(draft); setMessage('Details opened in Add Product. Check and save the form.'); return }
      const pending = draft.barcode ? rows.find(row => !row.draft.name.trim() && row.draft.barcode === draft.barcode) : undefined
      if (pending) setRows(current => current.map(row => row.id === pending.id ? { ...row, draft: { ...row.draft, ...draft, barcode: draft.barcode || row.draft.barcode }, source: `${lookupSource}${source}: ${content}` } : row))
      else add(draft, `${lookupSource}${source}: ${content}`)
      setMessage('Product details filled below. Check them, then add your selling price and current stock.')
    } else {
      const suggestions = documentSuggestions(content)
      suggestions.forEach(item => add(item.draft, `${source}: ${item.source}`, false))
      setMessage(suggestions.length ? 'Choose the products to save below. Check each detail and enter your current stock.' : 'No products found. Try a clearer photo or add a product below.')
    }
  }
  async function importSelected() {
    const invalid = selected.find(row => problem(row))
    if (invalid) { setMessage(problem(invalid)); return }
    let saved = 0
    try {
      for (const row of selected) {
        await create({ ...row.draft, name: row.draft.name.trim(), barcode: row.draft.barcode?.trim() })
        saved++
        setRows(current => current.filter(item => item.id !== row.id))
      }
      setMessage(`Imported ${saved} product${saved === 1 ? '' : 's'}.`)
    } catch (error) { setMessage(`Imported ${saved}; stopped on the next product. Confirmed saved rows have been removed. If the connection failed, refresh inventory before retrying to check whether the last product was saved. ${error instanceof Error ? error.message : ''}`) }
  }
  return <details className="panel full-panel product-intake">
    <summary>Add products from a photo, barcode or file</summary>
    <p>Upload a clear photo to fill product details. Check the results and complete anything missing before saving.</p>
    <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
      <div className="payment-options">
        <label>CSV product file<input type="file" accept=".csv,text/csv" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ''
          if (file) void run(async () => {
            if (file.size > 2_000_000) throw new Error('Choose a CSV smaller than 2 MB.')
            rowsFromCsv(await file.text()).forEach(draft => add(draft, file.name))
            setMessage('CSV added. Review and complete the products below.')
          })
        }} /></label>
        <details><summary>File format help</summary><small>Save your spreadsheet as CSV with these headings: Name, Barcode, Category, Unit, Price, Cost, Stock, Reorder.</small></details>
        <label>Barcode<div className="barcode-field"><input value={barcode} onChange={event => setBarcode(event.target.value)} placeholder="Enter or scan barcode" /><button type="button" className="barcode-scan-button" aria-label="Scan barcode" onClick={() => void run(async () => { const code = await scan(); if (code) { setBarcode(code); await lookup(code) } })}><ScanLine size={19} /></button></div></label>
        <button type="button" className="filter-button" onClick={() => void run(() => lookup(barcode))}>Find product details</button>
        <details><summary>About barcode lookup</summary><small>Barcode searches use <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a> for food products. Only the barcode is sent. Some products may not be listed. Data: <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL</a>.</small></details>
        <label>What are you reading?<select value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="package">One product package / carton</option><option value="document">Invoice / product-list screenshot</option></select></label>
        <label>Photo or screenshot<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ''
          if (file) void run(async () => { setMessage('Reading your photo...'); const content = await readReceiptPhoto(file, new AbortController().signal, () => setMessage('Reading your photo...'), mode === 'document'); setText(content); setSourceName(file.name); await suggest(content, file.name); })
        }} /></label>
        <small>Show the product name clearly. For invoices, include the headings. JPG, PNG or WebP, up to 15 MB.</small>
        <details><summary>Paste text or correct the photo text</summary><label>Read or pasted text<textarea rows={7} value={text} onChange={event => { setText(event.target.value); setSourceName('Edited / pasted text') }} placeholder="Paste product details here" /></label>
        <button type="button" className="filter-button" onClick={() => void run(() => suggest())}>Suggest products from text</button></details>
        <button type="button" className="filter-button" onClick={() => add({ name: '' }, 'Manual entry')}>Add empty row</button>
      </div>
      {rows.length > 0 && <>
        <p>Check each product, including whether you sell single items or cartons. Enter your selling price and current stock. Blank cost and reorder point save as 0.</p>
        <div className="table-wrap"><table><thead><tr><th>Import</th>{fields.map(field => <th key={field}>{labels[field]}</th>)}<th>Review</th><th>Remove</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id}>
          <td><input type="checkbox" aria-label={`Import row ${index + 1}`} checked={row.selected} onChange={event => setRows(current => current.map(item => item.id === row.id ? { ...item, selected: event.target.checked } : item))} /></td>
          {fields.map(field => { const numeric = numericFields.some(key => key === field); const value = row.draft[field]; return <td key={field}><input aria-label={`${labels[field]} row ${index + 1}`} style={{ minWidth: field === 'name' ? 200 : 100 }} type={numeric ? 'number' : 'text'} min={numeric ? 0 : undefined} step={numeric ? 'any' : undefined} value={typeof value === 'number' && !Number.isFinite(value) ? '' : value ?? ''} placeholder="Not found" onChange={event => { const raw = event.target.value; setRows(current => current.map(item => item.id === row.id ? { ...item, draft: { ...item.draft, [field]: numeric ? raw === '' ? undefined : Number(raw) : raw } } : item)) }} /></td> })}
          <td>{shopProfile && <CustomFieldEditor profile={shopProfile} values={row.draft.customValues} labelPrefix={`Row ${index + 1} `} onChange={customValues => setRows(current => current.map(item => item.id === row.id ? { ...item, draft: { ...item.draft, customValues } } : item))} />}{row.selected && <small>{problem(row) || 'Ready for your review'}</small>}<details><summary>Source</summary><pre style={{ whiteSpace: 'pre-wrap', maxWidth: 300 }}>{row.source}</pre></details></td>
          <td><button type="button" className="filter-button" aria-label={`Remove row ${index + 1}`} onClick={() => setRows(current => current.filter(item => item.id !== row.id))}>Remove</button></td>
        </tr>)}</tbody></table></div>
        <button type="button" className="primary-button" disabled={!selected.length || selected.some(row => problem(row))} onClick={() => void run(importSelected)}>Import {selected.length} reviewed product{selected.length === 1 ? '' : 's'}</button>
      </>}
    </fieldset>
    {message && <p role="status">{message}</p>}
  </details>
}
