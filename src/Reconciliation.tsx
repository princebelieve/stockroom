import { useState } from 'react'
import type { Sale } from './types'
import { AsyncForm, SubmitButton } from './AsyncControls'
import { parseReport, compareReport, type Mapping, type Comparison } from './lib/reconciliation'

export function Reconciliation({ sales }: { sales: Sale[] }) {
  const [rows, setRows] = useState<string[][]>([])
  const [fileName, setFileName] = useState('')
  const [provider, setProvider] = useState('')
  const [currency, setCurrency] = useState('NGN')
  const [success, setSuccess] = useState('SUCCESS')
  const [mapping, setMapping] = useState<Mapping>({ reference: -1, amount: -1, status: -1, currency: -1 })
  const [results, setResults] = useState<Comparison[]>([])
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  return <section id="sales-reconciliation" className="panel full-panel"><h2>Reconcile provider report</h2><p>Import a comma-separated CSV with a header row. Compare gross payment amounts in major units (e.g. 1250.00, without currency symbols or grouping separators). The file stays on this device; sales are never changed.</p>
    <label>Provider CSV<input type="file" accept=".csv,text/csv" disabled={reading} onChange={async event => {
      const file = event.target.files?.[0]; setRows([]); setResults([]); setError(''); setFileName(''); if (!file) return
      setReading(true)
      try { if (file.size > 2_000_000) throw new Error('Choose a file smaller than 2 MB.'); setRows(parseReport(await file.text())); setFileName(file.name); setMapping({ reference: -1, amount: -1, status: -1, currency: -1 }) }
      catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not read file.') }
      finally { setReading(false); event.target.value = '' }
    }} /></label>{reading && <p role="status">Reading report...</p>}{error && <p role="alert">{error}</p>}
    {!!rows.length && <AsyncForm className="settings-form" busyLabel="Comparing..." onChange={() => setResults([])} onSubmit={() => {
      const required = [mapping.reference, mapping.amount, mapping.status]
      if (required.some(index => index < 0) || new Set([...required, ...(mapping.currency < 0 ? [] : [mapping.currency])]).size !== required.length + (mapping.currency < 0 ? 0 : 1)) throw new Error('Choose different columns for reference, amount, status and currency.')
      setResults(compareReport(rows.slice(1), mapping, provider, currency.toUpperCase(), success, sales))
    }}><p>{fileName}: {rows.length - 1} rows. Comparing against {sales.length} loaded sales only.</p>
      <label>Provider name (as recorded in sales)<input required value={provider} onChange={e => setProvider(e.target.value)} /></label>
      {(Object.keys(mapping) as Array<keyof Mapping>).map(key => <label key={key}>{key} column<select value={mapping[key]} onChange={e => setMapping({ ...mapping, [key]: Number(e.target.value) })}><option value={-1}>{key === 'currency' ? 'Use report currency below' : 'Select column'}</option>{rows[0].map((header, index) => <option key={index} value={index}>{index + 1}: {header} (sample: {rows[1][index]})</option>)}</select></label>)}
      {mapping.currency < 0 && <label>Report currency<input required pattern="[A-Za-z]{3}" maxLength={3} value={currency} onChange={e => setCurrency(e.target.value)} /></label>}
      <label>Exact successful-payment status in report<input required value={success} onChange={e => setSuccess(e.target.value)} /></label><SubmitButton className="primary-button">Compare transactions</SubmitButton>
    </AsyncForm>}
    {!!results.length && <><p role="status">{results.filter(row => row.result === 'Matched').length} matched; {results.filter(row => row.result !== 'Matched').length} need review. Matching an imported file is not live provider verification.</p>
      <button className="filter-button" onClick={() => {
        const cell = (value: string) => '"' + (/^[=+@\-\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""') + '"'
        const csv = [['Reference', 'Amount', 'Result', 'Sale ID'], ...results.map(row => [row.reference, row.amount, row.result, row.saleId])].map(row => row.map(cell).join(',')).join('\r\n')
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'reconciliation.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      }}>Export comparison</button><p>Export to retain this comparison; it is not saved after leaving this screen.</p>
      <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Amount</th><th>Result</th><th>Sale</th></tr></thead><tbody>{results.slice(0, 200).map((row, i) => <tr key={i}><td>{row.reference}</td><td>{row.amount}</td><td>{row.result}</td><td>{row.saleId}</td></tr>)}</tbody></table></div>{results.length > 200 && <p>Showing first 200 rows. Export includes all rows.</p>}</>}
  </section>
}
