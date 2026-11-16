import { useEffect, useState } from 'react'
import { createExpense, listCategories, listExpenses, type Category } from '../api'
import { orderByRecentUse } from '../categoryOrder'
import ExpenseForm from '../components/ExpenseForm'
import { formatPaise } from '../money'

// How many recent expenses decide the chip order. Enough to cover a few days of logging.
const RECENT_SAMPLE = 50

export default function AddExpense() {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // Recent use is only a nicety: if that request fails, fall back to alphabetical order.
    Promise.all([listCategories(), listExpenses({ size: RECENT_SAMPLE }).catch(() => null)])
      .then(([all, recent]) => {
        if (cancelled) return
        setCategories(orderByRecentUse(all, recent?.items.map((e) => e.categoryId) ?? []))
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Something went wrong')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="narrow">
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
        <ExpenseForm
          categories={categories}
          submitLabel="Save expense"
          resetAfterSubmit
          autoFocus
          stickyActions
          onSubmit={async (expense, category) => {
            const saved = await createExpense(expense)
            return `Saved ${formatPaise(saved.amountPaise)} in ${category.name}.`
          }}
        />
      )}
    </section>
  )
}
