import { useEffect, useRef, useState } from 'react'
import { AsyncButton } from './AsyncControls'
import { cloudRequest, CloudAuthenticationError } from './lib/cloudRequest'
import type { SubscriptionAccess } from '../server/subscription-policy.mjs'

type Plan = { amount: number; currency: string; days: number; reminderDays: number; freeTrialDays: number; graceMonths?: number; graceDays?: number; firstReferralPercent?: number; recurringReferralPercent?: number; visitorFirstReferralPercent?: number; visitorRecurringReferralPercent?: number }
type NamedPlan = Plan & { id: string; name: string }
type EnterpriseRequest = { id: string; status: 'pending' | 'approved' | 'paid'; message?: string; offeredAmount?: number; offeredCurrency?: string; offeredDays?: number; offerNote?: string }
type Summary = { plan: Plan | null; plans?: NamedPlan[]; access: SubscriptionAccess; subscription: { expiresAt?: string | null } | null; enterpriseRequest?: EnterpriseRequest | null; isDeveloper: boolean }
type Referral = { link: string }
type ReferralWallet = { referredBusinesses: number; automaticTransfersEnabled: boolean; balances: Array<{currency:string;earnedMinor:number;paidMinor:number;pendingMinor:number;availableMinor:number}>; commissions: Array<{reference:string;amountMinor:number;currency:string;percent:number;kind:string;createdAt:string}>; payouts: Array<{id:string;amountMinor:number;currency:string;status:string;method:string;createdAt:string}> }
const summaryCacheKey = 'stockroom-subscription-summary'

