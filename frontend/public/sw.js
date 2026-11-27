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
      .then((names) =>
        Promise.all(names.filter((n) => n.startsWith('fifty30-') && n !== CACHE).map((n) => caches.delete(n))),
      )
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

// Push notifications. The server sends {title, body, url, tag}, encrypted for this browser; the
// browser decrypts it before this runs. A notification is always shown (browsers require it).
self.addEventListener('push', (event) => {
  let message = {}
  try {
    message = event.data ? event.data.json() : {}
  } catch {
    message = {}
  }
  const title = typeof message.title === 'string' && message.title ? message.title : 'Fifty30'
  // Only paths inside the app are followed, whatever the message says.
  const url =
    typeof message.url === 'string' && message.url.startsWith('/') && !message.url.startsWith('//') ? message.url : '/'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof message.body === 'string' ? message.body : '',
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      // Same tag replaces the earlier one instead of stacking ("Rent is due" shown once).
      tag: typeof message.tag === 'string' ? message.tag : undefined,
      data: { url },
    }),
  )
})

// Tapping a notification opens its page: in a Fifty30 window that is already open, else a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (open) return open.focus().then((w) => (w ? w.navigate(target) : self.clients.openWindow(target)))
      return self.clients.openWindow(target)
    }),
  )
})
