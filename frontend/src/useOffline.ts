import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { onPendingChange, parsePending, pendingSnapshot, type PendingExpense } from './offline'
import { syncPending } from './sync'

// How often to retry while expenses are waiting and the app thinks it is online (the server may
// be waking up, or the Wi-Fi may have no internet).
const RETRY_EVERY_MS = 60_000

/** navigator.onLine, kept up to date by the online and offline events. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

/** The user's waiting expenses, updated whenever the list changes (in this tab or another). */
export function usePending(userId: string | null): PendingExpense[] {
  const snapshot = useSyncExternalStore(onPendingChange, pendingSnapshot, () => null)
  return useMemo(() => (userId ? parsePending(snapshot, userId) : []), [snapshot, userId])
}

/**
 * Sends waiting expenses when the app opens, when the connection comes back, when the app comes
 * to the front, and every minute while some are still waiting. Returns the waiting list.
 */
export function usePendingSync(userId: string | null, canSend: boolean): PendingExpense[] {
  const items = usePending(userId)
  const waiting = items.some((p) => !p.error)

  useEffect(() => {
    if (!userId || !canSend || !waiting) return
    const run = () => {
      if (navigator.onLine) syncPending(userId).catch(() => {})
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }
    run()
    const timer = window.setInterval(run, RETRY_EVERY_MS)
    window.addEventListener('online', run)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', run)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId, canSend, waiting])

  return items
}
