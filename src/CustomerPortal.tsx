import { HelpMenu } from './HelpMenu'
import { applyLogoTheme } from './lib/logoTheme'
import { ReadingControls } from './ReadingControls'
import { priceOrder, posSettings, type PosSettings } from '../server/pos-pricing.mjs'
import { useEffect, useMemo, useState } from 'react'
import { usePortalMenu } from './lib/usePortalMenu'
import { LogOut, ShoppingBag, WalletCards, Menu } from 'lucide-react'
import './portal.css'
import './ui.css'

const api = __STOCKROOM_SYNC_API_URL__.replace(/\/$/, '')
type WalletTransaction = { id: string; amount: number; reason: string; createdAt: string }
type CustomerOrder = { delivery?: boolean; deliveryStatus?: string; id: string; status: string; total: number; currency: string; createdAt: string; updatedAt: string; lines: Array<{ name: string; quantity: number; options: string[] }>; paymentMethod: string; paymentReference: string; paymentPending: boolean }
type Profile = { guest?: boolean; customer: { id: string; name: string; phone: string; balance: number }; transactions: WalletTransaction[]; orders: CustomerOrder[] }
type MenuOption = { id: string; name: string; price: number }
type Catalog = { logoData?:string; brandColor?:string; customerOrdering?: import('../server/customer-order-settings.mjs').CustomerOrderSettings; walletAllowed?: boolean; tax?: Partial<PosSettings>; businessId: string; businessName: string; currency: string; mode: 'account' | 'fast-food' | 'restaurant' | 'retail'; menu: null | { id: string; updatedAt: string; items: Array<{ id: string; name: string; description: string; price: number; options: MenuOption[] }> } }
type BasketLine = { menuItemId: string; quantity: number; optionIds: string[] }
const orderStatus: Record<string, string> = { pending: 'Awaiting business acceptance', queued: 'Accepted by the business', preparing: 'Being prepared', ready: 'Ready for pickup / handoff', collected: 'Completed', cancelled: 'Cancelled' }

