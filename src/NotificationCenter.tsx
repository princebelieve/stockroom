import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, BellRing, Check, ExternalLink } from 'lucide-react'
import { cloudRequest } from './lib/cloudRequest'
import { disableNativePush, getNativePushToken, hasDeviceNotificationSupport, isAndroidNative, requestDeviceNotificationPermission, showDeviceNotification } from './lib/deviceNotifications'
import './notifications.css'

type NotificationItem = { id: string; title: string; body: string; url: string; type: string; createdAt: string; read: boolean }
type NotificationState = { notifications: NotificationItem[]; unread: number; pushSupported: boolean; pushEnabled: boolean; fcmSupported?: boolean; fcmEnabled?: boolean; publicKey: string }

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0))
}

export function NotificationCenter({ apiUrl, token, onToken, allowPush = false, request }: { apiUrl: string; token: string; onToken: (access: string, refresh: string) => void; allowPush?: boolean; request?: (path: string, init?: RequestInit) => Promise<any> }) {
  const [data, setData] = useState<NotificationState | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [localPush, setLocalPush] = useState(false)
  const [deviceAlerts, setDeviceAlerts] = useState(() => localStorage.getItem('stockroom-device-alerts') === 'on')
  const [nativeFcmReady, setNativeFcmReady] = useState(false)
  const [message, setMessage] = useState('')

  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken
  const requestRef = useRef(request)
  requestRef.current = request
  const send = useCallback((path: string, init: RequestInit = {}) => requestRef.current ? requestRef.current(path, init) : cloudRequest(apiUrl, path, init, onTokenRef.current, token), [apiUrl, token])
  const load = useCallback(async () => {
    try { setData(await send('/v1/notifications/me') as NotificationState); setMessage('') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Notifications are unavailable.') }
  }, [send])
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 90_000); return () => window.clearInterval(timer) }, [load])
  useEffect(() => { if (!allowPush || !('serviceWorker' in navigator)) return; let live = true; void navigator.serviceWorker.getRegistration('/').then(registration => registration?.pushManager.getSubscription()).then(subscription => { if (live) setLocalPush(Boolean(subscription)) }).catch(() => undefined); return () => { live = false } }, [allowPush])
  useEffect(() => {
    if (!data || !hasDeviceNotificationSupport()) return
    let seen: string[] = []
    try { seen = JSON.parse(localStorage.getItem('stockroom-native-notification-seen') || '[]') as string[] } catch {}
    const seenSet = new Set(seen)
    const unseen = data.notifications.filter(item => !seenSet.has(item.id) && Date.now() - new Date(item.createdAt).getTime() < 24 * 60 * 60 * 1000)
    if (deviceAlerts && !(isAndroidNative() && nativeFcmReady)) for (const item of unseen.slice(0, 3).reverse()) void showDeviceNotification({ id: item.id, title: item.title, body: item.body, url: item.url })
    localStorage.setItem('stockroom-native-notification-seen', JSON.stringify([...data.notifications.map(item => item.id), ...seen].slice(0, 100)))
  }, [data, deviceAlerts, nativeFcmReady])

  useEffect(() => {
    if (!deviceAlerts || !isAndroidNative() || !data?.fcmSupported) { setNativeFcmReady(false); return }
    let active = true
    void getNativePushToken().then(token => send('/v1/notifications/fcm-token', { method: 'POST', body: JSON.stringify({ token }) })).then(() => { if (active) setNativeFcmReady(true) }).catch(error => { if (active) { setNativeFcmReady(false); setMessage(error instanceof Error ? error.message : 'Android push registration failed.') } })
    return () => { active = false }
  }, [deviceAlerts, data?.fcmSupported, send])

  const toggleDeviceAlerts = async () => {
    if (deviceAlerts) {
      if (isAndroidNative()) {
        try { const token = await getNativePushToken(); await send('/v1/notifications/fcm-token', { method: 'DELETE', body: JSON.stringify({ token }) }) } catch {}
        try { await disableNativePush() } catch {}
      }
      localStorage.setItem('stockroom-device-alerts', 'off'); setDeviceAlerts(false); setNativeFcmReady(false); setMessage('Device notifications are off on this device.'); return
    }
    setBusy(true); setMessage('')
    try {
      if (!hasDeviceNotificationSupport()) throw new Error('Device notifications are available in the installed APK and Windows app.')
      if (!await requestDeviceNotificationPermission()) throw new Error('Notification permission is off. Allow Stockroom notifications in your device or Windows settings.')
      if (isAndroidNative() && data?.fcmSupported) {
        const token = await getNativePushToken()
        await send('/v1/notifications/fcm-token', { method: 'POST', body: JSON.stringify({ token }) })
        setNativeFcmReady(true)
      }
      localStorage.setItem('stockroom-device-alerts', 'on'); setDeviceAlerts(true); setMessage('Device notifications are on.')
    } catch (error) {
      if (isAndroidNative()) try { await disableNativePush() } catch {}
      setMessage(error instanceof Error ? error.message : 'Could not enable device notifications.')
    }
    finally { setBusy(false) }
  }

  const enablePush = async () => {
    setBusy(true); setMessage('')
    try {
      if (!allowPush || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Push alerts are available in the installed PWA. This app still shows in-app notifications here.')
      if (!data?.publicKey) throw new Error('Push notifications are not configured on the Stockroom server yet.')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Allow notifications in your browser settings to receive Stockroom alerts.')
      const registration = await navigator.serviceWorker.getRegistration('/') || await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(data.publicKey) })
      await send('/v1/notifications/push-subscription', { method: 'POST', body: JSON.stringify({ subscription: subscription.toJSON() }) })
      setLocalPush(true); setMessage('Push alerts are on for this device.'); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not enable push alerts.') }
    finally { setBusy(false) }
  }

  const disablePush = async () => {
    setBusy(true); setMessage('')
    try {
      const registration = await navigator.serviceWorker.getRegistration('/')
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await send('/v1/notifications/push-subscription', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) })
        await subscription.unsubscribe()
      }
      setLocalPush(false); setMessage('Push alerts are off for this device.'); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not disable push alerts.') }
    finally { setBusy(false) }
  }

  const markRead = async (item?: NotificationItem) => {
    try { await send('/v1/notifications/read', { method: 'POST', body: JSON.stringify(item ? { id: item.id } : { all: true }) }); await load() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update notifications.') }
  }

  return <div className="notification-center">
    <button type="button" className="notification-bell" aria-label={`Notifications${data?.unread ? `, ${data.unread} unread` : ''}`} aria-expanded={open} onClick={() => setOpen(value => !value)} title="Notifications">
      {data?.unread ? <BellRing size={19} /> : <Bell size={19} />}{Boolean(data?.unread) && <span className="notification-count">{data!.unread > 99 ? '99+' : data!.unread}</span>}
    </button>
    {open && <section className="notification-popover" aria-label="Notifications">
      <div className="notification-popover-heading"><div><strong>Notifications</strong><small>{data?.unread || 0} unread</small></div><button type="button" className="notification-text-action" onClick={() => void markRead()} disabled={!data?.unread}>Mark all read</button></div>
      {!data?.notifications.length && <p className="notification-empty">{message || 'You are all caught up.'}</p>}
      {data?.notifications.map(item => <article key={item.id} className={`notification-item${item.read ? '' : ' unread'}`}>
        <button type="button" className="notification-item-content" onClick={() => { if (!item.read) void markRead(item); setOpen(false); window.location.assign(item.url || '/') }}><strong>{item.title}</strong><span>{item.body}</span><small>{new Date(item.createdAt).toLocaleString()}</small></button>
        {!item.read && <button type="button" className="notification-read-one" aria-label="Mark as read" onClick={() => void markRead(item)}><Check size={15} /></button>}
      </article>)}
      <div className="notification-push-settings">{hasDeviceNotificationSupport() && <button type="button" onClick={() => void toggleDeviceAlerts()} disabled={busy}><BellRing size={15} />{busy ? 'Updating...' : deviceAlerts ? 'Turn off device notifications' : 'Enable device notifications'}</button>}{allowPush ? localPush ? <button type="button" onClick={() => void disablePush()} disabled={busy}><BellRing size={15} />{busy ? 'Updating...' : 'Turn off browser push alerts'}</button> : data?.pushSupported ? <button type="button" onClick={() => void enablePush()} disabled={busy}><Bell size={15} />{busy ? 'Enabling...' : 'Enable browser push alerts'}</button> : <span><Bell size={15} /> Browser push alerts are not configured yet</span> : !hasDeviceNotificationSupport() && <span><ExternalLink size={15} /> Browser push alerts are available in the installed PWA</span>}</div>
      {message && data?.notifications.length ? <p className="notification-status" role="status">{message}</p> : null}
    </section>}
  </div>
}
