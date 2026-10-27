import { Download, X } from 'lucide-react'
import { useEffect, useState } from 'react'

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function InstallAppControl() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  const [open, setOpen] = useState(false)
  const [suggestion, setSuggestion] = useState(false)
  const ios = isIosDevice()

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as InstallPromptEvent)
      if (!sessionStorage.getItem('stockroom-install-suggestion-dismissed')) setSuggestion(true)
    }
    const onInstalled = () => { setInstalled(true); setPromptEvent(null); setOpen(false); setSuggestion(false) }
    if (isIosDevice() && !sessionStorage.getItem('stockroom-install-suggestion-dismissed')) {
      const timer = window.setTimeout(() => setSuggestion(true), 1800)
      window.addEventListener('beforeinstallprompt', onPrompt)
      window.addEventListener('appinstalled', onInstalled)
      return () => { window.clearTimeout(timer); window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  const dismissSuggestion = () => {
    setSuggestion(false)
    sessionStorage.setItem('stockroom-install-suggestion-dismissed', 'true')
  }
  const install = async () => {
    if (installed) return
    if (!ios && promptEvent) {
      const event = promptEvent
      setPromptEvent(null)
      setSuggestion(false)
      await event.prompt()
      const choice = await event.userChoice
      if (choice.outcome === 'accepted') setInstalled(true)
      return
    }
    setSuggestion(false)
    setOpen(value => !value)
  }

  if (installed) return null
  return <div className="install-app-control">
    {suggestion && <section className="install-app-suggestion" aria-label="Install Stockroom">
      <button className="install-suggestion-close" type="button" aria-label="Dismiss install suggestion" onClick={dismissSuggestion}><X size={15}/></button>
      <strong>Install Stockroom</strong>
      <p>{ios ? 'Add the app to your Home Screen for quick access.' : 'Install the app for quick access from your home screen.'}</p>
      <button className="install-suggestion-action" type="button" onClick={() => void install()}>{ios ? 'How to install' : 'Install app'}</button>
    </section>}
    {open && <section className="install-app-details" role="status" aria-live="polite">
      <strong>{ios ? 'Add to your Home Screen' : 'Install Stockroom'}</strong>
      <p>{ios ? <>In Safari, tap <b>Share</b>, scroll down, then tap <b>Add to Home Screen</b>.</> : <>Open your browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>.</>}</p>
      <button type="button" className="install-details-close" onClick={() => setOpen(false)}>Got it</button>
    </section>}
    <button type="button" className="nav-item install-app-button" onClick={() => void install()} aria-expanded={open}>
      <Download size={18}/>{ios ? 'Add to Home Screen' : 'Install app'}
    </button>
  </div>
}
