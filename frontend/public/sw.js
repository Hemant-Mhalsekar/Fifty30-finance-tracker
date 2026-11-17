// Fifty30 service worker. Hand-written and deliberately small:
// - Never touches /api: money data and login responses are never stored on the device.
// - Hashed build files (/assets/*) never change, so they are served from the cache once seen.
// - Pages are fetched from the network first and fall back to the cached app shell when offline.
// The build ID in the registration URL (sw.js?v=...) changes on every deploy, which installs a
// new worker and lets it delete the previous deploy's cache.

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const CACHE = `fifty30-${VERSION}`
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/apple-touch-icon.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('fifty30-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // The API always goes to the network, untouched.
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    // Every page is the same single-page app: try the network, else the cached shell.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put('/', copy))
          }
          return response
        })
        .catch(() => caches.match('/').then((cached) => cached || Response.error())),
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
  }
})
