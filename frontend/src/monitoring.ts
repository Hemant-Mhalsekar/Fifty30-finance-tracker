// Error monitoring with Sentry, only in production builds and only when VITE_SENTRY_DSN is set
// (a Vercel environment variable). The SDK is loaded on demand, so without a DSN it adds nothing
// to the app. Nothing personal is sent: no IP address, cookies, request bodies or form values,
// and reset-password tokens are cut out of every URL.

type SentryModule = typeof import('./sentryClient')

let sentry: SentryModule | null = null
// Errors that happen before the SDK has loaded, sent once it is ready.
const early: unknown[] = []

/** Removes secrets that can appear in URLs (the reset link's ?token=). */
export function scrubUrl(url: string): string {
  return url.replace(/([?&#]token=)[^&#]*/gi, '$1[removed]')
}

export function initMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!import.meta.env.PROD || !dsn) return
  import('./sentryClient')
    .then((module) => {
      module.init({
        dsn,
        release: __BUILD_ID__,
        environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? 'production',
        // Nothing about the person or their requests beyond what the error itself needs.
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
        },
        // Errors only: no performance tracing or session replay.
        tracesSampleRate: 0,
        beforeSend(event) {
          if (event.request) {
            delete event.request.cookies
            delete event.request.data
            if (event.request.url) event.request.url = scrubUrl(event.request.url)
          }
          if (event.user) event.user = { id: event.user.id }
          return event
        },
        beforeBreadcrumb(breadcrumb) {
          const url = breadcrumb.data?.url
          if (typeof url === 'string') breadcrumb.data = { ...breadcrumb.data, url: scrubUrl(url) }
          if (typeof breadcrumb.data?.to === 'string') breadcrumb.data.to = scrubUrl(breadcrumb.data.to)
          if (typeof breadcrumb.data?.from === 'string') breadcrumb.data.from = scrubUrl(breadcrumb.data.from)
          return breadcrumb
        },
      })
      sentry = module
      early.splice(0).forEach((error) => module.captureException(error))
    })
    .catch(() => {
      // Monitoring must never break the app.
    })
}

/** Reports an error the app caught itself (for example in the error screen). */
export function reportError(error: unknown): void {
  if (!import.meta.env.PROD || !import.meta.env.VITE_SENTRY_DSN) return
  if (sentry) sentry.captureException(error)
  else if (early.length < 10) early.push(error)
}

/** Tags errors with the signed-in user's id (never the email), or clears it on log out. */
export function setMonitoredUser(id: string | null): void {
  sentry?.setUser(id ? { id } : null)
}
