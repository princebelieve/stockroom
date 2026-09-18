import { useState } from 'react'
import { readReceiptPhoto } from './lib/receiptOcr'

type Draft = { name: string; barcode?: string; category?: string; unit?: string; price?: number; cost?: number; stock?: number; reorder?: number }
const text = (value: unknown) => String(value ?? '').trim()
const number = (value: unknown) => Number(String(value ?? '').replace(/[^0-9.]/g, '')) || 0

function rowsFromCsv(source: string): Draft[] {
  const rows = source.split(/\r?\n/).filter(Boolean).map(row => row.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')))
  if (rows.length < 2) throw new Error('The CSV needs a header row and at least one product.')
  const header = rows.shift()!.map(value => value.toLowerCase())
  const value = (row: string[], names: string[]) => row[header.findIndex(column => names.includes(column))] || ''
  return rows.map(row => ({ name: value(row, ['name', 'product', 'product name', 'title']), barcode: value(row, ['barcode', 'ean', 'upc', 'gtin']), category: value(row, ['category', 'department']), unit: value(row, ['unit', 'uom']) || 'item', price: number(value(row, ['price', 'selling price', 'retail price'])), cost: number(value(row, ['cost', 'cost price'])), stock: number(value(row, ['stock', 'quantity', 'opening stock'])), reorder: number(value(row, ['reorder', 'reorder point'])) })).filter(product => product.name)
}

export function ProductIntake({ create }: { create: (product: Draft) => Promise<void> }) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [barcode, setBarcode] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const add = (draft: Draft) => setDrafts(current => [...current, draft])
  async function lookup() {
    if (!/^\d{8,14}$/.test(barcode)) return setMessage('Enter an 8–14 digit barcode first.')
    setBusy(true); setMessage('Looking up product details…')
    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`)
      const data = await response.json()
      const product = data.product
      if (!product?.product_name) throw new Error('No public product record was found. Add the details manually.')
      add({ name: text(product.product_name), barcode, category: text(product.categories_tags?.[0]).replace(/^en:/, ''), unit: 'item' })
      setMessage('A public product record was added for review.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Lookup failed. Add the details manually.') } finally { setBusy(false) }
  }
  async function readLabel(file: File) {
    setBusy(true); setMessage('Reading product label…')
    try {
      const content = await readReceiptPhoto(file, new AbortController().signal, setMessage)
      const lines = content.split(/\r?\n/).map(line => line.trim()).filter(line => /[a-z]/i.test(line) && !/^(price|total|barcode|www\.)/i.test(line))
      const foundBarcode = content.match(/\b\d{8,14}\b/)?.[0]
      add({ name: lines[0] || 'Review product name', barcode: foundBarcode, unit: 'item' })
      setMessage('Label suggestions were added for review; confirm every value before import.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not read that label.') } finally { setBusy(false) }
  }
  return <section className="panel full-panel"><h2>Product import and autofill</h2><p>Import a CSV, scan a barcode, or read a product label. Suggestions are never published until you import them.</p><div className="payment-options"><label>CSV product file<input type="file" accept=".csv,text/csv" disabled={busy} onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { setDrafts(rowsFromCsv(await file.text())); setMessage('CSV loaded. Review the products below before importing.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not read CSV.') } }} /></label><small>Use headers such as Name, Barcode, Category, Unit, Price, Cost, Stock, and Reorder. Save Excel files as CSV first.</small><label>Barcode lookup<input value={barcode} onChange={event => setBarcode(event.target.value)} inputMode="numeric" /></label><button type="button" className="filter-button" disabled={busy} onClick={lookup}>Autofill from barcode</button><label>Product-label photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void readLabel(file) }} /></label>{message && <p role="status">{message}</p>}</div>{drafts.length > 0 && <><div className="table-wrap"><table><thead><tr><th>Name</th><th>Barcode</th><th>Category</th><th>Price</th></tr></thead><tbody>{drafts.map((draft, index) => <tr key={`${draft.barcode}-${index}`}><td>{draft.name}</td><td>{draft.barcode || '—'}</td><td>{draft.category || '—'}</td><td>{draft.price || 0}</td></tr>)}</tbody></table></div><button type="button" className="primary-button" disabled={busy} onClick={async () => { setBusy(true); try { for (const draft of drafts) await create(draft); setDrafts([]); setMessage('Products imported.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Import stopped before all products were saved.') } finally { setBusy(false) } }}>Import {drafts.length} product{drafts.length === 1 ? '' : 's'}</button></>}</section>
}
