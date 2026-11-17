import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import {
  ApiError,
  createExpense,
  listCategories,
  listExpenses,
  type Category,
  type Expense,
  type NewExpense,
} from '../api'
import { orderByRecentUse } from '../categoryOrder'
import ExpenseForm from '../components/ExpenseForm'
import PendingList from '../components/PendingList'
import { addPending, isRetryable, newClientId, rememberCategories, rememberedCategories } from '../offline'
import { formatDate } from '../dates'
import { TYPE_COLORS } from '../labels'
import { formatPaise } from '../money'

// How many recent expenses decide the chip order. Enough to cover a few days of logging.
const RECENT_SAMPLE = 50
// Shown beside the form on wide screens, so a double entry is easy to spot.
const RECENT_SHOWN = 8

const OFFLINE_SAVED = 'Saved on this phone. It will be sent when you are back online.'

export default function AddExpense({ userId }: { userId: string }) {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [recent, setRecent] = useState<Expense[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // Recent use is only a nicety: if that request fails, fall back to alphabetical order.
    Promise.all([listCategories(), listExpenses({ size: RECENT_SAMPLE }).catch(() => null)])
      .then(([all, latest]) => {
        if (cancelled) return
        // Kept on the phone so expenses can be added without a connection next time.
        rememberCategories(userId, all)
        setCategories(orderByRecentUse(all, latest?.items.map((e) => e.categoryId) ?? []))
        setRecent(latest?.items ?? null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        // No connection: use the categories saved on this phone, if there are any.
        const remembered = e instanceof ApiError && isRetryable(e.status) ? rememberedCategories(userId) : null
        if (remembered) setCategories(orderByRecentUse(remembered, []))
        else
          setLoadError(
            e instanceof ApiError && e.status === 0
              ? 'You are offline, and your categories are not saved on this phone yet. Open Add expense once while online.'
              : e instanceof Error
                ? e.message
                : 'Something went wrong',
          )
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // Sends the expense with a fresh clientId, so a retry can never store it twice. With no
  // connection (or a server that is down), it waits on the phone instead.
  async function save(expense: NewExpense, category: Category): Promise<string> {
    const clientId = newClientId()
    const keep = () => {
      const kept = addPending({
        clientId,
        userId,
        expense,
        categoryName: category.name,
        savedAt: new Date().toISOString(),
      })
      if (!kept) throw new Error('No connection, and this phone could not store the expense. Try again when online.')
      return OFFLINE_SAVED
    }
    if (!navigator.onLine) return keep()
    try {
      const saved = await createExpense({ ...expense, clientId })
      setRecent((items) => (items ? [saved, ...items] : items))
      return `Saved ${formatPaise(saved.amountPaise)} in ${category.name}.`
    } catch (e) {
      // 401 means the session ended; the app is already showing the login form.
      if (e instanceof ApiError && isRetryable(e.status) && e.status !== 401) return keep()
      throw e
    }
  }

  return (
    <section className="add-expense">
      <div className="page-header">
        <h1>Add expense</h1>
      </div>
      {loadError && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}
      {!loadError && !categories && <p className="muted">Loading categories…</p>}
      {categories && (
        <div className="split">
          <div className="split-main">
            <ExpenseForm
              categories={categories}
              submitLabel="Save expense"
              resetAfterSubmit
              autoFocus
              stickyActions
              onSubmit={save}
            />
            <PendingList userId={userId} />
          </div>
          {recent && (
            <aside className="split-side desk-only" aria-labelledby="recent-title">
              <RecentExpenses items={recent.slice(0, RECENT_SHOWN)} categories={categories} />
            </aside>
          )}
        </div>
      )}
    </section>
  )
}

function RecentExpenses({ items, categories }: { items: Expense[]; categories: Category[] }) {
  const name = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Archived category'
  return (
    <article className="card">
      <div className="chart-head">
        <h2 id="recent-title">Latest expenses</h2>
        <Link to="/expenses">See all</Link>
      </div>
      {items.length === 0 ? (
        <p className="muted">Nothing logged yet.</p>
      ) : (
        <ul className="recent-list">
          {items.map((e) => (
            <li key={e.id}>
              <span className="expense-main">
                <span className="expense-description">{e.description}</span>
                <span className="expense-meta">
                  <span className="dot" style={{ '--c': TYPE_COLORS[e.type] } as CSSProperties} />
                  {name(e.categoryId)} · {formatDate(e.expenseDate)}
                </span>
              </span>
              <span className="expense-amount">{formatPaise(e.amountPaise)}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