export function CustomerPortal({ businessId }: { businessId: string }) {
  const navigation = usePortalMenu()
  const [expandedGroup, setExpandedGroup] = useState<'wallet'|'order'|null>(null)
  const [sectionTarget, setSectionTarget] = useState('')
  useEffect(()=>{if(sectionTarget){document.getElementById(sectionTarget)?.scrollIntoView({behavior:'smooth',block:'start'});setSectionTarget('')}},[sectionTarget])
  function navigate(next: 'wallet'|'order'|'orders', section = '') {setTab(next);setSectionTarget(section);navigation.setOpen(false)}
  const tokenKey = `stockroom-customer-${businessId}`
  const cacheKey = `stockroom-customer-data-${businessId}`
  const retailLink=new URLSearchParams(window.location.search).get('catalog')==='retail'
  const catalogKey = `stockroom-customer-catalog-${businessId}${retailLink?'-retail':''}`
  const basketKey = `stockroom-customer-basket-${businessId}${retailLink?'-retail':''}`
  const [token, setToken] = useState(() => sessionStorage.getItem(tokenKey) || '')
  const [profile, setProfile] = useState<Profile | null>(() => { const saved = readCache<Profile>(cacheKey); return saved ? { ...saved, orders: Array.isArray(saved.orders) ? saved.orders : [], transactions: Array.isArray(saved.transactions) ? saved.transactions : [] } : null })
  const [catalog, setCatalog] = useState<Catalog | null>(() => readCache<Catalog>(catalogKey))
  const [basket, setBasket] = useState<BasketLine[]>(() => (readLocalCache<BasketLine[]>(basketKey) || []).filter(line => (retailLink||catalog?.mode==='retail'?Number.isFinite(line.quantity)&&Math.abs(line.quantity*1000-Math.round(line.quantity*1000))<0.000001:Number.isSafeInteger(line.quantity)) && line.quantity >= (retailLink||catalog?.mode==='retail'?0.001:1) && line.quantity <= 99 && Array.isArray(line.optionIds)))
  const [pendingOrder, setPendingOrder] = useState<Record<string, unknown> | null>(() => readLocalCache<Record<string, unknown>>(`${basketKey}-pending-order`))
  const [tab, setTab] = useState<'wallet' | 'order' | 'orders'>('wallet')
  const [online, setOnline] = useState(navigator.onLine)
  const [guestName, setGuestName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [note, setNote] = useState('')
  const [diningOption, setDiningOption] = useState('Takeaway')
  const [deliveryZoneId, setDeliveryZoneId] = useState('')
  const [deliveryPhone, setDeliveryPhone] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
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
      fetch(`${api}/v1/customer-portal/catalog?businessId=${encodeURIComponent(businessId)}&mode=${new URLSearchParams(window.location.search).get('catalog')==='retail'?'retail':'food'}`),
    ])
    const account = await accountResponse.json()
    if (!accountResponse.ok) throw new Error(account.error || 'Could not load your customer account.')
    const normalizedAccount: Profile = { ...account, orders: Array.isArray(account.orders) ? account.orders : [], transactions: Array.isArray(account.transactions) ? account.transactions : [] }
    setProfile(normalizedAccount); if (normalizedAccount.guest) setTab(current => current === 'wallet' ? 'order' : current); sessionStorage.setItem(cacheKey, JSON.stringify(normalizedAccount))
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
  useEffect(()=>{
    if(token)return
    const controller=new AbortController()
    fetch(`${api}/v1/customer-portal/catalog?businessId=${encodeURIComponent(businessId)}&mode=${retailLink?'retail':'food'}`,{signal:controller.signal}).then(async response=>{
      if(!response.ok)return
      const data=await response.json()
      if(controller.signal.aborted)return
      setCatalog(data);sessionStorage.setItem(catalogKey,JSON.stringify(data))
    }).catch(()=>{/* The saved public catalogue remains available offline. */})
    return()=>controller.abort()
  },[token,businessId,retailLink])
  useEffect(() => {
    const onlineNow = () => { setOnline(true); if (token) load(token).catch(caught => setError(caught instanceof Error ? caught.message : 'Could not refresh your account.')) }
    const offlineNow = () => setOnline(false)
    window.addEventListener('online', onlineNow); window.addEventListener('offline', offlineNow)
    return () => { window.removeEventListener('online', onlineNow); window.removeEventListener('offline', offlineNow) }
  }, [token, businessId])
  useEffect(() => {
    if (!token) return
    const timer = setInterval(() => { if (navigator.onLine && !busy) load(token).catch(caught => setError(caught instanceof Error ? caught.message : 'Could not refresh orders.')) }, 15000)
    return () => clearInterval(timer)
  }, [token, busy, businessId])
  useEffect(() => { try { localStorage.setItem(basketKey, JSON.stringify(basket)) } catch { setError('This device could not save your basket.') } }, [basket])

  async function guestSignIn(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch(`${api}/v1/customer-portal/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId, name: guestName }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Guest ordering is unavailable.')
      sessionStorage.setItem(tokenKey, data.accessToken); setToken(data.accessToken); await load(data.accessToken); setTab('order')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not open the menu.') } finally { setBusy(false) }
  }
  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch(`${api}/v1/customer-portal/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId, username, password }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Sign-in failed.')
      sessionStorage.setItem(tokenKey, data.accessToken); setToken(data.accessToken); await load(data.accessToken)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Sign-in failed.') } finally { setBusy(false) }
  }
  function signOut() { for(const suffix of ['', '-retail']){const key=`stockroom-customer-basket-${businessId}${suffix}`;for(const ending of ['', '-order-id','-pending-order'])localStorage.removeItem(key+ending);sessionStorage.removeItem(`stockroom-customer-catalog-${businessId}${suffix}`)} sessionStorage.removeItem(tokenKey); sessionStorage.removeItem(cacheKey); sessionStorage.removeItem(catalogKey); localStorage.removeItem(basketKey); localStorage.removeItem(`${basketKey}-order-id`); localStorage.removeItem(`${basketKey}-pending-order`); setPendingOrder(null); setBasket([]); setToken(''); setProfile(null); setCatalog(null) }
  function addToBasket(itemId: string) {
    const quantity = Number(quantities[itemId] || 1)
    if (!(catalog?.mode==='retail'?Number.isFinite(quantity)&&Math.abs(quantity*1000-Math.round(quantity*1000))<0.000001:Number.isSafeInteger(quantity)) || quantity < (catalog?.mode==='retail'?0.001:1) || quantity > 99) { setError('Choose a valid quantity up to 99 (retail quantities may use three decimals).'); return }
    const optionIds = selectedOptions[itemId] || []
    setBasket(rows => [...rows.filter(row => row.menuItemId !== itemId), { menuItemId: itemId, quantity, optionIds }])
    setMessage('Added to your saved basket.')
  }
  async function submitOrder(event: React.FormEvent) {
    event.preventDefault(); if (!pendingOrder && (!catalog?.menu || !basket.length)) return
    setBusy(true); setError(''); setMessage('')
    const clientOrderId = readLocalCache<string>(`${basketKey}-order-id`) || crypto.randomUUID()
    const request = pendingOrder || { clientOrderId, menuUpdatedAt: catalog?.menu?.updatedAt, catalogMode: catalog?.mode, lines: basket, expectedTotal: basketTotal, note, diningOption, delivery: { phone: deliveryPhone, address: deliveryAddress, zoneId: deliveryZoneId }, paymentMethod, paymentProvider, paymentReference }
    localStorage.setItem(`${basketKey}-order-id`, JSON.stringify(clientOrderId))
    localStorage.setItem(`${basketKey}-pending-order`, JSON.stringify(request)); setPendingOrder(request)
    try {
      const response = await fetch(`${api}/v1/customer-portal/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(request) })
      const data = await response.json()
      if (!response.ok) {
        if ([400, 401, 403, 409, 429].includes(response.status)) { localStorage.removeItem(`${basketKey}-pending-order`); localStorage.removeItem(`${basketKey}-order-id`); setPendingOrder(null) }
        throw new Error(data.error || 'Could not submit your order.')
      }
      setBasket([]); localStorage.removeItem(`${basketKey}-order-id`); localStorage.removeItem(`${basketKey}-pending-order`); setPendingOrder(null); setNote(''); setPaymentProvider(''); setPaymentReference(''); setMessage(paymentMethod === 'wallet' ? 'Order received. The business will confirm the wallet charge when it handles your order.' : paymentMethod === 'bank-transfer' ? 'Order received. The business will confirm the transfer before marking it paid.' : 'Order submitted for staff acceptance. Pay at pickup or handoff.')
      await load(token); setTab('orders')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not submit your order.') } finally { setBusy(false) }
  }

  const price = (amount: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: catalog?.currency || 'USD' }).format(amount)
  const basketPricing = useMemo(() => priceOrder([...basket.flatMap(line => {
    const item = catalog?.menu?.items.find(item => item.id === line.menuItemId)
    return item ? [{ productId: item.id, quantity: line.quantity, price: item.price + item.options.filter(option => line.optionIds.includes(option.id)).reduce((n, option) => n + option.price, 0) }] : []
  }), ...(diningOption === 'Delivery' && catalog?.customerOrdering?.deliveryEnabled && (catalog.customerOrdering.deliveryZones?.find(zone=>zone.id===deliveryZoneId)?.fee ?? catalog.customerOrdering.deliveryFee) > 0 ? [{ productId: 'service:counter:delivery-fee', quantity: 1, price: (catalog.customerOrdering.deliveryZones?.find(zone=>zone.id===deliveryZoneId)?.fee ?? catalog.customerOrdering.deliveryFee) }] : [])], { tax: posSettings(catalog?.tax) }), [catalog, basket, diningOption, deliveryZoneId])
  const basketTotal = basketPricing.total


  useEffect(()=>{void applyLogoTheme(catalog?.logoData||'',catalog?.brandColor||'');return()=>{void applyLogoTheme('')}},[catalog?.logoData,catalog?.brandColor])
  if (!profile) return <main className="portal-login"><section className="portal-login-card"><a className="portal-brand" href={`/?customer=${encodeURIComponent(businessId)}${retailLink?'&catalog=retail':''}`}><img src={catalog?.logoData || '/logo.png'} alt="" /><span><strong>Customer account</strong><small>Stockroom Business App</small></span></a><h1>Order from this business</h1><p>Enter your name to order without creating an account.</p><form className="portal-form" onSubmit={guestSignIn}><label>Name for pickup<input required maxLength={100} autoComplete="name" value={guestName} onChange={event => setGuestName(event.target.value)} /></label><button className="portal-btn" disabled={busy || !online}>Continue as guest</button></form><h2>Wallet customer sign-in</h2><p>Use the username and password provided by the business.</p>{error && <div className="portal-alert error" role="alert">{error}</div>}<form className="portal-form" onSubmit={signIn}><label>Username<input autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label><button className="portal-btn" disabled={busy || !online}>{busy ? 'Signing in…' : 'Sign in'}</button></form><p>Contact the business owner or admin if you need an account.</p></section></main>

  return <div className="portal customer-portal"><HelpMenu/><ReadingControls/>{navigation.open && <button className="visitor-nav-backdrop" aria-label="Close navigation menu" onClick={()=>navigation.setOpen(false)}/>}<aside ref={navigation.menu} id="customer-navigation" className={`portal-sidebar${navigation.open?' open':''}`}><a className="portal-brand" href={`/?customer=${encodeURIComponent(businessId)}${retailLink?'&catalog=retail':''}`}><img src={catalog?.logoData || '/logo.png'} alt="" /><span><strong>{profile.customer.name}</strong><small>{catalog?.businessName || 'Customer account'}</small></span></a><nav className="portal-nav" aria-label="Customer navigation">{!profile.guest && <div className="visitor-nav-group"><button className={tab==='wallet'?'active':''} aria-expanded={expandedGroup==='wallet'} aria-controls="customer-wallet-menu" onClick={()=>{setTab('wallet');setExpandedGroup(expandedGroup==='wallet'?null:'wallet')}}><WalletCards size={18}/>Wallet<span className="nav-disclosure" aria-hidden="true">{expandedGroup==='wallet'?'−':'+'}</span></button>{expandedGroup==='wallet' && <div id="customer-wallet-menu" className="visitor-subnav"><a href="#customer-wallet-balance" onClick={event=>{event.preventDefault();navigate('wallet','customer-wallet-balance')}}>Balance</a><a href="#customer-wallet-activity" onClick={event=>{event.preventDefault();navigate('wallet','customer-wallet-activity')}}>Wallet activity</a></div>}</div>}{catalog?.menu && <div className="visitor-nav-group"><button className={tab==='order'?'active':''} aria-expanded={expandedGroup==='order'} aria-controls="customer-order-menu" onClick={()=>{setTab('order');setExpandedGroup(expandedGroup==='order'?null:'order')}}><ShoppingBag size={18}/>Order online<span className="nav-disclosure" aria-hidden="true">{expandedGroup==='order'?'−':'+'}</span></button>{expandedGroup==='order' && <div id="customer-order-menu" className="visitor-subnav"><a href="#customer-order-items" onClick={event=>{event.preventDefault();navigate('order','customer-order-items')}}>Browse items</a><a href="#customer-order-basket" onClick={event=>{event.preventDefault();navigate('order','customer-order-basket')}}>Your basket</a></div>}</div>}<button className={tab==='orders'?'active':''} onClick={()=>navigate('orders')}><ShoppingBag size={18}/>Order tracking</button></nav><div className="portal-sidebar-foot">{profile.customer.phone}</div></aside><main className="portal-main"><header className="portal-top"><div className="portal-actions"><button ref={navigation.toggle} className="portal-btn secondary portal-mobile-menu" aria-label={navigation.open?'Close navigation menu':'Open navigation menu'} aria-expanded={navigation.open} aria-controls="customer-navigation" onClick={()=>navigation.setOpen(!navigation.open)}><Menu size={18}/></button><div><h1>{tab === 'wallet' ? 'My wallet' : tab === 'order' ? 'Order online' : 'Order tracking'}</h1><p>{catalog?.businessName || 'Your account with this business'}</p></div></div><button className="portal-btn secondary" onClick={signOut}><LogOut size={15} />Sign out</button></header><div className="portal-content">{!online && <div className="portal-alert">Offline. Showing saved account and menu data. Submit orders and confirm payments when reconnected.</div>}{error && online && <div className="portal-alert error" role="status">{error}</div>}{message && <div className="portal-alert success" role="status">{message}</div>}
    {!profile.guest && tab === 'wallet' && <><div id="customer-wallet-balance" className="portal-heading"><div><h2>Wallet balance</h2><p>Your wallet activity syncs with the business account. Contact the business for deposits, repayments, or account changes.</p></div></div><div className="portal-grid"><article className="portal-card"><span>{profile.customer.balance < 0 ? 'Amount owed' : 'Available balance'}</span><strong>{price(Math.abs(profile.customer.balance))}</strong><small>Customer wallet</small></article></div><section id="customer-wallet-activity" className="portal-panel"><h3>Wallet activity</h3>{profile.transactions.length ? <div className="portal-table-wrap"><table><thead><tr><th>Date</th><th>Activity</th><th>Amount</th></tr></thead><tbody>{profile.transactions.map(row => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleString()}</td><td>{row.reason}</td><td>{row.amount > 0 ? '+' : ''}{price(row.amount)}</td></tr>)}</tbody></table></div> : <p>No wallet activity yet.</p>}</section></>}
    {tab === 'order' && <><div className="portal-heading"><div><h2>{catalog?.businessName || 'Menu'}</h2><p>Choose items and options. Your basket is saved on this device if you go offline.</p></div></div>{!catalog?.menu?.items.length ? <div className="portal-empty">The business has not published items for online ordering yet.</div> : <><div id="customer-order-items" className="portal-grid">{catalog.menu.items.map(item => <article className="portal-card" key={item.id}><span>{item.name}</span><strong>{price(item.price)}</strong>{item.description && <small>{item.description}</small>}{item.options.map(option => <label key={option.id} className="portal-check"><input type="checkbox" checked={(selectedOptions[item.id] || []).includes(option.id)} onChange={event => setSelectedOptions(current => ({ ...current, [item.id]: event.target.checked ? [...(current[item.id] || []), option.id] : (current[item.id] || []).filter(id => id !== option.id) }))} />{option.name} (+{price(option.price)})</label>)}<label>Quantity<input type="number" min={catalog.mode==='retail'?0.001:1} step={catalog.mode==='retail'?0.001:1} max="99" value={quantities[item.id] || '1'} onChange={event => setQuantities(current => ({ ...current, [item.id]: event.target.value }))} /></label><button className="portal-btn" disabled={busy || Boolean(pendingOrder)} onClick={() => addToBasket(item.id)}>Add to basket</button></article>)}</div><form id="customer-order-basket" className="portal-panel portal-form" onSubmit={submitOrder}><h3>Your order</h3>{pendingOrder && <p role="status">A previous submission may have reached the business. Retry the saved request to confirm it without creating a duplicate.</p>}{basket.map(line => { const item = catalog.menu!.items.find(row => row.id === line.menuItemId); return item ? <p key={item.id}><button type="button" className="portal-btn secondary" disabled={busy || Boolean(pendingOrder)} onClick={() => setBasket(rows => rows.filter(row => row.menuItemId !== item.id))}>Remove</button> {line.quantity} × {item.name}{line.optionIds.map(id => item.options.find(option => option.id === id)?.name).filter(Boolean).join(', ')}</p> : null })}<strong>Total: {price(basketTotal)}</strong>{basketPricing.taxSettings.taxEnabled && <p>{basketPricing.taxSettings.taxLabel}: {price(basketPricing.tax)} {basketPricing.taxSettings.taxIncluded ? '(included)' : '(added)'}</p>}<p>Staff must accept the order and confirm payment.</p>{(catalog.mode === 'fast-food' || catalog.mode === 'retail') && <label>Pickup / handoff<select aria-label="Pickup / handoff" disabled={busy || Boolean(pendingOrder)} value={diningOption} onChange={event => setDiningOption(event.target.value)}><option>Takeaway</option>{catalog.mode !== 'retail' && <option>Dine in</option>}{catalog.customerOrdering?.deliveryEnabled && <option>Delivery</option>}</select></label>}{diningOption === 'Delivery' && catalog.customerOrdering?.deliveryEnabled && <><p>Delivery charge before tax: {price((catalog.customerOrdering.deliveryZones?.find(zone=>zone.id===deliveryZoneId)?.fee ?? catalog.customerOrdering.deliveryFee))}</p>{Boolean(catalog.customerOrdering.deliveryZones?.length) && <label>Delivery area<select required aria-label="Delivery area" disabled={busy || Boolean(pendingOrder)} value={deliveryZoneId} onChange={e=>setDeliveryZoneId(e.target.value)}><option value="">Choose delivery area</option>{catalog.customerOrdering.deliveryZones.map(zone=><option key={zone.id} value={zone.id}>{zone.name} / {price(zone.fee)}</option>)}</select></label>}<label>Delivery phone number<input required minLength={6} maxLength={40} disabled={busy || Boolean(pendingOrder)} value={deliveryPhone} onChange={e => setDeliveryPhone(e.target.value)} /></label><label>Complete delivery address<textarea required minLength={8} maxLength={300} disabled={busy || Boolean(pendingOrder)} value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} /></label></>}<label>Order note (optional)<input disabled={busy || Boolean(pendingOrder)} maxLength={300} value={note} onChange={event => setNote(event.target.value)} /></label><label>Payment<select aria-label="Payment" disabled={busy || Boolean(pendingOrder)} value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as typeof paymentMethod)}><option value="cash">Pay at pickup / handoff</option>{catalog.customerOrdering?.bankName && catalog.customerOrdering.accountName && catalog.customerOrdering.accountNumber && <option value="bank-transfer">Bank transfer</option>}{!profile.guest && catalog?.walletAllowed && <option value="wallet">Customer wallet</option>}</select></label>{paymentMethod === 'wallet' && <p>Wallet payment is requested with the order. The business confirms and records the charge when it handles the order.</p>}{paymentMethod === 'bank-transfer' && <><p>Transfer to <strong>{catalog.customerOrdering?.bankName} / {catalog.customerOrdering?.accountName} / {catalog.customerOrdering?.accountNumber}</strong>. {catalog.customerOrdering?.transferInstructions} Enter its reference after transferring. Staff must verify receipt of the money before marking the order paid.</p><label>Bank / transfer provider<input disabled={busy || Boolean(pendingOrder)} required maxLength={100} value={paymentProvider} onChange={event => setPaymentProvider(event.target.value)} /></label><label>Transfer reference<input disabled={busy || Boolean(pendingOrder)} required maxLength={120} value={paymentReference} onChange={event => setPaymentReference(event.target.value)} /></label></>}<button className="portal-btn" disabled={!online || busy || (!pendingOrder && (!basket.length || basketTotal <= 0))}>{busy ? 'Submitting…' : pendingOrder ? 'Retry saved order' : 'Submit order'}</button></form></>}</>}
    {tab === 'orders' && <><div className="portal-heading"><div><h2>Track your orders</h2><p>Status refreshes when the business syncs its order updates.</p></div><button className="portal-btn secondary" disabled={!online || busy} onClick={() => { if (token) { setBusy(true); load(token).catch(caught => setError(caught instanceof Error ? caught.message : 'Could not refresh orders.')).finally(() => setBusy(false)) } }}>Refresh</button></div>{profile.orders.length ? profile.orders.map(order => <article className="portal-panel" key={order.id}><h3>Order {order.id.slice(-8).toUpperCase()} · {price(order.total)}</h3><p>{order.status==='ready'&&order.deliveryStatus==='dispatched'?'Out for delivery':order.delivery&&order.status==='collected'?'Delivered':order.delivery&&order.status==='ready'?'Ready for delivery':orderStatus[order.status] || order.status} · {new Date(order.updatedAt).toLocaleString()}</p><p>{order.lines.map(line => `${line.quantity} × ${line.name}${line.options.length ? ` (${line.options.join(', ')})` : ''}`).join(' · ')}</p><p>Payment: {order.paymentPending ? `${order.paymentMethod === 'wallet' ? 'Wallet charge requested' : 'Transfer submitted'}${order.paymentReference ? ` · ${order.paymentReference}` : ''} · awaiting business confirmation` : order.paymentMethod ? `${order.paymentMethod}${order.paymentReference ? ` · ${order.paymentReference}` : ''}` : 'Awaiting payment / confirmation'}</p></article>) : <div className="portal-empty">You have no online orders yet.</div>}</>}
  </div></main></div>
}

function readCache<T>(key: string): T | null { try { return JSON.parse(sessionStorage.getItem(key) || 'null') as T | null } catch { return null } }
function readLocalCache<T>(key: string): T | null { try { return JSON.parse(localStorage.getItem(key) || 'null') as T | null } catch { return null } }
