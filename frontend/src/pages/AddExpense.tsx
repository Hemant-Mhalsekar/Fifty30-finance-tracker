import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  ApiError,
  createExpense,
  deleteExpense,
  getCurrentReport,
  listCategories,
  listExpenses,
  type Category,
  type Expense,
  type NewExpense,
} from '../api'
import { crossedLevel, crossedText } from '../budgetAlerts'
import { orderByRecentUse } from '../categoryOrder'
import ExpenseForm from '../components/ExpenseForm'
import PendingList from '../components/PendingList'
import QuickRepeats, { type Logged } from '../components/QuickRepeats'
import { todayIst } from '../dates'
import {
  addPending,
  isRetryable,
  newClientId,
  rememberCategories,
  rememberedCategories,
  removePending,
} from '../offline'
import { quickRepeats, repeatExpense, type QuickRepeat } from '../quickRepeats'
import { ArrowLeftIcon, CloudOffIcon } from '../components/icons'
import { useOnline } from '../useOffline'
import { formatPaise } from '../money'

// How many recent expenses decide the chip order. Enough to cover a few days of logging.
const RECENT_SAMPLE = 50

const OFFLINE_SAVED = 'Saved on this phone. It will be sent when you are back online.'

export default function AddExpense({ userId }: { userId: string }) {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [repeats, setRepeats] = useState<QuickRepeat[]>([])
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
        setRepeats(quickRepeats(latest?.items ?? [], all))
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
  // connection (or a server that is down), it waits on the phone instead. The undo removes
  // whichever of the two happened.
  async function send(expense: NewExpense, category: Category): Promise<Logged> {
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
      return { message: OFFLINE_SAVED, undo: async () => removePending(clientId) }
    }
    if (!navigator.onLine) return keep()
    try {
      const saved = await createExpense({ ...expense, clientId })
      const alert = await budgetNote(saved)
      return {
        message: `Saved ${formatPaise(saved.amountPaise)} in ${category.name}.${alert ? ` ${alert}` : ''}`,
        undo: () => deleteExpense(saved.id),
      }
    } catch (e) {
      // 401 means the session ended; the app is already showing the login form.
      if (e instanceof ApiError && isRetryable(e.status) && e.status !== 401) return keep()
      throw e
    }
  }

  // One extra request after saving (the save cleared the cached report, so it is fresh; the
  // dashboard then opens from this answer). Any failure just leaves the note out.
  async function budgetNote(saved: Expense): Promise<string | null> {
    if (saved.type === 'INVESTMENT') return null
    const report = await getCurrentReport().catch(() => null)
    if (!report) return null
    const { periodStart, periodEnd } = report.cycle
    if (saved.expenseDate < periodStart || saved.expenseDate > periodEnd) return null
    const line = saved.type === 'NEED' ? report.needs : report.wants
    const level = crossedLevel(line.spentPaise, saved.amountPaise, line.allocatedPaise)
    return level ? crossedText(saved.type, level, line.spentPaise, line.allocatedPaise) : null
  }

  const save = (expense: NewExpense, category: Category) => send(expense, category).then((r) => r.message)
  const logAgain = (r: QuickRepeat) => send(repeatExpense(r, todayIst()), r.category)

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
      {categories && <QuickRepeats repeats={repeats} onLog={logAgain} />}
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
