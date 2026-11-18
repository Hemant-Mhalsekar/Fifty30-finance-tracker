import { useState } from 'react'
import { Link } from 'react-router'
import { confirmRecurring, skipRecurring, type Category, type RecurringExpense } from '../api'
import { shortDate, typeClass } from '../display'
import { todayIst } from '../dates'
import { TYPE_LABELS } from '../labels'
import { formatPaiseShort } from '../money'
import { CategoryIcon } from './icons'

// Due ones first, then the next few coming up.
const SHOWN = 4

type Props = {
  items: RecurringExpense[]
  categories: Category[]
  onUpdated: (recurring: RecurringExpense) => void
  onExpenseAdded: () => void
}

/**
 * The dashboard's recurring card. A due payment is added with its usual amount in one tap (the
 * Recurring page lets you change the amount first); upcoming ones are listed for information.
 */
export default function UpcomingRecurring({ items, categories, onUpdated, onExpenseAdded }: Props) {
  const active = items
    .filter((r) => !r.paused)
    .sort((a, b) => Number(b.due) - Number(a.due) || a.nextDueDate.localeCompare(b.nextDueDate))
    .slice(0, SHOWN)

  return (
    <article className="card" aria-labelledby="upcoming-title">
      <div className="card-head">
        <div>
          <h2 id="upcoming-title">Upcoming recurring payments</h2>
          <p>Confirm or skip each due payment</p>
        </div>
        <Link to="/recurring">Manage</Link>
      </div>
      {active.length === 0 ? (
        <p className="empty">
          Rent, SIPs and subscriptions can remind you when they are due. <Link to="/recurring">Set one up</Link>
        </p>
      ) : (
        <ul className="tx-list">
          {active.map((r) => (
            <UpcomingRow
              key={`${r.id}-${r.nextDueDate}`}
              item={r}
              category={categories.find((c) => c.id === r.categoryId)}
              onUpdated={onUpdated}
              onExpenseAdded={onExpenseAdded}
            />
          ))}
        </ul>
      )}
    </article>
  )
}

function UpcomingRow({
  item,
  category,
  onUpdated,
  onExpenseAdded,
}: {
  item: RecurringExpense
  category: Category | undefined
  onUpdated: (recurring: RecurringExpense) => void
  onExpenseAdded: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const type = item.type ?? category?.type ?? null
  const overdue = item.due && item.nextDueDate < todayIst()

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <li className="upcoming-row">
      <span className={`badge-icon ${typeClass(type)}`}>
        <CategoryIcon name={category?.name ?? item.description} type={type} />
      </span>
      <span className="tx-main">
        <span className="tx-title">{item.description}</span>
        <span className="tx-meta">
          {item.due
            ? overdue
              ? `Was due ${shortDate(item.nextDueDate)}`
              : 'Due today'
            : `Due ${shortDate(item.nextDueDate)}`}
          {type && ` • ${TYPE_LABELS[type]}s`} • {formatPaiseShort(item.amountPaise)}
        </span>
      </span>
      {item.due && (
        <span className="row-actions">
          <button
            type="button"
            disabled={busy}
            aria-label={`Confirm ${item.description}`}
            onClick={() =>
              run(async () => {
                const { recurring } = await confirmRecurring(item.id, item.nextDueDate, item.amountPaise)
                onExpenseAdded()
                onUpdated(recurring)
              })
            }
          >
            Confirm
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            aria-label={`Skip ${item.description} this month`}
            onClick={() => run(async () => onUpdated(await skipRecurring(item.id, item.nextDueDate)))}
          >
            Skip
          </button>
        </span>
      )}
      {error && (
        <p className="error row-error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}
