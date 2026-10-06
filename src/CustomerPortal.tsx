import { useEffect, useMemo, useState } from 'react'
import { LogOut, ShoppingBag, WalletCards } from 'lucide-react'
import './portal.css'

const api = __STOCKROOM_SYNC_API_URL__.replace(/\/$/, '')
type WalletTransaction = { id: string; amount: number; reason: string; createdAt: string }
type CustomerOrder = { id: string; status: string; total: number; currency: string; createdAt: string; updatedAt: string; lines: Array<{ name: string; quantity: number; options: string[] }>; paymentMethod: string; paymentReference: string; paymentPending: boolean }
type Profile = { customer: { id: string; name: string; phone: string; balance: number }; transactions: WalletTransaction[]; orders: CustomerOrder[] }
type MenuOption = { id: string; name: string; price: number }
type Catalog = { businessId: string; businessName: string; currency: string; mode: 'account' | 'fast-food' | 'restaurant'; menu: null | { id: string; updatedAt: string; items: Array<{ id: string; name: string; description: string; price: number; options: MenuOption[] }> } }
type BasketLine = { menuItemId: string; quantity: number; optionIds: string[] }
const orderStatus: Record<string, string> = { queued: 'Order submitted', preparing: 'Being prepared', ready: 'Ready for pickup / handoff', collected: 'Completed', cancelled: 'Cancelled' }

