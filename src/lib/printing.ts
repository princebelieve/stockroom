import { isNativeMobile } from './mobileDatabase'

export type PrinterSettings = { receipt: string; report: string; width: 58 | 80; automatic: boolean }
export type InstalledPrinter = { name: string; displayName: string }
declare global {
  interface Window { stockroomDesktop?: {
    openCustomerDisplay: (url: string) => Promise<void>
    listPrinters: () => Promise<InstalledPrinter[]>
    print: (options: { kind: 'receipt' | 'report'; deviceName: string; width: number }) => Promise<void>
    control: (options: import('./nativePrinting').HardwareCommand) => Promise<void>
  } }
}
export function printerSettings(): PrinterSettings {
  try {
    const value = JSON.parse(localStorage.getItem('stockroom-printers') || '{}')
    return { receipt: typeof value.receipt === 'string' ? value.receipt : '', report: typeof value.report === 'string' ? value.report : '', width: value.width === 58 ? 58 : 80, automatic: value.automatic === true }
  } catch { return { receipt: '', report: '', width: 80, automatic: false } }
}
let printing = false
export async function printDocument(kind: 'receipt' | 'report', settings = printerSettings(), test = false) {
  if (printing) throw new Error('A print job is already in progress.')
  printing = true
  document.body.dataset.printKind = test ? 'test' : kind
  document.documentElement.style.setProperty('--receipt-width', test && kind === 'report' ? '190mm' : `${settings.width}mm`)
  const sample = test ? document.createElement('section') : null
  if (sample) { sample.className = 'printer-test'; sample.textContent = `Stockroom ${kind === 'receipt' ? `${settings.width} mm receipt` : 'A4 report'} test print — ${new Date().toLocaleString()}`; document.body.append(sample) }
  try {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    if (isNativeMobile()) {
      const { NativePrinting, printHtml } = await import('./nativePrinting')
      await NativePrinting.print({ html: printHtml(kind, settings.width, test), kind, width: settings.width })
    } else if (window.stockroomDesktop) await window.stockroomDesktop.print({ kind, deviceName: settings[kind], width: settings.width })
    else window.print()
  } finally {
    sample?.remove()
    delete document.body.dataset.printKind
    printing = false
  }
}
