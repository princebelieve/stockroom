export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: InstallPromptEvent | null = null
const subscribers = new Set<(event: InstallPromptEvent | null) => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    deferredPrompt = event as InstallPromptEvent
    subscribers.forEach(subscriber => subscriber(deferredPrompt))
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    subscribers.forEach(subscriber => subscriber(null))
  })
}

export function currentInstallPrompt() {
  return deferredPrompt
}

export function subscribeToInstallPrompt(subscriber: (event: InstallPromptEvent | null) => void) {
  subscribers.add(subscriber)
  subscriber(deferredPrompt)
  return () => subscribers.delete(subscriber)
}

export async function promptToInstall(event: InstallPromptEvent) {
  if (deferredPrompt !== event) return false
  deferredPrompt = null
  subscribers.forEach(subscriber => subscriber(null))
  await event.prompt()
  return (await event.userChoice).outcome === 'accepted'
}
