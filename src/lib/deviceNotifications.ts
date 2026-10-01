import { Capacitor, registerPlugin } from '@capacitor/core'

type NativeNotificationPlugin = {
  requestPermission(): Promise<{ granted: boolean }>
  show(options: { id: string; title: string; body: string; url?: string }): Promise<{ shown: boolean }>
  getPushToken(): Promise<{ token: string }>
  disablePush(): Promise<{ disabled: boolean }>
}

const AndroidNotifications = registerPlugin<NativeNotificationPlugin>('StockroomNotifications')

export function hasDeviceNotificationSupport() {
  return Capacitor.isNativePlatform() || Boolean(window.stockroomDesktop)
}

export async function requestDeviceNotificationPermission() {
  if (Capacitor.isNativePlatform()) return (await AndroidNotifications.requestPermission()).granted
  if (window.stockroomDesktop) return window.stockroomDesktop.notificationsSupported()
  return false
}

export async function showDeviceNotification(options: { id: string; title: string; body: string; url?: string }) {
  if (Capacitor.isNativePlatform()) return (await AndroidNotifications.show(options)).shown
  if (window.stockroomDesktop) return window.stockroomDesktop.showNotification(options)
  return false
}

export function isAndroidNative() { return Capacitor.getPlatform() === 'android' }

export async function getNativePushToken() {
  if (!isAndroidNative()) throw new Error('Android push tokens are available only in the APK.')
  return (await AndroidNotifications.getPushToken()).token
}

export async function disableNativePush() {
  if (!isAndroidNative()) return
  await AndroidNotifications.disablePush()
}
