import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError, createExpense, listCategories, listExpenses, type Category, type NewExpense } from '../api'
import { orderByRecentUse } from '../categoryOrder'
import ExpenseForm from '../components/ExpenseForm'
import PendingList from '../components/PendingList'
import { addPending, isRetryable, newClientId, rememberCategories, rememberedCategories } from '../offline'
import { ArrowLeftIcon, CloudOffIcon } from '../components/icons'
import { useOnline } from '../useOffline'
import { formatPaise } from '../money'

// How many recent expenses decide the chip order. Enough to cover a few days of logging.
const RECENT_SAMPLE = 50

const OFFLINE_SAVED = 'Saved on this phone. It will be sent when you are back online.'

export default function AddExpense({ userId }: { userId: string }) {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const navigate = useNavigate()
  const online = useOnline()
  // Back to where the user came from; opened directly (a shortcut or bookmark), back to the dashboard.
  const goBack = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate('/'))
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
      return `Saved ${formatPaise(saved.amountPaise)} in ${category.name}.`
    } catch (e) {
      // 401 means the session ended; the app is already showing the login form.
      if (e instanceof ApiError && isRetryable(e.status) && e.status !== 401) return keep()
      throw e
    }
  }

  return (
    <section className="add-expense">
      <div className="page-head">
        <div className="back-title">
          <button type="button" className="icon outline" aria-label="Back" onClick={goBack}>
            <ArrowLeftIcon />
          </button>
          <div>
            <h1>Add Expense</h1>
            <p className="sub">Record a transaction in your current pay cycle</p>
          </div>
        </div>
        {!online && (
          <span className="date-pill">
            <CloudOffIcon size={16} /> Offline • Will sync later
          </span>
        )}
      </div>
      {loadError && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}
      {!loadError && !categories && <p className="muted">Loading categories…</p>}
      {categories && (
        <div className="card">
          <ExpenseForm
            categories={categories}
            submitLabel="Save Expense"
            resetAfterSubmit
            autoFocus
            stickyActions
            onSubmit={save}
            onCancel={goBack}
          />
        </div>
      )}
      <PendingList userId={userId} />
    </section>
  )
}
