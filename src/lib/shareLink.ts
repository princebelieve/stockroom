import { Capacitor, registerPlugin } from '@capacitor/core'

type SharePayload = { title: string; text: string; url: string }
type NativeSharePlugin = { share(payload: SharePayload): Promise<void> }
const NativeShare = registerPlugin<NativeSharePlugin>('StockroomShare')

export async function shareLink(payload: SharePayload) {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    await NativeShare.share(payload)
    return
  }
  if (typeof navigator !== 'undefined' && navigator.share) {
    await navigator.share(payload)
    return
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(`${payload.text}\n${payload.url}`)
    return
  }
  throw new Error('Sharing is not available on this device.')
}
