import type { BudgetType } from './api'

export const TYPE_LABELS: Record<BudgetType, string> = {
  NEED: 'Need',
  WANT: 'Want',
  INVESTMENT: 'Investment',
}

/** CSS colour per type. Investments are part of savings, so they share its colour. */
export const TYPE_COLORS: Record<BudgetType, string> = {
  NEED: 'var(--need)',
  WANT: 'var(--want)',
  INVESTMENT: 'var(--save)',
}
