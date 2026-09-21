import { useEffect, useState } from 'react'
import { AsyncButton } from './AsyncControls'
import type { SubscriptionAccess } from '../server/subscription-policy.mjs'

type Plan = { amount: number; currency: string; days: number; reminderDays: number; freeTrialDays: number; graceMonths?: number; firstReferralPercent?: number; recurringReferralPercent?: number }
type Summary = { plan: Plan | null; access: SubscriptionAccess; subscription: { expiresAt?: string | null } | null; isDeveloper: boolean }
type Setup = { plan: Plan | null; testMode: boolean; paystackConfigured: boolean; emailConfigured: boolean; publicUrlConfigured: boolean }
type Referral = { link: string }

export function SubscriptionSettings({ apiUrl, token, onAccess }: { apiUrl: string; token: string; onAccess: (access: SubscriptionAccess) => void }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [setup, setSetup] = useState<Setup | null>(null)
  const [referral, setReferral] = useState<Referral | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${apiUrl}/v1/subscriptions${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) } })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Subscription request failed.')
    return data
  }
  const load = async () => {
    setLoading(true); setError('')
    try {
      const next = await request('') as Summary
      setSummary(next); onAccess(next.access)
      setReferral(await request('/referrals') as Referral)
      const code = sessionStorage.getItem('stockroom-referral-code') || ''
      if (/^[a-f0-9]{32}$/.test(code)) {
        await request('/referrals', { method: 'POST', body: JSON.stringify({ code }) })
        sessionStorage.removeItem('stockroom-referral-code')
        setMessage('Your referral was applied.')
      }
      if (next.isDeveloper) setSetup(await request('/setup') as Setup)
      else setSetup(null)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load subscription details.') }
    finally { setLoading(false) }
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
  const startCheckout = async () => {
    setError(''); setMessage('')
    try { const data = await request('/checkout', { method: 'POST', body: '{}' }) as { authorizationUrl: string }; window.location.assign(data.authorizationUrl) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not start checkout.') }
  }
  const saveSetup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setMessage('')
    try { const input = Object.fromEntries(new FormData(event.currentTarget)); const next = await request('/setup', { method: 'PUT', body: JSON.stringify(input) }) as Setup; setSetup(next); setMessage('Subscription plan saved.') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save the plan.') }
  }
  const toggleEnforcement = async () => {
    if (!setup) return
    setError(''); setMessage('')
    try { const data = await request('/test-mode', { method: 'PUT', body: JSON.stringify({ testMode: !setup.testMode }) }) as { testMode: boolean }; setSetup({ ...setup, testMode: data.testMode }); setMessage(data.testMode ? 'Subscription enforcement is off.' : 'Subscription enforcement is on.') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not change subscription enforcement.') }
  }
  if (loading) return <section className="panel full-panel"><h2>Subscription</h2><p>Loading subscription details…</p></section>
  const plan = summary?.plan
  const expires = summary?.subscription?.expiresAt
  const copyReferral = async () => { if (!referral) return; await navigator.clipboard.writeText(referral.link); setMessage('Invitation link copied.') }
  return <>
    <section className="panel full-panel subscription-panel"><div className="panel-heading"><div><h2>Subscription</h2><p>Manage your business plan, status, and renewal.</p></div><AsyncButton className="text-button" busyLabel="Refreshing…" onClick={load}>Refresh</AsyncButton></div>
      {error && <p className="auth-error" role="alert">{error}</p>}{message && <p className="settings-message" role="status">{message}</p>}
      {!plan ? <p className="subscription-status">A subscription plan has not been configured yet.</p> : <div className="subscription-summary"><div><span>Plan</span><strong>{plan.currency} {(plan.amount / 100).toFixed(2)}</strong><small>Every {plan.days} days</small></div><div><span>Status</span><strong>{summary?.access.status === 'active' ? 'Active' : summary?.access.status === 'grace' ? 'Grace period' : summary?.access.status === 'test' ? 'Enforcement off' : 'Payment needed'}</strong><small>{expires ? `Renews by ${new Date(expires).toLocaleDateString()}` : summary?.access.reason}</small></div></div>}
      {plan && <AsyncButton className="primary-button" busyLabel="Opening secure checkout…" onClick={startCheckout}>Renew subscription</AsyncButton>}
      {referral && <div className="subscription-enforcement"><div><strong>Invite another business</strong><p>Share your invitation before they create their business account. Their referral is applied automatically during setup.</p></div><AsyncButton className="filter-button" busyLabel="Copying…" onClick={copyReferral}>Copy invitation</AsyncButton></div>}
    </section>
    {summary?.isDeveloper && <section className="panel full-panel subscription-panel"><div className="panel-heading"><div><h2>Subscription administration</h2><p>Only visible because this signed-in owner email matches the private developer email configured on Render.</p></div></div>
      {!setup ? <p>Loading developer controls…</p> : <><p className="subscription-status">Payments: {setup.paystackConfigured ? 'configured' : 'missing configuration'} · App URL: {setup.publicUrlConfigured ? 'configured' : 'missing'} · Email reminders: {setup.emailConfigured ? 'configured' : 'not configured'}</p><div className="subscription-enforcement"><div><strong>Subscription enforcement</strong><p>{setup.testMode ? 'Off — businesses can continue using POS without a paid subscription.' : 'On — unpaid or expired businesses are restricted according to the grace-period policy.'}</p></div><AsyncButton className={setup.testMode ? 'primary-button' : 'filter-button'} busyLabel="Updating…" onClick={toggleEnforcement}>{setup.testMode ? 'Turn enforcement on' : 'Turn enforcement off'}</AsyncButton></div>
      <form className="settings-form" onSubmit={saveSetup}><h3>Plan settings</h3><label>Price in minor units<input name="amount" type="number" min="1" step="1" required defaultValue={setup.plan?.amount || ''} /></label><label>Currency<select name="currency" defaultValue={setup.plan?.currency || 'NGN'}>{['NGN', 'GHS', 'ZAR', 'KES', 'USD', 'XOF'].map(currency => <option key={currency}>{currency}</option>)}</select></label><label>Subscription duration (days)<input name="days" type="number" min="1" max="730" required defaultValue={setup.plan?.days || 30} /></label><label>Free trial (days)<input name="freeTrialDays" type="number" min="0" max="365" required defaultValue={setup.plan?.freeTrialDays || 0} /></label><label>Grace period (calendar months)<input name="graceMonths" type="number" min="0" max="12" required defaultValue={setup.plan?.graceMonths ?? 1} /><span>Set 0 to block POS immediately after expiry.</span></label><label>Reminder window (days)<input name="reminderDays" type="number" min="1" max="30" required defaultValue={setup.plan?.reminderDays || 7} /></label><label>First referral reward (%)<input name="firstReferralPercent" type="number" min="0" max="100" step="0.01" required defaultValue={setup.plan?.firstReferralPercent || 0} /></label><label>Renewal referral reward (%)<input name="recurringReferralPercent" type="number" min="0" max="100" step="0.01" required defaultValue={setup.plan?.recurringReferralPercent || 0} /></label><button className="primary-button" type="submit">Save plan</button></form></>}
    </section>}
  </>
}
