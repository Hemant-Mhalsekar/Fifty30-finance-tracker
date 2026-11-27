import { useEffect, useId, useState } from 'react'
import {
  createRecurring,
  deleteRecurring,
  listCategories,
  listRecurring,
  updateRecurring,
  type Category,
  type RecurringExpense,
  type RecurringInput,
} from '../api'
import DueRecurring from '../components/DueRecurring'
import RecurringForm from '../components/RecurringForm'
import { formatDate } from '../dates'
import { formatPaise } from '../money'
import { scheduleLabel } from '../recurring'
import PageSkeleton from '../components/PageSkeleton'

function isWide(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(min-width: 900px)').matches === true
}

// Same order the server uses: due first, then by next due date.
function sortItems(items: RecurringExpense[]): RecurringExpense[] {
  return [...items].sort(
    (a, b) =>
      Number(b.due) - Number(a.due) ||
      a.nextDueDate.localeCompare(b.nextDueDate) ||
      a.description.localeCompare(b.description),
  )
}

export default function Recurring() {
  const [items, setItems] = useState<RecurringExpense[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  // Wide screens keep the form open in its own column; phones open it on demand.
  const [wide] = useState(isWide)
  const [adding, setAdding] = useState(wide)
  // Changing it gives the next entry an empty form.
  const [formKey, setFormKey] = useState(0)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([listRecurring(), listCategories(true)])
      .then(([recurring, all]) => {
        if (cancelled) return
        setItems(recurring)
        setCategories(all)
        // Nothing set up yet: open the form straight away.
        if (recurring.length === 0) setAdding(true)
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Something went wrong')
      })
    return () => {
      cancelled = true
    }
  }, [])

  function replace(updated: RecurringExpense) {
    setItems((all) => sortItems(all?.map((r) => (r.id === updated.id ? updated : r)) ?? []))
  }

  if (!items) {
    return (
      <section className="narrow">
        <h1>Recurring expenses</h1>
        {loadError ? (
          <p className="error" role="alert">
            {loadError}
          </p>
        ) : (
          <PageSkeleton variant="list" />
        )}
      </section>
    )
  }

  const active = categories.filter((c) => !c.archived)
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Unknown category'

  async function add(input: RecurringInput) {
    const created = await createRecurring(input)
    setItems((all) => sortItems([...(all ?? []), created]))
    if (!wide) setAdding(false)
    setFormKey((n) => n + 1)
    setToast(
      created.due
        ? `${created.description} added. It is due today, so it is waiting at the top.`
        : `${created.description} added. First due ${formatDate(created.nextDueDate)}.`,
    )
  }

  return (
    <section className="recurring">
      <div className="page-head">
        <div>
          <h1>Recurring expenses</h1>
          <p className="sub">
            Bills that repeat every week, month or year, like rent, SIPs, EMIs, subscriptions and insurance.
          </p>
        </div>
      </div>

      {toast && (
        <p className="toast" role="status">
          {toast}
        </p>
      )}

      {/* Phone: due, form, list in one column. Wide: the form on the left, due and list on the right. */}
      <div className="recurring-layout">
        <div className="area-due">
          <DueRecurring
            items={items}
            onUpdated={(r) => {
              replace(r)
              setToast(null)
            }}
          />
        </div>

        <div className="area-form">
          {adding ? (
            <article className="card">
              <h2>New recurring expense</h2>
              <RecurringForm
                key={formKey}
                categories={active}
                submitLabel="Save recurring expense"
                stickyActions
                onSubmit={add}
                onCancel={items.length > 0 && !wide ? () => setAdding(false) : undefined}
              />
            </article>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAdding(true)
                setToast(null)
              }}
            >
              New recurring expense
            </button>
          )}
        </div>

        <div className="area-list">
          {items.length === 0 && <HowItWorks />}
          {items.length > 0 && (
            <article className="card">
              <h2>All recurring expenses</h2>
              <ul className="category-list">
                {items.map((r) => (
                  <RecurringRow
                    key={r.id}
                    item={r}
                    categories={categories}
                    categoryName={categoryName(r.categoryId)}
                    onChanged={replace}
                    onDeleted={(id) => setItems((all) => all?.filter((x) => x.id !== id) ?? null)}
                  />
                ))}
              </ul>
            </article>
          )}
        </div>
      </div>
    </section>
  )
}

