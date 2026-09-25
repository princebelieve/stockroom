import { useEffect, useRef, useState } from 'react'
import { AsyncButton } from './AsyncControls'
import { RegistrationKeys } from './RegistrationKeys'
import { cloudRequest, CloudAuthenticationError } from './lib/cloudRequest'
import type { SubscriptionAccess } from '../server/subscription-policy.mjs'

type Plan = { amount: number; currency: string; days: number; reminderDays: number; freeTrialDays: number; graceMonths?: number; firstReferralPercent?: number; recurringReferralPercent?: number }
type NamedPlan = Plan & { id: string; name: string }
type EnterpriseRequest = { id: string; status: 'pending' | 'approved' | 'paid'; message?: string; offeredAmount?: number; offeredCurrency?: string; offeredDays?: number; offerNote?: string; businessId?: string; ownerName?: string; email?: string; createdAt?: string }
type Summary = { plan: Plan | null; plans?: NamedPlan[]; access: SubscriptionAccess; subscription: { expiresAt?: string | null } | null; enterpriseRequest?: EnterpriseRequest | null; isDeveloper: boolean }
type Setup = { plan: (Plan & { plans?: NamedPlan[] }) | null; testMode: boolean; paystackConfigured: boolean; emailConfigured: boolean; publicUrlConfigured: boolean }
type Referral = { link: string }
const summaryCacheKey = 'stockroom-subscription-summary'

