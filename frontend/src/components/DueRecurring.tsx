import { useState, type FormEvent } from 'react'
import { confirmRecurring, skipRecurring, type RecurringExpense } from '../api'
import { formatDate, todayIst } from '../dates'
import { formatPaise, paiseToInput, parseRupeesToPaise } from '../money'
import { periodWord } from '../recurring'

const MAX_AMOUNT_PAISE = 10_000_000_000

type Props = {
  items: RecurringExpense[]
  // Called with the updated recurring expense after Confirm or Skip (it may still be due for a later month).
  onUpdated: (recurring: RecurringExpense) => void
  // Called after Confirm, so totals on the page can be refreshed.
  onExpenseAdded?: () => void
}

// Recurring expenses waiting for an answer. Nothing is logged until the user taps Add.
export default function DueRecurring({ items, onUpdated, onExpenseAdded }: Props) {
  const due = items.filter((r) => r.due)
  if (due.length === 0) return null
  return (
    <article className="card due-card" aria-labelledby="due-title">
      <h2 id="due-title">Due recurring expenses</h2>
      <ul className="due-list">
        {due.map((r) => (
          // Keyed by the due date too, so the next month starts with a fresh amount and no old error.
          <DueRow key={`${r.id}-${r.nextDueDate}`} item={r} onUpdated={onUpdated} onExpenseAdded={onExpenseAdded} />
        ))}
      </ul>
    </article>
  )
}

function DueRow({
  item,
  onUpdated,
  onExpenseAdded,
}: {
  item: RecurringExpense
  onUpdated: (recurring: RecurringExpense) => void
  onExpenseAdded?: () => void
}) {
  const [amountText, setAmountText] = useState(paiseToInput(item.amountPaise))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const overdue = item.nextDueDate < todayIst()

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(false)
    }
    // On success the row is replaced (new key), so busy is not reset here.
  }

  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const amountPaise = parseRupeesToPaise(amountText)
    if (amountPaise === null || amountPaise < 1 || amountPaise > MAX_AMOUNT_PAISE) {
      setError('Enter an amount between ₹0.01 and ₹10,00,00,000, with at most 2 decimals')
      return
    }
    run(async () => {
      const { recurring } = await confirmRecurring(item.id, item.nextDueDate, amountPaise)
      onExpenseAdded?.()
      onUpdated(recurring)
    })
  }

  return (
    <li className="due-row">
      <form onSubmit={confirm} noValidate>
        <div className="due-summary">
          <span className="expense-description">{item.description}</span>
          <span className="muted">
            {overdue ? 'Was due' : 'Due today'}
            {overdue && ` ${formatDate(item.nextDueDate)}`} · usually {formatPaise(item.amountPaise)}
          </span>
        </div>
        <div className="inline-fields">
          <div className="amount-field compact">
            <span aria-hidden="true">₹</span>
            <input
              aria-label={`Amount for ${item.description}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
            />
          </div>
          <button type="submit" disabled={busy} aria-label={`Add ${item.description}`}>
            Add
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            aria-label={`Skip ${item.description} this ${periodWord(item.frequency)}`}
            onClick={() => run(async () => onUpdated(await skipRecurring(item.id, item.nextDueDate)))}
          >
            Skip
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </li>
  )
}
