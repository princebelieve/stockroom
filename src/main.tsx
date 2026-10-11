import { EmptyScreen, ScreenPicker } from './EmptyScreen'
import { HelpMenu } from './HelpMenu'
import { AppIntroduction } from './AppIntroduction'
import { ListSort, type ListOrder } from './ListSort'
import { NavigationGroup } from './NavigationGroup'
import { ToolSearch } from './ToolSearch'
import { SyncStatusIndicator, syncErrorMessage } from './SyncStatusIndicator'
import { ReadingControls } from './ReadingControls'
import type { ReportChartData } from './ReportCharts'
import { BirthdayReminders, CustomerBirthday } from './CustomerBirthdays'
import { CatalogueStarters } from './CatalogueStarters'
import { effectivePermissions, hasPermission, screenPermission } from '../server/staff-permissions.mjs'
import type { SyncConflict } from './SyncIssues'
import { readWeighing } from './lib/weighingSettings'
import { weightLabel } from '../server/weighed-goods.mjs'
import { SharedPreparationPrinter } from './SharedPreparationPrinter'
import type { CounterOrder } from './CounterService'
import { businessDate, businessDayStart, nextBusinessDate } from '../server/report-timezone.mjs'
import { RemoveStaffButton } from './RemoveStaffButton'
import { usePortalMenu } from './lib/usePortalMenu'

import { OrderDocument, type PrintableOrder } from './OrderDocument'
import { PosProviderSelect } from './PosProviderSelect'
import { lazy, Suspense } from 'react'
const WeighingSetup=lazy(()=>import('./WeighedGoods').then(module=>({default:module.WeighingSetup})))
const WeighedCheckout=lazy(()=>import('./WeighedGoods').then(module=>({default:module.WeighedCheckout})))
const ReportCharts=lazy(()=>import('./ReportCharts').then(module=>({default:module.ReportCharts})))
const BusinessSetup=lazy(()=>import('./BusinessSetup').then(module=>({default:module.BusinessSetup})))
const OilPricing=lazy(()=>import('./OilPricing').then(module=>({default:module.OilPricing})))
const WorkspaceOverview=lazy(()=>import('./WorkspaceOverview').then(module=>({default:module.WorkspaceOverview})))
const RestaurantService=lazy(()=>import('./RestaurantService').then(module=>({default:module.RestaurantService})))
const SupermarketReports=lazy(()=>import('./SupermarketReports').then(module=>({default:module.SupermarketReports})))
const SupermarketStock=lazy(()=>import('./SupermarketStock').then(module=>({default:module.SupermarketStock})))
const Purchasing=lazy(()=>import('./Purchasing').then(module=>({default:module.Purchasing})))
const ShopSetup=lazy(()=>import('./ShopSetup').then(module=>({default:module.ShopSetup})))
const CustomerPortal=lazy(()=>import('./CustomerPortal').then(module=>({default:module.CustomerPortal})))
const Receipt=lazy(()=>import('./Receipt').then(module=>({default:module.Receipt})))
const BrandAppearance=lazy(()=>import('./BrandAppearance').then(module=>({default:module.BrandAppearance})))
const BusinessBackup=lazy(()=>import('./BusinessBackup').then(module=>({default:module.BusinessBackup})))
const TillRecovery=lazy(()=>import('./TillRecovery').then(module=>({default:module.TillRecovery})))
const StaffPermissions=lazy(()=>import('./StaffPermissions').then(module=>({default:module.StaffPermissions})))
const SyncIssues=lazy(()=>import('./SyncIssues').then(module=>({default:module.SyncIssues})))
const Reconciliation=lazy(()=>import('./Reconciliation').then(module=>({default:module.Reconciliation})))
const PaymentEvidence=lazy(()=>import('./PaymentEvidence').then(module=>({default:module.PaymentEvidence})))
import { WorkspaceHelp, WorkspaceHelpProvider } from './WorkspaceHelp'
import { BookOpen } from 'lucide-react'
import { WorkspaceOnboarding, workspaceSetupKey, type SetupWorkspace } from './WorkspaceOnboarding'
import { screenSection, initialScreenSections } from './lib/screenSections'
import { screenHelpFor } from './lib/screenHelp'
import { priceOrder, posSettings } from '../server/pos-pricing.mjs'
import { checkoutTillId } from './lib/checkoutTill'
import { businessWorkspace, workspaceCatalogueOptions, type CatalogueWorkspace } from '../server/shop-profile.mjs'
import { counterItems, counterSaleId } from '../server/counter-service.mjs'
import { ServicePayments } from './ServicePayments'
import { PaystackTerminalPayment, type TerminalPayment } from './PaystackTerminalPayment'
import { PosTools, DigitalReceipt, posRequest } from './PosTools'
import { usePosBasket } from './lib/usePosBasket'
import { PosCatalog } from './PosCatalog'
import { PaymentMethodPicker } from './PaymentMethodPicker'
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { subscriptionAccess, type SubscriptionAccess } from '../server/subscription-policy.mjs'
import { readPosAccess } from './lib/subscriptionAccess'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { AlertTriangle, ArrowDownToLine, ArrowLeft, ArrowUpToLine, BarChart3, Boxes, CheckSquare, CloudOff, Download, Eye, EyeOff, LayoutDashboard, Menu, MoreHorizontal, PackagePlus, PanelLeftClose, PanelLeftOpen, Plus, Printer, RefreshCw, Search, ScanLine, Settings2, ShoppingCart, SlidersHorizontal, Store, Trash2, UserRoundCog, WalletCards, Wifi, X } from 'lucide-react'
import type { Customer, Product, Sale, Stocktake } from './types'
import { getReceiptHistory, cacheProducts, getCachedProducts, getQueuedOperations, queueOperation, removeQueuedOperation, replaceQueuedProductId, saveSale, upsertCachedProducts } from './lib/offlineStore'
import { installMobileApi } from './lib/mobileApi'
import { localSessionFetch } from './lib/localSessionFetch'
import { cloudRequest } from './lib/cloudRequest'
import { teamSessionFetch } from './lib/teamSessionFetch'
import { refreshDeadline } from './lib/refreshDeadline'
import { isNativeMobile } from './lib/mobileDatabase'
import { isBrowserPwa } from './lib/platform'
import { resolveStartupState } from './lib/startupState'
import './styles.css'
import './ui.css'
import './operational.css'
import { ReceiptPhoto } from './ReceiptPhoto'
import { WalletCustomer } from './WalletCustomer'
import { QrCode } from './QrCode'
import { CartItem } from './CartItem'
import { summarizeCart } from './lib/posCart'
import { paymentPolicy, recordPayment, type PaymentPolicy } from '../server/payment.mjs'
import { referenceFromScan } from './lib/reconciliation'
import { AsyncForm, SubmitButton, AsyncButton } from './AsyncControls'
import { DeviceSetup } from './DeviceSetup'
import { scannerSettings, type DeviceKind } from './lib/deviceSetup'
import { readTerminalSettings, canRecordTerminalPayment } from './lib/terminalSettings'
import { printerSettings, printDocument } from './lib/printing'
import { PaymentPolicySettings } from './PaymentPolicySettings'
import { ProductIntake } from './ProductIntake'
import { HandwrittenProductForm } from './HandwrittenProductForm'
import { lookupProductBarcode, validGtin, type ProductDraft } from './lib/productIntake'
import { workspaceCapabilities, workspaceScreenAvailable } from '../server/workspace-capabilities.mjs'
import { normalizeShopProfile, businessPresets, applyBusinessPreset, type ShopProfile, type BusinessMode } from '../server/shop-profile.mjs'
import type { CatalogueStarter } from '../server/catalogue-starters.mjs'
import { ShopProductFields, collectCustomValues } from './ShopProductFields'
import { readCustomValues, validateCustomValues } from '../server/shop-fields.mjs'
import { applyLogoTheme } from './lib/logoTheme'
import { resolveCloudAccessToken } from './lib/cloudSession'
import { SubscriptionSettings } from './SubscriptionSettings'
import { AccountDeletionPanel } from './AccountDeletionPanel'
import { NotificationCenter } from './NotificationCenter'
import { AppUpdatePrompt } from './AppUpdatePrompt'
import { type StaffActivityEvent, type StaffActivitySummary } from './lib/staffActivityData'

const incomingReferralCode = new URLSearchParams(window.location.search).get('ref') || ''
if (/^[a-f0-9]{32}$/.test(incomingReferralCode)) sessionStorage.setItem('stockroom-referral-code', incomingReferralCode)

function PageOptions({ onRefresh, busy, refreshing }: { onRefresh: () => void; busy: boolean; refreshing: boolean }) {
  const menu = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.current?.open) {
        menu.current.open = false
        menu.current.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  return <><span className="page-refresh-status" role="status" aria-live="polite">{refreshing && <><RefreshCw size={16} className="spin" aria-hidden="true" />Refreshing?</>}</span><details className="page-options" ref={menu} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) event.currentTarget.open = false
  }}>
    <summary className="icon-button" aria-label="Page options" title="Page options"><MoreHorizontal size={19} /></summary>
    <div className="page-options-panel">
      <button type="button" disabled={busy} onClick={() => {
        if (menu.current) {
          menu.current.open = false
          menu.current.querySelector('summary')?.focus()
        }
        onRefresh()
      }}><RefreshCw size={16} className={busy ? 'spin' : ''} />{busy ? 'Refreshing…' : 'Refresh'}</button>
    </div>
  </details></>
}

if (!isNativeMobile() && !isBrowserPwa()) {
  window.fetch = localSessionFetch(window.fetch.bind(window), window.location.origin, () => localStorage.getItem('stockroom-token') || '')
  window.fetch = teamSessionFetch(window.fetch, window.location.origin, async () => {
    await cloudRequest('/api/cloud', '/v1/auth/me', {}, () => {})
    return localStorage.getItem('stockroom-cloud-access-token') || ''
  })
}
installMobileApi()
if (isBrowserPwa()) {
  const { installBrowserApi } = await import('./lib/installBrowserApi')
  installBrowserApi()
}

let reloadingForPwaUpdate = false
if (isBrowserPwa() && 'serviceWorker' in navigator) {
  // A new worker controls future fetches, not the JavaScript document that is
  // already open. Reload exactly once when control changes so an installed
  // PWA receives a deployment without requiring the owner to swipe it away.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForPwaUpdate) return
    reloadingForPwaUpdate = true
    window.location.reload()
  })
  const register = async () => {
    try {
      // Calling register on every launch makes the browser check the deployed
      // worker instead of leaving an existing PWA shell untouched forever.
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await registration.update()
      const checkForUpdate = () => { void registration.update().catch(() => undefined) }
      window.setInterval(checkForUpdate, 5 * 60_000)
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate() })
    } catch {
      // Ignore registration failures; app can still operate without the PWA shell cache.
    }
  }
  if (document.readyState === 'complete') void register()
  else window.addEventListener('load', () => { void register() }, { once: true })
}

type AppSettings = {
  shopProfile?: ShopProfile | string | null
  appName: string
  currency: string
  posProvider: string
  posTerminalId: string
  posConnection: string
  logoData?: string
  paymentPolicy?: PaymentPolicy
  updatedAt: string
  ownerConfigured?: boolean
  cloudConfigured?: boolean
  existingBusiness?: boolean
}

const UserGuide = lazy(()=>import('./UserGuide').then(module=>({default:module.UserGuide})))

type User = { id: string; name: string; email: string; username?: string; role: 'owner' | 'admin' | 'cashier'; permissions?:Record<string,boolean>|null; operationalAccess?: boolean; organizationId: string }
type Branch = { id: string; name: string; address: string; isDefault: boolean; isActive?: boolean; assignedUserIds?: string[] }

const navigableScreens = ['Overview', 'Inventory', 'Stocktake', 'Oil', 'POS', 'Payments', 'Counter', 'RetailOrders', 'Restaurant', 'Register', 'Guide', 'Display', 'Sales', 'Movements', 'Wallet', 'Owner', 'Reports', 'Activity', 'Sync', 'Team', 'Subscription', 'Device', 'Settings', 'Account'] as const
function navigationKey(user: User) { return `stockroom-active-screen:${user.organizationId}:${user.id}` }
function defaultScreen(user: User) { return user.role === 'cashier' && !user.operationalAccess ? 'POS' : 'Overview' }
function screenAllowedByRole(screen: string, user: User) {
  if (!navigableScreens.includes(screen as typeof navigableScreens[number])) return false
  if (screen === 'Subscription') return true
  if (screen === 'Account') return user.role === 'owner'
  if(user.permissions&&user.role!=='owner'){if(['Team','Subscription'].includes(screen))return false;if(screen==='Guide')return true;if(screen==='RetailOrders')return hasPermission(user,'productSales')||hasPermission(user,'oilSales');if(screen==='Payments')return ['payments','serviceJobs','church'].some(key=>hasPermission(user,key));if(screen==='Sales')return hasPermission(user,'sales')||hasPermission(user,'refunds');if(screen==='Inventory')return ['inventory','purchasing'].some(key=>hasPermission(user,key));const key=screenPermission(screen);return key?hasPermission(user,key):screen==='Overview'&&Object.values(effectivePermissions(user)).some(Boolean)}
  if (user.role === 'cashier' && !user.operationalAccess) return screen === 'POS' || screen === 'Payments' || screen === 'Counter' || screen === 'RetailOrders' || screen === 'Restaurant' || screen === 'Register' || screen === 'Guide'
  if (screen === 'Team' || screen === 'Subscription') return user.role === 'owner'
  if (screen === 'Owner' || screen === 'Reports' || screen === 'Activity' || screen === 'Sync') return user.role === 'owner' || user.role === 'admin'
  if (screen === 'Device' || screen === 'Settings') return user.role === 'owner' || user.role === 'admin'
  if (screen === 'Display') return !isBrowserPwa() && !isNativeMobile()
  return true
}
function preferredScreen(user: User) {
  const saved = localStorage.getItem(navigationKey(user))
  return saved && saved !== 'Subscription' && screenAllowedByRole(saved, user) ? saved : defaultScreen(user)
}
function initialScreen() {
  try {
    const user = JSON.parse(localStorage.getItem('stockroom-user') || 'null') as User | null
    if (user?.role === 'owner' && new URLSearchParams(window.location.search).get('screen') === 'account-deletion') return 'Account'
    const requested = new URLSearchParams(window.location.search).get('screen')
    if (user && requested && screenAllowedByRole(requested, user)) return requested
    return user ? preferredScreen(user) : 'Overview'
  } catch { return 'Overview' }
}
type SaleRecord = { id: string; total: number; paymentMethod: string; paymentReference: string; terminalProvider: string; paymentDetails?: Sale['paymentDetails']; cashReceived?: number | null; changeGiven?: number | null; staffId?: string; staffName?: string; createdAt: string; items: Array<{ productId: string; productName: string; quantity: number; unitPrice: number }> }
type SaleItemVoid = { id: string; orderId: string; productId: string; productName: string; quantity: number; unitPrice: number; reason: string; staffId: string; staffName: string; createdAt: string }

type Movement = { id: string; productName: string; sku: string; quantity: number; reason: string; createdAt: string }
type SyncStatus = { configured: boolean; pending: number; pendingSettings?: number; conflicts?: number; lastError: string; existingBusiness?: boolean }
type StaffUser = { id: string; name: string; email: string; username?: string; role: 'owner' | 'admin' | 'cashier'; permissions?:Record<string,boolean>|null; operationalAccess?: boolean; createdAt: string }
type Reports = { charts?: ReportChartData; costWarnings?: { incomplete: boolean; zeroCostSaleLines: number; missingRecipes: string[]; uncostedIngredients: number; uncostedMaterials?: number }; reportingTimeZone?: string; daily: { total: number; count: number }; weekly: { total: number; count: number }; monthly: { total: number; count: number }; inventory: { value: number; products: number; lowStock: number }; profit: { revenue: number; cost: number; expenses: number; amount: number } }
type Expense = { id: string; category: string; description: string; amount: number; incurredAt: string; staffId?: string; staffName?: string }
type InlinePromptRequest = { title: string; message: string; label?: string; inputType?: 'text' | 'password'; initialValue?: string; minLength?: number; resolve: (value: string | null) => void }

function InlinePrompt({ request, onClose }: { request: InlinePromptRequest; onClose: (value: string | null) => void }) {
  const [value, setValue] = useState(request.initialValue || '')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  return <div className="modal-backdrop" onMouseDown={() => onClose(null)}><form className="modal" role="dialog" aria-modal="true" aria-labelledby="inline-prompt-title" onMouseDown={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); onClose(value) }}><div className="modal-head"><div><h2 id="inline-prompt-title">{request.title}</h2><p>{request.message}</p></div><button type="button" className="icon-button" aria-label="Cancel" onClick={() => onClose(null)}><X size={19} /></button></div><label>{request.label || 'Value'}<input ref={input} type={request.inputType || 'text'} value={value} minLength={request.minLength} required onChange={event => setValue(event.target.value)} /></label><div className="report-actions"><button type="button" className="filter-button" onClick={() => onClose(null)}>Cancel</button><button className="primary-button" type="submit">Continue</button></div></form></div>
}

function PublicLandingLink() {
  const desktop = Boolean(window.stockroomDesktop)
  const external = isNativeMobile() || desktop
  const url = new URL(external ? 'https://stockroom.globalcreest.com/welcome' : '/welcome', location.origin)
  const referral = sessionStorage.getItem('stockroom-referral-code') || new URLSearchParams(location.search).get('ref') || ''
  if (/^[a-f0-9]{32}$/.test(referral)) url.searchParams.set('ref', referral)
  return <><a className="text-button public-landing-link" href={url.href} {...(desktop ? { target: '_blank', rel: 'noreferrer' } : {})}>Back to Stockroom landing page</a><small className="project-copyright">S. B. Ibhadode Technologies Copyright, 2026 ? <a href="privacy.html">Privacy</a> ? <a href="terms.html">Terms</a></small></>
}

