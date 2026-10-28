import { Download, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isNativeMobile } from './lib/mobileDatabase'
import { currentInstallPrompt, promptToInstall, subscribeToInstallPrompt, type InstallPromptEvent } from './lib/pwaInstall'

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isSafariOnIos() {
  return isIosDevice() && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|opios/i.test(navigator.userAgent)
}

function isSafariOnMac() {
  return /macintosh/i.test(navigator.userAgent) && /safari/i.test(navigator.userAgent) && !/chrome|crios|edg|opr/i.test(navigator.userAgent)
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
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const ios = isIosDevice()
  const safari = isSafariOnIos()
  const android = /android/i.test(navigator.userAgent)
  const desktop = !ios && !android
  const desktopSafari = desktop && isSafariOnMac()

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

  useEffect(() => {
    if (!showInstructions) return
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setShowInstructions(false); return }
      if (event.key !== 'Tab') return
      const buttons = document.querySelectorAll<HTMLButtonElement>('.install-modal button:not([disabled])')
      const first = buttons.item(0)
      const last = buttons.item(buttons.length - 1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      returnFocusRef.current?.focus()
    }
  }, [showInstructions])

  const dismissSuggestion = () => {
    setSuggestion(false)
    setShowInstructions(false)
    try { sessionStorage.setItem('stockroom-install-prompt-dismissed-v2', 'true') } catch { /* Dismiss for this render if storage is unavailable. */ }
  }
  const showManualInstructions = () => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setShowInstructions(true)
    setSuggestion(false)
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
        showManualInstructions()
      }
      return
    }
    showManualInstructions()
  }

  // The native Android and Windows apps are already installed applications.
  if (installed || isNativeMobile() || Boolean(window.stockroomDesktop)) return null

  const steps = ios
    ? safari
      ? [<>In Safari, tap <strong>Share</strong> <span className="ios-share-symbol" aria-label="Share">&#8593;</span>.</>, <>Scroll down and choose <strong>Add to Home Screen</strong>.</>, <>Tap <strong>Add</strong> to finish.</>]
      : [<>Open <strong>stockroom.globalcreest.com</strong> in Safari.</>, <>Tap <strong>Share</strong> <span className="ios-share-symbol" aria-label="Share">&#8593;</span>, then choose <strong>Add to Home Screen</strong>.</>, <>Tap <strong>Add</strong> to finish.</>]
    : android
      ? [<>Open <strong>stockroom.globalcreest.com</strong> in Chrome.</>, <>Tap the <strong>three-dot menu</strong>, then choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</>, <>Confirm by tapping <strong>Install</strong> or <strong>Add</strong>.</>]
      : desktopSafari
        ? [<>In Safari, open the <strong>File</strong> menu.</>, <>Choose <strong>Add to Dock</strong>.</>, <>Confirm the prompt to add Stockroom to your Dock.</>]
        : [<>Open Stockroom in <strong>Chrome</strong> or <strong>Microsoft Edge</strong>.</>, <>Select the install icon in the address bar, or open the browser menu and choose <strong>Install Stockroom</strong>.</>, <>Confirm by selecting <strong>Install</strong>.</>]

  return <>
    {suggestion && !showInstructions && createPortal(<aside className="install-app-suggestion install-app-prompt" aria-label="Install Stockroom suggestion">
      <button className="install-suggestion-close" type="button" aria-label="Dismiss install suggestion" onClick={dismissSuggestion}><X size={15}/></button>
      <strong>{ios ? 'Add Stockroom to your Home Screen' : 'Install Stockroom'}</strong>
      <p>{ios ? 'Add the app to your iPhone or iPad Home Screen for quick access.' : desktop ? 'Install Stockroom for quick access in its own app window.' : 'Install the app on this device for quick access.'}</p>
      <button className="install-suggestion-action" type="button" onClick={() => void install()}>{ios ? 'Add to Home Screen' : 'Install Stockroom'}</button>
    </aside>, document.body)}
    {showInstructions && createPortal(<div className="install-modal-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) setShowInstructions(false)
    }}>
      <section className="install-modal" role="dialog" aria-modal="true" aria-labelledby="install-modal-title">
        <button ref={closeButtonRef} className="install-modal-close" type="button" aria-label="Close install instructions" onClick={() => setShowInstructions(false)}><X size={20}/></button>
        <p className="kicker">STOCKROOM BUSINESS</p>
        <h2 id="install-modal-title">{ios ? 'Add Stockroom to your Home Screen' : 'Install Stockroom'}</h2>
        <p className="install-modal-intro">{ios ? 'Follow these steps in Safari:' : android ? 'If the install prompt did not appear, use Chrome:' : desktopSafari ? 'Add Stockroom from Safari:' : 'If the install prompt did not appear, use Chrome or Edge:'}</p>
        <ol>{steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
        <button className="primary-button install-modal-done" type="button" onClick={() => setShowInstructions(false)}>Got it</button>
      </section>
    </div>, document.body)}
    {showButton && <div className="install-app-control"><button type="button" className="nav-item install-app-button" onClick={() => void install()}>
      <Download size={18}/>{ios ? 'Add to Home Screen' : 'Install Stockroom'}
    </button></div>}
  </>
}
