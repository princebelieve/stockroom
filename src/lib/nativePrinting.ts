import { registerPlugin } from '@capacitor/core'

export type HardwareCommand = { host: string; port: number; action: 'drawer' | 'cut'; pin: 0 | 1; cut: 'full' | 'partial' }
export const NativePrinting = registerPlugin<{
  print(options: { html: string; kind: 'receipt' | 'order' | 'report'; width: number }): Promise<void>
  control(options: HardwareCommand): Promise<void>
}>('StockroomPrinting')

export function printHtml(kind: 'receipt' | 'order' | 'report', width: number, test: boolean) {
  const source = document.querySelector(test ? '.printer-test' : kind === 'order' ? '.print-order' : kind === 'receipt' ? '.print-receipt' : document.body.dataset.printKind === 'product-form' ? '.blank-product-form' : '.reports-dashboard')
  if (!source) throw new Error('No document is available to print.')
  const copy = source.cloneNode(true) as HTMLElement
  copy.querySelectorAll('button, form, input, select, textarea, script, iframe, .report-actions').forEach(node => node.remove())
  // A standalone snapshot survives checkout changes while Android renders the job.
  const receiptStyle = kind === 'receipt' || kind === 'order'
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:0;padding:3mm;color:#000;font:12px ${receiptStyle ? 'monospace' : 'sans-serif'};overflow-wrap:anywhere}body{max-width:${receiptStyle ? `${width - 6}mm` : '100%'}}table{width:100%;border-collapse:collapse}td,th{padding:4px;text-align:left;border-bottom:1px solid #ccc}h1{font-size:15px}h2{font-size:18px}h3{font-size:12px}.receipt-multiline{white-space:pre-wrap}.receipt-footer{text-align:center}.receipt-section{border-top:1px dashed #888;margin-top:8px;padding-top:6px}table{table-layout:fixed;font-size:10px}td,th{padding:5px 2px}td:first-child,th:first-child{width:40%}td:nth-child(2),th:nth-child(2){width:12%}.customer-row{margin:8px 0}.customer-row small{display:block}</style></head><body>${copy.innerHTML}</body></html>`
}
