import { registerPlugin } from '@capacitor/core'

export type HardwareCommand = { host: string; port: number; action: 'drawer' | 'cut'; pin: 0 | 1; cut: 'full' | 'partial' }
export const NativePrinting = registerPlugin<{
  print(options: { html: string; kind: 'receipt' | 'report'; width: number }): Promise<void>
  control(options: HardwareCommand): Promise<void>
}>('StockroomPrinting')

export function printHtml(kind: 'receipt' | 'report', width: number, test: boolean) {
  const source = document.querySelector(test ? '.printer-test' : kind === 'receipt' ? '.print-receipt' : '.reports-dashboard')
  if (!source) throw new Error('No document is available to print.')
  const copy = source.cloneNode(true) as HTMLElement
  copy.querySelectorAll('button, form, input, select, textarea, script, iframe, .report-actions').forEach(node => node.remove())
  // A standalone snapshot survives checkout changes while Android renders the job.
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:0;padding:3mm;color:#000;font:12px ${kind === 'receipt' ? 'monospace' : 'sans-serif'};overflow-wrap:anywhere}body{max-width:${kind === 'receipt' ? `${width - 6}mm` : '100%'}}table{width:100%;border-collapse:collapse}td,th{padding:4px;text-align:left;border-bottom:1px solid #ccc}h2{font-size:18px}.customer-row{margin:8px 0}.customer-row small{display:block}</style></head><body>${copy.innerHTML}</body></html>`
}
