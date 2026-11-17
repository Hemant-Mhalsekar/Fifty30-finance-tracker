// The only file that imports the Sentry SDK. monitoring.ts loads it on demand, and naming just
// these three functions lets the bundler leave the rest of the SDK (replay, tracing) out.
export { captureException, init, setUser } from '@sentry/react'
