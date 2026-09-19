import { useState } from 'react'
import { ScanLine } from 'lucide-react'
import { readReceiptPhoto } from './lib/receiptOcr'
import type { Product } from './types'

type Draft = { name: string; barcode?: string; category?: string; unit?: string; price?: number; cost?: number; stock?: number; reorder?: number }
const number = (value: unknown) => Number(String(value ?? '').replace(/[^0-9.]/g, '')) || 0
function rowsFromCsv(source: string): Draft[] {
  const rows = source.split(/\r?\n/).filter(Boolean).map(row => row.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')))
  if (rows.length < 2) throw new Error('The CSV needs a header row and at least one product.')
  const header = rows.shift()!.map(value => value.toLowerCase())
  const value = (row: string[], names: string[]) => row[header.findIndex(column => names.includes(column))] || ''
  return rows.map(row => ({ name: value(row, ['name', 'product', 'product name', 'title']), barcode: value(row, ['barcode', 'ean', 'upc', 'gtin']), category: value(row, ['category', 'department']), unit: value(row, ['unit', 'uom']), price: number(value(row, ['price', 'selling price', 'retail price'])), cost: number(value(row, ['cost', 'cost price'])), stock: number(value(row, ['stock', 'quantity', 'opening stock'])), reorder: number(value(row, ['reorder', 'reorder point'])) })).filter(product => product.name)
}
export function ProductIntake({ create, products, defaultUnit, scan }: { create: (product: Draft) => Promise<void>; products: Product[]; defaultUnit: string; scan: () => Promise<string | undefined> }) {
  const [drafts, setDrafts] = useState<Draft[]>([]); const [barcode, setBarcode] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false)
  const add = (draft: Draft) => setDrafts(current => [...current, draft])
  function lookup() {
    if (!/^\S{3,200}$/.test(barcode)) return setMessage('Enter or scan a barcode first.')
    const product = products.find(item => item.barcode === barcode || item.sku === barcode)
    if (!product) return setMessage('This barcode is not in this business catalogue. Use a label photo, CSV, or manual entry to create any type of product.')
    add({ name: product.name, barcode, category: product.category, unit: product.unit, price: product.price, cost: product.cost, reorder: product.reorder }); setMessage('Matching catalogue details were added for review.')
  }
  async function readLabel(file: File) {
    setBusy(true); setMessage('Reading product label...')
    try { const content = await readReceiptPhoto(file, new AbortController().signal, setMessage); const lines = content.split(/\r?\n/).map(line => line.trim()).filter(line => /[a-z]/i.test(line) && !/^(price|total|barcode|www\.)/i.test(line)); add({ name: lines[0] || 'Review product name', barcode: content.match(/\b\d{8,14}\b/)?.[0], unit: defaultUnit }); setMessage('Label suggestions were added for review; confirm every value before import.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not read that label.') } finally { setBusy(false) }
  }
  return <section className="panel full-panel"><h2>Product import and autofill</h2><p>Import any product type from CSV, scan a barcode, reuse a barcode from your own catalogue, or read any product label. Suggestions are never published until you import them.</p><div className="payment-options"><label>CSV product file<input type="file" accept=".csv,text/csv" disabled={busy} onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { setDrafts(rowsFromCsv(await file.text()).map(draft => ({ ...draft, unit: draft.unit || defaultUnit }))); setMessage('CSV loaded. Review the products below before importing.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not read CSV.') } }} /></label><small>Use headers such as Name, Barcode, Category, Unit, Price, Cost, Stock, and Reorder. Save Excel files as CSV first.</small><label>Barcode to find<div className="barcode-field"><input value={barcode} onChange={event => setBarcode(event.target.value)} placeholder="Enter product barcode" /><button type="button" className="barcode-scan-button" aria-label="Scan barcode" title="Scan barcode" disabled={busy} onClick={() => { void scan().then(value => { if (value) { setBarcode(value); setMessage('Barcode captured. Select Autofill from barcode to search this catalogue.') } }) }}><ScanLine size={19} /></button></div></label><button type="button" className="filter-button" disabled={busy} onClick={lookup}>Autofill from barcode</button><label>Product-label photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void readLabel(file) }} /></label>{message && <p role="status">{message}</p>}</div>{drafts.length > 0 && <><div className="table-wrap"><table><thead><tr><th>Name</th><th>Barcode</th><th>Category</th><th>Unit</th><th>Price</th></tr></thead><tbody>{drafts.map((draft, index) => <tr key={`${draft.barcode}-${index}`}><td>{draft.name}</td><td>{draft.barcode || '-'}</td><td>{draft.category || '-'}</td><td>{draft.unit || defaultUnit}</td><td>{draft.price || 0}</td></tr>)}</tbody></table></div><button type="button" className="primary-button" disabled={busy} onClick={async () => { setBusy(true); try { for (const draft of drafts) await create(draft); setDrafts([]); setMessage('Products imported.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Import stopped before all products were saved.') } finally { setBusy(false) } }}>Import {drafts.length} product{drafts.length === 1 ? '' : 's'}</button></>}</section>
}
