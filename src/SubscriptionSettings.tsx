import { PayoutBankForm } from './PayoutBankForm'
import { useEffect, useRef, useState } from 'react'
import { AsyncButton } from './AsyncControls'
import { cloudRequest, CloudAuthenticationError } from './lib/cloudRequest'
import type { SubscriptionAccess } from '../server/subscription-policy.mjs'
import { isPlayStoreBuild, PlayBilling, type PlayProduct } from './lib/playBilling'

type Plan = { amount: number; currency: string; days: number; reminderDays: number; freeTrialDays: number; graceMonths?: number; graceDays?: number; firstReferralPercent?: number; recurringReferralPercent?: number; visitorFirstReferralPercent?: number; visitorRecurringReferralPercent?: number }
type NamedPlan = Plan & { id: string; name: string }
type EnterpriseRequest = { id: string; status: 'pending' | 'approved' | 'paid'; message?: string; offeredAmount?: number; offeredCurrency?: string; offeredDays?: number; offerNote?: string }
type Summary = { plan: Plan | null; plans?: NamedPlan[]; access: SubscriptionAccess; subscription: { expiresAt?: string | null; planId?: string; paystackAutoRenewStatus?: string; paystackNextPaymentDate?: string | Date | null } | null; enterpriseRequest?: EnterpriseRequest | null; isDeveloper: boolean }
type Referral = { link: string }
type ReferralWallet = { profiles: Array<{currency:string;name:string;bankName:string;accountLast4:string}>; referredBusinesses: number; automaticTransfersEnabled: boolean; balances: Array<{currency:string;earnedMinor:number;paidMinor:number;pendingMinor:number;availableMinor:number}>; commissions: Array<{reference:string;amountMinor:number;currency:string;percent:number;kind:string;createdAt:string}>; payouts: Array<{id:string;amountMinor:number;currency:string;status:string;method:string;createdAt:string}> }
type BusinessExitStatus = { canExport: boolean; subscriptionAvailable: boolean; exportError: string; businessName: string; feeAmount: number; feeCurrency: string; paid: boolean; exported: boolean; closed: boolean; paymentStatus: string }
const summaryCacheKey = 'stockroom-subscription-summary'

