import { PayoutBankForm } from './PayoutBankForm'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ChevronDown, Copy, LogOut, Menu, Share2, UserRound, WalletCards, X } from 'lucide-react'
import { moneyMinor, portalRequest, visitorPortalKeys } from './lib/portalApi'
import { isBrowserPwa } from './lib/platform'
import { NotificationCenter } from './NotificationCenter'
import './portal.css'

type Balance = { currency: string; earnedMinor: number; paidMinor: number; pendingMinor: number; availableMinor: number }
type Commission = { reference: string; amountMinor: number; currency: string; percent: number; kind: string; createdAt: string }
type Payout = { id: string; amountMinor: number; currency: string; status: string; method: string; createdAt: string; paidAt: string | null; automaticError: string }
type Wallet = { referrer: { name: string; email: string; type: string }; link: string; referredBusinesses: number; automaticTransfersEnabled: boolean; balances: Balance[]; profiles: Array<{ currency: string; name: string; bankName: string; accountLast4: string; automaticReady: boolean }>; commissions: Commission[]; payouts: Payout[] }
type DeletionStatus = { status: 'active' | 'pending'; scheduledFor?: string; graceDays?: number }
const currencies = ['NGN', 'GHS', 'ZAR', 'KES', 'USD', 'XOF']

function VisitorPortal() {
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [confirmDeletion, setConfirmDeletion] = useState(false)
  const [deletion, setDeletion] = useState<DeletionStatus | null>(null)
  const [registering, setRegistering] = useState(true)
  const [expandedGroup, setExpandedGroup] = useState<'promote' | 'wallet' | null>('promote')
  const [sectionTarget, setSectionTarget] = useState<string | null>(null)
  useEffect(() => {
    if (!sectionTarget) return
    document.getElementById(sectionTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setSectionTarget(null)
  }, [sectionTarget])
  const navigateToSection = (nextTab: 'promote' | 'wallet', id: string) => {
    setTab(nextTab); setSectionTarget(id); setMenuOpen(false)
  }
  const [tab, setTab] = useState<'promote' | 'wallet'>('promote')
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false); const [currency, setCurrency] = useState('NGN'); const [amount, setAmount] = useState(''); const [payoutNote, setPayoutNote] = useState('')
  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])
  const signedIn = Boolean(wallet || deletion?.status === 'pending')
  const load = async () => { const data = await portalRequest<Wallet>('/v1/referral-wallet/me', {}, visitorPortalKeys); setWallet(data); setEmail(data.referrer.email); setError('') }
  const loadDeletion = async () => { const data = await portalRequest<DeletionStatus>('/v1/account-deletion/me', {}, visitorPortalKeys); setDeletion(data); if (data.status === 'active') await load() }
  useEffect(() => { const token = localStorage.getItem(visitorPortalKeys.access) || sessionStorage.getItem(visitorPortalKeys.session); if (token) void loadDeletion().catch(() => { localStorage.removeItem(visitorPortalKeys.access); sessionStorage.removeItem(visitorPortalKeys.session) }) }, [])
  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch(`${__STOCKROOM_SYNC_API_URL__.replace(/\/$/, '')}/v1/visitors/${registering ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not open your promoter account.')
      localStorage.setItem(visitorPortalKeys.access, data.accessToken); sessionStorage.setItem(visitorPortalKeys.session, data.accessToken)
      setPassword(''); await loadDeletion()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not sign in.') }
    finally { setBusy(false) }
  }
  const copyLink = async () => {
    if (!wallet?.link) return
    try { await navigator.clipboard.writeText(wallet.link); setMessage('Your referral link is copied and ready to share.') }
    catch { const input = document.getElementById('visitor-share-link') as HTMLInputElement | null; input?.focus(); input?.select(); setMessage('The link is selected. Copy it and share it with a business owner.') }
  }
  const requestPayout = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true)
    try { const amountMinor = Math.round(Number(amount) * 100); const result = await portalRequest<{message: string}>('/v1/referral-wallet/payouts', { method: 'POST', body: JSON.stringify({ currency, amountMinor, note: payoutNote }) }, visitorPortalKeys); setMessage(result.message); setAmount(''); await load() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not request a payout.') }
    finally { setBusy(false) }
  }
  const loadBanks = (selected: string) => setCurrency(selected)
  const logout = () => { localStorage.removeItem(visitorPortalKeys.access); sessionStorage.removeItem(visitorPortalKeys.session); setWallet(null); setDeletion(null); setMenuOpen(false); setMessage('You have signed out.') }
  const changeDeletion = async (action: 'request' | 'cancel') => {
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await portalRequest<DeletionStatus>('/v1/account-deletion/me', { method: 'POST', body: JSON.stringify({ action, confirmation: 'DELETE' }) }, visitorPortalKeys)
      setDeletion(result); setConfirmDeletion(false)
      if (result.status === 'active') await load()
      else setWallet(null)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update account deletion request.') }
    finally { setBusy(false) }
  }
  const available = wallet?.balances.find(row => row.currency === currency)?.availableMinor || 0
  if (!wallet && deletion?.status === 'pending') return <main className="portal-login"><section className="portal-login-card"><a className="portal-brand" href="/welcome"><img src="/logo.png" alt="" /><span><strong>Stockroom Promoter Wallet</strong><small>Account deletion request</small></span></a><h1>Your account is deactivated</h1><p>Your account and personal profile are scheduled for deletion on <strong>{deletion.scheduledFor ? new Date(deletion.scheduledFor).toLocaleString() : 'the scheduled date'}</strong>, after a {deletion.graceDays}-day protection period. You can cancel before then to restore access.</p>{error && <div className="portal-alert error" role="alert">{error}</div>}<button className="portal-btn secondary" disabled={busy} onClick={() => void changeDeletion('cancel')}>{busy ? 'Please wait…' : 'Cancel deletion and restore my account'}</button><button className="portal-btn secondary" style={{marginTop:12}} onClick={logout}>Sign out</button></section></main>
  if (!signedIn) return <main className="portal-login"><section className="portal-login-card"><a className="portal-brand" href="/welcome"><img src="/logo.png" alt="" /><span><strong>Stockroom Promoter Wallet</strong><small>S. B. Ibhadode Technologies</small></span></a><h1>{registering ? 'Become a Stockroom promoter' : 'Sign in to your promoter account'}</h1><p>Share a tracked Stockroom link, see the businesses that register, and follow verified referral rewards in your wallet.</p>{error && <div className="portal-alert error" role="alert">{error}</div>}<form className="portal-form" onSubmit={submitAuth}>{registering && <label>Your name<input autoComplete="name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>}<label>Email<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete={registering ? 'new-password' : 'current-password'} minLength={10} maxLength={256} required value={password} onChange={event => setPassword(event.target.value)} /></label><button className="portal-btn" disabled={busy}>{busy ? 'Please wait…' : registering ? 'Create promoter account' : 'Sign in'}</button></form><button className="portal-btn secondary" style={{marginTop:12}} onClick={() => { setRegistering(!registering); setError('') }}>{registering ? 'I already have a promoter account' : 'Create a new promoter account'}</button><p><a className="portal-link" href="/welcome">Back to Stockroom welcome page</a></p><p><a className="portal-link" href="privacy.html">Privacy Policy</a> | <a className="portal-link" href="terms.html">Terms and Conditions</a></p></section></main>
  return <div className="portal visitor-portal">
    {menuOpen && <button className="visitor-nav-backdrop" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)} />}
    <aside id="visitor-navigation" className={`portal-sidebar${menuOpen ? ' open' : ''}`}>
      <a className="portal-brand" href="/welcome"><img src="/logo.png" alt="" /><span><strong>Stockroom</strong><small>Promoter account</small></span></a>
      <div className="visitor-workspace"><UserRound size={18} /><span>{wallet?.referrer.name || 'Promoter workspace'}<small>Referral partner</small></span></div>
      <nav className="portal-nav" aria-label="Visitor navigation">
        <span className="visitor-nav-label">Your workspace</span>
        <div className="visitor-nav-group">
          <button className={tab === 'promote' ? 'active' : ''} aria-expanded={expandedGroup === 'promote'} aria-controls="visitor-referral-menu" onClick={() => { setTab('promote'); setExpandedGroup(group => group === 'promote' ? null : 'promote') }}><Share2 size={18} />Referrals<ChevronDown size={16} className={`visitor-nav-chevron${expandedGroup === 'promote' ? ' expanded' : ''}`} /></button>
          {expandedGroup === 'promote' && <div id="visitor-referral-menu" className="visitor-subnav"><a href="#visitor-referral-overview" onClick={event => { event.preventDefault(); navigateToSection('promote', 'visitor-referral-overview') }}>Overview</a><a href="#visitor-referral-link" onClick={event => { event.preventDefault(); navigateToSection('promote', 'visitor-referral-link') }}>My referral link</a><a href="#visitor-reward-guide" onClick={event => { event.preventDefault(); navigateToSection('promote', 'visitor-reward-guide') }}>How rewards work</a></div>}
        </div>
        <div className="visitor-nav-group">
          <button className={tab === 'wallet' ? 'active' : ''} aria-expanded={expandedGroup === 'wallet'} aria-controls="visitor-wallet-menu" onClick={() => { setTab('wallet'); setExpandedGroup(group => group === 'wallet' ? null : 'wallet') }}><WalletCards size={18} />Wallet & payouts<ChevronDown size={16} className={`visitor-nav-chevron${expandedGroup === 'wallet' ? ' expanded' : ''}`} /></button>
          {expandedGroup === 'wallet' && <div id="visitor-wallet-menu" className="visitor-subnav"><a href="#visitor-wallet-overview" onClick={event => { event.preventDefault(); navigateToSection('wallet', 'visitor-wallet-overview') }}>Balances</a><a href="#visitor-request-payout" onClick={event => { event.preventDefault(); navigateToSection('wallet', 'visitor-request-payout') }}>Request a payout</a>{wallet?.automaticTransfersEnabled && <a href="#visitor-bank-account" onClick={event => { event.preventDefault(); navigateToSection('wallet', 'visitor-bank-account') }}>Bank account</a>}<a href="#visitor-reward-history" onClick={event => { event.preventDefault(); navigateToSection('wallet', 'visitor-reward-history') }}>Reward history</a><a href="#visitor-payout-history" onClick={event => { event.preventDefault(); navigateToSection('wallet', 'visitor-payout-history') }}>Payout history</a></div>}
        </div>
        <span className="visitor-nav-label">Account & resources</span>
        <a href="#visitor-account" onClick={event => { event.preventDefault(); navigateToSection(tab, 'visitor-account') }}><UserRound size={18} />Account settings</a>
        <a href="/welcome"><ArrowLeft size={18} />Stockroom welcome page</a>
      </nav>
      <div className="portal-sidebar-foot"><strong>{wallet?.referrer.name}</strong><span>{wallet?.referrer.email}</span><button onClick={logout}><LogOut size={15} />Sign out</button></div>
    </aside><main className="portal-main"><header className="portal-top"><div className="portal-actions"><button className="portal-btn secondary portal-mobile-menu" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="visitor-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={16} /> : <Menu size={16} />}</button><div><h1>{tab === 'promote' ? 'My referral link' : 'Wallet & payouts'}</h1><p>Stockroom Business App / S. B. Ibhadode Technologies</p></div></div><NotificationCenter apiUrl={__STOCKROOM_SYNC_API_URL__.replace(/\/$/, "")} token="" onToken={() => {}} allowPush={isBrowserPwa()} request={(path, init) => portalRequest(path, init || {}, visitorPortalKeys)} /><button className="portal-btn secondary" onClick={logout}><LogOut size={15} />Sign out</button></header><div className="portal-content">{error && <div className="portal-alert error" role="alert">{error}</div>}{message && <div className="portal-alert success" role="status">{message}</div>}
    {tab === 'promote' && <><div id="visitor-referral-overview" className="portal-heading"><div><h2>Help Stockroom reach more businesses</h2><p>Share your personal link. Referral credit is confirmed when the business redeems its registration key.</p></div></div><div className="portal-grid"><Metric title="Businesses registered from your link" value={wallet?.referredBusinesses || 0} detail="Completed registrations" /><Metric title="Available reward currencies" value={wallet?.balances.length || 0} detail="A separate balance is kept for each currency" /><Metric title="Automatic payout" value={wallet?.automaticTransfersEnabled ? 'Setup available' : 'Manual'} detail="Add your bank account to receive withdrawals" /><Metric title="Verified rewards" value={wallet?.commissions.length || 0} detail="Successful subscription payments" /></div><div id="visitor-referral-link" className="portal-panel"><h3>Your tracked referral link</h3><p>Businesses can use this link to start registration. Tell them to keep the referral code through the key redemption step.</p><div className="portal-actions"><input id="visitor-share-link" className="portal-input" readOnly value={wallet?.link || ''} onFocus={event => event.currentTarget.select()} /><button className="portal-btn" onClick={() => void copyLink()}><Copy size={15} />Copy link</button></div></div><div id="visitor-reward-guide" className="portal-panel"><h3>How rewards are earned</h3><p>Only verified successful subscription payments earn a reward. Account creation and link clicks do not create a balance. Stockroom sets the referral reward rates; each referred business can earn on up to four successful payments.</p></div></>}
    {tab === 'wallet' && <><div id="visitor-wallet-overview" className="portal-heading"><div><h2>Your referral wallet</h2><p>Rewards are shown separately for each currency. Pending payouts are reserved until payment is confirmed.</p></div><button className="portal-btn secondary" onClick={() => void load()}>Refresh wallet</button></div>{!wallet?.balances.length ? <div className="portal-empty">No verified rewards have reached your wallet yet.</div> : <div className="portal-balance-row">{wallet.balances.map(row => <article className="portal-balance" key={row.currency}><span>{row.currency} wallet</span><strong className="available">{moneyMinor(row.availableMinor, row.currency)}</strong><small>Available</small><small>Earned {moneyMinor(row.earnedMinor, row.currency)}</small><small>Paid {moneyMinor(row.paidMinor, row.currency)} · Pending {moneyMinor(row.pendingMinor, row.currency)}</small></article>)}</div>}
      <div id="visitor-request-payout" className="portal-panel"><h3>Request a payout</h3><p>{wallet?.automaticTransfersEnabled ? 'Withdraw your available rewards to your saved bank account. If a transfer needs attention, the Stockroom team will review your request.' : 'Submit a withdrawal request for the Stockroom team to process.'}</p><form className="portal-form" onSubmit={requestPayout}><label>Currency<select value={currency} onChange={event => void loadBanks(event.target.value)}>{(wallet?.balances || []).map(row => <option key={row.currency} value={row.currency}>{row.currency} · available {moneyMinor(row.availableMinor, row.currency)}</option>)}{!wallet?.balances.length && currencies.map(code => <option key={code}>{code}</option>)}</select></label><label>Amount<input type="number" min="0.01" step="0.01" max={available / 100} required value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /></label><label>Note for Stockroom support (optional)<input maxLength={300} value={payoutNote} onChange={event => setPayoutNote(event.target.value)} placeholder="Preferred contact or payout detail" /></label><button className="portal-btn" disabled={busy || Number(amount) * 100 > available}>{busy ? 'Submitting…' : 'Request payout'}</button></form></div>
      {wallet?.automaticTransfersEnabled && <div id="visitor-bank-account" className="portal-panel"><PayoutBankForm request={(path, init) => portalRequest(path, init || {}, visitorPortalKeys)} onSaved={load} className="portal-form" buttonClass="portal-btn" />{wallet.profiles.map(profile => <div className="portal-alert success" key={profile.currency}>{profile.name} / {profile.bankName || 'Bank account'} ending {profile.accountLast4} ({profile.currency})</div>)}</div>}
      <div id="visitor-reward-history" className="portal-panel"><h3>Reward history</h3><Records rows={wallet?.commissions || []} /></div><div id="visitor-payout-history" className="portal-panel"><h3>Payout history</h3><PayoutHistory rows={wallet?.payouts || []} /></div>
    </>}
    <div id="visitor-account" className="portal-panel"><h3>Close promoter account</h3><p>Deactivation is immediate. Your personal account details are scheduled for deletion after the {deletion?.graceDays || 14}-day waiting period (14 days by default); paid payout records may be retained for financial and legal record keeping.</p><button className="portal-btn secondary" disabled={busy || deletion?.status === 'pending'} onClick={() => setConfirmDeletion(true)}>{busy ? 'Submitting…' : 'Deactivate and schedule deletion'}</button></div>{confirmDeletion && <div className="portal-closure-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="promoter-closure-title"><section className="portal-panel"><h2 id="promoter-closure-title">Delete your promoter account?</h2><p>Your promoter access stops immediately. Personal account details are scheduled for deletion after {deletion?.graceDays || 14} days. You can cancel before the scheduled deadline. Completed deletion cannot be undone; financial payout records may be retained. Referred businesses remain active.</p><div className="portal-actions"><button className="portal-btn secondary" disabled={busy} onClick={() => setConfirmDeletion(false)}>Cancel</button><button className="portal-btn portal-closure-confirm" disabled={busy} onClick={() => void changeDeletion('request')}>{busy ? 'Submitting...' : 'Confirm account deletion'}</button></div>{error && <div role="alert">{error}</div>}</section></div>}
  </div></main></div>
}
function Metric({ title, value, detail }: { title: string; value: number | string; detail: string }) { return <article className="portal-card"><span>{title}</span><strong>{value}</strong><small>{detail}</small></article> }
function Records({ rows }: { rows: Commission[] }) { return <div className="portal-table-wrap"><table><thead><tr><th>Payment</th><th>Reward</th><th>Rate</th><th>Earned</th></tr></thead><tbody>{rows.map(row => <tr key={row.reference}><td>{row.kind === 'first' ? 'First payment' : 'Renewal'}<small>{row.reference}</small></td><td>{moneyMinor(row.amountMinor, row.currency)}</td><td>{row.percent}%</td><td>{new Date(row.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table>{!rows.length && <div className="portal-empty">No verified referral rewards yet.</div>}</div> }
function payoutStatus(status: string) { return ({ manual_requested: 'Awaiting processing', initiating: 'Processing', processing: 'Processing', awaiting_otp: 'Awaiting approval', manual_review: 'Under review', paid: 'Paid', failed: 'Could not complete', reversed: 'Returned' } as Record<string, string>)[status] || 'Under review' }
function PayoutHistory({ rows }: { rows: Payout[] }) { return <div className="portal-table-wrap"><table><thead><tr><th>Amount</th><th>Status</th><th>Method</th><th>Requested</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{moneyMinor(row.amountMinor, row.currency)}</td><td>{payoutStatus(row.status)}</td><td>{row.method || '—'}</td><td>{new Date(row.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table>{!rows.length && <div className="portal-empty">No payout requests yet.</div>}</div> }

createRoot(document.getElementById('root')!).render(<VisitorPortal />)