export function SubscriptionSettings({ apiUrl, token, onAccess, onToken, signInToCloud }: { apiUrl: string; token: string; onAccess: (access: SubscriptionAccess) => void; onToken: (token: string, refreshToken: string) => void; signInToCloud: (identifier: string, password: string) => Promise<{ accessToken: string; refreshToken: string }> }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [setup, setSetup] = useState<Setup | null>(null)
  const [referral, setReferral] = useState<Referral | null>(null)
  const [enterpriseRequests, setEnterpriseRequests] = useState<EnterpriseRequest[]>([])
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
      const code = sessionStorage.getItem('stockroom-referral-code') || ''
      if (/^[a-f0-9]{32}$/.test(code)) {
        await request('/referrals', { method: 'POST', body: JSON.stringify({ code }) })
        sessionStorage.removeItem('stockroom-referral-code')
        setMessage('Your referral was applied.')
      }
      setSetup(next.isDeveloper ? await request('/setup') as Setup : null)
      setEnterpriseRequests(next.isDeveloper ? (await request('/enterprise-requests') as { requests: EnterpriseRequest[] }).requests : [])
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
  const approveEnterprise = async (event: React.FormEvent<HTMLFormElement>, requestId: string) => {
    event.preventDefault(); setError(''); setMessage('')
    try { const input = Object.fromEntries(new FormData(event.currentTarget)); await request('/enterprise-requests/approve', { method: 'POST', body: JSON.stringify({ ...input, requestId }) }); setMessage('Enterprise proposal approved and ready for the business to pay.'); await load() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not approve the Enterprise proposal.') }
  }
  const saveSetup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setMessage('')
    try { const input = Object.fromEntries(new FormData(event.currentTarget)); const next = await request('/setup', { method: 'PUT', body: JSON.stringify(input) }) as Setup; setSetup(next); await load(); setMessage('All three subscription plans were saved.') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save the plans.') }
  }
  const toggleEnforcement = async () => {
    if (!setup) return
    setError(''); setMessage('')
    try { const data = await request('/test-mode', { method: 'PUT', body: JSON.stringify({ testMode: !setup.testMode }) }) as { testMode: boolean }; setSetup({ ...setup, testMode: data.testMode }); setMessage(data.testMode ? 'Subscription enforcement is off.' : 'Subscription enforcement is on.') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not change subscription enforcement.') }
  }
  if (loading) return <section className="panel full-panel"><h2>Subscription</h2><p>Loading subscription details…</p></section>
  const plan = summary?.plan
  const plans = summary?.plans?.length ? summary.plans : plan ? [{ ...plan, id: 'monthly', name: 'Monthly' }] : []
  const expires = summary?.subscription?.expiresAt
  const configuredPlan = (id: string) => setup?.plan?.plans?.find(item => item.id === id) || (id === 'monthly' ? setup?.plan : null)
  const copyReferral = async () => { if (!referral) return; await navigator.clipboard.writeText(referral.link); setMessage('Invitation link copied.') }
  return <>
    {summary?.isDeveloper && <RegistrationKeys apiUrl={apiUrl} onToken={onToken} />}
    <section className="panel full-panel subscription-panel">
      <div className="panel-heading"><div><h2>Subscription</h2><p>Choose a plan and manage your renewal.</p></div><AsyncButton className="text-button" busyLabel="Refreshing…" onClick={load}>Refresh</AsyncButton></div>
      {error && <p className="auth-error" role="alert">{error}</p>}{message && <p className="settings-message" role="status">{message}</p>}
      {needsSignIn && <div className="subscription-cloud-sign-in"><p>Subscription changes require the cloud owner account. This does not sign you out of the app.</p>{showCloudSignIn ? <form className="settings-form" onSubmit={restoreCloudOwnerSession}><label>Cloud owner email<input type="email" value={cloudIdentifier} onChange={event => setCloudIdentifier(event.target.value)} autoComplete="username" required /></label><label>Cloud owner password<input type="password" value={cloudPassword} onChange={event => setCloudPassword(event.target.value)} autoComplete="current-password" required /></label><div className="report-actions"><button className="primary-button" type="submit">Sign in to cloud</button><button type="button" className="filter-button" onClick={() => { setShowCloudSignIn(false); setCloudPassword('') }}>Cancel</button></div></form> : <button type="button" className="primary-button" onClick={() => setShowCloudSignIn(true)}>Sign in to cloud</button>}</div>}
      {!plan ? <p className="subscription-status">A subscription plan has not been configured yet.</p> : <div className="subscription-summary"><div><span>Current base plan</span><strong>{plan.currency} {(plan.amount / 100).toFixed(2)}</strong><small>{plan.days} days of access</small></div><div><span>Status</span><strong>{summary?.access.status === 'active' ? 'Active' : summary?.access.status === 'grace' ? 'Grace period' : summary?.access.status === 'test' ? 'Enforcement off' : 'Payment needed'}</strong><small>{expires ? `Renews by ${new Date(expires).toLocaleDateString()}` : summary?.access.reason}</small></div></div>}
      {plans.length > 0 && <div className="subscription-plan-options">{plans.map(option => <article key={option.id}><strong>{option.name}</strong>{option.id !== 'enterprise' && <><span>{option.currency} {(option.amount / 100).toFixed(2)}</span><small>{option.days} days</small><AsyncButton className="primary-button" busyLabel="Opening secure checkout…" onClick={() => startCheckout(option.id)}>Choose {option.name}</AsyncButton></>}{option.id === 'enterprise' && <>{summary?.enterpriseRequest?.status === 'approved' ? <><span>{summary.enterpriseRequest.offeredCurrency} {((summary.enterpriseRequest.offeredAmount || 0) / 100).toFixed(2)}</span><small>{summary.enterpriseRequest.offeredDays} days · Your proposal is ready.</small>{summary.enterpriseRequest.offerNote && <small>{summary.enterpriseRequest.offerNote}</small>}<AsyncButton className="primary-button" busyLabel="Opening secure checkout…" onClick={startEnterpriseCheckout}>Pay approved proposal</AsyncButton></> : summary?.enterpriseRequest?.status === 'pending' ? <small>Your request is awaiting a proposal.</small> : <><small>Tell us what your business needs and we will send a custom proposal.</small><textarea aria-label="Enterprise requirements" value={enterpriseMessage} maxLength={1000} placeholder="Number of stores, users, integrations, support needs…" onChange={event => setEnterpriseMessage(event.target.value)} /><AsyncButton className="primary-button" busyLabel="Sending request…" onClick={requestEnterprise}>Request Enterprise proposal</AsyncButton></>}</>}</article>)}</div>}
      {referral && <div className="subscription-enforcement"><div><strong>Invite another business</strong><p>Share your invitation before they create their business account.</p></div><AsyncButton className="filter-button" busyLabel="Copying…" onClick={copyReferral}>Copy invitation</AsyncButton></div>}
    </section>
    {summary?.isDeveloper && <section className="panel full-panel subscription-panel">
      <div className="panel-heading"><div><h2>Subscription administration</h2><p>Configure the plans available to every business.</p></div></div>
      {!setup ? <p>Loading developer controls…</p> : <>
        <p className="subscription-status">Payments: {setup.paystackConfigured ? 'configured' : 'missing configuration'} · App URL: {setup.publicUrlConfigured ? 'configured' : 'missing'} · Email reminders: {setup.emailConfigured ? 'configured' : 'not configured'}</p>
        <div className="subscription-enforcement"><div><strong>Subscription enforcement</strong><p>{setup.testMode ? 'Off — businesses can continue using POS without a paid subscription.' : 'On — unpaid or expired businesses are restricted according to the grace-period policy.'}</p></div><AsyncButton className={setup.testMode ? 'primary-button' : 'filter-button'} busyLabel="Updating…" onClick={toggleEnforcement}>{setup.testMode ? 'Turn enforcement on' : 'Turn enforcement off'}</AsyncButton></div>
        <form className="settings-form" onSubmit={saveSetup}><h3>Plan settings</h3>
          <label>Monthly price (minor units)<input name="monthlyAmount" type="number" min="1" step="1" required defaultValue={configuredPlan('monthly')?.amount || ''} /></label>
          <label>Yearly price (minor units)<input name="yearlyAmount" type="number" min="1" step="1" required defaultValue={configuredPlan('yearly')?.amount || ''} /></label>
          <label>Enterprise price (minor units)<input name="enterpriseAmount" type="number" min="1" step="1" required defaultValue={configuredPlan('enterprise')?.amount || ''} /></label>
          <label>Enterprise access duration (days)<input name="enterpriseDays" type="number" min="1" max="730" required defaultValue={configuredPlan('enterprise')?.days || 365} /></label>
          <label>Currency<select name="currency" defaultValue={setup.plan?.currency || 'NGN'}>{['NGN', 'GHS', 'ZAR', 'KES', 'USD', 'XOF'].map(currency => <option key={currency}>{currency}</option>)}</select></label>
          <label>Free trial (days)<input name="freeTrialDays" type="number" min="0" max="365" required defaultValue={setup.plan?.freeTrialDays || 0} /></label>
          <label>Grace period (calendar months)<input name="graceMonths" type="number" min="0" max="12" required defaultValue={setup.plan?.graceMonths ?? 1} /><span>Set 0 to block POS immediately after expiry.</span></label>
          <label>Reminder window (days)<input name="reminderDays" type="number" min="1" max="30" required defaultValue={setup.plan?.reminderDays || 7} /></label>
          <label>First referral reward (%)<input name="firstReferralPercent" type="number" min="0" max="100" step="0.01" required defaultValue={setup.plan?.firstReferralPercent || 0} /></label>
          <label>Renewal referral reward (%)<input name="recurringReferralPercent" type="number" min="0" max="100" step="0.01" required defaultValue={setup.plan?.recurringReferralPercent || 0} /></label>
          <button className="primary-button" type="submit">Save all plans</button>
        </form>
        <div className="enterprise-request-list"><h3>Enterprise requests</h3>{enterpriseRequests.length === 0 ? <p className="subscription-status">No Enterprise requests yet.</p> : enterpriseRequests.map(request => <article key={request.id}><strong>{request.ownerName || request.businessId}</strong><small>{request.email} · {request.businessId}</small>{request.message && <p>{request.message}</p>}{request.status === 'pending' ? <form className="settings-form enterprise-quote-form" onSubmit={event => approveEnterprise(event, request.id)}><label>Quoted price (minor units)<input name="amount" type="number" min="1" required defaultValue={configuredPlan('enterprise')?.amount || ''} /></label><label>Currency<select name="currency" defaultValue={setup.plan?.currency || 'NGN'}>{['NGN', 'GHS', 'ZAR', 'KES', 'USD', 'XOF'].map(currency => <option key={currency}>{currency}</option>)}</select></label><label>Access duration (days)<input name="days" type="number" min="1" max="730" required defaultValue={configuredPlan('enterprise')?.days || 365} /></label><label>Proposal note (optional)<textarea name="note" maxLength={1000} placeholder="What this proposal includes" /></label><button className="primary-button" type="submit">Approve proposal</button></form> : <p className="subscription-status">{request.status === 'approved' ? `Approved: ${request.offeredCurrency} ${((request.offeredAmount || 0) / 100).toFixed(2)} for ${request.offeredDays} days.` : 'Paid'}</p>}</article>)}</div>
      </>}
    </section>}
  </>
}
