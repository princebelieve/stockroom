import { useState } from 'react'

export function RemoveStaffButton({ member, onRemove }: { member: { id: string; name: string }; onRemove: (id: string, password: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function cancel() { setOpen(false); setPassword(''); setError('') }
  async function confirm() {
    setBusy(true); setError('')
    try { await onRemove(member.id, password); cancel() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not remove staff. Check the connection and retry.') }
    finally { setBusy(false) }
  }
  return <><button type="button" className="text-button" onClick={() => setOpen(true)}>Remove staff</button>{open && <div className="modal-backdrop" role="alertdialog" aria-modal="true" aria-label={`Remove ${member.name}?`} onKeyDown={event => { if (event.key === 'Escape' && !busy) cancel() }}><div className="modal"><h2>Remove {member.name}?</h2><p>This revokes their staff access. Their sales and activity history remain. Other staff and the business stay active. Connected devices receive the removal through sync; disconnected devices keep their existing access until they reconnect and sync. This requires an internet connection and your owner password.</p><label>Owner password<input autoFocus type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label><div className="closure-actions"><button type="button" className="filter-button" disabled={busy} onClick={cancel}>Cancel</button><button type="button" className="closure-confirm" disabled={busy || !password} onClick={() => void confirm()}>{busy ? 'Removing...' : 'Confirm staff removal'}</button></div>{error && <p role="alert" className="auth-error">{error}</p>}</div></div>}</>
}
