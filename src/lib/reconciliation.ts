import type { Sale } from '../types'

export function referenceFromScan(raw: string): string {
  let value = raw.trim()
  const keys = ['reference', 'paymentReference', 'transactionReference', 'transactionId', 'rrn']
  if (value.startsWith('{')) {
    const parsed = JSON.parse(value)
    const candidates = keys.map(key => parsed[key]).filter(item => typeof item === 'string' && item.trim())
    if (new Set(candidates).size !== 1) throw new Error('QR data must contain one unambiguous reference. Enter the reference printed on the receipt.')
    value = candidates[0].trim()
  } else if (/^https?:\/\//i.test(value)) {
    const url = new URL(value)
    const candidates = keys.flatMap(key => url.searchParams.getAll(key)).filter(Boolean)
    if (new Set(candidates).size !== 1) throw new Error('This QR link does not contain one identifiable payment reference.')
    value = candidates[0].trim()
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,119}$/.test(value)) throw new Error('Unrecognized reference format. Enter the reference printed on the receipt.')
  return value
}

export function parseReport(text: string): string[][] {
  if (text.length > 2_000_000) throw new Error('Choose a CSV smaller than 2 MB.')
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false; let closed = false
  text = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') { quoted = false; closed = true }
      else field += c
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field); field = ''; closed = false
      if (c !== ',') { if (row.some(cell => cell.trim())) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++ }
    } else if (c === '"' && !field && !closed) quoted = true
    else { if (closed || c === '"') throw new Error('Malformed CSV quoting. Export as comma-separated CSV.'); field += c }
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.')
  row.push(field); if (row.some(cell => cell.trim())) rows.push(row)
  if (rows.length < 2 || rows.length > 10001) throw new Error('CSV must contain headers and 1–10,000 transaction rows.')
  if (rows.some(row => row.length !== rows[0].length)) throw new Error('CSV rows must have the same number of columns as the header.')
  return rows
}

export type Mapping = { reference: number; amount: number; status: number; currency: number }
export type Comparison = { reference: string; amount: string; result: string; saleId: string }
export function compareReport(rows: string[][], mapping: Mapping, provider: string, currency: string, success: string, sales: Sale[]): Comparison[] {
  const refs = new Map<string, number>()
  rows.forEach(row => { const ref = row[mapping.reference]?.trim(); if (ref) refs.set(ref, (refs.get(ref) || 0) + 1) })
  return rows.map(row => {
    const reference = row[mapping.reference]?.trim() || ''; const amount = row[mapping.amount]?.trim() || ''
    const result = (message: string, saleId = '') => ({ reference, amount, result: message, saleId })
    if (!reference || !/^\d+(\.\d{1,2})?$/.test(amount)) return result('Invalid reference or amount')
    if ((refs.get(reference) || 0) > 1) return result('Duplicate reference in report')
    if (row[mapping.status]?.trim().toLowerCase() !== success.trim().toLowerCase()) return result('Provider status is not the selected success status')
    const rowCurrency = mapping.currency < 0 ? currency : row[mapping.currency]?.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(rowCurrency || '')) return result('Invalid currency')
    const matches = sales.filter(sale => sale.paymentMethod === 'external-pos' && sale.terminalProvider?.trim().toLowerCase() === provider.trim().toLowerCase() && sale.paymentReference?.trim() === reference)
    if (!matches.length) return result('No matching loaded sale')
    if (matches.length > 1) return result('Duplicate reference in sales')
    const sale = matches[0]
    if (!sale.currency) return result('Review: historical sale currency unavailable', sale.id)
    if (sale.currency !== rowCurrency) return result('Currency mismatch', sale.id)
    if (Math.round(Number(amount) * 100) !== Math.round(sale.total * 100)) return result('Amount mismatch', sale.id)
    return result('Matched', sale.id)
  })
}
