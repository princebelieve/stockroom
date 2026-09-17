import { AsyncForm, SubmitButton } from './AsyncControls'
import { useState } from 'react'
import { readTerminalSettings, saveTerminalSettings } from './lib/terminalSettings'

export function TerminalSettings({ businessId, defaultProvider, onSaved }: { businessId: string; defaultProvider: string; onSaved: () => void }) {
  const [settings, setSettings] = useState(() => readTerminalSettings(businessId))
  const [message, setMessage] = useState('')
  const field = (key: 'provider' | 'model' | 'terminalId' | 'host' | 'port', label: string, placeholder = '') => <label>{label}<input maxLength={200} value={settings[key]} placeholder={placeholder} onChange={event => { setSettings({ ...settings, [key]: event.target.value }); setMessage('Unsaved changes') }} /></label>
  return <AsyncForm busyLabel="Saving terminal profile..." className="settings-form" onSubmit={event => {
    event.preventDefault()
    try { setSettings(saveTerminalSettings(businessId, settings)); onSaved(); setMessage('Terminal profile saved for this business on this device. No hardware connection was made.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save terminal settings.') }
  }}>
    <h3>Payment terminal</h3>
    <p>Business provider default: <strong>{defaultProvider || 'Not set'}</strong>. The owner can change this in Business settings. The assignment below stays on this device.</p>
    {field('provider', 'Provider override', defaultProvider || 'e.g. OPay; leave blank to use business default')}
    {field('model', 'Terminal model', 'Enter when known')}
    {field('terminalId', 'Terminal ID / serial number', 'Enter when assigned')}
    <label>Planned connection<select value={settings.connection} onChange={event => { setSettings({ ...settings, connection: event.target.value as typeof settings.connection }); setMessage('Unsaved changes') }}>
      <option value="manual">Manual confirmation</option><option value="network">Network (integration unavailable)</option><option value="usb">USB (integration unavailable)</option><option value="bluetooth">Bluetooth (integration unavailable)</option><option value="sdk">Provider API / SDK (integration unavailable)</option>
    </select></label>
    {settings.connection === 'network' && <>{field('host', 'Terminal hostname / IP address', 'e.g. 192.168.1.50')}{field('port', 'Terminal port', 'Provided by the terminal vendor')}</>}
    {settings.connection !== 'manual' && <label className="checkbox-label"><input type="checkbox" checked={settings.manualFallback} onChange={event => { setSettings({ ...settings, manualFallback: event.target.checked }); setMessage('Unsaved changes') }} />Allow manual payment confirmation while integration is unavailable</label>}
    <p role="status">{settings.connection === 'manual' ? 'Manual mode: the cashier must confirm payment on the terminal and enter its reference.' : 'Integration unavailable. This profile cannot send payments or verify approvals.'}</p>
    <button type="button" className="filter-button" disabled title="A supported provider adapter must be installed first">Test connection (unavailable)</button>
    <p>API credentials belong in the secure payment backend. Do not enter keys or passwords in these fields.</p>
    <SubmitButton className="primary-button">Save terminal profile</SubmitButton><p role="status">{message}</p>
  </AsyncForm>
}
