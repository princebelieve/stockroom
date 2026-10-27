import { Download, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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

function suggestionWasDismissed() {
  try { return sessionStorage.getItem('stockroom-install-prompt-dismissed-v2') === 'true' }
  catch { return false }
}

export function InstallAppControl({ showButton = true }: { showButton?: boolean }) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(() => currentInstallPrompt())
  const [installed, setInstalled] = useState(alreadyInstalled)
  const [showInstructions, setShowInstructions] = useState(false)
  const [suggestion, setSuggestion] = useState(false)
  const ios = isIosDevice()
  const safari = isSafariOnIos()
  const android = /android/i.test(navigator.userAgent)
  const desktop = !ios && !android

  useEffect(() => {
    const unsubscribe = subscribeToInstallPrompt(event => {
      setPromptEvent(event)
      if (event && !suggestionWasDismissed()) { setSuggestion(true); setShowInstructions(false) }
    })
    const onInstalled = () => { setInstalled(true); setPromptEvent(null); setShowInstructions(false); setSuggestion(false) }
    window.addEventListener('appinstalled', onInstalled)
    const timer = window.setTimeout(() => {
      if (!alreadyInstalled() && !suggestionWasDismissed()) setSuggestion(true)
    }, 450)
    return () => { unsubscribe(); window.clearTimeout(timer); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  const dismissSuggestion = () => {
    setSuggestion(false)
    try { sessionStorage.setItem('stockroom-install-prompt-dismissed-v2', 'true') } catch { /* Dismiss for this render if storage is unavailable. */ }
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
        setShowInstructions(true)
      }
      return
    }
    setSuggestion(false)
    setShowInstructions(true)
  }

  // The native Android and Windows apps are already installed applications.
  if (installed || isNativeMobile() || Boolean(window.stockroomDesktop)) return null

  return <>
    {suggestion && createPortal(<section className={`install-app-suggestion install-app-prompt${showInstructions ? ' showing-instructions' : ''}`} aria-label="Install Stockroom">
      <button className="install-suggestion-close" type="button" aria-label="Dismiss install suggestion" onClick={dismissSuggestion}><X size={15}/></button>
      <strong>{ios ? 'Add Stockroom to your Home Screen' : 'Install Stockroom'}</strong>
      {showInstructions
        ? ios ? safari
          ? <p>In Safari, tap <b>Share</b> (the square with the up arrow), choose <b>Add to Home Screen</b>, then tap <b>Add</b>.</p>
          : <p>On iPhone and iPad, open <b>stockroom.globalcreest.com</b> in Safari, tap <b>Share</b>, choose <b>Add to Home Screen</b>, then tap <b>Add</b>.</p>
          : android
            ? <p>Your browser has not offered its install prompt yet. In Android Chrome, open <b>stockroom.globalcreest.com</b>, tap <b>⋮</b>, then <b>Install app</b> or <b>Add to Home screen</b>.</p>
            : <p>Use your browser’s <b>Install</b> option to add Stockroom as an app.</p>
        : <p>{ios ? 'Add the app to your iPhone or iPad Home Screen for quick access.' : desktop ? 'Install Stockroom for quick access in its own app window.' : 'Install the app on this device for quick access.'}</p>}
      {!showInstructions && <button className="install-suggestion-action" type="button" onClick={() => void install()}>{ios ? 'Add to Home Screen' : 'Install app'}</button>}
    </section>, document.body)}
    {showButton && <div className="install-app-control"><button type="button" className="nav-item install-app-button" onClick={() => void install()}>
      <Download size={18}/>{ios ? 'Add to Home Screen' : 'Install app'}
    </button></div>}
  </>
}
