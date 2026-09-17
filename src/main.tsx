import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AlertTriangle, ArrowDownToLine, ArrowUpToLine, BarChart3, Boxes, CheckSquare, CloudOff, Download, Eye, EyeOff, LayoutDashboard, MoreHorizontal, PackagePlus, Plus, Printer, RefreshCw, Search, ScanLine, Settings2, ShoppingCart, SlidersHorizontal, Store, UserRoundCog, WalletCards, Wifi, X } from 'lucide-react'
import type { Customer, Product, Sale, Stocktake } from './types'
import { cacheProducts, getCachedProducts, getQueuedOperations, queueOperation, removeQueuedOperation, replaceQueuedProductId, saveSale, upsertCachedProducts } from './lib/offlineStore'
import { installMobileApi } from './lib/mobileApi'
import './styles.css'

installMobileApi()

if ('serviceWorker' in navigator && !navigator.userAgent.includes('Electron')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

type AppSettings = {
  appName: string
  currency: string
  posProvider: string
  posTerminalId: string
  posConnection: string
  updatedAt: string
  ownerConfigured?: boolean
  cloudConfigured?: boolean
  existingBusiness?: boolean
}

type User = { id: string; name: string; email: string; role: 'owner' | 'admin' | 'cashier'; operationalAccess?: boolean; organizationId: string }
type SaleRecord = { id: string; total: number; paymentMethod: string; paymentReference: string; terminalProvider: string; staffName?: string; createdAt: string; items: Array<{ productId: string; productName: string; quantity: number; unitPrice: number }> }
type Movement = { id: string; productName: string; sku: string; quantity: number; reason: string; createdAt: string }
type SyncStatus = { configured: boolean; pending: number; conflicts?: number; lastError: string; existingBusiness?: boolean }
type SyncConflict = { id: string; entityType: string; entityId: string; reason: string; createdAt: string }
type StaffUser = { id: string; name: string; email: string; role: 'owner' | 'admin' | 'cashier'; operationalAccess?: boolean; createdAt: string }
type Reports = { daily: { total: number; count: number }; weekly: { total: number; count: number }; monthly: { total: number; count: number }; inventory: { value: number; products: number; lowStock: number }; profit: { revenue: number; cost: number; expenses: number; amount: number } }
type Expense = { id: string; category: string; description: string; amount: number; incurredAt: string }

function App() {
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
  const [settingsMessage, setSettingsMessage] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [paymentMethod, setPaymentMethod] = useState<Sale['paymentMethod']>('external-pos')
  const [terminalProvider, setTerminalProvider] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [user, setUser] = useState<User | null>(() => JSON.parse(localStorage.getItem('stockroom-user') || 'null'))
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('stockroom-token') || '')
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
  const [lastReceipt, setLastReceipt] = useState<Sale | null>(null)
  const [stocktake, setStocktake] = useState<Stocktake | null>(null)
  const [stocktakeReason, setStocktakeReason] = useState('Approved after physical count')
  const [setupRequired, setSetupRequired] = useState(true)
  const [installerRequired, setInstallerRequired] = useState(true)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [installerMessage, setInstallerMessage] = useState('')
  const authHeaders: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {}

  useEffect(() => { document.title = appName }, [appName])
  useEffect(() => localStorage.setItem('stockroom-products', JSON.stringify(products)), [products])
  useEffect(() => {
    if (!authToken) return
    getCachedProducts().then((cached) => { if (cached.length) setProducts(cached) }).catch(() => undefined)
    fetch('/api/products', { headers: authHeaders }).then((response) => response.ok ? response.json() as Promise<{ products: Product[] }> : Promise.reject()).then((data) => {
      setProducts(data.products)
      cacheProducts(data.products).catch(() => undefined)
    }).catch(() => undefined)
  }, [authToken])
  useEffect(() => { if (canManageOperations) fetch('/api/customers', { headers: authHeaders }).then((response) => response.ok ? response.json() as Promise<{ customers: Customer[] }> : Promise.reject()).then((data) => setCustomers(data.customers)).catch(() => undefined) }, [authToken, user?.operationalAccess, user?.role])
  useEffect(() => { if (canManageOperations) fetch('/api/sales', { headers: authHeaders }).then((response) => response.ok ? response.json() as Promise<{ sales: SaleRecord[] }> : Promise.reject()).then((data) => setSales(data.sales)).catch(() => undefined) }, [authToken, user?.operationalAccess, user?.role])
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
  async function refreshSyncStatus() {
    const response = await fetch('/api/sync/status').catch(() => null)
    if (response?.ok) setSyncStatus(await response.json() as SyncStatus)
  }
  async function syncNow() {
    setSyncing(true)
    try {
      const response = await fetch('/api/sync/now', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } })
      if (response.ok) setSyncStatus(await response.json() as SyncStatus)
    } finally { setSyncing(false) }
  }
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
    await refreshSyncStatus()
  }
  async function resolveConflict(id: string) {
    const response = await fetch(`/api/sync/conflicts/${id}/resolve`, { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } })
    if (response.ok) setSyncConflicts((current) => current.filter((conflict) => conflict.id !== id))
  }
  async function createDisplayPairing() {
    const response = await fetch('/api/customer-display/pair', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } })
    if (response.ok) setDisplayPairing(await response.json() as { url: string; code: string; expiresAt: string })
  }
  useEffect(() => {
    refreshSyncStatus().catch(() => undefined)
    const interval = window.setInterval(() => refreshSyncStatus().catch(() => undefined), 15_000)
    return () => window.clearInterval(interval)
  }, [])
  async function syncQueuedOperations() {
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
    fetch('/api/settings').then((response) => response.ok ? response.json() as Promise<AppSettings & { ownerConfigured?: boolean; cloudConfigured?: boolean }> : Promise.reject()).then((settings) => {
      setAppName(settings.appName || 'My Business')
      setCurrency(settings.currency || 'USD')
      setPosProvider(settings.posProvider || '')
      setPosTerminalId(settings.posTerminalId || '')
      setPosConnection(settings.posConnection || 'manual')
      setSetupRequired(settings.ownerConfigured === false && settings.existingBusiness !== true)
      setInstallerRequired(settings.cloudConfigured !== true)
      setSettingsLoaded(true)
      localStorage.setItem('stockroom-app-name', settings.appName || 'My Business')
      localStorage.setItem('stockroom-currency', settings.currency || 'USD')
      document.title = settings.appName || 'My Business'
    }).catch(() => {
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
  const filteredProducts = useMemo(() => products.filter((product) => `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(query.toLowerCase())), [products, query])

  async function updateStock(id: string, amount: number) {
    if (!canManageInventory) return
    try {
      const response = await fetch(`/api/products/${id}/stock`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ amount }) })
      if (!response.ok) throw new Error('Unable to update stock')
      const updated = await response.json() as Product
      setProducts((current) => current.map((product) => product.id === id ? updated : product))
      upsertCachedProducts([updated]).catch(() => undefined)
    } catch {
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
    const input = { name: String(data.get('name')), sku: String(data.get('sku')), category: String(data.get('category')), stock: Number(data.get('stock')), reorder: Number(data.get('reorder')), price: Number(data.get('price')), cost: Number(data.get('cost') || 0), unit: String(data.get('unit')) }
    try {
      const response = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify(input) })
      if (!response.ok) throw new Error('Unable to create product')
      const product = await response.json() as Product
      setProducts((current) => [product, ...current])
      await upsertCachedProducts([product])
    } catch {
      const product = { ...input, id: crypto.randomUUID(), updated: 'Saved offline' }
      setProducts((current) => [product, ...current])
      await upsertCachedProducts([product])
      await queueOperation({ type: 'product', payload: { ...input, localId: product.id }, createdAt: new Date().toISOString() })
    }
    setShowAdd(false)
  }

  async function saveAppName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextName = appName.trim()
    if (!nextName) return setSettingsMessage('Enter an app name.')
    localStorage.setItem('stockroom-app-name', nextName)
    try {
      const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ appName: nextName, currency, posProvider, posTerminalId, posConnection }) })
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Unable to save') }
      document.title = nextName
      localStorage.setItem('stockroom-currency', currency)
      setSettingsMessage('Saved to the business account.')
    } catch {
      await queueOperation({ type: 'settings', payload: { appName: nextName, currency, posProvider, posTerminalId, posConnection }, createdAt: new Date().toISOString() })
      setSettingsMessage('Saved on this device. It will sync when the server is available.')
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
      event.currentTarget.reset()
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
    if (paymentMethod === 'external-pos' && (!terminalProvider.trim() || !paymentReference.trim())) return
    const sale: Sale = { id: crypto.randomUUID(), items: cartProducts.map((product) => ({ productId: product.id, quantity: cart[product.id], price: product.price })), total: cartTotal, createdAt: new Date().toISOString(), syncStatus: 'pending', paymentMethod, terminalProvider: terminalProvider.trim(), paymentReference: paymentReference.trim() }
    const updatedProducts = products.map((product) => cart[product.id] ? { ...product, stock: Math.max(0, product.stock - cart[product.id]), updated: 'Sold offline' } : product)
    setProducts(updatedProducts)
    await cacheProducts(updatedProducts)
    await saveSale(sale)
    await queueOperation({ type: 'sale', payload: sale as unknown as Record<string, unknown>, createdAt: sale.createdAt })
    await syncQueuedOperations().catch(() => undefined)
    if (canManageOperations) fetch('/api/sales', { headers: authHeaders }).then((response) => response.ok ? response.json() as Promise<{ sales: SaleRecord[] }> : Promise.reject()).then((data) => setSales(data.sales)).catch(() => undefined)
    setLastReceipt(sale)
    setCart({})
    setPaymentReference('')
    window.setTimeout(() => window.print(), 0)
  }

  const cartProducts = products.filter((product) => cart[product.id])
  const cartTotal = cartProducts.reduce((total, product) => total + product.price * cart[product.id], 0)
  useEffect(() => {
    fetch('/api/customer-display', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ businessName: appName, currency, items: cartProducts.map((product) => ({ name: product.name, quantity: cart[product.id], price: product.price })), total: cartTotal, completed: false }) }).catch(() => undefined)
  }, [appName, cart, cartProducts, cartTotal])
  const canManageOperations = user?.role === 'owner' || user?.role === 'admin' || Boolean(user?.operationalAccess)
  const canManageInventory = canManageOperations
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
    if (!response.ok) return
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
    event.currentTarget.reset()
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
    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ category: form.get('category'), description: form.get('description'), amount: Number(form.get('amount')), incurredAt: new Date(String(form.get('incurredAt') || new Date().toISOString())).toISOString() }) })
    if (!response.ok) return
    const expense = await response.json() as Expense
    setExpenses((current) => [expense, ...current])
    event.currentTarget.reset()
    const reportResponse = await fetch('/api/reports', { headers: { Authorization: `Bearer ${authToken}` } })
    if (reportResponse.ok) setReports(await reportResponse.json() as Reports)
  }

  async function scanBarcode() {
    const BarcodeDetectorApi = (window as unknown as { BarcodeDetector?: new () => { detect(video: HTMLVideoElement): Promise<Array<{ rawValue: string }>> } }).BarcodeDetector
    if (!BarcodeDetectorApi || !navigator.mediaDevices?.getUserMedia) {
      setQuery(window.prompt('Enter or scan a barcode with your USB scanner') || '')
      return
    }
    const video = document.createElement('video')
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).catch(() => null)
    if (!stream) return setQuery(window.prompt('Camera unavailable. Enter the barcode') || '')
    video.srcObject = stream
    await video.play()
    const detector = new BarcodeDetectorApi()
    const scan = async () => {
      const codes = await detector.detect(video).catch(() => [])
      if (codes[0]) { setQuery(codes[0].rawValue); stream.getTracks().forEach((track) => track.stop()); return }
      window.requestAnimationFrame(scan)
    }
    scan()
  }

  async function startStocktake() {
    const response = await fetch('/api/stocktakes', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } })
    if (response.ok) { setStocktake(await response.json() as Stocktake); setActive('Stocktake') }
  }

  async function updateCount(countId: string, counted: number) {
    if (!stocktake) return
    const response = await fetch(`/api/stocktakes/${stocktake.id}/counts/${countId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ counted }) })
    if (response.ok) setStocktake(await response.json() as Stocktake)
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
    }
  }

  async function login(email: string, password: string) {
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
    const cloudResponse = await fetch('/api/auth/cloud-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).catch(() => null)
    const cloudData = cloudResponse?.ok ? await cloudResponse.json() as { token: string; user: User; cloudAccessToken: string } : null
    if (!response.ok && !cloudResponse?.ok) throw new Error('Email or password is incorrect.')
    const data = response.ok ? await response.json() as { token: string; user: User } : cloudData!
    if (cloudData) {
      setCloudAccessToken(cloudData.cloudAccessToken); localStorage.setItem('stockroom-cloud-access-token', cloudData.cloudAccessToken)
    }
    setAuthToken(data.token)
    setUser(data.user)
    setActive(data.user.role === 'cashier' && !data.user.operationalAccess ? 'POS' : 'Overview')
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
    await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } }).catch(() => undefined)
    setAuthToken('')
    setUser(null)
    localStorage.removeItem('stockroom-token')
    localStorage.removeItem('stockroom-user')
    localStorage.removeItem('stockroom-cloud-access-token')
    setCloudAccessToken('')
  }

  if (!settingsLoaded) return <main className="login-screen"><div className="login-card"><h1>Loading your business</h1></div></main>
  if (!user) return installerRequired ? <InstallerScreen onActivate={activateInstallation} message={installerMessage} /> : setupRequired ? <SetupScreen onCreate={completeSetup} error={authError} setError={setAuthError} /> : <LoginScreen onLogin={login} error={authError} setError={setAuthError} />

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Boxes size={21} /></div><div><strong>{appName}</strong><span>Business operations</span></div></div>
      <div className="workspace"><Store size={16} /><span>{appName}</span><MoreHorizontal size={17} /></div>
      <nav>
        {canManageOperations && <button className={active === 'Overview' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Overview')}><LayoutDashboard size={18} />Overview</button>}
        {canManageOperations && <button className={active === 'Inventory' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Inventory')}><Boxes size={18} />Inventory <b>{products.length}</b></button>}
        {canManageInventory && <button className={active === 'Stocktake' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Stocktake')}><CheckSquare size={18} />Stock take</button>}
        <button className={active === 'POS' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('POS')}><ShoppingCart size={18} />POS</button>
        <button className={active === 'Display' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Display')}><Store size={18} />Customer display</button>
        {canManageOperations && <button className={active === 'Sales' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Sales')}><ShoppingCart size={18} />Sales</button>}
        {canManageOperations && <button className={active === 'Movements' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Movements')}><ArrowDownToLine size={18} />Stock movements</button>}
        {canManageOperations && <button className={active === 'Wallet' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Wallet')}><WalletCards size={18} />Wallet</button>}
        {['owner', 'admin'].includes(user.role) && <button className={active === 'Owner' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Owner')}><LayoutDashboard size={18} />Business dashboard</button>}
        {['owner', 'admin'].includes(user.role) && <button className={active === 'Reports' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Reports')}><BarChart3 size={18} />Reports</button>}
        {['owner', 'admin'].includes(user.role) && <button className={active === 'Sync' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Sync')}><RefreshCw size={18} />Sync issues {syncConflicts.length > 0 && <b>{syncConflicts.length}</b>}</button>}
        {['owner', 'admin'].includes(user.role) && <button className={active === 'Team' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Team')}><UserRoundCog size={18} />Team management</button>}
        {user.role === 'owner' && <button className={active === 'Settings' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Settings')}><UserRoundCog size={18} />Business settings</button>}
      </nav>
      <div className="sidebar-foot"><div className={online && syncStatus.configured ? 'sync-status sync-ready' : 'sync-status offline'}>{online && syncStatus.configured ? <Wifi size={16} /> : <CloudOff size={16} />}<span>{online && syncStatus.configured ? `Cloud sync ready${syncStatus.pending ? ` · ${syncStatus.pending} queued` : ''}` : online ? 'Cloud sync not configured' : 'Offline · saved locally'}</span></div><button className="sync-button" onClick={syncNow} disabled={!online || !syncStatus.configured || syncing} title="Sync now"><RefreshCw size={14} className={syncing ? 'spin' : ''} />{syncing ? 'Syncing…' : 'Sync now'}</button><small>{syncStatus.lastError || (syncConflicts.length ? `${syncConflicts.length} change${syncConflicts.length === 1 ? '' : 's'} need review.` : online ? 'Sales are always saved locally first.' : 'Changes will sync when internet returns.')}</small></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><p className="eyebrow">{user.name} · {user.role}</p><h1>{active === 'Inventory' ? 'Inventory' : active === 'POS' ? 'Point of sale' : active === 'Wallet' ? 'Wallet' : active === 'Owner' ? 'Owner dashboard' : active === 'Settings' ? 'Admin settings' : 'Good morning'}</h1></div><div className="top-actions"><button className="icon-button" title="Filter"><SlidersHorizontal size={18} /></button><span className="avatar" aria-hidden="true">{user.name.slice(0, 2).toUpperCase()}</span><button className="text-button logout-button" onClick={logout}>Log out</button></div></header>
      {active === 'Overview' && canManageOperations && <>
        <section className="hero-row"><div><h2>Business at a glance</h2><p>Keep your shelves moving and your team in the know.</p></div><button className="primary-button" onClick={() => setShowAdd(true)}><Plus size={18} />Add product</button></section>
        <section className="metric-grid"><div className="metric-card"><span>Inventory value</span><strong>{formatMoney(totalValue)}</strong><small>Based on current local stock and unit prices</small></div><div className="metric-card"><span>Items in stock</span><strong>{products.reduce((sum, product) => sum + product.stock, 0)}</strong><small>Across {products.length} products</small></div><div className="metric-card alert-card"><span>Needs attention</span><strong>{lowStock.length}</strong><small>{lowStock.length ? 'Products below reorder point' : 'All stock levels healthy'}</small></div></section>
        <section className="content-grid"><div className="panel inventory-panel"><div className="panel-heading"><div><h3>Inventory snapshot</h3><p>Recent stock levels across your catalogue</p></div><button className="text-button" onClick={() => setActive('Inventory')}>View all <ArrowUpToLine size={15} /></button></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Stock level</th><th>Updated</th><th></th></tr></thead><tbody>{filteredProducts.slice(0, 5).map((product) => <ProductRow key={product.id} product={product} updateStock={updateStock} money={formatMoney} />)}</tbody></table></div></div><div className="panel attention-panel"><div className="panel-heading"><div><h3>Needs attention</h3><p>Reorder before you run out</p></div><AlertTriangle size={19} className="warning-icon" /></div>{lowStock.length === 0 ? <div className="empty-state">Everything is in good shape.</div> : lowStock.map((product) => <div className="alert-row" key={product.id}><div className="product-icon">{product.name.slice(0, 1)}</div><div><strong>{product.name}</strong><span>{product.stock} {product.unit}s left · reorder at {product.reorder}</span></div><button onClick={() => updateStock(product.id, product.reorder * 2)} title="Restock"><PackagePlus size={17} /></button></div>)}</div></section>
      </>}
      {active === 'Inventory' && <section className="panel full-panel"><div className="panel-heading"><div><h2>All inventory</h2><p>Adjust counts as stock comes in or goes out.</p></div><button className="primary-button" onClick={() => setShowAdd(true)}><Plus size={18} />Add product</button></div><div className="search-row"><div className="search-box"><Search size={17} /><input placeholder="Search or scan barcode" value={query} onChange={(event) => setQuery(event.target.value)} /></div><button className="filter-button" onClick={scanBarcode}><ScanLine size={16} />Scan</button></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Stock</th><th>Unit price</th><th>Updated</th><th></th></tr></thead><tbody>{filteredProducts.map((product) => <ProductRow key={product.id} product={product} updateStock={updateStock} money={formatMoney} detailed />)}</tbody></table></div></section>}
      {active === 'Stocktake' && <section className="panel full-panel"><div className="panel-heading"><div><h2>Physical stock take</h2><p>Count what is physically on the shelf and approve the variance.</p></div>{!stocktake || stocktake.status === 'approved' ? <button className="primary-button" onClick={startStocktake}><CheckSquare size={17} />Start stock take</button> : <button className="primary-button" onClick={approveStocktakeSession}>Approve adjustments</button>}</div>{!stocktake ? <div className="empty-state">Start a session to compare expected stock with physical counts.</div> : <><div className="search-row"><label className="settings-form" style={{ width: '100%' }}><span>Approval reason</span><input value={stocktakeReason} onChange={(event) => setStocktakeReason(event.target.value)} disabled={stocktake.status === 'approved'} /></label></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>Expected</th><th>Counted</th><th>Variance</th></tr></thead><tbody>{stocktake.counts.map((count) => <tr key={count.id}><td><strong>{count.name}</strong><span className="table-subtext">{count.sku}</span></td><td>{count.expected}</td><td><input className="count-input" type="number" min="0" value={count.counted} disabled={stocktake.status === 'approved'} onChange={(event) => updateCount(count.id, Number(event.target.value))} /></td><td className={count.variance === 0 ? 'muted' : count.variance < 0 ? 'low-stock' : 'positive'}>{count.variance > 0 ? '+' : ''}{count.variance}</td></tr>)}</tbody></table></div>{stocktake.history && stocktake.history.length > 0 && <div className="panel"><div className="panel-heading"><div><h3>Audit history</h3><p>Recorded adjustments from this stock-take session.</p></div></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>Expected</th><th>Counted</th><th>Variance</th><th>Reason</th></tr></thead><tbody>{stocktake.history.map((entry) => <tr key={entry.id}><td><strong>{entry.name}</strong><span className="table-subtext">{entry.sku}</span></td><td>{entry.expected}</td><td>{entry.counted}</td><td className={entry.variance === 0 ? 'muted' : entry.variance < 0 ? 'low-stock' : 'positive'}>{entry.variance > 0 ? '+' : ''}{entry.variance}</td><td>{entry.reason}</td></tr>)}</tbody></table></div></div>}</>}</section>}
      {active === 'POS' && <section className="pos-layout"><div className="panel"><div className="panel-heading"><div><h2>Sell products</h2><p>Search or scan a barcode to add an item.</p></div><button className="icon-button" onClick={scanBarcode} title="Scan barcode"><ScanLine size={20} /></button></div><div className="search-box pos-search"><Search size={17} /><input autoFocus placeholder="Search or scan barcode" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="pos-products">{filteredProducts.map((product) => <button className="pos-product" key={product.id} onClick={() => addToCart(product)}><div className="product-icon">{product.name.slice(0, 1)}</div><span><strong>{product.name}</strong><small>{product.stock} {product.unit}s available</small></span><b>{formatMoney(product.price)}</b></button>)}</div></div><div className="panel cart-panel"><div className="panel-heading"><div><h2>Current sale</h2><p>{cartProducts.length} products</p></div><ShoppingCart size={20} /></div>{cartProducts.length === 0 ? <div className="empty-state">Scan or select a product to begin.</div> : cartProducts.map((product) => <div className="cart-row" key={product.id}><div><strong>{product.name}</strong><span>{cart[product.id]} × {formatMoney(product.price)}</span></div><button onClick={() => removeFromCart(product.id)}><X size={15} /></button></div>)}<div className="payment-options"><label>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as Sale['paymentMethod'])}><option value="external-pos">External POS terminal</option><option value="cash">Cash</option><option value="wallet">Customer wallet</option></select></label>{paymentMethod === 'external-pos' && <><label>Terminal provider<input placeholder="Your provider name" value={terminalProvider} onChange={(event) => setTerminalProvider(event.target.value)} /></label><label>Terminal reference<input placeholder="Approval/reference number" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></label></> }</div><div className="cart-total"><span>Total</span><strong>{formatMoney(cartTotal)}</strong></div><button className="primary-button checkout-button" disabled={!cartProducts.length || (paymentMethod === 'external-pos' && (!terminalProvider || !paymentReference))} onClick={completeSale}>Complete sale & print</button></div></section>}
      {active === 'Display' && <CustomerDisplayPairing pairing={displayPairing} createPairing={createDisplayPairing} />}
      {active === 'Sales' && <section className="panel full-panel"><div className="panel-heading"><div><h2>Sales history</h2><p>Completed sales saved on this device.</p></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Items</th><th>Payment</th><th>Total</th></tr></thead><tbody>{sales.length ? sales.map((sale) => <tr key={sale.id}><td>{new Date(sale.createdAt).toLocaleString()}</td><td>{sale.items.map((item) => `${item.quantity} × ${item.productName}`).join(', ') || 'Legacy sale'}</td><td>{sale.paymentMethod}{sale.paymentReference ? ` · ${sale.paymentReference}` : ''}</td><td>{formatMoney(sale.total)}</td></tr>) : <tr><td colSpan={4} className="empty-state">No completed sales yet.</td></tr>}</tbody></table></div></section>}
      {active === 'Movements' && <section className="panel full-panel"><div className="panel-heading"><div><h2>Stock movements</h2><p>Every sale, adjustment, and approved stock-take is recorded here.</p></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Product</th><th>Change</th><th>Reason</th></tr></thead><tbody>{movements.length ? movements.map((movement) => <tr key={movement.id}><td>{new Date(movement.createdAt).toLocaleString()}</td><td><strong>{movement.productName}</strong><span className="table-subtext">{movement.sku}</span></td><td className={movement.quantity < 0 ? 'low-stock' : 'positive'}>{movement.quantity > 0 ? '+' : ''}{movement.quantity}</td><td>{movement.reason}</td></tr>) : <tr><td colSpan={4} className="empty-state">No stock movements yet.</td></tr>}</tbody></table></div></section>}
      {active === 'Wallet' && <section className="wallet-grid"><div className="panel customer-wallet-panel"><div className="panel-heading"><div><h2>Customer wallets</h2><p>Positive balance is customer credit. Debit it when they buy on credit.</p></div><WalletCards size={20} /></div><form className="form-grid" onSubmit={addCustomer}><label>Customer name<input value={newCustomerName} onChange={(event) => setNewCustomerName(event.target.value)} required placeholder="Customer name" /></label><label>Phone number<input value={newCustomerPhone} onChange={(event) => setNewCustomerPhone(event.target.value)} placeholder="Optional" /></label><button className="primary-button" type="submit">Add customer</button></form>{customers.length ? customers.map((customer) => <div className="customer-row" key={customer.id}><div><strong>{customer.name}</strong><small>{customer.phone || 'No phone saved'}</small></div><b className={customer.balance ? 'wallet-positive' : ''}>{formatMoney(customer.balance)}</b><button onClick={() => adjustWallet(customer.id, 10)}>+ {formatMoney(10)}</button><button onClick={() => adjustWallet(customer.id, -10)} disabled={customer.balance < 10}>- {formatMoney(10)}</button></div>) : <div className="empty-state">Add your first customer to begin managing wallet credit.</div>}</div></section>}
      {active === 'Owner' && <OwnerDashboard token={authToken} currency={currency} />}
      {active === 'Reports' && <ReportsDashboard reports={reports} currency={currency} expenses={expenses} exportCsv={exportSalesCsv} addExpense={addExpense} />}
      {active === 'Sync' && <SyncIssues conflicts={syncConflicts} resolveConflict={resolveConflict} />}
      {active === 'Team' && <TeamManagement staff={staff} addStaff={addStaff} setCashierAccess={setCashierAccess} canCreateStaff={user.role === 'owner'} message={settingsMessage} />}
      {active === 'Settings' && user.role === 'owner' && <section className="panel full-panel settings-panel"><div className="panel-heading"><div><h2>Business settings</h2><p>Customize the identity your team sees across the app.</p></div><Settings2 size={20} /></div><form className="settings-form" onSubmit={saveAppName}><label>App name<span>This appears in the sidebar and installed app.</span><input value={appName} maxLength={60} onChange={(event) => { setAppName(event.target.value); setSettingsMessage('') }} /></label><label>Currency<span>Used for product prices, wallets, sales, and receipts.</span><select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="USD">USD - US Dollar</option><option value="NGN">NGN - Nigerian Naira</option><option value="GHS">GHS - Ghanaian Cedi</option><option value="KES">KES - Kenyan Shilling</option><option value="GBP">GBP - Pound Sterling</option><option value="EUR">EUR - Euro</option></select></label><label>External POS provider<span>Optional. Enter the provider used by this shop.</span><input value={posProvider} placeholder="Provider name" onChange={(event) => setPosProvider(event.target.value)} /></label><label>Terminal ID<span>The identifier printed on or shown by the terminal.</span><input value={posTerminalId} placeholder="Terminal ID" onChange={(event) => setPosTerminalId(event.target.value)} /></label><label>Connection mode<span>This records how the terminal will integrate with the app.</span><select value={posConnection} onChange={(event) => setPosConnection(event.target.value)}><option value="manual">Manual confirmation</option><option value="usb">USB</option><option value="bluetooth">Bluetooth</option><option value="network">Local network</option><option value="sdk">Provider SDK</option></select></label><button className="primary-button">Save business settings <ArrowUpToLine size={17} /></button>{settingsMessage && <p className="settings-message">{settingsMessage}</p>}</form><form className="settings-form" onSubmit={changePassword}><h3>Change password</h3><label>Current password<input name="currentPassword" type="password" placeholder="Current password" /></label><label>New password<input name="newPassword" type="password" placeholder="New password" /></label><label>Confirm password<input name="confirmPassword" type="password" placeholder="Confirm new password" /></label><button className="primary-button" type="submit">Update password</button>{passwordMessage && <p className="settings-message">{passwordMessage}</p>}</form></section>}
    </main>
    {showAdd && <div className="modal-backdrop" onMouseDown={() => setShowAdd(false)}><form className="modal" onSubmit={addProduct} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><h2>Add product</h2><p>It will be saved on this device immediately.</p></div><button type="button" className="icon-button" onClick={() => setShowAdd(false)}><X size={19} /></button></div><div className="form-grid"><label>Product name<input name="name" required placeholder="e.g. Espresso beans" /></label><label>SKU<input name="sku" required placeholder="COF-001" /></label><label>Category<input name="category" required placeholder="Beverages" /></label><label>Unit<input name="unit" required placeholder="bag" /></label><label>Starting stock<input name="stock" type="number" min="0" required defaultValue="0" /></label><label>Reorder point<input name="reorder" type="number" min="0" required defaultValue="10" /></label><label>Unit price<input name="price" type="number" min="0" step="0.01" required defaultValue="0" /></label></div><button className="primary-button submit-button">Save product <ArrowUpToLine size={17} /></button></form></div>}
    {lastReceipt && <div className="print-receipt"><h2>{appName}</h2><p>{new Date(lastReceipt.createdAt).toLocaleString()}</p>{lastReceipt.items.map((item) => <p key={item.productId}>{item.quantity} × {formatMoney(item.price)}</p>)}<strong>Total: {formatMoney(lastReceipt.total)}</strong></div>}
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
  const resetView = () => { setError(''); setMessage('') }
  const returnToLogin = () => { resetView(); setMode('login') }

  if (mode === 'request') return <main className="login-screen"><form className="login-card" onSubmit={async (event) => {
    event.preventDefault(); resetView()
    try {
      const response = await fetch('/api/auth/password-reset/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to request a reset email.')
      setMessage('If this email has a cloud account, a reset code has been sent. Check your inbox and spam folder.')
      setMode('confirm')
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to request a reset email.') }
  }}><div className="brand-mark"><Boxes size={21} /></div><h1>Reset your password</h1><p>Enter the email used for this business. This needs an internet connection.</p><label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@yourshop.com" /></label>{error && <div className="auth-error">{error}</div>}<button className="primary-button login-button">Send reset code</button><button type="button" className="text-button" onClick={returnToLogin}>Back to sign in</button></form></main>

  if (mode === 'confirm') return <main className="login-screen"><form className="login-card" onSubmit={async (event) => {
    event.preventDefault(); resetView()
    try {
      const response = await fetch('/api/auth/password-reset/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: resetCode, password: resetPassword }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to reset the password.')
      setResetCode(''); setResetPassword(''); setMessage('Password updated. You can now sign in with your new password.'); setMode('login')
    } catch (confirmError) { setError(confirmError instanceof Error ? confirmError.message : 'Unable to reset the password.') }
  }}><div className="brand-mark"><Boxes size={21} /></div><h1>Enter reset code</h1><p>{message || 'Use the reset code from your email, then choose a new password.'}</p><label>Reset code<input required value={resetCode} onChange={(event) => setResetCode(event.target.value)} autoComplete="one-time-code" placeholder="Code from your email" /></label><label>New password<input type="password" minLength={10} required value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} autoComplete="new-password" placeholder="At least 10 characters" /></label>{error && <div className="auth-error">{error}</div>}<button className="primary-button login-button">Update password</button><button type="button" className="text-button" onClick={() => { resetView(); setMode('request') }}>Use a different email</button></form></main>

  return <main className="login-screen"><form className="login-card" onSubmit={async (event) => { event.preventDefault(); try { await onLogin(email, password) } catch (loginError) { setError(loginError instanceof Error ? loginError.message : 'Unable to sign in.') } }}><div className="brand-mark"><Boxes size={21} /></div><h1>Sign in to your shop</h1><p>Run your store online or offline.</p><label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@yourshop.com" /></label><label>Password<div className="password-wrap"><input type={showPassword ? 'text' : 'password'} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" /><button type="button" className="icon-button password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label><button type="button" className="text-button forgot-password" onClick={() => { resetView(); setMode('request') }}>Forgot password?</button>{error && <div className="auth-error">{error}</div>}{message && <p className="settings-message">{message}</p>}<button className="primary-button login-button">Sign in</button></form></main>
}

function SetupScreen({ onCreate, error, setError }: { onCreate: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; error: string; setError: (value: string) => void }) {
  return <main className="login-screen"><form className="login-card" onSubmit={async (event) => { event.preventDefault(); try { await onCreate(event) } catch (loginError) { setError(loginError instanceof Error ? loginError.message : 'Unable to create your business account.') } }}><div className="brand-mark"><Boxes size={21} /></div><h1>Set up your shop</h1><p>Create the first owner account for this store.</p><label>Business name<input name="shopName" required placeholder="My Business" /></label><label>Owner name<input name="ownerName" required placeholder="John Doe" /></label><label>Email<input name="email" type="email" required placeholder="owner@yourshop.com" /></label><label>Password<div className="password-wrap"><input name="password" type="password" required placeholder="Create a password" /><button type="button" className="icon-button password-toggle" aria-label="Show password" onClick={(event) => { const input = (event.currentTarget.parentElement?.querySelector('input') as HTMLInputElement | null); if (!input) return; const shouldShow = input.type === 'password'; input.type = shouldShow ? 'text' : 'password'; event.currentTarget.setAttribute('aria-label', shouldShow ? 'Hide password' : 'Show password'); }}><Eye size={16} /></button></div></label><p className="settings-message">Your database is configured by the developer. After payment, the owner can change their password from Admin settings.</p>{error && <div className="auth-error">{error}</div>}<button className="primary-button login-button">Create owner account</button></form></main>
}

function OwnerDashboard({ token, currency }: { token: string; currency: string }) {
  const [metrics, setMetrics] = useState<{ salesToday: number; saleCount: number; inventoryValue: number; productCount: number; lowStock: number } | null>(null)
  useEffect(() => { fetch('/api/owner/metrics', { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.ok ? response.json() : Promise.reject()).then(setMetrics).catch(() => undefined) }, [token])
  const money = (amount: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  return <section className="owner-dashboard"><div className="metric-grid"><div className="metric-card"><span>Sales recorded</span><strong>{metrics ? money(metrics.salesToday) : '—'}</strong><small>Synced sales total</small></div><div className="metric-card"><span>Transactions</span><strong>{metrics?.saleCount ?? '—'}</strong><small>Completed receipts</small></div><div className="metric-card alert-card"><span>Low stock</span><strong>{metrics?.lowStock ?? '—'}</strong><small>Items needing attention</small></div></div><div className="panel owner-panel"><h2>Business monitoring</h2><p>Inventory value: <strong>{metrics ? money(metrics.inventoryValue) : '—'}</strong> across {metrics?.productCount ?? '—'} products.</p><p>Sales made offline are included after they synchronize.</p></div></section>
}

function TeamManagement({ staff, addStaff, setCashierAccess, canCreateStaff, message }: { staff: StaffUser[]; addStaff: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; setCashierAccess: (id: string, enabled: boolean) => Promise<void>; canCreateStaff: boolean; message: string }) {
  return <section className="panel full-panel team-management"><div className="panel-heading"><div><h2>Team management</h2><p>Cashiers start with POS-only access. An admin or owner can grant operational access when needed.</p></div><UserRoundCog size={20} /></div><div className="team-grid"><section><h3>Current team</h3><div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th>Created</th></tr></thead><tbody>{staff.length ? staff.map((member) => <tr key={member.id}><td><strong>{member.name}</strong></td><td>{member.email}</td><td><span className={`role-badge ${member.role}`}>{member.role}</span></td><td>{member.role === 'cashier' ? <label><input type="checkbox" checked={Boolean(member.operationalAccess)} onChange={(event) => setCashierAccess(member.id, event.target.checked)} /> Operational</label> : 'Full role access'}</td><td>{new Date(member.createdAt).toLocaleDateString()}</td></tr>) : <tr><td colSpan={5} className="empty-state">Loading team accounts…</td></tr>}</tbody></table></div></section>{canCreateStaff && <form className="settings-form team-form" onSubmit={addStaff}><h3>Add team member</h3><label>Full name<input name="name" required maxLength={100} placeholder="e.g. Ada Okafor" /></label><label>Email address<input name="email" type="email" required placeholder="ada@yourbusiness.com" /></label><label>Access role<select name="role" defaultValue="cashier"><option value="cashier">Cashier — POS only by default</option><option value="admin">Admin — manage stock and operations</option></select></label><label>Temporary password<input name="password" type="password" minLength={8} required placeholder="At least 8 characters" /></label><button className="primary-button" type="submit">Create account <UserRoundCog size={17} /></button></form>}</div>{message && <p className="settings-message">{message}</p>}</section>
}

function ReportsDashboard({ reports, currency, expenses, exportCsv, addExpense }: { reports: Reports | null; currency: string; expenses: Expense[]; exportCsv: () => Promise<void>; addExpense: (event: React.FormEvent<HTMLFormElement>) => Promise<void> }) {
  const money = (amount: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  const summary = reports || { daily: { total: 0, count: 0 }, weekly: { total: 0, count: 0 }, monthly: { total: 0, count: 0 }, inventory: { value: 0, products: 0, lowStock: 0 }, profit: { revenue: 0, cost: 0, expenses: 0, amount: 0 } }
  return <section className="reports-dashboard"><div className="hero-row"><div><h2>Business reports</h2><p>Sales and inventory figures stored on this device.</p></div><div className="report-actions"><button className="filter-button" onClick={exportCsv}><Download size={16} />Export CSV</button><button className="primary-button" onClick={() => window.print()}><Printer size={16} />Print / Save PDF</button></div></div><section className="metric-grid"><ReportMetric label="Today’s sales" value={money(summary.daily.total)} note={`${summary.daily.count} transaction${summary.daily.count === 1 ? '' : 's'}`} /><ReportMetric label="This week" value={money(summary.weekly.total)} note={`${summary.weekly.count} transaction${summary.weekly.count === 1 ? '' : 's'}`} /><ReportMetric label="This month" value={money(summary.monthly.total)} note={`${summary.monthly.count} transaction${summary.monthly.count === 1 ? '' : 's'}`} /></section><section className="metric-grid report-secondary"><ReportMetric label="Stock valuation" value={money(summary.inventory.value)} note={`${summary.inventory.products} products at selling price`} /><ReportMetric label="Estimated net profit" value={money(summary.profit.amount)} note={`${money(summary.profit.revenue)} revenue · ${money(summary.profit.cost)} cost · ${money(summary.profit.expenses)} expenses`} /><ReportMetric label="Low-stock products" value={String(summary.inventory.lowStock)} note="At or below their reorder point" /></section><section className="team-grid"><section className="panel"><h3>Recent expenses</h3>{expenses.length ? expenses.slice(0, 8).map((expense) => <div className="customer-row" key={expense.id}><div><strong>{expense.description}</strong><small>{expense.category} · {new Date(expense.incurredAt).toLocaleDateString()}</small></div><b>{money(expense.amount)}</b></div>) : <div className="empty-state">No expenses recorded yet.</div>}</section><form className="settings-form team-form" onSubmit={addExpense}><h3>Record expense</h3><label>Category<input name="category" required placeholder="Rent, transport, utilities" /></label><label>Description<input name="description" required placeholder="What was paid for?" /></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Date<input name="incurredAt" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label><button className="primary-button">Save expense</button></form></section><section className="panel report-note"><h3>About profit</h3><p>Profit subtracts recorded product cost and recorded expenses. Older sales without a saved cost remain revenue-only.</p></section></section>
}

function ReportMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
}

function SyncIssues({ conflicts, resolveConflict }: { conflicts: SyncConflict[]; resolveConflict: (id: string) => Promise<void> }) {
  return <section className="panel full-panel"><div className="panel-heading"><div><h2>Sync issues</h2><p>Sales and stock movements are never discarded. These are competing edits to mutable records from another device.</p></div><RefreshCw size={20} /></div>{conflicts.length ? <div className="table-wrap"><table><thead><tr><th>Record type</th><th>Reason</th><th>Detected</th><th></th></tr></thead><tbody>{conflicts.map((conflict) => <tr key={conflict.id}><td>{conflict.entityType}</td><td>{conflict.reason}</td><td>{new Date(conflict.createdAt).toLocaleString()}</td><td><button className="filter-button" onClick={() => resolveConflict(conflict.id)}>Mark reviewed</button></td></tr>)}</tbody></table></div> : <div className="empty-state">No sync conflicts need review.</div>}</section>
}

function InstallerScreen({ onActivate, message }: { onActivate: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; message: string }) {
  const [mode, setMode] = useState<'new' | 'existing'>('existing')
  return <main className="login-screen"><form className="login-card installer-card" onSubmit={onActivate}><input type="hidden" name="mode" value={mode} /><div className="brand-mark"><Boxes size={21} /></div><h1>{mode === 'new' ? 'New client activation' : 'Add another device'}</h1><p>{mode === 'new' ? 'Installer-only: activate this client device before handing over the app.' : 'For the business owner: add a second computer without any developer credentials.'}</p><div className="installer-tabs"><button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')}>New client</button><button type="button" className={mode === 'existing' ? 'active' : ''} onClick={() => setMode('existing')}>Existing business</button></div>{mode === 'new' && <label>Client business ID<input name="businessId" required pattern="[a-z0-9][a-z0-9-]{2,80}" placeholder="client-business-001" /></label>}<label>Device ID<input name="deviceId" required pattern="[a-z0-9][a-z0-9-]{2,100}" placeholder="client-business-main-pc" /></label><label>Device label<input name="label" required maxLength={100} placeholder="Main checkout computer" /></label>{mode === 'new' ? <><label>Installer Admin API key<input name="adminApiKey" type="password" required autoComplete="off" placeholder="Private installer key" /></label><p className="installer-note">The app connects to the configured cloud service automatically. This key is sent only to the cloud service and is never saved.</p></> : <><label>Owner email<input name="ownerEmail" type="email" required placeholder="owner@business.com" /></label><label>Owner password<input name="ownerPassword" type="password" minLength={10} required autoComplete="current-password" placeholder="Cloud owner password" /></label><p className="installer-note">Your business is identified from the owner account. The password is used only to enroll this device and is not stored.</p></>}{message && <div className={message.startsWith('Installation activated') ? 'settings-message' : 'auth-error'}>{message}</div>}<button className="primary-button login-button">{mode === 'new' ? 'Activate new client' : 'Add this device'}</button></form></main>
}

function CustomerDisplayPairing({ pairing, createPairing }: { pairing: { url: string; code: string; expiresAt: string } | null; createPairing: () => Promise<void> }) {
  return <section className="panel full-panel pairing-panel"><div className="panel-heading"><div><h2>Customer display</h2><p>Pair a tablet on the same shop Wi-Fi. It can only view the live checkout basket.</p></div><Store size={20} /></div><ol><li>Connect the tablet and this checkout computer to the same private Wi-Fi.</li><li>Do not use public Wi-Fi; this display connection is local HTTP.</li><li>Create a pairing link, then open it on the tablet within five minutes.</li></ol><button className="primary-button" onClick={createPairing}>Create secure pairing link</button>{pairing && <section className="pairing-code"><span>Open this address on the tablet</span><strong>{pairing.url}</strong><small>Pairing code: <b>{pairing.code}</b> · expires {new Date(pairing.expiresAt).toLocaleTimeString()}</small></section>}<p className="settings-message">Pairing creates a read-only display token that expires after 12 hours or when the local app restarts.</p></section>
}

type CustomerDisplayState = { businessName: string; currency: string; items: Array<{ name: string; quantity: number; price: number }>; total: number; completed: boolean }

function CustomerDisplay() {
  const [display, setDisplay] = useState<CustomerDisplayState>({ businessName: 'My Business', currency: 'USD', items: [], total: 0, completed: false })
  useEffect(() => {
    const refresh = () => fetch('/api/customer-display').then((response) => response.ok ? response.json() : Promise.reject()).then(setDisplay).catch(() => undefined)
    refresh()
    const interval = window.setInterval(refresh, 750)
    return () => window.clearInterval(interval)
  }, [])
  const money = (amount: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: display.currency }).format(amount)
  return <main className="customer-display"><div><div className="brand-mark"><Store size={28} /></div><h1>{display.businessName}</h1><p>{display.items.length ? 'Your order' : 'Welcome'}</p></div><section>{display.items.length ? display.items.map((item, index) => <div className="display-item" key={`${item.name}-${index}`}><span>{item.quantity} × {item.name}</span><strong>{money(item.quantity * item.price)}</strong></div>) : <p className="display-empty">Items will appear here as they are scanned.</p>}<div className="display-total"><span>Total</span><strong>{money(display.total)}</strong></div></section><footer>Thank you for your patronage.</footer></main>
}

createRoot(document.getElementById('root')!).render(<StrictMode>{window.location.pathname === '/customer-display' ? <CustomerDisplay /> : <App />}</StrictMode>)
