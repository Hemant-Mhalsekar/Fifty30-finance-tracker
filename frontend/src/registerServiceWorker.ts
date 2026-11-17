// Registers the service worker in production builds only: in development it would cache files
// that Vite is still changing, and the browser tests run against the dev server.
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`/sw.js?v=${__BUILD_ID__}`, { scope: '/' }).catch(() => {
      // Not fatal: the app works the same without it, just without offline start.
    })
  })
}
