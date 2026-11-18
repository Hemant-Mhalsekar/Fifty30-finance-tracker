import { ApiError, createExpense } from './api'
import { isRetryable, sendPending } from './offline'

let running: Promise<number> | null = null

/** Sends the user's waiting expenses. One run at a time; returns how many were sent. */
export function syncPending(userId: string): Promise<number> {
  if (!running) {
    running = sendPending(userId, async (item) => {
      try {
        await createExpense({ ...item.expense, clientId: item.clientId })
        return 'sent'
      } catch (e) {
        const status = e instanceof ApiError ? e.status : 0
        if (isRetryable(status)) return 'retry-later'
        return { refused: e instanceof Error ? e.message : 'Something went wrong' }
      }
    })
      .then((result) => result.sent)
      .finally(() => {
        running = null
      })
  }
  return running
}