type RowProps = {
  item: RecurringExpense
  categories: Category[]
  categoryName: string
  onChanged: (item: RecurringExpense) => void
  onDeleted: (id: string) => void
}

function RecurringRow({ item, categories, categoryName, onChanged, onDeleted }: RowProps) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelId = useId()

  const current: RecurringInput = {
    categoryId: item.categoryId,
    amountPaise: item.amountPaise,
    description: item.description,
    frequency: item.frequency,
    dayOfMonth: item.dayOfMonth,
    dayOfWeek: item.dayOfWeek,
    monthOfYear: item.monthOfYear,
    ...(item.type ? { type: item.type } : {}),
  }
  // Active categories, plus this one's own category if it was archived since.
  const choices = categories.filter((c) => !c.archived || c.id === item.categoryId)
  const categoryArchived = categories.find((c) => c.id === item.categoryId)?.archived ?? false

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  function close() {
    setOpen(false)
    setConfirmDelete(false)
    setError(null)
  }

  let status: string
  if (item.paused) status = 'Paused'
  else if (item.due) status = `Due ${formatDate(item.nextDueDate)}`
  else status = `Next ${formatDate(item.nextDueDate)}`

  return (
    <li className="category-row">
      <div className="category-summary">
        <div className="recurring-summary">
          <span className="category-name">{item.description}</span>
          <span className="muted">
            <span className="num">{formatPaise(item.amountPaise)}</span> · {categoryName}
            {categoryArchived ? ' (archived)' : ''}
          </span>
          <span className="muted">{scheduleLabel(item, true)}</span>
          <span className={item.due ? 'status due' : 'status muted'}>{status}</span>
        </div>
        <button
          type="button"
          className="ghost"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? 'Close' : 'Edit'} ${item.description}`}
          onClick={() => (open ? close() : setOpen(true))}
        >
          {open ? 'Done' : 'Edit'}
        </button>
      </div>

      {open && (
        <div className="category-panel" id={panelId}>
          <p className="hint">{scheduleLabel(item)}.</p>
          {categoryArchived && (
            <p className="hint">
              Its category is archived. Choose another one, or restore the category, to add it again.
            </p>
          )}
          <RecurringForm
            categories={choices}
            initial={current}
            submitLabel="Save changes"
            onSubmit={async (input) => {
              onChanged(await updateRecurring(item.id, { ...input, paused: item.paused }))
              close()
            }}
          />

          <div className="row-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                run(async () => onChanged(await updateRecurring(item.id, { ...current, paused: !item.paused })))
              }
            >
              {item.paused ? 'Resume' : 'Pause'}
            </button>
            {confirmDelete ? (
              <>
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await deleteRecurring(item.id)
                      onDeleted(item.id)
                    })
                  }
                >
                  Confirm delete
                </button>
                <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" className="danger-outline" disabled={busy} onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )}
          </div>
          <p className="hint">
            {item.paused
              ? 'Resuming skips any payments that came due while it was paused.'
              : 'Pausing stops the reminders until you resume. Deleting keeps the expenses already added.'}
          </p>

          {error && (
            <p className="error row-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  )
}

// Shown until the first one is saved; afterwards the list takes its place.
function HowItWorks() {
  return (
    <article className="card how-it-works">
      <h2>How it works</h2>
      <ol>
        <li>
          <strong>Add each bill once</strong>
          <span className="muted">With its usual amount and when it is due: weekly, monthly or yearly.</span>
        </li>
        <li>
          <strong>On that day, the dashboard asks</strong>
          <span className="muted">It shows the bill with the amount filled in.</span>
        </li>
        <li>
          <strong>Tap Add or Skip</strong>
          <span className="muted">
            Add logs it as an expense (change the amount if the bill changed). Skip leaves that one out. Nothing is
            added without your tap.
          </span>
        </li>
      </ol>
    </article>
  )
}
