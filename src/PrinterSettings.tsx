import { AsyncButton } from './AsyncControls'
import { useEffect, useState } from 'react'
import { printerSettings, printDocument, type InstalledPrinter } from './lib/printing'

export function PrinterSettings() {
  const [settings, setSettings] = useState(printerSettings)
  const [printers, setPrinters] = useState<InstalledPrinter[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function refresh() {
    try { setPrinters(await window.stockroomDesktop!.listPrinters()); setMessage('') }
    catch (error) { setMessage(String(error)) }
  }
  useEffect(() => { if (window.stockroomDesktop) void refresh() }, [])
  return <section className="settings-form"><h3>Printers &amp; hardware</h3><p>Printer preferences apply only to this computer. Install the Windows driver before selecting a printer.</p>
    {!window.stockroomDesktop ? <p>Open the Windows desktop app to select installed printers. Browser printing uses the system print dialog.</p> : <>
      <AsyncButton busyLabel="Loading printers..." className="filter-button" onClick={refresh}>Refresh printer list</AsyncButton>
      {(['receipt', 'report'] as const).map(kind => <label key={kind}>{kind === 'receipt' ? 'Receipt printer' : 'A4 report printer'}<select value={settings[kind]} onChange={event => setSettings({ ...settings, [kind]: event.target.value })}><option value="">Ask each time (print dialog)</option>{settings[kind] && !printers.some(p => p.name === settings[kind]) && <option value={settings[kind]}>{settings[kind]} (unavailable)</option>}{printers.map(p => <option key={p.name} value={p.name}>{p.displayName || p.name}</option>)}</select></label>)}
    </>}
    <label>Receipt width<select value={settings.width} onChange={event => setSettings({ ...settings, width: Number(event.target.value) as 58 | 80 })}><option value={58}>58 mm</option><option value={80}>80 mm</option></select><span>Set matching roll paper size in the Windows printer preferences too.</span></label>
    <label className="checkbox-label"><input type="checkbox" checked={settings.automatic} onChange={event => setSettings({ ...settings, automatic: event.target.checked })} />Print receipt automatically after each sale</label>
    <AsyncButton busyLabel="Saving printer settings..." className="primary-button" onClick={() => { try { localStorage.setItem('stockroom-printers', JSON.stringify(settings)); setMessage('Printer settings saved on this computer.') } catch { setMessage('Could not save printer settings.') } }}>Save printer settings</AsyncButton>
    {(['receipt', 'report'] as const).map(kind => <AsyncButton key={kind} busyLabel="Printing..." className="filter-button" disabled={busy} onClick={async () => { setBusy(true); try { await printDocument(kind, settings, true); setMessage('Print request completed. Check the printer output.') } catch (error) { setMessage(String(error)) } finally { setBusy(false) } }}>Test {kind === 'receipt' ? 'receipt' : 'A4'} print</AsyncButton>)}
    <p role="status">{message}</p>
  </section>
}
