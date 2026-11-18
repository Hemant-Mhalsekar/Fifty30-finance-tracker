import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  deleteExpense,
  exportExpensesCsv,
  getCurrentCycle,
  listCategories,
  listExpenses,
  updateExpense,
  type BudgetType,
  type Category,
  type Expense,
  type ExpensePage,
} from '../api'
import ExpenseForm from '../components/ExpenseForm'
import ExpenseRow from '../components/ExpenseRow'
import { CalendarIcon, DownloadIcon, PencilIcon, SearchIcon, TrashIcon } from '../components/icons'
import { formatRange, todayIst } from '../dates'
import { dayLabel } from '../display'
import { formatPaiseShort } from '../money'

const PAGE_SIZE = 20
// Typing pauses this long before the list reloads, so each key press is not a request.
const SEARCH_DELAY_MS = 300

type Query = { from: string; to: string; categoryId: string; type: BudgetType | ''; q: string; page: number }

const TYPE_FILTERS: { value: BudgetType | ''; label: string; className: string }[] = [
  { value: '', label: 'All', className: '' },
  { value: 'NEED', label: 'Needs', className: 'need' },
  { value: 'WANT', label: 'Wants', className: 'want' },
  { value: 'INVESTMENT', label: 'Investments', className: 'investment' },
]

