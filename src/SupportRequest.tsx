import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { AsyncForm, SubmitButton } from './AsyncControls'
import { posRequest } from './PosTools'

export function SupportRequest({ headers, scope }: { headers: Record<string, string>; scope: string }) {
  const key = `stockroom-support-draft:${scope}`
  const fresh = () => ({ id: crypto.randomUUID(), name: '', email: '', subject: '', message: '', locked: false })
  const [draft, setDraft] = useState(() => { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(key) || '{}') } } catch { return fresh() } })
  const [result, setResult] = useState('')
  function save(patch: Partial<typeof draft>) { const next = { ...draft, ...patch }; setDraft(next); localStorage.setItem(key, JSON.stringify(next)) }
  return <details><summary>Send a support request</summary><p>Your draft stays on this device while offline. Press Send when connected. Replies go to your contact email. Keep passwords and card details out of the message.</p><AsyncForm busyLabel="Sending support request..." onSubmit={async () => {
    if (![draft.name, draft.subject, draft.message].every(value => value.trim()) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(draft.email.trim())) throw new Error('Complete the contact details and describe your issue.')
    if (!navigator.onLine) { setResult('Draft saved on this device. Send it when connected.'); return }
    save({ locked: true }); setResult('')
    const response = await posRequest('/api/integrations/support/requests', headers, { ...draft, appVersion: Capacitor.getPlatform() === 'android' ? __STOCKROOM_ANDROID_VERSION__ : __STOCKROOM_WINDOWS_VERSION__, platform: navigator.userAgent })
    setResult(`Support request ${response.reference} sent. Support will reply to ${draft.email}.`)
    localStorage.removeItem(key); setDraft(fresh())
  }}><fieldset disabled={draft.locked}><label>Your name<input required maxLength={100} value={draft.name} onChange={event => save({ name: event.target.value })} /></label><label>Contact email<input required type="email" maxLength={254} value={draft.email} onChange={event => save({ email: event.target.value })} /></label><label>Subject<input required maxLength={150} value={draft.subject} onChange={event => save({ subject: event.target.value })} /></label><label>What happened?<textarea required maxLength={5000} value={draft.message} onChange={event => save({ message: event.target.value })} /></label></fieldset><p>Reference: {draft.id}</p><SubmitButton className="primary-button">{draft.locked ? 'Retry saved request' : 'Send support request'}</SubmitButton>{draft.locked && <button type="button" className="filter-button" onClick={()=>{localStorage.removeItem(key);setDraft(fresh());setResult('')}}>Start another request</button>}</AsyncForm>{result && <p role="status">{result}</p>}</details>
}
