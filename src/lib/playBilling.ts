import { Capacitor, registerPlugin } from '@capacitor/core'

export type PlayOffer = { offerToken: string; formattedPrice?: string; currencyCode?: string }
export type PlayProduct = { productId: string; title: string; description: string; offers: PlayOffer[] }
export type PlayPurchase = { purchaseToken: string; products: string[]; purchaseState: number }
type BillingPlugin = {
  isPlayStoreBuild(): Promise<{ playStore: boolean }>
  queryProducts(options: { productIds: string[] }): Promise<{ products: PlayProduct[] }>
  queryExportProduct(options: { productId: string }): Promise<PlayProduct>
  purchase(options: { productId: string; offerToken: string; obfuscatedAccountId: string }): Promise<{ launched: boolean }>
  purchaseExportProduct(options: { productId: string; offerToken: string; obfuscatedAccountId: string }): Promise<{ launched: boolean }>
  restorePurchases(): Promise<{ purchases: PlayPurchase[] }>
  restoreExportPurchases(): Promise<{ purchases: PlayPurchase[] }>
  addListener(event: 'purchaseUpdated' | 'purchaseError', listener: (purchase: PlayPurchase & { message?: string }) => void): Promise<{ remove: () => void }>
}

export const PlayBilling = registerPlugin<BillingPlugin>('StockroomBilling')

export async function isPlayStoreBuild() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return false
  try { return (await PlayBilling.isPlayStoreBuild()).playStore === true } catch { return false }
}
