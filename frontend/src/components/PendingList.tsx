import { formatDate } from '../dates'
import { formatPaise } from '../money'
import { removePending, setPendingError } from '../offline'
import { syncPending } from '../sync'
import { usePending } from '../useOffline'

// Expenses saved on this phone and not sent yet. Ones the server refused (for example because the
// category was archived meanwhile) wait here for the user to retry or discard.
export default function PendingList({ userId }: { userId: string }) {
  const items = usePending(userId)
  if (items.length === 0) return null

  return (
    <article className="card pending-card" aria-labelledby="pending-title">
      <h2 id="pending-title">Waiting to be sent ({items.length})</h2>
      <p className="hint">Saved on this phone. They are sent by themselves when you are online.</p>
      <ul className="pending-list">
        {items.map((item) => (
          <li key={item.clientId}>
            <div className="pending-line">
              <span className="expense-main">
                <span className="expense-description">{item.expense.description}</span>
                <span className="expense-meta">
                  {item.categoryName} · {formatDate(item.expense.expenseDate)}
                </span>
              </span>
              <span className="expense-amount">{formatPaise(item.expense.amountPaise)}</span>
            </div>
            {item.error && (
              <div className="pending-problem">
                <p className="error" role="alert">
                  Not sent: {item.error}
                </p>
                <div className="row-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setPendingError(item.clientId, undefined)
                      if (navigator.onLine) syncPending(userId).catch(() => {})
                    }}
                  >
                    Try again
                  </button>
                  <button type="button" className="danger-outline" onClick={() => removePending(item.clientId)}>
                    Discard
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </article>
  )
}
