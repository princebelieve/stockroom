import { Download, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { isNativeMobile } from './lib/mobileDatabase'
import { currentInstallPrompt, promptToInstall, subscribeToInstallPrompt, type InstallPromptEvent } from './lib/pwaInstall'

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isSafariOnIos() {
  return isIosDevice() && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|opios/i.test(navigator.userAgent)
}

function alreadyInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
}

export function InstallAppControl() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(() => currentInstallPrompt())
  const [installed, setInstalled] = useState(alreadyInstalled)
  const [open, setOpen] = useState(false)
  const [suggestion, setSuggestion] = useState(false)
  const ios = isIosDevice()
  const safari = isSafariOnIos()

  useEffect(() => {
    const unsubscribe = subscribeToInstallPrompt(event => {
      setPromptEvent(event)
      if (event && !sessionStorage.getItem('stockroom-install-suggestion-dismissed')) setSuggestion(true)
    })
    const onInstalled = () => { setInstalled(true); setPromptEvent(null); setOpen(false); setSuggestion(false) }
    window.addEventListener('appinstalled', onInstalled)
    const timer = window.setTimeout(() => {
      if (!alreadyInstalled() && !sessionStorage.getItem('stockroom-install-suggestion-dismissed')) setSuggestion(true)
    }, 1800)
    return () => { unsubscribe(); window.clearTimeout(timer); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  const dismissSuggestion = () => {
    setSuggestion(false)
    sessionStorage.setItem('stockroom-install-suggestion-dismissed', 'true')
  }
  const install = async () => {
    if (installed) return
    if (!ios && promptEvent) {
      try {
        const accepted = await promptToInstall(promptEvent)
        setPromptEvent(null)
        setSuggestion(false)
        if (accepted) setInstalled(true)
      } catch {
        setPromptEvent(null)
        setOpen(true)
      }
      return
    }
    setSuggestion(false)
    setOpen(value => !value)
  }

  // The native Android and Windows apps are already installed applications.
  if (installed || isNativeMobile() || Boolean(window.stockroomDesktop)) return null

  return <div className="install-app-control">
    {suggestion && <section className="install-app-suggestion" aria-label="Install Stockroom">
      <button className="install-suggestion-close" type="button" aria-label="Dismiss install suggestion" onClick={dismissSuggestion}><X size={15}/></button>
      <strong>Install Stockroom</strong>
      <p>{ios ? 'Add Stockroom to your iPhone or iPad Home Screen for quick access.' : 'Install Stockroom on this device for quick access.'}</p>
      <button className="install-suggestion-action" type="button" onClick={() => void install()}>{ios ? 'Show Safari steps' : 'Install app'}</button>
    </section>}
    {open && <section className="install-app-details" role="status" aria-live="polite">
      <strong>{ios ? 'Add Stockroom to your Home Screen' : 'Install Stockroom'}</strong>
      {ios ? safari
        ? <p>In Safari, tap <b>Share</b> (the square with the up arrow), choose <b>Add to Home Screen</b>, then tap <b>Add</b>. If it is not listed, scroll the Share sheet or check <b>Edit Actions</b>.</p>
        : <p>Home Screen installation on iPhone and iPad is available through Safari. Open <b>stockroom.globalcreest.com</b> in Safari, tap <b>Share</b>, choose <b>Add to Home Screen</b>, then tap <b>Add</b>.</p>
        : promptEvent
          ? <p>Tap Install app to open your browser’s installation prompt.</p>
          : <p>This browser has not provided an install prompt. On Android, open <b>stockroom.globalcreest.com</b> in Chrome, tap <b>⋮</b>, then choose <b>Install app</b> or <b>Add to Home screen</b>.</p>}
      <button type="button" className="install-details-close" onClick={() => setOpen(false)}>Got it</button>
    </section>}
    <button type="button" className="nav-item install-app-button" onClick={() => void install()} aria-expanded={open}>
      <Download size={18}/>{ios ? 'Add to Home Screen' : 'Install app'}
    </button>
  </div>
}
