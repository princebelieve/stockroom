import { useState } from 'react'
import { WorkspaceHelp } from './WorkspaceHelp'
import { catalogueStarters, missingStarters, type CatalogueStarter } from '../server/catalogue-starters.mjs'

export function CatalogueStarters({ kind = 'stock', industry = 'general', existing, save, openProducts, add }: {
  kind?: string
  industry?: string
  existing: Array<{ name: string }>
  save?: (items: CatalogueStarter[]) => Promise<void>
  openProducts?: () => void
  add?: (item: CatalogueStarter) => void
}) {
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState(0)
  const all = catalogueStarters(kind, industry)
  const choices = missingStarters(all, existing)
  const matching = choices.filter(item => `${item.name} ${item.category} ${item.unit}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const visible = matching
  const selected = choices.filter(item => selectedIds.includes(item.id))
  if (add) return <section className="catalogue-starter-suggestions"><h3>Starter suggestions</h3><label>Find a suggestion<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search names" /></label><div className="report-actions">{matching.map(item => <button type="button" key={item.id} className="filter-button" onClick={() => add(item)}>Add {item.name}</button>)}</div></section>
  if (!save || !openProducts) return null
  return <section className="panel full-panel catalogue-starter-screen">
    <h2>{all.length} starter products</h2>
    <WorkspaceHelp title="Starter product suggestions"><p>Save the selected names with their suggested category and unit. Stockroom generates an SKU. Barcodes are left blank because they differ by exact item and pack. Price, cost, opening stock and reorder level start at zero; update them for your business in Products.</p></WorkspaceHelp>
    <p>{all.length} common names for this business type. {all.length - choices.length} already match products by name; {choices.length} are available to add.</p>
    <label>Search starter products<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Product name, category or unit" /></label>
    <div className="report-actions"><button type="button" className="filter-button" disabled={!visible.length} onClick={() => setSelectedIds(current => [...new Set([...current, ...visible.map(item => item.id)])])}>Select shown matches</button><button type="button" className="text-button" disabled={!selectedIds.length} onClick={() => setSelectedIds([])}>Clear selection</button><span>{selected.length} selected</span></div>
    <fieldset className="catalogue-starter-list"><legend>{choices.length} products available to add</legend>
      {visible.map(item => <label key={item.id} className="checkbox-label"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => setSelectedIds(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])} /><span>{item.name}<small>{item.category} / {item.unit}</small></span></label>)}
      {!visible.length && <p>{query.trim() ? 'No suggestions match your search.' : 'All suggestions already match products in this catalogue.'}</p>}
    </fieldset>
    <p>Next, review the selected products and fill in the details that vary for your business. Nothing is saved until you confirm the import.</p>
    <button type="button" className="primary-button" disabled={!selected.length || busy} onClick={async () => { setBusy(true); setMessage(''); try { const count = selected.length; await save(selected); setSaved(count); setSelectedIds([]); setMessage(`${count} starter product${count === 1 ? '' : 's'} saved. Set your actual prices and stock before selling.`) } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the selected products. Review your selection and try again.') } finally { setBusy(false) } }}>{busy ? 'Saving products...' : `Save ${selected.length} selected product${selected.length === 1 ? '' : 's'}`}</button>
    {message && <p role="status">{message}</p>}
    {saved > 0 && <button type="button" className="filter-button" onClick={openProducts}>Go to Products</button>}
  </section>
}
