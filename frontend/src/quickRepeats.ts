import type { BudgetType, Category, Expense, NewExpense } from './api'

export type QuickRepeat = {
  key: string
  category: Category
  description: string
  amountPaise: number
  // Only for a category without a type (Other).
  type?: BudgetType
  // How often it was logged in the sample; more first.
  count: number
}

// Two of the same is a habit; one is not.
const MIN_REPEATS = 2

/**
 * The expenses logged again and again (same description, category, type and amount), from the
 * newest expenses, most frequent first and then most recent. These become one-tap chips on
 * Add expense. Expenses in archived or unknown categories are left out: they cannot be logged.
 */
export function quickRepeats(recent: Expense[], categories: Category[], limit = 6): QuickRepeat[] {
  const byId = new Map(categories.filter((c) => !c.archived).map((c) => [c.id, c]))
  const found = new Map<string, QuickRepeat & { newest: number }>()
  recent.forEach((e, position) => {
    const category = byId.get(e.categoryId)
    const description = e.description.trim()
    if (!category || !description) return
    const key = [description.toLowerCase(), e.categoryId, e.type, e.amountPaise].join('|')
    const hit = found.get(key)
    if (hit) {
      hit.count += 1
      return
    }
    found.set(key, {
      key,
      category,
      description,
      amountPaise: e.amountPaise,
      type: category.type === null ? e.type : undefined,
      count: 1,
      // The list is newest first, so a smaller position is more recent.
      newest: position,
    })
  })
  return [...found.values()]
    .filter((r) => r.count >= MIN_REPEATS)
    .sort((a, b) => b.count - a.count || a.newest - b.newest)
    .slice(0, limit)
    .map(({ newest: _newest, ...r }) => r)
}

/** The expense a chip logs: today, otherwise exactly as before. */
export function repeatExpense(r: QuickRepeat, today: string): NewExpense {
  return {
    amountPaise: r.amountPaise,
    categoryId: r.category.id,
    description: r.description,
    expenseDate: today,
    ...(r.type ? { type: r.type } : {}),
  }
}