export function SubscriptionSettings({ apiUrl, token, localToken, onAccess, onToken, onFinalExit, signInToCloud }: { apiUrl: string; token: string; localToken: string; onAccess: (access: SubscriptionAccess) => void; onToken: (token: string, refreshToken: string) => void; onFinalExit: () => Promise<void>; signInToCloud: (identifier: string, password: string) => Promise<{ accessToken: string; refreshToken: string }> }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [referral, setReferral] = useState<Referral | null>(null)
  const [referralWallet, setReferralWallet] = useState<ReferralWallet | null>(null)
  const [enterpriseMessage, setEnterpriseMessage] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCloudSignIn, setShowCloudSignIn] = useState(false)
  const [cloudIdentifier, setCloudIdentifier] = useState('')
  const [cloudPassword, setCloudPassword] = useState('')
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const [businessExit, setBusinessExit] = useState<BusinessExitStatus | null>(null)
  const [exitName, setExitName] = useState('')
  const [playMode, setPlayMode] = useState<boolean | null>(null)
  const [playProducts, setPlayProducts] = useState<PlayProduct[]>([])
  const [playProductIds, setPlayProductIds] = useState<Record<string, string>>({})
  const [playExportProductId, setPlayExportProductId] = useState('')
  const [playExportProduct, setPlayExportProduct] = useState<PlayProduct | null>(null)
  const [playAccountBinding, setPlayAccountBinding] = useState('')
  const [playLoading, setPlayLoading] = useState(false)
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
    const current = () => version === loadVersion.current
    setLoading(true); setError('')
    const failures: string[] = []
    let authenticationFailed = false
    const section = async (label: string, path: string, apply: (data: any) => void) => {
      try {
        const data = await cloudRequest(apiUrl, path, {}, onToken, token)
        if (current()) apply(data)
      } catch (caught) {
        if (!current()) return
        authenticationFailed ||= caught instanceof CloudAuthenticationError
        failures.push(`${label}: ${caught instanceof Error ? caught.message : 'Could not load details.'}`)
      }
    }
    await Promise.all([
      section('Subscription', '/v1/subscriptions', (next: Summary) => {
        if(!next?.access || typeof next.access.blocked!=='boolean' || typeof next.access.status!=='string')throw new Error('Subscription details are unavailable. Refresh to retry.')
        setSummary(next); onAccess(next.access)
        try { localStorage.setItem(summaryCacheKey, JSON.stringify(next)) } catch { /* Storage may be unavailable. */ }
      }),
      section('Export and exit', '/v1/subscriptions/business-exit', setBusinessExit),
      section('Invitation link', '/v1/subscriptions/referrals', setReferral),
      section('Referral wallet', '/v1/referral-wallet/me', (next:ReferralWallet)=>{
        if(!Array.isArray(next?.balances)||!Array.isArray(next.commissions))throw new Error('Referral wallet is unavailable. Refresh to retry.')
        setReferralWallet(next)
      }),
    ])
    if (!current()) return
    setNeedsSignIn(authenticationFailed)
    setError(failures.join(' '))
    setLoading(false)
    const code = sessionStorage.getItem('stockroom-referral-code') || ''
    if (/^[a-f0-9]{32}$/.test(code) && !failures.length) {
      try {
        await cloudRequest(apiUrl, '/v1/subscriptions/referrals', { method: 'POST', body: JSON.stringify({ code }) }, onToken, token)
        if (!current()) return
        sessionStorage.removeItem('stockroom-referral-code')
        setMessage('Your referral was applied.')
      } catch (caught) {
        if (current()) {
          setNeedsSignIn(caught instanceof CloudAuthenticationError)
          setError(caught instanceof Error ? caught.message : 'Could not apply referral.')
        }
      }
    }
  }
  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(summaryCacheKey) || 'null') as Summary | null
      if (cached?.access) { setSummary(cached); onAccess(cached.access) }
    } catch { /* A missing/corrupt cache is handled by the cloud request. */ }
  }, [apiUrl, localToken])
  useEffect(() => {
    void load()
    return () => { ++loadVersion.current }
  }, [apiUrl, token])
  useEffect(() => {
    let cancelled = false
    const listeners: Array<{ remove: () => void }> = []
    const verifyPurchase = async (purchaseToken: string) => {
      if (!purchaseToken || cancelled) return
      try {
        await cloudRequest(apiUrl, '/v1/play/subscriptions/verify', { method: 'POST', body: JSON.stringify({ purchaseToken }) }, onToken, token)
        if (!cancelled) { setMessage('Google Play confirmed your subscription.'); await load() }
      } catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Google Play purchase could not be verified. Tap Restore purchases to retry.') }
    }
    const verifyExportPurchase = async (purchaseToken: string) => {
      if (!purchaseToken || cancelled) return
      try {
        await cloudRequest(apiUrl, '/v1/play/products/verify', { method: 'POST', body: JSON.stringify({ purchaseToken }) }, onToken, token)
        if (!cancelled) { setBusinessExit(await request('/business-exit') as BusinessExitStatus); setMessage('Google Play confirmed your export payment. Download your product file to continue.') }
      } catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Google Play export payment could not be verified. Restore purchases to retry.') }
    }
    void (async () => {
      const enabled = await isPlayStoreBuild()
      if (cancelled) return
      setPlayMode(enabled)
      if (!enabled) return
      setPlayLoading(true)
      try {
        const config = await cloudRequest(apiUrl, '/v1/play/subscriptions/config', {}, onToken, token)
        const result = await PlayBilling.queryProducts({ productIds: Object.values(config.products || {}) })
        if (cancelled) return
        setPlayAccountBinding(config.obfuscatedAccountId)
        setPlayProductIds(config.products || {})
        setPlayProducts(result.products || [])
        setPlayExportProductId(config.exportProductId || '')
        listeners.push(await PlayBilling.addListener('purchaseUpdated', purchase => {
          if (purchase.purchaseState !== 1) { if (!cancelled && purchase.purchaseState === 2) setMessage('Google Play payment is pending. Access will be enabled after Google confirms payment.'); return }
          if (config.exportProductId && purchase.products?.includes(config.exportProductId)) void verifyExportPurchase(purchase.purchaseToken)
          else void verifyPurchase(purchase.purchaseToken)
        }))
        listeners.push(await PlayBilling.addListener('purchaseError', failure => { if (!cancelled) setError(failure.message || 'Google Play could not complete this purchase.') }))
        if (config.exportProductId) {
          try { setPlayExportProduct(await PlayBilling.queryExportProduct({ productId: config.exportProductId })) }
          catch { if (!cancelled) setError('Google Play export product is not available. Subscription purchases remain available.') }
        }
        const restored = await PlayBilling.restorePurchases()
        for (const purchase of restored.purchases || []) void verifyPurchase(purchase.purchaseToken)
        if (config.exportProductId) {
          const exportPurchases = await PlayBilling.restoreExportPurchases()
          for (const purchase of exportPurchases.purchases || []) if (purchase.products?.includes(config.exportProductId)) void verifyExportPurchase(purchase.purchaseToken)
        }
      } catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Google Play subscriptions are not available yet.') }
      finally { if (!cancelled) setPlayLoading(false) }
    })()
    return () => { cancelled = true; for (const listener of listeners) listener.remove() }
  }, [apiUrl, token])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search), reference = params.get('reference')
    if (!reference || !token) return
    void (async () => {
      try { if (params.get('exit') === '1') { await request('/business-exit/verify', { method: 'POST', body: JSON.stringify({ reference }) }); setMessage('Export fee confirmed. Download the product file, then complete final exit.'); } else { await request('/verify', { method: 'POST', body: JSON.stringify({ reference }) }); setMessage('Payment confirmed. Your subscription has been updated.') }; window.history.replaceState(null, '', `${location.pathname}?screen=subscription`); await load() }
      catch (caught) { setError(caught instanceof Error ? caught.message : 'We could not confirm that payment yet. Refresh shortly.') }
    })()
  }, [token])
  const startBusinessExitCheckout = async () => {
    setError(''); setMessage('')
    try {
      const eligibility = await request('/business-exit') as BusinessExitStatus
      setBusinessExit(eligibility)
      if (!eligibility.subscriptionAvailable) throw new Error(eligibility.exportError)
      if (playMode === true) {
        const offer = playExportProduct?.offers?.[0]
        if (!playExportProductId || !offer) throw new Error('Google Play product export is not configured yet. Please contact Stockroom support.')
        await PlayBilling.purchaseExportProduct({ productId: playExportProductId, offerToken: offer.offerToken, obfuscatedAccountId: playAccountBinding })
        setMessage('Complete the export payment in Google Play. Stockroom will enable the download after Google confirms it.')
        return
      }
      const result = await request('/business-exit/checkout', { method: 'POST', body: JSON.stringify({ businessName: exitName }) }); if (result.paid) { setBusinessExit(await request('/business-exit') as BusinessExitStatus); return }; window.location.assign(result.authorizationUrl)
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not start the product export payment.') }
  }
  const downloadBusinessProducts = async () => {
    setError(''); setMessage('')
    try {
      if (businessExit?.canExport !== true) throw new Error(businessExit?.exportError || 'Refresh to check catalogue export eligibility.')
      const response = await fetch('/api/products/export', { headers: { Authorization: `Bearer ${token}`, 'X-Local-Session': localToken } })
      if (!response.ok) { const failure = await response.json().catch(() => ({})); throw new Error(failure.error || 'Could not export the product catalog.') }
      const file = await response.blob()
      await request('/business-exit/exported', { method: 'POST', body: '{}' })
      const url = URL.createObjectURL(file), link = document.createElement('a'); link.href = url; link.download = 'stockroom-products.csv'; link.click(); URL.revokeObjectURL(url)
      setBusinessExit(current => current ? { ...current, exported: true } : current)
      setMessage('Product catalog downloaded. Confirm your business name below to close Stockroom access.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not export the product catalog.') }
  }
  const completeBusinessExit = async () => {
    setError(''); setMessage('')
    try { await request('/business-exit/close', { method: 'POST', body: JSON.stringify({ businessName: exitName }) }); setMessage('Stockroom access closed. Your business records have been retained.'); await onFinalExit() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not complete final exit.') }
  }
  const startCheckout = async (planId: string, autoRenew = false) => {
    setError(''); setMessage('')
    try { const data = await request('/checkout', { method: 'POST', body: JSON.stringify({ planId, autoRenew }) }) as { authorizationUrl: string }; window.location.assign(data.authorizationUrl) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not start checkout.') }
  }
  const managePaystackRenewal = async () => {
    setError(''); setMessage('')
    try { const data = await request('/auto-renewal/manage', { method: 'POST', body: '{}' }) as { url: string }; window.location.assign(data.url) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not open subscription management.') }
  }
  const startPlayCheckout = async (planId: string) => {
    setError(''); setMessage('')
    try {
      if (!playAccountBinding) throw new Error('Google Play purchase linking is not ready. Refresh subscription details and try again.')
      const productId = playProductIds[planId]
      const product = playProducts.find(row => row.productId === productId)
      const offer = product?.offers?.[0]
      if (!product || !offer) throw new Error('This Google Play subscription is not available yet. Please try again later.')
      await PlayBilling.purchase({ productId, offerToken: offer.offerToken, obfuscatedAccountId: playAccountBinding })
      setMessage('Complete your subscription in the Google Play purchase window. Stockroom will activate it after Google confirms payment.')
    } catch (caught) { if (!(caught instanceof Error && /cancelled/i.test(caught.message))) setError(caught instanceof Error ? caught.message : 'Could not open Google Play checkout.') }
  }
  const restorePlayPurchases = async () => {
    setError(''); setMessage('')
    try {
      const restored = await PlayBilling.restorePurchases()
      let restoredAny = Boolean(restored.purchases?.length)
      for (const purchase of restored.purchases) await cloudRequest(apiUrl, '/v1/play/subscriptions/verify', { method: 'POST', body: JSON.stringify({ purchaseToken: purchase.purchaseToken }) }, onToken, token)
      if (playExportProductId) {
        const exports = await PlayBilling.restoreExportPurchases()
        for (const purchase of exports.purchases || []) if (purchase.products?.includes(playExportProductId)) { await cloudRequest(apiUrl, '/v1/play/products/verify', { method: 'POST', body: JSON.stringify({ purchaseToken: purchase.purchaseToken }) }, onToken, token); restoredAny = true }
        setBusinessExit(await request('/business-exit') as BusinessExitStatus)
      }
      if (!restoredAny) { setMessage('Google Play did not find an active subscription or export payment for this account.'); return }
      setMessage('Google Play subscription restored.'); await load()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not restore Google Play subscriptions.') }
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
  const plan = summary?.plan
  const plans = summary?.plans?.length ? summary.plans : plan ? [{ ...plan, id: 'monthly', name: 'Monthly' }] : []
  const expires = summary?.subscription?.expiresAt
  const renewalStatus = summary?.subscription?.paystackAutoRenewStatus || ''
  const paystackRenewalActive = ['active', 'attention'].includes(renewalStatus)
  const paystackRenewalManageable = ['active', 'attention', 'non_renewing'].includes(renewalStatus)
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

  return <>
    {summary?.isDeveloper && <section className="panel full-panel subscription-panel"><div className="panel-heading"><div><h2>Developer Control Centre</h2><p>Business records, referral attribution, promoter wallets, and payout requests have their own workspace.</p></div><a className="primary-button" href="/developer">Open Control Centre</a></div></section>}
    <section className="panel full-panel subscription-panel">
      <div className="panel-heading"><div><h2>Subscription</h2><p>Choose a plan and manage your renewal.</p></div><AsyncButton className="text-button" busyLabel="Refreshing…" onClick={load}>Refresh</AsyncButton></div>
      {error && <p className="auth-error" role="alert">{error}</p>}{message && <p className="settings-message" role="status">{message}</p>}
      {needsSignIn && <div className="subscription-cloud-sign-in"><p>Subscription changes require the cloud owner account. This does not sign you out of the app.</p>{showCloudSignIn ? <form className="settings-form" onSubmit={restoreCloudOwnerSession}><label>Cloud owner email<input type="email" value={cloudIdentifier} onChange={event => setCloudIdentifier(event.target.value)} autoComplete="username" required /></label><label>Cloud owner password<input type="password" value={cloudPassword} onChange={event => setCloudPassword(event.target.value)} autoComplete="current-password" required /></label><div className="report-actions"><button className="primary-button" type="submit">Sign in to cloud</button><button type="button" className="filter-button" onClick={() => { setShowCloudSignIn(false); setCloudPassword('') }}>Cancel</button></div></form> : <button type="button" className="primary-button" onClick={() => setShowCloudSignIn(true)}>Sign in to cloud</button>}</div>}
      {!plan ? <p className="subscription-status">{!summary ? (loading ? 'Loading subscription details...' : 'Subscription details are unavailable. Tap Refresh to retry.') : 'A subscription plan has not been configured yet.'}</p> : <div className="subscription-summary"><div><span>Current base plan</span><strong>{plan.currency} {(plan.amount / 100).toFixed(2)}</strong><small>{plan.days} days of access</small></div><div><span>Status</span><strong>{summary?.access.status === 'active' ? 'Active' : summary?.access.status === 'trial' ? 'Free trial' : summary?.access.status === 'trial-expired' ? 'Trial ended' : summary?.access.status === 'grace' ? 'Grace period' : summary?.access.status === 'test' ? 'Enforcement off' : 'Payment needed'}</strong><small>{summary?.access.status === 'trial' ? `Trial ends ${new Date(summary.access.expiresAt || '').toLocaleDateString()}` : expires ? `Renewal due ${new Date(expires).toLocaleDateString()}` : summary?.access.reason}</small></div></div>}
      {plans.length > 0 && <p className="subscription-status">{playMode === true ? 'Google Play manages renewal and cancellation for subscriptions purchased in this app.' : 'Select a plan. Renewal is optional.'}</p>}
      {playMode === false && paystackRenewalManageable && <div className="subscription-enforcement"><div><strong>{renewalStatus === 'active' ? 'Automatic renewal is on' : renewalStatus === 'attention' ? 'Your renewal payment needs attention' : 'Automatic renewal is set to stop'}</strong><p>{summary?.subscription?.paystackNextPaymentDate ? `Next scheduled charge: ${new Date(summary.subscription.paystackNextPaymentDate).toLocaleDateString()}. ` : ''}Use the secure billing page to update your payment method or cancel future charges.</p></div><AsyncButton className="filter-button" busyLabel="Opening billing page…" onClick={managePaystackRenewal}>Manage or cancel renewal</AsyncButton></div>}
      {playMode === true && <div className="subscription-enforcement"><div><strong>Google Play subscriptions</strong><p>Purchases in this app are processed by Google Play. The subscription is linked to this business account.</p></div><AsyncButton className="filter-button" busyLabel="Checking purchases…" disabled={playLoading} onClick={restorePlayPurchases}>Restore purchases</AsyncButton></div>}
      {playMode === true && playLoading && <p className="subscription-status">Loading Google Play subscription prices…</p>}
      {plans.length > 0 && <div className="subscription-plan-options">{plans.map(option => {
        const product = playProducts.find(row => row.productId === playProductIds[option.id])
        const playButton = <AsyncButton className="primary-button" busyLabel="Opening Google Play…" disabled={playMode === null || playLoading || !product?.offers?.length} onClick={() => startPlayCheckout(option.id)}>Subscribe with Google Play</AsyncButton>
        return <article key={option.id}><strong>{option.name}</strong>{option.id !== 'enterprise' && <><span>{playMode === true ? (product?.offers?.[0]?.formattedPrice || 'Price shown by Google Play') : `${option.currency} ${(option.amount / 100).toFixed(2)}`}</span><small>{option.days} days of access</small>{playMode === true ? playButton : playMode === false ? <><AsyncButton className="primary-button" busyLabel="Connecting to checkout…" disabled={paystackRenewalActive} onClick={() => startCheckout(option.id, false)}>Pay once</AsyncButton><AsyncButton className="filter-button" busyLabel="Setting up renewal…" disabled={paystackRenewalActive || paystackRenewalManageable || !['monthly', 'yearly'].includes(option.id)} onClick={() => startCheckout(option.id, true)}>Enable automatic renewal</AsyncButton><details className="subscription-plan-renewal"><summary>How renewal works</summary><small>{option.id === 'monthly' ? 'Renews monthly' : option.id === 'yearly' ? 'Renews annually' : ''} until you cancel. The amount and available payment methods are shown before you authorize recurring charges. Automatic renewal requires an eligible card or, in Nigeria, supported Direct Debit.</small></details></> : <button className="primary-button" disabled>Loading payment options…</button>}</>}{option.id === 'enterprise' && <>{summary?.enterpriseRequest?.status === 'approved' ? <><span>{playMode === true ? (product?.offers?.[0]?.formattedPrice || 'Price shown by Google Play') : `${summary.enterpriseRequest.offeredCurrency} ${((summary.enterpriseRequest.offeredAmount || 0) / 100).toFixed(2)}`}</span><small>{summary.enterpriseRequest.offeredDays} days · Your proposal is ready.</small>{summary.enterpriseRequest.offerNote && <small>{summary.enterpriseRequest.offerNote}</small>}{playMode === true ? playButton : <AsyncButton className="primary-button" busyLabel="Connecting to checkout…" onClick={startEnterpriseCheckout}>Pay approved proposal once</AsyncButton>}</> : summary?.enterpriseRequest?.status === 'pending' ? <small>Your request is awaiting a proposal.</small> : <><small>Tell us what your business needs and we will send a custom proposal.</small><textarea aria-label="Enterprise requirements" value={enterpriseMessage} maxLength={1000} placeholder="Number of stores, users, integrations, support needs…" onChange={event => setEnterpriseMessage(event.target.value)} /><AsyncButton className="primary-button" busyLabel="Sending request…" onClick={requestEnterprise}>Request Enterprise proposal</AsyncButton></>}</>}</article>
      })}</div>}
      {!referral && <p>Invitation link {loading ? 'is loading...' : 'is unavailable. Tap Refresh to retry.'}</p>}
      {referral && <details className="subscription-secondary"><summary>Invite another business</summary><div className="subscription-enforcement"><div><strong>Invite another business</strong><p>Share your invitation before they create their business account.</p><input id="owner-referral-link" readOnly value={referral.link} onFocus={event => event.currentTarget.select()} aria-label="Business-owner referral link" /></div><AsyncButton className="filter-button" busyLabel="Copying…" onClick={copyReferral}>Copy invitation</AsyncButton></div></details>}
    </section>
    <details className="subscription-secondary"><summary>Export product data or close business</summary>
    {!businessExit && <section className="panel full-panel subscription-panel"><h2>Export and leave Stockroom</h2><p>{loading ? 'Loading export details...' : 'Export details are unavailable. Tap Refresh to retry.'}</p></section>}
    {businessExit && <section className="panel full-panel subscription-panel"><div className="panel-heading"><div><h2>Export and leave Stockroom</h2><p>Download your shop catalog before closing this business in Stockroom. Closing blocks future cloud sign-ins and sync; stored records are retained.</p></div></div>{businessExit.closed ? <p className="subscription-status">This business has completed its Stockroom exit. Its saved records remain retained.</p> : <><label className="settings-form">Business name confirmation<input required value={exitName} onChange={event => setExitName(event.target.value)} placeholder={businessExit.businessName} /></label><p className="subscription-status">An active subscription or trial is required in addition to the developer-configured export fee. Trading grace does not cover catalogue downloads. The export includes product details, prices, units, reorder points, and stock by branch. This is a one-time charge of {playMode === true ? (playExportProduct?.offers?.[0]?.formattedPrice || 'Price shown by Google Play') : `${businessExit.feeCurrency} ${(businessExit.feeAmount / 100).toFixed(2)}`}{businessExit.feeAmount === 0 ? ' (currently free)' : ''}.</p>{businessExit.exportError && <p role="status">{businessExit.exportError}</p>}{!businessExit.paid && businessExit.feeAmount > 0 && <AsyncButton className="primary-button" busyLabel={playMode === true ? "Opening Google Play…" : "Opening secure checkout…"} disabled={!businessExit.subscriptionAvailable || exitName.trim().toLocaleLowerCase() !== businessExit.businessName.trim().toLocaleLowerCase() || (playMode === true && !playExportProduct?.offers?.length)} onClick={startBusinessExitCheckout}>{playMode === true ? 'Pay once with Google Play' : 'Pay once and export products'}</AsyncButton>}{(businessExit.paid || businessExit.feeAmount === 0) && <AsyncButton className="primary-button" busyLabel="Preparing product export…" disabled={!businessExit.canExport} onClick={downloadBusinessProducts}>Download shop products</AsyncButton>}{businessExit.exported && <AsyncButton className="filter-button" busyLabel="Closing business…" disabled={exitName.trim().toLocaleLowerCase() !== businessExit.businessName.trim().toLocaleLowerCase()} onClick={completeBusinessExit}>Confirm name and exit Stockroom</AsyncButton>}</>}</section>}    </details>
    <details className="subscription-secondary"><summary>Referral rewards and withdrawals</summary>
    <section className="panel full-panel subscription-panel"><div className="panel-heading"><div><h2 id="owner-referral-wallet">Your referral wallet</h2><p>{referralWallet?.referredBusinesses || 0} registered business(es) attributed to your invitation.</p></div></div>{!referralWallet ? <p>Referral wallet is unavailable right now.</p> : <><div className="subscription-summary">{referralWallet.balances.length ? referralWallet.balances.map(row => <div key={row.currency}><span>{row.currency} available</span><strong>{row.currency} {(row.availableMinor / 100).toFixed(2)}</strong><small>Earned {(row.earnedMinor / 100).toFixed(2)} · paid {(row.paidMinor / 100).toFixed(2)} · pending {(row.pendingMinor / 100).toFixed(2)}</small></div>) : <p>No verified referral rewards yet.</p>}</div><p className="subscription-status">Payout mode: {referralWallet.automaticTransfersEnabled ? 'Automatic bank transfer is available after you save a payout account.' : 'Submit a withdrawal request for the Stockroom team to process.'}</p>{referralWallet.automaticTransfersEnabled && <PayoutBankForm request={(path, init) => cloudRequest(apiUrl, path, init || {}, onToken, token)} onSaved={async () => { setReferralWallet(await cloudRequest(apiUrl, '/v1/referral-wallet/me', {}, onToken, token) as ReferralWallet) }} />}{referralWallet.profiles?.map(profile => <p key={profile.currency}>{profile.name} / {profile.bankName} ending {profile.accountLast4} ({profile.currency})</p>)}{referralWallet.balances.some(row => row.availableMinor > 0) && <form className="settings-form" onSubmit={requestReferralPayout}><h3>Request referral payout</h3><label>Currency<select name="currency" required>{referralWallet.balances.filter(row => row.availableMinor > 0).map(row => <option key={row.currency}>{row.currency}</option>)}</select></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Note for Stockroom support (optional)<input name="note" maxLength={300} /></label><button className="primary-button" type="submit">Request payout</button></form>}<div className="table-wrap"><table><thead><tr><th>Reward</th><th>Amount</th><th>Rate</th><th>Date</th></tr></thead><tbody>{referralWallet.commissions.map(row => <tr key={row.reference}><td>{row.kind === 'first' ? 'First payment' : 'Renewal'}</td><td>{row.currency} {(row.amountMinor / 100).toFixed(2)}</td><td>{row.percent}%</td><td>{new Date(row.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div></>}</section>
    </details>
  </>
}
