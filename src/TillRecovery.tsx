import { useEffect, useState } from 'react'
import { AsyncButton, AsyncForm, SubmitButton } from './AsyncControls'
import { cloudRequest } from './lib/cloudRequest'
import { checkoutTillId } from './lib/checkoutTill'

type Binding = { tillId: string; deviceId: string; deviceLabel: string; retired: boolean; revoked: boolean }
type Recovery = { requestId: string; sourceDeviceId: string; targetDeviceId: string; tillId: string; currentTillId: string }
export function TillRecovery({ apiUrl, token, headers, businessId, onToken }: { apiUrl: string; token: string; headers: Record<string, string>; businessId: string; onToken: (token: string, refresh: string) => void }) {
  const pendingKey = `stockroom-till-recovery:${businessId}`
  const [pending, setPending] = useState<Recovery | null>(() => { try { return JSON.parse(localStorage.getItem(pendingKey) || 'null') } catch { return null } })
  const [context, setContext] = useState<{ deviceId: string; tillId: string } | null>(null)
  const [tills, setTills] = useState<Binding[]>([])
  const [selected, setSelected] = useState(pending?.tillId || '')
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [stopped, setStopped] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const request = (path: string, init: RequestInit = {}) => cloudRequest(apiUrl, path, init, onToken, token)
  async function local(path: string) {
    const response = await fetch(path, { method: 'POST', headers: { ...headers, 'X-Stockroom-Till': checkoutTillId() } })
    const data = await response.json()
    if (!response.ok || data.lastError) throw new Error(data.error || data.lastError || 'Recovery preparation failed.')
    return data
  }
  async function refresh() {
    setMessage('')
    const registered = await local('/api/till-recovery/register')
    setContext(registered)
    const data = await request('/v1/till-recovery/tills')
    setTills(data.tills)
  }
  useEffect(() => { if (open) { setPassword(''); setConfirmation(''); setStopped(false); setReviewed(false) } }, [open])
  const source = tills.find(till => till.tillId === selected && till.deviceId !== context?.deviceId)
  return <section className="settings-form"><h3>Lost or broken till recovery</h3><p>Recover the original checkout identity on this replacement device. Saved receipts, bills, preparation deductions and job payments retain their IDs.</p><p>Recovery restores synchronized history. It cannot recover work that never reached the cloud.</p><AsyncButton className="filter-button" onClick={refresh}>Load recoverable tills</AsyncButton>{context && <><p>This enrolled device: {context.deviceId}</p><label>Lost checkout<select value={selected} onChange={event => setSelected(event.target.value)} disabled={Boolean(pending)}><option value="">Choose a checkout</option>{pending && !tills.some(till => till.tillId === pending.tillId && till.deviceId !== context.deviceId) && <option value={pending.tillId}>Pending recovery: {pending.tillId}</option>}{tills.filter(till => till.deviceId !== context.deviceId).map(till => <option key={till.tillId} value={till.tillId}>{till.deviceLabel} / {till.tillId}{till.revoked ? ' (revoked)' : ''}</option>)}</select></label><button className="primary-button" type="button" disabled={!pending && !source} onClick={() => setOpen(true)}>{pending ? 'Resume pending recovery' : 'Recover checkout on this device'}</button></>}{message && <p role="status">{message}</p>}
    {open && <div className="modal-backdrop"><section className="modal" role="alertdialog" aria-modal="true" aria-labelledby="till-recovery-title"><h3 id="till-recovery-title">Recover this lost till?</h3><p>The original device's cloud access will be permanently retired, including its other checkouts. Stop using it. Use a new enrollment ID if the hardware is later reused.</p><p>Before continuing, review payments, prepared food and physical stock from the original device. Reconcile anything that did not synchronize. Finish or cancel active work on this replacement checkout first.</p>{message && <p role="alert" className="auth-error">{message}</p>}<AsyncForm onSubmit={async () => {
      setBusy(true); setMessage('')
      try {
        const status = await local('/api/sync/now')
        if (!status.configured || status.pending || status.conflicts) throw new Error('Synchronize all changes and resolve conflicts before recovery.')
        const recovery = pending || { requestId: crypto.randomUUID(), sourceDeviceId: source!.deviceId, targetDeviceId: context!.deviceId, tillId: source!.tillId, currentTillId: checkoutTillId() }
        localStorage.setItem(pendingKey, JSON.stringify(recovery)); setPending(recovery)
        const result = await request('/v1/till-recovery/recover', { method: 'POST', body: JSON.stringify({ ...recovery, ownerPassword: password, confirmation, sourceStopped: stopped, activityReviewed: reviewed }) })
        localStorage.setItem('stockroom-checkout-till-id', result.tillId)
        const restored = await local('/api/sync/pull')
        if (!restored.configured) throw new Error('Cloud recovery completed. Reconnect and resume to finish downloading history.')
        localStorage.removeItem(pendingKey)
        window.location.reload()
      } catch (error) { setMessage(`${error instanceof Error ? error.message : 'Recovery failed.'} If the reply was interrupted, resume this same request.`) } finally { setPassword(''); setBusy(false) }
    }}><fieldset disabled={busy}><label>Owner password<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label><label><input type="checkbox" checked={stopped} onChange={event => setStopped(event.target.checked)} />The original device is stopped and will no longer transact</label><label><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I reconciled unsynchronized payments, preparation and stock</label><label>Type RECOVER<input required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label><button type="button" className="filter-button" onClick={() => { setPassword(''); setOpen(false) }}>Cancel</button><SubmitButton className="closure-confirm" disabled={!password || !stopped || !reviewed || confirmation !== 'RECOVER'}>Confirm till recovery</SubmitButton></fieldset></AsyncForm></section></div>}
  </section>
}
