import { PayoutBankForm } from './PayoutBankForm'
import { PasswordInput } from './PasswordInput'
import { useEffect, useRef, useState } from 'react'
import { AsyncButton } from './AsyncControls'
import { cloudRequest, CloudAuthenticationError } from './lib/cloudRequest'
import type { SubscriptionAccess } from '../server/subscription-policy.mjs'
import { isPlayStoreBuild, PlayBilling, type PlayProduct } from './lib/playBilling'
import { TaskPicker, type TaskOption } from './TaskPicker'
import { normalizeShopProfile, type ShopProfile } from '../server/shop-profile.mjs'
import { shareLink } from './lib/shareLink'
import { quoteWorkspacePlan, workspaceBasePlanId, workspaceExtraPercent as calculateWorkspaceExtraPercent } from '../server/workspace-subscription-pricing.mjs'

type Plan = { amount: number; currency: string; days: number; reminderDays: number; freeTrialDays: number; graceMonths?: number; graceDays?: number; firstReferralPercent?: number; recurringReferralPercent?: number; visitorFirstReferralPercent?: number; visitorRecurringReferralPercent?: number }
type NamedPlan = Plan & { id: string; name: string }
type EnterpriseRequest = { id: string; status: 'pending' | 'approved' | 'paid'; message?: string; offeredAmount?: number; offeredCurrency?: string; offeredDays?: number; offerNote?: string }
type Summary = { plan: Plan | null; plans?: NamedPlan[]; workspacePricing?: { count: number; names: string[]; workspaceKeys?: string[]; addonPercent: number; hotelAddonPercent?: number; nightlifeAddonPercent?: number; extraPercent?: number }; sponsorDiscountPercent?: number; access: SubscriptionAccess; subscription: { expiresAt?: string | null; planId?: string; workspaceCount?: number; paystackAutoRenewStatus?: string; paystackNextPaymentDate?: string | Date | null; playSubscriptionState?: string; playExpiresAt?: string | Date | null; playPlanId?: string } | null; enterpriseRequest?: EnterpriseRequest | null; isDeveloper: boolean }
type Referral = { link: string }
type ReferralWallet = { profiles: Array<{currency:string;name:string;bankName:string;accountLast4:string}>; referredBusinesses: number; automaticTransfersEnabled: boolean; balances: Array<{currency:string;earnedMinor:number;paidMinor:number;pendingMinor:number;availableMinor:number}>; commissions: Array<{reference:string;amountMinor:number;currency:string;percent:number;kind:string;createdAt:string}>; payouts: Array<{id:string;amountMinor:number;currency:string;status:string;method:string;createdAt:string}> }
type BusinessExitStatus = { canExport: boolean; subscriptionAvailable: boolean; exportError: string; businessName: string; feeAmount: number; feeCurrency: string; paid: boolean; exported: boolean; closed: boolean; paymentStatus: string }
const summaryCacheKey = 'stockroom-subscription-summary'