export function SubscriptionSettings({ apiUrl, token, onAccess, onToken, signInToCloud }: { apiUrl: string; token: string; onAccess: (access: SubscriptionAccess) => void; onToken: (token: string, refreshToken: string) => void; signInToCloud: (identifier: string, password: string) => Promise<{ accessToken: string; refreshToken: string }> }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [referral, setReferral] = useState<Referral | null>(null)
  const [referralWallet, setReferralWallet] = useState<ReferralWallet | null>(null)
  const [payoutCurrency, setPayoutCurrency] = useState('NGN')
  const [payoutBanks, setPayoutBanks] = useState<Array<{name:string;code:string}>>([])
  const [enterpriseMessage, setEnterpriseMessage] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCloudSignIn, setShowCloudSignIn] = useState(false)
  const [cloudIdentifier, setCloudIdentifier] = useState('')
  const [cloudPassword, setCloudPassword] = useState('')
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const loadVersion = useRef(0)
  const request = async (path: string, init: RequestInit = {}): Promise<any> => {
    try {
      const data = await cloudRequest(apiUrl, `/v1/subscriptions${path}`, init, onToken, token)
      setNeedsSignIn(false)
      return data
    } catch (caught) {
      if (caught instanceof CloudAuthenticationError) setNeedsSignIn(true)
      throw caught
    }
  }
  const load = async () => {
    const version = ++loadVersion.current
    setLoading(true); setError('')
    try {
      const next = await request('') as Summary
      setSummary(next); onAccess(next.access)
      localStorage.setItem(summaryCacheKey, JSON.stringify(next))
      setReferral(await request('/referrals') as Referral)
      setReferralWallet(await cloudRequest(apiUrl, '/v1/referral-wallet/me', {}, onToken, token) as ReferralWallet)
      const code = sessionStorage.getItem('stockroom-referral-code') || ''
      if (/^[a-f0-9]{32}$/.test(code)) {
        await request('/referrals', { method: 'POST', body: JSON.stringify({ code }) })
        sessionStorage.removeItem('stockroom-referral-code')
        setMessage('Your referral was applied.')
      }
    } catch (caught) {
      // Subscription status already downloaded for this local business remains
      // useful offline. Cloud is required to refresh or change it, not to
      // redisplay it after an app restart.
      try {
        const cached = JSON.parse(localStorage.getItem(summaryCacheKey) || 'null') as Summary | null
        if (cached?.access) { setSummary(cached); onAccess(cached.access) }
      } catch { /* a missing/corrupt cache is handled by the visible error */ }
      if (version === loadVersion.current) setError(caught instanceof Error ? caught.message : 'Could not load subscription details.')
    }
    finally { if (version === loadVersion.current) setLoading(false) }
  }
  useEffect(() => { void load() }, [apiUrl, token])
  useEffect(() => { if (!referralWallet?.automaticTransfersEnabled) return; let cancelled = false; void cloudRequest(apiUrl, `/v1/referral-wallet/banks?currency=${payoutCurrency}`, {}, onToken, token).then(data => { if (!cancelled) setPayoutBanks(data.banks || []) }).catch(() => { if (!cancelled) setPayoutBanks([]) }); return () => { cancelled = true } }, [apiUrl, token, payoutCurrency, referralWallet?.automaticTransfersEnabled])
  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get('reference')
    if (!reference || !token) return
    void (async () => {
      try { await request('/verify', { method: 'POST', body: JSON.stringify({ reference }) }); setMessage('Payment confirmed. Your subscription has been updated.'); window.history.replaceState(null, '', `${location.pathname}?screen=subscription`); await load() }
      catch (caught) { setError(caught instanceof Error ? caught.message : 'We could not confirm that payment yet. Refresh shortly.') }
    })()
  }, [token])
  const startCheckout = async (planId: string) => {
    setError(''); setMessage('')
    try { const data = await request('/checkout', { method: 'POST', body: JSON.stringify({ planId }) }) as { authorizationUrl: string }; window.location.assign(data.authorizationUrl) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not start checkout.') }
  }
  const restoreCloudOwnerSession = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(''); setMessage('')
    try {
      const session = await signInToCloud(cloudIdentifier, cloudPassword)
      onToken(session.accessToken, session.refreshToken)
      setCloudPassword('')
      setShowCloudSignIn(false)
      setNeedsSignIn(false)
      setMessage('Cloud owner session restored. Loading your subscription…')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not sign in to the cloud account.') }
  }
  const requestEnterprise = async () => {
    setError(''); setMessage('')
    try { await request('/enterprise-request', { method: 'POST', body: JSON.stringify({ message: enterpriseMessage }) }); setMessage('Your Enterprise request was sent. We will prepare a proposal for you.'); await load() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not submit your Enterprise request.') }
  }
  const startEnterpriseCheckout = async () => {
    setError(''); setMessage('')
    try { const data = await request('/enterprise-checkout', { method: 'POST', body: '{}' }) as { authorizationUrl: string }; window.location.assign(data.authorizationUrl) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not open your Enterprise payment link.') }
  }
  if (loading) return <section className="panel full-panel"><h2>Subscription</h2><p>Loading subscription details…</p></section>
  const plan = summary?.plan
  const plans = summary?.plans?.length ? summary.plans : plan ? [{ ...plan, id: 'monthly', name: 'Monthly' }] : []
  const expires = summary?.subscription?.expiresAt
  const copyReferral = async () => { if (!referral) return; try { await navigator.clipboard.writeText(referral.link); setMessage('Invitation link copied.') } catch { const input = document.getElementById('owner-referral-link') as HTMLInputElement | null; input?.focus(); input?.select(); setMessage('The invitation link is selected. Copy it and share it before the business registers.') } }
  const requestReferralPayout = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setMessage('')
    try {
      const input = Object.fromEntries(new FormData(event.currentTarget))
      const result = await cloudRequest(apiUrl, '/v1/referral-wallet/payouts', { method: 'POST', body: JSON.stringify({ currency: input.currency, amountMinor: Math.round(Number(input.amount) * 100), note: input.note }) }, onToken, token) as { message: string }
      setMessage(result.message)
      const updated = await cloudRequest(apiUrl, '/v1/referral-wallet/me', {}, onToken, token) as ReferralWallet
      setReferralWallet(updated)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not request a referral payout.') }
  }
  const savePayoutDestination = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setMessage('')
    try {
      const input = Object.fromEntries(new FormData(event.currentTarget))
      await cloudRequest(apiUrl, '/v1/referral-wallet/profile', { method: 'POST', body: JSON.stringify(input) }, onToken, token)
      const updated = await cloudRequest(apiUrl, '/v1/referral-wallet/me', {}, onToken, token) as ReferralWallet
      setReferralWallet(updated); setMessage('Bank account for referral payouts saved.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save payout destination.') }
  }
  return <>
    {summary?.isDeveloper && <section className="panel full-panel subscription-panel"><div className="panel-heading"><div><h2>Developer Control Centre</h2><p>Business records, referral attribution, promoter wallets, and payout requests have their own workspace.</p></div><a className="primary-button" href="/developer">Open Control Centre</a></div></section>}
    <section className="panel full-panel subscription-panel">
      <div className="panel-heading"><div><h2>Subscription</h2><p>Choose a plan and manage your renewal.</p></div><AsyncButton className="text-button" busyLabel="Refreshing…" onClick={load}>Refresh</AsyncButton></div>
      {error && <p className="auth-error" role="alert">{error}</p>}{message && <p className="settings-message" role="status">{message}</p>}
      {needsSignIn && <div className="subscription-cloud-sign-in"><p>Subscription changes require the cloud owner account. This does not sign you out of the app.</p>{showCloudSignIn ? <form className="settings-form" onSubmit={restoreCloudOwnerSession}><label>Cloud owner email<input type="email" value={cloudIdentifier} onChange={event => setCloudIdentifier(event.target.value)} autoComplete="username" required /></label><label>Cloud owner password<input type="password" value={cloudPassword} onChange={event => setCloudPassword(event.target.value)} autoComplete="current-password" required /></label><div className="report-actions"><button className="primary-button" type="submit">Sign in to cloud</button><button type="button" className="filter-button" onClick={() => { setShowCloudSignIn(false); setCloudPassword('') }}>Cancel</button></div></form> : <button type="button" className="primary-button" onClick={() => setShowCloudSignIn(true)}>Sign in to cloud</button>}</div>}
      {!plan ? <p className="subscription-status">A subscription plan has not been configured yet.</p> : <div className="subscription-summary"><div><span>Current base plan</span><strong>{plan.currency} {(plan.amount / 100).toFixed(2)}</strong><small>{plan.days} days of access</small></div><div><span>Status</span><strong>{summary?.access.status === 'active' ? 'Active' : summary?.access.status === 'trial' ? 'Free trial' : summary?.access.status === 'trial-expired' ? 'Trial ended' : summary?.access.status === 'grace' ? 'Grace period' : summary?.access.status === 'test' ? 'Enforcement off' : 'Payment needed'}</strong><small>{summary?.access.status === 'trial' ? `Trial ends ${new Date(summary.access.expiresAt || '').toLocaleDateString()}` : expires ? `Renewal due ${new Date(expires).toLocaleDateString()}` : summary?.access.reason}</small></div></div>}
      {plans.length > 0 && <p className="subscription-status">Continue to checkout to activate or extend your subscription. Each renewal is started by the business owner.</p>}
      {plans.length > 0 && <div className="subscription-plan-options">{plans.map(option => <article key={option.id}><strong>{option.name}</strong>{option.id !== 'enterprise' && <><span>{option.currency} {(option.amount / 100).toFixed(2)}</span><small>{option.days} days of access</small><AsyncButton className="primary-button" busyLabel="Connecting to checkout…" onClick={() => startCheckout(option.id)}>Continue to payment</AsyncButton></>}{option.id === 'enterprise' && <>{summary?.enterpriseRequest?.status === 'approved' ? <><span>{summary.enterpriseRequest.offeredCurrency} {((summary.enterpriseRequest.offeredAmount || 0) / 100).toFixed(2)}</span><small>{summary.enterpriseRequest.offeredDays} days · Your proposal is ready.</small>{summary.enterpriseRequest.offerNote && <small>{summary.enterpriseRequest.offerNote}</small>}<AsyncButton className="primary-button" busyLabel="Connecting to checkout…" onClick={startEnterpriseCheckout}>Continue to payment</AsyncButton></> : summary?.enterpriseRequest?.status === 'pending' ? <small>Your request is awaiting a proposal.</small> : <><small>Tell us what your business needs and we will send a custom proposal.</small><textarea aria-label="Enterprise requirements" value={enterpriseMessage} maxLength={1000} placeholder="Number of stores, users, integrations, support needs…" onChange={event => setEnterpriseMessage(event.target.value)} /><AsyncButton className="primary-button" busyLabel="Sending request…" onClick={requestEnterprise}>Request Enterprise proposal</AsyncButton></>}</>}</article>)}</div>}
      {referral && <div className="subscription-enforcement"><div><strong>Invite another business</strong><p>Share your invitation before they create their business account.</p><input id="owner-referral-link" readOnly value={referral.link} onFocus={event => event.currentTarget.select()} aria-label="Business-owner referral link" /></div><AsyncButton className="filter-button" busyLabel="Copying…" onClick={copyReferral}>Copy invitation</AsyncButton></div>}
    </section>
    <section className="panel full-panel subscription-panel"><div className="panel-heading"><div><h2>Referral wallet</h2><p>{referralWallet?.referredBusinesses || 0} registered business(es) attributed to your invitation.</p></div></div>{!referralWallet ? <p>Referral wallet is unavailable right now.</p> : <><div className="subscription-summary">{referralWallet.balances.length ? referralWallet.balances.map(row => <div key={row.currency}><span>{row.currency} available</span><strong>{row.currency} {(row.availableMinor / 100).toFixed(2)}</strong><small>Earned {(row.earnedMinor / 100).toFixed(2)} · paid {(row.paidMinor / 100).toFixed(2)} · pending {(row.pendingMinor / 100).toFixed(2)}</small></div>) : <p>No verified referral rewards yet.</p>}</div><p className="subscription-status">Payout mode: {referralWallet.automaticTransfersEnabled ? 'Automatic bank transfer is available after you save a payout account.' : 'Manual bank transfer: submit a request for processing through the Control Centre.'}</p>{referralWallet.automaticTransfersEnabled && <form className="settings-form" onSubmit={savePayoutDestination}><h3>Bank account for referral payouts</h3><label>Currency<select name="currency" value={payoutCurrency} onChange={event => setPayoutCurrency(event.target.value)}>{['NGN','GHS','ZAR','KES','USD'].map(code => <option key={code}>{code}</option>)}</select></label><label>Account holder name<input name="name" required maxLength={100} /></label><label>Bank<select name="bankCode" required><option value="">Select your bank</option>{payoutBanks.map(bank => <option key={bank.code} value={bank.code}>{bank.name}</option>)}</select></label><label>Account number<input name="accountNumber" inputMode="numeric" pattern="[0-9]{6,20}" minLength={6} maxLength={20} required /></label><button className="primary-button" type="submit">Save payout destination</button><p>Your full account number is sent to our payment provider and is not retained by Stockroom.</p></form>}{referralWallet.balances.some(row => row.availableMinor > 0) && <form className="settings-form" onSubmit={requestReferralPayout}><h3>Request referral payout</h3><label>Currency<select name="currency" required>{referralWallet.balances.filter(row => row.availableMinor > 0).map(row => <option key={row.currency}>{row.currency}</option>)}</select></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Note for developer (optional)<input name="note" maxLength={300} /></label><button className="primary-button" type="submit">Request payout</button></form>}<div className="table-wrap"><table><thead><tr><th>Reward</th><th>Amount</th><th>Rate</th><th>Date</th></tr></thead><tbody>{referralWallet.commissions.map(row => <tr key={row.reference}><td>{row.kind === 'first' ? 'First payment' : 'Renewal'}</td><td>{row.currency} {(row.amountMinor / 100).toFixed(2)}</td><td>{row.percent}%</td><td>{new Date(row.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div></>}</section>
  </>
}