export function CustomerPortal({ businessId }: { businessId: string }) {
  const tokenKey = `stockroom-customer-${businessId}`
  const cacheKey = `stockroom-customer-data-${businessId}`
  const catalogKey = `stockroom-customer-catalog-${businessId}`
  const basketKey = `stockroom-customer-basket-${businessId}`
  const [token, setToken] = useState(() => sessionStorage.getItem(tokenKey) || '')
  const [profile, setProfile] = useState<Profile | null>(() => { const saved = readCache<Profile>(cacheKey); return saved ? { ...saved, orders: Array.isArray(saved.orders) ? saved.orders : [], transactions: Array.isArray(saved.transactions) ? saved.transactions : [] } : null })
  const [catalog, setCatalog] = useState<Catalog | null>(() => readCache<Catalog>(catalogKey))
  const [basket, setBasket] = useState<BasketLine[]>(() => readLocalCache<BasketLine[]>(basketKey) || [])
  const [tab, setTab] = useState<'wallet' | 'order' | 'orders'>('wallet')
  const [online, setOnline] = useState(navigator.onLine)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [note, setNote] = useState('')
  const [diningOption, setDiningOption] = useState('Takeaway')
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'bank-transfer' | 'cash'>('cash')
  const [paymentProvider, setPaymentProvider] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({})

  async function load(accessToken: string) {
    const [accountResponse, catalogResponse] = await Promise.all([
      fetch(`${api}/v1/customer-portal/me`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      fetch(`${api}/v1/customer-portal/catalog?businessId=${encodeURIComponent(businessId)}`),
    ])
    const account = await accountResponse.json()
    if (!accountResponse.ok) throw new Error(account.error || 'Could not load your customer account.')
    const normalizedAccount: Profile = { ...account, orders: Array.isArray(account.orders) ? account.orders : [], transactions: Array.isArray(account.transactions) ? account.transactions : [] }
    setProfile(normalizedAccount); sessionStorage.setItem(cacheKey, JSON.stringify(normalizedAccount))
    if (catalogResponse.ok) { const data = await catalogResponse.json(); setCatalog(data); sessionStorage.setItem(catalogKey, JSON.stringify(data)) }
  }

  useEffect(() => {
    if (!token) return
    load(token).catch(caught => {
      if (!navigator.onLine) return
      const text = caught instanceof Error ? caught.message : 'Could not refresh your account.'
      if (text.includes('Customer sign-in') || text.includes('no longer available')) { sessionStorage.removeItem(tokenKey); sessionStorage.removeItem(cacheKey); setToken(''); setProfile(null) }
      setError(text)
    })
  }, [businessId])
  useEffect(() => {
    const onlineNow = () => { setOnline(true); if (token) load(token).catch(caught => setError(caught instanceof Error ? caught.message : 'Could not refresh your account.')) }
    const offlineNow = () => setOnline(false)
    window.addEventListener('online', onlineNow); window.addEventListener('offline', offlineNow)
    return () => { window.removeEventListener('online', onlineNow); window.removeEventListener('offline', offlineNow) }
  }, [token, businessId])
  useEffect(() => { try { localStorage.setItem(basketKey, JSON.stringify(basket)) } catch { setError('This device could not save your basket.') } }, [basket])

  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch(`${api}/v1/customer-portal/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId, username, password }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Sign-in failed.')
      sessionStorage.setItem(tokenKey, data.accessToken); setToken(data.accessToken); await load(data.accessToken)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Sign-in failed.') } finally { setBusy(false) }
  }
  function signOut() { sessionStorage.removeItem(tokenKey); sessionStorage.removeItem(cacheKey); sessionStorage.removeItem(catalogKey); localStorage.removeItem(basketKey); localStorage.removeItem(`${basketKey}-order-id`); setBasket([]); setToken(''); setProfile(null); setCatalog(null) }
  function addToBasket(itemId: string) {
    const quantity = Math.max(1, Math.min(99, Number(quantities[itemId] || 1)))
    const optionIds = selectedOptions[itemId] || []
    setBasket(rows => [...rows.filter(row => row.menuItemId !== itemId), { menuItemId: itemId, quantity, optionIds }])
    setMessage('Added to your saved basket.')
  }
  async function submitOrder(event: React.FormEvent) {
    event.preventDefault(); if (!catalog?.menu || !basket.length) return
    setBusy(true); setError(''); setMessage('')
    const clientOrderId = readLocalCache<string>(`${basketKey}-order-id`) || crypto.randomUUID()
    localStorage.setItem(`${basketKey}-order-id`, JSON.stringify(clientOrderId))
    try {
      const response = await fetch(`${api}/v1/customer-portal/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ clientOrderId, menuUpdatedAt: catalog.menu.updatedAt, lines: basket, note, diningOption, paymentMethod, paymentProvider, paymentReference }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not submit your order.')
      setBasket([]); localStorage.removeItem(`${basketKey}-order-id`); setNote(''); setPaymentProvider(''); setPaymentReference(''); setMessage(paymentMethod === 'wallet' ? 'Order received. The business will confirm the wallet charge when it handles your order.' : paymentMethod === 'bank-transfer' ? 'Order received. The business will confirm the transfer before marking it paid.' : 'Order received. Pay at pickup or handoff.')
      await load(token); setTab('orders')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not submit your order.') } finally { setBusy(false) }
  }

  const price = (amount: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: catalog?.currency || 'USD' }).format(amount)
  const basketTotal = useMemo(() => (catalog?.menu?.items || []).reduce((sum, item) => {
    const line = basket.find(row => row.menuItemId === item.id)
    if (!line) return sum
    return sum + line.quantity * (item.price + item.options.filter(option => line.optionIds.includes(option.id)).reduce((n, option) => n + option.price, 0))
  }, 0), [catalog, basket])

  if (!profile) return <main className="portal-login"><section className="portal-login-card"><a className="portal-brand" href="/"><img src="/logo.png" alt="" /><span><strong>Customer account</strong><small>Stockroom Business App</small></span></a><h1>Sign in to your business</h1><p>Use the username and password provided by the business.</p>{error && <div className="portal-alert error" role="alert">{error}</div>}<form className="portal-form" onSubmit={signIn}><label>Username<input autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label><button className="portal-btn" disabled={busy || !online}>{busy ? 'Signing in…' : 'Sign in'}</button></form><p>Contact the business owner or admin if you need an account.</p></section></main>

  return <div className="portal"><aside className="portal-sidebar"><a className="portal-brand" href="/"><img src="/logo.png" alt="" /><span><strong>{profile.customer.name}</strong><small>{catalog?.businessName || 'Customer account'}</small></span></a><nav className="portal-nav"><button className={tab === 'wallet' ? 'active' : ''} onClick={() => setTab('wallet')}><WalletCards size={18} />Wallet</button>{catalog?.menu && <button className={tab === 'order' ? 'active' : ''} onClick={() => setTab('order')}><ShoppingBag size={18} />Order online</button>}<button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}><ShoppingBag size={18} />Order tracking</button></nav><div className="portal-sidebar-foot">{profile.customer.phone}</div></aside><main className="portal-main"><header className="portal-top"><div><h1>{tab === 'wallet' ? 'My wallet' : tab === 'order' ? 'Order online' : 'Order tracking'}</h1><p>{catalog?.businessName || 'Your account with this business'}</p></div><button className="portal-btn secondary" onClick={signOut}><LogOut size={15} />Sign out</button></header><div className="portal-content">{!online && <div className="portal-alert">Offline. Showing saved account and menu data. Submit orders and confirm payments when reconnected.</div>}{error && online && <div className="portal-alert error" role="status">{error}</div>}{message && <div className="portal-alert success" role="status">{message}</div>}
    {tab === 'wallet' && <><div className="portal-heading"><div><h2>Wallet balance</h2><p>Your wallet activity syncs with the business account. Contact the business for deposits, repayments, or account changes.</p></div></div><div className="portal-grid"><article className="portal-card"><span>{profile.customer.balance < 0 ? 'Amount owed' : 'Available balance'}</span><strong>{price(Math.abs(profile.customer.balance))}</strong><small>Customer wallet</small></article></div><section className="portal-panel"><h3>Wallet activity</h3>{profile.transactions.length ? <div className="portal-table-wrap"><table><thead><tr><th>Date</th><th>Activity</th><th>Amount</th></tr></thead><tbody>{profile.transactions.map(row => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleString()}</td><td>{row.reason}</td><td>{row.amount > 0 ? '+' : ''}{price(row.amount)}</td></tr>)}</tbody></table></div> : <p>No wallet activity yet.</p>}</section></>}
    {tab === 'order' && <><div className="portal-heading"><div><h2>{catalog?.businessName || 'Menu'}</h2><p>Choose items and options. Your basket is saved on this device if you go offline.</p></div></div>{!catalog?.menu?.items.length ? <div className="portal-empty">The business has not published an online menu yet.</div> : <><div className="portal-grid">{catalog.menu.items.map(item => <article className="portal-card" key={item.id}><span>{item.name}</span><strong>{price(item.price)}</strong>{item.description && <small>{item.description}</small>}{item.options.map(option => <label key={option.id} className="portal-check"><input type="checkbox" checked={(selectedOptions[item.id] || []).includes(option.id)} onChange={event => setSelectedOptions(current => ({ ...current, [item.id]: event.target.checked ? [...(current[item.id] || []), option.id] : (current[item.id] || []).filter(id => id !== option.id) }))} />{option.name} (+{price(option.price)})</label>)}<label>Quantity<input type="number" min="1" max="99" value={quantities[item.id] || '1'} onChange={event => setQuantities(current => ({ ...current, [item.id]: event.target.value }))} /></label><button className="portal-btn" onClick={() => addToBasket(item.id)}>Add to basket</button></article>)}</div><form className="portal-panel portal-form" onSubmit={submitOrder}><h3>Your order</h3>{basket.map(line => { const item = catalog.menu!.items.find(row => row.id === line.menuItemId); return item ? <p key={item.id}>{line.quantity} × {item.name}{line.optionIds.map(id => item.options.find(option => option.id === id)?.name).filter(Boolean).join(', ')}</p> : null })}<strong>Total: {price(basketTotal)}</strong>{catalog.mode === 'fast-food' && <label>Pickup / handoff<select value={diningOption} onChange={event => setDiningOption(event.target.value)}><option>Takeaway</option><option>Dine in</option><option>Delivery</option></select></label>}<label>Order note (optional)<input maxLength={300} value={note} onChange={event => setNote(event.target.value)} /></label><label>Payment<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as typeof paymentMethod)}><option value="cash">Pay at pickup / handoff</option><option value="bank-transfer">Bank transfer</option><option value="wallet">Customer wallet</option></select></label>{paymentMethod === 'wallet' && <p>Wallet payment is requested with the order. The business confirms and records the charge when it handles the order.</p>}{paymentMethod === 'bank-transfer' && <><p>Make the transfer using the business’s instructions, then enter its reference. The business must verify it before the order is marked paid.</p><label>Bank / transfer provider<input required maxLength={100} value={paymentProvider} onChange={event => setPaymentProvider(event.target.value)} /></label><label>Transfer reference<input required maxLength={120} value={paymentReference} onChange={event => setPaymentReference(event.target.value)} /></label></>}<button className="portal-btn" disabled={!online || busy || !basket.length || basketTotal <= 0}>{busy ? 'Submitting…' : 'Submit order'}</button></form></>}</>}
    {tab === 'orders' && <><div className="portal-heading"><div><h2>Track your orders</h2><p>Status refreshes when the business syncs its order updates.</p></div><button className="portal-btn secondary" disabled={!online || busy} onClick={() => { if (token) { setBusy(true); load(token).catch(caught => setError(caught instanceof Error ? caught.message : 'Could not refresh orders.')).finally(() => setBusy(false)) } }}>Refresh</button></div>{profile.orders.length ? profile.orders.map(order => <article className="portal-panel" key={order.id}><h3>Order {order.id.slice(-8).toUpperCase()} · {price(order.total)}</h3><p>{orderStatus[order.status] || order.status} · {new Date(order.updatedAt).toLocaleString()}</p><p>{order.lines.map(line => `${line.quantity} × ${line.name}${line.options.length ? ` (${line.options.join(', ')})` : ''}`).join(' · ')}</p><p>Payment: {order.paymentPending ? `${order.paymentMethod === 'wallet' ? 'Wallet charge requested' : 'Transfer submitted'}${order.paymentReference ? ` · ${order.paymentReference}` : ''} · awaiting business confirmation` : order.paymentMethod ? `${order.paymentMethod}${order.paymentReference ? ` · ${order.paymentReference}` : ''}` : 'Awaiting payment / confirmation'}</p></article>) : <div className="portal-empty">You have no online orders yet.</div>}</>}
  </div></main></div>
}

function readCache<T>(key: string): T | null { try { return JSON.parse(sessionStorage.getItem(key) || 'null') as T | null } catch { return null } }
function readLocalCache<T>(key: string): T | null { try { return JSON.parse(localStorage.getItem(key) || 'null') as T | null } catch { return null } }
