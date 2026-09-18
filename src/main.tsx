import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { AlertTriangle, ArrowDownToLine, ArrowUpToLine, BarChart3, Boxes, CheckSquare, CloudOff, Download, Eye, EyeOff, LayoutDashboard, MoreHorizontal, PackagePlus, Plus, Printer, RefreshCw, Search, ScanLine, Settings2, ShoppingCart, SlidersHorizontal, Store, UserRoundCog, WalletCards, Wifi, X } from 'lucide-react'
import type { Customer, Product, Sale, Stocktake } from './types'
import { commitOfflineSale, getReceiptHistory, cacheProducts, getCachedProducts, getQueuedOperations, queueOperation, removeQueuedOperation, replaceQueuedProductId, saveSale, upsertCachedProducts } from './lib/offlineStore'
import { installMobileApi } from './lib/mobileApi'
import { isNativeMobile } from './lib/mobileDatabase'
import { isBrowserPwa } from './lib/platform'
import { resolveStartupState } from './lib/startupState'
import './styles.css'
import { Reconciliation } from './Reconciliation'
import { ReceiptPhoto } from './ReceiptPhoto'
import { paymentPolicy, recordPayment, type PaymentPolicy } from '../server/payment.mjs'
import { referenceFromScan } from './lib/reconciliation'
import { AsyncForm, SubmitButton, AsyncButton } from './AsyncControls'
import { DeviceSetup } from './DeviceSetup'
import { scannerSettings } from './lib/deviceSetup'
import { readTerminalSettings, canRecordTerminalPayment } from './lib/terminalSettings'
import { printerSettings, printDocument } from './lib/printing'
import { PaymentPolicySettings } from './PaymentPolicySettings'
import { PaymentEvidence } from './PaymentEvidence'
import { ProductIntake } from './ProductIntake'
import { BusinessProfileSettings, businessModes, type BusinessMode } from './BusinessProfileSettings'

function PageOptions({ onRefresh, busy }: { onRefresh: () => void; busy: boolean }) {
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
  return <details className="page-options" ref={menu} onBlur={(event) => {
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
      }}><RefreshCw size={16} />Refresh</button>
    </div>
  </details>
}

installMobileApi()
if (isBrowserPwa()) {
  const { installBrowserApi } = await import('./lib/installBrowserApi')
  installBrowserApi()
}

if (isBrowserPwa() && 'serviceWorker' in navigator) {
  const register = async () => {
    try {
      const existing = await navigator.serviceWorker.getRegistration('/sw.js')
      if (existing) return
      await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    } catch {
      // Ignore registration failures; app can still operate without the PWA shell cache.
    }
  }
  if (document.readyState === 'complete') void register()
  else window.addEventListener('load', () => { void register() }, { once: true })
}

