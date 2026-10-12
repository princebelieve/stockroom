import { Capacitor, SystemBarType, SystemBars, SystemBarsStyle } from '@capacitor/core'

export type AppTheme = 'light' | 'dark'

function normalizedColor(color: string) {
  return /^#[a-f0-9]{6}$/i.test(color) ? color.toLowerCase() : '#08b9f4'
}

function needsDarkIcons(color: string) {
  const channels = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255)
  const linear = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05)
}

export function applyAppAppearance(theme: AppTheme, appColor: string) {
  const root = document.documentElement
  const color = normalizedColor(appColor)
  const darkIcons = needsDarkIcons(color)
  root.dataset.appTheme = theme
  root.style.setProperty('--app-brand-color', color)
  root.style.setProperty('--app-brand-on-color', darkIcons ? '#071525' : '#ffffff')
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', color)
  window.dispatchEvent(new CustomEvent('stockroom-app-appearance', { detail: { theme, color } }))

  if (Capacitor.isNativePlatform()) {
    void SystemBars.setStyle({ style: darkIcons ? SystemBarsStyle.Light : SystemBarsStyle.Dark, bar: SystemBarType.StatusBar }).catch(() => {})
  }
}