function App() {
  const [desktopLayout,setDesktopLayout]=useState(()=>window.matchMedia('(min-width:1024px)').matches)
  const [posCatalogueShare,setPosCatalogueShare]=useState(()=>{try{return Math.min(78,Math.max(35,Number(localStorage.getItem('stockroom-pos-catalogue-share'))||64))}catch{return 64}})
  const [desktopSidebarCollapsed,setDesktopSidebarCollapsed]=useState(()=>localStorage.getItem('stockroom-sidebar-collapsed')==='true')
  const [chooseBranch,setChooseBranch]=useState(false)
  const [workspaceSetupRequested,setWorkspaceSetupRequested]=useState(false)
  const [branchError,setBranchError]=useState('')
  const [branchRetry,setBranchRetry]=useState(0)
  const [needsIntroduction,setNeedsIntroduction]=useState(()=>{try{return localStorage.getItem('stockroom-introduction-v1')!=='seen'}catch{return true}})
  const deriveSku = (name: string) => `${name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 24).toUpperCase() || 'PRODUCT'}-${crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`
  const [products, setProducts] = useState<Product[]>([])
  const [weighedReview,setWeighedReview]=useState<{product:Product;quantity:number}|null>(null)
  const [productOrder,setProductOrder]=useState<ListOrder>(()=>(sessionStorage.getItem('stockroom-product-order')||'az') as ListOrder)
  const [productFilter,setProductFilter]=useState<'all'|'low'>('all')
  const [paymentTab,setPaymentTab]=useState(''),[paymentNavigation,setPaymentNavigation]=useState(0)
  const [customerQuery,setCustomerQuery]=useState(''),[customerOrder,setCustomerOrder]=useState<ListOrder>('az')
  const [query, setQuery] = useState('')
  const [inventoryQuery, setInventoryQuery] = useState('')
  const [scannedProductSuggestion,setScannedProductSuggestion]=useState<ProductDraft|null>(null)
  const [active, setActive] = useState(initialScreen)
  const [sections, setSections] = useState<Record<string,string>>(()=>initialScreenSections(initialScreen()))
  const chooseSection = (id:string) => {
    if (id === section) return
    const url = new URL(window.location.href)
    url.hash = id
    window.history.replaceState({...window.history.state,stockroomNavigation:true,screen:active,section}, '', window.location.href)
    window.history.pushState({stockroomNavigation:true,screen:active,section:id,previousScreen:active}, '', url)
    setSections(current=>({...current,[active]:id}))
    window.scrollTo({top:0})
  }

  const [expandedSidebarGroup, setExpandedSidebarGroup] = useState<'Sales' | 'Team' | null>(null)
  useEffect(()=>{
    const nav=document.querySelector('#business-navigation nav')
    if(!nav)return
    nav.querySelectorAll<HTMLElement>('.nav-item').forEach(item=>{
      const label=(item.getAttribute('aria-label')||Array.from(item.childNodes).filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join(' ').trim()||item.textContent||'Navigation').replace(/[+−-]/g,'').trim()
      item.dataset.compactLabel=label.slice(0,2).toUpperCase()
      if(!item.title)item.title=label
    })
  },[active,desktopLayout,desktopSidebarCollapsed,expandedSidebarGroup])
  useEffect(() => { if (user && active !== 'Subscription' && screenAllowedForUser(active, user)) localStorage.setItem(navigationKey(user), active) }, [active])
  const navigateToSection = (screen: 'Sales' | 'Team' | 'Settings' | 'Inventory' | 'Wallet' | 'Reports', sectionId: string) => {
    if (sectionId === 'team-cashier-activity') { setActive('Activity'); return }
    setSections(current=>({...current,[screen]:sectionId==='inventory-purchasing'?'purchasing':sectionId}))
    setMobileMenuOpen(false)
    const current = window.history.state as { stockroomNavigation?: boolean; screen?: string } | null
    const url = new URL(window.location.href)
    url.hash = sectionId
    if (current?.stockroomNavigation && current.screen === screen && (window.history.state as { section?: string }).section === sectionId) {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    window.history.pushState({ stockroomNavigation: true, screen, section: sectionId, previousScreen: current?.screen || active }, '', url)
    setActive(screen)
    window.setTimeout(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }
  const goBackInApp = () => {
    if (active === 'Overview') return
    const current = window.history.state as { stockroomNavigation?: boolean; previousScreen?: string } | null
    if (current?.stockroomNavigation && current.previousScreen) {
      window.history.back()
      return
    }
    setActive('Overview')
  }
  useEffect(() => {
    const state = window.history.state as { stockroomNavigation?: boolean; screen?: string } | null
    if (!state?.stockroomNavigation) {
      window.history.replaceState({ stockroomNavigation: true, screen: active, section:screenSection(active,sections[active]), previousScreen: '' }, '', window.location.href)
    } else if (state.screen !== active) {
      const url = new URL(window.location.href)
      url.hash = ''
      window.history.pushState({ stockroomNavigation: true, screen: active, section:screenSection(active,sections[active]), previousScreen: state.screen || '' }, '', url)
    }
  }, [active])
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state && typeof event.state === 'object' ? event.state as { stockroomNavigation?: boolean; screen?: string; section?: string } : null
      if(state?.screen) setSections(current=>({...current,[state.screen!]:state.section==='inventory-purchasing'?'purchasing':state.section || ''}))
      setActive(state?.stockroomNavigation && state.screen ? state.screen : 'Overview')
      if (state?.stockroomNavigation && state.section) {
        window.setTimeout(() => document.getElementById(state.section!)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])
  const {open:mobileMenuOpen,setOpen:setMobileMenuOpen,menu:mobileMenuRef,toggle:mobileMenuToggleRef} = usePortalMenu(true)
  useEffect(()=>{const media=window.matchMedia('(min-width:1024px)');const update=()=>{setDesktopLayout(media.matches);if(media.matches)setMobileMenuOpen(false)};media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[])
  const [deviceSetupKind, setDeviceSetupKind] = useState<DeviceKind | undefined>()
  const [settingsTab, setSettingsTab] = useState<'business' | 'shop' | 'sales' | 'receipts' | 'devices' | 'food' | 'restaurant'>('business')
  const [detailsProduct, setDetailsProduct] = useState<Product | null>(null)
  const [productDraft, setProductDraft] = useState<ProductDraft | undefined>()
  const [productReturn,setProductReturn]=useState<{screen:'Inventory'|'POS'|'Oil';section:string;catalogueWorkspace:CatalogueWorkspace}|null>(null)
  const [productFlowMessage,setProductFlowMessage]=useState('')
  function openAddProduct(draft?: ProductDraft, message = '') {
    setProductDraft(draft)
    setProductFlowMessage(message)
    const available = businessWorkspace(shopProfile)
    const catalogueWorkspace: CatalogueWorkspace = active === 'Oil' ? 'oil-sales' : active === 'POS' ? 'product-sales' : available.productSales ? 'product-sales' : available.oil ? 'oil-sales' : available.fastFood ? 'order-counter' : 'tables-tabs'
    setProductReturn({ screen: active === 'POS' || active === 'Oil' ? active : 'Inventory', section: active === 'Inventory' ? section : 'products', catalogueWorkspace })
    setSections(current=>({...current,Inventory:'new-product'}))
    setActive('Inventory')
    setMobileMenuOpen(false)
    window.history.pushState({stockroomNavigation:true,screen:'Inventory',section:'new-product',previousScreen:active}, '', `${window.location.pathname}${window.location.search}#new-product`)
    window.scrollTo({top:0})
  }
  function leaveProductEntry(saved?: Product) {
    const destination = productReturn || { screen: 'Inventory' as const, section: 'products' }
    setProductDraft(undefined)
    setProductReturn(null)
    if (destination.screen === 'POS' || destination.screen === 'Oil') {
      if (saved && saved.stock > 0) {
        if (!Object.values(cart).some(quantity=>quantity>0)) setCurrentOrderId(crypto.randomUUID())
        setCart(current=>({...current,[saved.id]:Math.min(1,saved.stock)}))
        setPosStage('basket')
        setProductFlowMessage(`${saved.name} was added to this sale.`)
      } else if (saved) {
        setPosStage('items')
        setProductFlowMessage(`${saved.name} was saved, but has no stock available to sell yet.`)
      }
      setActive(destination.screen)
    } else {
      setSections(current=>({...current,Inventory:destination.section==='new-product'?'products':destination.section}))
      setActive('Inventory')
    }
  }
  const [online, setOnline] = useState(navigator.onLine)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ configured: false, pending: 0, lastError: '' })
  const [posAccess, setPosAccess] = useState<SubscriptionAccess>(() => subscriptionAccess(null))
  const [syncing, setSyncing] = useState(false)
  const [syncFeedback, setSyncFeedback] = useState('')
  const [syncConflicts, setSyncConflicts] = useState<SyncConflict[]>([])
  const [displayPairing, setDisplayPairing] = useState<{ url: string; code: string; expiresAt: string } | null>(null)
  const [appName, setAppName] = useState(() => localStorage.getItem('stockroom-app-name') || 'My Business')
  const [currency, setCurrency] = useState(() => localStorage.getItem('stockroom-currency') || 'USD')
  const [mongoUri, setMongoUri] = useState('')
  const [mongoDatabase, setMongoDatabase] = useState('stockroom')
  const [posProvider, setPosProvider] = useState('')
  const [posTerminalId, setPosTerminalId] = useState('')
  const [posConnection, setPosConnection] = useState('manual')
  const [logoData, setLogoData] = useState('')
  const [shopProfile, setShopProfile] = useState<ShopProfile>(() => normalizeShopProfile())
  const businessMode = shopProfile.industry
  const workspace = businessWorkspace(shopProfile)
  function screenAllowedForUser(screen:string, candidate:User) {
    if (!screenAllowedByRole(screen,candidate) || !workspaceScreenAvailable(shopProfile,screen)) return false
    if (screen==='Payments' && candidate.role!=='owner') {
      const available=workspaceCapabilities(shopProfile)
      return ['payments','serviceJobs','church'].some(key=>available[key] && hasPermission(candidate,key))
    }
    return true
  }
  const salesWorkspaceName = 'Product sales'
  const oilWorkspaceName = 'Wholesale oil sales'
  const productWorkspaceActive = active === 'POS' || active === 'Oil'
  const salesBlocked = ['POS','Oil','Payments','RetailOrders','Counter','Restaurant'].includes(active) && posAccess.blocked
  const defaultUnit = shopProfile.unit
  const [extraPaymentPolicy, setExtraPaymentPolicy] = useState<PaymentPolicy>(() => paymentPolicy())
  const settingsDraftDirty = useRef(false)
  useEffect(() => {
    const closeMobileMenu = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileMenuOpen(false) }
    window.addEventListener('keydown', closeMobileMenu)
    return () => window.removeEventListener('keydown', closeMobileMenu)
  }, [])
  useEffect(() => {
    const markSettingsDraftDirty = (event: Event) => {
      if ((event.target as HTMLElement | null)?.closest('form.settings-form')) settingsDraftDirty.current = true
    }
    document.addEventListener('input', markSettingsDraftDirty)
    document.addEventListener('change', markSettingsDraftDirty)
    return () => {
      document.removeEventListener('input', markSettingsDraftDirty)
      document.removeEventListener('change', markSettingsDraftDirty)
    }
  }, [])
  const [settingsMessage, setSettingsMessage] = useState('')
  const [inlinePrompt, setInlinePrompt] = useState<InlinePromptRequest | null>(null)
  function requestInlinePrompt(options: Omit<InlinePromptRequest, 'resolve'>) {
    return new Promise<string | null>(resolve => setInlinePrompt({ ...options, resolve }))
  }
  function closeInlinePrompt(value: string | null) {
    inlinePrompt?.resolve(value)
    setInlinePrompt(null)
  }
  const [passwordMessage, setPasswordMessage] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [posStage, setPosStage] = useState<'items' | 'basket' | 'payment'>('items')
  useEffect(() => { if (!Object.values(cart).some(quantity => quantity > 0)) setPosStage('items') }, [cart])
  const [currentOrderId, setCurrentOrderId] = useState<string>(() => crypto.randomUUID())
  const [orderToPrint, setOrderToPrint] = useState<PrintableOrder | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<Sale['paymentMethod']>('external-pos')
  const [terminalProvider, setTerminalProvider] = useState('')
  const [usePaystack, setUsePaystack] = useState(false)
  const [terminalPayment, setTerminalPayment] = useState<TerminalPayment | null>(null)

  const [paymentReference, setPaymentReference] = useState('')
  const [cashReceived, setCashReceived] = useState('')
  const [extraKept, setExtraKept] = useState('0')
  const [showExtraPayment, setShowExtraPayment] = useState(false)
  const [extraReason, setExtraReason] = useState('')
  const [extraNote, setExtraNote] = useState('')
  const [splitCash, setSplitCash] = useState('')
  const [splitTerminal, setSplitTerminal] = useState('')
  const [splitTerminalReference, setSplitTerminalReference] = useState('')
  const [splitTransfer, setSplitTransfer] = useState('')
  const [transferProvider, setTransferProvider] = useState('')
  const [transferReference, setTransferReference] = useState('')
  const [transferAmountReceived, setTransferAmountReceived] = useState('')
  const [transferOverpayment, setTransferOverpayment] = useState<'returned' | 'retained' | ''>('')
  const [user, setUser] = useState<User | null>(() => JSON.parse(localStorage.getItem('stockroom-user') || 'null'))
  const section = active==='Inventory' && user && !hasPermission(user,'inventory') ? 'purchasing' : screenSection(active,sections[active])
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('ref') || ''
    if (/^[a-f0-9]{32}$/.test(code)) sessionStorage.setItem('stockroom-referral-code', code)
  }, [])
  const [terminalRevision, setTerminalRevision] = useState(0)
  const deviceTerminal = useMemo(() => readTerminalSettings(user?.organizationId || ''), [user?.organizationId, terminalRevision])
  const manualTerminalAllowed = canRecordTerminalPayment(deviceTerminal)
  useEffect(() => { setTerminalProvider(current => extraPaymentPolicy.providers.includes(current) ? current : extraPaymentPolicy.providers[0] || '') }, [extraPaymentPolicy.providers])
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('stockroom-token') || '')
  const [branches, setBranches] = useState<Branch[]>([])
  const [activeBranchId, setActiveBranchId] = useState(() => localStorage.getItem(`stockroom-active-branch:${(JSON.parse(localStorage.getItem('stockroom-user') || 'null') as User | null)?.organizationId || 'local'}`) || 'main')
  useEffect(()=>{setWeighedReview(null)},[activeBranchId,user?.organizationId])
  const [newBranchName, setNewBranchName] = useState('')
  const [newBranchAddress, setNewBranchAddress] = useState('')
  const [transferProductId, setTransferProductId] = useState('')
  const [transferDestinationId, setTransferDestinationId] = useState('')
  const [transferQuantity, setTransferQuantity] = useState('1')
  const [transferReason, setTransferReason] = useState('')
  useEffect(() => {
    let cancelled = false
    setPosAccess(subscriptionAccess(null))
    if (!authToken || !user) return
    const refresh = () => { void readPosAccess(authToken, user.organizationId).then(value => { if (!cancelled) setPosAccess(value) }) }
    refresh()
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('online', refresh)
    window.addEventListener('focus', refresh)
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh) }
  }, [authToken, user?.organizationId])
  useEffect(() => { setCashReceived('') }, [authToken])
  const [cloudAccessToken, setCloudAccessToken] = useState(() => localStorage.getItem('stockroom-cloud-access-token') || '')
  const [cloudSessionError, setCloudSessionError] = useState('')
  const [authError, setAuthError] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [walletCustomerId, setWalletCustomerId] = useState('')
  const [walletCreditApproved, setWalletCreditApproved] = useState(false)
  useEffect(() => { setWalletCreditApproved(false) }, [cart, walletCustomerId, authToken])
  const [staff, setStaff] = useState<StaffUser[]>([])
  const [staffLoaded, setStaffLoaded] = useState(false)
  useEffect(() => {
    if (active !== 'Team' || user?.role !== 'owner') return
    const email = document.querySelector<HTMLInputElement>('.team-form input[name="email"]')
    if (!email) return
    email.required = false
    email.placeholder = 'Optional contact email'
  }, [active, user?.role, staff.length])
  const [reports, setReports] = useState<Reports | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [saleVoids, setSaleVoids] = useState<SaleItemVoid[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [receiptHistory, setReceiptHistory] = useState<Sale[]>([])
  const [receiptError, setReceiptError] = useState('')
  const receiptPrinting = useRef(false)
  useEffect(() => { let cancelled = false; setReceiptHistory([]); if (user?.organizationId) getReceiptHistory(user.organizationId).then(rows => { if (!cancelled) setReceiptHistory(rows) }).catch(() => { if (!cancelled) setReceiptError('Local receipt history could not be loaded.') }); return () => { cancelled = true } }, [user?.organizationId])
  const [displayError, setDisplayError] = useState('')
  const [displayRetry, setDisplayRetry] = useState(0)
  const [lastReceipt, setLastReceipt] = useState<Sale | null>(null)
  const [completedCustomerSale, setCompletedCustomerSale] = useState<{ items: Array<{ name: string; quantity: number; price: number }>; total: number } | null>(null)
  const [stocktake, setStocktake] = useState<Stocktake | null>(null)
  const [stocktakeReason, setStocktakeReason] = useState('Approved after physical count')
  useEffect(() => {
    if (!isBrowserPwa() || !authToken || active !== 'Stocktake') return
    let cancelled = false
    fetch('/api/stocktakes', { headers: authHeaders }).then(async response => {
      if (!response.ok) throw new Error((await response.json()).error)
      const data = await response.json()
      if (!cancelled) {
        setStocktake(data.stocktake)
        setStocktakeReason(data.stocktake?.approvalReason || 'Approved after physical count')
      }
    }).catch(error => { if (!cancelled) window.alert(error.message || 'Could not restore stocktake.') })
    return () => { cancelled = true }
  }, [authToken, active, activeBranchId])
  const [registrationAvailable, setRegistrationAvailable] = useState(false)
  const [registrationRequested, setRegistrationRequested] = useState(() => new URLSearchParams(location.search).get('screen') === 'register')
  const [registrationStage, setRegistrationStage] = useState<'request' | 'complete'>('request')
  const [generatedRegistrationKey, setGeneratedRegistrationKey] = useState('')
  const [registrationOwnerEmail, setRegistrationOwnerEmail] = useState('')
  const [freshVisitor, setFreshVisitor] = useState(false)
  const [setupRequired, setSetupRequired] = useState(true)
  const [installerRequired, setInstallerRequired] = useState(true)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [startupError, setStartupError] = useState('')
  const [installerMessage, setInstallerMessage] = useState('')
  const [mobilePullDistance, setMobilePullDistance] = useState(0)
  const [refreshingView, setRefreshingView] = useState(false)
  useEffect(() => {
    // All platforms restore identity from their local session store first:
    // Desktop SQLite, PWA IndexedDB, or Android SQLite. Cloud is not involved.
    if (!settingsLoaded || (!authToken && !isBrowserPwa() && !isNativeMobile())) return
    let cancelled = false
    const restore = async () => {
      const response = await fetch('/api/auth/session', { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} }).catch(() => null)
      if (cancelled || !response) return
      if (!response.ok) {
        setUser(null)
        setAuthToken('')
        localStorage.removeItem('stockroom-token')
        localStorage.removeItem('stockroom-user')
        return
      }
      const saved = await response.json() as { user: User; token?: string }
      if (cancelled) return
      const token = saved.token || authToken
      setUser(saved.user)
      if (token) {
        setAuthToken(token)
        localStorage.setItem('stockroom-token', token)
      }
      localStorage.setItem('stockroom-user', JSON.stringify(saved.user))
    }
    void restore()
    return () => { cancelled = true }
  }, [settingsLoaded, authToken])
  const authHeaders: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}`, 'X-Stockroom-Branch': activeBranchId, 'X-Stockroom-Till': checkoutTillId() } : {}
  const pos = usePosBasket({ user, branchId: activeBranchId, headers: authHeaders, cart, setCart, orderId: currentOrderId, setOrderId: setCurrentOrderId, products, workspaceId: active === 'Oil' ? 'oil' : 'products' })
  useEffect(() => { if (user?.role === 'cashier') setCustomers(pos.data.customers) }, [pos.data.customers, user?.role])
  const terminalLocked = usePaystack && terminalPayment?.orderId === currentOrderId && terminalPayment.status !== 'not-started'
  useEffect(() => {
    setCashReceived(''); setPaymentReference(''); setTransferAmountReceived(''); setTransferOverpayment(''); setExtraKept('0'); setExtraReason(''); setExtraNote(''); setSplitCash(''); setSplitTerminal(''); setSplitTransfer(''); setSplitTerminalReference(''); setTransferReference(''); setWalletCreditApproved(false)
  }, [currentOrderId, activeBranchId, user?.id])
  useEffect(() => {
    setTerminalPayment(null)
    if (!user) return
    const pending = localStorage.getItem(`stockroom-paystack-pending:${currentOrderId}`)
    if (pending) {
      try { setTerminalPayment({ ...JSON.parse(pending), paid: false, status: 'uncertain', reference: '' }); setUsePaystack(true); setPaymentMethod('external-pos') } catch { /* Cloud verification can restore the saved request. */ }
    }
    if (!pending || !online) return
    let current = true
    void posRequest('/api/integrations/paystack/verify', authHeaders, { orderId: currentOrderId }).then(result => {
      if (!current) return
      if (result.status !== 'not-started') { setTerminalPayment(result); setUsePaystack(true); setPaymentMethod('external-pos') }
      else { localStorage.removeItem(`stockroom-paystack-pending:${currentOrderId}`); setTerminalPayment(result) }
    }).catch(() => undefined)
    return () => { current = false }
  }, [currentOrderId, activeBranchId, user?.id, online])

  async function reloadPosStock() {
    const response = await fetch('/api/products', { headers: authHeaders })
    if (!response.ok) throw new Error('Could not refresh stock.')
    setProducts((await response.json()).products); await refreshWallets()
  }
  async function holdBasket() {
    if (terminalLocked) { window.alert('A Paystack payment is in progress for this basket. Resolve it before changing the order.'); return }
    const label = await requestInlinePrompt({ title: 'Hold this sale', message: 'Give the basket a name so you can retrieve it later.', label: 'Basket name' })
    if (label !== null) await pos.hold(label)
  }
  async function changeLinePrice(product: Product) {
    if (terminalLocked) { window.alert('A Paystack payment is in progress for this basket. Resolve it before changing the order.'); return }
    const value = await requestInlinePrompt({ title: 'Sale price', message: 'Set the unit price for this basket only.', initialValue: String(product.price) })
    if (value === null) return
    const amount = Number(value)
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Enter a valid price.')
    pos.setOverrides(current => ({ ...current, [product.id]: amount }))
  }

  useEffect(() => {
    if (!authToken || !user) { setBranches([]); return }
    let cancelled = false
    setBranchError('')
    fetch('/api/branches', { headers: authHeaders }).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not load your branches.')
      return data as { branches: Branch[] }
    }).then(data => {
      if (cancelled) return
      const all = (data.branches || []).map(branch=>({...branch,isActive:branch.isActive===undefined?true:Boolean(branch.isActive)}))
      const available = all.filter(branch=>branch.isActive)
      setBranches(all)
      if (!available.length) { setBranchError('No active branch is available for this account. Ask the owner to check your branch access.'); return }
      if (!available.some(branch => branch.id === activeBranchId)) setActiveBranchId(available[0].id)
    }).catch(error => { if (!cancelled) setBranchError(error instanceof Error ? error.message : 'Could not load your branches. Try again.') })
    return () => { cancelled = true }
  }, [authToken, user?.organizationId, branchRetry])
  useEffect(() => { if (user?.organizationId) localStorage.setItem(`stockroom-active-branch:${user.organizationId}`, activeBranchId) }, [activeBranchId, user?.organizationId])
  const activeBranch = branches.find(branch => branch.id === activeBranchId) || branches[0]
  async function addBranch(event: { preventDefault: () => void }) {
    event.preventDefault()
    const response = await fetch('/api/branches', { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newBranchName, address: newBranchAddress }) })
    const result = await response.json() as Branch & { error?: string }
    if (!response.ok) { setSettingsMessage(result.error || 'Could not add branch.'); return }
    setBranches(current => [...current, result]); setActiveBranchId(result.id); setNewBranchName(''); setNewBranchAddress(''); setSettingsMessage(`${result.name} is ready. Its stock starts at zero; your existing Main branch stock is unchanged.`)
  }
  async function saveBranch(branch: Branch, isActive = branch.isActive !== false) {
    const name = window.prompt('Branch name', branch.name)
    if (name === null) return
    const address = window.prompt('Branch address', branch.address) ?? branch.address
    const response = await fetch(`/api/branches/${encodeURIComponent(branch.id)}`, { method: 'PUT', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, address, isActive }) })
    const result = await response.json() as Branch & { error?: string }
    if (!response.ok) { setSettingsMessage(result.error || 'Could not update branch.'); return }
    setBranches(current => current.map(item => item.id === result.id ? result : item))
    if (!result.isActive && activeBranchId === result.id) setActiveBranchId('main')
    setSettingsMessage(`${result.name} updated.`)
  }
  async function saveBranchStaff(branch: Branch, staffIds: string[]) {
    const response = await fetch(`/api/branches/${encodeURIComponent(branch.id)}`, { method: 'PUT', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: branch.name, address: branch.address, isActive: branch.isActive !== false, assignedUserIds: staffIds }) })
    const result = await response.json() as Branch & { error?: string }
    if (!response.ok) { setSettingsMessage(result.error || 'Could not update branch access.'); return }
    setBranches(current => current.map(item => item.id === result.id ? result : item))
    setSettingsMessage(`${result.name} staff access updated.`)
  }
  async function configureBranchStaff(branch: Branch) {
    const assigned = (branch.assignedUserIds || []).map(id => staff.find(member => member.id === id)?.username || staff.find(member => member.id === id)?.email || '').filter(Boolean)
    const answer = window.prompt(`Staff usernames or emails allowed at ${branch.name}, separated by commas. Leave blank to allow every staff account.`, assigned.join(', '))
    if (answer === null) return
    if (!answer.trim()) return saveBranchStaff(branch, [])
    const selections = answer.split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
    const matches = staff.filter(member => selections.includes((member.username || '').toLowerCase()) || selections.includes(member.email.toLowerCase()))
    if (matches.length !== new Set(selections).size) { setSettingsMessage('One or more entries do not match a team username or email.'); return }
    await saveBranchStaff(branch, matches.map(member => member.id))
  }
  async function submitBranchTransfer(event: { preventDefault: () => void }) {
    event.preventDefault()
    const response = await fetch('/api/branch-transfers', { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ fromBranchId: activeBranchId, toBranchId: transferDestinationId, productId: transferProductId, quantity: Number(transferQuantity), reason: transferReason }) })
    const result = await response.json() as { error?: string }
    if (!response.ok) { setSettingsMessage(result.error || 'Could not transfer stock.'); return }
    setSettingsMessage('Stock transferred and recorded in both branch movement histories.')
    setTransferReason('')
    const refreshed = await fetch('/api/products', { headers: authHeaders }).then(result => result.json()) as { products: Product[] }
    setProducts(refreshed.products)
  }
  const subscriptionApiUrl = !isBrowserPwa() && !isNativeMobile() ? '/api/cloud' : __STOCKROOM_SYNC_API_URL__.replace(/\/$/, '')
  const linkedBusinessId = businessIdFromAccessToken(cloudAccessToken) || user?.organizationId || ''
  useEffect(() => {
    if (!user) return
    const url = new URL(window.location.href)
    const linkedScreen = url.searchParams.get('screen')
    const targetScreen = ({ 'retail-orders':'RetailOrders', customers:'Wallet', counter:'Counter', restaurant:'Restaurant' } as const)[linkedScreen as 'retail-orders'|'customers'|'counter'|'restaurant']
    let handled = false
    if (targetScreen && screenAllowedForUser(targetScreen, user)) { setActive(targetScreen); handled = true }
    else if (linkedScreen === 'subscription' && user.role === 'owner') { setActive('Subscription'); handled = true }
    else if (linkedScreen === 'account-deletion' && user.role === 'owner') { setActive('Account'); handled = true }
    if (handled || url.searchParams.has('screen') || url.searchParams.has('search')) {
      // A screen query is an entry deep link. Consume it after the first
      // route is chosen so it cannot override the user's later active screen
      // on a hard reload; normal screen navigation is persisted separately.
      url.searchParams.delete('screen')
      url.searchParams.delete('search')
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }, [user?.id, user?.role])

  useEffect(() => {
    // Restore cloud identity once per locally restored session. This is not a
    // login and must not change routes: local SQLite/IndexedDB remains the
    // offline source of truth. The bootstrap merely renews a cloud token and
    // updates owner-only cloud caches (notably the Team directory).
    // PWA and Android already restore this from their own IndexedDB/SQLite
    // adapters. Desktop is the only platform that needs the local-server
    // bridge below; keeping that boundary avoids changing working APK/PWA
    // startup behavior.
    if (isBrowserPwa() || isNativeMobile() || !authToken || !user || (!cloudAccessToken && !localStorage.getItem('stockroom-cloud-refresh-token'))) return
    let cancelled = false
    const bootstrap = async () => {
      try {
        await cloudRequest('/api/cloud', '/v1/auth/me', {}, (access, refresh) => {
          setCloudAccessToken(access)
          localStorage.setItem('stockroom-cloud-refresh-token', refresh)
        }, cloudAccessToken)
      } catch { return }
      if (cancelled) return
      const response = await fetch('/api/auth/cloud-bootstrap', {
        method: 'POST', signal: AbortSignal.timeout(10_000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ accessToken: localStorage.getItem('stockroom-cloud-access-token') || cloudAccessToken }),
      }).catch(() => null)
      if (cancelled || !response) return
      const restored = await response.json().catch(() => null) as { accessToken?: string; refreshToken?: string; users?: StaffUser[]; error?: string } | null
      if (!response.ok) {
        if (!cancelled) setCloudSessionError(restored?.error || 'Cloud identity could not be restored.')
        return
      }
      if (cancelled || !restored?.accessToken) return
      setCloudSessionError('')
      setCloudAccessToken(restored.accessToken)
      localStorage.setItem('stockroom-cloud-access-token', restored.accessToken)
      if (restored.refreshToken) localStorage.setItem('stockroom-cloud-refresh-token', restored.refreshToken)
      if (restored.users && user.role === 'owner') setStaff(restored.users)
    }
    void bootstrap()
    return () => { cancelled = true }
  }, [authToken, cloudAccessToken, user?.id, user?.role])

  // Notices acknowledge an action; they are not permanent page content. Keep
  // unresolved sync work visible, but clear routine success/failure banners so
  // they do not cover the mobile interface indefinitely.
  useEffect(() => {
    if (!syncFeedback || syncFeedback.startsWith('Sync needs review:') || syncFeedback.startsWith('Sync incomplete:')) return
    const timeout = window.setTimeout(() => setSyncFeedback(''), syncFeedback.startsWith('Sync failed:') || syncFeedback.startsWith('Refresh failed:') ? 10_000 : 6_000)
    return () => window.clearTimeout(timeout)
  }, [syncFeedback])
  useEffect(() => {
    if (!settingsMessage) return
    const timeout = window.setTimeout(() => setSettingsMessage(''), 6_000)
    return () => window.clearTimeout(timeout)
  }, [settingsMessage])
  useEffect(() => {
    if (!passwordMessage) return
    const timeout = window.setTimeout(() => setPasswordMessage(''), 6_000)
    return () => window.clearTimeout(timeout)
  }, [passwordMessage])
  useEffect(() => {
    if (!receiptError) return
    const timeout = window.setTimeout(() => setReceiptError(''), 10_000)
    return () => window.clearTimeout(timeout)
  }, [receiptError])

  useEffect(() => { document.title = appName }, [appName])
  useEffect(() => { void applyLogoTheme(logoData, shopProfile.brandColor) }, [logoData, shopProfile.brandColor, active])
  useEffect(() => { if (user?.organizationId) localStorage.setItem(`stockroom-products:${user.organizationId}:${activeBranchId}`, JSON.stringify(products)) }, [products, user?.organizationId, activeBranchId])
  useEffect(() => {
    if (!authToken) return
    const cachedBranch = localStorage.getItem(`stockroom-products:${user?.organizationId || 'local'}:${activeBranchId}`)
    if (cachedBranch) { try { setProducts(JSON.parse(cachedBranch) as Product[]) } catch { setProducts([]) } }
    else setProducts([])
    if (!isBrowserPwa() && activeBranchId === 'main') getCachedProducts().then((cached) => { if (cached.length && activeBranchId === 'main') setProducts(cached) }).catch(() => undefined)
    fetch('/api/products', { headers: authHeaders }).then((response) => response.ok ? response.json() as Promise<{ products: Product[] }> : Promise.reject()).then((data) => {
      setProducts(data.products)
      cacheProducts(data.products).catch(() => undefined)
    }).catch(() => undefined)
  }, [authToken, activeBranchId])
  useEffect(() => { if (canManageOperations) fetch('/api/customers', { headers: authHeaders }).then((response) => response.ok ? response.json() as Promise<{ customers: Customer[] }> : Promise.reject()).then((data) => setCustomers(data.customers)).catch(() => undefined) }, [authToken, user?.operationalAccess, user?.role])
  useEffect(() => { let cancelled = false; if (canManageOperations) fetch('/api/sales', { headers: authHeaders }).then((response) => response.ok ? response.json() as Promise<{ sales: SaleRecord[] }> : Promise.reject()).then((data) => { if (!cancelled) setSales(data.sales) }).catch(() => undefined); return () => { cancelled = true } }, [authToken, activeBranchId, user?.organizationId, user?.operationalAccess, user?.role])
  useEffect(() => { let cancelled = false; if (canManageOperations) fetch('/api/sales/voids', { headers: authHeaders }).then(response => response.ok ? response.json() as Promise<{ voids: SaleItemVoid[] }> : Promise.reject()).then(data => { if (!cancelled) setSaleVoids(data.voids) }).catch(() => undefined); return () => { cancelled = true } }, [authToken, activeBranchId, user?.organizationId, user?.operationalAccess, user?.role])
  useEffect(() => {
    if (!canManageOperations || active !== 'Sales') return
    let cancelled = false
    const refreshActivity = async () => {
      const [salesResponse, voidsResponse] = await Promise.all([fetch('/api/sales', { headers: authHeaders }), fetch('/api/sales/voids', { headers: authHeaders })])
      if (!salesResponse.ok || !voidsResponse.ok) return
      const [salesData, voidsData] = await Promise.all([salesResponse.json() as Promise<{ sales: SaleRecord[] }>, voidsResponse.json() as Promise<{ voids: SaleItemVoid[] }>])
      if (!cancelled) { setSales(salesData.sales); setSaleVoids(voidsData.voids) }
    }
    void refreshActivity().catch(() => undefined)
    const timer = window.setInterval(() => { void refreshActivity().catch(() => undefined) }, 15_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [active, authToken, activeBranchId, user?.organizationId, user?.operationalAccess, user?.role])
  useEffect(() => { if (canManageOperations) fetch('/api/movements', { headers: authHeaders }).then((response) => response.ok ? response.json() as Promise<{ movements: Movement[] }> : Promise.reject()).then((data) => setMovements(data.movements)).catch(() => undefined) }, [authToken, activeBranchId, user?.operationalAccess, user?.role])
  useEffect(() => {
    if (!authToken || user?.role !== 'owner' || (isBrowserPwa() && active !== 'Team')) return
    let cancelled = false
    setStaffLoaded(false)
    fetch('/api/users', { headers: authHeaders }).then(async (response) => {
      const data = await response.json() as { users: StaffUser[]; refreshed?: boolean; refreshError?: string; error?: string }
      if (!response.ok) throw new Error(data.error || 'Could not load the staff directory.')
      if (!cancelled) {
        setStaff(data.users)
        setCloudSessionError(data.refreshed === false ? `Showing saved staff. ${data.refreshError || 'The cloud directory could not be refreshed.'}` : '')
      }
    }).catch(error => { if (!cancelled) setCloudSessionError(error instanceof Error ? error.message : 'Could not load the staff directory.') }).finally(() => { if (!cancelled) setStaffLoaded(true) })
    return () => { cancelled = true }
  }, [authToken, cloudAccessToken, user?.role, user?.organizationId, active === 'Team' || active === 'Settings'])
  useEffect(() => {
    if (!authToken || !['owner', 'admin'].includes(user?.role || '')) return
    fetch('/api/sync/conflicts', { headers: { Authorization: `Bearer ${authToken}` } }).then((response) => response.ok ? response.json() as Promise<{ conflicts: SyncConflict[] }> : Promise.reject()).then((data) => setSyncConflicts(data.conflicts)).catch(() => undefined)
  }, [authToken, user?.role, syncStatus.conflicts])
  useEffect(() => {
    if (!authToken || !hasPermission(user,'reports')) return
    fetch('/api/expenses', { headers: authHeaders }).then((response) => response.ok ? response.json() as Promise<{ expenses: Expense[] }> : Promise.reject()).then((data) => setExpenses(data.expenses)).catch(() => undefined)
  }, [authToken, activeBranchId, user?.role])
  useEffect(() => {
    if (!authToken || !hasPermission(user,'reports')) return
    fetch('/api/reports', { headers: authHeaders }).then((response) => response.ok ? response.json() as Promise<Reports> : Promise.reject()).then(setReports).catch(() => undefined)
  }, [authToken, activeBranchId, user?.role])
  useEffect(() => {
    const refresh = async () => {
      if (!authToken) return
      try {
        const response = await fetch('/api/sales', { headers: authHeaders })
        if (response.ok) setSales((await response.json()).sales)
        if (hasPermission(user,'reports')) {
          const reportResponse = await fetch('/api/reports', { headers: authHeaders })
          if (reportResponse.ok) setReports(await reportResponse.json())
        }
      } catch { /* Saved local records remain available for Refresh to retry. */ }
    }
    window.addEventListener('stockroom-data-refreshed', refresh)
    return () => window.removeEventListener('stockroom-data-refreshed', refresh)
  }, [authToken, activeBranchId, user?.role])
  async function refreshBusinessSettings(signal?: AbortSignal) {
    const response = await fetch('/api/settings', { signal }).catch(() => null)
    if (!response?.ok) return
    const settings = await response.json() as AppSettings
    signal?.throwIfAborted()
    if (settingsDraftDirty.current) return
    const cachedName = localStorage.getItem('stockroom-app-name') || ''
    const cachedCurrency = localStorage.getItem('stockroom-currency') || ''
    const isPlaceholder = settings.appName === 'My Business' && settings.currency === 'USD'
    const keepCachedIdentity = isPlaceholder && cachedName && cachedName !== 'My Business'
    const displayedName = keepCachedIdentity ? cachedName : settings.appName || 'My Business'
    const displayedCurrency = keepCachedIdentity ? cachedCurrency || 'USD' : settings.currency || 'USD'
    setAppName(displayedName)
    setCurrency(displayedCurrency)
    setPosProvider(settings.posProvider || '')
    setPosTerminalId(settings.posTerminalId || '')
    setPosConnection(settings.posConnection || 'manual')
    setLogoData(settings.logoData || '')
    setExtraPaymentPolicy(paymentPolicy(settings.paymentPolicy))
    setShopProfile(normalizeShopProfile(settings.shopProfile && settings.shopProfile !== 'null' ? settings.shopProfile : { mode: localStorage.getItem('stockroom-business-mode') && localStorage.getItem('stockroom-business-mode') !== 'general' ? 'suggested' : 'general', industry: localStorage.getItem('stockroom-business-mode') }))
    localStorage.setItem('stockroom-app-name', displayedName)
    localStorage.setItem('stockroom-currency', displayedCurrency)
  }
  async function saveShopProfile(profile: ShopProfile) {
    const response = await fetch('/api/settings/shop-profile', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify(profile) })
    const saved = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(saved.error || 'Shop setup could not be saved. Please try again.')
    setShopProfile(normalizeShopProfile(saved))
  }
  async function saveWorkspacePreferences(nextCurrency:string,policy:PaymentPolicy) {
    const currentResponse=await fetch('/api/settings',{headers:authHeaders})
    if(!currentResponse.ok)throw new Error('Could not load business settings. Try again.')
    const current=await currentResponse.json()
    const response=await fetch('/api/settings',{method:'PUT',headers:{...authHeaders,'Content-Type':'application/json'},body:JSON.stringify({...current,currency:nextCurrency,paymentPolicy:policy,posProvider:policy.providers[0]||''})})
    const saved=await response.json()
    if(!response.ok)throw new Error(saved.error||'Could not save business settings.')
    setCurrency(saved.currency);setExtraPaymentPolicy(paymentPolicy(saved.paymentPolicy));setPosProvider(saved.posProvider||'')
    localStorage.setItem('stockroom-currency',saved.currency)
  }
  async function saveOnboardingStarters(screen:SetupWorkspace,industry:BusinessMode,items:CatalogueStarter[]) {
    if (!items.length) return
    if (screen==='POS'||screen==='Oil') {
      const response=await fetch('/api/products',{headers:authHeaders})
      const result=await response.json() as {products?:Product[];error?:string}
      if(!response.ok)throw new Error(result.error||'Could not load the product catalogue.')
      const names=new Set((result.products||[]).map(product=>product.name.trim().toLocaleLowerCase()))
      for(const item of items) {
        if(names.has(item.name.trim().toLocaleLowerCase()))continue
        await posRequest('/api/products',authHeaders,{name:item.name,barcode:'',category:item.category,unit:item.unit,stock:0,reorder:0,price:0,cost:0})
        names.add(item.name.trim().toLocaleLowerCase())
      }
      const loaded=await fetch('/api/products',{headers:authHeaders})
      if(loaded.ok){const data=await loaded.json() as {products:Product[]};setProducts(data.products);await upsertCachedProducts(data.products)}
      return
    }
    if(screen==='Payments') {
      const current=await posRequest('/api/pos/receipt-settings',authHeaders) as {serviceItems?:Array<{id:string;name:string;price:number}>;[key:string]:unknown}
      const serviceItems=[...(current.serviceItems||[])]
      const names=new Set(serviceItems.map(item=>item.name.trim().toLocaleLowerCase()))
      for(const item of items)if(!names.has(item.name.trim().toLocaleLowerCase())){serviceItems.push({id:crypto.randomUUID(),name:item.name.slice(0,150),price:0});names.add(item.name.trim().toLocaleLowerCase())}
      if(serviceItems.length>200)throw new Error('Select up to 200 saved services. Remove some selections and try again.')
      await posRequest('/api/pos/receipt-settings',authHeaders,{...current,serviceItems})
      return
    }
    const api=screen==='Counter'?'/api/pos/counter':'/api/pos/restaurant/counter'
    const current=await posRequest(api,authHeaders) as {menu:{id:string;updatedAt:string;items:Array<Record<string,any>>}}
    const menu=current.menu
    const names=new Set(menu.items.map(item=>String(item.name||'').trim().toLocaleLowerCase()))
    const additions=items.filter(item=>!names.has(item.name.trim().toLocaleLowerCase())).map(item=>({id:crypto.randomUUID(),name:item.name.slice(0,100),price:0,type:'prepared',productId:'',available:false,options:[],...(screen==='Restaurant'?{station:industry==='drinks'?'bar' as const:'kitchen' as const}:{})}))
    if(menu.items.length+additions.length>200)throw new Error('Select fewer items. This workspace can save up to 200 menu items.')
    if(additions.length)await posRequest(`${api}/menu`,authHeaders,{id:menu.id,commandId:crypto.randomUUID(),expectedUpdatedAt:menu.updatedAt||'',items:[...menu.items,...additions]})
  }
  async function refreshSyncStatus() {
    const response = await fetch('/api/sync/status').catch(() => null)
    if (response?.ok) setSyncStatus(await response.json() as SyncStatus)
  }
  async function syncNow() {
    setSyncing(true)
    setSyncFeedback('Uploading and downloading changes...')
    try {
      await syncQueuedOperations()
      const response = await fetch('/api/sync/now', { method: 'POST', headers: authHeaders })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || `Sync request failed (${response.status}).`)
      const status = result as SyncStatus
      setSyncStatus(status)
      if (!status.configured) throw new Error('Cloud sync is not configured for this device.')
      if (status.lastError) throw new Error(status.lastError)
      const pending = status.pending + (isBrowserPwa() ? 0 : (await getQueuedOperations()).length)
      setSyncFeedback(status.conflicts ? `Sync needs review: ${status.conflicts} conflicting change(s), ${pending} still queued.` : pending ? `Sync incomplete: ${pending} change(s) still queued. Press Sync now to retry.` : `Sync complete at ${new Date().toLocaleTimeString()}. All changes uploaded; 0 queued.`)
      await refreshBusinessSettings()
      if (!isBrowserPwa() && (await getQueuedOperations()).length) return
      const productsResponse = await fetch('/api/products', { headers: authHeaders })
      if (productsResponse.ok) setProducts((await productsResponse.json()).products)
    } catch (error) {
      setSyncFeedback(syncErrorMessage(error instanceof Error ? error.message : 'Could not reach cloud sync. Changes remain saved on this device.'))
    } finally { setSyncing(false) }
  }
  async function pullLatest() {
    refreshLocalView()
  }
  useEffect(() => {
    // A PWA's local database is intentionally serialized. Its explicit Refresh
    // and Sync actions may use the network, but a background pull must not hold
    // that database lock and delay an offline action such as Start Count.
    if (isBrowserPwa() || !authToken || !online || !['owner', 'admin'].includes(user?.role || '')) return
    let cancelled = false
    let busy = false
    const download = async () => {
      if (busy) return
      busy = true
      try {
        const response = await fetch('/api/sync/pull', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } })
        if (!response.ok || cancelled) return
        const status = await response.json() as SyncStatus
        if (cancelled) return
        setSyncStatus(status)
        // Desktop/Android may still have local edits waiting for their API.
        // Do not replace those edits with an older database snapshot.
        if (!isBrowserPwa() && (await getQueuedOperations()).length) return
        const productsResponse = await fetch('/api/products', { headers: authHeaders })
        if (productsResponse.ok) {
          const result = await productsResponse.json() as { products: Product[] }
          if (!cancelled) setProducts(result.products)
        }
      } catch { /* Keep the local catalogue available while offline. */ }
      finally { busy = false }
    }
    void download()
    const interval = window.setInterval(() => { void download() }, 30_000)
    return () => { cancelled = true; window.clearInterval(interval) }
  }, [authToken, online, user?.role])
  useEffect(() => {
    if (isNativeMobile()) return
    const handleDesktopReload = (event: KeyboardEvent) => {
      const reloadShortcut = event.key === 'F5' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r')
      if (!reloadShortcut) return
      event.preventDefault()
      if (syncing || refreshingView) return
      void pullLatest()
    }
    window.addEventListener('keydown', handleDesktopReload)
    return () => window.removeEventListener('keydown', handleDesktopReload)
  }, [online, syncStatus.configured, syncing, refreshingView, authToken, active, user?.role])
  async function refreshLocalView() {
    if (refreshingView || syncing) return
    const deadline = refreshDeadline()
    setRefreshingView(true)
    setSyncFeedback('Downloading changes from the cloud...')
    try {
        if (active === 'Team' && user?.role === 'owner') {
          const response = await deadline.wait(fetch('/api/users', { headers: authHeaders, signal: deadline.signal }))
          const data = await deadline.wait(response.json()) as { users: StaffUser[]; refreshed?: boolean; refreshError?: string; error?: string }
          if (!response.ok) throw new Error(data.error || 'Could not load the staff directory.')
          setStaff(data.users)
          setStaffLoaded(true)
          setCloudSessionError(data.refreshed === false ? `Showing saved staff. ${data.refreshError || 'The cloud directory could not be refreshed.'}` : '')
          setSyncFeedback(data.refreshed === false ? 'Showing the saved staff directory.' : `Team refreshed. ${data.users.length} member(s) loaded.`)
          return
        }
        const response = await deadline.wait(fetch('/api/sync/pull', { method: 'POST', headers: authHeaders, signal: deadline.signal }))
        const result = await deadline.wait(response.json())
        if (!response.ok) throw new Error(result.error || `Refresh failed (${response.status}).`)
        setSyncStatus(result as SyncStatus)
        if (result.lastError) throw new Error(result.lastError)
        if (!result.configured) throw new Error('Cloud sync is not configured for this device.')
        const productsResponse = await deadline.wait(fetch('/api/products', { headers: authHeaders, signal: deadline.signal }))
        if (!productsResponse.ok) throw new Error('Changes downloaded, but the product list could not be loaded. Refresh again.')
        const catalogue = await deadline.wait(productsResponse.json()) as { products: Product[] }
        const pending = isBrowserPwa() ? [] : await deadline.wait(getQueuedOperations())
        const downloaded = new Map(catalogue.products.map(product => [product.id, { ...product }]))
        for (const operation of pending) {
          if (operation.type === 'product') {
            const id = String(operation.payload.localId || '')
            const local = products.find(product => product.id === id)
            if (local) downloaded.set(id, { ...local, stock: Number(operation.payload.stock || 0) })
          } else if (operation.type === 'stock') {
            const product = downloaded.get(String(operation.payload.productId))
            if (product) product.stock += Number(operation.payload.amount || 0)
          } else if (operation.type === 'sale') {
            const items = operation.payload.items as Array<{ productId: string; quantity: number }> || []
            for (const item of items) {
              const product = downloaded.get(item.productId)
              if (product) product.stock -= Number(item.quantity || 0)
            }
          }
        }
        setProducts([...downloaded.values()])
        await deadline.wait(pos.reload())
        const salesResponse = await deadline.wait(fetch('/api/sales', { headers: authHeaders, signal: deadline.signal }))
        if (!salesResponse.ok) throw new Error('Sales could not be refreshed.')
        setSales((await deadline.wait(salesResponse.json())).sales)
        const customersResponse = await deadline.wait(fetch('/api/customers', { headers: authHeaders, signal: deadline.signal }))
        if (!customersResponse.ok) throw new Error('Customers could not be refreshed.')
        setCustomers((await deadline.wait(customersResponse.json())).customers)
        if (['owner', 'admin'].includes(user?.role || '')) {
          const results = await deadline.wait(Promise.all([
            fetch('/api/reports', { headers: authHeaders, signal: deadline.signal }),
            fetch('/api/expenses', { headers: authHeaders, signal: deadline.signal }),
            fetch('/api/sales/voids', { headers: authHeaders, signal: deadline.signal })
          ]))
          if (results.some(response => !response.ok)) throw new Error('Downloaded changes, but financial records could not all be refreshed. Refresh again.')
          const [nextReports, nextExpenses, nextVoids] = await deadline.wait(Promise.all(results.map(response => response.json())))
          setReports(nextReports); setExpenses(nextExpenses.expenses); setSaleVoids(nextVoids.voids)
        }

        if (!pending.some(operation => operation.type === 'settings')) await deadline.wait(refreshBusinessSettings(deadline.signal))
        window.dispatchEvent(new Event('stockroom-data-refreshed'))
        setSyncFeedback(`Refresh complete. ${catalogue.products.length} product(s) loaded. No local changes uploaded.`)
        if (isBrowserPwa() && 'serviceWorker' in navigator) {
          const registration = await deadline.wait(navigator.serviceWorker.getRegistration())
          if (registration) await deadline.wait(registration.update().catch(() => undefined))
          if (registration?.waiting) {
            navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
            registration.waiting.postMessage('ACTIVATE_UPDATE')
          }
        }
    } catch (error) {
      setSyncFeedback(`Refresh failed: ${error instanceof Error ? error.message : 'Could not download changes.'}`)
    } finally { deadline.dispose(); setRefreshingView(false) }
  }
  useEffect(() => {
    if (!isNativeMobile() && !isBrowserPwa()) return
    let startY = 0
    let startX = 0
    let distance = 0
    let tracking = false
    const cancel = () => {
      tracking = false
      distance = 0
      setMobilePullDistance(0)
    }
    const start = (event: TouchEvent) => {
      cancel()
      if (!authToken || window.scrollY > 0 || syncing || refreshingView || event.touches.length !== 1) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('input, textarea, select, [contenteditable], .modal-backdrop')) return
      for (let element = target; element; element = element.parentElement) {
        if (element.scrollTop > 0) return
      }
      startY = event.touches[0]?.clientY || 0
      startX = event.touches[0]?.clientX || 0
      tracking = true
    }
    const move = (event: TouchEvent) => {
      if (!tracking) return
      if (event.touches.length !== 1) return cancel()
      const deltaY = event.touches[0].clientY - startY
      const deltaX = event.touches[0].clientX - startX
      if (deltaY < 0 || Math.abs(deltaX) > Math.abs(deltaY)) return cancel()
      distance = Math.max(0, Math.min(96, deltaY))
      if (distance > 0 && event.cancelable) event.preventDefault()
      setMobilePullDistance(distance)
    }
    const end = () => {
      const shouldRefresh = tracking && distance >= 64
      cancel()
      if (shouldRefresh) refreshLocalView()
    }
    document.addEventListener('touchstart', start, { passive: true })
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend', end, { passive: true })
    document.addEventListener('touchcancel', cancel, { passive: true })
    return () => {
      document.removeEventListener('touchstart', start)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', cancel)
    }
  }, [refreshingView, syncing, authToken])
  async function activateInstallation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setInstallerMessage('')
    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/installer/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: form.get('mode'), syncApiUrl: form.get('syncApiUrl'), businessId: form.get('businessId'), label: form.get('label'), adminApiKey: form.get('adminApiKey'), ownerEmail: form.get('ownerEmail'), ownerPassword: form.get('ownerPassword') }) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) { setInstallerMessage(data.error || 'Installation could not be activated.'); return }
    setInstallerMessage(data.existingBusiness ? 'Device enrolled. Sign in with the existing owner account.' : 'Installation activated. You can now create the client owner account.')
    setInstallerRequired(false)
    // The selected installer mode is authoritative here. A successfully
    // enrolled existing-business device must always proceed to sign-in,
    // even if an older cloud response omits the convenience flag.
    if (form.get('mode') === 'existing' || data.existingBusiness) setSetupRequired(false)
    if (isNativeMobile() && data.existingBusiness) await fetch('/api/sync/now', { method: 'POST' }).catch(() => undefined)
    await refreshSyncStatus()
    await refreshBusinessSettings()
  }
  async function resolveConflict(id: string, input: {action:string;note:string;confirmed:boolean}) {
    const response = await fetch(`/api/sync/conflicts/${id}/resolve`, { method: 'POST', headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    if (!response.ok) { const result=await response.json(); throw new Error(result.error || 'Could not record the review.') }
    if (response.ok) setSyncConflicts((current) => current.filter((conflict) => conflict.id !== id))
  }
  async function createDisplayPairing() {
    const response = await fetch('/api/customer-display/pair', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } })
    if (!response.ok) throw new Error('Could not create customer display link. Check the local service and try again.')
    setDisplayPairing(await response.json() as { url: string; code: string; expiresAt: string })
  }
  async function openCustomerDisplayOnSecondMonitor() {
    if (!window.stockroomDesktop) return
    const response = await fetch('/api/customer-display/pair', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } })
    if (!response.ok) throw new Error('Could not pair the second monitor. Please try again.')
    const pairing = await response.json() as { url: string; code: string; expiresAt: string }
    await window.stockroomDesktop.openCustomerDisplay(pairing.url)
  }
  useEffect(() => {
    refreshSyncStatus().catch(() => undefined)
    const interval = window.setInterval(() => refreshSyncStatus().catch(() => undefined), 15_000)
    return () => window.clearInterval(interval)
  }, [])
  async function syncQueuedOperations() {
    if (isBrowserPwa()) return
    if (!navigator.onLine) return
    const operations = await getQueuedOperations()
    for (const operation of operations) {
      const endpoint = operation.type === 'stock' ? `/api/products/${operation.payload.productId}/stock` : operation.type === 'sale' ? '/api/sales' : operation.type === 'sale-void' ? '/api/sales/voids' : operation.type === 'settings' ? '/api/settings' : '/api/products'
      const body = operation.type === 'stock' ? { amount: operation.payload.amount } : operation.payload
      const response = await fetch(endpoint, { method: operation.type === 'settings' ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify(body) }).catch(() => null)
      if (!response?.ok || operation.id === undefined) continue
      if (operation.type === 'product') {
        const synced = await response.json() as Product
        const localId = String(operation.payload.localId || '')
        setProducts((current) => current.map((product) => product.id === localId ? synced : product))
        await upsertCachedProducts([synced])
        if (localId) await replaceQueuedProductId(localId, synced.id)
      }
      if (operation.type === 'sale') await saveSale({ ...operation.payload, syncStatus: 'synced' } as Sale)
      await removeQueuedOperation(operation.id)
    }
  }

  useEffect(() => {
    if (!online) return
    syncQueuedOperations().catch(() => undefined)
    const interval = window.setInterval(() => syncQueuedOperations().catch(() => undefined), 30_000)
    return () => window.clearInterval(interval)
  }, [online])
  useEffect(() => {
    fetch('/api/settings').then((response) => response.ok ? response.json() as Promise<AppSettings & { ownerConfigured?: boolean; cloudConfigured?: boolean; existingBusiness?: boolean }> : Promise.reject()).then((settings) => {
      const cachedName = localStorage.getItem('stockroom-app-name') || ''
      const rememberedBusiness = Boolean(cachedName && cachedName !== 'My Business')
      const hasOwner = Boolean(settings.ownerConfigured || rememberedBusiness)
      setRegistrationAvailable(!hasOwner)
      setFreshVisitor(!hasOwner && !settings.cloudConfigured && !settings.existingBusiness)
      const startupState = resolveStartupState({ ...settings, ownerConfigured: hasOwner })
      const browserStartupState = isBrowserPwa() && !settings.cloudConfigured
        ? { ...startupState, installerRequired: false, setupRequired: false }
        : startupState
      const cachedCurrency = localStorage.getItem('stockroom-currency') || ''
      const isPlaceholder = settings.appName === 'My Business' && settings.currency === 'USD'
      const keepCachedIdentity = isPlaceholder && cachedName && cachedName !== 'My Business'
      const displayedName = keepCachedIdentity ? cachedName : settings.appName || 'My Business'
      const displayedCurrency = keepCachedIdentity ? cachedCurrency || 'USD' : settings.currency || 'USD'
      setAppName(displayedName)
      setCurrency(displayedCurrency)
      setPosProvider(settings.posProvider || '')
      setPosTerminalId(settings.posTerminalId || '')
      setPosConnection(settings.posConnection || 'manual')
      setLogoData(settings.logoData || '')
      setExtraPaymentPolicy(paymentPolicy(settings.paymentPolicy))
    setShopProfile(normalizeShopProfile(settings.shopProfile && settings.shopProfile !== 'null' ? settings.shopProfile : { mode: localStorage.getItem('stockroom-business-mode') && localStorage.getItem('stockroom-business-mode') !== 'general' ? 'suggested' : 'general', industry: localStorage.getItem('stockroom-business-mode') }))
        setLogoData(settings.logoData || '')
      setSetupRequired(browserStartupState.setupRequired)
      setInstallerRequired(browserStartupState.installerRequired)
      setSettingsLoaded(true)
      localStorage.setItem('stockroom-app-name', displayedName)
      localStorage.setItem('stockroom-currency', displayedCurrency)
      document.title = displayedName
    }).catch(async () => {
      try {
        const response = await fetch('/api/sync/status')
        const status = response.ok ? await response.json() as { configured?: boolean; existingBusiness?: boolean } : {}
        // A failed settings read cannot establish that this is an absolute
        // visitor. Keep returning local users on the sign-in path and let the
        // app show the real storage/startup error if the workspace is broken.
        const rememberedBusiness = Boolean(localStorage.getItem('stockroom-user') || (localStorage.getItem('stockroom-app-name') && localStorage.getItem('stockroom-app-name') !== 'My Business'))
        const startupState = resolveStartupState({ ownerConfigured: rememberedBusiness, cloudConfigured: status.configured, existingBusiness: status.existingBusiness })
        setRegistrationAvailable(!startupState.hasExistingDevice)
        setFreshVisitor(false)
        if (startupState.hasExistingDevice || isBrowserPwa()) {
          setSetupRequired(false)
          setInstallerRequired(false)
          setSettingsLoaded(true)
          return
        }
      } catch { }
      if (isBrowserPwa()) { setStartupError('Unable to open local storage. Please update your browser, allow website storage, and try again.'); return }
      setSetupRequired(true)
      setInstallerRequired(true)
      setSettingsLoaded(true)
    })
  }, [])
  useEffect(() => {
    const query = new URLSearchParams(location.search)
    // Business-specific staff links must stay in the app. A brand-new browser
    // profile has no local account yet, but `?business=...` identifies the
    // existing tenant and should open the sign-in form instead of the landing page.
    const rememberedBusiness = Boolean(localStorage.getItem('stockroom-user') || (localStorage.getItem('stockroom-app-name') && localStorage.getItem('stockroom-app-name') !== 'My Business'))
    if (!settingsLoaded || !freshVisitor || rememberedBusiness || user || authToken || registrationRequested || location.pathname !== '/' || query.has('screen') || query.has('business')) return
    const destination = new URL('/welcome', location.origin)
    const referral = query.get('ref') || ''
    if (/^[a-f0-9]{32}$/.test(referral)) destination.searchParams.set('ref', referral)
    location.replace(destination.href)
  }, [settingsLoaded, freshVisitor, user, authToken, registrationRequested])
  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])
  useEffect(() => {
    if (!settingsLoaded || !user) return
    if (user?.role === 'cashier' && !user.operationalAccess && !['POS', 'Oil', 'Payments', 'Counter', 'RetailOrders', 'Restaurant', 'Register', 'Guide', 'Subscription'].includes(active)) setActive(workspace.oil ? 'Oil' : workspace.productSales ? 'POS' : workspace.payments ? 'Payments' : workspace.fastFood ? 'Counter' : 'Restaurant')
    if (!workspaceScreenAvailable(shopProfile,active)) setActive(workspace.oil ? 'Oil' : workspace.productSales ? 'POS' : workspace.payments ? 'Payments' : workspace.fastFood ? 'Counter' : 'Restaurant')
  }, [settingsLoaded, user?.role, user?.operationalAccess, workspace.stock, workspace.productSales, workspace.oil, workspace.payments, workspace.fastFood, workspace.restaurant, active])

  const lowStock = products.filter((product) => product.stock <= product.reorder)
  const totalValue = products.reduce((sum, product) => sum + product.stock * product.price, 0)
  const filteredProducts = useMemo(() => {
    const term = (active === 'Inventory' ? inventoryQuery : query).trim().toLowerCase()
    const exact = term ? products.filter(product=>product.barcode?.trim().toLowerCase()===term||product.sku.trim().toLowerCase()===term) : []
    const matches = exact.length ? exact : products.filter(product=>!term||`${product.name} ${product.sku} ${product.barcode || ''} ${product.category}`.toLowerCase().includes(term))
    return matches.filter(product=>active!=='Inventory'||productFilter!=='low'||product.stock<=product.reorder).sort((a,b)=>productOrder==='az'?a.name.localeCompare(b.name):productOrder==='za'?b.name.localeCompare(a.name):productOrder==='oldest'?String(a.updated||'').localeCompare(String(b.updated||'')):String(b.updated||'').localeCompare(String(a.updated||'')))
  }, [products, query, inventoryQuery, productOrder, productFilter, active])
  const posCatalogueMatches = pos.catalogue.filter(product => filteredProducts.some(base => base.id === (product.baseProductId || product.id)))

  async function updateStock(id: string, amount: number) {
    if (!canManageInventory) return
    try {
      const response = await fetch(`/api/products/${id}/stock`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ amount }) })
      if (!response.ok) throw new Error('Unable to update stock')
      const updated = await response.json() as Product
      setProducts((current) => current.map((product) => product.id === id ? updated : product))
      upsertCachedProducts([updated]).catch(() => undefined)
    } catch {
      if (isBrowserPwa()) { window.alert('Stock could not be saved. Check available device storage and try again.'); return }
      const cachedProduct = products.find((product) => product.id === id)
      if (cachedProduct) {
        const updated = { ...cachedProduct, stock: Math.max(0, cachedProduct.stock + amount), updated: 'Saved offline' }
        setProducts((current) => current.map((product) => product.id === id ? updated : product))
        await upsertCachedProducts([updated]).catch(() => undefined)
        await queueOperation({ type: 'stock', payload: { productId: id, amount }, createdAt: new Date().toISOString() })
      }
    }
  }

  async function addProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManageInventory) return
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') || '').trim()
    const categoryChoice = String(data.get('category') || '')
    const category = categoryChoice === '__custom__' ? String(data.get('customCategory') || '').trim() : categoryChoice || 'General'
    const unitChoice = String(data.get('unit') || defaultUnit)
    const unit = unitChoice === '__custom__' ? String(data.get('customUnit') || '').trim() : unitChoice
    if (!unit) throw new Error('Enter the unit used to count this product.')
    if (categoryChoice === '__custom__' && !category.trim()) throw new Error('Enter the product category.')
    const input = { customValues: validateCustomValues(collectCustomValues(data), shopProfile), name, sku: String(data.get('sku') || '').trim() || deriveSku(name), barcode: String(data.get('barcode') || '').trim(), category, stock: Number(data.get('stock')), reorder: Number(data.get('reorder')), price: Number(data.get('price')), cost: Number(data.get('cost') || 0), unit }
    let rejected = false
    let savedProduct: Product | undefined
    try {
      const response = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify(input) })
      if (!response.ok) { rejected = true; const detail = await response.json().catch(() => ({})); throw new Error(detail.error || 'Unable to create product') }
      const product = await response.json() as Product
      savedProduct = product
      setProducts((current) => [product, ...current])
      await upsertCachedProducts([product])
    } catch (error) {
      if (rejected || isBrowserPwa() || isNativeMobile()) throw error
      const product = { ...input, id: crypto.randomUUID(), updated: 'Saved offline' }
      savedProduct = product
      setProducts((current) => [product, ...current])
      await upsertCachedProducts([product])
      await queueOperation({ type: 'product', payload: { ...input, localId: product.id }, createdAt: new Date().toISOString() })
    }
    const catalogueWorkspace = productReturn?.catalogueWorkspace || 'product-sales'
    const addedChoices = [
      ...(categoryChoice === '__custom__' ? [{ field: 'categories' as const, value: category }] : []),
      ...(unitChoice === '__custom__' ? [{ field: 'units' as const, value: unit }] : []),
    ]
    let catalogueSaveProblem = ''
    if (addedChoices.length) {
      const options = workspaceCatalogueOptions(shopProfile, catalogueWorkspace)
      const updatedLists = { ...options }
      for (const choice of addedChoices) {
        if (!updatedLists[choice.field].some(item => item.toLocaleLowerCase() === choice.value.toLocaleLowerCase())) updatedLists[choice.field] = [...updatedLists[choice.field], choice.value]
      }
      const optimisticProfile = { ...shopProfile, workspaceCatalogues: { ...shopProfile.workspaceCatalogues, [catalogueWorkspace]: updatedLists } }
      setShopProfile(optimisticProfile)
      try {
        for (const choice of addedChoices) {
          const response = await fetch('/api/settings/shop-profile/options', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ workspace: catalogueWorkspace, field: choice.field, value: choice.value }) })
          const result = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(result.error || 'Could not save the new dropdown choice.')
          setShopProfile(normalizeShopProfile(result))
        }
      } catch (error) {
        catalogueSaveProblem = error instanceof Error ? error.message : 'Could not save the new dropdown choice.'
      }
    }
    leaveProductEntry(savedProduct)
    if (catalogueSaveProblem) setProductFlowMessage(`Product saved. The new choice is available on this device, but could not be saved to the workspace settings: ${catalogueSaveProblem}`)
  }
  async function importProduct(input: { customValues?: Record<string, string>; name: string; barcode?: string; sku?: string; category?: string; unit?: string; price?: number; cost?: number; stock?: number; reorder?: number }) {
    const payload = { ...input, sku: input.sku?.trim() || deriveSku(input.name), barcode: input.barcode || '', category: input.category || '', unit: input.unit || defaultUnit, price: input.price || 0, cost: input.cost || 0, stock: input.stock || 0, reorder: input.reorder || 0 }
    const response = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify(payload) })
    if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.error || 'Could not save product.') }
    const product = await response.json() as Product
    setProducts(current => [product, ...current])
    await upsertCachedProducts([product])
  }

  async function saveAppName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextName = appName.trim()
    if (!nextName) return setSettingsMessage('Enter an app name.')
    const defaultPosProvider = extraPaymentPolicy.providers[0] || ''
    localStorage.setItem('stockroom-app-name', nextName)
    try {
      const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ appName: nextName, currency, posProvider: defaultPosProvider, posTerminalId, posConnection, logoData, paymentPolicy: extraPaymentPolicy }) })
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Unable to save') }
      setPosProvider(defaultPosProvider)
      settingsDraftDirty.current = false
      document.title = nextName
      localStorage.setItem('stockroom-currency', currency)
      if (isBrowserPwa() && navigator.onLine) {
        const sync = await fetch('/api/sync/now', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } }).catch(() => null)
        if (!sync?.ok) { setSettingsMessage('Saved on this device. It will sync when internet is available.'); return }
      }
      setSettingsMessage('Saved to the business account.')
    } catch {
      if (isBrowserPwa()) { setSettingsMessage('Settings could not be saved. Check available device storage and try again.'); return }
      await queueOperation({ type: 'settings', payload: { appName: nextName, currency, posProvider: defaultPosProvider, posTerminalId, posConnection, logoData, paymentPolicy: extraPaymentPolicy }, createdAt: new Date().toISOString() })
      setPosProvider(defaultPosProvider)
      setSettingsMessage('Saved on this device. It will sync when the server is available.')
    }
  }

  function chooseLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_000_000) {
      setSettingsMessage('Logo must be a PNG, JPEG, or WebP image smaller than 1 MB.')
      event.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => setLogoData(String(reader.result || ''))
    reader.readAsDataURL(file)
  }


  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submittedForm = event.currentTarget
    const form = new FormData(event.currentTarget)
    const currentPassword = String(form.get('currentPassword') || '')
    const nextPassword = String(form.get('newPassword') || '')
    const confirmPassword = String(form.get('confirmPassword') || '')
    if (!currentPassword || !nextPassword || !confirmPassword) {
      setPasswordMessage('Please complete all password fields.')
      return
    }
    if (nextPassword.length < 6) {
      setPasswordMessage('New password must be at least 6 characters long.')
      return
    }
    if (nextPassword !== confirmPassword) {
      setPasswordMessage('New passwords do not match.')
      return
    }
    try {
      const response = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ currentPassword, newPassword: nextPassword }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unable to update password.' })) as { error?: string }
        throw new Error(error.error || 'Unable to update password.')
      }
      submittedForm.reset()
      setPasswordMessage('Password updated successfully.')
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : 'Unable to update password.')
    }
  }

  async function addToCart(product: Product) {
    if (terminalLocked) { window.alert('A Paystack payment is in progress for this basket. Resolve it before changing the order.'); return }
    const baseProductId = product.baseProductId || product.id
    const config = pos.data.products.find(record => record.productId === baseProductId)
    let selected = product
    if (config?.modifiers?.length) {
      const answer = await requestInlinePrompt({ title: `Extras for ${product.name}`, message: config.modifiers.map((modifier: any, index: number) => `${index + 1}: ${modifier.name} (${formatMoney(modifier.price)})`).join('; ') + '. Enter 0 for none, or numbers separated by commas.', initialValue: '0' })
      if (answer === null) return
      const indexes = [...new Set(answer.split(',').map(value => Number(value.trim())))].filter(value => value !== 0)
      if (indexes.some(index => !Number.isInteger(index) || index < 1 || index > config.modifiers.length)) { window.alert('Choose valid extra numbers.'); return }
      if (indexes.length) {
        const extras = indexes.sort((a,b) => a-b).map(index => config.modifiers[index-1])
        selected = { ...product, id: `${product.id}:extras:${indexes.join('-')}`, baseProductId, name: `${product.name} + ${extras.map((extra: any) => extra.name).join(', ')}`, price: Math.round((product.price + extras.reduce((sum: number, extra: any) => sum + extra.price, 0)) * 100) / 100 }
        pos.setLines(current => [...current.filter(line => line.id !== selected.id), selected])
      }
    }
    if (!Object.keys(cart).length) setCurrentOrderId(crypto.randomUUID())
    setCart(current => { const factor = product.saleFactor || 1; const used = pos.catalogue.filter(line => (line.baseProductId || line.id) === baseProductId).reduce((sum, line) => sum + (current[line.id] || 0) * (line.saleFactor || 1), 0); const added = Math.min(1, Math.max(0, Math.floor((product.stock - used) / factor * 1000) / 1000)); return added > 0 ? { ...current, [selected.id]: Math.round(((current[selected.id] || 0) + added) * 1000) / 1000 } : current })
  }

  function setCartQuantity(productId: string, quantity: number) {
    if (terminalLocked) { window.alert('A Paystack payment is in progress for this basket. Resolve it before changing the order.'); return }
    if (!Number.isFinite(quantity) || quantity < 0 || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.000001) return
    const line = pos.catalogue.find(product => product.id === productId)
    if (line) {
      const baseId = line.baseProductId || line.id, factor = line.saleFactor || 1
      const usedByOtherLines = pos.catalogue.filter(product => (product.baseProductId || product.id) === baseId && product.id !== productId).reduce((sum, product) => sum + (cart[product.id] || 0) * (product.saleFactor || 1), 0)
      if (quantity * factor + usedByOtherLines > line.stock + 0.000001) { window.alert(`Insufficient stock. Only ${Math.max(0, line.stock - usedByOtherLines)} ${line.baseUnit || line.unit} remain.`); return }
    }
    if (quantity === 0 && Object.keys(cart).filter(id => id !== productId).length === 0) setCurrentOrderId(crypto.randomUUID())
    setCart((current) => {
      const next = { ...current }
      if (quantity === 0) delete next[productId]
      else next[productId] = quantity
      return next
    })
  }

  async function voidCartItem(product: Product, requestedQuantity = cart[product.id]) {
    if (terminalLocked) { window.alert('A Paystack payment is in progress for this basket. Resolve it before changing the order.'); return }
    const currentQuantity = cart[product.id]
    const quantity = Math.min(currentQuantity, requestedQuantity)
    if (!quantity) return
    const reason = await requestInlinePrompt({ title: 'Void rejected item', message: `Record why the customer rejected ${quantity} x ${product.name}. This action is logged with your cashier account.`, label: 'Void reason', minLength: 3 })
    const trimmedReason = reason?.trim() || ''
    if (trimmedReason.length < 3) {
      if (reason !== null) window.alert('Enter a reason with at least 3 characters. The item remains on the order.')
      return
    }
    const input = { id: crypto.randomUUID(), orderId: currentOrderId, productId: product.id, productName: product.name, quantity, unitPrice: product.price, reason: trimmedReason }
    try {
      const response = await fetch('/api/sales/voids', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify(input) })
      const result = await response.json().catch(() => ({})) as SaleItemVoid & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Could not record this void. The item remains on the order.')
      setSaleVoids(current => [result, ...current.filter(item => item.id !== result.id)])
      setCartQuantity(product.id, currentQuantity - quantity)
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Could not record this void. The item remains on the order.') }
  }

  async function completeSale() {
    if (!cartProducts.length || pos.pricingError) { if (pos.pricingError) window.alert(pos.pricingError); return }
    const access = await readPosAccess(authToken, user!.organizationId)
    setPosAccess(access)
    if (access.blocked) { window.alert(access.reason); return }
    // Read the local server/database immediately before payment: shared local
    // tills may have sold stock since this basket was opened. No cloud required.
    const latestStockResponse = await fetch('/api/products', { headers: authHeaders })
    if (!latestStockResponse.ok) { window.alert('Could not check local stock. Retry before taking payment.'); return }
    const latestProducts: Product[] = (await latestStockResponse.json()).products
    setProducts(latestProducts)
    const requiredStock = new Map<string, number>()
    for (const product of cartProducts) { const base = product.baseProductId || product.id; requiredStock.set(base, (requiredStock.get(base) || 0) + cart[product.id] * (product.saleFactor || 1)) }
    const unavailable = latestProducts.find(product => (requiredStock.get(product.id) || 0) > product.stock)
    if (unavailable) { window.alert(`Insufficient stock for ${unavailable.name}. Only ${unavailable.stock} available.`); return }
    if (paymentMethod === 'wallet' && walletCustomerId !== pos.customerId) { window.alert('Choose the same checkout customer and wallet account.'); return }
    if (paymentMethod === 'wallet' && (!extraPaymentPolicy.allowWallet || !walletCustomer || (walletCustomer.balance < cartTotal && !(extraPaymentPolicy.allowWalletCredit && user?.role === 'owner' && walletCreditApproved)))) { window.alert('Select a customer with enough wallet balance. Wallet payments must be enabled by the owner.'); return }
    if (((paymentMethod === 'external-pos' && !usePaystack) || (paymentMethod === 'multiple' && Number(splitTerminal) > 0)) && !manualTerminalAllowed) { window.alert('Terminal integration is unavailable and manual confirmation is disabled. Update the POS profile in Admin Settings.'); return }
    if (missingPaymentReferences) { window.alert('Enter the payment provider and reference for each POS or bank-transfer payment before completing the sale.'); return }
    if (paymentMethod === 'external-pos' && usePaystack) {
      try {
        const verified = await posRequest('/api/integrations/paystack/verify', authHeaders, { orderId: currentOrderId })
        if (!verified.paid || verified.amount !== cartTotal || verified.currency !== currency) { window.alert('Paystack has not verified payment for this basket amount and currency.'); return }
        setTerminalPayment(verified)
      } catch (error) { window.alert(error instanceof Error ? error.message : 'Could not verify payment.'); return }
    }
    let sale: Sale
    try {
      sale = recordPayment({ organizationId: user!.organizationId, businessName: appName, currency, id: currentOrderId, items: pos.items, total: cartTotal, createdAt: new Date().toISOString(), syncStatus: 'pending', paymentMethod, terminalProvider: paymentMethod === 'external-pos' && usePaystack ? 'Paystack' : paymentMethod === 'bank-transfer' ? transferProvider.trim() : terminalProvider.trim(), paymentReference: paymentMethod === 'external-pos' && usePaystack ? terminalPayment?.reference || '' : paymentMethod === 'bank-transfer' ? transferReference.trim() : paymentReference.trim(), paymentDetails: paymentMethod === 'wallet' ? { customerId: walletCustomerId, creditApproved: walletCreditApproved } : paymentMethod === 'multiple' ? { allocations: [{ method: 'cash', amount: splitCash }, ...(Number(splitTerminal) > 0 ? [{ method: 'external-pos', amount: splitTerminal, provider: terminalProvider, reference: splitTerminalReference }] : []), ...(Number(splitTransfer) > 0 ? [{ method: 'bank-transfer', amount: splitTransfer, provider: transferProvider, reference: transferReference }] : [])].filter(part => Number(part.amount) > 0) } : { amountReceived: paymentMethod === 'cash' ? cashReceived : paymentMethod === 'bank-transfer' ? transferAmountReceived : cartTotal + (usePaystack ? 0 : Number(extraKept || 0)), extraKept: paymentMethod === 'cash' || (paymentMethod === 'external-pos' && usePaystack) ? '0' : extraKept, reason: paymentMethod === 'cash' ? '' : paymentMethod === 'bank-transfer' && transferOverpayment === 'returned' ? 'change-returned' : extraReason, note: paymentMethod === 'cash' ? '' : extraNote } }, extraPaymentPolicy) as Sale
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Payment details are invalid.'); return }
    sale = { ...sale, branchId: activeBranchId, staffId: user!.id, staffName: user!.name, paymentDetails: { ...sale.paymentDetails!, pos: { ...(active === 'Oil' ? { workspace: 'oil' as const } : {}), tillId: checkoutTillId(), customerId: paymentMethod === 'wallet' ? walletCustomerId : pos.customerId, customerName: customers.find(customer => customer.id === (paymentMethod === 'wallet' ? walletCustomerId : pos.customerId))?.name, registerId: pos.data.registers.find(session => !session.closedAt && session.staffId === user!.id && (!session.tillId||session.tillId===checkoutTillId()))?.id, discountType: pos.discountType, discountValue: Number(pos.discountValue), loyaltyRedeemed: Number(pos.loyaltyRedeemed), tax: pos.data.settings, pricing: pos.pricing, note: pos.note, terminalRequestId: paymentMethod === 'external-pos' && usePaystack ? currentOrderId : undefined, loyaltyEarned: pos.data.settings.loyaltyEnabled && (paymentMethod === 'wallet' ? walletCustomerId : pos.customerId) ? Math.round(cartTotal * pos.data.settings.loyaltyRate) / 100 : 0 } } }
    {
      const response = await fetch('/api/sales', { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(sale) })
      if (!response.ok) { const result = await response.json(); window.alert(result.error || 'Sale could not be saved.'); return }
      const saved = await response.json()
      sale = { ...sale, ...saved }
      if (paymentMethod === 'wallet') setCustomers(current => current.map(customer => customer.id === walletCustomerId ? { ...customer, balance: Math.round((customer.balance - cartTotal) * 100) / 100 } : customer))
    }
    const updatedProducts = products.map(product => requiredStock.has(product.id) ? { ...product, stock: Math.round((product.stock - requiredStock.get(product.id)!) * 1000) / 1000, updated: 'Sold offline' } : product)
    await saveSale(sale).catch(() => setReceiptError('Sale saved, but its receipt snapshot could not be archived locally.'))
    setProducts(updatedProducts)
    setReceiptHistory(current => [sale, ...current.filter(row => row.id !== sale.id)])
    setLastReceipt(sale)
    setCompletedCustomerSale({ items: cartProducts.map((product) => ({ name: product.name, quantity: cart[product.id], price: product.price })), total: cartTotal })
    setWalletCustomerId('')
    pos.clear()
    localStorage.removeItem(`stockroom-paystack-pending:${currentOrderId}`)
    setTerminalPayment(null)
    void pos.reload().catch(error => pos.setError(error.message))
    setCurrentOrderId(crypto.randomUUID())
    setTerminalProvider(extraPaymentPolicy.providers[0] || '')
    setWalletCreditApproved(false)
    setCashReceived('')
    setPaymentReference('')
    setTransferAmountReceived('')
    setTransferOverpayment('')
    setExtraKept('0')
    setExtraReason('')
    setExtraNote('')
    window.setTimeout(() => setCompletedCustomerSale(null), 8_000)
    if (printerSettings().automatic) await printReceipt(sale).catch(error => setReceiptError(`Sale saved. Printing failed: ${error.message}. Use receipt history to retry.`))
    void syncQueuedOperations().catch(() => undefined)
  }

  async function printReceipt(sale: Sale) {
    if (receiptPrinting.current) throw new Error('A receipt is already printing. Please wait.')
    receiptPrinting.current = true
    try {
      flushSync(() => setLastReceipt(sale))
      await printDocument('receipt')
    } finally { receiptPrinting.current = false }
  }

  async function printCurrentOrder() {
    if (!cartProducts.length) return
    const order: PrintableOrder = { id: currentOrderId, businessName: appName, currency, createdAt: new Date().toISOString(), items: cartProducts.map(product => ({ productId: product.id, productName: product.name, quantity: cart[product.id], price: product.price })), total: cartTotal }
    flushSync(() => setOrderToPrint(order))
    try { await printDocument('order') }
    finally { setOrderToPrint(null) }
  }

  const { cartProducts } = summarizeCart(pos.catalogue, cart)
  const cartTotal = pos.pricing.total
  const missingPaymentReferences = (paymentMethod === 'external-pos' && !usePaystack && (!terminalProvider.trim() || !paymentReference.trim()))
    || (paymentMethod === 'bank-transfer' && (!transferProvider.trim() || !transferReference.trim()))
    || (paymentMethod === 'multiple' && ((Number(splitTerminal) > 0 && (!terminalProvider.trim() || !splitTerminalReference.trim())) || (Number(splitTransfer) > 0 && (!transferProvider.trim() || !transferReference.trim()))))
  const walletCustomer = customers.find(customer => customer.id === walletCustomerId)
  let cashError = ''; let changeDue = 0
  if (paymentMethod === 'cash' && cartProducts.length) {
    try { changeDue = recordPayment({ paymentMethod, total: cartTotal, paymentDetails: { amountReceived: cashReceived, extraKept, reason: extraReason, note: extraNote } }, extraPaymentPolicy).paymentDetails.changeGiven } catch (error) { cashError = error instanceof Error ? error.message : 'Invalid payment amount.' }
  }
  useEffect(() => {
    if (isBrowserPwa() || isNativeMobile() || !authToken) return
    const displaySale = completedCustomerSale || { items: cartProducts.map((product) => ({ name: product.name, quantity: cart[product.id], price: product.price })), total: cartTotal }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    const publish = async () => {
      try {
        const response = await fetch('/api/customer-display', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ businessName: appName, currency, items: displaySale.items, total: displaySale.total, completed: Boolean(completedCustomerSale) }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) })
        if (!response.ok) throw new Error(`Display update failed (${response.status}).`)
        if (!cancelled) setDisplayError('')
      } catch (error) {
        if (!cancelled) { setDisplayError('Customer display could not be updated. Its basket may be outdated. Retrying automatically.'); timer = setTimeout(publish, 5000) }
      }
    }
    void publish()
    return () => { cancelled = true; controller.abort(); clearTimeout(timer) }
  }, [appName, currency, cart, products, completedCustomerSale, authToken, displayRetry])

  useEffect(()=>{if(!authToken)return;const refresh=()=>{void fetch('/api/auth/session',{headers:authHeaders}).then(response=>response.ok?response.json():null).then(result=>{if(result?.user&&result.user.id===user?.id)setUser(result.user)}).catch(()=>undefined)};window.addEventListener('stockroom-data-refreshed',refresh);return()=>window.removeEventListener('stockroom-data-refreshed',refresh)},[authToken,user?.id])
  useEffect(()=>{if(settingsLoaded&&user&&!screenAllowedForUser(active,user))setActive('Guide')},[settingsLoaded,shopProfile,active,user?.permissions,user?.role])
  const canManageOperations = user?.role === 'owner' || user?.role === 'admin' || Boolean(user?.operationalAccess)
  const canManageInventory = user?.permissions?['inventory','purchasing','stocktake'].some(key=>hasPermission(user,key)):canManageOperations
  const canManageDeviceSetup = hasPermission(user,'configuration')
  useEffect(()=>{if(user?.role==='admin' && ['business','shop','sales'].includes(settingsTab))setSettingsTab('devices')},[user?.role,settingsTab])
  const allReceipts: Sale[] = [...receiptHistory, ...sales.filter(row => !receiptHistory.some(receipt => receipt.id === row.id)).map(row => ({ ...row, paymentMethod: row.paymentMethod as Sale['paymentMethod'], syncStatus: 'synced' as const, items: row.items.map(item => ({ productId: item.productId, productName: item.productName, quantity: item.quantity, price: item.unitPrice })) }))].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const formatMoney = (amount: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  async function refreshWallets() {
    const response = await fetch('/api/customers', { headers: authHeaders })
    if (response.ok) setCustomers((await response.json()).customers)
  }
  useEffect(() => { if (active === 'Wallet' || active === 'POS' || active === 'Oil' || active === 'Payments') void refreshWallets().catch(() => undefined) }, [active, authToken])
  async function adjustWallet(customerId: string, amount: number, reason: string) {
    const response = await fetch(`/api/customers/${customerId}/wallet`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ amount, reason }) })
    if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Wallet adjustment failed.') }
    await refreshWallets()
  }

  async function addCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newCustomerName.trim()
    if (!name) return
    const response = await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ name, phone: newCustomerPhone.trim() }) })
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'Could not add customer.') }
    const customer = await response.json() as Customer
    setCustomers((current) => [...current, customer].sort((a, b) => a.name.localeCompare(b.name)))
    setNewCustomerName('')
    setNewCustomerPhone('')
    chooseSection('customers')
  }

  const printPreparationTicket = async (order: CounterOrder, station?: 'kitchen' | 'bar') => { flushSync(() => setOrderToPrint({ preparation: true, id: (order.source === 'customer-portal' ? order.id.slice(-8) : order.id.slice(0,8)).toUpperCase(), businessName: order.businessName, currency: order.currency, createdAt: order.createdAt, customerName: order.tableService ? `${order.tableService.name}${order.tableService.seat ? ' / Seat '+order.tableService.seat : ''}` : order.customerName, note: [order.diningOption, order.delivery ? `Deliver to ${order.delivery.address} / ${order.delivery.phone}` : '', order.note].filter(Boolean).join(' / '), items: counterItems(order), total: order.total })); try { await printDocument('order', station ? { ...printerSettings(), receipt: printerSettings()[station] || printerSettings().receipt } : printerSettings()) } finally { setOrderToPrint(null) } }

  async function createBackup() {
    const response = await fetch('/api/backups', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } })
    if (!response.ok) return setSettingsMessage('Backup could not be created.')
    const backup = await response.json() as { fileName: string }
    setSettingsMessage(`Backup created: ${backup.fileName}`)
  }

  async function addStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submittedForm = event.currentTarget
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') || '')
    const passwordConfirmation = String(form.get('passwordConfirmation') || '')
    if (password !== passwordConfirmation) { setSettingsMessage('Temporary passwords do not match. No staff account was created.'); return }
    const username = (await requestInlinePrompt({ title: 'Choose staff username', message: 'Enter a unique username (3–32 characters; letters, numbers, dots, hyphens, and underscores).', minLength: 3 }))?.trim().toLowerCase()
    if (!username) return
    const ownerPassword = await requestInlinePrompt({ title: 'Confirm owner password', message: 'Enter your owner password to create this staff account. It is checked securely and is not stored.', inputType: 'password', minLength: 1 })
    if (!ownerPassword) return
    setSettingsMessage('Creating the staff accountâ€¦')
    try {
      // The desktop API has a local app session and a separate cloud owner
      // credential. Refresh/validate the latter before asking it to create staff.
      let cloudHeaders: Record<string, string> = {}
      if (!isBrowserPwa() && !isNativeMobile()) {
        const bootstrap = await fetch('/api/auth/cloud-bootstrap', {
          method: 'POST', signal: AbortSignal.timeout(12_000),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({
            accessToken: localStorage.getItem('stockroom-cloud-access-token') || cloudAccessToken,
            refreshToken: localStorage.getItem('stockroom-cloud-refresh-token') || '',
          }),
        })
        const session = await bootstrap.json().catch(() => ({})) as { accessToken?: string; refreshToken?: string; error?: string }
        if (!bootstrap.ok || !session.accessToken) throw new Error(session.error || 'Reconnect the owner account to manage staff.')
        setCloudAccessToken(session.accessToken)
        localStorage.setItem('stockroom-cloud-access-token', session.accessToken)
        if (session.refreshToken) localStorage.setItem('stockroom-cloud-refresh-token', session.refreshToken)
        cloudHeaders = { 'X-Cloud-Access-Token': session.accessToken }
      }
      const response = await fetch('/api/users', {
        method: 'POST', signal: AbortSignal.timeout(15_000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}`, ...cloudHeaders },
        body: JSON.stringify({ name: form.get('name'), email: form.get('email'), username, password, role: form.get('role'), ownerPassword }),
      })
      const result = await response.json().catch(() => ({})) as StaffUser & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Could not add the staff account.')
      setStaff((current) => [...current, result])
      submittedForm.reset()
      setSettingsMessage(`${result.name} was added as ${result.role}.`)
    } catch (caught) {
      setSettingsMessage(caught instanceof Error ? caught.message : 'Could not add the staff account. Please try again.')
    }
  }

  async function setCashierAccess(id: string, permissions: Record<string,boolean>) {
    const ownerPassword = await requestInlinePrompt({ title: 'Confirm owner password', message: 'Enter your owner password to save the selected staff access. It is not stored.', inputType: 'password', minLength: 1 })
    if (!ownerPassword) return
    const response = await fetch(`/api/users/${id}/permissions`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ permissions, ownerPassword }) })
    if (!response.ok) { const error = await response.json().catch(() => ({})) as { error?: string }; throw new Error(error.error || 'Could not update staff access.') }
    const updated = await response.json() as StaffUser
    setStaff((current) => current.map((member) => member.id === updated.id ? { ...member, ...updated, createdAt: updated.createdAt || member.createdAt || new Date().toISOString() } : member))
    setSettingsMessage(`Access saved for ${updated.name}.`)
  }

  async function updateStaffRole(id: string, role: 'admin' | 'cashier', operationalAccess?: boolean) {
    const ownerPassword = await requestInlinePrompt({ title: 'Confirm owner password', message: `Enter your owner password to change this staff member to ${role}. It is not stored.`, inputType: 'password', minLength: 1 })
    if (!ownerPassword) return
    const response = await fetch(`/api/users/${id}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ role, operationalAccess: typeof operationalAccess === 'boolean' ? operationalAccess : role === 'admin', ownerPassword }),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Could not update staff role.' })) as { error?: string }
      throw new Error(error.error || 'Could not update staff role.')
    }
    const updated = await response.json() as StaffUser
    setStaff((current) => current.map((member) => member.id === updated.id ? { ...member, ...updated, createdAt: updated.createdAt || member.createdAt || new Date().toISOString() } : member))
    setSettingsMessage(`${updated.name} is now a ${updated.role}.`)
  }

  async function removeStaff(id: string, ownerPassword: string) {
    const response = await fetch(`/api/users/${encodeURIComponent(id)}/remove`, { method:'POST', headers:{'Content-Type':'application/json', ...authHeaders}, body:JSON.stringify({ownerPassword,confirmation:'REMOVE'}) })
    const result = await response.json().catch(()=>({}))
    if (!response.ok) throw new Error(result.error || 'Could not remove staff.')
    setStaff(current=>current.filter(member=>member.id !== id))
    setSettingsMessage('Staff access removed. Sales and activity history were retained. Synchronize other devices to apply the change.')
  }

  async function resetStaffPassword(member: StaffUser) {
    const password = await requestInlinePrompt({ title: `Reset ${member.role} password`, message: `Set a new temporary password for ${member.name}. It must have at least 10 characters.`, inputType: 'password', minLength: 10 })
    if (!password) return
    if (password.length < 10) return setSettingsMessage('Staff passwords must be at least 10 characters long.')
    const confirmation = await requestInlinePrompt({ title: `Confirm ${member.role} password`, message: `Re-enter the new password for ${member.name}.`, inputType: 'password', minLength: 10 })
    if (password !== confirmation) return setSettingsMessage('Passwords did not match. No change was made.')
    const response = await fetch(`/api/users/${member.id}/password`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ password }) })
    if (!response.ok) { const error = await response.json().catch(() => ({})) as { error?: string }; return setSettingsMessage(error.error || 'Could not reset staff password.') }
    setSettingsMessage(`${member.role} password reset for ${member.name}. Give them the temporary password privately.`)
  }

  async function exportSalesCsv() {
    const response = await fetch('/api/reports/sales.csv', { headers: authHeaders })
    if (!response.ok) return
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url; link.download = 'stockroom-sales.csv'; link.click()
    URL.revokeObjectURL(url)
  }

  async function addExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submittedForm = event.currentTarget
    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/expenses', { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ category: form.get('category'), description: form.get('description'), amount: Number(form.get('amount')), incurredAt: new Date(String(form.get('incurredAt') || new Date().toISOString())).toISOString() }) })
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'Could not save expense.') }
    const expense = await response.json() as Expense
    setExpenses((current) => [expense, ...current])
    submittedForm.reset()
    chooseSection('expenses')
    const reportResponse = await fetch('/api/reports', { headers: authHeaders })
    if (reportResponse.ok) setReports(await reportResponse.json() as Reports)
  }

  const [scanning, setScanning] = useState(false)
  const cameraVideo = useRef<HTMLVideoElement>(null)
  const cameraSession = useRef(0)
  const cameraStream = useRef<MediaStream | null>(null)
  useEffect(()=>{
    if(active!=='Inventory'||section!=='new-product')return
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!scanning&&!inlinePrompt){event.preventDefault();leaveProductEntry()}}
    document.addEventListener('keydown',close)
    return()=>document.removeEventListener('keydown',close)
  },[active,section,scanning,inlinePrompt])
  function stopScan() {
    cameraSession.current += 1
    cameraStream.current?.getTracks().forEach(track => track.stop())
    cameraStream.current = null
    setScanning(false)
  }
  useEffect(() => { stopScan(); return () => { cameraSession.current += 1; cameraStream.current?.getTracks().forEach(track => track.stop()) } }, [active, authToken])
  async function acceptBarcode(code: string) {
    const value = code.trim()
    if (!value) return
    if (active === 'Inventory') { setInventoryQuery(value); return }
    if(active==='POS') {
      try{const measured=weightLabel(value,readWeighing(user!.organizationId),products);if(measured){setWeighedReview(measured);setQuery('');return}}catch(error){pos.setError((error as Error).message);return}
    }
    if (active === 'POS' || active === 'Oil') {
      const matches = products.filter(product => product.barcode === value || product.sku === value)
      if (matches.length === 1) { addToCart(matches[0]); setQuery(''); setScannedProductSuggestion(null); setProductFlowMessage(''); return }
    }
    setQuery(value)
    if((active==='POS'||active==='Oil')&&validGtin(value)){
      setScannedProductSuggestion(null)
      setProductFlowMessage('Checking the barcode catalogue...')
      try{
        const suggestion=await lookupProductBarcode(value,subscriptionApiUrl,shopProfile,active==='Oil'?'oil-sales':'product-sales')
        if(suggestion){setScannedProductSuggestion(suggestion);setProductFlowMessage(`${suggestion.catalogueSource || 'Product catalogue'} suggests ${suggestion.name}. You can edit this name in the product upload before saving.`)}
        else setProductFlowMessage('No online product name found. You can still add the item and enter its details.')
      }catch(error){setProductFlowMessage(`${error instanceof Error?error.message:'Barcode lookup failed.'} You can still add the item and enter its details.`)}
    }
  }
  async function acceptPaymentReference(raw: string) {
    if (!raw.trim()) return
    try {
      const reference = referenceFromScan(raw)
      const confirmed = await requestInlinePrompt({ title: 'Confirm payment reference', message: 'Confirm this reference against the POS receipt. This does not verify payment.', initialValue: reference })
      if (confirmed !== null) setPaymentReference(referenceFromScan(confirmed))
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Could not read payment reference.') }
  }
  async function scanBarcode(target: 'product' | 'payment' | 'setup' | 'intake' = 'product', intake?: (value: string) => void) {
    const accept = target === 'setup' ? (_code: string) => {} : target === 'intake' ? (value: string) => intake?.(value) : target === 'payment' ? acceptPaymentReference : acceptBarcode
    if (scanning) return
    const Detector = (window as unknown as { BarcodeDetector?: new () => { detect(video: HTMLVideoElement): Promise<Array<{ rawValue: string }>> } }).BarcodeDetector
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      if (target === 'setup') throw new Error('Camera scanning is unavailable on this device. Use keyboard scanner setup instead.')
      const value = await requestInlinePrompt({ title: 'Enter barcode', message: 'Enter or scan a barcode.' }) || ''
      accept(value)
      return value || undefined
    }
    stopScan()
    const session = cameraSession.current
    setScanning(true)
    const timeout = window.setTimeout(() => { if (session === cameraSession.current) { stopScan(); window.alert('Scan timed out. Try again or enter the barcode.') } }, 30_000)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      if (session !== cameraSession.current) { stream.getTracks().forEach(track => track.stop()); return }
      cameraStream.current = stream
      const video = cameraVideo.current
      if (!video) throw new Error('Camera preview is unavailable.')
      video.srcObject = stream
      await video.play()
      const detector = new Detector()
      while (session === cameraSession.current) {
        const codes = await detector.detect(video)
        if (session !== cameraSession.current) break
        if (codes[0]) { accept(codes[0].rawValue); stopScan(); return codes[0].rawValue }
        await new Promise(resolve => window.setTimeout(resolve, 150))
      }
    } catch (error) {
      if (session === cameraSession.current) { stopScan(); if (target === 'setup') throw error; const value = await requestInlinePrompt({ title: 'Camera unavailable', message: 'Enter or scan the barcode.' }) || ''; accept(value); return value || undefined }
    } finally { window.clearTimeout(timeout) }
  }

  async function startStocktake() {
    const response = await fetch('/api/stocktakes', { method: 'POST', headers: authHeaders })
    const result = await response.json().catch(() => ({})) as Stocktake & { error?: string }
    if (!response.ok) throw new Error(result.error || 'Could not start stocktake.')
    setStocktake(result)
    setActive('Stocktake')
  }

  async function updateCount(countId: string, counted: number) {
    if (!stocktake) return
    const response = await fetch(`/api/stocktakes/${stocktake.id}/counts/${countId}`, { method: 'PUT', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ counted }) })
    if (response.ok) setStocktake(await response.json() as Stocktake)
    else if (isBrowserPwa()) window.alert((await response.json()).error || 'Could not save count.')
  }

  async function approveStocktakeSession() {
    if (!stocktake) return
    const response = await fetch(`/api/stocktakes/${stocktake.id}/approve`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: stocktakeReason.trim() || 'Approved after physical count' }),
    })
    if (response.ok) {
      const next = await response.json() as Stocktake
      setStocktake(next)
      fetch('/api/products', { headers: authHeaders }).then((result) => result.json()).then((data: { products: Product[] }) => setProducts(data.products))
    } else if (isBrowserPwa()) window.alert((await response.json()).error || 'Could not approve stocktake.')
  }

  async function login(identifier: string, password: string) {
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password }) })
    // Desktop local authentication must complete without the network. PWA and
    // Android deliberately return no local login response and use the cloud
    // fallback below; a desktop only uses that fallback when SQLite does not
    // recognise the account yet.
    let cloudData: { token: string; user: User; cloudAccessToken: string; refreshToken?: string } | null = null
    let data: { token: string; user: User }
    if (response.ok) {
      data = await response.json() as { token: string; user: User }
    } else {
      const cloudResponse = await fetch('/api/auth/cloud-session', { method: 'POST', signal: AbortSignal.timeout(10_000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password }) }).catch(() => null)
      cloudData = cloudResponse?.ok ? await cloudResponse.json() as { token: string; user: User; cloudAccessToken: string; refreshToken?: string } : null
      if (!cloudData) {
        const failure = await cloudResponse?.json().catch(() => null) as { error?: string } | null
        if (isBrowserPwa() || isNativeMobile()) {
          throw new Error(failure?.error || 'Connect to the internet to sign in. An existing signed-in session can work offline.')
        }
        throw new Error(failure?.error || 'Sign-in failed. Owners must use their business email; staff must use their username and business sign-in link.')
      }
      data = cloudData
    }
    const fallbackCloudToken = localStorage.getItem('stockroom-cloud-access-token') || ''
    const resolvedCloudToken = resolveCloudAccessToken(cloudData?.cloudAccessToken || '', fallbackCloudToken)
    if (cloudData || resolvedCloudToken) {
      setCloudAccessToken(resolvedCloudToken)
      localStorage.setItem('stockroom-cloud-access-token', resolvedCloudToken)
      if (cloudData?.refreshToken) localStorage.setItem('stockroom-cloud-refresh-token', cloudData.refreshToken)
    }
    setAuthToken(data.token)
    setUser(data.user)
    setChooseBranch(true)
    setActive(preferredScreen(data.user))
    setInstallerRequired(false)
    setSetupRequired(false)
    localStorage.setItem('stockroom-token', data.token)
    localStorage.setItem('stockroom-user', JSON.stringify(data.user))
    // Keep local login immediate/offline; obtain cloud credentials using the
    // same login while online, as APK/PWA do, without replacing local identity.
    if (!cloudData && data.user.role === 'owner' && !isNativeMobile() && !isBrowserPwa()) {
      void signInToCloud(identifier, password).catch(() => undefined)
    }
  }

  async function signInToCloud(identifier: string, password: string) {
    const localSession = localStorage.getItem('stockroom-token')
    const response = await fetch('/api/auth/cloud-session', { method: 'POST', signal: AbortSignal.timeout(10_000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password }) }).catch(() => null)
    const data = response ? await response.json().catch(() => ({})) as { accessToken?: string; cloudAccessToken?: string; refreshToken?: string; user?: User; error?: string } : {}
    const accessToken = data.accessToken || data.cloudAccessToken || ''
    if (!response?.ok || !accessToken || !data.refreshToken || data.user?.role !== 'owner') throw new Error(data.error || 'Could not sign in with the cloud owner account.')
    if (localStorage.getItem('stockroom-token') !== localSession) throw new Error('The signed-in user changed.')
    setCloudAccessToken(accessToken)
    setCloudSessionError('')
    localStorage.setItem('stockroom-cloud-access-token', accessToken)
    localStorage.setItem('stockroom-cloud-refresh-token', data.refreshToken)
    return { accessToken, refreshToken: data.refreshToken }
  }

  async function applyInitialBusinessPreset(key: string, token: string) {
    const current=await fetch('/api/settings',{headers:{Authorization:`Bearer ${token}`}})
    if(!current.ok)throw new Error('Business created. Choose your preset in Business settings > Workspaces.')
    const settings=await current.json()
    const profile=applyBusinessPreset(normalizeShopProfile(settings.shopProfile),key)
    const response=await fetch('/api/settings/shop-profile',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(profile)})
    if(!response.ok)throw new Error('Business created. Choose your preset in Business settings > Workspaces.')
    setShopProfile(normalizeShopProfile(await response.json()))
    setActive(businessPresets[key].screen)
  }

  async function registerBusiness(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') || '').trim()
    const password = String(form.get('password') || '')
    if (password !== form.get('confirmPassword')) throw new Error('Passwords do not match.')
    const response = await fetch('/api/auth/register-business', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25000),
      body: JSON.stringify({ key: form.get('registrationKey'), ownerName: form.get('ownerName'), email, password, currency: form.get('currency'), referralCode: form.get('referralCode') }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Business registration failed.')
    // The key creates the cloud owner once. Reuse the existing enrollment and
    // login flows to create the device workspace; never submit the key twice.
    sessionStorage.removeItem('stockroom-referral-code')
    setWorkspaceSetupRequested(true)
    setRegistrationRequested(false)
    setRegistrationAvailable(false)
    setSetupRequired(false)
    setAuthError('')
    try {
      if (!isBrowserPwa()) {
        const enrolled = await fetch('/api/installer/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25000), body: JSON.stringify({ mode: 'existing', ownerEmail: email, ownerPassword: password, label: result.businessName }) })
        if (!enrolled.ok) {
          setInstallerRequired(true)
          setInstallerMessage('Your business is registered. Choose Existing business and use your owner email and password to finish enrolling this device.')
          return
        }
      }
      setInstallerRequired(false)
      await login(email, password)
      const setupUser=JSON.parse(localStorage.getItem('stockroom-user')||'null') as User|null
      if(setupUser)localStorage.setItem(workspaceSetupKey(setupUser.organizationId),'0')
      await refreshBusinessSettings()
      await applyInitialBusinessPreset(String(form.get('businessPreset') || 'retail'),localStorage.getItem('stockroom-token') || '').catch(error=>{setSettingsMessage(error.message);setActive('Settings');setSettingsTab('shop')})
    } catch {
      if (!isBrowserPwa()) setInstallerMessage('Your business is registered. Use Existing business to finish enrolling, then sign in.')
      setAuthError('Your business is registered. Sign in with your owner email and password to continue. You do not need another key.')
    }
  }

  async function completeSetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = {
      appName: String(form.get('shopName') || '').trim(),
      ownerName: String(form.get('ownerName') || '').trim(),
      email: String(form.get('email') || '').trim(),
      password: String(form.get('password') || ''),
    }
    if (!payload.appName || !payload.ownerName || !payload.email || !payload.password) {
      setAuthError('Please complete all fields to create your shop account.')
      return
    }
    const response = await fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unable to create your business account.' })) as { error?: string }
      throw new Error(error.error || 'Unable to create your business account.')
    }
    const data = await response.json() as { token: string; user: User; setup: { appName: string } }
    setAuthToken(data.token)
    setUser(data.user)
    setChooseBranch(true)
    setWorkspaceSetupRequested(true)
    localStorage.setItem(workspaceSetupKey(data.user.organizationId),'0')
    setAppName(data.setup.appName)
    setSetupRequired(false)
    localStorage.setItem('stockroom-token', data.token)
    localStorage.setItem('stockroom-user', JSON.stringify(data.user))
    localStorage.setItem('stockroom-app-name', data.setup.appName)
    document.title = data.setup.appName
    await applyInitialBusinessPreset(String(form.get('businessPreset') || 'retail'),data.token).catch(error=>{setSettingsMessage(error.message);setActive('Settings');setSettingsTab('shop')})
    const cloud = await fetch('/api/auth/cloud-register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null)
    if (cloud?.ok) {
      const result = await cloud.json() as { accessToken: string; refreshToken?: string }
      setCloudAccessToken(result.accessToken); localStorage.setItem('stockroom-cloud-access-token', result.accessToken)
      if (result.refreshToken) localStorage.setItem('stockroom-cloud-refresh-token', result.refreshToken)
      const referralCode = sessionStorage.getItem('stockroom-referral-code') || ''
      if (/^[a-f0-9]{32}$/.test(referralCode)) {
        const referral = await fetch(`${subscriptionApiUrl}/v1/subscriptions/referrals`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${result.accessToken}`, ...(subscriptionApiUrl === '/api/cloud' ? { 'X-Local-Session': data.token } : {}) }, body: JSON.stringify({ code: referralCode }) }).catch(() => null)
        if (referral?.ok) sessionStorage.removeItem('stockroom-referral-code')
      }
    }
  }

  async function logout() {
    const response = await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } }).catch(() => undefined)
    if (isBrowserPwa() && !response?.ok) { window.alert('Could not clear the saved session. Check available device storage and try logging out again.'); return }
    // Ending an active session does not undo device enrollment or shop setup.
    setInstallerRequired(false)
    setSetupRequired(false)
    setFreshVisitor(false)
    setWorkspaceSetupRequested(false)
    setAuthError('')
    setAuthToken('')
    setUser(null)
    localStorage.removeItem('stockroom-token')
    localStorage.removeItem('stockroom-user')
    localStorage.removeItem('stockroom-cloud-access-token')
    localStorage.removeItem('stockroom-cloud-refresh-token')
    setCloudAccessToken('')
  }

  if (!settingsLoaded) return <main className="login-screen"><div className="login-card"><h1>{startupError ? 'Cannot open your business' : 'Loading your business'}</h1>{startupError && <><p>{startupError}</p><button className="primary-button" onClick={() => window.location.reload()}>Try again</button><PublicLandingLink /></>}</div></main>
  if (!user && needsIntroduction) return <main className="login-screen"><AppIntroduction onContinue={()=>{try{localStorage.setItem('stockroom-introduction-v1','seen')}catch{}setNeedsIntroduction(false)}} /></main>
  if (!user) return <><HelpMenu/>{registrationAvailable && registrationRequested
    ? registrationStage === 'request'
      ? <RegistrationRequestScreen onContinue={(key, email) => { setGeneratedRegistrationKey(key); setRegistrationOwnerEmail(email); setRegistrationStage('complete') }} onCancel={() => { setRegistrationRequested(false); setAuthError('') }} />
      : <SetupScreen keyRegistration initialRegistrationKey={generatedRegistrationKey} initialEmail={registrationOwnerEmail} onCancel={() => setRegistrationStage('request')} onCreate={registerBusiness} error={authError} setError={setAuthError} />
    : installerRequired ? <InstallerScreen onActivate={activateInstallation} message={installerMessage} onRegister={registrationAvailable ? () => { setRegistrationRequested(true); setRegistrationStage('request') } : undefined} /> : setupRequired ? <SetupScreen onCreate={completeSetup} error={authError} setError={setAuthError} /> : <LoginScreen onLogin={login} error={authError} setError={setAuthError} onRegister={registrationAvailable ? () => { setRegistrationRequested(true); setRegistrationStage('request') } : undefined} />}</>

  if(chooseBranch) return <main className="login-screen"><section className="login-card"><div className="brand-mark"><Store size={21}/></div><h1>Choose your branch</h1><p>You can switch branches later from the app header.</p>{branches.length?branches.filter(branch=>branch.isActive!==false).map(branch=><button type="button" key={branch.id} className={activeBranchId===branch.id?'branch-choice selected':'branch-choice'} aria-pressed={activeBranchId===branch.id} onClick={()=>setActiveBranchId(branch.id)}><Store size={18}/><span><strong>{branch.name}</strong>{branch.address&&<small>{branch.address}</small>}</span></button>):!branchError&&<p role="status">Loading your branches...</p>}{branchError&&<div role="alert"><p>{branchError}</p><button type="button" className="filter-button" onClick={()=>setBranchRetry(value=>value+1)}>Retry loading branches</button><button type="button" className="text-button" onClick={()=>void logout()}>Back to sign in</button></div>}<button type="button" className="primary-button login-button" disabled={Boolean(branchError)||!branches.some(branch=>branch.id===activeBranchId&&branch.isActive!==false)} onClick={()=>setChooseBranch(false)}>Continue to your business</button></section></main>
  if(user.role==='owner'&&(workspaceSetupRequested||localStorage.getItem(workspaceSetupKey(user.organizationId))!==null&&localStorage.getItem(workspaceSetupKey(user.organizationId))!=='complete')) return <><HelpMenu screenHelpTopic={{title:'Workspace setup',description:'Choose a business type and selling workspace separately, select matching starter items, and confirm them. You can edit catalogue entries later or skip this step.'}}/><WorkspaceOnboarding profile={shopProfile} currency={currency} policy={extraPaymentPolicy} saveProfile={saveShopProfile} savePreferences={saveWorkspacePreferences} saveStarters={saveOnboardingStarters} finish={screen=>{localStorage.setItem(workspaceSetupKey(user.organizationId),'complete');setWorkspaceSetupRequested(false);setActive(screen||'Overview')}}/></>
  return <div className={`app-shell${desktopLayout&&desktopSidebarCollapsed?' sidebar-collapsed':''}`}>{!desktopLayout&&<div className="mobile-app-header"><div className="mobile-app-topline"><div className="mobile-app-brand"><div className="brand-mark">{logoData?<img src={logoData} alt="" className="brand-logo"/>:<Boxes size={24}/>}</div><div className="mobile-app-brand-copy"><strong title={appName}>{appName}</strong><span>Business operations</span></div></div><NotificationCenter apiUrl={subscriptionApiUrl} token={cloudAccessToken} onToken={(nextToken,refreshToken)=>{setCloudAccessToken(nextToken);localStorage.setItem('stockroom-cloud-access-token',nextToken);localStorage.setItem('stockroom-cloud-refresh-token',refreshToken)}} allowPush={isBrowserPwa()}/></div><div className="mobile-app-actions"><button className="mobile-header-sync" type="button" onClick={syncNow} disabled={!online || !syncStatus.configured || syncing} aria-label="Sync business data" title={syncFeedback || 'Upload local changes and download business updates'}><RefreshCw size={16} className={syncing?'spin':''}/><span>{syncing?'Syncing':'Sync'}</span></button><HelpMenu guide={()=>setActive('Guide')} headers={authHeaders} scope={`${user.organizationId}:${user.id}`} screenHelpTopic={{...screenHelpFor(active,section,settingsTab,paymentTab),title:'What this screen is for'}} className="mobile-header-help"/></div>{syncFeedback&&<div className="mobile-header-sync-feedback" role="status" aria-live="polite">{syncFeedback}</div>}</div>}<ReadingControls/>
    {(isNativeMobile() || isBrowserPwa()) && <div className={refreshingView ? 'mobile-pull-refresh refreshing' : 'mobile-pull-refresh'} style={{ transform: `translate(-50%, ${refreshingView ? 8 : mobilePullDistance - 56}px)` }}><RefreshCw size={17} className={refreshingView ? 'spin' : ''} /><span>{refreshingView ? 'Refreshing…' : mobilePullDistance >= 64 ? 'Release to refresh' : 'Pull to refresh'}</span></div>}
    <button ref={mobileMenuToggleRef} className="mobile-nav-toggle" type="button" aria-controls="business-navigation" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(open => !open)}>{mobileMenuOpen?<X size={22}/>:<Menu size={22}/>}</button>
    {mobileMenuOpen && <button className="mobile-nav-backdrop" type="button" aria-label="Close navigation menu" onClick={() => setMobileMenuOpen(false)} />}
    <aside ref={mobileMenuRef} tabIndex={-1} id="business-navigation" inert={!mobileMenuOpen&&!desktopLayout} role={mobileMenuOpen&&!desktopLayout?'dialog':undefined} aria-modal={mobileMenuOpen&&!desktopLayout?true:undefined} aria-label="Business navigation" className={`sidebar${mobileMenuOpen ? ' mobile-menu-open' : ''}`}>
      <div className="brand"><div className="brand-mark">{logoData ? <img src={logoData} alt="" className="brand-logo" /> : <Boxes size={21} />}</div><div><strong>{appName}</strong><span>Business operations</span></div><button type="button" className="sidebar-collapse-toggle" aria-label={desktopSidebarCollapsed?'Expand navigation':'Collapse navigation'} title={desktopSidebarCollapsed?'Expand navigation':'Collapse navigation'} onClick={()=>setDesktopSidebarCollapsed(value=>{const next=!value;localStorage.setItem('stockroom-sidebar-collapsed',String(next));return next})}>{desktopSidebarCollapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}</button></div>
      <ToolSearch tools={[{label:'Overview',screen:'Overview'}, ...(workspace.productSales?[{label:'Product sales',screen:'POS'}]:[]), ...(workspace.oil?[{label:'Oil sales',screen:'Oil'}]:[]), ...(workspace.payments?[{label:'Payments & receipts',screen:'Payments'}]:[]), ...(workspace.fastFood?[{label:'Order counter',screen:'Counter'}]:[]), ...(workspace.restaurant?[{label:'Tables & tabs',screen:'Restaurant'}]:[]), ...(workspace.stock?[{label:'Inventory',screen:'Inventory'},{label:'Stock count',screen:'Stocktake'},{label:'Stock movements',screen:'Movements'},{label:'Online orders',screen:'RetailOrders'}]:[]), {label:'Customer accounts',screen:'Wallet'},{label:'Staff access permissions',screen:'Team'},{label:'Staff activity',screen:'Activity'},{label:'Sales and receipts',screen:'Sales'},{label:'Reports and charts',screen:'Reports'},{label:'Business settings',screen:'Settings'},{label:'Subscription',screen:'Subscription'},{label:'How to use the app',screen:'Guide'}].filter(tool=>screenAllowedForUser(tool.screen,user)).map(tool=>({label:tool.label,open:()=>{setActive(tool.screen);setMobileMenuOpen(false)}}))}/><nav onClick={(event) => { const item = (event.target as HTMLElement).closest('a,button'); if (item && !item.hasAttribute('aria-expanded')) setMobileMenuOpen(false) }}>
        {canManageOperations && screenAllowedForUser('Overview',user) && <button className={active === 'Overview' ? 'nav-item active' : 'nav-item'} aria-current={active === 'Overview' ? 'page' : undefined} onClick={() => setActive('Overview')}><LayoutDashboard size={18} />Overview</button>}<NavigationGroup title="Sales & orders" current={['POS','Oil','Payments','Counter','Restaurant','RetailOrders','Register'].includes(active)}>        {workspace.restaurant && screenAllowedForUser('Restaurant',user) && <button className={active === 'Restaurant' ? 'nav-item active' : 'nav-item'} aria-current={active === 'Restaurant' ? 'page' : undefined} onClick={() => setActive('Restaurant')}><Store size={18} />Tables &amp; tabs</button>}
        {workspace.stock && screenAllowedForUser('RetailOrders',user) && <button className={active==='RetailOrders'?'nav-item active':'nav-item'} aria-current={active === 'RetailOrders' ? 'page' : undefined} onClick={()=>setActive('RetailOrders')}><Store size={18}/>Online orders</button>}
        {workspace.fastFood && screenAllowedForUser('Counter',user) && <button className={active === 'Counter' ? 'nav-item active' : 'nav-item'} aria-current={active === 'Counter' ? 'page' : undefined} onClick={() => setActive('Counter')}><Store size={18} />Order counter</button>}
        {workspace.oil && screenAllowedForUser('Oil',user) && <button className={active === 'Oil' ? 'nav-item active' : 'nav-item'} aria-current={active === 'Oil' ? 'page' : undefined} onClick={() => setActive('Oil')}><ShoppingCart size={18} />{oilWorkspaceName}</button>}
        {workspace.productSales && screenAllowedForUser('POS',user) && <button className={active === 'POS' ? 'nav-item active' : 'nav-item'} aria-current={active === 'POS' ? 'page' : undefined} onClick={() => setActive('POS')}><ShoppingCart size={18} />{salesWorkspaceName}</button>}
        {workspace.payments && hasPermission(user,'serviceJobs') && screenAllowedForUser('Payments',user) && <button className="nav-item" onClick={()=>{setPaymentTab('Jobs & invoices');setPaymentNavigation(value=>value+1);setActive('Payments')}}>Jobs &amp; invoices</button>}{workspace.payments && screenAllowedForUser('Payments',user) && <button className={active === 'Payments' ? 'nav-item active' : 'nav-item'} aria-current={active === 'Payments' ? 'page' : undefined} onClick={() => {setPaymentTab('New payment');setPaymentNavigation(value=>value+1);setActive('Payments')}}><WalletCards size={18} />Payments &amp; receipts</button>}
        {screenAllowedForUser('Register',user)&&<button className={active==='Register'?'nav-item active':'nav-item'} aria-current={active === 'Register' ? 'page' : undefined} onClick={()=>setActive('Register')}><WalletCards size={18}/>Cash register</button>}</NavigationGroup>        {canManageOperations && screenAllowedForUser('Sales',user) && <div className="sidebar-nav-group"><button className={active === 'Sales' ? 'nav-item active' : 'nav-item'} aria-current={active === 'Sales' ? 'page' : undefined} aria-expanded={expandedSidebarGroup === 'Sales'} onClick={() => { if(active !== 'Sales'){navigateToSection('Sales','sales-history');setExpandedSidebarGroup('Sales')}else setExpandedSidebarGroup(group => group === 'Sales' ? null : 'Sales') }}><ShoppingCart size={18} />Sales history <span className="nav-disclosure" aria-hidden="true">{expandedSidebarGroup === 'Sales' ? '−' : '+'}</span></button>{expandedSidebarGroup === 'Sales' && <div className="sidebar-subnav"><a href="#sales-receipt-history" onClick={event => { event.preventDefault(); navigateToSection('Sales', 'sales-receipt-history') }}>Receipt history</a><a href="#sales-void-history" onClick={event => { event.preventDefault(); navigateToSection('Sales', 'sales-void-history') }}>Voided items</a><a href="#sales-payment-evidence" onClick={event => { event.preventDefault(); navigateToSection('Sales', 'sales-payment-evidence') }}>Payment evidence</a><a href="#sales-history" onClick={event => { event.preventDefault(); navigateToSection('Sales', 'sales-history') }}>Sales history</a><a href="#sales-reconciliation" onClick={event => { event.preventDefault(); navigateToSection('Sales', 'sales-reconciliation') }}>Match payments</a></div>}</div>}<NavigationGroup title="Stock" current={['Inventory','Stocktake','Movements'].includes(active)}>        {workspace.stock && hasPermission(user,'purchasing') && screenAllowedForUser('Inventory',user) && <button className="nav-item" onClick={()=>navigateToSection('Inventory','inventory-purchasing')}>Purchasing &amp; suppliers</button>}{workspace.stock && canManageOperations && screenAllowedForUser('Inventory',user) && <button className={active === 'Inventory' && section === 'products' ? 'nav-item active' : 'nav-item'} aria-current={active === 'Inventory' && section === 'products' ? 'page' : undefined} onClick={() => {setSections(current=>({...current,Inventory:'products'}));setActive('Inventory')}}><Boxes size={18} />{shopProfile.inventoryLabel} <b>{products.length}</b></button>}
        {workspace.stock && canManageInventory && screenAllowedForUser('Stocktake',user) && <button className={active === 'Stocktake' ? 'nav-item active' : 'nav-item'} aria-current={active === 'Stocktake' ? 'page' : undefined} onClick={() => setActive('Stocktake')}><CheckSquare size={18} />Stock count</button>}
        {workspace.stock && canManageOperations && screenAllowedForUser('Movements',user) && <button className={active === 'Movements' ? 'nav-item active' : 'nav-item'} aria-current={active === 'Movements' ? 'page' : undefined} onClick={() => setActive('Movements')}><ArrowDownToLine size={18} />Stock movements</button>}</NavigationGroup>        {canManageOperations && screenAllowedForUser('Wallet',user) && <NavigationGroup title="Customer" current={active==='Wallet'}><button className={active==='Wallet'&&section==='customers'?'nav-item active':'nav-item'} aria-current={active==='Wallet'&&section==='customers'?'page':undefined} onClick={()=>navigateToSection('Wallet','customers')}><WalletCards size={18}/>Customers</button><button className={active==='Wallet'&&section==='new-customer'?'nav-item active':'nav-item'} aria-current={active==='Wallet'&&section==='new-customer'?'page':undefined} onClick={()=>navigateToSection('Wallet','new-customer')}><Plus size={18}/>Add customer</button><button className={active==='Wallet'&&section==='birthdays'?'nav-item active':'nav-item'} aria-current={active==='Wallet'&&section==='birthdays'?'page':undefined} onClick={()=>navigateToSection('Wallet','birthdays')}>Birthdays</button></NavigationGroup>}{user.role === 'owner' && <div className="sidebar-nav-group"><button className={active === 'Team' ? 'nav-item active' : 'nav-item'} aria-current={active === 'Team' ? 'page' : undefined} aria-expanded={expandedSidebarGroup === 'Team'} onClick={() => { setExpandedSidebarGroup(group => group === 'Team' ? null : 'Team') }}><UserRoundCog size={18} />Staff & access <span className="nav-disclosure" aria-hidden="true">{expandedSidebarGroup === 'Team' ? '−' : '+'}</span></button>{expandedSidebarGroup === 'Team' && <div className="sidebar-subnav"><a href="#team-cashier-activity" onClick={event => { event.preventDefault(); navigateToSection('Team', 'team-cashier-activity') }}>Cashier activity</a><a href="#team-members" onClick={event => { event.preventDefault(); navigateToSection('Team', 'team-members') }}>Team members</a><a href="#team-members" onClick={event=>{event.preventDefault();navigateToSection('Team','team-members')}}>Access permissions</a><a href="#team-add-staff" onClick={event => { event.preventDefault(); navigateToSection('Team', 'team-add-staff') }}>Add staff</a>{staff.some(member => member.role === 'cashier' || member.role === 'admin') && <a href="#team-password-recovery" onClick={event => { event.preventDefault(); navigateToSection('Team', 'team-password-recovery') }}>Staff passwords</a>}</div>}</div>}<NavigationGroup title="Reports" current={['Reports','Owner','Activity'].includes(active)}>        {!isBrowserPwa() && screenAllowedForUser('Owner',user) && <button className={active === 'Owner' ? 'nav-item active' : 'nav-item'} aria-current={active === 'Owner' ? 'page' : undefined} onClick={() => setActive('Owner')}><LayoutDashboard size={18} />Business performance</button>}
        {screenAllowedForUser('Reports',user) && <button className={active === 'Reports' ? 'nav-item active' : 'nav-item'} aria-current={active === 'Reports' ? 'page' : undefined} onClick={() => setActive('Reports')}><BarChart3 size={18} />Reports</button>}
        {screenAllowedForUser('Activity',user) && <button className={active === 'Activity' ? 'nav-item active' : 'nav-item'} aria-current={active === 'Activity' ? 'page' : undefined} onClick={() => setActive('Activity')}><UserRoundCog size={18} />Staff activity</button>}</NavigationGroup><NavigationGroup title="Expenses" current={active==='Reports'&&['expenses','new-expense'].includes(section)}>{screenAllowedForUser('Reports',user)&&<><button className={active==='Reports'&&section==='new-expense'?'nav-item active':'nav-item'} aria-current={active==='Reports'&&section==='new-expense'?'page':undefined} onClick={()=>navigateToSection('Reports','new-expense')}><Plus size={18}/>New expense</button><button className={active==='Reports'&&section==='expenses'?'nav-item active':'nav-item'} aria-current={active==='Reports'&&section==='expenses'?'page':undefined} onClick={()=>navigateToSection('Reports','expenses')}>All expenses</button></>}</NavigationGroup><NavigationGroup title="Settings" current={['Settings','Subscription','Sync','Display','Account','Device'].includes(active)}>        {screenAllowedForUser('Settings',user) && <button className={active === 'Settings' ? 'nav-item active' : 'nav-item'} aria-current={active === 'Settings' ? 'page' : undefined} onClick={() => {setSettingsTab(user.role==='owner'?'business':'devices');setActive('Settings')}}><UserRoundCog size={18} />Business settings</button>}{user.role==='owner'&&<><button className="nav-item" onClick={()=>{setSections(current=>({...current,Settings:'appearance'}));setSettingsTab('business');setActive('Settings')}}>Brand colours &amp; logo</button><button className={active==='Settings'&&section==='payment-methods'?'nav-item active':'nav-item'} aria-current={active==='Settings'&&section==='payment-methods'?'page':undefined} onClick={()=>{setSections(current=>({...current,Settings:'payment-methods'}));setSettingsTab('business');setActive('Settings')}}>Payment methods</button><button className="nav-item" onClick={()=>{setSettingsTab('shop');setActive('Settings')}}>Workspaces &amp; timezone</button></>}{screenAllowedForUser('Device',user)&&<button className="nav-item" onClick={()=>{setSettingsTab('devices');setActive('Settings')}}>Printers &amp; devices</button>}        {user.role === 'owner' && <button className={active === 'Subscription' ? 'nav-item active' : 'nav-item'} aria-current={active === 'Subscription' ? 'page' : undefined} onClick={() => setActive('Subscription')}><WalletCards size={18} />Subscription</button>}        {screenAllowedForUser('Sync',user) && <button className={active === 'Sync' ? 'nav-item active' : 'nav-item'} aria-current={active === 'Sync' ? 'page' : undefined} onClick={() => setActive('Sync')}><RefreshCw size={18} />Sync issues {syncConflicts.length > 0 && <b>{syncConflicts.length}</b>}</button>}        {(workspace.productSales || workspace.oil) && !isBrowserPwa() && !isNativeMobile() && screenAllowedForUser('Display',user) && <button className={active === 'Display' ? 'nav-item active' : 'nav-item'} aria-current={active === 'Display' ? 'page' : undefined} onClick={() => setActive('Display')}><Store size={18} />Customer display</button>}        {user.role === 'owner' && <button className={active === 'Account' ? 'nav-item active' : 'nav-item'} aria-current={active === 'Account' ? 'page' : undefined} onClick={() => setActive('Account')}><Trash2 size={18} />Close business account</button>}</NavigationGroup><NavigationGroup title="Help" current={active==='Guide'}>        <button className={active==='Guide'?'nav-item active':'nav-item'} aria-current={active === 'Guide' ? 'page' : undefined} onClick={()=>setActive('Guide')}><BookOpen size={18}/>How to use the app</button>        <a className="nav-item" href="https://stockroom.globalcreest.com/downloads" target="_blank" rel="noreferrer"><Download size={18} />Download / install Stockroom</a></NavigationGroup></nav>
      <div className="sidebar-foot pwa-sync-controls"><SyncStatusIndicator online={online} status={syncStatus}/><button className="sync-button" onClick={syncNow} disabled={!online || !syncStatus.configured || syncing} title="Upload local changes and download business updates"><RefreshCw size={14} className={syncing ? 'spin' : ''} />{syncing ? 'Syncing…' : 'Sync now'}</button>{syncFeedback && <p className="sync-feedback" role="status" aria-live="polite">{syncFeedback}</p>}{(syncStatus.lastError || syncConflicts.length > 0 || Number(syncStatus.conflicts) > 0) && <button type="button" className="sync-issue-link" onClick={()=>{setActive('Sync');setMobileMenuOpen(false)}}><AlertTriangle size={15} aria-hidden="true"/><span>{syncStatus.lastError ? `${syncErrorMessage(syncStatus.lastError)} Open sync issues` : `${syncConflicts.length || syncStatus.conflicts || 0} change${(syncConflicts.length || syncStatus.conflicts || 0)===1?' needs':'s need'} review. Review now`}</span></button>}</div>
      {user.role === 'owner' && <button type="button" className={`sidebar-subscription-status subscription-status-${posAccess.status}`} data-status-label={posAccess.status === 'trial' ? 'Trial' : posAccess.status === 'active' ? 'Active' : posAccess.status === 'grace' ? 'Grace' : posAccess.status === 'expired' || posAccess.status === 'trial-expired' ? 'Expired' : posAccess.status === 'suspended' ? 'Paused' : posAccess.status === 'test' ? 'Test' : posAccess.status === 'unknown' ? 'Unknown' : 'Unpaid'} aria-label={`Subscription: ${posAccess.status}`} title={`Subscription: ${posAccess.status}`} onClick={() => { setActive('Subscription'); setMobileMenuOpen(false) }}><span>Subscription</span><strong>{posAccess.status === 'trial' ? 'Free trial' : posAccess.status === 'trial-expired' ? 'Trial ended' : posAccess.status === 'active' ? 'Active' : posAccess.status === 'grace' ? 'Grace period' : posAccess.status === 'test' ? 'Enforcement off' : posAccess.status === 'unknown' ? 'Status unavailable' : 'Payment needed'}</strong>{posAccess.status === 'trial' && posAccess.expiresAt && <small>Ends {new Date(String(posAccess.expiresAt)).toLocaleDateString()}</small>}</button>}
      {desktopLayout&&<HelpMenu guide={()=>setActive('Guide')} headers={authHeaders} scope={`${user.organizationId}:${user.id}`} screenHelpTopic={{...screenHelpFor(active,section,settingsTab,paymentTab),title:'What this screen is for'}} className="desktop-sidebar-help"/>}
    <AsyncButton busyLabel="Signing out..." className="text-button logout-button" onClick={logout}>Log out</AsyncButton></aside>
    <main inert={mobileMenuOpen&&!desktopLayout} className={`main-content workspace-accent-${active}${productWorkspaceActive ? ' pos-workspace' : ''}`}>
      <header className="topbar"><div><p className="eyebrow">{user.name} · {user.role}</p><h1>{active === 'Guide' ? 'How to use Stockroom' : active === 'Inventory' ? ({'add-search':'Add or search product','new-product':'Add product','import':'Import products','import-csv':'Import CSV','import-barcode':'Find by barcode','import-photo':'Read product photo','import-reference':'Find saved reference','import-save-reference':'Save offline references','import-review':'Review imported products','starters':'Choose starter products','products':'Products'} as Record<string,string>)[section] || shopProfile.inventoryLabel : active === 'Register' ? 'Cash register' : active === 'Oil' ? oilWorkspaceName : active === 'POS' ? salesWorkspaceName : active === 'RetailOrders' ? 'Online orders' : active === 'Counter' ? 'Order counter' : active === 'Restaurant' ? 'Tables & tabs' : active === 'Payments' ? 'Payments & receipts' : active === 'Wallet' ? section === 'new-customer' ? 'Add customer' : section === 'birthdays' ? 'Birthdays' : 'Customers' : active === 'Owner' ? 'Business performance' : active === 'Activity' ? 'Staff activity' : active === 'Overview' ? (user.role === 'owner' ? 'Business overview' : 'Operations overview') : active === 'Reports' ? section === 'expenses' ? 'Expenses' : section === 'new-expense' ? 'New expense' : 'Reports' : active === 'Team' ? 'Staff & access' : active === 'Subscription' ? 'Subscription' : active === 'Settings' ? 'Business settings' : active === 'Sales' ? 'Sales history' : active === 'Stocktake' ? 'Stock count' : active === 'Movements' ? 'Stock movements' : active === 'Display' ? 'Customer display' : active === 'Sync' ? 'Sync issues' : active === 'Device' ? 'Printers & devices' : active === 'Account' ? 'Close your account' : 'Stockroom'}</h1></div><div className="top-actions"><label className="branch-switcher"><Store size={16} /><span className="sr-only">Active branch</span><select aria-label="Active branch" disabled={Boolean(branchError)||!branches.length} value={activeBranchId} onChange={event => setActiveBranchId(event.target.value)}>{!branches.length&&<option value={activeBranchId}>{branchError?'Branches unavailable':'Loading branches...'}</option>}{branches.filter(branch => branch.isActive !== false).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>{desktopLayout&&<NotificationCenter apiUrl={subscriptionApiUrl} token={cloudAccessToken} onToken={(nextToken, refreshToken) => { setCloudAccessToken(nextToken); localStorage.setItem('stockroom-cloud-access-token', nextToken); localStorage.setItem('stockroom-cloud-refresh-token', refreshToken) }} allowPush={isBrowserPwa()} /> }<button type="button" className="icon-button" title="Back" onClick={goBackInApp} disabled={active === 'Overview'} aria-label="Go back"><ArrowLeft size={18} /></button><PageOptions onRefresh={refreshLocalView} busy={refreshingView || syncing} refreshing={refreshingView} /><span className="avatar" aria-hidden="true">{user.name.slice(0, 2).toUpperCase()}</span></div></header>
      {branchError&&<div role="alert" className="panel"><p>{branchError}</p><button type="button" className="filter-button" onClick={()=>setBranchRetry(value=>value+1)}>Retry loading branches</button></div>}

      {salesBlocked && <section className="empty-screen subscription-block" aria-label="Sales access"><h2>{['expired','trial-expired'].includes(posAccess.status)?'Subscription expired':'Sales unavailable'}</h2><p>{['expired','trial-expired'].includes(posAccess.status)?'Renew your subscription to continue selling.':posAccess.reason}</p><button type="button" className="primary-button" onClick={()=>setActive('Subscription')}>Open subscription</button><AsyncButton className="text-button" busyLabel="Checking..." onClick={async()=>setPosAccess(await readPosAccess(authToken,user.organizationId,true))}>Check again</AsyncButton></section>}
      <div className="workspace-content" hidden={salesBlocked}>
      <Suspense fallback={<p className="screen-loading" role="status">Loading screen…</p>}>
      {active==='Inventory' && <ScreenPicker buttons className="inventory-action-cards" label="Inventory tasks" value={section} change={chooseSection} options={[
        ...(hasPermission(user,'inventory')?[{id:'products',label:'Products'}, {id:'transfers',label:'Move stock'}]:[]),
        ...(hasPermission(user,'purchasing')?[{id:'purchasing',label:'Supply & suppliers'}]:[]),
        ...(hasPermission(user,'inventory')?[{id:'expiry',label:'Stock costs & expiry'},{id:'pricing',label:'Prices'},{id:'import',label:'Import CSV'}]:[]),
        ...(canManageDeviceSetup?[{id:'options',label:'Product variants & extras'}]:[]),
        ]} />}
      {active==='Sales' && <ScreenPicker value={section} change={chooseSection} options={[{id:'sales-receipt-history',label:'Receipts'},{id:'sales-history',label:'Sales records'},...(hasPermission(user,'sales')?[{id:'sales-void-history',label:'Voided items'},{id:'sales-payment-evidence',label:'Payment evidence'},{id:'sales-reconciliation',label:'Match payments'}]:[]),...(hasPermission(user,'refunds')?[{id:'returns',label:'Returns & customer history'}]:[])]} />}
      {active==='Team' && <ScreenPicker value={section} change={chooseSection} options={[{id:'team-members',label:'Staff list & access'},{id:'team-add-staff',label:'Add staff'},{id:'links',label:'Sign-in links'},{id:'team-password-recovery',label:'Reset staff password'}]} />}
      {active==='Reports' && !['expenses','new-expense'].includes(section) && <ScreenPicker value={section} change={chooseSection} options={[{id:'summary',label:'Sales reports'},...(workspace.stock?[{id:'stock-report',label:'Stock reports'}]:[])]} />}
      {active==='Settings' && settingsTab==='business' && <ScreenPicker value={section} change={chooseSection} options={[{id:'identity',label:'Business identity'},{id:'payment-methods',label:'Payment methods'},{id:'branches',label:'Branches'},{id:'appearance',label:'Colours & logo'},{id:'password',label:'Change password'},...(window.stockroomDesktop?[{id:'backup',label:'Backup & restore'}]:[])]} />}
      {active==='Guide' && user.role==='owner' && <BusinessSetup businessId={user.organizationId} stock={workspace.stock} food={workspace.fastFood} restaurant={workspace.restaurant} payments={workspace.payments} open={screen=>screen==='WorkspaceSetup'?setWorkspaceSetupRequested(true):setActive(screen as typeof active)}/>}
      {active==='Guide' && <Suspense fallback={<p role="status">Loading guide...</p>}><UserGuide canOpenScreen={screen=>screenAllowedForUser(screen,user)&&(!['Inventory','Stocktake'].includes(screen)||workspace.stock)} openScreen={screen=>{if(screenAllowedForUser(screen,user))setActive(screen);else setSettingsMessage('Your account does not have access to that screen.')}} role={user.role} headers={authHeaders} scope={`${user.organizationId}:${user.id}`} /></Suspense>}
      {active === 'Overview' && canManageOperations && <WorkspaceOverview timeZone={shopProfile.reportingTimeZone||'UTC'} workspace={workspace} headers={authHeaders} receipts={allReceipts} money={formatMoney} hasProducts={products.length>0} configure={canManageDeviceSetup?tab=>{if(tab==='food'||tab==='restaurant'){setSettingsTab(tab);setActive('Settings');return}setSections(current=>({...current,Inventory:tab}));setActive('Inventory')}:undefined} openRecords={screenAllowedForUser('Sales',user)?()=>navigateToSection('Sales','sales-history'):undefined} openCustomers={screenAllowedForUser('Wallet',user)?()=>navigateToSection('Wallet','customers'):undefined} openExpenses={screenAllowedForUser('Reports',user)?()=>navigateToSection('Reports','expenses'):undefined} scanProducts={hasPermission(user,'inventory')?()=>scanBarcode('intake'):undefined} readProductList={user.role==='owner'?()=>navigateToSection('Inventory','handwritten'):undefined} open={screen=>setActive(screen)}/> }
      {active==='Inventory' && section==='products' && <section className="panel product-list-summary"><dl><div><dt>Products value</dt><dd>{formatMoney(totalValue)}</dd></div><div><dt>Cost of goods</dt><dd>{formatMoney(products.reduce((sum,product)=>sum+product.stock*(product.cost||0),0))}</dd></div><div><dt>Unique products</dt><dd>{products.length}</dd></div></dl><div className="product-list-tabs"><button type="button" className={productFilter==='low'?'primary-button':'filter-button'} aria-pressed={productFilter==='low'} onClick={()=>setProductFilter(productFilter==='low'?'all':'low')}>{productFilter==='low'?'Show all products':'Low stock only'}</button></div></section>}
      {active==='Inventory' && section==='new-product' && canManageInventory && <section className="panel full-panel task-screen product-creation-screen"><div className="panel-heading"><div><h2>Add {shopProfile.itemLabel.toLowerCase()}</h2><p>Scan a barcode or enter the product details.</p></div><PackagePlus size={24}/></div><button type="button" className="filter-button task-back-button" onClick={()=>leaveProductEntry()}><ArrowLeft size={17}/>Back to {productReturn?.screen==='POS'||productReturn?.screen==='Oil'?'sale':productReturn?.section==='add-search'?'product search':productReturn?.section==='import'?'product import':'products'}</button>{productFlowMessage&&<p className="product-flow-message" role="status">{productFlowMessage}<button type="button" className="text-button" onClick={()=>setProductFlowMessage('')} aria-label="Dismiss message"><X size={16}/></button></p>}<AsyncForm className="settings-form product-create-form" busyLabel="Saving product..." onSubmit={addProduct}><ShopProductFields key={productReturn?.catalogueWorkspace || 'product-sales'} profile={shopProfile} catalogueWorkspace={productReturn?.catalogueWorkspace} initialDraft={productDraft} scanBarcode={()=>scanBarcode('intake')} lookupApiUrl={subscriptionApiUrl}/><div className="task-actions"><button type="button" className="filter-button" onClick={()=>leaveProductEntry()}>Cancel</button><SubmitButton className="primary-button">Save {shopProfile.itemLabel.toLowerCase()} <ArrowUpToLine size={17}/></SubmitButton></div></AsyncForm></section>}
      {active === 'Inventory' && section==='products' && products.length===0 && <EmptyScreen title="No products yet" description="" action={<button className="primary-button" onClick={()=>openAddProduct()}>Add product</button>} />}
      {active === 'Inventory' && section==='products' && products.length>0 && <><div className="list-toolbar"><ListSort value={productOrder} change={value=>{setProductOrder(value);sessionStorage.setItem('stockroom-product-order',value)}}/></div><section className="panel full-panel"><div className="panel-heading"><div><h2>{shopProfile.inventoryLabel}</h2><p>Adjust counts as stock comes in or goes out.</p></div><div className="report-actions"><button className="primary-button" onClick={() => openAddProduct()}><Plus size={18} />Add {shopProfile.itemLabel.toLowerCase()}</button></div></div><div className="search-row"><div className="search-box barcode-search"><Search size={17} /><input onFocus={event => event.currentTarget.select()} placeholder={`Search ${shopProfile.inventoryLabel.toLowerCase()}`} value={inventoryQuery} onKeyDown={event => { if (event.key === scannerSettings().suffix) { event.preventDefault(); acceptBarcode(inventoryQuery) } }} onChange={(event) => setInventoryQuery(event.target.value)} /><button type="button" className="barcode-scan-button" onClick={() => scanBarcode()} aria-label="Scan product barcode" title="Scan product barcode"><ScanLine size={19} /></button></div></div>{products.length===0 ? <EmptyScreen title="No products yet" description="" action={<button className="primary-button" onClick={()=>openAddProduct()}>Add product</button>} /> : <div className="table-wrap"><table><thead><tr><th>{shopProfile.itemLabel}</th><th>SKU</th><th>Category</th><th>Stock</th><th>Cost price</th><th>Selling price</th><th>Catalogue margin per unit</th><th>Updated</th><th></th></tr></thead><tbody>{filteredProducts.map((product) => <ProductRow key={product.id} product={product} updateStock={updateStock} money={formatMoney} detailed onDetails={shopProfile.fields.some(field => field.id.startsWith('custom_')) || Object.keys(readCustomValues(product.customValues)).length ? () => setDetailsProduct(product) : undefined} />)}</tbody></table></div>}</section></>}
      {active==='Inventory' && section==='transfers' && <section className="panel full-panel"><h2>Transfer stock between branches</h2><WorkspaceHelp title="Workspace help"><p>Transfers are recorded as paired stock movements and sync to the other devices in this business.</p></WorkspaceHelp><form className="settings-form" onSubmit={submitBranchTransfer}><label>Product<select required value={transferProductId} onChange={event => setTransferProductId(event.target.value)}><option value="">Select product</option>{products.map(product => <option key={product.id} value={product.id}>{product.name} · {product.stock} available at {activeBranch?.name}</option>)}</select></label><label>Destination branch<select required value={transferDestinationId} onChange={event => setTransferDestinationId(event.target.value)}><option value="">Select destination</option>{branches.filter(branch => branch.isActive !== false && branch.id !== activeBranchId).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Quantity<input type="number" min="0.001" step="0.001" required value={transferQuantity} onChange={event => setTransferQuantity(event.target.value)} /></label><label>Reason<input required minLength={3} maxLength={250} value={transferReason} onChange={event => setTransferReason(event.target.value)} placeholder="Restock request, redistribution…" /></label><button className="primary-button" disabled={!branches.some(branch => branch.id !== activeBranchId && branch.isActive !== false)}>Record transfer</button></form></section>}
      {active === 'Stocktake' && !stocktake && <EmptyScreen title="No stock count started" description="Start a count to compare the quantities on your shelves with the stock saved in the app." action={<AsyncButton className="primary-button" onClick={startStocktake}>Start stock count</AsyncButton>} />}
      {active === 'Stocktake' && stocktake && <section className="panel full-panel"><div className="panel-heading"><div><h2>Stock count</h2><p>Count what is physically on the shelf and approve the variance.</p></div>{!stocktake || stocktake.status === 'approved' ? <AsyncButton busyLabel="Starting stocktake..." className="primary-button" onClick={startStocktake}><CheckSquare size={17} />Start stock take</AsyncButton> : <AsyncButton busyLabel="Approving..." className="primary-button" onClick={approveStocktakeSession}>Approve adjustments</AsyncButton>}</div>{!stocktake ? <div className="empty-state">Start a session to compare expected stock with physical counts.</div> : <><div className="search-row"><label className="settings-form" style={{ width: '100%' }}><span>Approval reason</span><input value={stocktakeReason} onChange={(event) => setStocktakeReason(event.target.value)} disabled={stocktake.status === 'approved'} /></label></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>Expected</th><th>Counted</th><th>Variance</th></tr></thead><tbody>{stocktake.counts.map((count) => <tr key={count.id}><td><strong>{count.name}</strong><span className="table-subtext">{count.sku}</span></td><td>{count.expected}</td><td><input className="count-input" type="number" min="0" step="0.001" value={count.counted} disabled={stocktake.status === 'approved'} onChange={(event) => updateCount(count.id, Number(event.target.value))} /></td><td className={count.variance === 0 ? 'muted' : count.variance < 0 ? 'low-stock' : 'positive'}>{count.variance > 0 ? '+' : ''}{count.variance}</td></tr>)}</tbody></table></div>{stocktake.history && stocktake.history.length > 0 && <div className="panel"><div className="panel-heading"><div><h3>Audit history</h3><p>Recorded adjustments from this stock-take session.</p></div></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>Expected</th><th>Counted</th><th>Variance</th><th>Reason</th></tr></thead><tbody>{stocktake.history.map((entry) => <tr key={entry.id}><td><strong>{entry.name}</strong><span className="table-subtext">{entry.sku}</span></td><td>{entry.expected}</td><td>{entry.counted}</td><td className={entry.variance === 0 ? 'muted' : entry.variance < 0 ? 'low-stock' : 'positive'}>{entry.variance > 0 ? '+' : ''}{entry.variance}</td><td>{entry.reason}</td></tr>)}</tbody></table></div></div>}</>}</section>}
      {((active === 'RetailOrders' && (workspace.productSales || workspace.oil)) || (active === 'Counter' && workspace.fastFood) || (active === 'Restaurant' && workspace.restaurant) || (active==='Settings' && canManageDeviceSetup && ((settingsTab==='food' && workspace.fastFood)||(settingsTab==='restaurant' && workspace.restaurant)))) && <RestaurantService retail={active==='RetailOrders'} access={user.role==='owner'?undefined:user.permissions||undefined} industry={shopProfile.industry} catalogueUnits={workspaceCatalogueOptions(shopProfile, active === 'Restaurant' || (active === 'Settings' && settingsTab === 'restaurant') ? 'tables-tabs' : 'order-counter').units} printJobScope={user.organizationId + ':' + activeBranchId} acceptOnlineOrder={async order => { await cloudRequest(subscriptionApiUrl, '/v1/customer-portal/accept', { method: 'POST', body: JSON.stringify({ orderId: order.id, tillId: checkoutTillId() }) }, (next, refresh) => { setCloudAccessToken(next); localStorage.setItem('stockroom-cloud-access-token', next); localStorage.setItem('stockroom-cloud-refresh-token', refresh) }, cloudAccessToken); const response = await fetch('/api/sync/pull', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } }); const result = await response.json(); if (!response.ok || result.lastError || !result.configured) throw new Error(result.error || result.lastError || 'Order accepted online. Synchronize this till before processing it.') }} walletAllowed={extraPaymentPolicy.allowWallet} providers={extraPaymentPolicy.providers} configuration={active==='Settings'} allowSetup={active==='Settings'} restaurant={active === 'Restaurant'||(active==='Settings'&&settingsTab==='restaurant')} payBill={async draft=>{const access=await readPosAccess(authToken,user.organizationId);setPosAccess(access);if(access.blocked)throw new Error(access.reason);const receipt=await posRequest('/api/pos/restaurant/settle',authHeaders,draft) as Sale;setReceiptHistory(current=>[receipt,...current.filter(row=>row.id!==receipt.id)]);setLastReceipt(receipt);await saveSale(receipt).catch(()=>setReceiptError('Payment saved. Retry the receipt download if needed.'));await reloadPosStock();return receipt}} printBill={async (tab, orders) => { const first = orders[0]; if (!first) throw new Error('Add orders before printing the bill.'); const due = orders.reduce((sum,order)=>sum+Math.max(0,order.total-(order.paidAmount || (order.receiptId?order.total:0))),0); flushSync(()=>setOrderToPrint({ bill: true, amountPaid: orders.reduce((sum, order) => sum + order.total, 0) - due, balanceDue: due, billSummary: {subtotal:orders.reduce((n,order)=>n+(order.pos?.pricing?.subtotal || order.total),0),discount:orders.reduce((n,order)=>n+(order.pos?.pricing?.discount || 0),0),addedTax:orders.reduce((n,order)=>n+(order.pos?.pricing?.taxSettings.taxIncluded ? 0 : order.pos?.pricing?.tax || 0),0),includedTax:orders.reduce((n,order)=>n+(order.pos?.pricing?.taxSettings.taxIncluded ? order.pos.pricing.tax : 0),0)}, id: tab.sessionId.slice(0,8).toUpperCase(), businessName:first.businessName, currency:first.currency, createdAt:tab.openedAt, customerName:tab.name, note:`${tab.guests} guests.`, items:orders.flatMap(order=>counterItems(order).map(item=>({...item,productName:(order.tableService?.seat ? 'Seat '+order.tableService.seat+': ' : '')+item.productName}))), total:orders.reduce((sum,order)=>sum+order.total,0) })); try { await printDocument('order') } finally { setOrderToPrint(null) } }} key={active + ':' + settingsTab + ':counter:' + user.organizationId + ':' + user.id + ':' + activeBranchId} storageKey={'stockroom-counter-draft:' + user.organizationId + ':' + user.id + ':' + activeBranchId} headers={authHeaders} products={products} refreshStock={reloadPosStock} receipts={allReceipts} manager={['owner','admin'].includes(user.role)||Boolean(user.permissions&&Object.values(user.permissions).some(Boolean))} owner={user.role === 'owner'} money={formatMoney} print={printReceipt} printTicket={printPreparationTicket} synchronize={async () => { await syncQueuedOperations(); const response = await fetch('/api/sync/now', { method: 'POST', headers: authHeaders }); if (!response.ok) throw new Error('Saved locally. Connect and sync to share orders with other devices.'); const status = await response.json(); if (status.conflicts > 0) throw new Error('Sync conflicts need owner review in Sync issues. Orders show the accepted cloud version when available.'); if (!status.configured || status.lastError || status.pending > 0) throw new Error(status.lastError || 'Saved on this device. Connect and sync to share orders.') }} pay={async (order, payment) => {
        const access = await readPosAccess(authToken, user.organizationId)
        setPosAccess(access)
        if (access.blocked) throw new Error(access.reason)
        const paymentContext = await posRequest('/api/pos', authHeaders)
        const sale = recordPayment({ id: counterSaleId(order.id), organizationId: user.organizationId, businessName: order.businessName, currency: order.currency, branchId: activeBranchId, staffId: user.id, staffName: user.name, createdAt: new Date().toISOString(), syncStatus: 'pending' as const, total: order.total, items: counterItems(order), paymentMethod: payment.method, terminalProvider: payment.provider.trim(), paymentReference: payment.reference.trim(), paymentDetails: { ...(payment.method === 'wallet' ? { customerId: order.pos?.customerId || '' } : {}), amountReceived: payment.method === 'cash' ? payment.cash || order.total : order.total, ...(payment.method==='multiple'?{allocations:payment.allocations,cashReceived:payment.cash||undefined}:{}), pos: order.pos ? { ...order.pos, registerId: paymentContext.registers.find((session: { tillId?:string; closedAt?: string; staffId: string; id: string }) => !session.closedAt && session.staffId === user.id && (!session.tillId||session.tillId===checkoutTillId()))?.id } : undefined, counterOrder: { id: order.id, tillId: order.tillId, ...(order.retailOrder?{retailOrder:true}:{}), ...(order.diningOption?{diningOption:order.diningOption}:{}), ...(order.tableService ? { tableService: order.tableService } : {}) } } }, extraPaymentPolicy) as Sale
        const response = await fetch('/api/sales', { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(sale) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Order payment could not be saved.')
        const receipt = { ...sale, ...result }
        setReceiptHistory(current => [receipt, ...current.filter(row => row.id !== receipt.id)])
        setLastReceipt(receipt)
        await saveSale(receipt).catch(() => setReceiptError('Payment saved. Retry the receipt download if needed.'))
        await reloadPosStock()
        void syncQueuedOperations().catch(() => undefined)
        return receipt
      }} />}
      <ServicePayments requestId={paymentNavigation} requestedTab={paymentTab} access={user.role==='owner'?undefined:user.permissions||undefined} industry={shopProfile.industry} timeZone={shopProfile.reportingTimeZone||'UTC'} walletAllowed={extraPaymentPolicy.allowWallet} creditAllowed={extraPaymentPolicy.allowWalletCredit} owner={user.role==='owner'} providers={extraPaymentPolicy.providers} key={(active==='Settings'?'settings:':'payments:') + user.organizationId + ':' + user.id + ':' + activeBranchId} storageKey={'stockroom-service-draft:' + user.organizationId + ':' + user.id + ':' + activeBranchId} configuration={active==='Settings'} hidden={!(active==='Settings'&&settingsTab==='receipts'&&canManageDeviceSetup) && (active !== 'Payments' || !workspace.payments)} enabled={!posAccess.blocked && workspace.payments} customers={customers} receipts={allReceipts} headers={authHeaders} manager={['owner','admin'].includes(user.role)||Boolean(user.permissions&&Object.values(user.permissions).some(Boolean))} money={formatMoney} print={printReceipt} beforeSend={async () => { await syncQueuedOperations(); const response = await fetch('/api/sync/now', { method: 'POST', headers: authHeaders }); if (!response.ok) throw new Error('Synchronize the receipt before emailing it.') }} save={async draft => {
        const access = await readPosAccess(authToken, user.organizationId)
        setPosAccess(access)
        if (access.blocked) throw new Error(access.reason)
        const items = draft.lines.map(line => ({ productId: 'service:' + line.id, productName: line.description.trim(), quantity: Number(line.quantity), price: Number(line.price) }))
        const paymentContext=await posRequest('/api/pos',authHeaders)
        const tax = posSettings(draft.profile)
        const pos = { registerId:paymentContext.registers.find((session:{tillId?:string;closedAt?:string;staffId:string;id:string})=>!session.closedAt && session.staffId===user.id && (!session.tillId||session.tillId===checkoutTillId()))?.id, tax, pricing: priceOrder(items, { tax }), tillId: checkoutTillId() }
        const amount = pos.pricing.total
        const createdAt = new Date().toISOString()
        const sale = recordPayment({ id: draft.id, organizationId: user.organizationId, businessName: draft.profile.businessName || appName, currency, branchId: activeBranchId, staffId: user.id, staffName: user.name, createdAt, syncStatus: 'pending' as const, total: amount, items, paymentMethod: draft.method, terminalProvider: draft.provider.trim(), paymentReference: draft.reference.trim(), paymentDetails: { ...(draft.method === 'multiple' ? { allocations: draft.parts.map(part=>({...part,amount:Number(part.amount)})), cashReceived: draft.cash || undefined } : {}), ...(draft.method === 'wallet' ? { customerId: draft.customerId, creditApproved: draft.creditApproved } : {}), amountReceived: draft.method === 'cash' ? draft.cash || amount : amount, pos: { ...pos, ...(draft.method === 'wallet' ? {customerId:draft.customerId} : {}) }, receipt: { ...draft.profile, number: `REC-${createdAt.slice(0,10).replaceAll('-','')}-${draft.id}`, transactionType: draft.transactionType, cardType: draft.cardType }, servicePayment: { customerName: draft.name, customerPhone: draft.phone } } }, extraPaymentPolicy) as Sale
        const response = await fetch('/api/sales', { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(sale) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Payment could not be saved.')
        const receipt = { ...sale, ...result }
        setReceiptHistory(current => [receipt, ...current.filter(row => row.id !== receipt.id)])
        setLastReceipt(receipt)
        await saveSale(receipt).catch(() => setReceiptError('Payment saved. Its receipt remains available in payment history.'))
        void syncQueuedOperations().catch(() => undefined)
        return receipt
      }} />
      {productWorkspaceActive && !posAccess.blocked && productFlowMessage && <p className="product-flow-message" role="status">{productFlowMessage}<button type="button" className="text-button" onClick={()=>setProductFlowMessage('')} aria-label="Dismiss message"><X size={16}/></button></p>}
      {active==='POS' && !posAccess.blocked && <Suspense fallback={null}><WeighedCheckout key={user.organizationId+':'+activeBranchId} review={weighedReview} clearReview={()=>setWeighedReview(null)} businessId={user.organizationId} products={products} disabled={terminalLocked||posStage==='payment'} add={(product,quantity)=>{if(terminalLocked||posStage==='payment')throw new Error('Return to the basket before adding measured goods.');const current=products.find(row=>row.id===product.id);if(!current)throw new Error('This product is no longer available. Refresh stock.');const used=pos.catalogue.filter(row=>(row.baseProductId||row.id)===current.id).reduce((sum,row)=>sum+(cart[row.id]||0)*(row.saleFactor||1),0);if(Math.round((used+quantity)*1000)>Math.round(current.stock*1000))throw new Error('The measured quantity exceeds available stock.');if(!Object.keys(cart).length)setCurrentOrderId(crypto.randomUUID());setCart(previous=>({...previous,[current.id]:Math.round(((previous[current.id]||0)+quantity)*1000)/1000}));pos.setError('')}}/></Suspense>}
      {productWorkspaceActive && !posAccess.blocked && <><nav className="pos-flow-steps" aria-label="Sale steps">{([{id:'items',label:'Products'},{id:'basket',label:'Basket'},{id:'payment',label:'Payment'}] as const).map((step,index)=><button type="button" key={step.id} className={posStage===step.id?'active':index<(['items','basket','payment'] as const).indexOf(posStage)?'complete':''} aria-current={posStage===step.id?'step':undefined} disabled={index>0&&!cartProducts.length||index===2&&Boolean(pos.pricingError)} onClick={()=>setPosStage(step.id)}><span>{index+1}</span>{step.label}</button>)}</nav><section className={`pos-layout pos-stage-${posStage}${posStage==='items'&&cartProducts.length?' pos-has-cart-preview':''}`} style={{'--pos-catalogue-share':`${posCatalogueShare}fr`,'--pos-basket-share':`${100-posCatalogueShare}fr`} as React.CSSProperties}><div className="pos-catalog-slot"><PosCatalog products={pos.catalogue} matches={posCatalogueMatches} query={query} setQuery={value=>{setQuery(value);setScannedProductSuggestion(null)}} cart={cart} options={pos.data.products} add={addToCart} scan={() => { void scanBarcode() }} scanKey={scannerSettings().suffix} acceptBarcode={acceptBarcode} money={formatMoney} oilMode={active === 'Oil'} canAddProduct={canManageInventory} onlineSuggestion={scannedProductSuggestion?.barcode===query.trim()?scannedProductSuggestion.name:''} addMissing={draft=>{const suggestion=scannedProductSuggestion?.barcode===draft.barcode?scannedProductSuggestion:null;openAddProduct(suggestion?{...draft,...suggestion}:draft,suggestion?`Open Food Facts suggests ${suggestion.name}. Confirm the exact product and pack, then enter your price and stock.`:'')}} /></div><div className="pos-split-divider" role="separator" aria-label="Resize products and basket panels" aria-orientation="vertical" aria-valuemin={35} aria-valuemax={78} aria-valuenow={Math.round(posCatalogueShare)} tabIndex={0} title="Drag to resize products and basket" onPointerDown={event=>event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={event=>{if(!event.currentTarget.hasPointerCapture(event.pointerId))return;const parent=event.currentTarget.parentElement!;const bounds=parent.getBoundingClientRect();const gap=parseFloat(getComputedStyle(parent).columnGap)||20;const usable=bounds.width-gap*2-14;const next=Math.min(78,Math.max(35,Math.round((event.clientX-bounds.left-gap-7)/usable*100)));setPosCatalogueShare(next);localStorage.setItem("stockroom-pos-catalogue-share",String(next))}} onKeyDown={event=>{if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();const next=Math.min(78,Math.max(35,posCatalogueShare+(event.key==="ArrowRight"?3:-3)));setPosCatalogueShare(next);localStorage.setItem("stockroom-pos-catalogue-share",String(next))}}}/>{posStage==='items'&&cartProducts.length>0&&<aside className="pos-basket-preview" aria-label="Current basket"><div className="pos-basket-preview-heading"><div><strong>In this sale</strong><span>{cartProducts.reduce((count,product)=>count+cart[product.id],0)} items ? {formatMoney(cartTotal)}</span></div><ShoppingCart size={19}/></div><ul>{cartProducts.slice(0,4).map(product=><li key={product.id}><span>{product.name}<small>? {cart[product.id]}</small></span><strong>{formatMoney(product.price*cart[product.id])}</strong></li>)}</ul>{cartProducts.length>4&&<p className="pos-basket-preview-more">+ {cartProducts.length-4} more items</p>}<button type="button" className="primary-button" onClick={()=>setPosStage('basket')}>Review basket</button></aside>}<div className="panel cart-panel" id="pos-checkout" tabIndex={-1}><div className="panel-heading"><div><h2>{active === 'Oil' ? 'Oil order' : 'Basket'}</h2><p>{cartProducts.reduce((count, product) => count + cart[product.id], 0)} {active === 'Oil' ? 'items in this order' : 'items in this sale'}</p></div><button type="button" className="text-button" onClick={()=>setPosStage('items')}><ArrowLeft size={16}/>Products</button></div><div className="pos-total-due"><span>Total due</span><strong>{formatMoney(cartTotal)}</strong></div><div className="pos-cart-items">{cartProducts.length === 0 ? <div className="empty-state">Scan or select a product to begin.</div> : cartProducts.map((product) => <div key={product.id}><CartItem key={product.id} product={product} quantity={cart[product.id]} money={formatMoney} onChange={quantity => setCartQuantity(product.id, quantity)} onVoid={quantity => { void voidCartItem(product, quantity) }} />{user.role !== 'cashier' && <AsyncButton className="text-button" busyLabel="Updating price..." onClick={() => changeLinePrice(product)}>Change sale price</AsyncButton>}</div>)}</div>{cartProducts.length > 0 && <div className="pos-adjustments"><details className="transaction-options" open={Boolean(pos.customerId || Number(pos.discountValue) || pos.note)}><summary>Customer, discount and note (optional)</summary><label>Customer (optional)<select disabled={terminalLocked} value={pos.customerId} onChange={event => { pos.setCustomerId(event.target.value); pos.setLoyaltyRedeemed('0') }}><option value="">Walk-in customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>{pos.data.settings.loyaltyEnabled && pos.customerId && <label>Spend rewards (available: {formatMoney(Math.max(0, pos.data.loyaltyBalances[pos.customerId] || 0))})<input type="number" min="0" step="0.01" max={Math.max(0, pos.data.loyaltyBalances[pos.customerId] || 0)} disabled={terminalLocked} value={pos.loyaltyRedeemed} onChange={event => pos.setLoyaltyRedeemed(event.target.value)} /></label>}{user.role !== 'cashier' && <><label>Discount<select disabled={terminalLocked} value={pos.discountType} onChange={event => pos.setDiscountType(event.target.value)}><option value="amount">Fixed amount</option><option value="percent">Percentage</option></select></label><label>Discount value<input type="number" min="0" max={pos.discountType === 'percent' ? 100 : undefined} step="0.01" disabled={terminalLocked} value={pos.discountValue} onChange={event => pos.setDiscountValue(event.target.value)} /></label></>}<label>Order note<input value={pos.note} maxLength={500} onChange={event => pos.setNote(event.target.value)} /></label></details><p>Subtotal: {formatMoney(pos.pricing.subtotal)}{pos.pricing.discount > 0 && ` - discount ${formatMoney(pos.pricing.discount)}`}{pos.data.settings.taxEnabled && ` / ${pos.data.settings.taxLabel} ${formatMoney(pos.pricing.tax)} (${pos.data.settings.taxIncluded ? 'included' : 'added'})`}</p>{pos.pricingError && <p role="alert">{pos.pricingError}</p>}<div className="report-actions"><AsyncButton className="filter-button" busyLabel="Saving basket..." onClick={holdBasket}>Hold sale</AsyncButton><button type="button" className="text-button" onClick={() => { if (terminalLocked) { window.alert('Resolve the Paystack payment before clearing this basket.'); return } if (window.confirm('Clear this unpaid basket?')) pos.clear() }}>Clear basket</button></div></div>}{cartProducts.length > 0 && <button type="button" className="filter-button print-order-button" onClick={() => { void printCurrentOrder().catch(error => window.alert(error instanceof Error ? error.message : "Could not print the order.")) }}><Printer size={16} />Print order for customer</button>}<button type="button" className="primary-button pos-pay-button" hidden={posStage === 'payment'} disabled={!cartProducts.length || Boolean(pos.pricingError)} onClick={() => { setPosStage('payment'); requestAnimationFrame(() => document.getElementById('pos-payment')?.focus()) }}>Continue to payment ? {formatMoney(cartTotal)}</button></div><div className="panel pos-payment-panel" id="pos-payment" tabIndex={-1} hidden={posStage !== 'payment'}><div className="panel-heading"><div><h2>Take payment</h2><strong className="payment-due">{formatMoney(cartTotal)}</strong></div><button type="button" className="text-button" onClick={() => setPosStage('basket')}>Back to basket</button></div><div className="payment-options"><PaymentMethodPicker value={paymentMethod} walletEnabled={extraPaymentPolicy.allowWallet} disabled={terminalLocked} onChange={method=>{setPaymentMethod(method);setCashReceived('');setPaymentReference('');setExtraKept('0');setExtraReason('');setExtraNote('');setShowExtraPayment(false)}} />{paymentMethod === 'wallet' && <><label>Customer wallet<select value={walletCustomerId} onChange={e => {setWalletCustomerId(e.target.value);pos.setCustomerId(e.target.value)}}><option value="">Select customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name} — {customer.balance < 0 ? 'Owes ' + formatMoney(-customer.balance) : formatMoney(customer.balance) + ' available'}</option>)}</select></label>{walletCustomer && <p>After purchase: {walletCustomer.balance - cartTotal < 0 ? 'Owes ' + formatMoney(cartTotal - walletCustomer.balance) : formatMoney(walletCustomer.balance - cartTotal) + ' available'}</p>}{walletCustomer && walletCustomer.balance < cartTotal && (extraPaymentPolicy.allowWalletCredit && user.role === 'owner' ? <label className="checkbox-label"><input type="checkbox" checked={walletCreditApproved} onChange={e => setWalletCreditApproved(e.target.checked)} />I approve this purchase on credit</label> : <p role="status">Insufficient prepaid balance. An owner must approve credit when enabled.</p>)}</>}{paymentMethod === 'cash' && <><label>Cash received<input type="number" inputMode="decimal" min="0" step="0.01" value={cashReceived} onChange={event => setCashReceived(event.target.value)} placeholder="Amount received" /></label><p role="status">{cashError || `Change to give: ${formatMoney(changeDue)}`}</p></>}{paymentMethod === 'external-pos' && <label className="checkbox-label"><input type="checkbox" checked={usePaystack} disabled={terminalPayment?.status !== undefined && terminalPayment.status !== 'not-started'} onChange={event => setUsePaystack(event.target.checked)} />Use connected Paystack POS</label>}{paymentMethod === 'external-pos' && usePaystack && <PaystackTerminalPayment orderId={currentOrderId} amount={cartTotal} currency={currency} branchId={activeBranchId} headers={authHeaders} onStatus={setTerminalPayment} />}{paymentMethod === 'external-pos' && !usePaystack && <>{!manualTerminalAllowed && <p className="settings-message">Terminal unavailable.</p>}<PosProviderSelect providers={extraPaymentPolicy.providers} value={terminalProvider} onChange={setTerminalProvider} disabled={terminalLocked} /><label>POS receipt reference (required)<input required onKeyDown={event => { if (event.key === scannerSettings().suffix) { event.preventDefault(); acceptPaymentReference(event.currentTarget.value) } }} placeholder="Approval/reference number" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></label><button type="button" className="filter-button" onClick={() => scanBarcode('payment')}>Scan reference</button><small>Verify terminal approval and amount.</small><ReceiptPhoto total={cartTotal} onReference={setPaymentReference} /></>}{paymentMethod !== 'wallet' && !(paymentMethod === 'external-pos' && usePaystack) && extraPaymentPolicy.allowExtras && <><button type="button" className="text-button payment-extra-toggle" aria-expanded={showExtraPayment} onClick={()=>setShowExtraPayment(value=>!value)}>{showExtraPayment?'Hide extra amount':'Add extra amount'}</button>{showExtraPayment&&<><label>Extra amount retained<input type="number" inputMode="decimal" min="0" step="0.01" value={extraKept} onChange={event => setExtraKept(event.target.value)} /></label>{Number(extraKept || 0) > 0 && <><label>Reason<select value={extraReason} onChange={event => setExtraReason(event.target.value)}><option value="">Select a reason</option>{extraPaymentPolicy.reasons.map(reason => <option key={reason} value={reason}>{reason === 'tip' ? 'Voluntary tip' : reason === 'rounding' ? 'Agreed rounding' : reason === 'donation' ? 'Voluntary donation' : 'Other'}</option>)}</select></label>{extraReason === 'other' && <label>Explanation<input maxLength={500} value={extraNote} onChange={event => setExtraNote(event.target.value)} required /></label>}</>}</>}</>}</div>{paymentMethod === 'bank-transfer' && <div className="payment-options"><label>Bank Transfer provider (required)<input required value={transferProvider} onChange={event => setTransferProvider(event.target.value)} placeholder="e.g. Bank name" /></label><label>Transfer reference (required)<input required value={transferReference} onChange={event => setTransferReference(event.target.value)} placeholder="Approved transfer reference" /></label><label>Amount received by transfer<input type="number" inputMode="decimal" min="0" step="0.01" value={transferAmountReceived} onChange={event => { setTransferAmountReceived(event.target.value); setTransferOverpayment(''); setExtraKept('0'); setExtraReason(''); setExtraNote('') }} placeholder={String(cartTotal)} /></label>{Number(transferAmountReceived) > cartTotal && <><label>Transfer overpayment<select value={transferOverpayment} onChange={event => { const choice = event.target.value as 'returned' | 'retained' | ''; setTransferOverpayment(choice); setExtraKept(choice === 'retained' ? String(Math.round((Number(transferAmountReceived) - cartTotal) * 100) / 100) : '0'); setExtraReason(''); setExtraNote('') }}><option value="">Select how it was handled</option><option value="returned">Returned to customer</option>{extraPaymentPolicy.allowExtras && <option value="retained">Retained under owner rules</option>}</select></label>{transferOverpayment === 'retained' && <><label>Reason<select value={extraReason} onChange={event => setExtraReason(event.target.value)}><option value="">Select a reason</option>{extraPaymentPolicy.reasons.map(reason => <option key={reason} value={reason}>{reason === 'tip' ? 'Voluntary tip' : reason === 'rounding' ? 'Agreed rounding' : reason === 'donation' ? 'Voluntary donation' : 'Other'}</option>)}</select></label>{extraReason === 'other' && <label>Explanation<input maxLength={500} value={extraNote} onChange={event => setExtraNote(event.target.value)} required /></label>}</>}</>}<small>Confirm transfer status and amount.</small></div>}{paymentMethod === 'multiple' && <div className="payment-options"><WorkspaceHelp title="Workspace help"><p>Split amounts must add up to the sale total exactly. Cash change and retained extras are not available on split sales.</p></WorkspaceHelp><label>Cash portion<input type="number" min="0" step="0.01" value={splitCash} onChange={event => setSplitCash(event.target.value)} /></label><label>POS portion<input type="number" min="0" step="0.01" value={splitTerminal} onChange={event => setSplitTerminal(event.target.value)} /></label>{Number(splitTerminal) > 0 && <><PosProviderSelect providers={extraPaymentPolicy.providers} value={terminalProvider} onChange={setTerminalProvider} disabled={terminalLocked} /><label>POS receipt reference (required)<input required value={splitTerminalReference} onChange={event => setSplitTerminalReference(event.target.value)} /></label></>}<label>Bank-transfer portion<input type="number" min="0" step="0.01" value={splitTransfer} onChange={event => setSplitTransfer(event.target.value)} /></label>{Number(splitTransfer) > 0 && <><label>Bank Transfer provider (required)<input required value={transferProvider} onChange={event => setTransferProvider(event.target.value)} /></label><label>Transfer reference (required)<input required value={transferReference} onChange={event => setTransferReference(event.target.value)} /></label></>}<p role="status">Split total: {formatMoney(Number(splitCash || 0) + Number(splitTerminal || 0) + Number(splitTransfer || 0))} / {formatMoney(cartTotal)}</p></div>}<AsyncButton busyLabel="Completing sale..." className="primary-button checkout-button" disabled={!cartProducts.length || Boolean(pos.pricingError) || (paymentMethod === 'external-pos' && usePaystack && (!terminalPayment?.paid || terminalPayment.amount !== cartTotal || terminalPayment.currency !== currency)) || (paymentMethod === 'cash' && Boolean(cashError)) || (paymentMethod === 'external-pos' && !usePaystack && !manualTerminalAllowed) || missingPaymentReferences} onClick={completeSale}>Complete sale</AsyncButton></div></section></>}

      {active === 'Inventory' && section==='expiry' && hasPermission(user,'inventory') && <SupermarketStock headers={authHeaders} products={products} branchId={activeBranchId} refresh={reloadPosStock} money={formatMoney} />}
      {active==='Inventory' && section==='pricing' && workspace.stock && (canManageDeviceSetup||hasPermission(user,'inventory')) && <OilPricing oil={workspace.oil} headers={authHeaders} products={products} customers={customers} storageKey={'oil-pricing:'+user.organizationId+':'+activeBranchId} refresh={pos.reload}/>}
      {active === 'Inventory' && hasPermission(user,'purchasing') && <div hidden={section!=='purchasing'}><Purchasing businessId={user.organizationId} headers={authHeaders} products={products} branchId={activeBranchId} refresh={reloadPosStock} oil={workspace.oil} /></div>}
      {active==='Inventory'&& section==='starters' &&hasPermission(user,'inventory')&&<CatalogueStarters industry={shopProfile.industry} existing={products} save={items=>saveOnboardingStarters(workspace.oil?'Oil':'POS',shopProfile.industry,items)} openProducts={()=>chooseSection('products')}/>}
      {active === 'Inventory' && hasPermission(user,'inventory') && <div hidden={!['import','import-csv','import-review'].includes(section)}><ProductIntake businessId={user.organizationId} lookupApiUrl={subscriptionApiUrl} openProduct={openAddProduct} shopProfile={shopProfile} catalogueWorkspace={workspace.productSales?'product-sales':workspace.oil?'oil-sales':workspace.fastFood?'order-counter':'tables-tabs'} create={importProduct} products={products} defaultUnit={defaultUnit} scan={() => scanBarcode('intake')} screen={section === 'import' ? 'import-csv' : section} navigate={chooseSection} compact /></div>}
      {active === 'Inventory' && section==='handwritten' && user.role === 'owner' && <HandwrittenProductForm shopProfile={shopProfile} apiUrl={subscriptionApiUrl} token={cloudAccessToken} onToken={(token, refresh) => { setCloudAccessToken(token); localStorage.setItem('stockroom-cloud-access-token', token); localStorage.setItem('stockroom-cloud-refresh-token', refresh) }} products={products} create={importProduct} />}
      {active === 'Subscription' && user.role !== 'owner' && <EmptyScreen title="Business subscription" description="Ask your business owner to renew the subscription." />}
      {active === 'Subscription' && user.role === 'owner' && <SubscriptionSettings apiUrl={subscriptionApiUrl} token={cloudAccessToken} localToken={authToken} onFinalExit={logout} onAccess={setPosAccess} onToken={(nextToken, refreshToken) => { setCloudAccessToken(nextToken); localStorage.setItem('stockroom-cloud-access-token', nextToken); localStorage.setItem('stockroom-cloud-refresh-token', refreshToken) }} signInToCloud={signInToCloud} />}
      {active === 'Account' && user.role === 'owner' && <AccountDeletionPanel apiUrl={subscriptionApiUrl} token={cloudAccessToken} role={user.role} onToken={(nextToken, refreshToken) => { setCloudAccessToken(nextToken); localStorage.setItem('stockroom-cloud-access-token', nextToken); localStorage.setItem('stockroom-cloud-refresh-token', refreshToken) }} />}
      {active === 'Settings' && canManageDeviceSetup && <nav className="shop-steps" aria-label="Business settings sections">{[...(user.role==='owner'?[{id:'business',label:'Business'},{id:'shop',label:'Workspaces'},{id:'sales',label:'Sales'}]:[]),{id:'receipts',label:'Receipts'},{id:'devices',label:'Devices'},...(workspace.fastFood?[{id:'food',label:'Food menu & recipes'}]:[]),...(workspace.restaurant?[{id:'restaurant',label:'Restaurant menu & tables'}]:[])].map(tab=><button type="button" key={tab.id} className={settingsTab===tab.id?'primary-button':'filter-button'} aria-pressed={settingsTab===tab.id} onClick={()=>setSettingsTab(tab.id as typeof settingsTab)}>{tab.label}</button>)}</nav>}

      {window.stockroomDesktop && (workspace.fastFood || workspace.restaurant) && <SharedPreparationPrinter headers={authHeaders} scope={user.organizationId+':'+activeBranchId} owner={user.role==='owner'} configure={active==='Device'||(active==='Settings'&&settingsTab==='devices')} apiUrl={subscriptionApiUrl} token={cloudAccessToken} onToken={(next,refresh)=>{setCloudAccessToken(next);localStorage.setItem('stockroom-cloud-access-token',next);localStorage.setItem('stockroom-cloud-refresh-token',refresh)}} print={printPreparationTicket} />}
      {active === 'Settings' && user.role === 'owner' && settingsTab === 'business' && section==='backup' && window.stockroomDesktop && <BusinessBackup headers={authHeaders} />}
      {active === 'Settings' && user.role === 'owner' && settingsTab === 'business' && section==='branches' && <section className="panel full-panel"><div className="panel-heading"><div><h2>Shop branches</h2><WorkspaceHelp><p>Products and prices are shared. Stock, sales, stock movements, and reports follow the selected branch.</p></WorkspaceHelp></div><Store size={20} /></div><div className="branch-list">{branches.map(branch => <div className="branch-row" key={branch.id}><strong>{branch.name}{branch.isDefault && <small>Default</small>}{branch.isActive === false && <small>Inactive</small>}</strong><span>{branch.address || 'No address added'}</span><button type="button" className="text-button" onClick={() => void saveBranch(branch)}>Edit details</button><button type="button" className="text-button" onClick={() => void configureBranchStaff(branch)}>Staff access</button>{!branch.isDefault && <button type="button" className="text-button" onClick={() => void saveBranch(branch, branch.isActive === false)}>{branch.isActive === false ? 'Reactivate' : 'Deactivate'}</button>}<button type="button" className="text-button" disabled={branch.isActive === false} onClick={() => setActiveBranchId(branch.id)}>Open branch</button></div>)}</div><form className="settings-form branch-create-form" onSubmit={addBranch}><h3>Add branch</h3><label>Branch name<input value={newBranchName} maxLength={100} onChange={event => setNewBranchName(event.target.value)} placeholder="e.g. Airport Road Shop" required /></label><label>Address<input value={newBranchAddress} maxLength={250} onChange={event => setNewBranchAddress(event.target.value)} placeholder="Optional street or area" /></label><button className="primary-button" type="submit"><Plus size={17} />Add branch</button>{settingsMessage && <p className="settings-message">{settingsMessage}</p>}</form></section>}
      {active === 'Settings' && user.role === 'owner' && settingsTab === 'shop' && <ShopSetup value={shopProfile} save={saveShopProfile} openWorkspace={screen => setActive(screen)} businessName={appName} currency={currency} />}
      {active === 'Display' && <CustomerDisplayPairing pairing={displayPairing} createPairing={createDisplayPairing} openSecondMonitor={openCustomerDisplayOnSecondMonitor} prompt={requestInlinePrompt} />}
      {(active === 'POS' || active === 'Display') && displayError && <div role="alert" className="auth-error">{displayError}<button className="filter-button" onClick={() => setDisplayRetry(value => value + 1)}>Retry display update</button></div>}
      {receiptError && <p role="alert" className="auth-error">{receiptError}</p>}
      {(productWorkspaceActive || active === 'Sales') && <>{pos.error && <p role="alert">{pos.error}</p>}{productWorkspaceActive && pos.data.baskets.length > 0 && <section className="panel full-panel"><h2>Held sales</h2>{pos.data.baskets.map(basket => <div className="customer-row" key={basket.id}><span>{basket.label} / {basket.staffName}</span><AsyncButton className="filter-button" busyLabel="Restoring basket..." onClick={() => { if (terminalLocked) throw new Error('Resolve the Paystack payment first.'); return pos.resume(basket) }}>Resume sale</AsyncButton></div>)}</section>}{active==='Sales' && section==='returns' && <PosTools mode="history" stockEnabled={workspace.stock} data={pos.data} headers={authHeaders} reload={pos.reload} user={user} branches={branches} products={products} customers={customers} sales={allReceipts} money={formatMoney} restored={reloadPosStock} />}</>}
      {active === 'Sales' && section==='sales-receipt-history' && <details open id="sales-receipt-history" className="panel full-panel"><summary>Receipt history</summary><p>Find and reprint previous receipts.</p>{allReceipts.length ? allReceipts.map(receipt => <div className="customer-row" key={receipt.id}><div><strong>{new Date(receipt.createdAt).toLocaleString()}</strong><small>{receipt.id} ? {receipt.paymentReference || receipt.paymentMethod}</small></div><AsyncButton className="filter-button" busyLabel="Printing..." onClick={() => printReceipt(receipt)}>Reprint receipt</AsyncButton><DigitalReceipt sale={receipt} headers={authHeaders} beforeSend={async () => { await syncQueuedOperations(); const response = await fetch('/api/sync/now', { method: 'POST', headers: authHeaders }); if (!response.ok) throw new Error('Synchronize the receipt before emailing it.') }} /></div>) : <EmptyScreen title="No receipts yet" description="Complete a sale or record a payment. Saved receipts will appear here for viewing, sharing and reprinting." />}</details>}
      {active === 'Sales' && section==='sales-reconciliation' && canManageOperations && <Reconciliation key={user.organizationId} sales={allReceipts} />}
      {active === 'Sales' && section==='sales-payment-evidence' && <PaymentEvidence sales={allReceipts} money={formatMoney} />}
      {active === 'Sales' && ['sales-history','sales-void-history'].includes(section) && <SalesHistory view={section} headers={authHeaders} timeZone={shopProfile.reportingTimeZone || 'UTC'} sales={sales} voids={saleVoids} money={formatMoney} />}
      {active === 'Movements' && <MovementHistory movements={movements} />}
      {active === 'Wallet' && section==='birthdays' && <BirthdayReminders customers={customers} timeZone={shopProfile.reportingTimeZone||'UTC'}/>}
      {active === 'Wallet' && section!=='birthdays' && <section className="wallet-grid"><div className="panel customer-wallet-panel"><div className="panel-heading"><div><h2>Customer accounts</h2><WorkspaceHelp title="Customer balances"><p>Positive balance is prepaid money. Amount owed is customer debt. Add a deposit or repayment, or record a withdrawal.</p></WorkspaceHelp></div>{section==='customers'&&<button className="primary-button" onClick={()=>chooseSection('new-customer')}><Plus size={16}/>Add customer</button>}</div>{section==='new-customer' && <AsyncForm className="form-grid" busyLabel="Adding customer..." onSubmit={addCustomer}><label>Customer name<input value={newCustomerName} onChange={(event) => setNewCustomerName(event.target.value)} required placeholder="Customer name" /></label><label>Phone number<input value={newCustomerPhone} onChange={(event) => setNewCustomerPhone(event.target.value)} placeholder="Optional" /></label><div className="product-search-actions"><button type="button" className="filter-button" onClick={()=>{setNewCustomerName('');setNewCustomerPhone('');chooseSection('customers')}}>Cancel</button><SubmitButton className="primary-button" type="submit">Add customer</SubmitButton></div></AsyncForm>}{section==='customers' && <><div className="list-toolbar"><label>Find customer<input type="search" value={customerQuery} onChange={event=>setCustomerQuery(event.target.value)} placeholder="Name or phone"/></label><ListSort dates={false} value={customerOrder} change={setCustomerOrder}/></div>{customers.length ? customers.filter(customer=>[customer.name,customer.phone].join(' ').toLowerCase().includes(customerQuery.toLowerCase())).sort((a,b)=>customerOrder==='za'?b.name.localeCompare(a.name):a.name.localeCompare(b.name)).map(customer => <div key={customer.id}><CustomerBirthday customer={customer} headers={authHeaders} saved={updated=>setCustomers(current=>current.map(row=>row.id===updated.id?{...row,...updated}:row))}/><WalletCustomer customer={customer} money={formatMoney} adjust={adjustWallet} startOrder={(workspace.productSales || workspace.oil) && screenAllowedForUser(workspace.oil?'Oil':'POS',user)?()=>{pos.setCustomerId(customer.id);setActive(workspace.oil?'Oil':'POS');setPosStage('items')}:undefined} /><CustomerPortalAccess customer={customer} businessId={linkedBusinessId} localToken={authToken} apiUrl={subscriptionApiUrl} token={cloudAccessToken} onToken={(next, refresh) => { setCloudAccessToken(next); localStorage.setItem('stockroom-cloud-access-token', next); localStorage.setItem('stockroom-cloud-refresh-token', refresh) }} /></div>) : <EmptyScreen title="No customers yet" description="Add a customer to keep their contact details, prepaid balance and payment history here." action={<button className="primary-button" onClick={()=>chooseSection('new-customer')}>Add customer</button>} />}</>}</div></section>}
      {active === 'Owner' && <OwnerDashboard token={authToken} currency={currency} />}
      {active==='Register' && <PosTools mode="register" stockEnabled={workspace.stock} data={pos.data} headers={authHeaders} reload={pos.reload} user={user} branches={branches} products={products} customers={customers} sales={allReceipts} money={formatMoney} restored={reloadPosStock} />}
      {((active==='Settings'&&settingsTab==='sales'&&user.role==='owner')||(active==='Inventory'&&section==='options'&&canManageDeviceSetup)) && <PosTools mode={active==='Inventory'?'products':'settings'} stockEnabled={workspace.stock} data={pos.data} headers={authHeaders} reload={pos.reload} user={user} branches={branches} products={products} customers={customers} sales={allReceipts} money={formatMoney} restored={reloadPosStock} />}
      {active === 'Reports' && section==='stock-report' && workspace.stock && <SupermarketReports headers={authHeaders} branchId={activeBranchId} money={formatMoney} revision={reports} oilMode={workspace.oil}/>}
      {active === 'Reports' && section!=='stock-report' && <ReportsDashboard view={section} reports={reports} currency={currency} expenses={expenses} exportCsv={exportSalesCsv} addExpense={addExpense} />}
      {active === 'Sync' && <SyncIssues conflicts={syncConflicts} resolveConflict={resolveConflict} navigate={screen=>setActive(screen)} headers={authHeaders} />}
      {active === 'Activity' && <StaffActivity timeZone={shopProfile.reportingTimeZone || 'UTC'} token={authToken} branchId={activeBranchId} currency={currency} />}
      {active === 'Team' && <>{section==='links' && ['owner', 'admin'].includes(user.role) && <BusinessSignInLink profile={shopProfile} businessId={linkedBusinessId} />}{['team-members','team-add-staff'].includes(section) && <TeamManagement profile={shopProfile} view={section} removeStaff={removeStaff} staff={staff} loaded={staffLoaded} addStaff={addStaff} updateStaffRole={updateStaffRole} setCashierAccess={setCashierAccess} canCreateStaff={user.role === 'owner'} message={settingsMessage || cloudSessionError} />}{section==='team-password-recovery' && user.role === 'owner' && <StaffPasswordReset staff={staff} resetStaffPassword={resetStaffPassword} />}</>}
      {(active==='Device'||active==='Settings'&&settingsTab==='devices') && canManageDeviceSetup && workspace.productSales && <Suspense fallback={<p>Loading weighing setup...</p>}><WeighingSetup key={user.organizationId} businessId={user.organizationId} products={products}/></Suspense>}
      {(active === 'Device' || (active==='Settings'&&settingsTab==='devices')) && canManageDeviceSetup && <section className="panel full-panel"><div className="panel-heading"><div><h2>Printers &amp; devices</h2><WorkspaceHelp><p>These settings apply only to this checkout device, not the whole business.</p></WorkspaceHelp></div><Printer size={20} /></div><DeviceSetup key={`${user.organizationId}-${deviceSetupKind || 'all'}`} businessId={user.organizationId} defaultProvider={posProvider} onTerminalSaved={() => setTerminalRevision(value => value + 1)} createPairing={createDisplayPairing} openSecondMonitor={openCustomerDisplayOnSecondMonitor} pairing={displayPairing} scan={() => scanBarcode('setup')} initialKind={deviceSetupKind} />{user.role === 'owner' && <TillRecovery businessId={user.organizationId} headers={authHeaders} apiUrl={subscriptionApiUrl} token={cloudAccessToken} onToken={(next, refresh) => { setCloudAccessToken(next); localStorage.setItem('stockroom-cloud-access-token', next); localStorage.setItem('stockroom-cloud-refresh-token', refresh) }} />}</section>}

      {active === 'Settings' && user.role === 'owner' && settingsTab === 'business' && section==='appearance' && <BrandAppearance profile={shopProfile} save={saveShopProfile} preview={color=>void applyLogoTheme(logoData,color)}/>}
      {active === 'Settings' && user.role === 'owner' && settingsTab === 'business' && section==='appearance' && <section className="panel full-panel logo-settings"><h3>Business logo</h3><WorkspaceHelp><p>PNG, JPEG, or WebP up to 1 MB. It syncs to enrolled devices when you save business settings.</p></WorkspaceHelp>{logoData && <img src={logoData} alt="Business logo preview" className="settings-logo-preview" />}<label className="logo-upload-control"><strong>Upload logo</strong><input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo} /></label></section>}

      {active === 'Settings' && user.role === 'owner' && settingsTab === 'business' && ['identity','payment-methods','password'].includes(section) && <section className="panel full-panel settings-panel"><div className="panel-heading"><div><h2>Business settings</h2><p>Customize the identity your team sees across the app.</p></div><Settings2 size={20} /></div>{section!=='password' && <AsyncForm className="settings-form" busyLabel="Saving settings..." onSubmit={saveAppName}>{section==='identity' && <><label>App name<input value={appName} maxLength={60} onChange={(event) => { setAppName(event.target.value); setSettingsMessage('') }} /></label><label>Currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="USD">USD - US Dollar</option><option value="NGN">NGN - Nigerian Naira</option><option value="GHS">GHS - Ghanaian Cedi</option><option value="KES">KES - Kenyan Shilling</option><option value="GBP">GBP - Pound Sterling</option><option value="EUR">EUR - Euro</option></select></label></>}{section==='payment-methods' && <PaymentPolicySettings profile={shopProfile} products={products} value={extraPaymentPolicy} onChange={(policy) => { setExtraPaymentPolicy(policy); setPosProvider(policy.providers[0] || ''); setSettingsMessage('') }} />}<SubmitButton className="primary-button">Save business settings <ArrowUpToLine size={17} /></SubmitButton>{settingsMessage && <p className="settings-message">{settingsMessage}</p>}</AsyncForm>}{section==='password' && !isBrowserPwa() && <AsyncForm className="settings-form" busyLabel="Updating password..." onSubmit={changePassword}><h3>Change password</h3><label>Current password<input name="currentPassword" type="password" placeholder="Current password" /></label><label>New password<input name="newPassword" type="password" placeholder="New password" /></label><label>Confirm password<input name="confirmPassword" type="password" placeholder="Confirm new password" /></label><SubmitButton className="primary-button" type="submit">Update password</SubmitButton>{passwordMessage && <p className="settings-message">{passwordMessage}</p>}</AsyncForm>}{section==='password' && isBrowserPwa() && <WorkspaceHelp title="Workspace help"><p className="settings-message">To reset your cloud password, log out and choose Forgot password on the sign-in screen.</p></WorkspaceHelp>}</section>}
      </Suspense></div><div className="project-copyright app-copyright">S. B. Ibhadode Technologies Copyright, 2026 | <a href="privacy.html">Privacy Policy</a> | <a href="terms.html">Terms and Conditions</a></div>
    </main>
    {detailsProduct && <div className="modal-backdrop"><AsyncForm className="modal" busyLabel="Saving details..." onSubmit={async event => {
      const response = await fetch('/api/products/' + encodeURIComponent(detailsProduct.id) + '/custom-values', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ customValues: collectCustomValues(new FormData(event.currentTarget)) }) })
      const saved = await response.json()
      if (!response.ok) throw new Error(saved.error || 'Could not save details.')
      setProducts(current => current.map(product => product.id === saved.id ? saved : product)); await upsertCachedProducts([saved]); setDetailsProduct(null)
    }}><div className="modal-head"><h2>{detailsProduct.name}</h2><button type="button" className="icon-button" onClick={() => setDetailsProduct(null)} aria-label="Close product details"><X size={19} /></button></div><p>SKU: {detailsProduct.sku}</p><ShopProductFields profile={shopProfile} customOnly values={detailsProduct.customValues} />
      {Object.entries(readCustomValues(detailsProduct.customValues)).some(([id, value]) => value && !shopProfile.fields.some(field => field.id === id && field.visible)) && <details><summary>Previously saved fields</summary>{Object.entries(readCustomValues(detailsProduct.customValues)).filter(([id, value]) => value && !shopProfile.fields.some(field => field.id === id && field.visible)).map(([id, value]) => <p key={id}><strong>{shopProfile.fields.find(field => field.id === id)?.label || id}:</strong> {value}</p>)}</details>}
      <SubmitButton className="primary-button">Save product details</SubmitButton></AsyncForm></div>}
    {inlinePrompt && <InlinePrompt request={inlinePrompt} onClose={closeInlinePrompt} />}
    {scanning && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="Scan barcode"><h2>Scan barcode</h2><video ref={cameraVideo} muted playsInline style={{ width: '100%' }} /><button className="primary-button" onClick={stopScan}>Cancel scan</button></section></div>}
    {orderToPrint && <OrderDocument order={orderToPrint} />}
    {lastReceipt && (productWorkspaceActive || active === 'Payments') && <button className="filter-button" onClick={() => { void printReceipt(lastReceipt).catch(error => window.alert(error.message)) }}>Print last receipt</button>}
    <datalist id="approved-payment-providers">{extraPaymentPolicy.providers.map(provider => <option key={provider} value={provider} />)}</datalist>
    {lastReceipt && <Suspense fallback={null}><Receipt sale={lastReceipt} fallbackName={appName} fallbackCurrency={currency} /></Suspense>}
  </div>
}