type AppSettings = {
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

type User = { id: string; name: string; email: string; role: 'owner' | 'admin' | 'cashier'; operationalAccess?: boolean; organizationId: string }
type SaleRecord = { id: string; total: number; paymentMethod: string; paymentReference: string; terminalProvider: string; paymentDetails?: Sale['paymentDetails']; cashReceived?: number | null; changeGiven?: number | null; staffName?: string; createdAt: string; items: Array<{ productId: string; productName: string; quantity: number; unitPrice: number }> }
type Movement = { id: string; productName: string; sku: string; quantity: number; reason: string; createdAt: string }
type SyncStatus = { configured: boolean; pending: number; conflicts?: number; lastError: string; existingBusiness?: boolean }
type SyncConflict = { id: string; entityType: string; entityId: string; reason: string; createdAt: string }
type StaffUser = { id: string; name: string; email: string; role: 'owner' | 'admin' | 'cashier'; operationalAccess?: boolean; createdAt: string }
type Reports = { daily: { total: number; count: number }; weekly: { total: number; count: number }; monthly: { total: number; count: number }; inventory: { value: number; products: number; lowStock: number }; profit: { revenue: number; cost: number; expenses: number; amount: number } }
type Expense = { id: string; category: string; description: string; amount: number; incurredAt: string }

function App() {
  const deriveSku = (name: string) => `${name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 24).toUpperCase() || 'PRODUCT'}-${crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('stockroom-products')
    return saved ? JSON.parse(saved) : []
  })
  const [query, setQuery] = useState('')
  const [active, setActive] = useState('Overview')
  const [showAdd, setShowAdd] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ configured: false, pending: 0, lastError: '' })
  const [syncing, setSyncing] = useState(false)
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
  const [businessMode, setBusinessMode] = useState<BusinessMode>(() => (localStorage.getItem('stockroom-business-mode') as BusinessMode) || 'general')
  const defaultUnit = businessModes[businessMode].unit
  const [extraPaymentPolicy, setExtraPaymentPolicy] = useState<PaymentPolicy>(() => paymentPolicy())
  useEffect(() => {
    if (!showAdd) return
    const nameInput = document.querySelector('form.modal input[name="name"]') as HTMLInputElement | null
    const skuInput = document.querySelector('form.modal input[name="sku"]') as HTMLInputElement | null
    const unitInput = document.querySelector('form.modal input[name="unit"]') as HTMLInputElement | null
    if (!nameInput || !skuInput) return
    skuInput.readOnly = true
    if (unitInput && !unitInput.value) unitInput.value = defaultUnit
    const derive = () => { skuInput.value = deriveSku(nameInput.value) }
    nameInput.addEventListener('input', derive)
    derive()
    return () => nameInput.removeEventListener('input', derive)
  }, [showAdd, defaultUnit])
  const [settingsMessage, setSettingsMessage] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [paymentMethod, setPaymentMethod] = useState<Sale['paymentMethod']>('external-pos')
  const [terminalProvider, setTerminalProvider] = useState('')

  const [paymentReference, setPaymentReference] = useState('')
  const [cashReceived, setCashReceived] = useState('')
  const [extraKept, setExtraKept] = useState('0')
  const [extraReason, setExtraReason] = useState('')
  const [extraNote, setExtraNote] = useState('')
  const [splitCash, setSplitCash] = useState('')
  const [splitTerminal, setSplitTerminal] = useState('')
  const [splitTerminalReference, setSplitTerminalReference] = useState('')
  const [splitTransfer, setSplitTransfer] = useState('')
  const [transferProvider, setTransferProvider] = useState('')
  const [transferReference, setTransferReference] = useState('')
  const [user, setUser] = useState<User | null>(() => JSON.parse(localStorage.getItem('stockroom-user') || 'null'))
  const [terminalRevision, setTerminalRevision] = useState(0)
  const deviceTerminal = useMemo(() => readTerminalSettings(user?.organizationId || ''), [user?.organizationId, terminalRevision])
  const manualTerminalAllowed = canRecordTerminalPayment(deviceTerminal)
  useEffect(() => { setTerminalProvider(deviceTerminal.provider || posProvider) }, [deviceTerminal.provider, posProvider])
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('stockroom-token') || '')
  useEffect(() => { setCashReceived('') }, [authToken])
  const [cloudAccessToken, setCloudAccessToken] = useState(() => localStorage.getItem('stockroom-cloud-access-token') || '')
  const [authError, setAuthError] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [staff, setStaff] = useState<StaffUser[]>([])
  const [reports, setReports] = useState<Reports | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [sales, setSales] = useState<SaleRecord[]>([])
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
    fetch('/api/stocktakes', { headers: { Authorization: `Bearer ${authToken}` } }).then(async response => {
      if (!response.ok) throw new Error((await response.json()).error)
      const data = await response.json()
      if (!cancelled) {
        setStocktake(data.stocktake)
        setStocktakeReason(data.stocktake?.approvalReason || 'Approved after physical count')
      }
    }).catch(error => { if (!cancelled) window.alert(error.message || 'Could not restore stocktake.') })
    return () => { cancelled = true }
  }, [authToken, active])
  const [setupRequired, setSetupRequired] = useState(true)
  const [installerRequired, setInstallerRequired] = useState(true)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [startupError, setStartupError] = useState('')
  const [installerMessage, setInstallerMessage] = useState('')
  const [mobilePullDistance, setMobilePullDistance] = useState(0)
  const [refreshingView, setRefreshingView] = useState(false)
  const authHeaders: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {}

  useEffect(() => { document.title = appName }, [appName])
  useEffect(() => localStorage.setItem('stockroom-products', JSON.stringify(products)), [products])
  useEffect(() => {
    if (!authToken) return
    if (!isBrowserPwa()) getCachedProducts().then((cached) => { if (cached.length) setProducts(cached) }).catch(() => undefined)
    fetch('/api/products', { headers: authHeaders }).then((response) => response.ok ? response.json() as Promise<{ products: Product[] }> : Promise.reject()).then((data) => {
      setProducts(data.products)
      cacheProducts(data.products).catch(() => undefined)
    }).catch(() => undefined)
  }, [authToken])
  useEffect(() => { if (canManageOperations) fetch('/api/customers', { headers: authHeaders }).then((response) => response.ok ? response.json() as Promise<{ customers: Customer[] }> : Promise.reject()).then((data) => setCustomers(data.customers)).catch(() => undefined) }, [authToken, user?.operationalAccess, user?.role])
  useEffect(() => { let cancelled = false; setSales([]); if (canManageOperations) fetch('/api/sales', { headers: authHeaders }).then((response) => response.ok ? response.json() as Promise<{ sales: SaleRecord[] }> : Promise.reject()).then((data) => { if (!cancelled) setSales(data.sales) }).catch(() => { if (!cancelled) setReceiptError('Could not load older sales. Locally archived receipts remain available.') }); return () => { cancelled = true } }, [authToken, user?.organizationId, user?.operationalAccess, user?.role])
  useEffect(() => { if (canManageOperations) fetch('/api/movements', { headers: authHeaders }).then((response) => response.ok ? response.json() as Promise<{ movements: Movement[] }> : Promise.reject()).then((data) => setMovements(data.movements)).catch(() => undefined) }, [authToken, user?.operationalAccess, user?.role])
  useEffect(() => {
    if (!authToken || !['owner', 'admin'].includes(user?.role || '')) return
    fetch('/api/users', { headers: { Authorization: `Bearer ${authToken}` } }).then((response) => response.ok ? response.json() as Promise<{ users: StaffUser[] }> : Promise.reject()).then((data) => setStaff(data.users)).catch(() => undefined)
  }, [authToken, user?.role])
  useEffect(() => {
    if (!authToken || !['owner', 'admin'].includes(user?.role || '')) return
    fetch('/api/sync/conflicts', { headers: { Authorization: `Bearer ${authToken}` } }).then((response) => response.ok ? response.json() as Promise<{ conflicts: SyncConflict[] }> : Promise.reject()).then((data) => setSyncConflicts(data.conflicts)).catch(() => undefined)
  }, [authToken, user?.role, syncStatus.conflicts])
  useEffect(() => {
    if (!authToken || !['owner', 'admin'].includes(user?.role || '')) return
    fetch('/api/expenses').then((response) => response.ok ? response.json() as Promise<{ expenses: Expense[] }> : Promise.reject()).then((data) => setExpenses(data.expenses)).catch(() => undefined)
  }, [authToken, user?.role])
  useEffect(() => {
    if (!authToken || !['owner', 'admin'].includes(user?.role || '')) return
    fetch('/api/reports', { headers: { Authorization: `Bearer ${authToken}` } }).then((response) => response.ok ? response.json() as Promise<Reports> : Promise.reject()).then(setReports).catch(() => undefined)
  }, [authToken, user?.role])
  async function refreshBusinessSettings() {
    const response = await fetch('/api/settings').catch(() => null)
    if (!response?.ok) return
    const settings = await response.json() as AppSettings
    setAppName(settings.appName || 'My Business')
    setCurrency(settings.currency || 'USD')
    setPosProvider(settings.posProvider || '')
    setPosTerminalId(settings.posTerminalId || '')
    setPosConnection(settings.posConnection || 'manual')
    setLogoData(settings.logoData || '')
    setExtraPaymentPolicy(paymentPolicy(settings.paymentPolicy))
    localStorage.setItem('stockroom-app-name', settings.appName || 'My Business')
    localStorage.setItem('stockroom-currency', settings.currency || 'USD')
  }
  async function refreshSyncStatus() {
    const response = await fetch('/api/sync/status').catch(() => null)
    if (response?.ok) setSyncStatus(await response.json() as SyncStatus)
    await refreshBusinessSettings()
  }
  async function syncNow() {
    setSyncing(true)
    try {
      const response = await fetch('/api/sync/now', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } })
      if (response.ok) setSyncStatus(await response.json() as SyncStatus)
      await refreshBusinessSettings()
      if (isBrowserPwa()) {
        const productsResponse = await fetch('/api/products', { headers: authHeaders })
        if (productsResponse.ok) setProducts((await productsResponse.json()).products)
      }
    } finally { setSyncing(false) }
  }
  async function pullLatest() {
    refreshLocalView()
  }
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
  }, [online, syncStatus.configured, syncing, refreshingView, authToken])
  function refreshLocalView() {
    if (refreshingView || syncing) return
    setRefreshingView(true)
    // Pull remote changes only. Deliberate "Sync now" remains responsible for
    // uploading this phone's queued work.
    fetch('/api/sync/pull', { method: 'POST', headers: authHeaders })
      .catch(() => undefined)
      .finally(async () => {
        if (isBrowserPwa() && 'serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.getRegistration()
          await registration?.update().catch(() => undefined)
          if (registration?.waiting) {
            navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
            registration.waiting.postMessage('ACTIVATE_UPDATE')
          }
        }
        await refreshBusinessSettings()
        setRefreshingView(false)
      })
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
    const response = await fetch('/api/installer/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: form.get('mode'), syncApiUrl: form.get('syncApiUrl'), businessId: form.get('businessId'), deviceId: form.get('deviceId'), label: form.get('label'), adminApiKey: form.get('adminApiKey'), ownerEmail: form.get('ownerEmail'), ownerPassword: form.get('ownerPassword') }) })
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
  async function resolveConflict(id: string) {
    const response = await fetch(`/api/sync/conflicts/${id}/resolve`, { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } })
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
      const endpoint = operation.type === 'stock' ? `/api/products/${operation.payload.productId}/stock` : operation.type === 'sale' ? '/api/sales' : operation.type === 'settings' ? '/api/settings' : '/api/products'
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
      const startupState = resolveStartupState(settings)
      const browserStartupState = isBrowserPwa() && !settings.cloudConfigured
        ? { ...startupState, installerRequired: false, setupRequired: false }
        : startupState
      setAppName(settings.appName || 'My Business')
      setCurrency(settings.currency || 'USD')
      setPosProvider(settings.posProvider || '')
      setPosTerminalId(settings.posTerminalId || '')
      setPosConnection(settings.posConnection || 'manual')
      setLogoData(settings.logoData || '')
      setExtraPaymentPolicy(paymentPolicy(settings.paymentPolicy))
        setLogoData(settings.logoData || '')
      setSetupRequired(browserStartupState.setupRequired)
      setInstallerRequired(browserStartupState.installerRequired)
      setSettingsLoaded(true)
      localStorage.setItem('stockroom-app-name', settings.appName || 'My Business')
      localStorage.setItem('stockroom-currency', settings.currency || 'USD')
      document.title = settings.appName || 'My Business'
    }).catch(async () => {
      try {
        const response = await fetch('/api/sync/status')
        const status = response.ok ? await response.json() as { configured?: boolean; existingBusiness?: boolean } : {}
        const startupState = resolveStartupState({ cloudConfigured: status.configured, existingBusiness: status.existingBusiness })
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
    if (user?.role === 'cashier' && !user.operationalAccess) setActive('POS')
  }, [user?.role, user?.operationalAccess])

  const lowStock = products.filter((product) => product.stock <= product.reorder)
  const totalValue = products.reduce((sum, product) => sum + product.stock * product.price, 0)
  const filteredProducts = useMemo(() => products.filter((product) => `${product.name} ${product.sku} ${product.barcode || ''} ${product.category}`.toLowerCase().includes(query.toLowerCase())), [products, query])

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
    const name = String(data.get('name')).trim()
    const input = { name, sku: String(data.get('sku')).trim() || deriveSku(name), barcode: String(data.get('barcode') || '').trim(), category: String(data.get('category')), stock: Number(data.get('stock')), reorder: Number(data.get('reorder')), price: Number(data.get('price')), cost: Number(data.get('cost') || 0), unit: String(data.get('unit')) }
    try {
      const response = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify(input) })
      if (!response.ok) throw new Error('Unable to create product')
      const product = await response.json() as Product
      setProducts((current) => [product, ...current])
      await upsertCachedProducts([product])
    } catch {
      if (isBrowserPwa()) { window.alert('Product could not be saved. Check its details and available device storage.'); return }
      const product = { ...input, id: crypto.randomUUID(), updated: 'Saved offline' }
      setProducts((current) => [product, ...current])
      await upsertCachedProducts([product])
      await queueOperation({ type: 'product', payload: { ...input, localId: product.id }, createdAt: new Date().toISOString() })
    }
    setShowAdd(false)
  }
  async function importProduct(input: { name: string; barcode?: string; category?: string; unit?: string; price?: number; cost?: number; stock?: number; reorder?: number }) {
    const payload = { ...input, sku: deriveSku(input.name), barcode: input.barcode || '', category: input.category || '', unit: input.unit || defaultUnit, price: input.price || 0, cost: input.cost || 0, stock: input.stock || 0, reorder: input.reorder || 0 }
    const response = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify(payload) })
    if (!response.ok) throw new Error('Could not save product.')
    const product = await response.json() as Product
    setProducts(current => [product, ...current])
    await upsertCachedProducts([product])
  }

  async function saveAppName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextName = appName.trim()
    if (!nextName) return setSettingsMessage('Enter an app name.')
    localStorage.setItem('stockroom-app-name', nextName)
    try {
      const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ appName: nextName, currency, posProvider, posTerminalId, posConnection, logoData, paymentPolicy: extraPaymentPolicy }) })
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Unable to save') }
      document.title = nextName
      localStorage.setItem('stockroom-currency', currency)
      setSettingsMessage('Saved to the business account.')
    } catch {
      if (isBrowserPwa()) { setSettingsMessage('Settings could not be saved. Check available device storage and try again.'); return }
      await queueOperation({ type: 'settings', payload: { appName: nextName, currency, posProvider, posTerminalId, posConnection, logoData, paymentPolicy: extraPaymentPolicy }, createdAt: new Date().toISOString() })
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

  function addToCart(product: Product) {
    setCart((current) => ({ ...current, [product.id]: (current[product.id] || 0) + 1 }))
  }

  function removeFromCart(productId: string) {
    setCart((current) => {
      const next = { ...current }
      if (!next[productId] || next[productId] === 1) delete next[productId]
      else next[productId] -= 1
      return next
    })
  }

  async function completeSale() {
    if ((paymentMethod === 'external-pos' || (paymentMethod === 'multiple' && Number(splitTerminal) > 0)) && !manualTerminalAllowed) { window.alert('Terminal integration is unavailable and manual confirmation is disabled. Update the terminal profile in Admin Settings.'); return }
    if (paymentMethod === 'external-pos' && (!terminalProvider.trim() || !paymentReference.trim())) return
    let sale: Sale
    try {
      sale = recordPayment({ organizationId: user!.organizationId, businessName: appName, currency, id: crypto.randomUUID(), items: cartProducts.map((product) => ({ productId: product.id, productName: product.name, quantity: cart[product.id], price: product.price })), total: cartTotal, createdAt: new Date().toISOString(), syncStatus: 'pending', paymentMethod, terminalProvider: paymentMethod === 'bank-transfer' ? transferProvider.trim() : terminalProvider.trim(), paymentReference: paymentMethod === 'bank-transfer' ? transferReference.trim() : paymentReference.trim(), paymentDetails: paymentMethod === 'wallet' ? {} : paymentMethod === 'multiple' ? { allocations: [{ method: 'cash', amount: splitCash }, ...(Number(splitTerminal) > 0 ? [{ method: 'external-pos', amount: splitTerminal, provider: terminalProvider, reference: splitTerminalReference }] : []), ...(Number(splitTransfer) > 0 ? [{ method: 'bank-transfer', amount: splitTransfer, provider: transferProvider, reference: transferReference }] : [])].filter(part => Number(part.amount) > 0) } : { amountReceived: paymentMethod === 'cash' ? cashReceived : cartTotal + Number(extraKept || 0), extraKept, reason: extraReason, note: extraNote } }, extraPaymentPolicy) as Sale
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Payment details are invalid.'); return }
    if (isBrowserPwa()) {
      const response = await fetch('/api/sales', { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(sale) })
      if (!response.ok) { const result = await response.json(); window.alert(result.error || 'Sale could not be saved.'); return }
    }
    const updatedProducts = products.map((product) => cart[product.id] ? { ...product, stock: Math.max(0, product.stock - cart[product.id]), updated: 'Sold offline' } : product)
    if (!isBrowserPwa()) await commitOfflineSale(sale, updatedProducts)
    else await saveSale(sale).catch(() => setReceiptError('Sale saved, but its receipt snapshot could not be archived locally.'))
    setProducts(updatedProducts)
    setReceiptHistory(current => [sale, ...current.filter(row => row.id !== sale.id)])
    setLastReceipt(sale)
    setCompletedCustomerSale({ items: cartProducts.map((product) => ({ name: product.name, quantity: cart[product.id], price: product.price })), total: cartTotal })
    setCart({})
    setCashReceived('')
    setPaymentReference('')
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

  const cartProducts = products.filter((product) => cart[product.id])
  const cartTotal = cartProducts.reduce((total, product) => total + product.price * cart[product.id], 0)
  let cashError = ''; let changeDue = 0
  if (paymentMethod === 'cash') {
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

  const canManageOperations = user?.role === 'owner' || user?.role === 'admin' || Boolean(user?.operationalAccess)
  const canManageInventory = canManageOperations
  const allReceipts: Sale[] = [...receiptHistory, ...sales.filter(row => !receiptHistory.some(receipt => receipt.id === row.id)).map(row => ({ ...row, paymentMethod: row.paymentMethod as Sale['paymentMethod'], syncStatus: 'synced' as const, items: row.items.map(item => ({ productId: item.productId, productName: item.productName, quantity: item.quantity, price: item.unitPrice })) }))].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const formatMoney = (amount: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  async function adjustWallet(customerId: string, amount: number) {
    const response = await fetch(`/api/customers/${customerId}/wallet`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ amount, reason: amount > 0 ? 'customer-credit' : 'customer-purchase' }) })
    if (!response.ok) return
    const customer = await response.json() as Customer
    setCustomers((current) => current.map((item) => item.id === customer.id ? customer : item))
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
  }

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
    if (!cloudAccessToken) { setSettingsMessage('Connect to the internet and sign in again before creating staff accounts.'); return }
    const response = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ name: form.get('name'), email: form.get('email'), password: form.get('password'), role: form.get('role'), cloudAccessToken }) })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Could not add user.' })) as { error?: string }
      setSettingsMessage(error.error || 'Could not add user.')
      return
    }
    const created = await response.json() as StaffUser
    setStaff((current) => [...current, created])
    submittedForm.reset()
    setSettingsMessage(`${created.name} was added as ${created.role}.`)
  }

  async function setCashierAccess(id: string, enabled: boolean) {
    if (!cloudAccessToken) return setSettingsMessage('Connect to the internet and sign in again before changing cashier access.')
    const response = await fetch(`/api/users/${id}/operational-access`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ enabled, cloudAccessToken }) })
    if (!response.ok) return setSettingsMessage('Could not update cashier access.')
    const updated = await response.json() as StaffUser
    setStaff((current) => current.map((member) => member.id === updated.id ? updated : member))
    setSettingsMessage(`${updated.name} can ${updated.operationalAccess ? 'now manage operations' : 'now only use POS'}.`)
  }

  async function exportSalesCsv() {
    const response = await fetch('/api/reports/sales.csv', { headers: { Authorization: `Bearer ${authToken}` } })
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
    const response = await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ category: form.get('category'), description: form.get('description'), amount: Number(form.get('amount')), incurredAt: new Date(String(form.get('incurredAt') || new Date().toISOString())).toISOString() }) })
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'Could not save expense.') }
    const expense = await response.json() as Expense
    setExpenses((current) => [expense, ...current])
    submittedForm.reset()
    const reportResponse = await fetch('/api/reports', { headers: { Authorization: `Bearer ${authToken}` } })
    if (reportResponse.ok) setReports(await reportResponse.json() as Reports)
  }

  const [scanning, setScanning] = useState(false)
  const cameraVideo = useRef<HTMLVideoElement>(null)
  const cameraSession = useRef(0)
  const cameraStream = useRef<MediaStream | null>(null)
  function stopScan() {
    cameraSession.current += 1
    cameraStream.current?.getTracks().forEach(track => track.stop())
    cameraStream.current = null
    setScanning(false)
  }
  useEffect(() => { stopScan(); return () => { cameraSession.current += 1; cameraStream.current?.getTracks().forEach(track => track.stop()) } }, [active, authToken])
  function acceptBarcode(code: string) {
    const value = code.trim()
    if (!value) return
    if (active === 'POS') {
      const matches = products.filter(product => product.barcode === value || product.sku === value)
      if (matches.length === 1) { addToCart(matches[0]); setQuery(''); return }
    }
    setQuery(value)
  }
  function acceptPaymentReference(raw: string) {
    if (!raw.trim()) return
    try {
      const reference = referenceFromScan(raw)
      const confirmed = window.prompt('Confirm this reference against the terminal receipt. This does not verify payment.', reference)
      if (confirmed !== null) setPaymentReference(referenceFromScan(confirmed))
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Could not read payment reference.') }
  }
  async function scanBarcode(target: 'product' | 'payment' | 'setup' = 'product') {
    const accept = target === 'setup' ? (_code: string) => {} : target === 'payment' ? acceptPaymentReference : acceptBarcode
    if (scanning) return
    const Detector = (window as unknown as { BarcodeDetector?: new () => { detect(video: HTMLVideoElement): Promise<Array<{ rawValue: string }>> } }).BarcodeDetector
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      if (target === 'setup') throw new Error('Camera scanning is unavailable on this device. Use keyboard scanner setup instead.')
      accept(window.prompt('Enter or scan a barcode') || '')
      return
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
      if (session === cameraSession.current) { stopScan(); if (target === 'setup') throw error; accept(window.prompt('Camera unavailable. Enter or scan the barcode') || '') }
    } finally { window.clearTimeout(timeout) }
  }

  async function startStocktake() {
    const response = await fetch('/api/stocktakes', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } })
    if (response.ok) { setStocktake(await response.json() as Stocktake); setActive('Stocktake') }
    else if (isBrowserPwa()) window.alert((await response.json()).error || 'Could not start stocktake.')
  }

  async function updateCount(countId: string, counted: number) {
    if (!stocktake) return
    const response = await fetch(`/api/stocktakes/${stocktake.id}/counts/${countId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ counted }) })
    if (response.ok) setStocktake(await response.json() as Stocktake)
    else if (isBrowserPwa()) window.alert((await response.json()).error || 'Could not save count.')
  }

  async function approveStocktakeSession() {
    if (!stocktake) return
    const response = await fetch(`/api/stocktakes/${stocktake.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ reason: stocktakeReason.trim() || 'Approved after physical count' }),
    })
    if (response.ok) {
      const next = await response.json() as Stocktake
      setStocktake(next)
      fetch('/api/products').then((result) => result.json()).then((data: { products: Product[] }) => setProducts(data.products))
    } else if (isBrowserPwa()) window.alert((await response.json()).error || 'Could not approve stocktake.')
  }

  async function login(email: string, password: string) {
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
    const cloudResponse = await fetch('/api/auth/cloud-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).catch(() => null)
    const cloudData = cloudResponse?.ok ? await cloudResponse.json() as { token: string; user: User; cloudAccessToken: string } : null
    if (!response.ok && !cloudResponse?.ok) {
      if (isBrowserPwa()) {
        const failure = await cloudResponse?.json().catch(() => null)
        throw new Error(failure?.error || 'Connect to the internet to sign in. An existing signed-in session can work offline.')
      }
      throw new Error('Email or password is incorrect.')
    }
    const data = response.ok ? await response.json() as { token: string; user: User } : cloudData!
    if (cloudData) {
      setCloudAccessToken(cloudData.cloudAccessToken); localStorage.setItem('stockroom-cloud-access-token', cloudData.cloudAccessToken)
    }
    setAuthToken(data.token)
    setUser(data.user)
    setActive(data.user.role === 'cashier' && !data.user.operationalAccess ? 'POS' : 'Overview')
    setInstallerRequired(false)
    setSetupRequired(false)
    localStorage.setItem('stockroom-token', data.token)
    localStorage.setItem('stockroom-user', JSON.stringify(data.user))
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
    setAppName(data.setup.appName)
    setSetupRequired(false)
    localStorage.setItem('stockroom-token', data.token)
    localStorage.setItem('stockroom-user', JSON.stringify(data.user))
    localStorage.setItem('stockroom-app-name', data.setup.appName)
    document.title = data.setup.appName
    const cloud = await fetch('/api/auth/cloud-register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null)
    if (cloud?.ok) { const result = await cloud.json() as { accessToken: string }; setCloudAccessToken(result.accessToken); localStorage.setItem('stockroom-cloud-access-token', result.accessToken) }
  }

  async function logout() {
    const response = await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } }).catch(() => undefined)
    if (isBrowserPwa() && !response?.ok) { window.alert('Could not clear the saved session. Check available device storage and try logging out again.'); return }
    // Ending an active session does not undo device enrollment or shop setup.
    setInstallerRequired(false)
    setSetupRequired(false)
    setAuthError('')
    setAuthToken('')
    setUser(null)
    localStorage.removeItem('stockroom-token')
    localStorage.removeItem('stockroom-user')
    localStorage.removeItem('stockroom-cloud-access-token')
    setCloudAccessToken('')
  }

  if (!settingsLoaded) return <main className="login-screen"><div className="login-card"><h1>{startupError ? 'Cannot open your business' : 'Loading your business'}</h1>{startupError && <><p>{startupError}</p><button className="primary-button" onClick={() => window.location.reload()}>Try again</button></>}</div></main>
  if (!user) return installerRequired ? <InstallerScreen onActivate={activateInstallation} message={installerMessage} /> : setupRequired ? <SetupScreen onCreate={completeSetup} error={authError} setError={setAuthError} /> : <LoginScreen onLogin={login} error={authError} setError={setAuthError} />

  return <div className="app-shell">
    {(isNativeMobile() || isBrowserPwa()) && <div className={refreshingView ? 'mobile-pull-refresh refreshing' : 'mobile-pull-refresh'} style={{ transform: `translate(-50%, ${refreshingView ? 8 : mobilePullDistance - 56}px)` }}><RefreshCw size={17} className={refreshingView ? 'spin' : ''} /><span>{refreshingView ? 'Refreshingâ€¦' : mobilePullDistance >= 64 ? 'Release to refresh' : 'Pull to refresh'}</span></div>}
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">{logoData ? <img src={logoData} alt="" className="brand-logo" /> : <Boxes size={21} />}</div><div><strong>{appName}</strong><span>Business operations</span></div></div>
      <div className="workspace"><Store size={16} /><span>{appName}</span><MoreHorizontal size={17} /></div>
      <nav>
        {canManageOperations && <button className={active === 'Overview' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Overview')}><LayoutDashboard size={18} />Overview</button>}
        {canManageOperations && <button className={active === 'Inventory' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Inventory')}><Boxes size={18} />Inventory <b>{products.length}</b></button>}
        {canManageInventory && <button className={active === 'Stocktake' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Stocktake')}><CheckSquare size={18} />Stock take</button>}
        <button className={active === 'POS' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('POS')}><ShoppingCart size={18} />POS</button>
        {!isBrowserPwa() && !isNativeMobile() && <button className={active === 'Display' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Display')}><Store size={18} />Customer display</button>}
        {canManageOperations && <button className={active === 'Sales' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Sales')}><ShoppingCart size={18} />Sales</button>}
        {canManageOperations && <button className={active === 'Movements' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Movements')}><ArrowDownToLine size={18} />Stock movements</button>}
        {canManageOperations && <button className={active === 'Wallet' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Wallet')}><WalletCards size={18} />Wallet</button>}
        {!isBrowserPwa() && ['owner', 'admin'].includes(user.role) && <button className={active === 'Owner' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Owner')}><LayoutDashboard size={18} />Business dashboard</button>}
        {['owner', 'admin'].includes(user.role) && <button className={active === 'Reports' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Reports')}><BarChart3 size={18} />Reports</button>}
        {['owner', 'admin'].includes(user.role) && <button className={active === 'Sync' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Sync')}><RefreshCw size={18} />Sync issues {syncConflicts.length > 0 && <b>{syncConflicts.length}</b>}</button>}
        {['owner', 'admin'].includes(user.role) && <button className={active === 'Team' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Team')}><UserRoundCog size={18} />Team management</button>}
        {['owner', 'admin'].includes(user.role) && <button className={active === 'Settings' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Settings')}><UserRoundCog size={18} />Business settings</button>}
      </nav>
      <div className={isBrowserPwa() ? "sidebar-foot pwa-sync-controls" : "sidebar-foot"}><div className={online && syncStatus.configured ? 'sync-status sync-ready' : 'sync-status offline'}>{online && syncStatus.configured ? <Wifi size={16} /> : <CloudOff size={16} />}<span>{online && syncStatus.configured ? `Cloud sync ready${syncStatus.pending ? ` Â· ${syncStatus.pending} queued` : ''}` : online ? 'Cloud sync not configured' : 'Offline Â· saved locally'}</span></div><button className="sync-button" onClick={syncNow} disabled={!online || !syncStatus.configured || syncing} title="Sync now"><RefreshCw size={14} className={syncing ? 'spin' : ''} />{syncing ? 'Syncingâ€¦' : 'Sync now'}</button><small>{syncStatus.lastError || (syncConflicts.length ? `${syncConflicts.length} change${syncConflicts.length === 1 ? '' : 's'} need review.` : online ? 'Sales are always saved locally first.' : 'Changes will sync when internet returns.')}</small></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><p className="eyebrow">{user.name} Â· {user.role}</p><h1>{active === 'Inventory' ? 'Inventory' : active === 'POS' ? 'Point of sale' : active === 'Wallet' ? 'Wallet' : active === 'Owner' ? 'Owner dashboard' : active === 'Settings' ? 'Admin settings' : 'Good morning'}</h1></div><div className="top-actions"><PageOptions onRefresh={refreshLocalView} busy={refreshingView || syncing} /><button className="icon-button" title="Filter"><SlidersHorizontal size={18} /></button><span className="avatar" aria-hidden="true">{user.name.slice(0, 2).toUpperCase()}</span><AsyncButton busyLabel="Signing out..." className="text-button logout-button" onClick={logout}>Log out</AsyncButton></div></header>
      {active === 'Overview' && canManageOperations && <>
        <section className="hero-row"><div><h2>Business at a glance</h2><p>Keep your shelves moving and your team in the know.</p></div><button className="primary-button" onClick={() => setShowAdd(true)}><Plus size={18} />Add product</button></section>
        <section className="metric-grid"><div className="metric-card"><span>Inventory value</span><strong>{formatMoney(totalValue)}</strong><small>Based on current local stock and unit prices</small></div><div className="metric-card"><span>Items in stock</span><strong>{products.reduce((sum, product) => sum + product.stock, 0)}</strong><small>Across {products.length} products</small></div><div className="metric-card alert-card"><span>Needs attention</span><strong>{lowStock.length}</strong><small>{lowStock.length ? 'Products below reorder point' : 'All stock levels healthy'}</small></div></section>
        <section className="content-grid"><div className="panel inventory-panel"><div className="panel-heading"><div><h3>Inventory snapshot</h3><p>Recent stock levels across your catalogue</p></div><button className="text-button" onClick={() => setActive('Inventory')}>View all <ArrowUpToLine size={15} /></button></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Stock level</th><th>Updated</th><th></th></tr></thead><tbody>{filteredProducts.slice(0, 5).map((product) => <ProductRow key={product.id} product={product} updateStock={updateStock} money={formatMoney} />)}</tbody></table></div></div><div className="panel attention-panel"><div className="panel-heading"><div><h3>Needs attention</h3><p>Reorder before you run out</p></div><AlertTriangle size={19} className="warning-icon" /></div>{lowStock.length === 0 ? <div className="empty-state">Everything is in good shape.</div> : lowStock.map((product) => <div className="alert-row" key={product.id}><div className="product-icon">{product.name.slice(0, 1)}</div><div><strong>{product.name}</strong><span>{product.stock} {product.unit}s left Â· reorder at {product.reorder}</span></div><button onClick={() => updateStock(product.id, product.reorder * 2)} title="Restock"><PackagePlus size={17} /></button></div>)}</div></section>
      </>}
      {active === 'Inventory' && <section className="panel full-panel"><div className="panel-heading"><div><h2>All inventory</h2><p>Adjust counts as stock comes in or goes out.</p></div><button className="primary-button" onClick={() => setShowAdd(true)}><Plus size={18} />Add product</button></div><div className="search-row"><div className="search-box"><Search size={17} /><input placeholder="Search or scan barcode" value={query} onChange={(event) => setQuery(event.target.value)} /></div><button className="filter-button" onClick={() => scanBarcode()}><ScanLine size={16} />Scan</button></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Stock</th><th>Unit price</th><th>Updated</th><th></th></tr></thead><tbody>{filteredProducts.map((product) => <ProductRow key={product.id} product={product} updateStock={updateStock} money={formatMoney} detailed />)}</tbody></table></div></section>}
      {active === 'Stocktake' && <section className="panel full-panel"><div className="panel-heading"><div><h2>Physical stock take</h2><p>Count what is physically on the shelf and approve the variance.</p></div>{!stocktake || stocktake.status === 'approved' ? <AsyncButton busyLabel="Starting stocktake..." className="primary-button" onClick={startStocktake}><CheckSquare size={17} />Start stock take</AsyncButton> : <AsyncButton busyLabel="Approving..." className="primary-button" onClick={approveStocktakeSession}>Approve adjustments</AsyncButton>}</div>{!stocktake ? <div className="empty-state">Start a session to compare expected stock with physical counts.</div> : <><div className="search-row"><label className="settings-form" style={{ width: '100%' }}><span>Approval reason</span><input value={stocktakeReason} onChange={(event) => setStocktakeReason(event.target.value)} disabled={stocktake.status === 'approved'} /></label></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>Expected</th><th>Counted</th><th>Variance</th></tr></thead><tbody>{stocktake.counts.map((count) => <tr key={count.id}><td><strong>{count.name}</strong><span className="table-subtext">{count.sku}</span></td><td>{count.expected}</td><td><input className="count-input" type="number" min="0" value={count.counted} disabled={stocktake.status === 'approved'} onChange={(event) => updateCount(count.id, Number(event.target.value))} /></td><td className={count.variance === 0 ? 'muted' : count.variance < 0 ? 'low-stock' : 'positive'}>{count.variance > 0 ? '+' : ''}{count.variance}</td></tr>)}</tbody></table></div>{stocktake.history && stocktake.history.length > 0 && <div className="panel"><div className="panel-heading"><div><h3>Audit history</h3><p>Recorded adjustments from this stock-take session.</p></div></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>Expected</th><th>Counted</th><th>Variance</th><th>Reason</th></tr></thead><tbody>{stocktake.history.map((entry) => <tr key={entry.id}><td><strong>{entry.name}</strong><span className="table-subtext">{entry.sku}</span></td><td>{entry.expected}</td><td>{entry.counted}</td><td className={entry.variance === 0 ? 'muted' : entry.variance < 0 ? 'low-stock' : 'positive'}>{entry.variance > 0 ? '+' : ''}{entry.variance}</td><td>{entry.reason}</td></tr>)}</tbody></table></div></div>}</>}</section>}
      {active === 'POS' && <section className="pos-layout"><div className="panel"><div className="panel-heading"><div><h2>Sell products</h2><p>Search or scan a barcode to add an item.</p></div><button className="icon-button" onClick={() => scanBarcode()} title="Scan barcode"><ScanLine size={20} /></button></div><div className="search-box pos-search"><Search size={17} /><input autoFocus onKeyDown={event => { if (event.key === scannerSettings().suffix) { event.preventDefault(); acceptBarcode(query) } }} placeholder="Search or scan barcode" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="pos-products">{filteredProducts.map((product) => <button className="pos-product" key={product.id} onClick={() => addToCart(product)}><div className="product-icon">{product.name.slice(0, 1)}</div><span><strong>{product.name}</strong><small>{product.stock} {product.unit}s available</small></span><b>{formatMoney(product.price)}</b></button>)}</div></div><div className="panel cart-panel"><div className="panel-heading"><div><h2>Current sale</h2><p>{cartProducts.length} products</p></div><ShoppingCart size={20} /></div>{cartProducts.length === 0 ? <div className="empty-state">Scan or select a product to begin.</div> : cartProducts.map((product) => <div className="cart-row" key={product.id}><div><strong>{product.name}</strong><span>{cart[product.id]} Ã— {formatMoney(product.price)}</span></div><button onClick={() => removeFromCart(product.id)}><X size={15} /></button></div>)}<div className="payment-options"><label>Payment method<select value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value as Sale['paymentMethod']); setCashReceived(''); setPaymentReference(''); setExtraKept('0'); setExtraReason(''); setExtraNote('') }}><option value="external-pos">External POS terminal</option><option value="cash">Cash</option>{!isBrowserPwa() && <option value="wallet">Customer wallet</option>}</select></label>{paymentMethod === 'cash' && <><label>Cash received<input type="number" inputMode="decimal" min="0" step="0.01" value={cashReceived} onChange={event => setCashReceived(event.target.value)} placeholder="Amount handed over by customer" /></label><p role="status">{cashError || `Change to give: ${formatMoney(changeDue)}`}</p></>}{paymentMethod === 'external-pos' && <><p className="settings-message">{manualTerminalAllowed ? 'Manual confirmation: verify payment on the terminal before recording this sale.' : 'Terminal integration unavailable. Manual confirmation is disabled in Admin Settings.'}</p><label>Terminal provider<input placeholder="Your provider name" value={terminalProvider} onChange={(event) => setTerminalProvider(event.target.value)} /></label><label>Terminal reference<input onKeyDown={event => { if (event.key === scannerSettings().suffix) { event.preventDefault(); acceptPaymentReference(event.currentTarget.value) } }} placeholder="Approval/reference number" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></label><button type="button" className="filter-button" onClick={() => scanBarcode('payment')}>Scan payment reference</button><small>Scan the receipt barcode/QR, or type its reference. Check the approved status, amount and currency before completing the sale.</small><ReceiptPhoto total={cartTotal} onReference={setPaymentReference} /></>}{paymentMethod !== 'wallet' && extraPaymentPolicy.allowExtras && <><label>Extra amount retained<input type="number" inputMode="decimal" min="0" step="0.01" value={extraKept} onChange={event => setExtraKept(event.target.value)} /></label>{Number(extraKept || 0) > 0 && <><label>Reason<select value={extraReason} onChange={event => setExtraReason(event.target.value)}><option value="">Select a reason</option>{extraPaymentPolicy.reasons.map(reason => <option key={reason} value={reason}>{reason === 'tip' ? 'Voluntary tip' : reason === 'rounding' ? 'Agreed rounding' : reason === 'donation' ? 'Voluntary donation' : 'Other'}</option>)}</select></label>{extraReason === 'other' && <label>Explanation<input maxLength={500} value={extraNote} onChange={event => setExtraNote(event.target.value)} required /></label>}</>}</>}</div><div className="cart-total"><span>Total</span><strong>{formatMoney(cartTotal)}</strong></div><AsyncButton busyLabel="Completing sale..." className="primary-button checkout-button" disabled={!cartProducts.length || (paymentMethod === 'cash' && Boolean(cashError)) || (paymentMethod === 'external-pos' && (!manualTerminalAllowed || !terminalProvider.trim() || !paymentReference.trim()))} onClick={completeSale}>Complete sale</AsyncButton></div></section>}
      {active === 'POS' && <section className="panel full-panel"><h3>More payment options</h3><p>Use these options for bank transfers or a sale paid with more than one method.</p><div className="report-actions"><button type="button" className="filter-button" onClick={() => setPaymentMethod('bank-transfer')}>Bank transfer</button><button type="button" className="filter-button" onClick={() => setPaymentMethod('multiple')}>Split payment</button></div>{paymentMethod === 'bank-transfer' && <div className="payment-options"><label>Bank or transfer provider<input value={transferProvider} onChange={event => setTransferProvider(event.target.value)} placeholder="e.g. Bank name" /></label><label>Transfer reference<input value={transferReference} onChange={event => setTransferReference(event.target.value)} placeholder="Approved transfer reference" /></label><small>Confirm the transfer amount and status before completing the sale.</small></div>}{paymentMethod === 'multiple' && <div className="payment-options"><p>Split amounts must add up to the sale total exactly. Cash change and retained extras are not available on split sales.</p><label>Cash portion<input type="number" min="0" step="0.01" value={splitCash} onChange={event => setSplitCash(event.target.value)} /></label><label>Terminal portion<input type="number" min="0" step="0.01" value={splitTerminal} onChange={event => setSplitTerminal(event.target.value)} /></label>{Number(splitTerminal) > 0 && <label>Terminal reference<input value={splitTerminalReference} onChange={event => setSplitTerminalReference(event.target.value)} /></label>}<label>Bank-transfer portion<input type="number" min="0" step="0.01" value={splitTransfer} onChange={event => setSplitTransfer(event.target.value)} /></label>{Number(splitTransfer) > 0 && <><label>Bank or transfer provider<input value={transferProvider} onChange={event => setTransferProvider(event.target.value)} /></label><label>Transfer reference<input value={transferReference} onChange={event => setTransferReference(event.target.value)} /></label></>}<p role="status">Split total: {formatMoney(Number(splitCash || 0) + Number(splitTerminal || 0) + Number(splitTransfer || 0))} / {formatMoney(cartTotal)}</p></div>}</section>}
      {active === 'Inventory' && <ProductIntake create={importProduct} products={products} defaultUnit={defaultUnit} />}
      {active === 'Settings' && user.role === 'owner' && <section className="panel full-panel"><h3>Business type</h3><p>Choose the kind of goods you primarily sell. It only sets the default unit for new products and imports; existing records stay unchanged.</p><div className="settings-form"><BusinessProfileSettings value={businessMode} onChange={value => { setBusinessMode(value); localStorage.setItem('stockroom-business-mode', value); setSettingsMessage('Business type saved on this device.') }} /></div></section>}
      {active === 'Display' && <CustomerDisplayPairing pairing={displayPairing} createPairing={createDisplayPairing} openSecondMonitor={openCustomerDisplayOnSecondMonitor} />}
      {(active === 'POS' || active === 'Display') && displayError && <div role="alert" className="auth-error">{displayError}<button className="filter-button" onClick={() => setDisplayRetry(value => value + 1)}>Retry display update</button></div>}
      {receiptError && <p role="alert" className="auth-error">{receiptError}</p>}
      {(active === 'POS' || active === 'Sales') && <section className="panel full-panel"><h2>Receipt history</h2><p>Saved receipts on this device, newest first. Older receipts without snapshots use current business and currency settings.</p>{allReceipts.length ? allReceipts.map(receipt => <div className="customer-row" key={receipt.id}><div><strong>{new Date(receipt.createdAt).toLocaleString()}</strong><small>{receipt.id} ? {receipt.paymentReference || receipt.paymentMethod}</small></div><AsyncButton className="filter-button" busyLabel="Printing..." onClick={() => printReceipt(receipt)}>Reprint receipt</AsyncButton></div>) : <p>No saved receipts yet.</p>}</section>}
      {active === 'Sales' && canManageOperations && <Reconciliation key={user.organizationId} sales={allReceipts} />}
      {active === 'Sales' && <><PaymentEvidence sales={allReceipts} money={formatMoney} /><section className="panel full-panel"><div className="panel-heading"><div><h2>Sales history</h2><p>Completed sales saved on this device.</p></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Items</th><th>Payment</th><th>Total</th></tr></thead><tbody>{sales.length ? sales.map((sale) => <tr key={sale.id}><td>{new Date(sale.createdAt).toLocaleString()}</td><td>{sale.items.map((item) => `${item.quantity} Ã— ${item.productName}`).join(', ') || 'Legacy sale'}</td><td>{sale.paymentMethod}{sale.paymentReference ? ` Â· ${sale.paymentReference}` : ''}</td><td>{formatMoney(sale.total)}</td></tr>) : <tr><td colSpan={4} className="empty-state">No completed sales yet.</td></tr>}</tbody></table></div></section></>}
      {active === 'Movements' && <section className="panel full-panel"><div className="panel-heading"><div><h2>Stock movements</h2><p>Every sale, adjustment, and approved stock-take is recorded here.</p></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Product</th><th>Change</th><th>Reason</th></tr></thead><tbody>{movements.length ? movements.map((movement) => <tr key={movement.id}><td>{new Date(movement.createdAt).toLocaleString()}</td><td><strong>{movement.productName}</strong><span className="table-subtext">{movement.sku}</span></td><td className={movement.quantity < 0 ? 'low-stock' : 'positive'}>{movement.quantity > 0 ? '+' : ''}{movement.quantity}</td><td>{movement.reason}</td></tr>) : <tr><td colSpan={4} className="empty-state">No stock movements yet.</td></tr>}</tbody></table></div></section>}
      {active === 'Wallet' && <section className="wallet-grid"><div className="panel customer-wallet-panel"><div className="panel-heading"><div><h2>Customer wallets</h2><p>Positive balance is customer credit. Debit it when they buy on credit.</p></div><WalletCards size={20} /></div><AsyncForm className="form-grid" busyLabel="Adding customer..." onSubmit={addCustomer}><label>Customer name<input value={newCustomerName} onChange={(event) => setNewCustomerName(event.target.value)} required placeholder="Customer name" /></label><label>Phone number<input value={newCustomerPhone} onChange={(event) => setNewCustomerPhone(event.target.value)} placeholder="Optional" /></label><SubmitButton className="primary-button" type="submit">Add customer</SubmitButton></AsyncForm>{customers.length ? customers.map((customer) => <div className="customer-row" key={customer.id}><div><strong>{customer.name}</strong><small>{customer.phone || 'No phone saved'}</small></div><b className={customer.balance ? 'wallet-positive' : ''}>{formatMoney(customer.balance)}</b><button onClick={() => adjustWallet(customer.id, 10)}>+ {formatMoney(10)}</button><button onClick={() => adjustWallet(customer.id, -10)} disabled={customer.balance < 10}>- {formatMoney(10)}</button></div>) : <div className="empty-state">Add your first customer to begin managing wallet credit.</div>}</div></section>}
      {active === 'Owner' && <OwnerDashboard token={authToken} currency={currency} />}
      {active === 'Reports' && <ReportsDashboard reports={reports} currency={currency} expenses={expenses} exportCsv={exportSalesCsv} addExpense={addExpense} />}
      {active === 'Sync' && <SyncIssues conflicts={syncConflicts} resolveConflict={resolveConflict} />}
      {active === 'Team' && <TeamManagement staff={staff} addStaff={addStaff} setCashierAccess={setCashierAccess} canCreateStaff={user.role === 'owner'} message={settingsMessage} />}
      {active === 'Settings' && user.role === 'admin' && <section className="panel full-panel"><DeviceSetup key={user.organizationId} businessId={user.organizationId} defaultProvider={posProvider} onTerminalSaved={() => setTerminalRevision(value => value + 1)} createPairing={createDisplayPairing} openSecondMonitor={openCustomerDisplayOnSecondMonitor} pairing={displayPairing} scan={() => scanBarcode('setup')} /></section>}
      {active === 'Settings' && user.role === 'owner' && <section className="panel full-panel logo-settings"><h3>Business logo</h3><p>PNG, JPEG, or WebP up to 1 MB. It syncs to enrolled devices when you save business settings.</p>{logoData && <img src={logoData} alt="Business logo preview" className="settings-logo-preview" />}<label className="logo-upload-control"><strong>Upload logo</strong><input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo} /></label></section>}
      {active === 'Settings' && user.role === 'owner' && <section className="panel full-panel settings-panel"><div className="panel-heading"><div><h2>Business settings</h2><p>Customize the identity your team sees across the app.</p></div><Settings2 size={20} /></div><AsyncForm className="settings-form" busyLabel="Saving settings..." onSubmit={saveAppName}><label>App name<span>This appears in the sidebar and installed app.</span><input value={appName} maxLength={60} onChange={(event) => { setAppName(event.target.value); setSettingsMessage('') }} /></label><label>Currency<span>Used for product prices, wallets, sales, and receipts.</span><select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="USD">USD - US Dollar</option><option value="NGN">NGN - Nigerian Naira</option><option value="GHS">GHS - Ghanaian Cedi</option><option value="KES">KES - Kenyan Shilling</option><option value="GBP">GBP - Pound Sterling</option><option value="EUR">EUR - Euro</option></select></label><label>Default payment-terminal provider<span>Shared business default. Each checkout can override it in Payment terminal settings below.</span><input value={posProvider} placeholder="e.g. OPay" maxLength={100} onChange={(event) => setPosProvider(event.target.value)} /></label><PaymentPolicySettings value={extraPaymentPolicy} onChange={setExtraPaymentPolicy} /><SubmitButton className="primary-button">Save business settings <ArrowUpToLine size={17} /></SubmitButton>{settingsMessage && <p className="settings-message">{settingsMessage}</p>}</AsyncForm><DeviceSetup key={user.organizationId} businessId={user.organizationId} defaultProvider={posProvider} onTerminalSaved={() => setTerminalRevision(value => value + 1)} createPairing={createDisplayPairing} openSecondMonitor={openCustomerDisplayOnSecondMonitor} pairing={displayPairing} scan={() => scanBarcode('setup')} />{!isBrowserPwa() && <AsyncForm className="settings-form" busyLabel="Updating password..." onSubmit={changePassword}><h3>Change password</h3><label>Current password<input name="currentPassword" type="password" placeholder="Current password" /></label><label>New password<input name="newPassword" type="password" placeholder="New password" /></label><label>Confirm password<input name="confirmPassword" type="password" placeholder="Confirm new password" /></label><SubmitButton className="primary-button" type="submit">Update password</SubmitButton>{passwordMessage && <p className="settings-message">{passwordMessage}</p>}</AsyncForm>}{isBrowserPwa() && <p className="settings-message">To reset your cloud password, log out and choose Forgot password on the sign-in screen.</p>}</section>}
    </main>
    {showAdd && <div className="modal-backdrop" onMouseDown={() => { if (!document.querySelector('form.modal[aria-busy="true"]')) setShowAdd(false) }}><AsyncForm className="modal" busyLabel="Saving product..." onSubmit={addProduct} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><h2>Add product</h2><p>It will be saved on this device immediately.</p></div><button type="button" className="icon-button" onClick={() => setShowAdd(false)}><X size={19} /></button></div><div className="form-grid"><label>Product name<input name="name" required placeholder="e.g. Espresso beans" /></label><label>Barcode<input name="barcode" placeholder="Scan or enter product barcode" /></label><label>SKU<input name="sku" required placeholder="COF-001" /></label><label>Category<input name="category" required placeholder="Beverages" /></label><label>Unit<input name="unit" required placeholder="bag" /></label><label>Starting stock<input name="stock" type="number" min="0" required defaultValue="0" /></label><label>Reorder point<input name="reorder" type="number" min="0" required defaultValue="10" /></label><label>Unit price<input name="price" type="number" min="0" step="0.01" required defaultValue="0" /></label></div><SubmitButton className="primary-button submit-button">Save product <ArrowUpToLine size={17} /></SubmitButton></AsyncForm></div>}
    {scanning && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="Scan barcode"><h2>Scan barcode</h2><video ref={cameraVideo} muted playsInline style={{ width: '100%' }} /><button className="primary-button" onClick={stopScan}>Cancel scan</button></section></div>}
    {lastReceipt && active === 'POS' && <button className="filter-button" onClick={() => { void printReceipt(lastReceipt).catch(error => window.alert(error.message)) }}>Print last receipt</button>}
    {lastReceipt && <div className="print-receipt"><h2>{lastReceipt.businessName || appName}</h2><p>Receipt: {lastReceipt.id}</p>{(!lastReceipt.currency || !lastReceipt.businessName) && <p>Historical currency/business identity unavailable; current settings used.</p>}<p>{new Date(lastReceipt.createdAt).toLocaleString()}</p>{lastReceipt.items.map((item) => <p key={item.productId}>{item.productName || item.productId}<br />{item.quantity} Ã— {new Intl.NumberFormat(undefined, { style: 'currency', currency: lastReceipt.currency || currency }).format(item.price)}</p>)}<strong>Total: {new Intl.NumberFormat(undefined, { style: 'currency', currency: lastReceipt.currency || currency }).format(lastReceipt.total)}</strong>{lastReceipt.paymentMethod === 'cash' && lastReceipt.cashReceived != null && <><p>Cash received: {new Intl.NumberFormat(undefined, { style: 'currency', currency: lastReceipt.currency || currency }).format(lastReceipt.cashReceived)}</p><p>Change given: {new Intl.NumberFormat(undefined, { style: 'currency', currency: lastReceipt.currency || currency }).format(lastReceipt.changeGiven ?? 0)}</p></>}<p>Payment: {lastReceipt.paymentMethod === 'external-pos' ? 'POS terminal' : lastReceipt.paymentMethod === 'cash' ? 'Cash' : 'Customer wallet'}</p>{lastReceipt.paymentMethod === 'external-pos' && <>{lastReceipt.terminalProvider && <p>Provider: {lastReceipt.terminalProvider}</p>}{lastReceipt.paymentReference && <p>Reference: {lastReceipt.paymentReference}</p>}</>}{lastReceipt.paymentDetails?.printExtraDetails && lastReceipt.paymentDetails.extraKept > 0 && <p>Extra retained: {formatMoney(lastReceipt.paymentDetails.extraKept)} ({lastReceipt.paymentDetails.reason}){lastReceipt.paymentDetails.note ? ` — ${lastReceipt.paymentDetails.note}` : ''}</p>}</div>}
  </div>
}

function ProductRow({ product, updateStock, money, detailed = false }: { product: Product; updateStock: (id: string, amount: number) => void; money: (amount: number) => string; detailed?: boolean }) {
  const isLow = product.stock <= product.reorder
  return <tr><td><div className="product-cell"><div className="product-icon">{product.name.slice(0, 1)}</div><div><strong>{product.name}</strong>{!detailed && <span>{product.sku}</span>}</div></div></td>{detailed && <td className="muted">{product.sku}</td>}<td className="muted">{product.category}</td><td><div className="stock-cell"><strong className={isLow ? 'low-stock' : ''}>{product.stock}</strong><span>{product.unit}s</span></div></td>{detailed && <td className="muted">{money(product.price)}</td>}<td className="muted">{product.updated}</td><td><div className="row-actions"><button onClick={() => updateStock(product.id, -1)} title="Remove one"><ArrowDownToLine size={15} /></button><button onClick={() => updateStock(product.id, 1)} title="Add one"><ArrowUpToLine size={15} /></button></div></td></tr>
}

function LoginScreen({ onLogin, error, setError }: { onLogin: (email: string, password: string) => Promise<void>; error: string; setError: (value: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState<'login' | 'request' | 'confirm'>('login')
  const [resetCode, setResetCode] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const resetView = () => { setError(''); setMessage('') }
  const returnToLogin = () => { resetView(); setMode('login') }

  if (mode === 'request') return <main className="login-screen"><AsyncForm busyLabel="Sending reset code..." className="login-card" onSubmit={async (event) => {
    event.preventDefault(); if (submitting) return; setSubmitting(true); resetView()
    try {
      const response = await fetch('/api/auth/password-reset/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to request a reset email.')
      setMessage('If this email has a cloud account, a reset code has been sent. Check your inbox and spam folder.')
      setMode('confirm')
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to request a reset email.') } finally { setSubmitting(false) }
  }}><div className="brand-mark"><Boxes size={21} /></div><h1>Reset your password</h1><p>Enter the email used for this business. This needs an internet connection.</p><label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@yourshop.com" /></label>{error && <div className="auth-error">{error}</div>}<SubmitButton className="primary-button login-button">Send reset code</SubmitButton><button type="button" className="text-button" onClick={returnToLogin}>Back to sign in</button></AsyncForm></main>

  if (mode === 'confirm') return <main className="login-screen"><AsyncForm busyLabel="Updating password..." className="login-card" onSubmit={async (event) => {
    event.preventDefault(); if (submitting) return; setSubmitting(true); resetView()
    try {
      const response = await fetch('/api/auth/password-reset/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: resetCode, password: resetPassword }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to reset the password.')
      setResetCode(''); setResetPassword(''); setMessage('Password updated. You can now sign in with your new password.'); setMode('login')
    } catch (confirmError) { setError(confirmError instanceof Error ? confirmError.message : 'Unable to reset the password.') } finally { setSubmitting(false) }
  }}><div className="brand-mark"><Boxes size={21} /></div><h1>Enter reset code</h1><p>{message || 'Use the reset code from your email, then choose a new password.'}</p><label>Reset code<input required value={resetCode} onChange={(event) => setResetCode(event.target.value)} autoComplete="one-time-code" placeholder="Code from your email" /></label><label>New password<input type="password" minLength={10} required value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} autoComplete="new-password" placeholder="At least 10 characters" /></label>{error && <div className="auth-error">{error}</div>}<SubmitButton className="primary-button login-button">Update password</SubmitButton><button type="button" className="text-button" onClick={() => { resetView(); setMode('request') }}>Use a different email</button></AsyncForm></main>

  return <main className="login-screen"><AsyncForm busyLabel="Signing in..." className="login-card" onSubmit={async (event) => { event.preventDefault(); setError(''); try { await onLogin(email, password) } catch (loginError) { setError(loginError instanceof Error ? loginError.message : 'Unable to sign in.') } }}><div className="brand-mark"><Boxes size={21} /></div><h1>Sign in to your shop</h1><p>Run your store online or offline.</p><label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@yourshop.com" /></label><label>Password<div className="password-wrap"><input type={showPassword ? 'text' : 'password'} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" /><button type="button" className="icon-button password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label><button type="button" className="text-button forgot-password" onClick={() => { resetView(); setMode('request') }}>Forgot password?</button>{error && <div className="auth-error">{error}</div>}{message && <p className="settings-message">{message}</p>}<SubmitButton className="primary-button login-button">Sign in</SubmitButton></AsyncForm></main>
}

function SetupScreen({ onCreate, error, setError }: { onCreate: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; error: string; setError: (value: string) => void }) {
  return <main className="login-screen"><AsyncForm busyLabel="Creating account..." className="login-card" onSubmit={async (event) => { event.preventDefault(); setError(''); try { await onCreate(event) } catch (loginError) { setError(loginError instanceof Error ? loginError.message : 'Unable to create your business account.') } }}><div className="brand-mark"><Boxes size={21} /></div><h1>Set up your shop</h1><p>Create the first owner account for this store.</p><label>Business name<input name="shopName" required placeholder="My Business" /></label><label>Owner name<input name="ownerName" required placeholder="John Doe" /></label><label>Email<input name="email" type="email" required placeholder="owner@yourshop.com" /></label><label>Password<div className="password-wrap"><input name="password" type="password" required placeholder="Create a password" /><button type="button" className="icon-button password-toggle" aria-label="Show password" onClick={(event) => { const input = (event.currentTarget.parentElement?.querySelector('input') as HTMLInputElement | null); if (!input) return; const shouldShow = input.type === 'password'; input.type = shouldShow ? 'text' : 'password'; event.currentTarget.setAttribute('aria-label', shouldShow ? 'Hide password' : 'Show password'); }}><Eye size={16} /></button></div></label><p className="settings-message">Your database is configured by the developer. After payment, the owner can change their password from Admin settings.</p>{error && <div className="auth-error">{error}</div>}<SubmitButton className="primary-button login-button">Create owner account</SubmitButton></AsyncForm></main>
}

function OwnerDashboard({ token, currency }: { token: string; currency: string }) {
  const [metrics, setMetrics] = useState<{ salesToday: number; saleCount: number; inventoryValue: number; productCount: number; lowStock: number } | null>(null)
  useEffect(() => { fetch('/api/owner/metrics', { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.ok ? response.json() : Promise.reject()).then(setMetrics).catch(() => undefined) }, [token])
  const money = (amount: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  return <section className="owner-dashboard"><div className="metric-grid"><div className="metric-card"><span>Sales recorded</span><strong>{metrics ? money(metrics.salesToday) : 'â€”'}</strong><small>Synced sales total</small></div><div className="metric-card"><span>Transactions</span><strong>{metrics?.saleCount ?? 'â€”'}</strong><small>Completed receipts</small></div><div className="metric-card alert-card"><span>Low stock</span><strong>{metrics?.lowStock ?? 'â€”'}</strong><small>Items needing attention</small></div></div><div className="panel owner-panel"><h2>Business monitoring</h2><p>Inventory value: <strong>{metrics ? money(metrics.inventoryValue) : 'â€”'}</strong> across {metrics?.productCount ?? 'â€”'} products.</p><p>Sales made offline are included after they synchronize.</p></div></section>
}

function TeamManagement({ staff, addStaff, setCashierAccess, canCreateStaff, message }: { staff: StaffUser[]; addStaff: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; setCashierAccess: (id: string, enabled: boolean) => Promise<void>; canCreateStaff: boolean; message: string }) {
  return <section className="panel full-panel team-management"><div className="panel-heading"><div><h2>Team management</h2><p>Cashiers start with POS-only access. An admin or owner can grant operational access when needed.</p></div><UserRoundCog size={20} /></div><div className="team-grid"><section><h3>Current team</h3><div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th>Created</th></tr></thead><tbody>{staff.length ? staff.map((member) => <tr key={member.id}><td><strong>{member.name}</strong></td><td>{member.email}</td><td><span className={`role-badge ${member.role}`}>{member.role}</span></td><td>{member.role === 'cashier' ? <label><input type="checkbox" checked={Boolean(member.operationalAccess)} onChange={(event) => setCashierAccess(member.id, event.target.checked)} /> Operational</label> : 'Full role access'}</td><td>{new Date(member.createdAt).toLocaleDateString()}</td></tr>) : <tr><td colSpan={5} className="empty-state">Loading team accountsâ€¦</td></tr>}</tbody></table></div></section>{canCreateStaff && <AsyncForm className="settings-form team-form" busyLabel="Creating account..." onSubmit={addStaff}><h3>Add team member</h3><label>Full name<input name="name" required maxLength={100} placeholder="e.g. Ada Okafor" /></label><label>Email address<input name="email" type="email" required placeholder="ada@yourbusiness.com" /></label><label>Access role<select name="role" defaultValue="cashier"><option value="cashier">Cashier â€” POS only by default</option><option value="admin">Admin â€” manage stock and operations</option></select></label><label>Temporary password<input name="password" type="password" minLength={8} required placeholder="At least 8 characters" /></label><SubmitButton className="primary-button" type="submit">Create account <UserRoundCog size={17} /></SubmitButton></AsyncForm>}</div>{message && <p className="settings-message">{message}</p>}</section>
}

function ReportsDashboard({ reports, currency, expenses, exportCsv, addExpense }: { reports: Reports | null; currency: string; expenses: Expense[]; exportCsv: () => Promise<void>; addExpense: (event: React.FormEvent<HTMLFormElement>) => Promise<void> }) {
  const money = (amount: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  const summary = reports || { daily: { total: 0, count: 0 }, weekly: { total: 0, count: 0 }, monthly: { total: 0, count: 0 }, inventory: { value: 0, products: 0, lowStock: 0 }, profit: { revenue: 0, cost: 0, expenses: 0, amount: 0 } }
  return <section className="reports-dashboard"><div className="hero-row"><div><h2>Business reports</h2><p>Sales and inventory figures stored on this device.</p></div><div className="report-actions"><AsyncButton busyLabel="Exporting..." className="filter-button" onClick={exportCsv}><Download size={16} />Export CSV</AsyncButton><button className="primary-button" onClick={() => { void printDocument('report').catch(error => window.alert(error.message)) }}><Printer size={16} />{window.stockroomDesktop ? 'Print A4 report' : 'Print / Save PDF'}</button></div></div><section className="metric-grid"><ReportMetric label="Todayâ€™s sales" value={money(summary.daily.total)} note={`${summary.daily.count} transaction${summary.daily.count === 1 ? '' : 's'}`} /><ReportMetric label="This week" value={money(summary.weekly.total)} note={`${summary.weekly.count} transaction${summary.weekly.count === 1 ? '' : 's'}`} /><ReportMetric label="This month" value={money(summary.monthly.total)} note={`${summary.monthly.count} transaction${summary.monthly.count === 1 ? '' : 's'}`} /></section><section className="metric-grid report-secondary"><ReportMetric label="Stock valuation" value={money(summary.inventory.value)} note={`${summary.inventory.products} products at selling price`} /><ReportMetric label="Estimated net profit" value={money(summary.profit.amount)} note={`${money(summary.profit.revenue)} revenue Â· ${money(summary.profit.cost)} cost Â· ${money(summary.profit.expenses)} expenses`} /><ReportMetric label="Low-stock products" value={String(summary.inventory.lowStock)} note="At or below their reorder point" /></section><section className="team-grid"><section className="panel"><h3>Recent expenses</h3>{expenses.length ? expenses.slice(0, 8).map((expense) => <div className="customer-row" key={expense.id}><div><strong>{expense.description}</strong><small>{expense.category} Â· {new Date(expense.incurredAt).toLocaleDateString()}</small></div><b>{money(expense.amount)}</b></div>) : <div className="empty-state">No expenses recorded yet.</div>}</section><AsyncForm className="settings-form team-form" busyLabel="Saving expense..." onSubmit={addExpense}><h3>Record expense</h3><label>Category<input name="category" required placeholder="Rent, transport, utilities" /></label><label>Description<input name="description" required placeholder="What was paid for?" /></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Date<input name="incurredAt" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label><SubmitButton className="primary-button">Save expense</SubmitButton></AsyncForm></section><section className="panel report-note"><h3>About profit</h3><p>Profit subtracts recorded product cost and recorded expenses. Older sales without a saved cost remain revenue-only.</p></section></section>
}

function ReportMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
}

function SyncIssues({ conflicts, resolveConflict }: { conflicts: SyncConflict[]; resolveConflict: (id: string) => Promise<void> }) {
  return <section className="panel full-panel"><div className="panel-heading"><div><h2>Sync issues</h2><p>Sales and stock movements are never discarded. These are competing edits to mutable records from another device.</p></div><RefreshCw size={20} /></div>{conflicts.length ? <div className="table-wrap"><table><thead><tr><th>Record type</th><th>Reason</th><th>Detected</th><th></th></tr></thead><tbody>{conflicts.map((conflict) => <tr key={conflict.id}><td>{conflict.entityType}</td><td>{conflict.reason}</td><td>{new Date(conflict.createdAt).toLocaleString()}</td><td><button className="filter-button" onClick={() => resolveConflict(conflict.id)}>Mark reviewed</button></td></tr>)}</tbody></table></div> : <div className="empty-state">No sync conflicts need review.</div>}</section>
}

function InstallerScreen({ onActivate, message }: { onActivate: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; message: string }) {
  const [mode, setMode] = useState<'new' | 'existing'>('existing')
  return <main className="login-screen"><AsyncForm className="login-card installer-card" busyLabel="Activating device..." onSubmit={onActivate}><input type="hidden" name="mode" value={mode} /><div className="brand-mark"><Boxes size={21} /></div><h1>{mode === 'new' ? 'New client activation' : 'Add another device'}</h1><p>{mode === 'new' ? 'Installer-only: activate this client device before handing over the app.' : 'For the business owner: add this device to your existing business.'}</p>{!isBrowserPwa() && <div className="installer-tabs"><button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')}>New client</button><button type="button" className={mode === 'existing' ? 'active' : ''} onClick={() => setMode('existing')}>Existing business</button></div>}{mode === 'new' && <label>Client business ID<input name="businessId" required pattern="[a-z0-9][a-z0-9-]{2,80}" placeholder="client-business-001" /></label>}<label>Device ID<input name="deviceId" required pattern="[a-z0-9][a-z0-9-]{2,100}" placeholder="client-business-main-pc" /></label><label>Device label<input name="label" required maxLength={100} placeholder="Main checkout computer" /></label>{mode === 'new' ? <><label>Installer Admin API key<input name="adminApiKey" type="password" required autoComplete="off" placeholder="Private installer key" /></label><p className="installer-note">The app connects to the configured cloud service automatically. This key is sent only to the cloud service and is never saved.</p></> : <><label>Owner email<input name="ownerEmail" type="email" required placeholder="owner@business.com" /></label><label>Owner password<input name="ownerPassword" type="password" minLength={10} required autoComplete="current-password" placeholder="Cloud owner password" /></label><p className="installer-note">Your business is identified from the owner account. The password is used only to enroll this device and is not stored.</p></>}{message && <div className={message.startsWith('Installation activated') ? 'settings-message' : 'auth-error'}>{message}</div>}<SubmitButton className="primary-button login-button">{mode === 'new' ? 'Activate new client' : 'Add this device'}</SubmitButton></AsyncForm></main>
}

function CustomerDisplayPairing({ pairing, createPairing, openSecondMonitor }: { pairing: { url: string; code: string; expiresAt: string } | null; createPairing: () => Promise<void>; openSecondMonitor: () => Promise<void> }) {
  return <section className="panel full-panel pairing-panel"><div className="panel-heading"><div><h2>Customer display</h2><p>Share a read-only live order view with a customer or a second display on the same shop Wi-Fi.</p></div><Store size={20} /></div><ol><li>Connect the customer phone/tablet and checkout computer to the same private Wi-Fi.</li><li>Create a link and send or open it on that customer device within five minutes.</li><li>The customer can review the live basket and see the completed-sale confirmation, but cannot change anything.</li></ol><div className="report-actions">{window.stockroomDesktop && <AsyncButton busyLabel="Opening display..." className="primary-button" onClick={openSecondMonitor}>Open customer display on second monitor</AsyncButton>}<AsyncButton busyLabel="Creating link..." className="filter-button" onClick={createPairing}>Create customer share link</AsyncButton></div>{pairing && <section className="pairing-code"><span>Send or open this customer link</span><strong>{pairing.url}</strong><button className="filter-button" onClick={() => navigator.clipboard?.writeText(pairing.url).catch(() => window.prompt('Copy this customer link', pairing.url))}>Copy link</button><small>Pairing code: <b>{pairing.code}</b> Â· expires {new Date(pairing.expiresAt).toLocaleTimeString()}</small></section>}<p className="settings-message">After the link is opened, its read-only display session expires after 12 hours or when the checkout app restarts.</p></section>
}

createRoot(document.getElementById('root')!).render(<StrictMode>{window.location.pathname === '/customer-display' ? <main className="login-screen"><section className="login-card"><h1>Customer display</h1><p>Open a new pairing link from the checkout computer?s Customer display page.</p></section></main> : <App />}</StrictMode>)
