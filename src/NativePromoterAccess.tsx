import { useEffect, useState } from 'react'
import { Copy, Share2, X } from 'lucide-react'
import { portalRequest, visitorPortalKeys } from './lib/portalApi'
import { shareLink } from './lib/shareLink'
import './native-promoter.css'

type PromoterWallet = { referrer: { name: string; email: string }; link: string }

const api = __STOCKROOM_SYNC_API_URL__.replace(/\/$/, '')

export function NativePromoterAccess({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [wallet, setWallet] = useState<PromoterWallet | null>(null)
  const [registering, setRegistering] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadWallet = async () => {
    const data = await portalRequest<PromoterWallet>('/v1/referral-wallet/me', {}, visitorPortalKeys)
    setWallet(data)
    setEmail(data.referrer.email || '')
    setError('')
  }

  useEffect(() => {
    if (!open) return
    const token = localStorage.getItem(visitorPortalKeys.access) || sessionStorage.getItem(visitorPortalKeys.session)
    if (token) void loadWallet().catch(() => {
      localStorage.removeItem(visitorPortalKeys.access)
      sessionStorage.removeItem(visitorPortalKeys.session)
      setWallet(null)
    })
  }, [open])

  const authenticate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch(`${api}/v1/visitors/${registering ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
        signal: AbortSignal.timeout(20000),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not sign in to the promoter account.')
      localStorage.setItem(visitorPortalKeys.access, data.accessToken)
      sessionStorage.setItem(visitorPortalKeys.session, data.accessToken)
      setPassword('')
      await loadWallet()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in to the promoter account.')
    } finally { setBusy(false) }
  }

  const copy = async () => {
    if (!wallet?.link) return
    try {
      await navigator.clipboard.writeText(wallet.link)
      setMessage('Referral link copied.')
    } catch { setError('Could not copy the link. Use Share link to send it from this device.') }
  }

  const share = async () => {
    if (!wallet?.link) return
    try {
      await shareLink({ title: 'Share Stockroom', text: 'Start a Stockroom business with my referral link:', url: wallet.link })
      setMessage('Choose where to share your referral link.')
    } catch (caught) {
      if (caught instanceof Error && /cancel/i.test(caught.message)) return
      setError(caught instanceof Error ? caught.message : 'Could not open the share menu.')
    }
  }

  const signOut = () => {
    localStorage.removeItem(visitorPortalKeys.access)
    sessionStorage.removeItem(visitorPortalKeys.session)
    setWallet(null); setMessage(''); setError('')
  }

  if (!open) return null
  return <div className="native-promoter-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="native-promoter-card" role="dialog" aria-modal="true" aria-labelledby="native-promoter-title">
      <button type="button" className="native-promoter-close" aria-label="Close promoter access" onClick={onClose}><X size={20} /></button>
      <div className="brand-mark"><Share2 size={20} /></div>
      <h2 id="native-promoter-title">Promote Stockroom</h2>
      {wallet ? <>
        <p>Your personal referral link is ready to share.</p>
        <label className="native-promoter-link-label">Referral link<input readOnly value={wallet.link} onFocus={event => event.currentTarget.select()} /></label>
        <div className="native-promoter-actions"><button type="button" className="filter-button" onClick={() => void copy()}><Copy size={16} />Copy link</button><button type="button" className="primary-button" onClick={() => void share()}><Share2 size={16} />Share link</button></div>
        {message && <p className="native-promoter-message" role="status">{message}</p>}
        {error && <p className="native-promoter-error" role="alert">{error}</p>}
        <button type="button" className="text-button" onClick={signOut}>Sign out of promoter account</button>
      </> : <>
        <p>Sign in or create a promoter account to get your personal tracked link.</p>
        <form className="native-promoter-form" onSubmit={authenticate}>
          {registering && <label>Your name<input autoComplete="name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>}
          <label>Email<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label>Password<input type="password" autoComplete={registering ? 'new-password' : 'current-password'} minLength={10} maxLength={256} required value={password} onChange={event => setPassword(event.target.value)} /></label>
          {error && <p className="native-promoter-error" role="alert">{error}</p>}
          <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Please wait…' : registering ? 'Create promoter account' : 'Sign in'}</button>
        </form>
        <button type="button" className="text-button" onClick={() => { setRegistering(value => !value); setError('') }}>{registering ? 'I already have an account' : 'Create a promoter account'}</button>
      </>}
    </section>
  </div>
}