function ProductRow({ product, updateStock, money, detailed = false, onDetails }: { onDetails?: () => void; product: Product; updateStock: (id: string, amount: number) => void; money: (amount: number) => string; detailed?: boolean }) {
  const isLow = product.stock <= product.reorder
  return <tr className={`product-row${isLow ? ' product-row-low' : ''}`}><td><div className="product-cell"><div className="product-icon">{product.name.slice(0, 1)}</div><div><strong>{product.name}</strong>{onDetails && <button type="button" className="text-button" onClick={onDetails}>Product details</button>}{!detailed && <span>{product.sku}</span>}</div></div></td>{detailed && <td className="muted">{product.sku}</td>}<td className="muted">{product.category}</td><td><div className="stock-cell"><strong className={isLow ? 'low-stock' : ''}>{product.stock}</strong><span>{product.unit}</span></div></td>{detailed && <><td className="muted">{money(product.cost || 0)}</td><td className="muted">{money(product.price)}</td><td className={product.price >= (product.cost || 0) ? 'positive' : 'low-stock'}>{money(product.price - (product.cost || 0))}</td></>}<td className="muted">{product.updated}</td><td><div className="row-actions"><button className="stock-remove" onClick={() => updateStock(product.id, -1)} title="Remove one"><ArrowDownToLine size={15} /></button><button className="stock-add" onClick={() => updateStock(product.id, 1)} title="Add one"><ArrowUpToLine size={15} /></button></div></td></tr>
}

