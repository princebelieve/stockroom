import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, RotateCcw, Trash2 } from 'lucide-react'
import { cloudRequest } from './lib/cloudRequest'

type DeletionStatus = { status: 'active' | 'pending'; requestedAt?: string; scheduledFor?: string; graceDays?: number; scope?: string }

export function AccountDeletionPanel({ apiUrl, token, onToken, role }: { apiUrl: string; token: string; onToken: (access: string, refresh: string) => void; role: string }) {
  const [state, setState] = useState<DeletionStatus | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)

  useEffect(() => { let live = true; if (role !== 'owner') return; setLoading(true); setError(''); void cloudRequest(apiUrl, '/v1/account-deletion/me', {}, onToken, token).then(value => { if (live) setState(value as DeletionStatus) }).catch(caught => { if (live) setError(caught instanceof Error ? caught.message : 'Could not check account deletion status.') }).finally(() => { if (live) setLoading(false) }); return () => { live = false } }, [apiUrl, token, retry, role])

  const act = async (action: 'request' | 'cancel') => {
    setBusy(true); setError('')
    try {
      const result = await cloudRequest(apiUrl, '/v1/account-deletion/me', { method: 'POST', body: JSON.stringify({ action, confirmation }) }, onToken, token) as DeletionStatus
      setState(result.status === 'active' ? { ...result, graceDays: state?.graceDays } : result); setConfirmation(''); setConfirming(false)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update account deletion request.') }
    finally { setBusy(false) }
  }

  if (role !== 'owner') return null

  return <section className="panel full-panel account-deletion-panel">
    <div className="panel-heading"><div><h2>Close your business account</h2><p>Request account deactivation and scheduled data deletion.</p></div><Trash2 size={20} /></div>
    {<p className="account-deletion-warning"><AlertTriangle size={16} /> Closing an owner account deactivates the whole business immediately, stops cloud sync on all its devices, and schedules its Stockroom cloud records for deletion. Export anything you need first. Manage recurring billing separately through Paystack or Google Play; this request does not cancel it. Offline copies on devices are not remotely erased.</p>}

    {state?.status === 'pending' ? <div className="settings-message" role="status"><p><strong>Account deactivated. Your deletion request was saved.</strong></p><p><CalendarClock size={16} /> Deletion is scheduled for <strong>{state.scheduledFor ? new Date(state.scheduledFor).toLocaleString() : 'the displayed due date'}</strong> ({state.graceDays} days after your request).</p><p>You can cancel before that date to restore access. After deletion finishes, this request cannot be undone.</p><button type="button" className="filter-button" disabled={busy} onClick={() => void act('cancel')}><RotateCcw size={16} />Cancel account deletion</button></div> : state?.status === 'active' ? <div className="account-deletion-request"><button type="button" className="filter-button" onClick={() => setConfirming(true)}>Delete business account</button>{confirming && <div role="alertdialog" aria-modal="true" aria-labelledby="closure-title" aria-describedby="closure-danger" className="modal-backdrop" onKeyDown={event => { if (event.key === 'Escape' && !busy) { setConfirming(false); setConfirmation('') } }}><div className="modal"><h2 id="closure-title">Delete your business account?</h2><p id="closure-danger">This immediately deactivates your entire business and stops cloud access for all staff and devices. Business cloud records are scheduled for permanent deletion after {state.graceDays || 14} days. Export records first. Offline copies remain, and recurring subscriptions must be cancelled separately. You can cancel the request before its scheduled deadline; completed deletion cannot be undone.</p><label>Type <strong>DELETE</strong> to confirm<input autoFocus value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" /></label><div className="closure-actions"><button type="button" className="filter-button" disabled={busy} onClick={() => { setConfirming(false); setConfirmation('') }}>Cancel</button><button type="button" className="closure-confirm" disabled={busy || confirmation !== 'DELETE'} onClick={() => void act('request')}>{busy ? 'Submitting...' : 'Confirm account deletion'}</button></div>{error && <p className="auth-error" role="alert">{error}</p>}</div></div>}<small>The waiting period is {state.graceDays || 14} days. No request is sent until you confirm.</small></div> : loading ? <p role="status">Checking deletion status...</p> : <button type="button" className="filter-button" onClick={() => setRetry(current => current + 1)}>Retry deletion status</button>}
    {error && !confirming && <p className="auth-error" role="alert">{error}</p>}
  </section>
}
