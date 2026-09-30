import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, RotateCcw, Trash2 } from 'lucide-react'
import { cloudRequest } from './lib/cloudRequest'

type DeletionStatus = { status: 'active' | 'pending'; requestedAt?: string; scheduledFor?: string; graceDays?: number; scope?: string }

export function AccountDeletionPanel({ apiUrl, token, onToken, role }: { apiUrl: string; token: string; onToken: (access: string, refresh: string) => void; role: string }) {
  const [state, setState] = useState<DeletionStatus | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { let live = true; void cloudRequest(apiUrl, '/v1/account-deletion/me', {}, onToken, token).then(value => { if (live) setState(value as DeletionStatus) }).catch(caught => { if (live) setError(caught instanceof Error ? caught.message : 'Could not check account deletion status.') }); return () => { live = false } }, [apiUrl, token])

  const act = async (action: 'request' | 'cancel') => {
    setBusy(true); setError('')
    try {
      const result = await cloudRequest(apiUrl, '/v1/account-deletion/me', { method: 'POST', body: JSON.stringify({ action, confirmation }) }, onToken, token) as DeletionStatus
      setState(result); setConfirmation('')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update account deletion request.') }
    finally { setBusy(false) }
  }

  return <section className="panel full-panel account-deletion-panel">
    <div className="panel-heading"><div><h2>Close your Stockroom account</h2><p>Request account deactivation and scheduled data deletion.</p></div><Trash2 size={20} /></div>
    {role === 'owner' && <p className="account-deletion-warning"><AlertTriangle size={16} /> Closing an owner account deactivates the whole business immediately, stops cloud sync on all its devices, and schedules its Stockroom cloud records for deletion. Export anything you need first. Offline copies on devices are not remotely erased.</p>}
    {role !== 'owner' && <p>Your sign-in is deactivated immediately. Your business owner can still manage the business; your account profile is scheduled for deletion. A device already holding an offline session may retain its local copy until that device is cleared.</p>}
    {state?.status === 'pending' ? <div className="settings-message"><p><CalendarClock size={16} /> Deletion is scheduled for <strong>{state.scheduledFor ? new Date(state.scheduledFor).toLocaleString() : 'the displayed due date'}</strong> ({state.graceDays} days after your request).</p><p>You can cancel before that date to restore access. After deletion finishes, this request cannot be undone.</p><button type="button" className="filter-button" disabled={busy} onClick={() => void act('cancel')}><RotateCcw size={16} />Cancel account deletion</button></div> : state?.status === 'active' ? <div className="account-deletion-request"><label>Type <strong>DELETE</strong> to confirm<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" /></label><button type="button" className="filter-button" disabled={busy || confirmation !== 'DELETE'} onClick={() => void act('request')}>{busy ? 'Submitting...' : 'Deactivate and schedule deletion'}</button><small>The developer configured a {state.graceDays || 90}-day waiting period. Deactivation starts as soon as you submit.</small></div> : <p role="status">Checking deletion status...</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
  </section>
}