function LoginScreen({ onLogin, error, setError, onRegister }: { onRegister?: () => void; onLogin: (email: string, password: string) => Promise<void>; error: string; setError: (value: string) => void }) {
  const [showIntroduction, setShowIntroduction] = useState(() => { try { return localStorage.getItem('stockroom-introduction-v1') !== 'seen' } catch { return true } })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState<'login' | 'request' | 'confirm'>('login')
  const [resetCode, setResetCode] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    if (mode !== 'login') return
    const identityInput = document.querySelector<HTMLInputElement>('.login-card input[type="text"]') || document.querySelector<HTMLInputElement>('.login-card input[type="email"]')
    if (!identityInput) return
    identityInput.type = 'text'
    identityInput.placeholder = 'Owner email or staff username'
    identityInput.setAttribute('autocomplete', 'username')
  }, [mode])
  const resetView = () => { setError(''); setMessage('') }
  const returnToLogin = () => { resetView(); setMode('login') }

  if (showIntroduction) return <main className="login-screen"><AppIntroduction onContinue={() => { try { localStorage.setItem('stockroom-introduction-v1', 'seen') } catch { /* Continue when device storage is unavailable. */ } setShowIntroduction(false) }} /></main>

  if (mode === 'request') return <main className="login-screen"><AsyncForm busyLabel="Sending reset code..." className="login-card" onSubmit={async (event) => {
    event.preventDefault(); if (submitting) return; setSubmitting(true); resetView()
    try {
      const response = await fetch('/api/auth/password-reset/request', { method: 'POST', signal: AbortSignal.timeout(30_000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to request a reset email.')
      if (data.delivered !== true) throw new Error('No reset email was sent, and your password has not changed. If this is the ownerâ€™s correct email, ask the service administrator to check the Render log for this attempt.')
      setMessage(`The mail service accepted a reset email for ${email}. Check your inbox and spam folder. The code expires in 30 minutes. If it does not arrive, contact support to check email delivery.`)
      setMode('confirm')
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to request a reset email.') } finally { setSubmitting(false) }
  }}><div className="brand-mark"><Boxes size={21} /></div><h1>Reset your password</h1><WorkspaceHelp title="Workspace help"><p>Email recovery is for the owner account. Admins and cashiers should ask the owner to reset their password in Staff & access.</p></WorkspaceHelp><label>Owner email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@yourshop.com" /></label>{error && <div className="auth-error">{error}</div>}<SubmitButton className="primary-button login-button">Send reset code</SubmitButton><button type="button" className="text-button" onClick={returnToLogin}>Back to sign in</button><PublicLandingLink /></AsyncForm></main>

  if (mode === 'confirm') return <main className="login-screen"><AsyncForm busyLabel="Updating password..." className="login-card" onSubmit={async (event) => {
    event.preventDefault(); if (submitting) return; setSubmitting(true); resetView()
    try {
      const response = await fetch('/api/auth/password-reset/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: resetCode, password: resetPassword }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to reset the password.')
      setResetCode(''); setResetPassword(''); setMessage('Password updated. You can now sign in with your new password.'); setMode('login')
    } catch (confirmError) { setError(confirmError instanceof Error ? confirmError.message : 'Unable to reset the password.') } finally { setSubmitting(false) }
  }}><div className="brand-mark"><Boxes size={21} /></div><h1>Enter reset code</h1><p>{message || 'Use the reset code from your email, then choose a new password.'}</p><label>Reset code<input required value={resetCode} onChange={(event) => setResetCode(event.target.value)} autoComplete="one-time-code" placeholder="Code from your email" /></label><label>New password<input type="password" minLength={10} required value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} autoComplete="new-password" placeholder="At least 10 characters" /></label>{error && <div className="auth-error">{error}</div>}<SubmitButton className="primary-button login-button">Update password</SubmitButton><button type="button" className="text-button" onClick={() => { resetView(); setMode('request') }}>Use a different email</button><PublicLandingLink /></AsyncForm></main>

  return <main className="login-screen"><AsyncForm busyLabel="Signing in..." className="login-card" onSubmit={async (event) => { event.preventDefault(); setError(''); try { await onLogin(email, password) } catch (loginError) { setError(loginError instanceof Error ? loginError.message : 'Unable to sign in.') } }}><div className="brand-mark"><Boxes size={21} /></div><h1>Sign in to your shop</h1><button type="button" className="text-button" onClick={() => setShowIntroduction(true)}>Explore what Stockroom can do</button><WorkspaceHelp title="Workspace help"><p>Owners use their email. Admins and cashiers use the username shown in Team management.</p></WorkspaceHelp><label>Owner email or staff username<input type="text" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@yourshop.com or staffname" autoComplete="username" /></label><label>Password<div className="password-wrap"><input type={showPassword ? 'text' : 'password'} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" /><button type="button" className="icon-button password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label><button type="button" className="text-button forgot-password" onClick={() => { resetView(); setMode('request') }}>Forgot password?</button>{error && <div className="auth-error">{error}</div>}{message && <p className="settings-message">{message}</p>}<SubmitButton className="primary-button login-button">Sign in</SubmitButton>{onRegister && <button type="button" className="text-button" onClick={() => { setError(''); onRegister() }}>Register a new business</button>}<PublicLandingLink /></AsyncForm></main>
}

function RegistrationRequestScreen({ onContinue, onCancel }: { onContinue: (key: string, email: string) => void; onCancel: () => void }) {
  const [issued, setIssued] = useState<{ businessName: string; email: string; expiresAt: string } | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const referralCode = sessionStorage.getItem('stockroom-referral-code') || ''
  const requestKey = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (sending) return; setSending(true); setError(''); setIssued(null)
    const form = new FormData(event.currentTarget)
    const businessName = String(form.get('businessName') || '').trim()
    const email = String(form.get('email') || '').trim().toLowerCase()
    const code = String(form.get('referralCode') || '').trim()
    try {
      const response = await fetch('/api/auth/registration-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(65_000), body: JSON.stringify({ businessName, email, referralCode: code }) })
      const responseText = await response.text()
      let data: any = {}
      try { data = responseText ? JSON.parse(responseText) : {} } catch {
        throw new Error(response.ok ? 'The registration service returned an unreadable response. Please try again.' : `The registration service is temporarily unavailable (HTTP ${response.status}). Please try again shortly.`)
      }
      if (!response.ok) throw new Error(data.error || `Registration request failed (HTTP ${response.status}). Please try again.`)
      if (/^[a-f0-9]{32}$/.test(code)) sessionStorage.setItem('stockroom-referral-code', code)
      else sessionStorage.removeItem('stockroom-referral-code')
      setIssued(data)
    } catch (caught) {
      if (caught instanceof Error && (caught.name === 'AbortError' || caught.name === 'TimeoutError')) setError('The registration service did not respond in time. Check your connection and try again. If a key email arrives, you can still use that key.')
      else if (caught instanceof TypeError) setError('Stockroom could not connect to the registration service. Check your internet connection and try again. If this keeps happening, contact Stockroom support.')
      else setError(caught instanceof Error ? caught.message : 'Could not generate a registration key. Please try again.')
    }
    finally { setSending(false) }
  }
  return <main className="login-screen"><section className="login-card registration-card"><div className="brand-mark"><Boxes size={21} /></div><h1>Get your registration key</h1><WorkspaceHelp title="Registration help"><p>Enter your business name and owner email. We’ll email a key to continue setup.</p></WorkspaceHelp><form className="settings-form" onSubmit={requestKey}><label>Business name<input name="businessName" required maxLength={60} placeholder="My Business" /></label><label>Owner email<input name="email" type="email" required placeholder="you@example.com" /></label><label>Referral code (optional)<input name="referralCode" pattern="[a-f0-9]{32}" defaultValue={referralCode} /></label><button className="primary-button" type="submit" disabled={sending}>{sending ? 'Sending key…' : error ? 'Try again' : 'Email my registration key'}</button></form>{error && <div className="auth-error" role="alert"><strong>Email delivery needs attention</strong><p>{error}</p></div>}{issued && <div className="settings-message registration-success" role="status"><strong>Key sent to {issued.email}.</strong><p>Check your inbox and spam folder. It expires {new Date(issued.expiresAt).toLocaleString()}.</p><button type="button" className="primary-button" onClick={() => onContinue('', issued.email)}>Continue to setup</button></div>}<div className="auth-secondary-actions"><button type="button" className="text-button" onClick={() => onContinue('', '')}>I already have a key</button><button type="button" className="text-button" onClick={onCancel}>Back to sign in</button></div><PublicLandingLink /></section></main>
}

function SetupScreen({ onCreate, error, setError, keyRegistration = false, initialRegistrationKey = '', initialEmail = '', onCancel }: { keyRegistration?: boolean; initialRegistrationKey?: string; initialEmail?: string; onCancel?: () => void; onCreate: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; error: string; setError: (value: string) => void }) {
  const [step,setStep]=useState(0)
  const [review,setReview]=useState<Record<string,string>>({})
  const next=(event:React.MouseEvent<HTMLButtonElement>)=>{
    const form=event.currentTarget.closest('form')!
    const fields=form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-setup-step="'+step+'"] input, [data-setup-step="'+step+'"] select')
    for(const field of fields) if(!field.reportValidity()) return
    const data=new FormData(form)
    if(step===1&&keyRegistration&&data.get('password')!==data.get('confirmPassword')){setError('Passwords do not match.');return}
    setError('');setReview({business:String(data.get('shopName')||'Your registered business'),owner:String(data.get('ownerName')||''),email:String(data.get('email')||'')});setStep(step+1)
  }
  return <main className="login-screen"><AsyncForm busyLabel="Creating account..." className="login-card" onSubmit={async (event) => { event.preventDefault(); if(step<2) return; setError(''); try { await onCreate(event) } catch (loginError) { setError(loginError instanceof Error ? loginError.message : 'Unable to create your business account.') } }}><div className="brand-mark"><Boxes size={21} /></div><h1>{["Your business","Your owner account","Ready to begin"][step]}</h1><div className="setup-progress" aria-live="polite">Step {step+1} of 3</div><fieldset className="setup-fields" data-setup-step="0" hidden={step!==0}>{keyRegistration ? <label>Business registration key<input name="registrationKey" required autoComplete="off" defaultValue={initialRegistrationKey} placeholder="SBIT-?" /></label> : <label>Business name<input name="shopName" required placeholder="My Business" /></label>}<label htmlFor="setup-business-preset">Business type</label><select id="setup-business-preset" name="businessPreset" defaultValue="retail">{Object.entries(businessPresets).map(([key,preset])=><option key={key} value={key}>{preset.label}</option>)}</select><label>Owner name<input name="ownerName" required placeholder="John Doe" /></label></fieldset><fieldset className="setup-fields" data-setup-step="1" hidden={step!==1}><label>Email<input name="email" type="email" required defaultValue={keyRegistration ? initialEmail : undefined} placeholder="owner@yourshop.com" /></label><label>Password<div className="password-wrap"><input name="password" type="password" minLength={10} maxLength={256} required placeholder="Create a password" /><button type="button" className="icon-button password-toggle" aria-label="Show password" onClick={(event) => { const input = (event.currentTarget.parentElement?.querySelector('input') as HTMLInputElement | null); if (!input) return; const shouldShow = input.type === 'password'; input.type = shouldShow ? 'text' : 'password'; event.currentTarget.setAttribute('aria-label', shouldShow ? 'Hide password' : 'Show password'); }}><Eye size={16} /></button></div></label>{keyRegistration && <><label>Confirm password<input name="confirmPassword" type="password" required minLength={10} maxLength={256} autoComplete="new-password" /></label></>}</fieldset><fieldset className="setup-fields" data-setup-step="2" hidden={step!==2}><div className="setup-review"><strong>{review.business}</strong><p>{review.owner}<br/>{review.email}</p><WorkspaceHelp title="Workspace help"><p>Enter your business with an empty workspace. Add products or a menu, payment options and staff when you need them.</p></WorkspaceHelp></div>{keyRegistration && <><label>Business currency<select name="currency" defaultValue="NGN">{['NGN', 'USD', 'GHS', 'ZAR', 'KES', 'XOF'].map(code => <option key={code}>{code}</option>)}</select></label><label>Referral code (optional)<input name="referralCode" pattern="[a-f0-9]{32}" defaultValue={sessionStorage.getItem('stockroom-referral-code') || ''} /></label></>}</fieldset><WorkspaceHelp title="Account setup"><p className="settings-message">{keyRegistration ? 'The key identifies your business and owner email. Manage your plan and payments from Subscription after signing in.' : 'Your database is configured by the developer. After payment, the owner can change their password from Admin settings.'}</p></WorkspaceHelp><p className="settings-message"><a href="privacy.html">Privacy Policy</a> | <a href="terms.html">Terms and Conditions</a></p>{error && <div className="auth-error">{error}</div>}{step<2?<button type="button" className="primary-button login-button" onClick={next}>Continue</button>:<SubmitButton className="primary-button login-button">Create owner account</SubmitButton>}{step>0&&<button type="button" className="text-button" onClick={()=>{setError('');setStep(step-1)}}>Previous step</button>}{onCancel && <button type="button" className="text-button" onClick={onCancel}>Back to sign in / existing business</button>}<PublicLandingLink />{keyRegistration && sessionStorage.getItem('stockroom-referral-code') && <WorkspaceHelp title="Workspace help"><p className="settings-message">Your referral code stays saved in this tab when you return to the welcome page. You can finish business registration later or open a separate promoter account from there.</p></WorkspaceHelp>}</AsyncForm></main>
}

function OwnerDashboard({ token, currency }: { token: string; currency: string }) {
  const [metrics, setMetrics] = useState<{ salesToday: number; saleCount: number; inventoryValue: number; productCount: number; lowStock: number } | null>(null)
  useEffect(() => { fetch('/api/owner/metrics', { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.ok ? response.json() : Promise.reject()).then(setMetrics).catch(() => undefined) }, [token])
  const money = (amount: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  return <section className="owner-dashboard"><div className="metric-grid"><div className="metric-card"><span>Sales recorded</span><strong>{metrics ? money(metrics.salesToday) : '—'}</strong><small>Synced sales total</small></div><div className="metric-card"><span>Transactions</span><strong>{metrics?.saleCount ?? '—'}</strong><small>Completed receipts</small></div><div className="metric-card alert-card"><span>Low stock</span><strong>{metrics?.lowStock ?? '—'}</strong><small>Items needing attention</small></div></div><div className="panel owner-panel"><h2>Business monitoring</h2><p>Inventory value: <strong>{metrics ? money(metrics.inventoryValue) : '—'}</strong> across {metrics?.productCount ?? '—'} products.</p><p>Sales made offline are included after they synchronize.</p></div></section>
}

function RecordFilters({ query, setQuery, from, setFrom, to, setTo, placeholder = 'Search records' }: { query: string; setQuery: (value: string) => void; from: string; setFrom: (value: string) => void; to: string; setTo: (value: string) => void; placeholder?: string }) {
  return <div className="search-row record-filters"><div className="search-box"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={placeholder} /></div><label>From<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>{(query || from || to) && <button type="button" className="filter-button" onClick={() => { setQuery(''); setFrom(''); setTo('') }}>Clear filters</button>}</div>
}

function isInDateRange(value: string, from: string, to: string) {
  const date = value.slice(0, 10)
  return (!from || date >= from) && (!to || date <= to)
}

function SalesHistory({ view, headers, timeZone, sales, voids, money }: { view:string; headers: Record<string,string>; timeZone: string; sales: SaleRecord[]; voids: SaleItemVoid[]; money: (amount: number) => string }) {
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page,setPage]=useState(0),[historyOrder,setHistoryOrder]=useState('newest')
  const [result,setResult]=useState<{sales:SaleRecord[];total:number;pageSize:number}|null>(null)
  const [error,setError]=useState(''),[loading,setLoading]=useState(false)
  useEffect(()=>{setPage(0)},[query,from,to,historyOrder,headers['X-Stockroom-Branch']])
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('')
    const timer=setTimeout(()=>void fetch('/api/sales/history',{signal:controller.signal,headers:{...headers,'X-History-Query':encodeURIComponent(query),'X-History-From':from,'X-History-To':to,'X-History-Order':historyOrder,'X-History-Page':String(page)}}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load receipts.');setResult(data)}).catch(caught=>{if(!controller.signal.aborted)setError(caught.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)}),200)
    return ()=>{clearTimeout(timer);controller.abort()}
  },[query,from,to,page,historyOrder,headers.Authorization,headers['X-Stockroom-Branch'],timeZone,sales])
  const normalizedQuery = query.toLowerCase()
  const filtered = result?.sales || []
  const filteredVoids = voids.filter(item => [item.orderId, item.productName, item.staffName, item.reason].join(' ').toLowerCase().includes(normalizedQuery) && isInDateRange(businessDate(item.createdAt,timeZone), from, to))
  return <>{view==='sales-history' && <section id="sales-history" className="panel full-panel"><div className="panel-heading"><div><h2>Sales history</h2><WorkspaceHelp title="Finding a transaction"><p>Search sales and item voids by receipt, cashier, product, reason, payment reference, or date range. Dates use {timeZone}.</p></WorkspaceHelp></div></div>{error && <p role="alert">{error}</p>}{loading && <p role="status">Loading receipts...</p>}<RecordFilters query={query} setQuery={setQuery} from={from} setFrom={setFrom} to={to} setTo={setTo} placeholder="Search sales, voids, cashiers" /><label className="list-sort">Receipt order<select value={historyOrder} onChange={event=>setHistoryOrder(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label><div className="table-wrap"><table><thead><tr><th>Date</th><th>Items</th><th>Payment</th><th>Total</th></tr></thead><tbody>{filtered.length ? filtered.map(sale => <tr key={sale.id}><td>{new Date(sale.createdAt).toLocaleString()}<span className="table-subtext">{sale.staffName || sale.id}</span></td><td>{sale.items.map(item => item.quantity + ' x ' + item.productName).join(', ') || 'Legacy sale'}</td><td>{sale.paymentMethod}{sale.paymentReference ? ' | ' + sale.paymentReference : ''}</td><td>{money(sale.total)}</td></tr>) : <tr><td colSpan={4} className="empty-state">No sales match these filters.</td></tr>}</tbody></table></div><div className="report-actions"><button className="filter-button" disabled={loading || page===0} onClick={()=>setPage(value=>value-1)}>Previous receipts</button><span>{result?.total || 0} receipts; page {page+1}</span><button className="filter-button" disabled={loading || !result || (page+1)*result.pageSize>=result.total} onClick={()=>setPage(value=>value+1)}>Next receipts</button></div></section>}{view==='sales-void-history' && <section id="sales-void-history" className="panel full-panel"><div className="panel-heading"><div><h2>Voided order items</h2><WorkspaceHelp title="Workspace help"><p>Rejected items are recorded with the cashier, order, time, and required reason. Voids do not change stock or count as sales.</p></WorkspaceHelp></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Order</th><th>Item</th><th>Qty</th><th>Unit price</th><th>Cashier</th><th>Reason</th></tr></thead><tbody>{filteredVoids.length ? filteredVoids.map(item => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString()}</td><td title={item.orderId}>{item.orderId.slice(0, 8)}</td><td>{item.productName}</td><td>{item.quantity}</td><td>{money(item.unitPrice)}</td><td>{item.staffName || item.staffId}</td><td>{item.reason}</td></tr>) : <tr><td colSpan={7} className="empty-state">No voided items match these filters.</td></tr>}</tbody></table></div></section>}</>
}
function MovementHistory({ movements }: { movements: Movement[] }) {
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const filtered = movements.filter(movement => `${movement.productName} ${movement.sku} ${movement.reason} ${movement.quantity}`.toLowerCase().includes(query.toLowerCase()) && isInDateRange(movement.createdAt, from, to))
  if(!movements.length) return <EmptyScreen title="No stock movements yet" description="Sales, deliveries, transfers and stock adjustments will appear here after they are recorded." />
  return <section className="panel full-panel"><div className="panel-heading"><div><h2>Stock movements</h2><WorkspaceHelp title="Workspace help"><p>Every sale, adjustment, and approved stock-take is recorded here.</p></WorkspaceHelp></div></div><RecordFilters query={query} setQuery={setQuery} from={from} setFrom={setFrom} to={to} setTo={setTo} placeholder="Search product, SKU, reason" /><div className="table-wrap"><table><thead><tr><th>Date</th><th>Product</th><th>Change</th><th>Reason</th></tr></thead><tbody>{filtered.length ? filtered.map(movement => <tr key={movement.id}><td>{new Date(movement.createdAt).toLocaleString()}</td><td><strong>{movement.productName}</strong><span className="table-subtext">{movement.sku}</span></td><td className={movement.quantity < 0 ? 'low-stock' : 'positive'}>{movement.quantity > 0 ? '+' : ''}{movement.quantity}</td><td>{movement.reason}</td></tr>) : <tr><td colSpan={4} className="empty-state">No stock movements match these filters.</td></tr>}</tbody></table></div></section>
}

function businessIdFromAccessToken(token: string) {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).businessId || '' } catch { return '' }
}

function BusinessSignInLink({ businessId, profile }: { businessId: string; profile:ShopProfile }) {
  const workspace=businessWorkspace(profile)
  const goodsOrdering=workspace.productSales || workspace.oil
  const foodOrdering=workspace.fastFood || workspace.restaurant
  const base = import.meta.env.VITE_PUBLIC_APP_URL || 'https://stockroom.globalcreest.com/'
  const staffUrl = new URL('/', base); staffUrl.searchParams.set('business', businessId)
  const customerUrl = new URL('/', base); customerUrl.searchParams.set('customer', businessId)
  if(goodsOrdering && !foodOrdering) customerUrl.searchParams.set('catalog','retail')
  return <section className="panel full-panel"><div className="panel-heading"><div><h2>Business sign-in links</h2><WorkspaceHelp title="Sharing business links"><p>Share the customer link or QR code with customers. Share the staff link with team members.</p></WorkspaceHelp></div></div><label>Customer portal link<input aria-label="Customer portal URL" readOnly onFocus={event => event.currentTarget.select()} value={customerUrl.toString()} /></label><div className="customer-qr-sharing"><QrCode value={customerUrl.toString()} /><WorkspaceHelp title="Workspace help"><p>Scan to open this business’s customer portal. Share the ordering catalogue for enabled sales workspaces. Wallet customers can sign in with credentials you create in their customer account.</p></WorkspaceHelp></div>{goodsOrdering && foodOrdering && <><label>Product ordering link<input readOnly onFocus={event=>event.currentTarget.select()} value={customerUrl.toString()+'&catalog=retail'}/></label><div className="customer-qr-sharing"><QrCode value={customerUrl.toString()+'&catalog=retail'}/><WorkspaceHelp title="Workspace help"><p>Scan for the owner-selected retail catalogue. Enable online product orders and synchronize before sharing.</p></WorkspaceHelp></div></>}<label>Staff sign-in link<input aria-label="Business sign-in URL" readOnly onFocus={event => event.currentTarget.select()} value={staffUrl.toString()} /></label></section>
}

function CustomerPortalAccess({ customer, businessId, localToken, apiUrl, token, onToken }: { customer: Customer; businessId: string; localToken: string; apiUrl: string; token: string; onToken: (token: string, refresh: string) => void }) {
  const [username, setUsername] = useState((customer.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 22) || 'customer') + '.' + customer.id.replaceAll('-', '').slice(-4))
  const [password, setPassword] = useState('')
  const [created, setCreated] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setCreated(false)
    try {
      if (apiUrl === '/api/cloud') {
        const sync = await fetch('/api/sync/now', { method: 'POST', headers: { Authorization: `Bearer ${localToken}` } })
        if (!sync.ok) throw new Error('Could not sync this customer to the cloud. Connect this device and try again.')
      }
      const result = await cloudRequest(apiUrl, '/v1/customer-portal/accounts', { method: 'POST', body: JSON.stringify({ customerId: customer.id, username, password }) }, onToken, token)
      onToken(localStorage.getItem('stockroom-cloud-access-token') || token, localStorage.getItem('stockroom-cloud-refresh-token') || '')
      setUsername(result.username); setCreated(true)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create customer sign-in.') } finally { setBusy(false) }
  }
  const link = new URL('/', import.meta.env.VITE_PUBLIC_APP_URL || 'https://stockroom.globalcreest.com/'); link.searchParams.set('customer', businessId)
  return <details className="panel"><summary>Customer portal sign-in</summary><WorkspaceHelp title="Workspace help"><p>Create or reset this customer's sign-in. Give them the username, temporary password, and customer portal link.</p></WorkspaceHelp><form className="settings-form" onSubmit={create}><label>Username<input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}" value={username} onChange={event => setUsername(event.target.value)} /></label><label>Temporary password<input required minLength={10} maxLength={256} type="text" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label><button className="primary-button" disabled={busy || !token}>{busy ? 'Saving…' : 'Create / reset customer sign-in'}</button></form>{!token && <p role="status">Sign in to the cloud business account to create customer credentials.</p>}{error && <p role="alert">{error}</p>}{created && <div className="settings-message" role="status"><strong>Sign-in is ready for {customer.name}.</strong><p>Username: {username}<br />Password: {password}</p><p>Customer link: <a href={link.toString()}>{link.toString()}</a></p><button type="button" className="filter-button" onClick={() => { void navigator.clipboard?.writeText(`Customer link: ${link}\nUsername: ${username}\nPassword: ${password}`) }}>Copy sign-in details</button></div>}</details>
}

