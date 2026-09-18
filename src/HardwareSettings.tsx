import { useState } from 'react'
import { AsyncButton } from './AsyncControls'
import { controlHardware, hardwareSettings, saveHardwareSettings } from './lib/hardware'
import { isNativeMobile } from './lib/mobileDatabase'

export function HardwareSettings({ onConfigured }: { onConfigured?: () => void } = {}) {
  const [settings, setSettings] = useState(hardwareSettings)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  if (!window.stockroomDesktop && !isNativeMobile()) return null
  async function run(action: 'drawer' | 'cut') {
    setBusy(true)
    try {
      await controlHardware(action, settings)
      setMessage('Command sent. Check the device; delivery does not confirm physical operation.')
    } catch (error) { setMessage(String(error)) }
    finally { setBusy(false) }
  }
  return <section className="settings-form"><h3>Cash drawer &amp; paper cutter</h3>
    <p>For a network ESC/POS receipt printer. Connect the cash drawer to its drawer port. These controls do not support direct USB or Bluetooth connections.</p>
    <label>Printer hostname / IPv4 address<input value={settings.host} maxLength={253} placeholder="192.168.1.50" onChange={e => setSettings({ ...settings, host: e.target.value })} /></label>
    <label>Printer TCP port<input type="number" min={1} max={65535} value={settings.port} onChange={e => setSettings({ ...settings, port: Number(e.target.value) })} /></label>
    <label>Drawer connector pin<select value={settings.pin} onChange={e => setSettings({ ...settings, pin: Number(e.target.value) as 0 | 1 })}><option value={0}>Pin 2</option><option value={1}>Pin 5</option></select></label>
    <label>Paper cut<select value={settings.cut} onChange={e => setSettings({ ...settings, cut: e.target.value as 'full' | 'partial' })}><option value="partial">Partial cut</option><option value="full">Full cut</option></select></label>
    <AsyncButton className="primary-button" busyLabel="Saving..." onClick={() => { try { setSettings(saveHardwareSettings(settings)); setMessage('Hardware settings saved on this device.'); onConfigured?.() } catch (error) { setMessage(String(error)) } }}>Save hardware settings</AsyncButton>
    <AsyncButton className="filter-button" busyLabel="Opening drawer..." disabled={busy || !settings.host} onClick={() => run('drawer')}>Open cash drawer</AsyncButton>
    <AsyncButton className="filter-button" busyLabel="Sending cut command..." disabled={busy || !settings.host} onClick={() => run('cut')}>Feed &amp; cut paper</AsyncButton>
    <p>Wait for the receipt to finish before cutting. Commands are manual and are never retried automatically. Check your printer manual for cutter support and drawer pulse compatibility (50 ms on, 500 ms off).</p>
    <p role="status">{message}</p>
  </section>
}