export default function Expenses() {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [cycleRange, setCycleRange] = useState<{ from: string; to: string } | null>(null)
  const [cycleEnd, setCycleEnd] = useState<string | null>(null)
  const [query, setQuery] = useState<Query | null>(null)
  // What is typed in the search box; copied into the query after a short pause.
  const [searchText, setSearchText] = useState('')
  // Bumped after an edit or delete to reload the same page.
  const [reloadCount, setReloadCount] = useState(0)
  const [result, setResult] = useState<{ key: string; page: ExpensePage } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const rangeRef = useRef<HTMLDetailsElement>(null)

  // Defaults: the current cycle, everything in it.
  useEffect(() => {
    let cancelled = false
    Promise.all([listCategories(true), getCurrentCycle()])
      .then(([all, cycle]) => {
        if (cancelled) return
        setCategories(all)
        const range = { from: cycle.periodStart, to: todayIst() }
        setCycleRange(range)
        setCycleEnd(cycle.periodEnd)
        setQuery({ ...range, categoryId: '', type: '', q: '', page: 0 })
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery((q) => (q && q.q !== searchText.trim() ? { ...q, q: searchText.trim(), page: 0 } : q))
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [searchText])

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

  function closeRow() {
    setEditingId(null)
    setDeletingId(null)
  }

  // Any filter change goes back to the first page.
  function updateFilter(changes: Partial<Omit<Query, 'page'>>) {
    setQuery((q) => (q ? { ...q, ...changes, page: 0 } : q))
    closeRow()
  }

  function goToPage(next: number) {
    setQuery((q) => (q ? { ...q, page: next } : q))
    closeRow()
  }

  async function handleDownload() {
    if (!query) return
    setDownloading(true)
    setError(null)
    try {
      const { filename, blob } = await exportExpensesCsv(query)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.append(link)
      link.click()
      link.remove()
      // Revoked later: some browsers start reading the file only after click() returns.
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setDownloading(false)
    }
  }

  async function handleDelete(expense: Expense) {
    setDeleting(true)
    setError(null)
    try {
      await deleteExpense(expense.id)
      closeRow()
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
        <h1>Your Expenses</h1>
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
    query.from === cycleRange.from &&
    query.to === cycleRange.to &&
    query.categoryId === '' &&
    query.type === '' &&
    query.q === ''
  const rangeIsCycle = query.from === cycleRange.from && query.to === cycleRange.to
  const rangeLabel = rangeIsCycle ? 'This cycle' : formatRange(query.from, query.to)
  const categoryName = query.categoryId ? (categoryById.get(query.categoryId)?.name ?? 'One category') : null
  const dayTotals = new Map((page?.dayTotals ?? []).map((d) => [d.date, d.totalPaise]))
  const first = page ? page.page * PAGE_SIZE + 1 : 0
  const last = page ? page.page * PAGE_SIZE + page.items.length : 0

  return (
    <section className="expenses" aria-busy={loading}>
      <div className="page-head">
        <div>
          <h1>Your Expenses</h1>
          <p className="sub" aria-live="polite">
            {rangeIsCycle ? `${formatRange(query.from, cycleEnd ?? query.to)} pay cycle` : rangeLabel}
            {page && (
              <>
                {' • '}
                <span className="num">{formatPaiseShort(page.totalPaise)}</span> spent across {page.totalItems}{' '}
                {page.totalItems === 1 ? 'expense' : 'expenses'}
              </>
            )}
            {loading ? ' • updating…' : ''}
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="outline"
            disabled={downloading || !page || page.totalItems === 0}
            onClick={handleDownload}
          >
            <DownloadIcon size={18} />
            {downloading ? 'Preparing…' : 'Export CSV'}
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-field">
          <SearchIcon size={18} />
          <input
            type="search"
            aria-label="Search expenses"
            placeholder="Search by description"
            maxLength={100}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <div className="filter-row">
          <details className="range-picker" ref={rangeRef}>
            <summary>
              <CalendarIcon size={16} />
              {rangeLabel}
              {categoryName && ` • ${categoryName}`}
            </summary>
            <div className="range-panel">
              <div className="two">
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
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={showingCurrentCycle}
                  onClick={() => {
                    setSearchText('')
                    updateFilter({ ...cycleRange, categoryId: '', type: '', q: '' })
                  }}
                >
                  Reset to this cycle
                </button>
                <button type="button" onClick={() => rangeRef.current?.removeAttribute('open')}>
                  Done
                </button>
              </div>
            </div>
          </details>
          <div className="chips type-chips" role="group" aria-label="Type">
            {TYPE_FILTERS.map((t) => (
              <button
                key={t.label}
                type="button"
                className={`chip ${t.className}`}
                aria-pressed={query.type === t.value}
                onClick={() => updateFilter({ type: t.value })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {page &&
        (page.items.length === 0 ? (
          <div className="card empty">
            <p>No expenses match these filters.</p>
            {showingCurrentCycle && <Link to="/add">Add your first expense for this cycle</Link>}
          </div>
        ) : (
          groupByDate(page.items).map(([date, items]) => (
            <section key={date} className="card day-card" aria-label={dayLabel(date)}>
              <div className="day-head">
                <h2>{dayLabel(date)}</h2>
                {dayTotals.has(date) && (
                  <span className="total">
                    <span className="wide-only-inline">Daily total: </span>
                    {formatPaiseShort(dayTotals.get(date)!)}
                  </span>
                )}
              </div>
              <ul className="tx-list">
                {items.map((expense) => {
                  const category = categoryById.get(expense.categoryId)
                  if (editingId === expense.id) {
                    return (
                      <li key={expense.id} className="editing">
                        <div className="edit-panel">
                          <h3>Edit expense</h3>
                          <ExpenseForm
                            categories={editableCategories(expense)}
                            initial={expense}
                            submitLabel="Save changes"
                            onSubmit={async (changes) => {
                              await updateExpense(expense.id, changes)
                              closeRow()
                              setReloadCount((n) => n + 1)
                              return null
                            }}
                            onCancel={closeRow}
                          />
                        </div>
                      </li>
                    )
                  }
                  return (
                    <li key={expense.id}>
                      <ExpenseRow
                        expense={expense}
                        category={category}
                        showDate={false}
                        onOpen={() => {
                          setEditingId(expense.id)
                          setDeletingId(null)
                        }}
                        openLabel={`Edit ${expense.description}, ${formatPaiseShort(expense.amountPaise)}`}
                        actions={
                          <span className="tx-actions">
                            <button
                              type="button"
                              className="icon-plain edit-action"
                              aria-label={`Edit ${expense.description}`}
                              onClick={() => {
                                setEditingId(expense.id)
                                setDeletingId(null)
                              }}
                            >
                              <PencilIcon size={18} />
                            </button>
                            <button
                              type="button"
                              className="icon-plain"
                              aria-label={`Delete ${expense.description}`}
                              onClick={() => {
                                setDeletingId(expense.id)
                                setEditingId(null)
                              }}
                            >
                              <TrashIcon size={18} />
                            </button>
                          </span>
                        }
                      />
                      {deletingId === expense.id && (
                        <div className="delete-zone" role="group" aria-label="Confirm delete">
                          <span>Delete “{expense.description}” for good?</span>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="danger"
                              disabled={deleting}
                              onClick={() => handleDelete(expense)}
                            >
                              {deleting ? 'Deleting…' : 'Confirm delete'}
                            </button>
                            <button type="button" className="secondary" disabled={deleting} onClick={closeRow}>
                              Keep
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        ))}

      {page && page.totalItems > 0 && (
        <nav className="pager" aria-label="Pages">
          <span className="muted">
            Showing {first}–{last} of {page.totalItems}
          </span>
          {page.totalPages > 1 && (
            <span className="buttons">
              <button
                type="button"
                className="secondary"
                disabled={loading || page.page === 0}
                onClick={() => goToPage(page.page - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="outline"
                disabled={loading || page.page >= page.totalPages - 1}
                onClick={() => goToPage(page.page + 1)}
              >
                Next
              </button>
            </span>
          )}
        </nav>
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