function TeamManagement({ profile, view, removeStaff, staff, loaded, addStaff, updateStaffRole, setCashierAccess, canCreateStaff, message }: { profile:ShopProfile; view:string; removeStaff: (id: string, password: string) => Promise<void>; staff: StaffUser[]; loaded: boolean; addStaff: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; updateStaffRole: (id: string, role: 'admin' | 'cashier', operationalAccess?: boolean) => Promise<void>; setCashierAccess: (id: string, permissions:Record<string,boolean>) => Promise<void>; canCreateStaff: boolean; message: string }) {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const formatCreatedDate = (value?: string) => {
    if (!value) return 'â€”'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return 'â€”'
    return parsed.toLocaleDateString()
  }
  return <section id="team-members" className="panel full-panel team-management"><div className="panel-heading"><div><h2>Staff &amp; access</h2><WorkspaceHelp title="Workspace help"><p>Staff sign in with the username shown below. Owners sign in with email. Choose access for each staff member below. New accounts have no operational access until you save their checkboxes.</p></WorkspaceHelp></div><UserRoundCog size={20} /></div><div className="team-grid">{view==='team-members' && <section><h3>Current team</h3><WorkspaceHelp title="Workspace help"><p>To grant access: find the staff member, open <strong>Choose staff access</strong> in the Access column, tick individual operations, then save.</p></WorkspaceHelp><div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Username</th><th>Role</th><th>Access</th><th>Created</th><th>Actions</th></tr></thead><tbody>{staff.length ? staff.map((member) => <tr key={member.id}><td><strong>{member.name}</strong></td><td>{member.email || '—'}</td><td>{member.role === 'owner' ? '—' : <strong>{member.username || 'Not assigned'}</strong>}</td><td>{member.role === 'owner' ? <span className={`role-badge ${member.role}`}>{member.role}</span> : <select value={member.role} onChange={(event) => { const nextRole = event.target.value as 'admin' | 'cashier'; if (nextRole !== member.role) void updateStaffRole(member.id, nextRole, nextRole === 'admin' ? true : false) }}><option value="admin">Admin</option><option value="cashier">Cashier</option></select>}</td><td>{member.role !== 'owner' ? <StaffPermissions key={member.id+JSON.stringify(member.permissions)} member={member} profile={profile} save={setCashierAccess}/> : 'Owner access'}</td><td>{formatCreatedDate(member.createdAt)}</td><td>{canCreateStaff && member.role !== 'owner' && <RemoveStaffButton member={member} onRemove={removeStaff} />}</td></tr>) : <tr><td colSpan={7} className="empty-state">Loading team accounts…</td></tr>}</tbody></table></div></section>}{view==='team-add-staff' && canCreateStaff && <AsyncForm id="team-add-staff" className="settings-form team-form" busyLabel="Creating account..." onSubmit={addStaff}><h3>Add team member</h3><label>Full name<input name="name" required maxLength={100} placeholder="e.g. Ada Okafor" /></label><label>Email address <span>Optional contact information; it cannot control this staff account.</span><input name="email" type="email" placeholder="ada@yourbusiness.com (optional)" /></label><label>Access role<select name="role" defaultValue="cashier"><option value="cashier">Cashier — owner-selected access</option><option value="admin">Admin — owner-selected access</option></select></label><label>Temporary password<div className="password-wrap"><input name="password" type={showPassword ? 'text' : 'password'} minLength={10} required autoComplete="new-password" placeholder="At least 10 characters" /><button type="button" className="icon-button password-toggle" onClick={() => setShowPassword(current => !current)} aria-label={showPassword ? 'Hide temporary password' : 'Show temporary password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label><label>Confirm temporary password<div className="password-wrap"><input name="passwordConfirmation" type={showConfirmation ? 'text' : 'password'} minLength={10} required autoComplete="new-password" placeholder="Re-enter temporary password" /><button type="button" className="icon-button password-toggle" onClick={() => setShowConfirmation(current => !current)} aria-label={showConfirmation ? 'Hide confirmation password' : 'Show confirmation password'}>{showConfirmation ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label><SubmitButton className="primary-button" type="submit">Create account <UserRoundCog size={17} /></SubmitButton></AsyncForm>}</div>{message && <p className="settings-message">{message}</p>}</section>
}

function StaffPasswordReset({ staff, resetStaffPassword }: { staff: StaffUser[]; resetStaffPassword: (member: StaffUser) => Promise<void> }) {
  const staffAccounts = staff.filter((member) => member.role === 'admin' || member.role === 'cashier')
  const [staffId, setStaffId] = useState('')
  useEffect(() => { if (!staffAccounts.some(member => member.id === staffId)) setStaffId(staffAccounts[0]?.id || '') }, [staffId, staffAccounts])
  if (!staffAccounts.length) return null
  return <section id="team-password-recovery" className="panel full-panel cashier-password-control"><div className="panel-heading"><div><h2>Staff password recovery</h2><WorkspaceHelp title="Workspace help"><p>Reset an admin or cashier password here. Staff email addresses are contact details; staff sign in with their username.</p></WorkspaceHelp></div></div><label>Staff member<select value={staffId} onChange={(event) => setStaffId(event.target.value)}>{staffAccounts.map((member) => <option key={member.id} value={member.id}>{member.name} (@{member.username || 'username unavailable'}) â€” {member.role}</option>)}</select></label><button type="button" className="primary-button" onClick={() => { const member = staffAccounts.find((item) => item.id === staffId); if (member) void resetStaffPassword(member) }}>Reset staff password</button></section>
}

function activityDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function activityDates(period: 'day' | 'week' | 'month', timeZone: string) {
  const end = new Date(businessDate(new Date(),timeZone)+'T12:00:00')
  const start = new Date(end)
  if (period === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  if (period === 'month') start.setDate(1)
  return { from: activityDate(start), to: activityDate(end) }
}

function StaffActivity({ timeZone, token, branchId, currency }: { timeZone:string; token: string; branchId: string; currency: string }) {
  const initial = activityDates('day',timeZone)
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'custom'>('day')
  const [fromDate, setFromDate] = useState(initial.from), [toDate, setToDate] = useState(initial.to)
  const [staffId, setStaffId] = useState('all')
  const [data, setData] = useState<{ staff: StaffActivitySummary[]; events: StaffActivityEvent[] } | null>(null)
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  const money = (amount: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  useEffect(() => { if (period !== 'custom') { const range = activityDates(period,timeZone); setFromDate(range.from); setToDate(range.to) } }, [period,timeZone])
  useEffect(() => {
    if (!token || !fromDate || !toDate || fromDate > toDate) return
    const from = new Date(businessDayStart(fromDate,timeZone)), to = new Date(businessDayStart(nextBusinessDate(toDate),timeZone))
    let cancelled = false; setLoading(true); setError('')
    fetch('/api/staff/activity', { headers: { Authorization: `Bearer ${token}`, 'X-Stockroom-Branch': branchId, 'X-Activity-From': from.toISOString(), 'X-Activity-To': to.toISOString() } })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not load staff activity.'); return result as { staff: StaffActivitySummary[]; events: StaffActivityEvent[] } })
      .then(result => { if (!cancelled) setData(result) }).catch(caught => { if (!cancelled) { setData(null); setError(caught instanceof Error ? caught.message : 'Could not load staff activity.') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, branchId, fromDate, toDate,timeZone])
  const staff = (data?.staff || []).filter(person => staffId === 'all' || person.staffId === staffId)
  const events = (data?.events || []).filter(event => staffId === 'all' || event.staffId === staffId)
  const sum = (key: 'salesTotal' | 'expensesTotal' | 'voidsTotal') => staff.reduce((total, person) => total + person[key], 0)
  const choosePeriod = (value: 'day' | 'week' | 'month' | 'custom') => { setPeriod(value); if (value !== 'custom') { const range = activityDates(value,timeZone); setFromDate(range.from); setToDate(range.to) } }
  return <section className="panel full-panel staff-activity"><div className="panel-heading"><div><h2>Staff activity</h2><p>Branch: {branchId === 'main' ? 'Main branch' : branchId}. Dates use {timeZone}.</p></div></div><div className="activity-filters"><label>Period<select value={period} onChange={event => choosePeriod(event.target.value as typeof period)}><option value="day">Today</option><option value="week">This week</option><option value="month">This month</option><option value="custom">Custom dates</option></select></label>{period === 'custom' && <><label>From<input type="date" value={fromDate} max={toDate} onChange={event => setFromDate(event.target.value)} /></label><label>To<input type="date" value={toDate} min={fromDate} onChange={event => setToDate(event.target.value)} /></label></>}<label>Staff<select value={staffId} onChange={event => setStaffId(event.target.value)}><option value="all">All people</option>{(data?.staff || []).map(person => <option key={person.staffId} value={person.staffId}>{person.staffName} · {person.role}</option>)}</select></label></div>{loading && <p role="status">Loading activity…</p>}{error && <p role="alert" className="auth-error">{error}</p>}<section className="metric-grid report-secondary"><ReportMetric label="Sales recorded" value={money(sum('salesTotal'))} note={`${staff.reduce((n, person) => n + person.salesCount, 0)} completed sales`} /><ReportMetric label="Expenses entered" value={money(sum('expensesTotal'))} note={`${staff.reduce((n, person) => n + person.expensesCount, 0)} expense records`} /><ReportMetric label="Voided item value" value={money(sum('voidsTotal'))} note={`${staff.reduce((n, person) => n + person.voidsCount, 0)} logged item voids`} /></section><h3>Totals by staff</h3><div className="table-wrap"><table><thead><tr><th>Person</th><th>Role</th><th>Sales</th><th>Sales total</th><th>Expenses entered</th><th>Expense total</th><th>Item voids</th><th>Void value</th></tr></thead><tbody>{staff.length ? staff.map(person => <tr key={person.staffId}><td>{person.staffName}</td><td>{person.role}</td><td>{person.salesCount}</td><td>{money(person.salesTotal)}</td><td>{person.expensesCount}</td><td>{money(person.expensesTotal)}</td><td>{person.voidsCount}</td><td>{money(person.voidsTotal)}</td></tr>) : <tr><td colSpan={8} className="empty-state">No staff activity for this branch and period.</td></tr>}</tbody></table></div><h3>What was recorded</h3><div className="table-wrap"><table><thead><tr><th>Time</th><th>Staff</th><th>Activity</th><th>Details</th><th>Amount</th></tr></thead><tbody>{events.length ? events.map(event => <tr key={event.id}><td>{new Date(event.occurredAt).toLocaleString()}{event.recordedAt && event.recordedAt.slice(0, 10) !== event.occurredAt.slice(0, 10) && <span className="table-subtext">Entered {new Date(event.recordedAt).toLocaleString()}</span>}</td><td>{event.staffName}</td><td>{event.type === 'sale' ? 'Sale' : event.type === 'expense' ? 'Expense' : 'Item void'}</td><td>{event.detail}</td><td>{money(event.amount)}</td></tr>) : <tr><td colSpan={5} className="empty-state">No recorded activity for this selection.</td></tr>}</tbody></table></div><WorkspaceHelp title="Workspace help"><p className="settings-message">Expense totals use the date incurred; if entered later, both dates are shown. Older expenses without staff attribution appear under an unattributed label. Item void value is shown separately and is not subtracted from recorded sales.</p></WorkspaceHelp></section>
}

function CashierActivityLegacy({ staff, sales, money }: { staff: StaffUser[]; sales: SaleRecord[]; money: (amount: number) => string }) {
  const cashiers = staff.filter(member => member.role === 'cashier')
  return <section id="team-cashier-activity" className="panel full-panel staff-activity"><div className="panel-heading"><div><h2>Cashier activity</h2><p>Completed sales are grouped by the cashier who recorded them.</p></div></div><div className="table-wrap"><table><thead><tr><th>Cashier</th><th>Role</th><th>Sales</th><th>Sales total</th><th>Latest sale</th></tr></thead><tbody>{cashiers.length ? cashiers.map(cashier => { const recorded = sales.filter(sale => sale.staffId === cashier.id || (!sale.staffId && sale.staffName === cashier.name)); const latest = recorded[0]; return <tr key={cashier.id}><td><strong>{cashier.name}</strong><span className="table-subtext">{cashier.email}</span></td><td>Cashier</td><td>{recorded.length}</td><td>{money(recorded.reduce((sum, sale) => sum + sale.total, 0))}</td><td>{latest ? <>{new Date(latest.createdAt).toLocaleString()}<span className="table-subtext">{money(latest.total)} · {latest.paymentMethod}</span></> : 'No recorded sales'}</td></tr> }) : <tr><td colSpan={5} className="empty-state">No cashier accounts have been added yet.</td></tr>}</tbody></table></div></section>
}

function ReportsDashboard({ view, reports, currency, expenses, exportCsv, addExpense }: { view:string; reports: Reports | null; currency: string; expenses: Expense[]; exportCsv: () => Promise<void>; addExpense: (event: React.FormEvent<HTMLFormElement>) => Promise<void> }) {
  const money = (amount: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  const summary = reports || { daily: { total: 0, count: 0 }, weekly: { total: 0, count: 0 }, monthly: { total: 0, count: 0 }, inventory: { value: 0, products: 0, lowStock: 0 }, profit: { revenue: 0, cost: 0, expenses: 0, amount: 0 } }
  if(view==='summary' && reports && summary.daily.count===0 && summary.weekly.count===0 && summary.monthly.count===0 && summary.inventory.products===0 && !summary.profit.revenue && !summary.profit.cost && !summary.profit.expenses) return <EmptyScreen title="No sales to report yet" description="Complete sales or record payments to see totals and trends for the selected reporting period." />
  return <section className="reports-dashboard">{view==='summary' && <><div className="hero-row"><div><h2>Business reports</h2><p>Sales and inventory figures stored on this device. Reporting timezone: {reports?.reportingTimeZone || 'UTC'}.</p></div><div className="report-actions"><AsyncButton busyLabel="Exporting..." className="filter-button" onClick={exportCsv}><Download size={16} />Export CSV</AsyncButton><button className="primary-button" onClick={() => { void printDocument('report').catch(error => window.alert(error.message)) }}><Printer size={16} />{window.stockroomDesktop ? 'Print A4 report' : 'Print / Save PDF'}</button></div></div><section className="metric-grid"><ReportMetric label="Today’s sales" value={money(summary.daily.total)} note={`${summary.daily.count} transaction${summary.daily.count === 1 ? '' : 's'}`} /><ReportMetric label="This week" value={money(summary.weekly.total)} note={`${summary.weekly.count} transaction${summary.weekly.count === 1 ? '' : 's'}`} /><ReportMetric label="This month" value={money(summary.monthly.total)} note={`${summary.monthly.count} transaction${summary.monthly.count === 1 ? '' : 's'}`} /></section>{reports?.costWarnings?.incomplete && <section className="panel" role="alert"><h3>Profit estimate has incomplete costs</h3><p>{reports.costWarnings.zeroCostSaleLines} goods lines have zero or missing cost; {reports.costWarnings.uncostedIngredients} ingredient deductions and {reports.costWarnings.uncostedMaterials || 0} job material deductions have zero cost.</p>{reports.costWarnings.missingRecipes.length > 0 && <p>Prepared items without tracked recipes: {reports.costWarnings.missingRecipes.join(', ')}.</p>}<WorkspaceHelp title="Workspace help"><p>Check Inventory and Purchasing for purchase costs, and Food menu &amp; recipes or Restaurant menu &amp; tables for saved recipes. Record rent, utilities and other running expenses below. Profit can be overstated until these costs are recorded.</p></WorkspaceHelp></section>}<ReportCharts data={reports?.charts} currency={currency} timeZone={reports?.reportingTimeZone||'UTC'}/><section className="metric-grid report-secondary"><ReportMetric label="Stock valuation" value={money(summary.inventory.value)} note={`${summary.inventory.products} products at selling price`} /><ReportMetric label="Estimated net profit" value={money(summary.profit.amount)} note={`${money(summary.profit.revenue)} revenue · ${money(summary.profit.cost)} cost · ${money(summary.profit.expenses)} expenses`} /><ReportMetric label="Low-stock products" value={String(summary.inventory.lowStock)} note="At or below their reorder point" /></section></>}{view==='expenses' && <section className="panel"><h3>Recent expenses</h3>{expenses.length ? expenses.slice(0, 8).map((expense) => <div className="customer-row" key={expense.id}><div><strong>{expense.description}</strong><small>{expense.category} · {new Date(expense.incurredAt).toLocaleDateString()}</small></div><b>{money(expense.amount)}</b></div>) : <EmptyScreen title="No expenses yet" description="Record rent, utilities or another running cost in New expense. Saved expenses will appear here." />}</section>}{view==='new-expense' && <AsyncForm className="settings-form team-form" busyLabel="Saving expense..." onSubmit={addExpense}><h3>Record expense</h3><label>Category<input name="category" required placeholder="Rent, transport, utilities" /></label><label>Description<input name="description" required placeholder="What was paid for?" /></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Date<input name="incurredAt" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label><SubmitButton className="primary-button">Save expense</SubmitButton></AsyncForm>}<WorkspaceHelp title="Understanding profit"><h3>About profit</h3><p>Monthly estimated profit is sales less refunds, receipt tax, sold stock cost, recorded expenses, recorded recipe ingredients, recorded job materials, and recorded wastage. A negative result is a loss. Enter running costs such as rent, transport and electricity here; supplier deliveries belong in Purchasing so unsold stock is not charged twice. Missing purchase costs overstate profit. Order counter recipe ingredients are charged at their captured batch cost when preparation starts, including cancelled or refunded food. Job materials are charged when recorded as used. Batch production moves ingredient cost into finished stock; its input consumption is not charged again as an expense. Do not also enter those ingredient or material purchases as expenses. Prepared food without a recipe still has untracked ingredient costs; missing recipe costs overstate profit. Approved stock-count shortages and manual stock reductions deduct their captured cost. Closed-register shortages reduce profit; surplus increases it. Supplier payments settle balances and do not reduce profit again.</p></WorkspaceHelp></section>
}

function ReportMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
}


function InstallerScreen({ onActivate, message, onRegister }: { onRegister?: () => void; onActivate: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; message: string }) {
  const [mode, setMode] = useState<'choose' | 'new' | 'existing'>('choose')
  if (mode === 'choose') return <main className="login-screen"><section className="login-card installer-card"><div className="brand-mark"><Boxes size={21} /></div><h1>Welcome to Stockroom</h1><WorkspaceHelp title="Workspace help"><p>Set up your business on this device. You only need an internet connection for this first setup.</p></WorkspaceHelp>{onRegister && <><h2>Starting a new business?</h2><WorkspaceHelp title="Workspace help"><p>Have the registration key issued to your owner email ready. Create your owner password, and Stockroom will set up this device for you.</p></WorkspaceHelp><button type="button" className="primary-button login-button" onClick={onRegister}>New business with a key</button></>}<h2>Already registered?</h2><WorkspaceHelp title="Workspace help"><p>Use your existing owner email and password to connect this device. You do not need another registration key.</p></WorkspaceHelp><button type="button" className="filter-button" onClick={() => setMode('existing')}>Existing business</button><PublicLandingLink />{!isNativeMobile() && !isBrowserPwa() && <details><summary>Developer installation tools</summary><p>For the developer's existing manual installation process only.</p><button type="button" className="text-button" onClick={() => setMode('new')}>Installer activation</button></details>}{message && <p role="status">{message}</p>}</section></main>
  return <main className="login-screen"><AsyncForm className="login-card installer-card" busyLabel="Connecting device..." onSubmit={onActivate}><input type="hidden" name="mode" value={mode} /><div className="brand-mark"><Boxes size={21} /></div><h1>{mode === 'new' ? 'Developer installation' : 'Add another device'}</h1><p>{mode === 'new' ? 'Use the existing installer credentials to activate this device for a client.' : 'Enter the owner credentials you created when registering your business. Stockroom will download your business data.'}</p>{mode === 'new' && <label>Client business ID<input name="businessId" required pattern="[a-z0-9][a-z0-9-]{2,80}" /></label>}<label>Device label<input name="label" required maxLength={100} placeholder="Main checkout computer" /></label>{mode === 'new' ? <label>Installer Admin API key<input name="adminApiKey" type="password" required autoComplete="off" /></label> : <><label>Owner email<input name="ownerEmail" type="email" required autoComplete="username" /></label><label>Owner password<input name="ownerPassword" type="password" minLength={10} required autoComplete="current-password" /></label></>}{message && <p role="status">{message}</p>}<SubmitButton className="primary-button login-button">{mode === 'new' ? 'Activate new client' : 'Connect this device'}</SubmitButton><button type="button" className="text-button" onClick={() => setMode('choose')}>Back to setup choices</button><PublicLandingLink /></AsyncForm></main>
}

function CustomerDisplayPairing({ pairing, createPairing, openSecondMonitor, prompt }: { pairing: { url: string; code: string; expiresAt: string } | null; createPairing: () => Promise<void>; openSecondMonitor: () => Promise<void>; prompt: (options: Omit<InlinePromptRequest, 'resolve'>) => Promise<string | null> }) {
  return <section className="panel full-panel pairing-panel"><div className="panel-heading"><div><h2>Customer display</h2><WorkspaceHelp title="Workspace help"><p>Share a read-only live order view with a customer or a second display on the same shop Wi-Fi.</p></WorkspaceHelp></div><Store size={20} /></div><ol><li>Connect the customer phone/tablet and checkout computer to the same private Wi-Fi.</li><li>Create a link and send or open it on that customer device within five minutes.</li><li>The customer can review the live basket and see the completed-sale confirmation, but cannot change anything.</li></ol><div className="report-actions">{window.stockroomDesktop && <AsyncButton busyLabel="Opening display..." className="primary-button" onClick={openSecondMonitor}>Open customer display on second monitor</AsyncButton>}<AsyncButton busyLabel="Creating link..." className="filter-button" onClick={createPairing}>Create customer share link</AsyncButton></div>{pairing && <section className="pairing-code"><span>Send or open this customer link</span><strong>{pairing.url}</strong><button className="filter-button" onClick={async () => { try { await navigator.clipboard?.writeText(pairing.url) } catch { await prompt({ title: 'Copy this customer link', message: 'Select and copy the link below.', initialValue: pairing.url }) } }}>Copy link</button><small>Pairing code: <b>{pairing.code}</b> · expires {new Date(pairing.expiresAt).toLocaleTimeString()}</small></section>}<WorkspaceHelp title="Workspace help"><p className="settings-message">After the link is opened, its read-only display session expires after 12 hours or when the checkout app restarts.</p></WorkspaceHelp></section>
}

const customerBusinessId = new URLSearchParams(window.location.search).get('customer') || ''
createRoot(document.getElementById('root')!).render(<StrictMode><WorkspaceHelpProvider>{customerBusinessId ? <Suspense fallback={<main className="login-screen"><p role="status">Loading customer account…</p></main>}><CustomerPortal businessId={customerBusinessId} /></Suspense> : <><AppUpdatePrompt />{window.location.pathname === '/customer-display' ? <main className="login-screen"><section className="login-card"><h1>Customer display</h1><WorkspaceHelp title="Workspace help"><p>Open a new pairing link from the checkout computer’s Customer display page.</p></WorkspaceHelp><PublicLandingLink /></section></main> : <App />}</>}</WorkspaceHelpProvider></StrictMode>)
