import { useState } from 'react'
import { AsyncButton } from './AsyncControls'
import { PrinterSettings } from './PrinterSettings'
import { HardwareSettings } from './HardwareSettings'
import { TerminalSettings } from './TerminalSettings'
import { isNativeMobile } from './lib/mobileDatabase'
import { isBrowserPwa } from './lib/platform'
import { printDocument } from './lib/printing'
import { controlHardware } from './lib/hardware'
import { canRecordTerminalPayment, readTerminalSettings } from './lib/terminalSettings'
import { deviceLabels, readDeviceProfile, saveDeviceProfile, scannerSettings, type DeviceKind } from './lib/deviceSetup'

type Props = { businessId: string; defaultProvider: string; onTerminalSaved: () => void; createPairing: () => Promise<void>; openSecondMonitor: () => Promise<void>; pairing: { url: string } | null; scan: () => Promise<string | undefined> }

export function DeviceSetup(props: Props) {
  const [kind, setKind] = useState<DeviceKind | null>(null)
  const [revision, setRevision] = useState(0)
  return <section className="settings-form device-setup"><h3>Device setup wizard</h3><p>Set up each device on this checkout. Enter the model from its label or manual; a model name alone does not install a driver.</p>
    {!kind ? <div className="device-grid">{(Object.keys(deviceLabels) as DeviceKind[]).map(device => {
      const profile = readDeviceProfile(device, props.businessId)
      return <button type="button" className="filter-button" key={`${device}-${revision}`} onClick={() => setKind(device)}><strong>{deviceLabels[device]}</strong><span>{profile ? `${profile.model || 'Device'} · ${profile.status === 'confirmed' ? 'Test confirmed by user' : profile.status === 'unavailable' ? 'Integration unavailable' : device === 'terminal' ? 'Manual settings saved — automatic integration unavailable' : 'Configured — test needed'}` : 'Not set up'}</span></button>
    })}</div> : <SetupSteps key={kind} {...props} kind={kind} close={() => { setKind(null); setRevision(v => v + 1) }} />}
  </section>
}