export function SubscriptionSettings({ apiUrl, token, localToken, onAccess, onToken, onFinalExit, signInToCloud, shopProfile, saveShopProfile, workspaceUpgrade, onReturnToWorkspaceSettings }: { apiUrl: string; token: string; localToken: string; onAccess: (access: SubscriptionAccess) => void; onToken: (token: string, refreshToken: string) => void; onFinalExit: () => Promise<void>; signInToCloud: (identifier: string, password: string) => Promise<{ accessToken: string; refreshToken: string }>; shopProfile: ShopProfile; saveShopProfile: (profile: ShopProfile) => Promise<void>; workspaceUpgrade?: { count: number; names: string[]; workspaceKeys?: string[] } | null; onReturnToWorkspaceSettings?: () => void }) {
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
  const [task, setTask] = useState('subscription')
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [showFreePlanConfirm, setShowFreePlanConfirm] = useState(false)
  const [savingFreePlan, setSavingFreePlan] = useState(false)
  const [renewAutomatically, setRenewAutomatically] = useState(false)
  const planCarouselRef = useRef<HTMLDivElement>(null)
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
    try { const data = await request('/checkout', { method: 'POST', body: JSON.stringify({ planId, autoRenew, workspaceCount, ...(workspaceUpgrade?.workspaceKeys ? { workspaceKeys: workspaceUpgrade.workspaceKeys } : {}) }) }) as { authorizationUrl: string }; window.location.assign(data.authorizationUrl) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not start checkout.') }
  }
  const managePaystackRenewal = async () => {
    setError(''); setMessage('')
    try { const data = await request('/auto-renewal/manage', { method: 'POST', body: '{}' }) as { url: string }; window.location.assign(data.url) }
    catch { setError('Could not open subscription management. Try again, or contact Stockroom support.') }
  }
  const managePlaySubscription = () => { window.open('https://play.google.com/store/account/subscriptions', '_blank', 'noopener,noreferrer') }
  const startPlayCheckout = async (planId: string) => {
    setError(''); setMessage('')
    try {
      if (!playAccountBinding) throw new Error('Google Play purchase linking is not ready. Refresh subscription details and try again.')
      const prepared = await cloudRequest(apiUrl, '/v1/play/subscriptions/prepare', { method: 'POST', body: JSON.stringify({ planId, workspaceKeys: selectedWorkspaceKeys }) }, onToken, token) as { productId: string; basePlanId: string; obfuscatedProfileId: string }
      const product = playProducts.find(row => row.productId === prepared.productId)
      const offer = product?.offers?.find(item => item.basePlanId === prepared.basePlanId)
      if (!product || !offer) throw new Error(`Google Play price ${prepared.basePlanId} is not active for ${planId}. Ask the developer to configure this base plan in Play Console.`)
      await PlayBilling.purchase({ productId: prepared.productId, offerToken: offer.offerToken, obfuscatedAccountId: playAccountBinding, obfuscatedProfileId: prepared.obfuscatedProfileId })
      setMessage('Complete your subscription in the Google Play purchase window. Stockroom will activate the same workspace selection after Google confirms payment.')
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
    try { const data = await request('/enterprise-checkout', { method: 'POST', body: JSON.stringify({ workspaceCount, ...(workspaceUpgrade?.workspaceKeys ? { workspaceKeys: workspaceUpgrade.workspaceKeys } : {}) }) }) as { authorizationUrl: string }; window.location.assign(data.authorizationUrl) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not open your Enterprise payment link.') }
  }
  const plan = summary?.plan
  const plans = summary?.plans?.length ? summary.plans : plan ? [{ ...plan, id: 'monthly', name: 'Monthly' }] : []
  const workspaceCount = workspaceUpgrade?.count ?? summary?.workspacePricing?.count ?? 1
  const workspaceAddonPercent = summary?.workspacePricing?.addonPercent ?? 5
  const selectedWorkspaceKeys = workspaceUpgrade?.workspaceKeys || summary?.workspacePricing?.workspaceKeys || []
  const workspacePricingConfig = { workspaceAddonPercent, hotelWorkspaceAddonPercent: summary?.workspacePricing?.hotelAddonPercent ?? 10, nightlifeWorkspaceAddonPercent: workspaceAddonPercent }
  const workspaceExtraPercent = selectedWorkspaceKeys.length ? calculateWorkspaceExtraPercent(selectedWorkspaceKeys, workspacePricingConfig) : summary?.workspacePricing?.extraPercent ?? Math.max(0, workspaceCount - 1) * workspaceAddonPercent
  const selectedBasePlanId = workspaceBasePlanId(workspaceExtraPercent, Boolean(summary?.sponsorDiscountPercent))
  const freePlan: NamedPlan = { id: 'free', name: 'Free', amount: 0, currency: plan?.currency || 'NGN', days: 0, reminderDays: 0, freeTrialDays: 0 }
  const displayPlans = [freePlan, ...plans]
  const planQuote = (option: NamedPlan) => option.id === 'free' ? 0 : Math.round(quoteWorkspacePlan({ amount: option.id === 'enterprise' && summary?.enterpriseRequest?.status === 'approved' ? summary.enterpriseRequest.offeredAmount || option.amount : option.amount }, selectedWorkspaceKeys, workspacePricingConfig).amount * (100 - (summary?.sponsorDiscountPercent || 0)) / 100)
  const defaultPlanId = workspaceCount === 0 ? 'free' : summary?.subscription?.planId || 'monthly'
  const selectedPlan = displayPlans.find(option => option.id === selectedPlanId) || displayPlans.find(option => option.id === defaultPlanId) || displayPlans[0]
  const selectedPlayProduct = selectedPlan ? playProducts.find(row => row.productId === playProductIds[selectedPlan.id]) : undefined
  const selectedPlayOffer = selectedPlayProduct?.offers?.find(item => item.basePlanId === selectedBasePlanId)
  const continueWithSelectedPlan = () => {
    if (!selectedPlan) return
    if (selectedPlan.id === 'free') { setShowFreePlanConfirm(true); return }
    if (selectedPlan.id === 'enterprise') {
      if (summary?.enterpriseRequest?.status === 'approved') void startEnterpriseCheckout()
      else if (summary?.enterpriseRequest?.status !== 'pending') void requestEnterprise()
    } else if (playMode === true) void startPlayCheckout(selectedPlan.id)
    else if (playMode === false) void startCheckout(selectedPlan.id, renewAutomatically)
  }
  const expires = summary?.subscription?.expiresAt || summary?.access?.expiresAt
  const renewalStatus = summary?.subscription?.paystackAutoRenewStatus || ''
  const paystackRenewalActive = ['active', 'attention'].includes(renewalStatus)
  const paystackRenewalManageable = ['active', 'attention', 'non_renewing'].includes(renewalStatus)
  const playRenewalManageable = playMode === true && ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'].includes(summary?.subscription?.playSubscriptionState || '')
  const hasActiveRenewal = paystackRenewalActive || (playRenewalManageable && Boolean(summary?.subscription?.playExpiresAt && new Date(summary.subscription.playExpiresAt) > new Date()))
  const activateFreePlan = async () => {
    setSavingFreePlan(true); setError(''); setMessage('')
    try {
      const freeProfile = normalizeShopProfile({ ...shopProfile, workspaceSelectionVersion: 1, workflows: 'payments', fastFood: false, restaurant: false, features: { ...shopProfile.features, productSales: false, oilSales: false } })
      await saveShopProfile(freeProfile)
      const freeAccess: SubscriptionAccess = { ...(summary?.access || { blocked: false, status: 'free', reason: '' }), blocked: false, status: 'free', reason: 'Payments & receipts is the only enabled workspace.' }
      setSummary(current => current ? { ...current, workspacePricing: { count: 0, names: [], addonPercent: workspaceAddonPercent }, access: freeAccess } : current)
      onAccess(freeAccess)
      setSelectedPlanId('free'); setShowFreePlanConfirm(false)
      setMessage(hasActiveRenewal ? 'Payments & receipts is now the only enabled workspace. Your current renewal remains active until you cancel it.' : 'Free plan selected. Payments & receipts is the only enabled workspace.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not switch to the Free plan.') }
    finally { setSavingFreePlan(false) }
  }
  const copyReferral = async () => { if (!referral) return; try { await navigator.clipboard.writeText(referral.link); setMessage('Invitation link copied.') } catch { const input = document.getElementById('owner-referral-link') as HTMLInputElement | null; input?.focus(); input?.select(); setMessage('The invitation link is selected. Copy it and share it before the business registers.') } }
  const shareReferral = async () => { if (!referral) return; try { await shareLink({ title: 'Share Stockroom', text: 'Start a Stockroom business with my referral link:', url: referral.link }); setMessage('Choose where to share your business invitation link.') } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not open the share menu.') } }
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
  const subscriptionTasks: TaskOption[] = [
    {id:'subscription',label:'Plan and renewal',hint:'Check access, choose a plan, or manage renewal.'},
    {id:'referrals',label:'Referral rewards',hint:'Share an invitation and review or request referral payouts.'},
    {id:'business-exit',label:'Export or close business',hint:'Download product data and complete a business exit.'},
    ...(summary?.isDeveloper ? [{id:'developer',label:'Developer control centre',hint:'Open business, referral and payout administration.'}] : []),
  ]
  const activeTask = subscriptionTasks.some(item=>item.id===task) ? task : 'subscription'

  return <div className="subscription-workspace">
    <TaskPicker scope="Subscription" items={subscriptionTasks} value={activeTask} onChange={setTask} />
    {error && <p className="auth-error subscription-feedback" role="alert">{error.replace(/paystack/gi, 'payment provider')}</p>}{message && <p className="settings-message subscription-feedback" role="status">{message}</p>}
    {activeTask==='developer' && summary?.isDeveloper && <section className="panel full-panel subscription-panel subscription-task-panel"><div className="panel-heading"><div><h2>Developer Control Centre</h2><p>Business records, referral attribution and payout requests.</p></div><a className="primary-button" href="/developer">Open Control Centre</a></div></section>}
    {activeTask==='subscription' && <section className="panel full-panel subscription-panel subscription-task-panel">
      <div className="panel-heading"><div><span className="subscription-kicker">STOCKROOM PLANS</span><h2>Choose your plan</h2><p>One plan covers your selling workspaces.</p></div><AsyncButton className="text-button" busyLabel="Refreshing…" onClick={load}>Refresh</AsyncButton></div>
      {workspaceUpgrade && <div className="subscription-enforcement"><div><strong>Subscription quote for your workspace selection</strong><p>{workspaceUpgrade.names.join(' · ')} · {workspaceCount} selling workspace{workspaceCount === 1 ? '' : 's'}. The selection is still pending; return to Business settings after payment to save it.</p></div>{onReturnToWorkspaceSettings && <button type="button" className="filter-button" onClick={onReturnToWorkspaceSettings}>Return to workspace settings</button>}</div>}
      {summary?.workspacePricing && workspaceCount === 0 && <p className="subscription-enforcement">Payments &amp; receipts is free. No subscription payment is needed until you add a selling workspace.</p>}{summary?.workspacePricing && <section className="subscription-benefit"><div><h3>One subscription. Multiple workspaces.</h3><p>{workspaceCount ? (workspaceUpgrade?.names || summary.workspacePricing.names).join(" · ") : "Payments & receipts is free. Add a selling workspace when you’re ready."}</p></div><strong>{workspaceCount ? `${workspaceCount} included` : "Free workspace"}<small>Payments & receipts stays free</small></strong><span>Standard +{workspaceAddonPercent}% / Hotel +{summary.workspacePricing.hotelAddonPercent ?? 10}% / Nightlife and other non-Hotel workspaces +{workspaceAddonPercent}% per extra workspace</span></section>}
            {needsSignIn && <div className="subscription-cloud-sign-in"><p>Subscription changes require the cloud owner account. This does not sign you out of the app.</p>{showCloudSignIn ? <form className="settings-form" onSubmit={restoreCloudOwnerSession}><label>Cloud owner email<input type="email" value={cloudIdentifier} onChange={event => setCloudIdentifier(event.target.value)} autoComplete="username" required /></label><label>Cloud owner password<PasswordInput value={cloudPassword} onChange={event => setCloudPassword(event.target.value)} autoComplete="current-password" required /></label><div className="report-actions"><button className="primary-button" type="submit">Sign in to cloud</button><button type="button" className="filter-button" onClick={() => { setShowCloudSignIn(false); setCloudPassword('') }}>Cancel</button></div></form> : <button type="button" className="primary-button" onClick={() => setShowCloudSignIn(true)}>Sign in to cloud</button>}</div>}
      {!plan ? <p className="subscription-status">{!summary ? (loading ? 'Loading subscription details...' : 'Subscription details are unavailable. Tap Refresh to retry.') : 'A subscription plan has not been configured yet.'}</p> : <div className="subscription-current"><span>{summary?.access.status === 'active' ? 'Active' : summary?.access.status === 'trial' ? 'Free trial' : summary?.access.status === 'trial-expired' ? 'Trial ended' : summary?.access.status === 'grace' ? 'Grace period' : summary?.access.status === 'test' ? 'Enforcement off' : summary?.access.status === 'free' ? 'Free plan' : 'Payment needed'}</span><small>{summary?.access.status === 'trial' ? `Trial ends ${new Date(summary.access.expiresAt || '').toLocaleDateString()}` : expires ? `Renewal due ${new Date(expires).toLocaleDateString()}` : summary?.access.reason}</small></div>}      {playMode === false && paystackRenewalManageable && <div className="subscription-enforcement"><div><strong>{renewalStatus === 'active' ? 'Automatic renewal is on' : renewalStatus === 'attention' ? 'Your renewal payment needs attention' : 'Automatic renewal is set to stop'}</strong><p>{summary?.subscription?.paystackNextPaymentDate ? `Next scheduled charge: ${new Date(summary.subscription.paystackNextPaymentDate).toLocaleDateString()}. ` : ''}Update your payment method or cancel renewal.</p></div><AsyncButton className="filter-button" busyLabel="Opening subscription management…" onClick={managePaystackRenewal}>Manage or cancel subscription</AsyncButton></div>}
      {playRenewalManageable && <div className="subscription-enforcement"><div><strong>Automatic renewal is {summary?.subscription?.playSubscriptionState === 'SUBSCRIPTION_STATE_CANCELED' ? 'set to stop' : 'on'}</strong><p>{summary?.subscription?.playExpiresAt ? `Current access ends ${new Date(summary.subscription.playExpiresAt).toLocaleDateString()}. ` : ''}Manage or cancel your subscription at any time.</p></div><button type="button" className="filter-button" onClick={managePlaySubscription}>Manage or cancel subscription</button></div>}
      {playMode === true && <div className="subscription-enforcement"><div><strong>Google Play subscriptions</strong><p>Google Play bills this subscription to your business account.</p></div><AsyncButton className="filter-button" busyLabel="Checking purchases…" disabled={playLoading} onClick={restorePlayPurchases}>Restore purchases</AsyncButton></div>}
      {playMode === true && playLoading && <p className="subscription-status">Loading Google Play subscription prices…</p>}
      {playMode === false && workspaceCount > 0 && selectedPlan?.id !== 'free' && <div className="subscription-billing-choice"><span>Payment schedule</span><button type="button" className={!renewAutomatically ? 'selected' : ''} aria-pressed={!renewAutomatically} onClick={() => setRenewAutomatically(false)}>Pay once</button><button type="button" className={renewAutomatically ? 'selected' : ''} aria-pressed={renewAutomatically} onClick={() => setRenewAutomatically(true)}>Auto-renew</button><small>Cancel renewal any time.</small></div>}
      {displayPlans.length > 0 && <><div className="subscription-plan-options" aria-label="Subscription plans">{displayPlans.map(option => {
        if (option.id === 'free') return <article key={option.id} data-plan-id="free" className={`subscription-plan-card subscription-free-plan${selectedPlan?.id === 'free' ? ' selected' : ''}`}><div className="subscription-plan-flip"><div className="subscription-plan-face subscription-plan-front"><strong>Free</strong><h3>Payments &amp; receipts</h3><span>{option.currency} 0</span><small>One free workspace</small><ul><li>Record service payments and issue receipts.</li><li>Keep selling workspaces off until you need them.</li></ul><button type="button" className="primary-button subscription-free-desktop-action" disabled={workspaceCount === 0} onClick={() => setShowFreePlanConfirm(true)}>{workspaceCount === 0 ? 'Current plan' : 'Use Free plan'}</button></div></div></article>
        const productKey = option.id
        const product = playProducts.find(row => row.productId === playProductIds[productKey])
        const activePlayOffer = product?.offers?.find(item => item.basePlanId === selectedBasePlanId)
        const playButton = <AsyncButton className="primary-button" busyLabel="Opening Google Play…" disabled={workspaceCount === 0 || playMode === null || playLoading || !activePlayOffer} onClick={() => startPlayCheckout(option.id)}>Subscribe with Google Play</AsyncButton>
        return <article key={option.id} data-plan-id={option.id} className={`subscription-plan-card${selectedPlan?.id === option.id ? " selected" : ""}`}><div className="subscription-plan-flip"><div className="subscription-plan-face subscription-plan-front"><strong>{option.name}</strong>{option.id !== 'enterprise' && <><span>{playMode === true ? (activePlayOffer?.formattedPrice || 'Price shown by Google Play') : `${option.currency} ${(planQuote(option) / 100).toFixed(2)}`}</span><small>{option.days} days of access</small>{playMode === true ? playButton : playMode === false ? <><AsyncButton className="primary-button" busyLabel={renewAutomatically ? "Setting up renewal…" : "Connecting to checkout…"} disabled={workspaceCount === 0 || paystackRenewalActive || (renewAutomatically && (paystackRenewalManageable || !['monthly', 'yearly'].includes(option.id)))} onClick={() => startCheckout(option.id, renewAutomatically)}>{renewAutomatically ? `Continue · ${option.id === 'monthly' ? 'monthly renewal' : 'annual renewal'}` : 'Continue · pay once'}</AsyncButton>{['monthly','yearly'].includes(option.id)&&<small>{option.id==='monthly'?'Renews monthly':'Renews annually'} until cancelled. Amount and method are confirmed before payment.</small>}</> : <button className="primary-button" disabled>Loading payment options…</button>}</>}{option.id === 'enterprise' && <>{summary?.enterpriseRequest?.status === 'approved' ? <><span>{playMode === true ? 'Custom Enterprise proposals cannot use the fixed Google Play subscription prices.' : `${summary.enterpriseRequest.offeredCurrency} ${(planQuote(option) / 100).toFixed(2)}`}</span><small>{summary.enterpriseRequest.offeredDays} days · Your proposal is ready.</small>{summary.enterpriseRequest.offerNote && <small>{summary.enterpriseRequest.offerNote}</small>}{playMode === false && <AsyncButton className="primary-button" busyLabel="Connecting to checkout…" disabled={workspaceCount === 0} onClick={startEnterpriseCheckout}>Pay approved proposal once</AsyncButton>}</> : summary?.enterpriseRequest?.status === 'pending' ? <small>Your request is awaiting a proposal.</small> : <><small>Describe what your business needs for a custom plan.</small><textarea aria-label="Enterprise requirements" value={enterpriseMessage} maxLength={1000} placeholder="Stores, users or support needs" onChange={event => setEnterpriseMessage(event.target.value)} /><AsyncButton className="primary-button" busyLabel="Sending request…" onClick={requestEnterprise}>Request Enterprise proposal</AsyncButton></>}</>}</div><div className="subscription-plan-face subscription-plan-back"><h3>{option.name}</h3><p>One plan covers your enabled selling workspaces.</p><ul><li>Sales, orders and stock stay connected.</li><li>Payments &amp; receipts are always free.</li><li>{workspaceCount > 1 ? `${workspaceCount - 1} extra workspace slots are priced by type: Hotel ${summary?.workspacePricing?.hotelAddonPercent ?? 10}%, all non-Hotel workspaces ${workspaceAddonPercent}%.` : "One selling workspace included."}</li></ul></div></div></article>
      })}</div><div className="subscription-mobile-cta"><div className="subscription-mobile-plan-picker" aria-label="Choose subscription plan">{displayPlans.map(option => <button key={option.id} type="button" className={selectedPlan?.id === option.id ? 'selected' : ''} aria-pressed={selectedPlan?.id === option.id} onClick={() => setSelectedPlanId(option.id)}>{option.name}</button>)}</div><AsyncButton className="primary-button" busyLabel="Opening checkout…" disabled={!selectedPlan || (selectedPlan.id === 'free' && workspaceCount === 0) || (selectedPlan.id !== 'free' && playMode === null) || (playMode === true && selectedPlan.id !== 'free' && selectedPlan.id !== 'enterprise' && !selectedPlayOffer) || (playMode === true && selectedPlan.id === 'enterprise' && summary?.enterpriseRequest?.status === 'approved') || (selectedPlan.id === 'enterprise' && summary?.enterpriseRequest?.status === 'pending') || (playMode === false && selectedPlan.id !== 'enterprise' && (paystackRenewalActive || (renewAutomatically && (paystackRenewalManageable || !['monthly', 'yearly'].includes(selectedPlan.id)))))} onClick={continueWithSelectedPlan}>{selectedPlan?.id === 'free' ? (workspaceCount === 0 ? 'Free plan active' : 'Use Free plan') : selectedPlan?.id === 'enterprise' ? (summary?.enterpriseRequest?.status === 'approved' ? 'Continue with Enterprise' : 'Request Enterprise proposal') : `Continue with ${selectedPlan?.name || 'plan'}`}</AsyncButton></div></>}
      {showFreePlanConfirm && <div className="subscription-free-confirm-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !savingFreePlan) setShowFreePlanConfirm(false) }}><section className="subscription-free-confirm" role="dialog" aria-modal="true" aria-labelledby="free-plan-confirm-title"><h3 id="free-plan-confirm-title">Switch to the Free plan?</h3><p>Only Payments &amp; receipts will stay enabled. Product sales, Oil sales, Order counter and Tables &amp; tabs will be turned off. Their saved records will remain in your business.</p><p>Choosing Free does not cancel or refund a paid subscription. If you have an active renewal, charges continue until you cancel it: use Manage or cancel subscription on this screen. On Android, use the subscription settings in the app store where you subscribed.</p><div className="subscription-free-confirm-actions"><button type="button" className="filter-button" disabled={savingFreePlan} onClick={() => setShowFreePlanConfirm(false)}>Keep current setup</button><AsyncButton type="button" className="primary-button" busyLabel="Switching workspaces…" disabled={savingFreePlan} onClick={activateFreePlan}>Switch to Free</AsyncButton></div></section></div>}
    </section>}
    {activeTask==='business-exit' && <section className="panel full-panel subscription-panel subscription-task-panel"><div className="panel-heading"><div><h2>Export and leave Stockroom</h2><p>Export product data, then confirm if you want to close this business.</p></div></div>{!businessExit ? <p>{loading ? 'Loading export details…' : 'Export details are unavailable. Refresh subscription details to retry.'}</p> : businessExit.closed ? <p className="subscription-status">This business has completed its Stockroom exit. Its saved records remain retained.</p> : <><p className="subscription-status">Closing stops cloud sign-in and sync. Saved business records are retained.</p><label className="subscription-exit-name">Business name confirmation<input required value={exitName} onChange={event => setExitName(event.target.value)} placeholder={businessExit.businessName} /></label><p className="subscription-status">The one-time export fee is {playMode === true ? (playExportProduct?.offers?.[0]?.formattedPrice || 'Price shown by Google Play') : `${businessExit.feeCurrency} ${(businessExit.feeAmount / 100).toFixed(2)}`}{businessExit.feeAmount === 0 ? ' (currently free)' : ''}. An active subscription or trial is required.</p>{businessExit.exportError && <p role="status">{businessExit.exportError}</p>}{!businessExit.paid && businessExit.feeAmount > 0 && <AsyncButton className="primary-button" busyLabel={playMode === true ? 'Opening Google Play…' : 'Opening secure checkout…'} disabled={!businessExit.subscriptionAvailable || exitName.trim().toLocaleLowerCase() !== businessExit.businessName.trim().toLocaleLowerCase() || (playMode === true && !playExportProduct?.offers?.length)} onClick={startBusinessExitCheckout}>{playMode === true ? 'Pay once with Google Play' : 'Pay once and export products'}</AsyncButton>}{(businessExit.paid || businessExit.feeAmount === 0) && <AsyncButton className="primary-button" busyLabel="Preparing product export…" disabled={!businessExit.canExport} onClick={downloadBusinessProducts}>Download shop products</AsyncButton>}{businessExit.exported && <AsyncButton className="filter-button" busyLabel="Closing business…" disabled={exitName.trim().toLocaleLowerCase() !== businessExit.businessName.trim().toLocaleLowerCase()} onClick={completeBusinessExit}>Confirm name and exit Stockroom</AsyncButton>}</>}</section>}
    {activeTask==='referrals' && <section className="panel full-panel subscription-panel subscription-task-panel"><div className="panel-heading"><div><h2>Referral rewards</h2><p>Verified Play and Paystack purchases can earn rewards. Cash-outs use Paystack balance or manual processing.</p></div></div>{!referral ? <p>{loading ? 'Loading invitation link…' : 'Invitation link is unavailable. Refresh to retry.'}</p> : <div className="subscription-invite"><label>Business invitation link<input id="owner-referral-link" readOnly value={referral.link} onFocus={event => event.currentTarget.select()} /></label><AsyncButton className="filter-button" busyLabel="Copying…" onClick={copyReferral}>Copy invitation</AsyncButton><AsyncButton className="filter-button" busyLabel="Opening share menu…" onClick={shareReferral}>Share invitation</AsyncButton></div>}{!referralWallet ? <p>Referral wallet is unavailable right now.</p> : <><div className="subscription-summary">{referralWallet.balances.length ? referralWallet.balances.map(row=><div key={row.currency}><span>{row.currency} available</span><strong>{row.currency} {(row.availableMinor/100).toFixed(2)}</strong><small>Earned {(row.earnedMinor/100).toFixed(2)} · paid {(row.paidMinor/100).toFixed(2)} · pending {(row.pendingMinor/100).toFixed(2)}</small></div>) : <p>No verified referral rewards yet.</p>}</div>{referralWallet.automaticTransfersEnabled && <PayoutBankForm request={(path,init)=>cloudRequest(apiUrl,path,init||{},onToken,token)} onSaved={async()=>setReferralWallet(await cloudRequest(apiUrl,'/v1/referral-wallet/me',{},onToken,token) as ReferralWallet)}/>}<div className="subscription-payout-grid">{referralWallet.profiles?.map(profile=><p key={profile.currency}>{profile.name} / {profile.bankName} ending {profile.accountLast4} ({profile.currency})</p>)}{referralWallet.balances.some(row=>row.availableMinor>0)&&<form className="settings-form" onSubmit={requestReferralPayout}><h3>Request payout</h3><label>Currency<select name="currency" required>{referralWallet.balances.filter(row=>row.availableMinor>0).map(row=><option key={row.currency}>{row.currency}</option>)}</select></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required/></label><label>Note for support (optional)<input name="note" maxLength={300}/></label><button className="primary-button" type="submit">Request payout</button></form>}</div><div className="table-wrap"><table><thead><tr><th>Reward</th><th>Amount</th><th>Rate</th><th>Date</th></tr></thead><tbody>{referralWallet.commissions.map(row=><tr key={row.reference}><td>{row.kind==='first'?'First payment':'Renewal'}</td><td>{row.currency} {(row.amountMinor/100).toFixed(2)}</td><td>{row.percent}%</td><td>{new Date(row.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div></>}</section>}
  </div>
}
