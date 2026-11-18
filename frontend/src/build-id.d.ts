// Injected by vite.config.ts (define).
declare const __BUILD_ID__: string

interface ImportMetaEnv {
  // Sentry project DSN for error monitoring (public by design; set in Vercel). Unset: no monitoring.
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_SENTRY_ENVIRONMENT?: string
}