function SetupSteps({ kind, close, ...props }: Props & { kind: DeviceKind; close: () => void }) {
  const previous = readDeviceProfile(kind, props.businessId)
  const [step, setStep] = useState(1)
  const [model, setModel] = useState(previous?.model || '')
  const [connection, setConnection] = useState(previous?.connection || (kind === 'scanner' ? scannerSettings().mode : kind === 'display' ? 'monitor' : kind === 'drawer' || kind === 'cutter' ? 'network' : 'system'))
  const [suffix, setSuffix] = useState(scannerSettings().suffix)
  const [attempted, setAttempted] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [sample, setSample] = useState('')
  const native = isNativeMobile()
  const hardware = kind === 'drawer' || kind === 'cutter'
  const terminal = readTerminalSettings(props.businessId)
  const unavailable = hardware ? connection !== 'network' || (!native && !window.stockroomDesktop) : kind === 'display' ? native || isBrowserPwa() || (connection === 'monitor' && !window.stockroomDesktop) : kind === 'terminal' ? !canRecordTerminalPayment(terminal) : false
  const choices = hardware ? [['network', 'Network ESC/POS'], ['usb', 'Direct USB (no adapter)'], ['bluetooth', 'Direct Bluetooth (no adapter)']] : kind === 'scanner' ? [['keyboard', 'USB / Bluetooth keyboard scanner'], ['camera', 'Device camera']] : kind === 'display' ? [['monitor', 'Second monitor (Windows app)'], ['lan', 'Phone / tablet on shop Wi-Fi']] : [['system', native ? 'Android print service' : window.stockroomDesktop ? 'Installed Windows printer driver' : 'Browser print dialog']]
  const guidance = hardware ? 'Use an ESC/POS-compatible network printer with a drawer connector or cutter. Read its manual for the port, drawer pin and supported cut mode. USB/Bluetooth command adapters are not installed.' : kind === 'scanner' ? 'Keyboard scanners must be paired with the operating system and configured for keyboard/HID output. Set the same terminator here and in the scanner manual. Serial-only scanners need an adapter.' : kind === 'display' ? 'A standard monitor needs no model-specific driver here. Extend the Windows desktop, or connect a browser-equipped customer device to the same shop Wi-Fi. Serial pole displays are not supported.' : kind === 'terminal' ? 'Enter the actual provider, model and terminal ID below. Cashiers scan the receipt barcode/QR, read a receipt photo, or type its reference, then check approval, amount and currency. Direct terminal integration is not required for this workflow.' : native ? 'Enable the printer manufacturer’s compatible Android print service. USB/Bluetooth support depends on that service. Match the paper size in the print dialog.' : window.stockroomDesktop ? 'Install the manufacturer’s Windows printer driver first. Then refresh the printer list and choose the installed queue. Match the receipt paper size in Windows preferences.' : 'Install or pair the printer through your operating system. Select it in the browser print dialog.'
  function configured() {
    const currentTerminal = readTerminalSettings(props.businessId)
    saveDeviceProfile(kind, props.businessId, { model: kind === 'terminal' ? currentTerminal.model : model, connection: kind === 'terminal' ? currentTerminal.connection : connection, status: (kind === 'terminal' ? !canRecordTerminalPayment(currentTerminal) : unavailable) ? 'unavailable' : 'configured' })
    setAttempted(false); setConfirmed(false); setMessage(''); setStep(3)
  }
  async function test() {
    setBusy(true); setAttempted(false); setConfirmed(false); setMessage('')
    try {
      if (kind === 'receipt' || kind === 'report') await printDocument(kind, undefined, true)
      else if (hardware) await controlHardware(kind === 'drawer' ? 'drawer' : 'cut')
      else if (kind === 'display') { if (connection === 'monitor') await props.openSecondMonitor(); else await props.createPairing() }
      else if (kind === 'scanner') {
        const value = await props.scan()
        if (!value) throw new Error('No barcode was read. Try again; camera support depends on this device.')
        setSample(value)
      }
      setAttempted(true)
      setMessage('Check the actual device result before confirming below. A submitted request is not proof of success.')
    } finally { setBusy(false) }
  }
  return <div><h4>{deviceLabels[kind]} setup</h4><p aria-live="polite">Step {step} of 3: {step === 1 ? 'Identify' : step === 2 ? 'Configure' : 'Test and finish'}</p>
    <fieldset className="submission-fields" disabled={busy}>
    {step === 1 && <><p>{guidance}</p>{kind !== 'terminal' && <label>Manufacturer and model<input value={model} maxLength={200} placeholder={kind === 'display' ? 'Optional for standard monitors/tablets' : 'Enter the model printed on the device'} onChange={e => setModel(e.target.value)} /></label>}
      {kind !== 'terminal' && <label>Connection / printing method<select value={connection} onChange={e => setConnection(e.target.value)}>{choices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      <button type="button" className="primary-button" disabled={!model.trim() && !['display', 'terminal'].includes(kind)} onClick={() => setStep(2)}>Continue to configuration</button></>}
    {step === 2 && <><p>{guidance}</p>
      {(kind === 'receipt' || kind === 'report') && <PrinterSettings onConfigured={configured} />}
      {hardware && (unavailable ? <><p role="status">This connection cannot send drawer/cutter commands. Save the device details for later, or choose Network ESC/POS.</p><AsyncButton onClick={configured}>Save device details</AsyncButton></> : <HardwareSettings onConfigured={configured} />)}
      {kind === 'terminal' && <TerminalSettings businessId={props.businessId} defaultProvider={props.defaultProvider} onSaved={() => { props.onTerminalSaved(); configured() }} />}
      {kind === 'scanner' && <>{connection === 'keyboard' && <label>Scanner terminator<select value={suffix} onChange={e => setSuffix(e.target.value as 'Enter' | 'Tab')}><option value="Enter">Enter</option><option value="Tab">Tab</option></select></label>}<AsyncButton className="primary-button" onClick={() => { localStorage.setItem('stockroom-scanner', JSON.stringify({ mode: connection, suffix })); configured() }}>Save scanner settings</AsyncButton></>}
      {kind === 'display' && <><p>{connection === 'monitor' ? 'Windows display settings must use Extend. The app opens the first non-primary display; arrange your screens in Windows before testing.' : 'Pairing links expire after five minutes. A paired browser can view the basket but cannot edit it. Allow the local display service through the shop computer’s firewall if needed.'}</p><AsyncButton className="primary-button" onClick={() => { localStorage.setItem('stockroom-display', JSON.stringify({ connection })); configured() }}>Save display setup</AsyncButton></>}
    </>}
    {step === 3 && <><p>{unavailable ? 'Integration unavailable on this platform or connection. Device details are saved, but this feature is not ready to operate.' : kind === 'terminal' ? 'Manual payment mode only. Check the provider/model against your terminal and confirm that staff can read its approval/reference. This does not test or verify a payment.' : 'Run the test, then confirm what you observed on the device.'}</p>
      {!unavailable && kind === 'terminal' && <p>Provider: {terminal.provider || props.defaultProvider || 'Not set'} · Model: {terminal.model || 'Not set'} · ID: {terminal.terminalId || 'Not set'}. Receipt confirmation does not require a direct terminal connection.</p>}
      {!unavailable && kind === 'scanner' && connection === 'keyboard' ? <label>Scan a known barcode into this field<input value={sample} onChange={e => { setSample(e.target.value); setAttempted(false); setConfirmed(false) }} onKeyDown={e => { if (e.key === suffix) { e.preventDefault(); setAttempted(Boolean(e.currentTarget.value.trim())); setMessage('Compare the captured value with the barcode on the product.') } }} /></label> : !unavailable && kind !== 'terminal' && <AsyncButton className="filter-button" busyLabel="Testing..." onClick={test}>{kind === 'display' ? 'Open test display / pairing link' : kind === 'scanner' ? 'Test camera scan' : kind === 'drawer' ? 'Test: open drawer' : kind === 'cutter' ? 'Test: feed and cut paper' : 'Print test page'}</AsyncButton>}
      {kind === 'scanner' && sample && <p>Captured: <strong>{sample}</strong></p>}
      {kind === 'display' && attempted && props.pairing && <p>Open this link on the customer device: <a href={props.pairing.url} target="_blank" rel="noreferrer">{props.pairing.url}</a></p>}
      {hardware && <p>Wait for any receipt to finish before testing the cutter. The drawer pulse is 50 ms on / 500 ms off; confirm compatibility in the manual.</p>}
      {!unavailable && kind !== 'terminal' && <label className="checkbox-label"><input type="checkbox" checked={confirmed} disabled={!attempted} onChange={e => setConfirmed(e.target.checked)} />I observed the correct {kind === 'scanner' ? 'barcode value' : kind === 'display' ? 'customer display on the intended screen' : hardware ? 'physical operation' : 'printed output'}.</label>}
      <p role="status">{message}</p>
      <AsyncButton className="primary-button" onClick={() => { saveDeviceProfile(kind, props.businessId, { model: kind === 'terminal' ? terminal.model : model, connection: kind === 'terminal' ? terminal.connection : connection, status: unavailable ? 'unavailable' : confirmed ? 'confirmed' : 'configured' }); close() }}>{unavailable ? 'Finish — integration unavailable' : kind === 'terminal' ? 'Finish — manual mode only' : confirmed ? 'Finish — test confirmed' : 'Finish — testing still needed'}</AsyncButton>
    </>}
    <div className="report-actions">{step > 1 && <button type="button" className="filter-button" onClick={() => { setStep(step - 1); setAttempted(false); setConfirmed(false) }}>Back</button>}<button type="button" className="filter-button" onClick={close}>Close setup</button></div>
    </fieldset>
  </div>
}
