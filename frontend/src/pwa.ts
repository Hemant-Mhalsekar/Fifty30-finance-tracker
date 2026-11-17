// Install support. Chrome on Android (and desktop) fires `beforeinstallprompt` once, early, often
// before the More page exists, so it is captured here at startup and kept for the Install button.

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep Chrome's mini-infobar from appearing; the app offers its own button under More.
    event.preventDefault()
    deferredPrompt = event as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

export function onInstallStateChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function canPromptInstall(): boolean {
  return deferredPrompt !== null
}

/** Shows the browser's install dialog. Resolves true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false
  const prompt = deferredPrompt
  deferredPrompt = null
  await prompt.prompt()
  const choice = await prompt.userChoice
  notify()
  return choice.outcome === 'accepted'
}

export function isRunningInstalled(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iPhone and iPad have no install prompt; people add the app from the Share menu. */
export function isAppleMobile(): boolean {
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac, so also check for touch.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}
