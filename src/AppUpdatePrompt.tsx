import { useEffect, useState } from 'react'
import { isNativeMobile } from './lib/mobileDatabase'

type UpdateManifest = { windowsVersion?: string; androidVersion?: string; downloadsUrl?: string }
type AvailableUpdate = { version: string; downloadsUrl: string; platform: 'Windows' | 'Android' }

function compareVersions(left: string, right: string) {
  const parse = (value: string) => /^\d+(?:\.\d+){1,3}$/.test(value) ? value.split('.').map(Number) : null
  const a = parse(left); const b = parse(right)
  if (!a || !b) return 0
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0)
    if (difference) return difference
  }
  return 0
}

export function AppUpdatePrompt() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null)

  useEffect(() => {
    const nativeAndroid = isNativeMobile()
    const windows = Boolean(window.stockroomDesktop)
    if (!nativeAndroid && !windows) return
    const platform = nativeAndroid ? 'Android' : 'Windows'
    const currentVersion = nativeAndroid ? __STOCKROOM_ANDROID_VERSION__ : __STOCKROOM_WINDOWS_VERSION__
    let active = true

    const check = async () => {
      try {
        const response = await fetch(`https://stockroom.globalcreest.com/app-update.json?check=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
        if (!response.ok) return
        const manifest = await response.json() as UpdateManifest
        const latestVersion = nativeAndroid ? manifest.androidVersion : manifest.windowsVersion
        if (!latestVersion || !manifest.downloadsUrl || compareVersions(latestVersion, currentVersion) <= 0) return
        const reminderKey = `stockroom-update-reminder:${nativeAndroid ? 'android' : 'windows'}:${latestVersion}`
        const lastReminder = Number(localStorage.getItem(reminderKey) || 0)
        if (Date.now() - lastReminder < 24 * 60 * 60 * 1000) return
        if (active) setUpdate({ version: latestVersion, downloadsUrl: manifest.downloadsUrl, platform })
      } catch { /* Updates are optional; remain usable if offline or unavailable. */ }
    }

    void check()
    const timer = window.setInterval(() => { void check() }, 6 * 60 * 60 * 1000)
    const checkWhenVisible = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', checkWhenVisible)
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', checkWhenVisible) }
  }, [])

  if (!update) return null
  const dismiss = () => {
    localStorage.setItem(`stockroom-update-reminder:${update.platform.toLowerCase()}:${update.version}`, String(Date.now()))
    setUpdate(null)
  }
  return <div className="modal-backdrop"><section className="modal" role="alertdialog" aria-modal="true" aria-labelledby="app-update-title"><div className="modal-head"><div><h2 id="app-update-title">Stockroom update available</h2><p>Version {update.version} is ready for {update.platform}. Update when convenient to get the latest improvements.</p></div></div><div className="report-actions"><a className="primary-button" href={update.downloadsUrl} target="_blank" rel="noreferrer" onClick={dismiss}>Open downloads</a><button type="button" className="filter-button" onClick={dismiss}>Remind me tomorrow</button></div></section></div>
}
