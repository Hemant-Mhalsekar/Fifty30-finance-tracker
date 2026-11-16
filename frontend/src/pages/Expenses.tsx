import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import {
  deleteExpense,
  getCurrentCycle,
  listCategories,
  listExpenses,
  updateExpense,
  type Category,
  type Expense,
  type ExpensePage,
} from '../api'
import ExpenseForm from '../components/ExpenseForm'
import { addDays, formatDate, todayIst } from '../dates'
import { TYPE_COLORS, TYPE_LABELS } from '../labels'
import { formatPaise } from '../money'

const PAGE_SIZE = 20

type Query = { from: string; to: string; categoryId: string; page: number }

// On a phone the filters start folded away; on a wide screen there is room to show them.
const WIDE = typeof window !== 'undefined' && window.matchMedia?.('(min-width: 768px)').matches

export default function Expenses() {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [cycleRange, setCycleRange] = useState<{ from: string; to: string } | null>(null)
  const [query, setQuery] = useState<Query | null>(null)
  // Bumped after an edit or delete to reload the same page.
  const [reloadCount, setReloadCount] = useState(0)
  const [result, setResult] = useState<{ key: string; page: ExpensePage } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Defaults: the current cycle, all categories.
  useEffect(() => {
    let cancelled = false
    Promise.all([listCategories(true), getCurrentCycle()])
      .then(([all, cycle]) => {
        if (cancelled) return
        setCategories(all)
        const range = { from: cycle.periodStart, to: todayIst() }
        setCycleRange(range)
        setQuery({ ...range, categoryId: '', page: 0 })
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const requestKey = query ? `${JSON.stringify(query)}#${reloadCount}` : null

  useEffect(() => {
    if (!query || !requestKey) return
    let cancelled = false
    listExpenses({ ...query, size: PAGE_SIZE })
      .then((page) => {
        if (cancelled) return
        setResult({ key: requestKey, page })
        setError(null)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong')
      })
    return () => {
      cancelled = true
    }
  }, [query, requestKey])

  const loading = requestKey !== null && result?.key !== requestKey
  const page = result?.page ?? null
  const categoryById = new Map((categories ?? []).map((c) => [c.id, c]))

  function closeEditor() {
    setEditingId(null)
    setConfirmDelete(false)
  }

  // Any filter change goes back to the first page.
  function updateFilter(changes: Partial<Omit<Query, 'page'>>) {
    setQuery((q) => (q ? { ...q, ...changes, page: 0 } : q))
    closeEditor()
  }

  function goToPage(next: number) {
    setQuery((q) => (q ? { ...q, page: next } : q))
    closeEditor()
  }

  async function handleDelete(expense: Expense) {
    setDeleting(true)
    setError(null)
    try {
      await deleteExpense(expense.id)
      closeEditor()
      // Deleting the last row of a later page would leave an empty page.
      if (page && page.items.length === 1 && page.page > 0) {
        goToPage(page.page - 1)
      } else {
        setReloadCount((n) => n + 1)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setDeleting(false)
    }
  }

  // Editing may keep an archived category in place, but never move into one.
  function editableCategories(expense: Expense): Category[] {
    return (categories ?? [])
      .filter((c) => !c.archived || c.id === expense.categoryId)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  if (!query || !categories || !cycleRange) {
    return (
      <section>
        <h1>Expenses</h1>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </section>
    )
  }

  const showingCurrentCycle =
    query.from === cycleRange.from && query.to === cycleRange.to && query.categoryId === ''
  const filterSummary = [
    showingCurrentCycle ? 'This cycle' : `${formatDate(query.from)} – ${formatDate(query.to)}`,
    query.categoryId ? (categoryById.get(query.categoryId)?.name ?? 'One category') : 'All categories',
  ].join(' · ')

  return (
    <section className="expenses" aria-busy={loading}>
      <div className="page-header">
        <h1>Expenses</h1>
        <Link to="/add" className="button wide-only">
          Add expense
        </Link>
      </div>

      <details className="filters" open={WIDE}>
        <summary>
          Filters <span className="muted">· {filterSummary}</span>
        </summary>
        <div className="filter-grid">
          <div className="field">
            <label htmlFor="filter-from">From</label>
            <input
              id="filter-from"
              type="date"
              min="2000-01-01"
              max={query.to}
              value={query.from}
              onChange={(e) => e.target.value && updateFilter({ from: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="filter-to">To</label>
            <input
              id="filter-to"
              type="date"
              min={query.from}
              max={todayIst()}
              value={query.to}
              onChange={(e) => e.target.value && updateFilter({ to: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="filter-category">Category</label>
            <select
              id="filter-category"
              value={query.categoryId}
              onChange={(e) => updateFilter({ categoryId: e.target.value })}
            >
              <option value="">All categories</option>
              {[...categories]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.archived ? ' (archived)' : ''}
                  </option>
                ))}
            </select>
          </div>
          <button
            type="button"
            className="secondary"
            disabled={showingCurrentCycle}
            onClick={() => updateFilter({ ...cycleRange, categoryId: '' })}
          >
            Reset to this cycle
          </button>
        </div>
      </details>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {page && (
        <>
          <p className="muted" aria-live="polite">
            {page.totalItems} {page.totalItems === 1 ? 'expense' : 'expenses'}
            {loading ? ' · updating…' : ''}
          </p>

          {page.items.length === 0 ? (
            <div className="card stack">
              <p>No expenses match these filters.</p>
              {showingCurrentCycle && <Link to="/add">Add your first expense for this cycle</Link>}
            </div>
          ) : (
            groupByDate(page.items).map(([date, items]) => (
              <section key={date} className="day-group" aria-label={dayLabel(date)}>
                {/* No per-day total: a day can straddle two pages, so it could be wrong. */}
                <h2 className="day-heading">{dayLabel(date)}</h2>
                <ul className="expense-list">
                  {items.map((expense) => {
                    const category = categoryById.get(expense.categoryId)
                    if (editingId === expense.id) {
                      return (
                        <li key={expense.id} className="editing">
                          <h2>Edit expense</h2>
                          <ExpenseForm
                            categories={editableCategories(expense)}
                            initial={expense}
                            submitLabel="Save changes"
                            onSubmit={async (changes) => {
                              await updateExpense(expense.id, changes)
                              closeEditor()
                              setReloadCount((n) => n + 1)
                              return null
                            }}
                            onCancel={closeEditor}
                          >
                            <div className="delete-zone">
                              {confirmDelete ? (
                                <div className="row-actions">
                                  <span>Delete this expense for good?</span>
                                  <button
                                    type="button"
                                    className="danger"
                                    disabled={deleting}
                                    onClick={() => handleDelete(expense)}
                                  >
                                    {deleting ? 'Deleting…' : 'Confirm delete'}
                                  </button>
                                  <button
                                    type="button"
                                    className="secondary"
                                    disabled={deleting}
                                    onClick={() => setConfirmDelete(false)}
                                  >
                                    Keep
                                  </button>
                                </div>
                              ) : (
                                <button type="button" className="danger-outline" onClick={() => setConfirmDelete(true)}>
                                  Delete expense
                                </button>
                              )}
                            </div>
                          </ExpenseForm>
                        </li>
                      )
                    }
                    return (
                      <li key={expense.id}>
                        <button
                          type="button"
                          className="expense-row"
                          aria-label={`Edit ${expense.description}, ${formatPaise(expense.amountPaise)}`}
                          onClick={() => {
                            setEditingId(expense.id)
                            setConfirmDelete(false)
                          }}
                        >
                          <span className="expense-main">
                            <span className="expense-description">{expense.description}</span>
                            <span className="expense-meta">
                              <span className="dot" style={{ '--c': TYPE_COLORS[expense.type] } as CSSProperties} />
                              {category?.name ?? 'Unknown category'} · {TYPE_LABELS[expense.type]}
                            </span>
                          </span>
                          <span className="expense-amount">{formatPaise(expense.amountPaise)}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))
          )}

          {page.totalPages > 1 && (
            <nav className="pager" aria-label="Pages">
              <button
                type="button"
                className="secondary"
                disabled={loading || page.page === 0}
                onClick={() => goToPage(page.page - 1)}
              >
                ← Newer
              </button>
              <span className="muted">
                Page {page.page + 1} of {page.totalPages}
              </span>
              <button
                type="button"
                className="secondary"
                disabled={loading || page.page >= page.totalPages - 1}
                onClick={() => goToPage(page.page + 1)}
              >
                Older →
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  )
}

// Items arrive newest first, so groups come out in date order without sorting.
function groupByDate(items: Expense[]): [string, Expense[]][] {
  const groups = new Map<string, Expense[]>()
  for (const item of items) {
    const group = groups.get(item.expenseDate)
    if (group) group.push(item)
    else groups.set(item.expenseDate, [item])
  }
  return [...groups.entries()]
}

function dayLabel(date: string): string {
  const today = todayIst()
  if (date === today) return 'Today'
  if (date === addDays(today, -1)) return 'Yesterday'
  return formatDate(date)
}
